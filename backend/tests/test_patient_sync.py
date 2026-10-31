"""Patient self-service, direct app sync, and clinician read access."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.core.enums import Role
from app.models.identity import PatientProfile
from tests.conftest import (
    PASSWORD,
    login,
    make_assignment,
    make_patient,
    make_user,
)


def make_patient_account(db, *, name: str = "kode vivek sai"):
    user = make_user(db, role=Role.PATIENT, email=f"patient-{uuid.uuid4().hex[:6]}@example.com")
    user.display_name = name
    patient = make_patient(db)
    db.add(PatientProfile(user_id=user.id, patient_id=patient.id))
    db.commit()
    return user, patient


def bearer(client, identifier: str, password: str = PASSWORD) -> str:
    response = client.post(
        "/api/v1/auth/token", json={"identifier": identifier, "password": password}
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def record_payload(client_record_id: str = "m-1", **overrides):
    payload = {
        "client_record_id": client_record_id,
        "measured_at": datetime.now(UTC).isoformat(),
        "device_hardware_id": "PicoHealth-DEV",
        "device_firmware": "1.2.0",
        "algorithm_version": "max3010x-app-v2",
        "signal_quality": "measurement_valid",
        "heart_rate_bpm": 72.0,
        "spo2_percent": 97.0,
        "temperature_c": 31.4,
        "perfusion_index_percent": 0.05,
        "prv_rmssd_ms": 31.2,
        "prv_beats": 42,
        "activity_level": "still",
        "activity_rms_g": 0.006,
        "orientation_class": "face_down",
        "extra": {"dc_level": 77000, "ac_amplitude": 29, "roll": -1.2},
    }
    payload.update(overrides)
    return payload


def test_patient_login_by_display_name_and_token_auth(client, db):
    user, patient = make_patient_account(db)

    response = client.post(
        "/api/v1/auth/login",
        json={"identifier": user.display_name, "password": PASSWORD},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["patient_id"] == str(patient.id)
    assert body["roles"] == ["patient"]
    assert "patient_self:read" in body["permissions"]
    assert "patients:read_assigned" not in body["permissions"]

    token_body = client.post(
        "/api/v1/auth/token",
        json={"identifier": user.display_name, "password": PASSWORD},
    ).json()
    assert token_body["token_type"] == "bearer"
    assert token_body["me"]["patient_id"] == str(patient.id)

    # Bearer only: no session cookie needed.
    client.cookies.clear()
    me = client.get(
        "/api/v1/me", headers={"Authorization": f"Bearer {token_body['access_token']}"}
    )
    assert me.status_code == 200
    assert me.json()["display_name"] == user.display_name


def test_token_login_rejects_wrong_password(client, db):
    user, _patient = make_patient_account(db)
    response = client.post(
        "/api/v1/auth/token",
        json={"identifier": user.display_name, "password": "wrong-password"},
    )
    assert response.status_code == 401


def test_patient_sync_is_authenticated_and_idempotent(client, db):
    user, patient = make_patient_account(db)
    token = bearer(client, user.display_name)
    headers = {"Authorization": f"Bearer {token}"}

    # Bearer POST needs no CSRF token.
    first = client.post(
        "/api/v1/patient/records", json={"records": [record_payload("m-1")]}, headers=headers
    )
    assert first.status_code == 201, first.text
    assert first.json() == {
        "accepted": 1,
        "duplicates": 0,
        "total": 1,
        "latest_measured_at": first.json()["latest_measured_at"],
    }

    again = client.post(
        "/api/v1/patient/records", json={"records": [record_payload("m-1")]}, headers=headers
    )
    assert again.json()["accepted"] == 0
    assert again.json()["duplicates"] == 1

    rows = client.get("/api/v1/patient/records", headers=headers).json()
    assert len(rows) == 1
    row = rows[0]
    assert row["patient_id"] == str(patient.id)
    # Every app metric is preserved end to end.
    assert row["heart_rate_bpm"] == 72.0
    assert row["spo2_percent"] == 97.0
    assert row["temperature_c"] == 31.4
    assert row["perfusion_index_percent"] == 0.05
    assert row["prv_rmssd_ms"] == 31.2
    assert row["prv_beats"] == 42
    assert row["activity_level"] == "still"
    assert row["activity_rms_g"] == 0.006
    assert row["orientation_class"] == "face_down"
    assert row["signal_quality"] == "measurement_valid"
    assert row["algorithm_version"] == "max3010x-app-v2"
    assert row["extra"]["dc_level"] == 77000
    assert row["device_hardware_id"] == "PicoHealth-DEV"


def test_patient_overview_reports_latest_and_device(client, db):
    user, patient = make_patient_account(db)
    token = bearer(client, user.display_name)
    headers = {"Authorization": f"Bearer {token}"}

    assert client.get("/api/v1/patient/me", headers=headers).json()["record_count"] == 0

    client.post(
        "/api/v1/patient/records",
        json={"records": [record_payload("m-a"), record_payload("m-b")]},
        headers=headers,
    )
    body = client.get("/api/v1/patient/me", headers=headers).json()
    assert body["id"] == str(patient.id)
    assert body["record_count"] == 2
    assert body["latest_record"]["client_record_id"] in {"m-a", "m-b"}
    assert body["device"]["hardware_identifier"] == "PicoHealth-DEV"

    devices = client.get("/api/v1/patient/devices", headers=headers).json()
    assert len(devices) == 1
    assert devices[0]["hardware_identifier"] == "PicoHealth-DEV"


def test_patient_cannot_reach_another_patient(client, db):
    user, patient = make_patient_account(db)
    other = make_patient(db, code="PT-OTHER")
    token = bearer(client, user.display_name)
    headers = {"Authorization": f"Bearer {token}"}

    assert client.get(f"/api/v1/patients/{other.id}/records", headers=headers).status_code == 404
    # Patient routes never accept a patient id at all.
    assert client.get("/api/v1/patients", headers=headers).status_code == 403


def test_assigned_doctor_reads_synced_records_and_unassigned_does_not(client, db):
    patient_user, patient = make_patient_account(db)
    token = bearer(client, patient_user.display_name)
    client.post(
        "/api/v1/patient/records",
        json={"records": [record_payload("m-doctor")]},
        headers={"Authorization": f"Bearer {token}"},
    )

    assigned = make_user(db, role=Role.DOCTOR, email="assigned@example.com")
    make_assignment(db, assigned, patient)
    login(client, assigned)

    rows = client.get(f"/api/v1/patients/{patient.id}/records").json()
    assert len(rows) == 1
    assert rows[0]["client_record_id"] == "m-doctor"
    assert rows[0]["perfusion_index_percent"] == 0.05

    unassigned = make_user(db, role=Role.DOCTOR, email="unassigned2@example.com")
    login(client, unassigned)
    # 404, not 403: the API does not confirm the patient exists.
    assert client.get(f"/api/v1/patients/{patient.id}/records").status_code == 404


def test_patient_cannot_write_to_a_clinician_route(client, db):
    user, patient = make_patient_account(db)
    token = bearer(client, user.display_name)
    response = client.post(
        "/api/v1/patient/records",
        json={"records": [record_payload("m-x")]},
        headers={"Authorization": f"Bearer {token}", "X-CSRF-Token": "irrelevant"},
    )
    assert response.status_code == 201

    # A patient token cannot use the doctor-facing measurement write surface
    # (there is none) or read another patient.
    other = make_patient(db, code="PT-THIRD")
    denied = client.get(
        f"/api/v1/patients/{other.id}/measurements",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert denied.status_code == 404


def test_record_clock_skew_is_tolerated(client, db):
    """A phone clock a minute ahead must not hide its own record."""
    from datetime import timedelta

    user, _patient = make_patient_account(db)
    token = bearer(client, user.display_name)
    headers = {"Authorization": f"Bearer {token}"}
    ahead = (datetime.now(UTC) + timedelta(minutes=2)).isoformat()

    client.post(
        "/api/v1/patient/records",
        json={"records": [record_payload("m-future", measured_at=ahead)]},
        headers=headers,
    )
    rows = client.get("/api/v1/patient/records", headers=headers).json()
    assert [row["client_record_id"] for row in rows] == ["m-future"]


def test_device_cannot_be_claimed_by_two_patients(client, db):
    first_user, _first_patient = make_patient_account(db, name="first patient")
    second_user, _second_patient = make_patient_account(db, name="second patient")

    first_token = bearer(client, first_user.display_name)
    second_token = bearer(client, second_user.display_name)

    assert client.post(
        "/api/v1/patient/records",
        json={"records": [record_payload("m-first")]},
        headers={"Authorization": f"Bearer {first_token}"},
    ).status_code == 201

    response = client.post(
        "/api/v1/patient/records",
        json={"records": [record_payload("m-second")]},
        headers={"Authorization": f"Bearer {second_token}"},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "device_in_use"


def test_high_perfusion_index_is_accepted(client, db):
    """A weak contact can produce PI > 100; the app's value must not 422."""
    user, _patient = make_patient_account(db)
    token = bearer(client, user.display_name)
    response = client.post(
        "/api/v1/patient/records",
        json={"records": [record_payload("m-high-pi", perfusion_index_percent=421.5)]},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201, response.text
    rows = client.get(
        "/api/v1/patient/records", headers={"Authorization": f"Bearer {token}"}
    ).json()
    assert rows[0]["perfusion_index_percent"] == 421.5
