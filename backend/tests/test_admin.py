"""Administrative workflows: invitation, onboarding, device linkage."""

from __future__ import annotations

from app.core.enums import Role, UserStatus
from app.models.identity import User
from tests.conftest import (
    login,
    make_device,
    make_patient,
    make_user,
)


def test_invitation_acceptance_creates_working_account(client, db):
    admin = make_user(db, role=Role.ADMIN)
    login(client, admin)

    response = client.post(
        "/api/v1/admin/users/invitations",
        json={"email": "newdoc@example.com", "role": "doctor"},
    )
    assert response.status_code == 201
    token = response.json()["invitation_token"]

    invited = db.query(User).filter(User.email == "newdoc@example.com").one()
    assert invited.status == UserStatus.INVITED
    assert invited.password_hash is None

    fresh = client.__class__(client.app)
    accept = fresh.post(
        "/api/v1/auth/accept-invitation",
        json={
            "token": token,
            "display_name": "Dr. New",
            "password": "a-long-enough-password",
        },
    )
    assert accept.status_code == 200

    sign_in = fresh.post(
        "/api/v1/auth/login",
        json={"email": "newdoc@example.com", "password": "a-long-enough-password"},
    )
    assert sign_in.status_code == 200
    assert "doctor" in sign_in.json()["roles"]


def test_invitation_token_is_single_use(client, db):
    admin = make_user(db, role=Role.ADMIN)
    login(client, admin)
    token = client.post(
        "/api/v1/admin/users/invitations",
        json={"email": "once@example.com", "role": "doctor"},
    ).json()["invitation_token"]

    payload = {
        "token": token,
        "display_name": "Once",
        "password": "a-long-enough-password",
    }
    assert client.post("/api/v1/auth/accept-invitation", json=payload).status_code == 200
    assert client.post("/api/v1/auth/accept-invitation", json=payload).status_code == 400


def test_admin_cannot_suspend_self(client, db):
    admin = make_user(db, role=Role.ADMIN)
    login(client, admin)
    response = client.patch(
        f"/api/v1/admin/users/{admin.id}/status", json={"status": "suspended"}
    )
    assert response.status_code == 409


def test_role_change_revokes_sessions(client, db):
    admin = make_user(db, role=Role.ADMIN)
    doctor = make_user(db)
    doctor_client = client.__class__(client.app)
    login(doctor_client, doctor)
    assert doctor_client.get("/api/v1/me").status_code == 200

    login(client, admin)
    response = client.put(
        f"/api/v1/admin/users/{doctor.id}/roles", json={"roles": ["doctor", "admin"]}
    )
    assert response.status_code == 200

    # Privilege changed, so existing sessions are invalidated.
    assert doctor_client.get("/api/v1/me").status_code == 401


def test_admin_cannot_remove_own_admin_role(client, db):
    admin = make_user(db, role=Role.ADMIN)
    login(client, admin)
    response = client.put(
        f"/api/v1/admin/users/{admin.id}/roles", json={"roles": ["doctor"]}
    )
    assert response.status_code == 403


def test_device_cannot_be_linked_to_two_patients(client, db):
    admin = make_user(db, role=Role.ADMIN)
    first = make_patient(db)
    second = make_patient(db)
    device = make_device(db, first)
    login(client, admin)

    response = client.post(
        f"/api/v1/admin/devices/{device.id}/link", json={"patient_id": str(second.id)}
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "device_already_linked"


def test_device_unlink_preserves_history(client, db):
    admin = make_user(db, role=Role.ADMIN)
    patient = make_patient(db)
    device = make_device(db, patient)
    login(client, admin)

    assert client.post(f"/api/v1/admin/devices/{device.id}/unlink").status_code == 200

    from app.models.patients import PatientDevice

    links = db.query(PatientDevice).filter(PatientDevice.device_id == device.id).all()
    assert len(links) == 1
    assert links[0].unlinked_at is not None


def test_duplicate_active_assignment_rejected(client, db):
    admin = make_user(db, role=Role.ADMIN)
    doctor = make_user(db)
    patient = make_patient(db)
    login(client, admin)

    payload = {"doctor_user_id": str(doctor.id), "patient_id": str(patient.id)}
    assert client.post("/api/v1/admin/assignments", json=payload).status_code == 201
    duplicate = client.post("/api/v1/admin/assignments", json=payload)
    assert duplicate.status_code == 409


def test_cannot_assign_a_non_doctor(client, db):
    admin = make_user(db, role=Role.ADMIN)
    another_admin = make_user(db, role=Role.ADMIN)
    patient = make_patient(db)
    login(client, admin)

    response = client.post(
        "/api/v1/admin/assignments",
        json={"doctor_user_id": str(another_admin.id), "patient_id": str(patient.id)},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_doctor"


def test_admin_overview_excludes_patient_measurements(client, db):
    admin = make_user(db, role=Role.ADMIN)
    make_patient(db)
    login(client, admin)

    body = client.get("/api/v1/admin/overview").json()
    assert "active_patients" in body
    # No clinical values in the administrative default view.
    assert "measurements" not in body
    assert "patients" not in body
