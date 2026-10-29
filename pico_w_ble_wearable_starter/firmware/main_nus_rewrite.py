from machine import Pin, I2C
import time
import bluetooth
import ujson
from micropython import const

# =========================================================
# Pico W: Three-Sensor Monitor + BLE Nordic UART Service
#
# BLE name: PicoHealth
# Temperature: LM75-style sensor (provisional conversion)
# Optical: MAX30102 at 0x57
# IMU: address 0x68 (provisional MPU-compatible driver)
#
# Optical values are raw RED/IR counts, not validated SpO2
# or heart-rate measurements.
# =========================================================

# ---------------- I2C configuration ----------------

I2C_SDA = 4
I2C_SCL = 5
I2C_FREQ = 100_000

TEMP_ADDRESSES = (0x48, 0x4C, 0x4A)
MAX30102_ADDR = 0x57
IMU_ADDR = 0x68

RETRY_MS = 3000
OPTICAL_WINDOW_MS = 1000

i2c = I2C(
    0,
    sda=Pin(I2C_SDA),
    scl=Pin(I2C_SCL),
    freq=I2C_FREQ
)

# ---------------- BLE / Nordic UART Service ----------------

DEVICE_NAME = "PicoHealth-DEV"
ADV_INTERVAL_US = 250_000
BLE_CHUNK_SIZE = 20

_IRQ_CENTRAL_CONNECT = const(1)
_IRQ_CENTRAL_DISCONNECT = const(2)
_IRQ_GATTS_WRITE = const(3)

_FLAG_READ = const(0x0002)
_FLAG_WRITE = const(0x0008)
_FLAG_WRITE_NO_RESPONSE = const(0x0004)
_FLAG_NOTIFY = const(0x0010)

# Standard Nordic UART Service UUIDs
UART_SERVICE_UUID = bluetooth.UUID(
    "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
)
UART_RX_UUID = bluetooth.UUID(
    "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
)
UART_TX_UUID = bluetooth.UUID(
    "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"
)

UART_TX = (
    UART_TX_UUID,
    _FLAG_READ | _FLAG_NOTIFY,
)
UART_RX = (
    UART_RX_UUID,
    _FLAG_WRITE | _FLAG_WRITE_NO_RESPONSE,
)
UART_SERVICE = (
    UART_SERVICE_UUID,
    (UART_TX, UART_RX),
)

ble = bluetooth.BLE()
ble.active(True)

connections = set()
ble_tx_handle = None
ble_rx_handle = None
advertising_needed = True


def advertising_payload(name):
    name_bytes = name.encode()
    # Flags: general discoverable, BR/EDR not supported.
    payload = bytearray((2, 0x01, 0x06))
    # Complete local name.
    payload += bytes((len(name_bytes) + 1, 0x09))
    payload += name_bytes
    return bytes(payload)


ADV_PAYLOAD = advertising_payload(DEVICE_NAME)


def start_advertising():
    global advertising_needed
    try:
        # MicroPython signature: gap_advertise(interval_us, adv_data=None, ...)
        ble.gap_advertise(ADV_INTERVAL_US, ADV_PAYLOAD)
        advertising_needed = False
        print("BLE advertising as", DEVICE_NAME)
    except Exception as error:
        advertising_needed = True
        print("BLE advertising error:", repr(error))


def ble_irq(event, data):
    global advertising_needed

    if event == _IRQ_CENTRAL_CONNECT:
        conn_handle, addr_type, addr = data
        connections.add(conn_handle)
        print("BLE phone connected. Handle:", conn_handle)

    elif event == _IRQ_CENTRAL_DISCONNECT:
        conn_handle, addr_type, addr = data

        if conn_handle in connections:
            connections.remove(conn_handle)

        # Restart advertising in the main loop, not in this callback.
        advertising_needed = True
        print("BLE phone disconnected.")

    elif event == _IRQ_GATTS_WRITE:
        conn_handle, value_handle = data

        if value_handle == ble_rx_handle:
            try:
                command = ble.gatts_read(ble_rx_handle)
                print("BLE command:", command)
            except Exception as error:
                print("BLE command read error:", repr(error))


ble.irq(ble_irq)

# Register NUS characteristics in TX-then-RX order.
((ble_tx_handle, ble_rx_handle),) = ble.gatts_register_services(
    (UART_SERVICE,)
)

# Optional RX buffer for future commands from the phone.
try:
    ble.gatts_set_buffer(ble_rx_handle, 100, append=False)
except (AttributeError, TypeError):
    # Not all MicroPython builds expose this optional method.
    pass


def send_ble_json(record):
    """Send newline-terminated JSON in default-MTU-sized chunks."""
    if not connections:
        return

    message = (ujson.dumps(record) + "\n").encode()

    for conn_handle in tuple(connections):
        try:
            for offset in range(0, len(message), BLE_CHUNK_SIZE):
                chunk = message[offset:offset + BLE_CHUNK_SIZE]
                ble.gatts_notify(conn_handle, ble_tx_handle, chunk)
                time.sleep_ms(10)
        except Exception as error:
            print("BLE notification error:", repr(error))


# =========================================================
# SENSOR STATE
# =========================================================

temp_addr = None
temp_ready = False
imu_ready = False
optical_ready = False

last_temp_retry = time.ticks_ms()
last_imu_retry = time.ticks_ms()
last_optical_retry = time.ticks_ms()


# =========================================================
# I2C HELPERS
# =========================================================

def write_reg(addr, reg, value):
    i2c.writeto_mem(addr, reg, bytes([value]))


def read_reg(addr, reg, length=1):
    return i2c.readfrom_mem(addr, reg, length)


def read_u8(addr, reg):
    return read_reg(addr, reg, 1)[0]


def read_s16(data, index=0):
    value = (data[index] << 8) | data[index + 1]
    if value & 0x8000:
        value -= 65536
    return value


def scan_devices():
    try:
        return i2c.scan()
    except OSError as error:
        print("I2C scan error:", repr(error))
        return []


# =========================================================
# TEMPERATURE SENSOR
# =========================================================

def find_temperature_sensor():
    devices = scan_devices()
    for address in TEMP_ADDRESSES:
        if address in devices:
            return address
    return None


def read_temperature(addr):
    # Provisional LM75A conversion; confirm exact chip model.
    data = read_reg(addr, 0x00, 2)
    raw = (data[0] << 8) | data[1]
    raw >>= 5

    if raw & 0x400:
        raw -= 0x800

    return raw * 0.125


def initialize_temperature():
    global temp_addr, temp_ready

    temp_ready = False
    temp_addr = find_temperature_sensor()

    if temp_addr is None:
        print("Temperature sensor unavailable.")
        return False

    try:
        value = read_temperature(temp_addr)
        temp_ready = True
        print(
            "Temperature detected at", hex(temp_addr),
            "| provisional:", value, "C"
        )
        return True
    except Exception as error:
        print("Temperature initialization error:", repr(error))
        temp_addr = None
        return False


# =========================================================
# MAX30102 OPTICAL SENSOR
# =========================================================

def setup_max30102():
    part_id = read_u8(MAX30102_ADDR, 0xFF)
    if part_id != 0x15:
        raise RuntimeError(
            "Unexpected MAX30102 Part ID: " + hex(part_id)
        )

    # Reset sensor.
    write_reg(MAX30102_ADDR, 0x09, 0x40)
    time.sleep_ms(200)

    # Clear FIFO pointers and overflow counter.
    write_reg(MAX30102_ADDR, 0x04, 0x00)
    write_reg(MAX30102_ADDR, 0x05, 0x00)
    write_reg(MAX30102_ADDR, 0x06, 0x00)

    # Preserve configuration proven to work in standalone test.
    write_reg(MAX30102_ADDR, 0x08, 0x4F)
    write_reg(MAX30102_ADDR, 0x0A, 0x27)
    write_reg(MAX30102_ADDR, 0x0C, 0x24)
    write_reg(MAX30102_ADDR, 0x0D, 0x24)
    write_reg(MAX30102_ADDR, 0x09, 0x03)

    time.sleep_ms(100)

    print(
        "MAX30102 configured. FIFO:",
        hex(read_u8(MAX30102_ADDR, 0x08)),
        "Mode:", hex(read_u8(MAX30102_ADDR, 0x09))
    )


def read_optical_sample():
    data = read_reg(MAX30102_ADDR, 0x07, 6)

    red = (
        (data[0] << 16) |
        (data[1] << 8) |
        data[2]
    ) & 0x3FFFF

    ir = (
        (data[3] << 16) |
        (data[4] << 8) |
        data[5]
    ) & 0x3FFFF

    return red, ir


def collect_optical_window(duration_ms=1000):
    red_total = 0
    ir_total = 0
    samples = 0
    start = time.ticks_ms()

    while time.ticks_diff(time.ticks_ms(), start) < duration_ms:
        write_ptr = read_u8(MAX30102_ADDR, 0x04) & 0x1F
        read_ptr = read_u8(MAX30102_ADDR, 0x06) & 0x1F
        available = (write_ptr - read_ptr) & 0x1F

        while available > 0:
            red, ir = read_optical_sample()
            red_total += red
            ir_total += ir
            samples += 1

            # Refresh actual pointers after each sample.
            write_ptr = read_u8(MAX30102_ADDR, 0x04) & 0x1F
            read_ptr = read_u8(MAX30102_ADDR, 0x06) & 0x1F
            available = (write_ptr - read_ptr) & 0x1F

        time.sleep_ms(5)

    if samples == 0:
        return None, None, 0

    return red_total // samples, ir_total // samples, samples


def initialize_optical():
    global optical_ready

    optical_ready = False
    try:
        if MAX30102_ADDR not in scan_devices():
            print("MAX30102 not detected.")
            return False

        setup_max30102()
        optical_ready = True
        print("MAX30102 initialized.")
        return True

    except Exception as error:
        print("MAX30102 initialization failed:", repr(error))
        return False


# =========================================================
# IMU
# =========================================================

def setup_imu():
    # Provisional MPU-compatible register map.
    identity = read_u8(IMU_ADDR, 0x75)

    if identity not in (0x68, 0x70):
        raise RuntimeError(
            "Unexpected IMU identity: " + hex(identity)
        )

    write_reg(IMU_ADDR, 0x6B, 0x00)
    time.sleep_ms(100)
    return identity


def read_imu():
    data = read_reg(IMU_ADDR, 0x3B, 14)

    ax_raw = read_s16(data, 0)
    ay_raw = read_s16(data, 2)
    az_raw = read_s16(data, 4)
    temp_raw = read_s16(data, 6)
    gx_raw = read_s16(data, 8)
    gy_raw = read_s16(data, 10)
    gz_raw = read_s16(data, 12)

    # Provisional MPU-6050 scaling.
    ax = ax_raw / 16384.0
    ay = ay_raw / 16384.0
    az = az_raw / 16384.0

    gx = gx_raw / 131.0
    gy = gy_raw / 131.0
    gz = gz_raw / 131.0

    imu_temp = (temp_raw / 340.0) + 36.53

    return ax, ay, az, gx, gy, gz, imu_temp


def initialize_imu():
    global imu_ready

    imu_ready = False
    try:
        if IMU_ADDR not in scan_devices():
            print("IMU not detected.")
            return False

        identity = setup_imu()
        imu_ready = True
        print("IMU responded; WHO_AM_I =", hex(identity))
        print("IMU measurements remain provisional.")
        return True

    except Exception as error:
        print("IMU initialization failed:", repr(error))
        return False


# =========================================================
# STARTUP
# =========================================================

print("\n================================")
print("Pico W Sensor Monitor + BLE")
print("================================")
print("I2C pins: SDA=GP4, SCL=GP5")
print("I2C scan:", [hex(a) for a in scan_devices()])
print("BLE name:", DEVICE_NAME)
print("NUS service: 6E400001-B5A3-F393-E0A9-E50E24DCCA9E")
print("NUS TX:      6E400003-B5A3-F393-E0A9-E50E24DCCA9E")
print("NUS RX:      6E400002-B5A3-F393-E0A9-E50E24DCCA9E")

initialize_temperature()
initialize_optical()
initialize_imu()


# =========================================================
# MAIN LOOP
# =========================================================

while True:
    now = time.ticks_ms()

    # Restart advertising from the main loop after disconnect.
    if advertising_needed and not connections:
        start_advertising()

    temperature_value = None
    red_value = None
    ir_value = None
    optical_count = 0
    imu_values = None

    # ---------------- Temperature ----------------

    if not temp_ready:
        if time.ticks_diff(now, last_temp_retry) >= RETRY_MS:
            last_temp_retry = now
            initialize_temperature()

    if temp_ready and temp_addr is not None:
        try:
            temperature_value = read_temperature(temp_addr)
        except Exception as error:
            print("Temperature read error:", repr(error))
            temp_ready = False
            temp_addr = None
            last_temp_retry = time.ticks_ms()

    # ---------------- Optical sensor ----------------

    if not optical_ready:
        if time.ticks_diff(now, last_optical_retry) >= RETRY_MS:
            last_optical_retry = now
            initialize_optical()

    if optical_ready:
        try:
            red_value, ir_value, optical_count = (
                collect_optical_window(OPTICAL_WINDOW_MS)
            )

            if optical_count == 0:
                red_value = None
                ir_value = None

        except Exception as error:
            print("MAX30102 read error:", repr(error))
            optical_ready = False
            last_optical_retry = time.ticks_ms()

    # ---------------- IMU ----------------

    if not imu_ready:
        if time.ticks_diff(now, last_imu_retry) >= RETRY_MS:
            last_imu_retry = now
            initialize_imu()

    if imu_ready:
        try:
            imu_values = read_imu()
        except Exception as error:
            print("IMU read error:", repr(error))
            imu_ready = False
            last_imu_retry = time.ticks_ms()

    # ---------------- JSON record ----------------

    record = {
        "temp_c": temperature_value,
        "red": red_value,
        "ir": ir_value,
        "samples": optical_count,
        "ax_g": None,
        "ay_g": None,
        "az_g": None,
        "gx_dps": None,
        "gy_dps": None,
        "gz_dps": None,
        "imu_temp_c": None
    }

    if imu_values is not None:
        (
            record["ax_g"],
            record["ay_g"],
            record["az_g"],
            record["gx_dps"],
            record["gy_dps"],
            record["gz_dps"],
            record["imu_temp_c"]
        ) = imu_values

    # ---------------- BLE streaming ----------------

    if connections:
        send_ble_json(record)

    # ---------------- Serial monitor ----------------

    print(
        "Temp:", temperature_value,
        "| RED:", red_value,
        "| IR:", ir_value,
        "| Samples:", optical_count,
        "| IMU:", imu_values,
        "| BLE clients:", len(connections)
    )

    time.sleep_ms(100)
