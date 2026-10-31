# PicoHealth BLE protocol v1

**Status:** implemented by `firmware/main.py` and the mobile app.

**Current firmware: protocol v3 (raw acquisition).** The Pico reads the three
sensors and sends **raw values only**: temperature register, IMU axes, and
batches of paired MAX30102 samples. Every conversion, unit scaling, pulse
detection and SpO2 estimate happens in the app.

The GATT contract and the fragmentation header did not change. v1 (binary
frame) and v2 (JSON with converted values) remain supported by the app for
older firmware.

> The app-side processing specification names Nordic UART as the transport.
> This build keeps the PicoHealth GATT service, because the service UUID has no
> bearing on where processing happens and the PicoHealth contract is already
> verified on the phone. NUS could be substituted without changing any payload
> or processing code.

## GATT

| Item | Value |
|---|---|
| Device name | `PicoHealth-DEV` |
| Service UUID | `8f2a0001-6b6d-4f9e-9f6d-6c2b2d0a0001` |
| Data characteristic | `8f2a0002-6b6d-4f9e-9f6d-6c2b2d0a0001` |
| Properties | `read`, `notify` |

The firmware advertises the service UUID. The phone scans with that filter and
also matches the advertised name.

## Notification framing

Every sensor notification is:

| Offset | Size | Type | Meaning |
|---|---|---|---|
| 0 | 2 | uint16 BE | Message sequence (wraps at 65535) |
| 2 | 1 | uint8 | Fragment index (0-based) |
| 3 | 1 | uint8 | Fragment count |
| 4 | 0–20 | bytes | Payload fragment (default-MTU maximum) |

The current firmware chunks messages in **20-byte** pieces (the largest
payload that fits the default ATT MTU of 23). A 28-byte binary frame arrives as
two notifications (20 + 8); a JSON record of ~135 bytes arrives as seven. One
notification is *not* one message.

`TEST:0001`-style ASCII notifications are also accepted. They carry no header
and are **transport proof only** — the app displays them in the device card and
never stores or plots them as measurements.

## Protocol v3 — raw acquisition (current)

Every reassembled payload starts with a one-byte type:

| Type | Payload |
|---|---|
| `0x01` | UTF-8 JSON control/measurement message |
| `0x02` | Binary optical batch (paired samples) |

JSON is used for small messages. The optical batch is binary because a
one-second JSON array of paired samples is several times larger and would blow
the notification budget on a default-MTU link.

### `temperature_raw` (1 Hz)

```json
{"v":3,"type":"temperature_raw","seq":42,"ms":123456,"raw":8192}
```

`raw` is the **raw 16-bit LM75A register**. No conversion happens on the Pico.

### `imu_raw` (20 Hz)

```json
{"v":3,"type":"imu_raw","seq":43,"ms":123506,
 "ax":-208,"ay":480,"az":-15864,"gx":59,"gy":88,"gz":-26}
```

Signed 16-bit axes, exactly as read from `0x3B..0x48`. No scaling on the Pico.

### `status` (every 10 s)

```json
{"v":3,"type":"status","seq":44,"ms":130000,
 "who_am_i":112,"temp_addr":72,"imu_identity":"mpu6500",
 "optical_ready":true,"temperature_ready":true,"imu_ready":true}
```

The app uses `who_am_i` to select scale factors. `0x70` is MPU-6500 class, not
MPU-6050; unknown identities leave IMU values unvalidated.

### `sensor_error`

```json
{"v":3,"type":"sensor_error","sensor":"max30102","ms":123456,"message":"..."}
```

### `0x02` — optical batch

| Offset | Size | Type | Meaning |
|---|---|---|---|
| 0 | 1 | uint8 | `0x02` |
| 1 | 2 | uint16 BE | Sample count |
| 3 | 4 | uint32 BE | First sample device time, ms |
| 7 | 2 | uint16 BE | Measured sample rate, Hz |
| 9 | 8 × count | pairs | `uint32 red`, `uint32 ir` |

Samples are paired and in acquisition order. The firmware drains the MAX30102
FIFO continuously and flushes roughly once per second; the measured rate is
included because the configured 100 Hz / 4-sample average yields ~25–30 Hz in
practice (29–30 Hz observed on this build).

## App-side processing (protocol v3)

| Stage | Module | Responsibility |
|---|---|---|
| Transport | `ble/assembler.ts` | Reassemble fragments; reject incomplete/duplicate/oversized messages |
| Parse | `sensors/rawProtocol.ts` | Split by type, validate with zod, decode the binary batch |
| Temperature | `sensors/temperature.ts` | LM75A: bits 15..5, two's complement, 0.125 °C/LSB, −55…125 °C |
| IMU | `sensors/imu.ts` | Identity gate (0x68/0x70), 16384 LSB/g, 131 LSB/(°/s), gyro bias |
| Optical | `sensors/max30102/processor.ts` | Timestamped buffer, resample to 25 Hz, 4 s window, contact/clipping |
| Algorithm | `sensors/max30102/algorithm.ts` | Full Maxim/SparkFun port: DC removal, 4-pt MA, valleys, AC/DC ratio, median, 184-entry table |
| Orchestration | `sensors/rawProcessor.ts` | Latest state + snapshot emission for UI/storage |

Quality states: `collecting`, `no_contact`, `poor_signal`, `valid`,
`sensor_error`. Heart rate and SpO2 have separate validity flags. Contact and
clipping gate both, so a plausible-looking ratio with no finger is not shown.

The algorithm assumes 25 Hz / 100 samples; the measured 25–30 Hz stream is
linearly resampled so the reference timing assumptions hold.

**Observed on the bench:** with a finger near (but not properly coupled to) the
sensor, DC is ~77 k counts but AC is only ~30 counts with no coherent tone, so
the app correctly reports `poor_signal` and withholds HR/SpO2. Proper skin
contact is required for a pulsatile signal.

## Legacy protocol v2 — JSON measurement record

The measurement characteristic carries one JSON object per message. It is
larger than a single notification, so it uses the same fragmentation header
described above (20-byte payload chunks in the current firmware).

```json
{
  "v": 2,
  "seq": 8,
  "up": 11566,
  "o": { "s": "ok", "r": 1511, "i": 1433, "n": 37 },
  "t": { "s": "ok", "c": 31.5 },
  "i": {
    "s": "ok",
    "a": [-0.661, -0.014, -0.716],
    "g": [0.344, 0.893, -0.359],
    "chip": "mpu6500"
  }
}
```

| Field | Type | Meaning |
|---|---|---|
| `v` | int | Protocol version. Must be `2`. |
| `seq` | uint16 | Message sequence, wraps at 65535. |
| `up` | uint32 | Device uptime in ms. **Not** wall-clock time. |
| `o.s` | string | Optical status: `ok`, `unavailable`, `error`, `unvalidated`. |
| `o.r`, `o.i` | int/null | Raw red / IR counts. 18-bit values in the firmware. |
| `o.n` | uint8 | Samples averaged into this record. |
| `t.s` | string | Temperature status. |
| `t.c` | float/null | Temperature in °C, only when status is `ok`. |
| `i.s` | string | IMU status. |
| `i.a`, `i.g` | [x,y,z]/null | Acceleration in g, gyro in °/s, only when `ok`. |

Rules enforced by the app:

- A sensor with status `ok` but no values is **downgraded to `error`**, so a
  malformed record cannot masquerade as a measurement.
- `unvalidated` never displays a value. The firmware only reports `ok` after
  identifying the chip and applying a documented conversion.
- Unknown status strings, a different `v`, or malformed JSON cause the message
  to be discarded and counted, not guessed at.
- Missing fields stay missing. `null` never becomes `0`.

A record is ~135 bytes without IMU axes and ~207 bytes with them → **13
fragments**. The app allows up to 32 fragments / 4096 bytes per message.

## Identified hardware and what "driver verified" means

| Sensor | Observed | Basis |
|---|---|---|
| Temperature | **LM75A** at `0x4C` (also probed at `0x48`/`0x4A`) | Address falls in the LM75A range; the 11-bit two's-complement conversion (0.125 °C/LSB) reads a stable ~31.4 °C. The part has **no ID register**, so this is identification by address and plausible conversion, not a silicon ID. |
| IMU | **MPU-6500 class**, *not* MPU-6050 | `WHO_AM_I = 0x70`. An MPU-6050 returns `0x68`. The 6500 shares the MPU-6050 register map and the ±2 g (16384 LSB/g) / ±250 dps (131 LSB/dps) defaults, so the same driver applies. Resting acceleration magnitude ≈0.97 g corroborates the scale. |

Both sensors therefore report `ok` with values, and `i.chip` travels with the
data so the observed identity is never lost. The app labels them **“Driver
verified”**, not “clinically validated”: the software reads the chip correctly,
but neither reading has been calibrated against reference equipment.

The IMU gate is the identity itself, not the board silkscreen: the firmware only
sets `IMU_DRIVER_VALID` when `WHO_AM_I` is `0x68` or `0x70`. Any other value
leaves the sensor `unvalidated` and withholds its values.

## Advertising

The app scans with a service-UUID filter, so the service must be in the
advertising payload. Flags (3 bytes) + a 128-bit UUID (17 bytes) fill 20 of the
31-byte legacy payload, so the 14-character name is placed in the **scan
response**. Both are visible to Android scan filters; dropping the UUID makes
the device invisible to the app.

## Legacy protocol v1 — binary frame

Older firmware sent this 28-byte frame. The app still accepts it when it
reassembles to exactly 28 bytes and does not begin with `{`.

## Frame layout (28 bytes)

Big-endian, `struct '>IBhIIhhhhhhB'`:

| Offset | Size | Type | Field | Unavailable sentinel |
|---|---|---|---|---|
| 0 | 4 | uint32 | Device uptime, ms | — |
| 4 | 1 | uint8 | Flags | — |
| 5 | 2 | int16 | Temperature, centi-°C | `-32768` |
| 7 | 4 | uint32 | Optical red, raw counts | `0xFFFFFFFF` |
| 11 | 4 | uint32 | Optical IR, raw counts | `0xFFFFFFFF` |
| 15 | 2 | int16 | Accel X, mg | `-32768` |
| 17 | 2 | int16 | Accel Y, mg | `-32768` |
| 19 | 2 | int16 | Accel Z, mg | `-32768` |
| 21 | 2 | int16 | Gyro X, centi-°/s | `-32768` |
| 23 | 2 | int16 | Gyro Y, centi-°/s | `-32768` |
| 25 | 2 | int16 | Gyro Z, centi-°/s | `-32768` |
| 27 | 1 | uint8 | Optical samples in this frame | — |

**Unit conversion**

- Temperature: `centi_°C / 100`
- Acceleration: `mg / 1000` → g
- Gyroscope: `centi_°/s / 100` → °/s

**Clock basis.** `uptime_ms` is device uptime. It is not UTC and the app never
presents it as a wall-clock time. The phone records `receivedAt` separately.

## Flags

| Bit | Mask | Meaning |
|---|---|---|
| 0 | `0x01` | Temperature driver validated this frame |
| 1 | `0x02` | Optical values valid |
| 2 | `0x04` | IMU driver validated this frame |
| 3 | `0x08` | Temperature sensor present |
| 4 | `0x10` | Optical sensor present |
| 5 | `0x20` | IMU sensor present |
| 6–7 | — | Reserved, zero |

Present and valid are independent. With the current firmware,
`TEMP_DRIVER_VALID` and `IMU_DRIVER_VALID` are `False`, so those sensors report
`present = true, valid = false`.

## Status derivation

The app maps the two flag bits plus value presence to one status:

| Present | Valid | Values present | Status | UI |
|---|---|---|---|---|
| no | — | — | `unavailable` | “Unavailable” |
| yes | no | — | `unvalidated` | “Not validated” |
| yes | yes | no | `error` | “Invalid data” (value discarded) |
| yes | yes | yes | `ok` | Value shown |

A missing value is stored as `NULL`. The app never substitutes zero.

## Reassembly rules

The app's assembler (`src/features/ble/assembler.ts`) enforces:

- Fragment count ≥ 1 and index < count.
- Payload ≤ 20 bytes and notification > 4 bytes.
- Fragment count ≤ 16 and message ≤ 512 bytes.
- Only one message in flight; a new sequence supersedes an unfinished one, and
  the new fragment is kept.
- Identical duplicate fragments are ignored; conflicting duplicates discard the
  whole message.
- 2-second reassembly timeout; a stalled message is dropped, not completed.
- Duplicate, out-of-order, truncated, and oversized input cannot produce a
  frame.

## Failure modes the app reports

- Malformed header or frame → frame counted as dropped; connection stays up.
- Notification monitor error → surfaced in the dashboard.
- Device disconnect → informational alert; reconnect with backoff if enabled.
- Data older than the configured freshness window → “Stale” with last-received
  time; values are not presented as current.

## Backend mapping

The starter FastAPI accepts a flat JSON object. The app sends only validated
values:

| App field | Backend field | Rule |
|---|---|---|
| patientId (setting) | `patient_id` | Demo id; no account system |
| device name | `device_id` | — |
| `uptimeMs` | `uptime_ms` | Device uptime, not wall clock |
| `flags` | `sensor_flags` | Raw flags, for diagnosis |
| temp (only if `ok`) | `temperature_c` | Else `null` |
| red/IR (only if `ok`) | `red_raw`, `ir_raw` | Else `null` |
| accel/gyro (only if `ok`) | `accel_g`, `gyro_dps` | Else `null` |
| samples | `optical_samples` | 0 when optical is not `ok` |
| local record id | `client_measurement_id` | Ignored by the starter API; reserved for idempotency |

## Versioning

`v1` is implicit in the frame size and flag layout. Any change to offsets,
sentinels, or semantics requires a new protocol version, a firmware change, an
app change, and an update to this file. Do not reuse v1 with different bytes.
