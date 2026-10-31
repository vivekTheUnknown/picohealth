# App → portal sync

The mobile app is the only producer of measurements. It converts the three
sensor streams, applies the quality state machine, derives the extra metrics,
and posts the resulting snapshot directly to the portal. The server stores what
the app published and never recomputes a clinical value.

## Authentication

`POST /api/v1/auth/token` accepts an email address or an exact display name:

```json
{ "identifier": "kode vivek sai", "password": "…" }
```

It returns an opaque bearer token plus the account identity:

```json
{
  "access_token": "…",
  "token_type": "bearer",
  "expires_in": 3600,
  "me": { "roles": ["patient"], "patient_id": "…" }
}
```

The token is the same server-side session value the browser receives in its
HttpOnly cookie. It is revoked, expired and slid identically. The app stores it
in the platform keystore (`expo-secure-store`), not in plain settings, and sends
`Authorization: Bearer <token>`. Bearer requests are exempt from the CSRF check
because they carry no ambient cookie credential.

A patient account can reach exactly one patient record: the one in
`patient_profiles`. Patient routes never accept a patient id from the client.

## Ingestion

`POST /api/v1/patient/records`

```json
{
  "records": [
    {
      "client_record_id": "m_mvvsx9xi_3y",
      "measured_at": "2026-10-31T02:48:15.750Z",
      "device_hardware_id": "PicoHealth-DEV",
      "algorithm_version": "max3010x-app-v3",
      "signal_quality": "measurement_valid",
      "heart_rate_bpm": 72,
      "spo2_percent": 97,
      "temperature_c": 31.38,
      "perfusion_index_percent": 0.05,
      "prv_rmssd_ms": 31.2,
      "prv_beats": 42,
      "activity_level": "still",
      "activity_rms_g": 0.006,
      "orientation_class": "face_down",
      "extra": {
        "red_raw": 76100,
        "ir_raw": 77020,
        "accel_g": [-0.02, 0.01, -0.97],
        "gyro_dps": [0.1, 0, 0],
        "lateral_g": [0.01, 0, 0],
        "roll_deg": -1.2,
        "pitch_deg": 0.6,
        "yaw_deg": 0
      }
    }
  ]
}
```

- Batches are limited to 120 records.
- `client_record_id` is unique in the database, so retries are idempotent. The
  response reports `accepted`, `duplicates` and `total`.
- A record is stored with the app's own validity state. The server does not
  fill in a missing heart rate or SpO₂.
- The first record from a hardware identifier registers that device and links
  it to the patient. No device row is seeded.
- A hardware identifier already linked to another patient is rejected with
  `409 device_in_use`; a device name is not treated as a credential.
- `extra` preserves raw counts, sensor statuses, orientation angles and any
  future field the app adds.
- The read window tolerates five minutes of clock skew so a phone a little
  ahead of the server is not hidden as "future" data.

## Reading

| Endpoint | Caller | Scope |
|---|---|---|
| `GET /api/v1/patient/me` | patient | own record, latest snapshot, device, count |
| `GET /api/v1/patient/records` | patient | own records, bounded window |
| `GET /api/v1/patient/devices` | patient | own linked devices |
| `GET /api/v1/patients/{id}/records` | doctor/admin support | active assignment required |

The doctor route returns 404 for an unassigned patient, matching the rest of the
API: it does not confirm that the patient exists.

## What the portal shows

Every value the app displays is available to the portal:

- heart rate and SpO₂ with independent validity;
- perfusion index;
- PPG-derived PRV (RMSSD) and accepted-beat count;
- skin temperature and its five-minute trend;
- movement intensity and dynamic RMS;
- device orientation plus roll, pitch and yaw;
- optical state, raw red/IR counts, sample count;
- acceleration, gyroscope, lateral acceleration;
- device uptime, sequence, sensor statuses;
- algorithm version, device identifier and both timestamps.

## No seeded clinical data

`scripts/seed.py` creates accounts only: an administrator, a clinician, and the
patient login linked to one patient record. It does not create devices,
measurements or events. The old synthetic rows (`PT-1001`…`PT-1003`,
`PICO-1001`…`PICO-1003`, their measurements and events, and the unassigned demo
doctor) are removed if present.
