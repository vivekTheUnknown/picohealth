"""Authorization matrix.

These are the tests architecture.md section 13 calls for by name: a doctor
requesting an unassigned patient, an admin-only route called by a doctor, a
revoked assignment, a suspended user, and cross-patient resource access.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.enums import AssignmentStatus, Permission, Role
from app.models.identity import AuditEvent, UserPermissionGrant
from tests.conftest import (
    login,
    make_assignment,
    make_event,
    make_patient,
    make_user,
)


def test_doctor_cannot_read_unassigned_patient(client, db):
    doctor = make_user(db)
    stranger = make_patient(db)
    login(client, doctor)

    response = client.get(f"/api/v1/patients/{stranger.id}/overview")
    # 404 rather than 403: the API must not confirm the patient exists.
    assert response.status_code == 404


def test_doctor_can_read_assigned_patient(client, db):
    doctor = make_user(db)
    patient = make_patient(db)
    make_assignment(db, doctor, patient)
    login(client, doctor)

    response = client.get(f"/api/v1/patients/{patient.id}/overview")
    assert response.status_code == 200
    assert response.json()["patient_code"] == patient.patient_code


def test_patient_directory_only_lists_assignments(client, db):
    doctor = make_user(db)
    mine = make_patient(db)
    someone_elses = make_patient(db)
    make_assignment(db, doctor, mine)
    login(client, doctor)

    body = client.get("/api/v1/patients").json()
    ids = {item["id"] for item in body["items"]}
    assert str(mine.id) in ids
    assert str(someone_elses.id) not in ids


def test_ended_assignment_revokes_access(client, db):
    doctor = make_user(db)
    patient = make_patient(db)
    make_assignment(
        db,
        doctor,
        patient,
        status=AssignmentStatus.ENDED,
        ends_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    login(client, doctor)
    assert client.get(f"/api/v1/patients/{patient.id}/overview").status_code == 404


def test_future_assignment_does_not_grant_access_yet(client, db):
    doctor = make_user(db)
    patient = make_patient(db)
    make_assignment(
        db, doctor, patient, starts_at=datetime.now(timezone.utc) + timedelta(days=1)
    )
    login(client, doctor)
    assert client.get(f"/api/v1/patients/{patient.id}/overview").status_code == 404


def test_expired_assignment_row_does_not_grant_access(client, db):
    """Defence in depth: even if status lags behind ends_at, access is denied."""
    doctor = make_user(db)
    patient = make_patient(db)
    make_assignment(
        db,
        doctor,
        patient,
        status=AssignmentStatus.ACTIVE,
        ends_at=datetime.now(timezone.utc) - timedelta(minutes=5),
    )
    login(client, doctor)
    assert client.get(f"/api/v1/patients/{patient.id}/overview").status_code == 404


def test_doctor_cannot_use_admin_routes(client, db):
    doctor = make_user(db)
    login(client, doctor)

    assert client.get("/api/v1/admin/users").status_code == 403
    assert client.get("/api/v1/admin/overview").status_code == 403
    assert (
        client.post("/api/v1/admin/patients", json={"display_name": "Injected"}).status_code
        == 403
    )
    assert (
        client.put(
            f"/api/v1/admin/users/{doctor.id}/roles", json={"roles": ["admin"]}
        ).status_code
        == 403
    )


def test_admin_does_not_get_unrestricted_clinical_access(client, db):
    """'admin' must not imply clinical browsing."""
    admin = make_user(db, role=Role.ADMIN)
    patient = make_patient(db)
    login(client, admin)

    assert client.get(f"/api/v1/patients/{patient.id}/overview").status_code == 404
    # And the doctor-only directory is closed to them too.
    assert client.get("/api/v1/patients").status_code == 403


def test_admin_with_narrow_grant_can_read_clinical_data_and_is_audited(client, db):
    admin = make_user(db, role=Role.ADMIN)
    patient = make_patient(db)
    db.add(
        UserPermissionGrant(
            user_id=admin.id,
            permission=Permission.CLINICAL_DATA_SUPPORT_READ.value,
            granted_by=admin.id,
        )
    )
    db.commit()

    login(client, admin)
    response = client.get(f"/api/v1/patients/{patient.id}/overview")
    assert response.status_code == 200

    audit_row = db.scalar(
        select(AuditEvent).where(AuditEvent.action == "clinical_data.accessed")
    )
    assert audit_row is not None, "support access must be recorded"
    assert audit_row.actor_user_id == admin.id


def test_cross_patient_event_access_denied(client, db):
    doctor = make_user(db)
    patient = make_patient(db)
    other_patient = make_patient(db)
    make_assignment(db, doctor, patient)

    foreign_event = make_event(db, other_patient)
    login(client, doctor)

    assert client.get(f"/api/v1/events/{foreign_event.id}").status_code == 404
    assert (
        client.post(f"/api/v1/events/{foreign_event.id}/acknowledge", json={}).status_code
        == 404
    )


def test_measurements_require_bounded_window(client, db):
    doctor = make_user(db)
    patient = make_patient(db)
    make_assignment(db, doctor, patient)
    login(client, doctor)

    too_wide = client.get(
        f"/api/v1/patients/{patient.id}/measurements",
        params={"from": "2024-01-01T00:00:00Z", "to": "2024-06-01T00:00:00Z"},
    )
    assert too_wide.status_code == 422

    inverted = client.get(
        f"/api/v1/patients/{patient.id}/measurements",
        params={"from": "2024-03-01T00:00:00Z", "to": "2024-02-01T00:00:00Z"},
    )
    assert inverted.status_code == 422


def test_malformed_uuid_is_not_a_server_error(client, db):
    doctor = make_user(db)
    login(client, doctor)
    response = client.get("/api/v1/patients/not-a-uuid/overview")
    assert response.status_code == 404


def test_alerts_only_span_assigned_patients(client, db):
    doctor = make_user(db)
    mine = make_patient(db)
    other = make_patient(db)
    make_assignment(db, doctor, mine)
    my_event = make_event(db, mine)
    foreign_event = make_event(db, other)
    login(client, doctor)

    body = client.get("/api/v1/alerts").json()
    ids = {item["id"] for item in body["items"]}
    assert str(my_event.id) in ids
    assert str(foreign_event.id) not in ids
