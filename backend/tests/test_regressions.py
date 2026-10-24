"""Regression tests for bugs found in review.

Each of these failed before the fix it names.
"""

from __future__ import annotations

from app.core.enums import Permission, Role
from app.models.identity import UserPermissionGrant
from tests.conftest import login, make_assignment, make_patient, make_user


def test_admin_can_grant_clinical_support_permission_via_api(client, db):
    """The grant endpoint previously referenced an unimported `select`."""
    admin = make_user(db, role=Role.ADMIN)
    target = make_user(db, role=Role.ADMIN)
    patient = make_patient(db)
    login(client, admin)

    response = client.put(
        f"/api/v1/admin/users/{target.id}/permissions",
        json={"permissions": [Permission.CLINICAL_DATA_SUPPORT_READ.value]},
    )
    assert response.status_code == 200, response.text

    grant = db.query(UserPermissionGrant).filter_by(user_id=target.id).one()
    assert grant.permission == Permission.CLINICAL_DATA_SUPPORT_READ

    # The grant is real: it survives into the effective permission set.
    login(client, target)
    assert (
        client.get(f"/api/v1/patients/{patient.id}/overview").status_code == 200
    )


def test_granting_permissions_revokes_existing_sessions(client, db):
    admin = make_user(db, role=Role.ADMIN)
    target = make_user(db, role=Role.ADMIN)
    target_client = client.__class__(client.app)
    login(target_client, target)
    assert target_client.get("/api/v1/me").status_code == 200

    login(client, admin)
    client.put(
        f"/api/v1/admin/users/{target.id}/permissions",
        json={"permissions": [Permission.CLINICAL_DATA_SUPPORT_READ.value]},
    )
    assert target_client.get("/api/v1/me").status_code == 401


def test_overview_handles_patient_without_a_device(client, db):
    """Sorting previously compared a datetime against 0 and crashed."""
    doctor = make_user(db)
    with_device = make_patient(db)
    without_device = make_patient(db)
    make_assignment(db, doctor, with_device)
    make_assignment(db, doctor, without_device)

    from tests.conftest import make_device

    make_device(db, with_device)
    login(client, doctor)

    response = client.get("/api/v1/doctor/overview")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["patients_monitored"] == 2
    # A patient with no device has unknown freshness and counts as stale.
    assert body["patients_with_stale_data"] >= 1
