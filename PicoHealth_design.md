# PicoHealth --- React Native App Design & Implementation Specification

**Purpose:** Build an Android companion app for a Raspberry Pi Pico W
wearable prototype, with Bluetooth Low Energy (BLE) sensor data, local
history, alerts, and optional upload to a FastAPI backend/doctor portal.

**Primary implementation target:** Android phone, using React Native +
Expo + TypeScript.\
**Device:** Raspberry Pi Pico W running MicroPython and `aioble`.\
**Backend:** FastAPI + SQLite for development; PostgreSQL can replace
SQLite later.\
**Project status:** Prototype only. Do not present readings or alerts as
medical-grade or use them for diagnosis or treatment.

------------------------------------------------------------------------

## 1. Goals and scope

Build an installable Android app that:

1.  Scans for and connects to the Pico W BLE peripheral named
    `PicoHealth-DEV`.
2.  Discovers the custom GATT service and measurement characteristic
    defined below.
3.  Enables notifications and receives messages from the Pico W.
4.  Parses validated measurement messages and displays current readings
    and sensor status.
5.  Shows a measurement history and basic threshold-based informational
    alerts.
6.  Handles unavailable sensors, malformed/stale values, BLE
    disconnections, permission denials, and reconnection.
7.  Optionally sends readings to a FastAPI backend over HTTPS.
8.  Provides a clear privacy/data status and does not silently upload
    data.
9.  Can be built and installed on a physical Android phone.

### Explicit non-goals for the first version

-   No diagnosis, treatment recommendation, emergency detection, or
    medical claims.
-   No background tracking guarantee. Android may suspend background
    work; first version is designed for foreground use.
-   No account system or multi-patient production security unless
    specifically implemented and reviewed.
-   No claiming heart rate, SpO₂, body temperature, or motion results
    are accurate until the hardware, algorithms, and measurements have
    been independently validated.
-   No need to rewrite the Pico W firmware or backend unless integration
    reveals an incompatibility.

------------------------------------------------------------------------

## 2. Existing hardware and firmware context

The current prototype is a Raspberry Pi Pico W with three I²C devices:

  ------------------------------------------------------------------------------
  Device              Observed address  Current           Requirements
                      / identity        confidence        
  ------------------- ----------------- ----------------- ----------------------
  Optical sensor      I²C `0x57`; Part  Raw optical data  Show raw readings or
  labelled            ID register       only; no          mark derived metrics
  MAX30100/MAX30102   `0xFF` returned   validated         as experimental until
                      `0x15`,           heart-rate or     algorithms and sensor
                      consistent with   SpO₂ values       placement are
                      MAX30102                            validated

  Blue IMU breakout   I²C `0x68`;       Exact chip        Driver must be
                      WHO_AM_I returned unknown; do not   identified/validated
                      `0x70`            assume MPU-6050   before displaying
                                        register map      derived acceleration,
                                                          orientation, or
                                                          temperature

  Pink temperature    Intermittently    Unvalidated;      Identify exact chip
  breakout            observed at       intermittent I²C  and verify register
                      `0x48` or `0x4C`; errors observed   map, scale, sign, and
                      chip model                          fault behavior before
                      unknown                             trusting temperature
  ------------------------------------------------------------------------------

Firmware has previously shown:
`Notify interrupted: TypeError("'NoneType' object isn't iterable",)`

This traceback is not yet diagnosed. The mobile app must not assume that
BLE notification delivery is reliable until tested. Ask for the complete
MicroPython traceback and fix the firmware/library issue if
notifications fail.

### Electrical safety and data quality

-   Use a common ground between Pico W and sensor boards.
-   Never apply 5 V to Pico GPIO pins. Verify each breakout's
    logic-level compatibility and power requirements.
-   Mark sensor values unavailable when a device fails to respond, data
    is stale, or validation fails.
-   Do not silently replace missing values with zero.
-   Keep sensor status separate for each device so one failure does not
    mark every sensor failed.
-   Use timestamps and validity flags for each sample.

------------------------------------------------------------------------

## 3. Technology stack

### Mobile

-   Node.js LTS (use a supported current LTS release; verify with
    `node --version`).
-   npm (bundled with Node.js).
-   React Native with Expo and TypeScript.
-   Expo development build / custom development client, because BLE
    requires native capabilities and is not supported by the standard
    Expo Go client.
-   `react-native-ble-plx` for BLE central/client behavior.
-   `expo-dev-client` for the development client.
-   `expo-build-properties` only if required by the selected
    library/configuration.
-   `@react-native-async-storage/async-storage` for small non-sensitive
    preferences, if needed.
-   `expo-sqlite` for local measurement history (preferred over
    AsyncStorage for structured history).
-   `zod` for runtime validation of BLE and API payloads.
-   `@tanstack/react-query` for server state only if backend integration
    is included.
-   `react-native-svg` only if charts or custom vector graphics require
    it.
-   Use React Native's built-in components for the initial UI. Avoid
    adding unnecessary UI dependencies.

**Important:** Check current compatibility of `react-native-ble-plx`,
Expo SDK, Android Gradle Plugin, and the selected React Native version
before implementation. Pin compatible versions in `package.json` and
commit the lockfile. Do not blindly install the newest version of every
package.

### Backend (optional for initial mobile milestone)

-   Python 3.11+ (use a supported version compatible with chosen FastAPI
    dependencies).
-   `fastapi`
-   `uvicorn[standard]`
-   `sqlalchemy`
-   `pydantic`
-   `python-dotenv`
-   `pytest` and `httpx` for tests
-   SQLite for local development; PostgreSQL for hosted deployment.

### Hardware firmware

-   MicroPython firmware for Raspberry Pi Pico W (RP2040 build, not
    original non-W Pico firmware).
-   `aioble` installed on the Pico W.
-   `bluetooth` and `uasyncio` from the compatible MicroPython firmware.
-   Existing firmware should be preserved and modified incrementally,
    not replaced without reviewing sensor drivers and BLE protocol.

------------------------------------------------------------------------

## 4. Repository structure

Use a clean structure similar to:

``` text
picohealth/
├── mobile/
│   ├── app/                    # Expo Router screens, or src/navigation if not using Expo Router
│   ├── src/
│   │   ├── components/
│   │   ├── features/
│   │   │   ├── ble/
│   │   │   ├── measurements/
│   │   │   ├── alerts/
│   │   │   └── settings/
│   │   ├── services/
│   │   │   ├── api/
│   │   │   ├── storage/
│   │   │   └── permissions/
│   │   ├── hooks/
│   │   ├── types/
│   │   ├── theme/
│   │   └── utils/
│   ├── assets/
│   ├── app.json
│   ├── package.json
│   └── tsconfig.json
├── firmware/
│   ├── main.py
│   └── README.md
├── backend/
│   ├── app/
│   ├── tests/
│   ├── requirements.txt
│   └── README.md
├── docs/
│   └── ble-protocol.md
└── README.md
```

If the existing starter bundle has a different structure, inspect it
first and adapt rather than overwriting it blindly. Do not invent files
that are not present.

------------------------------------------------------------------------

## 5. App navigation and screens

Use a simple bottom-tab layout with four tabs: **Dashboard**,
**History**, **Alerts**, and **Settings**. Use readable text, generous
spacing, accessible contrast, and responsive layouts.

### 5.1 Dashboard

Purpose: current connection and measurement status.

Components: - Header: `PicoHealth` and device connection badge. - Device
card: `Disconnected`, `Connecting`, `Connected`, or `Reconnecting`. -
Last data received timestamp and stale-data warning. - Separate sensor
cards: - Optical sensor: raw red/IR counts initially. If a validated
algorithm is added later, label heart rate in bpm and SpO₂ in percent as
experimental until validated. - Temperature sensor: show °C only after
its exact chip and conversion formula are confirmed; otherwise show
`Not validated` or `Unavailable`. - IMU: show raw acceleration/gyro only
if register mapping and units are validated; otherwise show
`Unavailable` / `Driver not validated`. - A sensor's failure must not
hide healthy sensors. - A `Connect device` / `Disconnect` button. - An
explicit `Start session` / `Stop session` control if sessions are
implemented. - Clear no-data and permission-denied states. - Do not show
fake values as though they are live. Demo mode, if included, must be
visibly labelled `DEMO DATA`.

### 5.2 History

-   List samples or time-bucketed summaries with local timestamps.
-   Filters: today, 7 days, 30 days, all.
-   Details include values, validity status, source device, and
    timestamp.
-   Show gaps caused by disconnections instead of interpolating invented
    values.
-   Local database is the primary source of history in the first
    version.
-   Export CSV only if implemented with explicit user action and clear
    destination.

### 5.3 Alerts

-   Informational notices only, e.g. `Device disconnected`,
    `Temperature sensor unavailable`, `Data is stale`,
    `Measurement outside configured prototype range`.
-   Thresholds must be configurable and clearly marked as prototype
    thresholds, not clinical cutoffs.
-   Avoid declaring a medical emergency or offering medical diagnosis.
-   De-duplicate repeated alerts and provide a way to
    dismiss/acknowledge them.
-   Explain that this prototype is not an emergency-monitoring service.

### 5.4 Settings

-   BLE device name and connection status.
-   Reconnect preference (default on while app is foregrounded).
-   Backend URL and connection/test status.
-   Upload toggle, off by default until the user opts in.
-   Data retention and clear-local-history action with confirmation.
-   App version, firmware version if available, protocol version,
    privacy note.
-   Troubleshooting section for permissions and BLE connectivity.

### 5.5 Optional doctor portal

A separate responsive web interface served by FastAPI or a separate
frontend: - Authenticated clinician access is required before real
patient data is exposed. - Patient list, latest measurements, historical
trends, sensor-health status, and timestamps. - Role-based access and
audit logging before any real deployment. - Never expose the database or
unauthenticated patient endpoints to the public internet.

------------------------------------------------------------------------

## 6. Visual design system

### Style

-   Calm, minimal, modern monitoring dashboard.
-   Light theme by default; optional dark theme if simple to implement.
-   Background: off-white/light neutral.
-   Cards: white surfaces with subtle borders, rounded corners around
    12--16 dp.
-   Primary accent: blue/teal.
-   Use semantic colors sparingly: green = connected/healthy data flow,
    amber = warning/stale, red = device or data error. Color must never
    be the only signal; include text/icons.
-   Typography: platform system font, clear hierarchy, minimum
    comfortable body text around 14--16 sp.
-   Large metric values with explicit units and timestamps.
-   Support Android font scaling and screen readers; use accessible
    labels and adequate touch targets (about 48 dp).

### Sample dashboard wireframe

``` text
┌─────────────────────────────────────┐
│ PicoHealth                 Settings │
│ Wearable prototype                  │
├─────────────────────────────────────┤
│ DEVICE                               │
│ ● Connected                         │
│ PicoHealth-DEV                      │
│ Last update: 10:42:08               │
│ [ Disconnect ]                      │
├─────────────────────────────────────┤
│ SENSOR STATUS                        │
│ Optical sensor     Raw data received │
│ Red: 12345         IR: 11780         │
│                                      │
│ Temperature       Not validated      │
│ -- °C             Check sensor setup │
│                                      │
│ IMU               Driver unverified  │
│ --                Check sensor setup │
├─────────────────────────────────────┤
│ History | Alerts | Settings          │
└─────────────────────────────────────┘
```

The numbers in this wireframe are examples only. Do not ship them as
live readings. Use `--` or `Unavailable` when values are not available.

------------------------------------------------------------------------

## 7. BLE GATT contract

The mobile app acts as a BLE **central/client**. The Pico W acts as a
BLE **peripheral/server**.

Existing test identifiers:

-   Device name: `PicoHealth-DEV`
-   Service UUID: `8f2a0001-6b6d-4f9e-9f6d-6c2b2d0a0001`
-   Data characteristic UUID: `8f2a0002-6b6d-4f9e-9f6d-6c2b2d0a0001`

The service UUID is advertised in the current simple firmware test. The
data characteristic must be registered on the Pico W with `read` and
`notify` properties. The phone must discover it and subscribe to
notifications. UUIDs must match exactly on both sides.

### Recommended payload protocol

Do not build a production parser around an undocumented binary frame.
For the first test, use short UTF-8 ASCII messages, for example:

``` text
TEST:0001
TEST:0002
```

These test messages prove transport only; they are not sensor readings.

Then implement a documented, versioned JSON message protocol. Example:

``` json
{
  "v": 1,
  "type": "measurement",
  "seq": 42,
  "ts_ms": 123456789,
  "sensors": {
    "optical": {
      "status": "ok",
      "red": 12345,
      "ir": 11780
    },
    "temperature": {
      "status": "unavailable",
      "value_c": null
    },
    "imu": {
      "status": "unvalidated",
      "ax": null,
      "ay": null,
      "az": null
    }
  }
}
```

Example values are illustrative only. `ts_ms` must have a clearly
defined clock basis (e.g. uptime milliseconds if no wall clock is
available); do not treat device uptime as UTC. A JSON payload can exceed
the default BLE notification payload. Keep each notification within the
negotiated MTU, or define and test a fragment/reassembly protocol. Do
not assume one notification equals one complete JSON message.

### Fragmentation

If messages are larger than the negotiated notification payload: - Use
an explicit frame header containing protocol version, sequence/message
ID, fragment index, fragment count or total length. - Reassemble only
when every fragment is received. - Enforce a maximum message length and
timeout. - Reject duplicate, out-of-order, truncated, or invalid frames
safely. - Include tests for fragmented messages and reconnects. - Never
concatenate unrelated notifications without message boundaries.

### BLE behavior requirements

-   Request the Android permissions appropriate for the OS version and
    the selected BLE library.
-   Android 12+ generally requires runtime `BLUETOOTH_SCAN` and
    `BLUETOOTH_CONNECT` permissions. Older Android versions may require
    location permission for BLE scanning. Follow current library
    documentation and test on the actual phone OS.
-   Explain why each permission is requested; do not request unrelated
    permissions.
-   Handle Bluetooth disabled, permission denied, scan timeout, no
    device found, connection failure, service not found, characteristic
    not found, notification subscription failure, device disconnect, and
    app background/foreground.
-   Stop scans after a timeout and clean up subscriptions/monitors on
    disconnect/unmount.
-   Reconnect with bounded exponential backoff while the app is
    foregrounded; provide a manual disconnect override.
-   Mark data stale after a configurable interval (e.g. 5 seconds for a
    1-second test stream), rather than keeping an old value looking
    current.
-   Do not assume notifications are enabled until the
    monitor/subscription is successfully established.

------------------------------------------------------------------------

## 8. Data model and validation

Use TypeScript types and runtime validation (e.g. Zod) for incoming
messages.

Conceptual `Measurement` fields: - `id`: locally generated stable
identifier. - `deviceId`: BLE device identifier (avoid treating MAC
address as a guaranteed permanent ID). - `sequence`: message sequence
number. - `receivedAt`: phone timestamp in ISO 8601 format. -
`deviceTimestampMs`: optional device uptime or timestamp, with semantics
documented. - `optical.status`:
`ok | unavailable | error | unvalidated`. - `optical.red`, `optical.ir`:
nullable raw counts. - `temperature.status`:
`ok | unavailable | error | unvalidated`. - `temperature.valueC`:
nullable number. - `imu.status`:
`ok | unavailable | error | unvalidated`. - `imu` axes and units only
when validated; otherwise null. - `source`: `live | demo | imported`. -
`uploaded`: boolean and optional upload timestamp.

Rules: - Validate types, ranges, message version, sequence and
timestamps. - Preserve missing values as null with a status; do not
convert to zero. - Reject `NaN`, `Infinity`, unexpected fields if strict
parsing is used, and malformed JSON. - Avoid storing every
high-frequency optical sample indefinitely. Consider downsampling or
storing summaries after requirements are clear. - Keep sensor errors and
app errors in separate logs. Do not log sensitive health data
unnecessarily.

------------------------------------------------------------------------

## 9. Local storage and backend API

### Local-first behavior

-   Save accepted samples in SQLite on the phone.
-   The app should remain useful without internet access.
-   Uploading to a backend is opt-in and clearly indicated.
-   Retry uploads safely without creating duplicates; use stable IDs or
    idempotency keys.
-   Show upload state: `Not enabled`, `Pending`, `Uploaded`, `Failed`.
-   Provide a clear action to delete local history.

### Suggested FastAPI endpoints

Use a prefix such as `/api/v1`.

-   `GET /health` --- backend health check, no sensitive information.
-   `POST /api/v1/measurements` --- submit one or a batch of validated
    measurements.
-   `GET /api/v1/measurements?from=...&to=...&limit=...` --- retrieve
    history for the authenticated user.
-   `GET /api/v1/devices` --- list the user's registered devices.
-   `GET /api/v1/devices/{device_id}/status` --- last-seen and sensor
    status.
-   `GET /api/v1/alerts` --- retrieve informational alerts.
-   `POST /api/v1/alerts/{alert_id}/acknowledge` --- acknowledge an
    alert if implemented.

For any non-demo deployment: - Add real authentication and
authorization, TLS/HTTPS, input validation, rate limiting, secure secret
storage, audit logging, backups, and retention policies. - Never
hardcode production API keys or bearer tokens into the mobile bundle. -
A local development server on the laptop is not reachable from the phone
through `localhost`; use the laptop's LAN IP address and ensure both
devices are on the same network. Configure the firewall narrowly. For
hosted deployments, use HTTPS. - Avoid exposing a development server
publicly.

------------------------------------------------------------------------

## 10. Installation and development environment

### 10.1 Ubuntu prerequisites

Install basic packages:

``` bash
sudo apt update
sudo apt install -y git curl unzip zip xz-utils
```

Verify:

``` bash
git --version
curl --version
```

### 10.2 Node.js and npm

Install a currently supported **Node.js LTS** release using the official
Node.js installation instructions or a maintained version manager. Avoid
an outdated distro package if it does not satisfy the chosen Expo SDK
requirements.

Verify:

``` bash
node --version
npm --version
```

### 10.3 Create the Expo React Native app

Use the current Expo documentation and create command. A typical command
is:

``` bash
npx create-expo-app@latest mobile
cd mobile
```

If the repo already contains `mobile/`, inspect it before running the
generator; do not overwrite existing code.

Install dependencies based on the chosen Expo SDK and the current
`react-native-ble-plx` installation instructions. A typical starting
point is:

``` bash
npx expo install expo-dev-client expo-sqlite
npm install react-native-ble-plx zod
```

Only install packages that are actually used. Check the library's
compatibility, Android configuration, and permission requirements. The
exact commands may change across Expo SDK releases; follow the current
official docs rather than forcing incompatible versions.

### 10.4 Configure native permissions and development build

-   Configure the BLE library's Android permissions using its current
    instructions and the app's Expo config/plugins as appropriate.
-   Use a custom Expo development build. Standard Expo Go does not
    include arbitrary native BLE modules.
-   A local Android build generally needs Android Studio's Android SDK,
    platform tools, build tools, and command-line tools. Install them
    through Android Studio SDK Manager or follow Expo's current local
    build documentation.
-   Alternatively, use EAS Build to create an Android development APK in
    the cloud, if the project is configured for it and the service
    requirements are met. This can avoid local Android build tool
    installation but does not remove the need to configure BLE
    permissions and native modules correctly.
-   Do not assume `npx expo run:android` will work until the Android SDK
    and Java/Gradle requirements are installed and configured.

### 10.5 Android phone preparation

1.  Enable Developer options: open **Settings → About phone**, tap
    **Build number** seven times (menu names vary by manufacturer).
2.  In Developer options, enable **USB debugging**.
3.  Connect the phone to the laptop with a data-capable USB cable.
4.  Accept the debugging authorization prompt on the phone.
5.  If using a local build, install Android Platform Tools and verify:

``` bash
adb devices
```

The phone should appear as `device`, not `unauthorized`. If using an
EAS-built APK, USB debugging is not required just to install the APK,
but it is useful for logs and development.

### 10.6 Build and install

For a configured local development build:

``` bash
npx expo run:android
```

For a development build generated by EAS, install the generated APK on
the phone using the provided installation route, or copy it to the phone
and open it after allowing installation from that source. Prefer a
development APK for iterative BLE testing. For a distributable release,
use a signed release build and review app permissions.

After installing: - Grant Bluetooth permissions when requested. - Turn
Bluetooth on. - Power the Pico W and run its BLE peripheral firmware. -
Open the app, scan for `PicoHealth-DEV`, connect, discover the service,
and subscribe to the data characteristic. - Verify `TEST:0001`,
`TEST:0002`, etc. arrive before integrating sensor values.

### 10.7 Troubleshooting commands

``` bash
flutter doctor
node --version
npm --version
adb devices
```

`flutter doctor` is not required for React Native; it can be ignored
after switching away from Flutter. Use it only if Flutter tooling is
still being diagnosed.

Common problems: - `adb: command not found`: install Android SDK
Platform-Tools and add its `platform-tools` directory to `PATH`, or use
the full path. - Device shows `unauthorized`: unlock phone and accept
the USB debugging prompt. - BLE scan returns no device: verify Pico W is
advertising, Android permissions are granted, and the phone's Bluetooth
is enabled. - App installs but BLE native module is missing: rebuild the
custom development client after adding the native library; Expo Go will
not suffice. - Characteristic not found: compare service and
characteristic UUIDs exactly against the firmware. - Notifications do
not arrive: verify the app subscribed to notifications, the
characteristic has `notify`, and Pico firmware is writing updates
correctly. -
`Notify interrupted: TypeError("'NoneType' object isn't iterable",)`:
obtain the full MicroPython traceback and fix firmware/library behavior
before claiming reliable streaming.

------------------------------------------------------------------------

## 11. Backend installation (optional until BLE is working)

Create a Python virtual environment:

``` bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
```

Create `requirements.txt` containing only the selected dependencies, for
example:

``` text
fastapi
uvicorn[standard]
sqlalchemy
pydantic
python-dotenv
```

Then install and run:

``` bash
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Adjust `app.main:app` if the implemented entry point differs. Test:

``` bash
curl http://127.0.0.1:8000/health
```

Use the laptop's local network IP address in the phone app for LAN
testing, not `127.0.0.1` or `localhost`. Ensure firewall and Wi-Fi
settings permit the connection. Use HTTPS for any real deployment.

------------------------------------------------------------------------

## 12. Privacy and security requirements

-   Uploading health-related measurements must be opt-in.
-   Tell users what is stored locally and what is uploaded.
-   Do not include personal health data in analytics, crash reports, or
    routine logs.
-   Use secure storage for authentication tokens if authentication is
    added; do not store secrets in source code.
-   Protect all patient endpoints with authentication and per-user
    authorization.
-   Doctor portal must not be publicly accessible without
    authentication.
-   Use TLS/HTTPS outside local development.
-   Implement deletion and retention controls.
-   Do not describe the prototype as HIPAA-compliant or otherwise
    compliant without a proper legal, security, and operational
    assessment.
-   This app is a prototype and is not a substitute for validated
    medical equipment or professional care.

------------------------------------------------------------------------

## 13. Testing and acceptance criteria

### Milestone A --- App shell

-   App installs and launches on the target Android phone.
-   Dashboard, History, Alerts, and Settings screens render without
    errors.
-   Empty, loading, permission-denied, and error states are implemented.
-   Demo data, if present, is clearly labelled.

### Milestone B --- BLE test stream

-   App requests only necessary permissions.
-   Finds `PicoHealth-DEV` and connects.
-   Discovers the exact service and data characteristic.
-   Subscribes to notifications and displays incoming test messages.
-   Handles disconnect and reconnect without duplicate listeners.
-   Marks data stale when notifications stop.

### Milestone C --- Sensor integration

-   Each sensor has an independent status.
-   A sensor failure does not crash the app or hide other sensor data.
-   Unvalidated metrics remain labelled unvalidated.
-   Malformed or stale samples are rejected or flagged.
-   No fake zero values are substituted for unavailable readings.

### Milestone D --- History and alerts

-   Valid samples are stored locally in SQLite.
-   History filters work and preserve timestamps.
-   Alerts are deduplicated and can be acknowledged.
-   Local data remains available when the backend is offline.

### Milestone E --- Backend and portal

-   User explicitly enables upload.
-   Upload retry is idempotent and reports status.
-   API validates payloads and enforces authorization.
-   Doctor portal requires authentication and shows source timestamps
    and sensor-health status.
-   Backend tests cover validation failures, unauthorized access, and
    database behavior.

------------------------------------------------------------------------

## 14. Recommended implementation order for the coding agent

1.  Inspect the current repository and existing firmware/backend before
    editing.
2.  Report what files already exist and identify the current BLE UUIDs
    and payload format.
3.  Create or adapt the Expo + TypeScript mobile app without overwriting
    working code.
4.  Build the app shell with realistic empty states; do not fabricate
    live measurements.
5.  Implement BLE scanning, connection, service discovery, and
    notifications.
6.  First support `TEST:0001` style messages. Confirm notification
    transport end to end.
7.  Define and document the versioned measurement payload and
    fragmentation behavior.
8.  Add validated parsing, sensor status handling, local SQLite history,
    and informational alerts.
9.  Add optional FastAPI integration and a secure doctor portal only
    after the BLE path is working.
10. Add tests, README, exact install/build instructions, and
    troubleshooting steps.
11. Build an Android development APK and provide precise installation
    instructions.
12. Summarize changed files, commands run, tests passed/failed,
    unresolved issues, and manual steps still needed.

### Agent behavior rules

-   Do not claim a build or test passed unless it was actually run and
    its output inspected.
-   Do not assume the unidentified temperature or IMU devices are a
    specific chip.
-   Do not represent raw MAX30102 readings as medically valid heart rate
    or SpO₂.
-   Do not hide the known BLE notification error; capture the traceback
    and report it.
-   Do not invent a BLE payload schema and assume it matches the
    firmware; agree on a documented protocol and update both sides.
-   Prefer small, testable increments and keep a working checkpoint
    after each milestone.
-   Do not use real patient information during development.

------------------------------------------------------------------------

## 15. Official documentation

Use current official documentation because package versions, Android
permissions, and build requirements change:

-   Expo: https://docs.expo.dev/
-   Create Expo app: https://docs.expo.dev/get-started/create-a-project/
-   Expo development builds:
    https://docs.expo.dev/develop/development-builds/introduction/
-   Expo EAS Build: https://docs.expo.dev/build/introduction/
-   React Native BLE PLX:
    https://github.com/dotintent/react-native-ble-plx
-   Android SDK: https://developer.android.com/studio
-   Android Bluetooth permissions:
    https://developer.android.com/develop/connectivity/bluetooth/bt-permissions
-   FastAPI: https://fastapi.tiangolo.com/
-   MicroPython Raspberry Pi Pico:
    https://docs.micropython.org/en/latest/rp2/quickref.html
-   aioble:
    https://github.com/micropython/micropython-lib/tree/master/micropython/bluetooth/aioble

------------------------------------------------------------------------

**Definition of done for the first useful prototype:** The app is
installed on the user's Android phone, connects to the Pico W, receives
a test notification stream reliably, shows connection and sensor
validity honestly, and can preserve received measurements locally.
Backend and doctor portal are later milestones, not prerequisites for
the first BLE proof of concept.
