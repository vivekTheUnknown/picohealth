# PicoHealth — Android companion app

React Native + Expo + TypeScript app for the Pico W wearable prototype.
Four tabs: **Dashboard**, **History**, **Alerts**, **Settings**.

> Prototype only. Not a medical device, not validated for diagnosis, and not an
> emergency-monitoring service. Do not use real patient data.

## What it does

- Scans for `PicoHealth-DEV`, connects, discovers the custom GATT service, and
  subscribes to notifications.
- Reassembles fragmented protocol-v2 JSON records (legacy 28-byte binary frames
  are still accepted), validates them, and keeps each sensor's status
  independent.
- Shows raw optical counts, and shows **no** temperature or IMU value while the
  firmware marks those drivers invalid.
- Stores accepted samples in SQLite and shows history with honest gaps.
- Raises informational, de-duplicated alerts with configurable prototype
  thresholds.
- Optionally uploads live samples to the starter FastAPI, off by default.

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

## Backend (optional)

The starter API lives in `../pico_w_ble_wearable_starter/backend`:

```bash
cd ../pico_w_ble_wearable_starter/backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

In the app: **Settings → Backend upload**, enter the laptop's LAN address
(e.g. `http://192.168.1.20:8000`), **Test connection**, then enable upload and
confirm the disclosure. `localhost` on the phone points at the phone, not the
laptop.

The demo token comes from `EXPO_PUBLIC_DEMO_TOKEN` (default
`dev-only-change-me`, matching the server). It is a shared demo secret, not
authentication. No token is written to SQLite or AsyncStorage.

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
│   │   ├── api/               backend adapter + payload mapping
│   │   ├── permissions/       runtime BLE permission requests
│   │   └── storage/           SQLite schema + repository
│   ├── theme/tokens.ts        light/dark palettes, spacing, type
│   ├── types/health.ts
│   └── utils/format.ts        ids, base64, timestamps
└── __tests__                  colocated under src/**/__tests__
```

The BLE protocol is documented in [`../docs/ble-protocol.md`](../docs/ble-protocol.md).

## Data handling

- Every accepted frame is written to SQLite with `received_at` (phone clock) and
  `uptime_ms` (device clock) kept separate.
- Unavailable values are `NULL`, never `0`.
- History gaps are rendered as gaps; nothing is interpolated.
- Retention is configurable (1–365 days) and enforced at startup.
- “Delete local data” removes measurements and alerts from the phone only.

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
npm test          # 70 unit tests
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
| Settings | clamping, URL policy, upload cannot be enabled without a destination, corrupt storage rejected |
| Presentation | no heart-rate/SpO₂ claims from raw counts; `--` instead of zero |

Not verified here (no Android SDK, no phone, no Pico attached): the native build,
a real BLE scan/connection, notification delivery, and SQLite on-device
behaviour. Those require the manual steps above.

## Known limitations

- **No device authentication.** The firmware does not authenticate; anyone in
  range could advertise the same service UUID. Do not use with real data.
- **Shared demo token.** The starter API has no accounts; uploads use one demo
  bearer token. Real deployments need per-device credentials in secure storage.
- **Upload is at-least-once.** The local id is sent as `client_measurement_id`,
  but the starter API ignores it, so a lost response can duplicate a sample.
- **Foreground only.** Reconnection stops when the app is backgrounded; there is
  no background service or guarantee.
- **Single device.** One wearable at a time.
- **No waveforms.** Only summary frames; ECG/PPG streaming is out of scope.
- **No CSV export.** Deliberately not implemented rather than half-built.
- **Firmware notification error unresolved.** `Notify interrupted:
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
