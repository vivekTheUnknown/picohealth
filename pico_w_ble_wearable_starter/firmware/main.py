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
FRAGMENT_GAP_MS = 5          # faster, but still avoids back-to-back drops

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


def next_sequence():
    global frame_sequence
    frame_sequence = (frame_sequence + 1) & 0xFFFF
    return frame_sequence


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


def send_payload(payload):
    """Frame and send one payload: uint16 sequence, uint8 index, uint8 count."""
    if not connections:
        return

    chunks = [
        payload[offset:offset + BLE_CHUNK_SIZE]
        for offset in range(0, len(payload), BLE_CHUNK_SIZE)
    ]
    count = len(chunks)
    sequence = next_sequence()

    for conn_handle in tuple(connections):
        for index, chunk in enumerate(chunks):
            packet = struct.pack(">HBB", sequence, index, count) + chunk
            sent = False
            for _attempt in range(3):
                try:
                    ble.gatts_notify(conn_handle, ble_data_handle, packet)
                    sent = True
                    break
                except Exception as error:
                    print("BLE notification error:", repr(error))
                    time.sleep_ms(20)
            if not sent:
                print("BLE fragment dropped:", sequence, index)
                break
            time.sleep_ms(FRAGMENT_GAP_MS)


def send_json(message):
    """Type 0x01: UTF-8 JSON control message."""
    send_payload(b"\x01" + ujson.dumps(message).encode())


def send_optical_batch(samples, first_ms, rate_hz):
    """Type 0x02: raw paired optical samples.

    Layout after the 1-byte type:
      uint16 sample_count, uint32 first_sample_ms, uint16 rate_hz,
      then sample_count x (uint32 red, uint32 ir), big-endian.
    Binary is used here because a 1-second JSON batch of 25-100 pairs would
    exceed the notification budget on a default-MTU link.
    """
    payload = bytearray()
    payload.append(2)
    payload += struct.pack(">HIH", len(samples), first_ms & 0xFFFFFFFF, rate_hz)
    for red, ir in samples:
        payload += struct.pack(">II", red & 0xFFFFFFFF, ir & 0xFFFFFFFF)
    send_payload(bytes(payload))


# =========================================================
# SENSOR STATE
# =========================================================

temp_addr = None
temp_ready = False
imu_ready = False

# LM75A has no ID register; identity is inferred from its address (0x48-0x4F)
# and from the 11-bit / 0.125 C conversion producing plausible readings.
TEMP_DRIVER_VALID = True

# WHO_AM_I decides this, not the board silkscreen: 0x68 = MPU-6050,
# 0x70 = MPU-6500/6500-class. Both share the same register map and the same
# +-2 g / +-250 dps default scaling used below.
IMU_IDENTITIES = {0x68: "mpu6050", 0x70: "mpu6500"}
IMU_DRIVER_VALID = False
IMU_IDENTITY = None
IMU_WHO_AM_I = None
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


def read_temperature_raw(addr):
    """Raw 16-bit LM75A temperature register. Decoding happens in the app."""
    data = read_reg(addr, 0x00, 2)
    return ((data[0] << 8) | data[1]) & 0xFFFF


def initialize_temperature():
    global temp_addr, temp_ready

    temp_ready = False
    temp_addr = find_temperature_sensor()

    if temp_addr is None:
        print("Temperature sensor unavailable.")
        return False

    try:
        value = read_temperature_raw(temp_addr)
        temp_ready = True
        print(
            "Temperature detected at", hex(temp_addr),
            "| raw register:", value
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


def drain_optical_fifo():
    """Read every available paired sample, preserving order. No averaging."""
    pairs = []
    while len(pairs) < 64:
        write_ptr = read_u8(MAX30102_ADDR, 0x04) & 0x1F
        read_ptr = read_u8(MAX30102_ADDR, 0x06) & 0x1F
        available = (write_ptr - read_ptr) & 0x1F
        if available == 0:
            break
        for _ in range(available):
            red, ir = read_optical_sample()
            pairs.append((red, ir))
    return pairs


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


def read_imu_raw():
    """Raw signed 16-bit axes. Scaling happens in the app."""
    data = read_reg(IMU_ADDR, 0x3B, 14)
    return (
        read_s16(data, 0), read_s16(data, 2), read_s16(data, 4),
        read_s16(data, 8), read_s16(data, 10), read_s16(data, 12),
    )


def initialize_imu():
    global imu_ready, IMU_IDENTITY, IMU_DRIVER_VALID, IMU_WHO_AM_I

    imu_ready = False
    try:
        if IMU_ADDR not in scan_devices():
            print("IMU not detected.")
            return False

        identity = setup_imu()
        IMU_WHO_AM_I = identity
        IMU_IDENTITY = IMU_IDENTITIES.get(identity)
        IMU_DRIVER_VALID = IMU_IDENTITY is not None
        imu_ready = True
        print("IMU responded; WHO_AM_I =", hex(identity), "driver:", IMU_IDENTITY)
        if IMU_DRIVER_VALID:
            print("IMU driver enabled with the observed chip identity.")
        else:
            print("IMU identity not recognised; values withheld.")
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

optical_pairs = []
batch_started_ms = None
last_temperature_at = 0
last_imu_at = 0
last_status_at = 0

while True:
    now = time.ticks_ms()

    if advertising_needed and not connections:
        start_advertising()

    # ---------------- Optical: drain FIFO, flush one batch per second -------
    if not optical_ready:
        if time.ticks_diff(now, last_optical_retry) >= RETRY_MS:
            last_optical_retry = now
            initialize_optical()

    if optical_ready:
        try:
            pairs = drain_optical_fifo()
            if pairs:
                if batch_started_ms is None:
                    batch_started_ms = now
                optical_pairs.extend(pairs)
        except Exception as error:
            print("MAX30102 read error:", repr(error))
            optical_ready = False
            last_optical_retry = time.ticks_ms()
            optical_pairs = []
            batch_started_ms = None

    if optical_pairs and batch_started_ms is not None:
        elapsed = time.ticks_diff(now, batch_started_ms)
        if elapsed >= 1000:
            rate_hz = max(1, int(round(len(optical_pairs) * 1000 / elapsed)))
            send_optical_batch(optical_pairs, batch_started_ms, rate_hz)
            optical_pairs = []
            batch_started_ms = None

    # ---------------- Temperature: raw register, 1 Hz -----------------------
    if not temp_ready:
        if time.ticks_diff(now, last_temp_retry) >= RETRY_MS:
            last_temp_retry = now
            initialize_temperature()

    if temp_ready and temp_addr is not None and time.ticks_diff(now, last_temperature_at) >= 1000:
        last_temperature_at = now
        try:
            send_json({
                "v": 3,
                "type": "temperature_raw",
                "seq": next_sequence(),
                "ms": now,
                "raw": read_temperature_raw(temp_addr),
            })
        except Exception as error:
            print("Temperature read error:", repr(error))
            temp_ready = False
            temp_addr = None
            last_temp_retry = time.ticks_ms()
            send_json({
                "v": 3, "type": "sensor_error", "sensor": "temperature",
                "ms": now, "message": repr(error),
            })

    # ---------------- IMU: raw axes, 20 Hz ----------------------------------
    if not imu_ready:
        if time.ticks_diff(now, last_imu_retry) >= RETRY_MS:
            last_imu_retry = now
            initialize_imu()

    if imu_ready and time.ticks_diff(now, last_imu_at) >= 50:
        last_imu_at = now
        try:
            ax, ay, az, gx, gy, gz = read_imu_raw()
            send_json({
                "v": 3, "type": "imu_raw", "seq": next_sequence(), "ms": now,
                "ax": ax, "ay": ay, "az": az,
                "gx": gx, "gy": gy, "gz": gz,
            })
        except Exception as error:
            print("IMU read error:", repr(error))
            imu_ready = False
            last_imu_retry = time.ticks_ms()
            send_json({
                "v": 3, "type": "sensor_error", "sensor": "imu",
                "ms": now, "message": repr(error),
            })

    # ---------------- Status: identities for app-side gating ----------------
    if time.ticks_diff(now, last_status_at) >= 10000:
        last_status_at = now
        send_json({
            "v": 3,
            "type": "status",
            "seq": next_sequence(),
            "ms": now,
            "who_am_i": IMU_WHO_AM_I,
            "temp_addr": temp_addr,
            "imu_identity": IMU_IDENTITY,
            "optical_ready": optical_ready,
            "temperature_ready": temp_ready,
            "imu_ready": imu_ready,
        })

    time.sleep_ms(10)
