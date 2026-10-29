from machine import Pin, I2C
import time
import bluetooth
import struct
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

# ---------------- BLE / PicoHealth GATT service ----------------
#
# The phone subscribes to DATA_UUID on SERVICE_UUID and filters scans by that
# service, so the 128-bit UUID must be in the advertising data. Flags + UUID is
# 20 bytes, leaving no room for a 14-character name in the same 31-byte legacy
# payload, so the name goes in the scan response.

DEVICE_NAME = "PicoHealth-DEV"
ADV_INTERVAL_US = 250_000
# A notification value can carry MTU-3 = 20 bytes at the default MTU of 23.
# The 4-byte reassembly header is part of that budget, so the payload chunk is
# 16 bytes, not 20. Using 20 truncates every fragment on Android.
BLE_CHUNK_SIZE = 16
FRAGMENT_GAP_MS = 25         # controller drops back-to-back notifications

_IRQ_CENTRAL_CONNECT = const(1)
_IRQ_CENTRAL_DISCONNECT = const(2)
_IRQ_GATTS_WRITE = const(3)

_FLAG_READ = const(0x0002)
_FLAG_WRITE = const(0x0008)
_FLAG_WRITE_NO_RESPONSE = const(0x0004)
_FLAG_NOTIFY = const(0x0010)

SERVICE_UUID_TEXT = "8f2a0001-6b6d-4f9e-9f6d-6c2b2d0a0001"
DATA_UUID_TEXT = "8f2a0002-6b6d-4f9e-9f6d-6c2b2d0a0001"
SERVICE_UUID = bluetooth.UUID(SERVICE_UUID_TEXT)
DATA_UUID = bluetooth.UUID(DATA_UUID_TEXT)

DATA_CHARACTERISTIC = (DATA_UUID, _FLAG_READ | _FLAG_NOTIFY)
MEASUREMENT_SERVICE = (SERVICE_UUID, (DATA_CHARACTERISTIC,))

ble = bluetooth.BLE()
ble.active(True)

connections = set()
ble_data_handle = None
advertising_needed = True
frame_sequence = 0


def uuid_le(text):
    """16-byte little-endian form used by BLE advertising data.

    MicroPython 1.29's bluetooth.UUID has no `.bytes` attribute, so the
    canonical text form is converted explicitly.
    """
    raw = bytes.fromhex(text.replace("-", ""))
    return bytes(reversed(raw))


def advertising_payloads(name, service_uuid_text):
    adv = bytearray((2, 0x01, 0x06))                 # LE general discoverable
    adv += bytes((17, 0x07)) + uuid_le(service_uuid_text)  # 128-bit service list
    name_bytes = name.encode()
    response = bytes((len(name_bytes) + 1, 0x09)) + name_bytes
    return bytes(adv), response


ADV_DATA, SCAN_RESPONSE = advertising_payloads(DEVICE_NAME, SERVICE_UUID_TEXT)


def start_advertising():
    global advertising_needed
    try:
        try:
            ble.gap_advertise(ADV_INTERVAL_US, ADV_DATA, resp_data=SCAN_RESPONSE)
        except TypeError:
            # Older builds take the scan response positionally.
            ble.gap_advertise(ADV_INTERVAL_US, ADV_DATA, SCAN_RESPONSE)
        advertising_needed = False
        print("BLE advertising as", DEVICE_NAME, "with PicoHealth service")
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
        advertising_needed = True
        print("BLE phone disconnected.")

    elif event == _IRQ_GATTS_WRITE:
        # The characteristic is read/notify only; commands are not implemented.
        pass


ble.irq(ble_irq)
((ble_data_handle,),) = ble.gatts_register_services((MEASUREMENT_SERVICE,))


def send_ble_json(record, sequence):
    """Send one JSON record, framed so the phone can reassemble it.

    The 4-byte header is the documented transport: uint16 sequence,
    uint8 fragment index, uint8 fragment count. A single JSON record is larger
    than one notification at the default MTU, so it is always split.
    """
    if not connections:
        return

    message = ujson.dumps(record).encode()
    chunks = [
        message[offset:offset + BLE_CHUNK_SIZE]
        for offset in range(0, len(message), BLE_CHUNK_SIZE)
    ]
    count = len(chunks)

    for conn_handle in tuple(connections):
        for index, chunk in enumerate(chunks):
            packet = struct.pack(">HBB", sequence & 0xFFFF, index, count) + chunk
            sent = False
            for _attempt in range(3):
                try:
                    ble.gatts_notify(conn_handle, ble_data_handle, packet)
                    sent = True
                    break
                except Exception as error:
                    print("BLE notification error:", repr(error))
                    time.sleep_ms(30)
            if not sent:
                print("BLE fragment dropped:", sequence, index)
                break
            time.sleep_ms(FRAGMENT_GAP_MS)


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
print("Service:", SERVICE_UUID)
print("Data characteristic:", DATA_UUID)

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
    #
    # Status is explicit per sensor. Temperature and IMU drivers are still
    # provisional, so they are reported as "unvalidated" with no value rather
    # than sending a number the phone would present as a measurement.

    frame_sequence = (frame_sequence + 1) & 0xFFFF

    if not optical_ready:
        optical_status = "unavailable"
    elif red_value is None or ir_value is None:
        optical_status = "error"
    else:
        optical_status = "ok"

    record = {
        "v": 2,
        "seq": frame_sequence,
        "up": time.ticks_ms() & 0x7FFFFFFF,
        "o": {
            "s": optical_status,
            "r": red_value,
            "i": ir_value,
            "n": optical_count,
        },
        "t": {"s": "unvalidated" if temp_ready else "unavailable"},
        "i": {"s": "unvalidated" if imu_ready else "unavailable"},
    }

    # ---------------- BLE streaming ----------------

    if connections:
        send_ble_json(record, frame_sequence)

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
