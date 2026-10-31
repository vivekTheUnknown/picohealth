# PicoHealth — Android companion app

React Native + Expo + TypeScript app for the Pico W wearable prototype.
Four tabs: **Dashboard**, **History**, **Alerts**, **Settings**.

> Prototype only. Not a medical device, not validated for diagnosis, and not an
> emergency-monitoring service. Do not use real patient data.

## What it does

- Scans for `PicoHealth-DEV`, connects, discovers the custom GATT service, and
  subscribes to notifications.
- Receives **raw** sensor data (protocol v3), reassembles it, and performs all
  conversion and signal processing on the phone: LM75A register → °C, IMU axes
  → g / °/s, and MAX30102 red/IR batches → heart rate and SpO₂ via the
  Maxim/SparkFun algorithm. Legacy v2 JSON and v1 binary frames are still
  accepted.
- Shows raw optical counts plus app-derived HR/SpO₂, with explicit
  `collecting`, `no_contact`, `poor_signal` and `valid` states. The pulse card
  withholds values until a 4 s window passes quality checks.
- Converts temperature and IMU in the app, gated on the observed chip identity
  (LM75A address/conversion; IMU `WHO_AM_I`). Badges say “Driver verified”,
  never “clinically validated”.
- Stores accepted samples in SQLite and shows history with honest gaps.
- **Live** tab: rolling temperature, heart-rate and SpO₂ charts (gap-preserving,
  1/5/15-minute windows), a lateral-acceleration vector diagram, and
  roll/pitch/yaw graphs. Yaw is gyro-integrated and drifts (no magnetometer);
  true centripetal acceleration needs a rotation radius, so the diagram shows
  the gravity-removed lateral component and says so.
- **Appearance**: System / Light / Dark theme, persisted and applied to the
  whole app including native dialogs.
- Raises informational, de-duplicated alerts with configurable prototype
  thresholds.
- Optionally syncs processed records to the health portal, off by default.

## Requirements

| | |
|---|---|
| Node | 22 LTS (developed on 22.23.0) |
| Expo SDK | 58 (`expo@~58.0.21`) |
| React Native | 0.88.1 |
| BLE | `react-native-ble-plx@3.5.1` |
| Android | 7.0+ device with Bluetooth LE |

A **custom development build is required**. Expo Go cannot load
`react-native-ble-plx`, so scanning will not work there even though the UI
renders.

## Install and run

```bash
cd mobile
npm install
```

With the Android SDK installed and a phone connected over USB
(`adb devices` must show `device`):

```bash
npx expo run:android
```

Without a local Android SDK, build a development APK in the cloud:

```bash
npx eas build --platform android --profile development
```

Then install the APK on the phone (allow installation from that source), open
it, and grant the Bluetooth prompt.

### If you need HTTP to a laptop

Release builds are HTTPS-only. To reach the starter FastAPI over plain HTTP on a
LAN during development, opt in explicitly before generating the native project:

```bash
ALLOW_CLEARTEXT=true npx expo prebuild --platform android --clean
npx expo run:android
```

That flag sets `android.usesCleartextTraffic` for that build only. Do not ship a
release build with it. The Settings screen warns whenever the configured URL is
plain HTTP.

## Portal sync (optional)

The app syncs its processed records directly to the health portal in
`../backend`. Conversion, quality gating and derived metrics stay on the phone.

```bash
cd ../backend
.venv/bin/alembic upgrade head
.venv/bin/python -m scripts.seed
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

In the app: **Settings → Health portal**, enter the laptop's LAN address
(e.g. `http://192.168.1.20:8000`), the patient account name and password, then
**Connect to portal**. `localhost` on the phone points at the phone, not the
laptop. The patient account is seeded as `kode vivek sai` / `kodeviveksai`.

The token is obtained from `POST /api/v1/auth/token` and stored in the platform
keystore via `expo-secure-store`. The password is never stored. Records are
queued in SQLite and posted in batches; `client_record_id` makes retries
idempotent, and failed batches remain queued for the 20-second retry loop.
Demo records are excluded from the queue. See `../docs/app-portal-sync.md`.

## Permissions

Android 12+ needs `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT` only. The manifest
plugin (`plugins/withBlePermissions.js`) marks the scan permission with
`android:usesPermissionFlags="neverForLocation"`, so **location is not
requested** on modern Android and the app never derives location from scans.

Android 11 and below require location permission for BLE scan results to be
returned at all; the app requests it only on those versions and explains why.

Verified in the generated manifest:

```xml
<uses-permission android:name="android.permission.BLUETOOTH_SCAN"
                 android:usesPermissionFlags="neverForLocation"/>
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT"/>
```

## Demo mode

Settings → **Generate demo data** emits clearly labelled `DEMO DATA` frames from
the phone so the UI can be exercised without hardware. Demo frames:

- show a permanent warning banner on the Dashboard and a `DEMO` badge in History,
- are never uploaded,
- keep temperature and IMU as “Not validated”, mirroring the real firmware.

Bluetooth is disconnected while demo mode is on.

## Project layout

```
mobile/
├── app.config.ts              Expo config (permissions, plugins, cleartext opt-in)
├── plugins/withBlePermissions.js
├── src/
│   ├── app/                   Expo Router screens
│   │   ├── _layout.tsx        providers + stack
│   │   └── (tabs)/            dashboard, history, alerts, settings
│   ├── components/ui/         Card, Badge, Button, Field, states
│   ├── features/
│   │   ├── app/               provider: settings + BLE + alerts + upload
│   │   ├── ble/               protocol decode, reassembly, client, session hook
│   │   ├── measurements/      freshness policy, presentation helpers
│   │   ├── alerts/            pure rules engine
│   │   └── settings/          defaults, validation, URL policy
│   ├── services/
│   │   ├── api/               portal client + payload mapping
│   │   ├── portal/            secure token storage
│   │   ├── permissions/       runtime BLE permission requests
│   │   └── storage/           SQLite schema + repository
│   ├── theme/tokens.ts        light/dark palettes, spacing, type
│   ├── types/health.ts
│   └── utils/format.ts        ids, base64, timestamps
└── __tests__                  colocated under src/**/__tests__
```

The BLE protocol is documented in [`../docs/ble-protocol.md`](../docs/ble-protocol.md).

## Derived metrics

All derived values are computed on the phone from the raw streams. Units,
formulas and gates are fixed here so history stays comparable across builds.

| Metric | Definition | Gate |
|---|---|---|
| Perfusion index (PI) | `100 × AC_IR / DC_IR` over the 4 s window | optical signal present |
| PRV (RMSSD) | Root mean square of successive beat-interval differences, PPG-derived | ≥30 accepted intervals, contact, no clipping/motion |
| Temperature trend | Delta, rate/min and average over a 5 min window | ≥2 decoded samples |
| Movement intensity | RMS of gravity-removed acceleration over 5 s: still <0.03 g, light <0.12, moderate <0.3, high ≥0.3 | IMU valid |
| Device orientation | Dominant gravity axis: face_up / face_down / edge_x / edge_y | IMU valid |
| Respiratory rate | Not implemented (spec keeps it experimental until validated) | — |
| Fall-like event | Not implemented (optional, placement-dependent) | — |

PRV is **PPG-derived**, not ECG HRV. Activity thresholds are uncalibrated for a
wearing position, and orientation is the device's orientation, not body posture.
The algorithm version (`max3010x-app-v2`) is stored with every record.

### Optical state machine

`no_signal → verifying_pulse → signal_present → pulse_likely → measurement_valid`,
with `poor_signal` for clipped/motion-corrupted windows and `sensor_error` for
stream failures. Before publishing BPM/SpO₂ the app also requires at least three
plausible intervals with a coefficient of variation ≤0.2 and a red/IR
correlation ≥0.6, so periodic artefacts cannot produce a valid-looking estimate. A high DC level is treated as reflection, **not** proof that a
finger is present. BPM and SpO₂ keep independent validity; neither is published
unless contact, clipping and motion checks pass.

## Data handling

- Every accepted frame is written to SQLite with `received_at` (phone clock) and
  `uptime_ms` (device clock) kept separate.
- Unavailable values are `NULL`, never `0`.
- History gaps are rendered as gaps; nothing is interpolated.
- Retention is configurable (1–365 days) and enforced at startup.
- “Delete local data” removes measurements and alerts from the phone only.

### Theme

The palette lives in `src/theme/tokens.ts` with light and dark token sets.
`ThemeProvider` stores the preference (`picohealth.theme.v1`), calls
`Appearance.setColorScheme` so native surfaces match, and falls back to System.
Charts and SVGs read the same tokens.

### Upload payload

Only sensors whose status is `ok` are sent. Unvalidated or unavailable sensors
are sent as `null`:

```json
{
  "patient_id": 1,
  "device_id": "PicoHealth-DEV",
  "uptime_ms": 42000,
  "sensor_flags": 63,
  "temperature_c": 36.5,
  "red_raw": 12345,
  "ir_raw": 11780,
  "accel_g": [0.02, -0.01, 1.0],
  "gyro_dps": [1.0, -2.0, 3.0],
  "optical_samples": 18,
  "client_measurement_id": "m_..."
}
```

No name, contact detail, or location is sent.

## Verification

Run locally:

```bash
npm test          # 111 unit tests
npm run typecheck # tsc --noEmit
npx expo config --type public
npx expo export --platform android
```

Tests cover the parts where a mistake would make the app lie:

| Area | What is asserted |
|---|---|
| Frame decoding | exact offsets/scaling; sentinels become `null`; `present`/`valid` map to the four statuses; wrong length rejected; uptime is not treated as wall-clock |
| Reassembly | firmware's two fragments; out-of-order; duplicate and conflicting fragments; sequence supersession keeps the new fragment; timeout; size/count limits; no completion with a missing fragment |
| Freshness | boundary at the stale window; no-data state; gaps not invented |
| Alerts | one alert per episode; recovery re-arms; cooldown; temperature rules only when validated; no diagnostic or emergency wording |
| Payload | unavailable and unvalidated values become `null`; a genuine `0` is still sent |
| Settings | clamping, URL policy, sync cannot be enabled without a connected patient account, corrupt storage rejected |
| Presentation | no heart-rate/SpO₂ claims from raw counts; `--` instead of zero |
| MAX30102 | 25 Hz resampling, 4 s window, reference algorithm, valid/invalid synthesis cases |
| Raw protocol | JSON messages, binary batches, malformed/truncated input |
| Temperature / IMU | LM75A two's complement, identity-gated scaling, gyro bias |

Not verified here (no Android SDK, no phone, no Pico attached): the native build,
a real BLE scan/connection, notification delivery, and SQLite on-device
behaviour. Those require the manual steps above.

## Known limitations

- **No device authentication.** The firmware does not authenticate; anyone in
  range could advertise the same service UUID. Do not use with real data.
- **Token in the keystore.** The bearer token is stored with
  `expo-secure-store`; the password is never persisted. Token expiry requires
  signing in again.
- **Sync is at-least-once on the wire, idempotent on the server.** The local id
  is sent as `client_record_id`, which is unique server-side, so a retried
  batch cannot duplicate a sample.
- **Foreground only.** Reconnection stops when the app is backgrounded; there is
  no background service or guarantee.
- **Single device.** One wearable at a time.
- **No waveforms.** Only summary frames; ECG/PPG streaming is out of scope.
- **No CSV export.** Deliberately not implemented rather than half-built.
- **Optical contact matters.** The bench signal currently has no coherent
  pulsatile component (~30 counts AC on ~77 k DC), so HR/SpO₂ are correctly
  withheld. A fingertip must sit directly on the MAX30102 window with gentle
  pressure and ambient light blocked.
- **Not clinically calibrated.** Temperature, IMU and raw optical counts are
  uncalibrated prototype readings. The identified chips make the conversions
  correct per datasheet, not medically accurate.
- **Firmware notification error resolved.** `Notify interrupted:
  TypeError("'NoneType' object isn't iterable")` is still undiagnosed. The app
  treats missing notifications as missing data and never fills the gap.

## Troubleshooting

| Symptom | Check |
|---|---|
| No device found | Pico powered and running the BLE firmware; name matches Settings; Bluetooth on; scan restarts after 10 s |
| Permission denied | Android 12+: Nearby devices. Android 11-: location is required by the OS for scans |
| Service or characteristic missing | UUIDs in firmware and `src/types/health.ts` must match exactly |
| Notifications never arrive | Custom dev build (not Expo Go); characteristic has `notify`; check firmware logs |
| `Notify interrupted` | Capture the full MicroPython traceback; do not trust the stream until fixed |
| Upload fails | Use the laptop's LAN IP, not `localhost`; server bound to `0.0.0.0`; HTTPS or `ALLOW_CLEARTEXT=true` for local HTTP |
| Data shows “Stale” immediately | Stream is slower than the freshness window; raise “Mark data stale after” in Settings |
