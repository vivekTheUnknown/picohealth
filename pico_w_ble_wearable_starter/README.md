# Pico W BLE Wearable starter (Android + FastAPI)

Development starter only; **not a medical device** and not safe for real patient data.

## Contents
- `firmware/main.py`: MicroPython BLE peripheral; independent sensor tasks, per-sensor failures, retry/re-init, fragmented BLE notifications.
- `mobile/`: Flutter Android app starter: scan/connect, decode BLE packets, show live sensor status, keep an in-memory session list, POST data to API.
- `backend/`: FastAPI + SQLite demo API and simple doctor portal.
- `protocol.md`: BLE packet format.

## Important hardware limitations
Temperature sensor identity is unconfirmed, even though its address changes between `0x48` and `0x4C`. The LM75-style read conversion is provisional and deliberately marked invalid by default. IMU WHO_AM_I `0x70` does not match a typical MPU-6050; its register map/scaling is also provisional and disabled by default. MAX30102 values are raw red/IR, **not** heart rate or SpO2. Identify the exact chips and validate conversions before using these readings. Never use this prototype for diagnosis or treatment.

## Firmware
Use a Pico W MicroPython build with `bluetooth`, `uasyncio`, and `aioble`. `aioble` may need installing for your MicroPython build. Copy `firmware/main.py` to the device as `main.py`. I2C: GP4 SDA, GP5 SCL, 100 kHz. Confirm breakout voltage requirements; common ground; never put 5 V on Pico GPIO.

The firmware sends a frame once per second when connected and keeps sampling while disconnected. Sensor tasks catch errors independently. `TEMP_DRIVER_VALID` and `IMU_DRIVER_VALID` default to `False` so unverified values are not sent as valid measurements.

## Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```
Open `/docs` or `/portal`. Demo token is `dev-only-change-me`; change it even for local demos. This is not real authentication or authorization. Don't expose it publicly or enter real patient data.

## Android app
Install Flutter and Android SDK. In `mobile/`, run `flutter create .` if Android project scaffolding is absent, then merge `android/AndroidManifest.permissions.example.xml` into `android/app/src/main/AndroidManifest.xml`. Run `flutter pub get` and `flutter run`. Update `apiBaseUrl` in `lib/main.dart`: Android emulator commonly uses `http://10.0.2.2:8000`; a physical phone needs the laptop's LAN IP on the same trusted network. HTTP cleartext may require a debug-only network security configuration depending on Android target SDK; prefer HTTPS for any deployed system.

## Before production
Add proper patient/clinician auth and role-based authorization, TLS, encryption at rest, consent, audit logs, key management, retention/deletion, device provisioning, BLE bonding, secure firmware updates, offline durable buffering, threat modelling, and regulatory/privacy review. Validate sensor algorithms against reference equipment. The demo portal intentionally lacks clinician login.
