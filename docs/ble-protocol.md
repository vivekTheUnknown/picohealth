# PicoHealth BLE protocol v1

**Status:** implemented by `firmware/main.py` and the mobile app.

> The design document shows a JSON payload as a *recommendation*. The firmware
> in this repository does not send JSON: it sends a 28-byte binary frame split
> across notifications. The app implements the firmware's format, because
> inventing a schema that disagrees with the device was explicitly ruled out.
> If the firmware moves to JSON, both ends must change together and this
> document must be re-versioned.

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
| 4 | 0–16 | bytes | Payload fragment |

The firmware chunks the frame in **16-byte** pieces, so a 28-byte frame arrives
as two notifications (16 + 12). One notification is *not* one message.

`TEST:0001`-style ASCII notifications are also accepted. They carry no header
and are **transport proof only** — the app displays them in the device card and
never stores or plots them as measurements.

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
- Payload ≤ 16 bytes and notification > 4 bytes.
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
