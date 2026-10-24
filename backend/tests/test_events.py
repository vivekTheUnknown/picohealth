"""Alert lifecycle: history is preserved, never overwritten."""

from __future__ import annotations

from sqlalchemy import select

from app.models.clinical import AlertTransition, Event
from app.models.identity import AuditEvent
from tests.conftest import login, make_assignment, make_event, make_patient, make_user


def _setup(db):
    doctor = make_user(db)
    patient = make_patient(db)
    make_assignment(db, doctor, patient)
    event = make_event(db, patient)
    return doctor, patient, event


def test_acknowledge_records_transition_and_audit(client, db):
    doctor, patient, event = _setup(db)
    login(client, doctor)

    response = client.post(
        f"/api/v1/events/{event.id}/acknowledge", json={"note": "Reviewing now"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "acknowledged"
    assert len(body["transitions"]) == 1
    assert body["transitions"][0]["prior_status"] == "new"
    assert body["transitions"][0]["new_status"] == "acknowledged"
    assert body["transitions"][0]["actor_user_id"] == str(doctor.id)

    audit_row = db.scalar(
        select(AuditEvent).where(AuditEvent.action == "alerts.acknowledged")
    )
    assert audit_row is not None


def test_resolve_after_acknowledge_keeps_full_history(client, db):
    doctor, patient, event = _setup(db)
    login(client, doctor)

    client.post(f"/api/v1/events/{event.id}/acknowledge", json={})
    response = client.post(f"/api/v1/events/{event.id}/resolve", json={"note": "Resolved"})
    assert response.status_code == 200

    db.expire_all()
    stored = db.get(Event, event.id)
    assert stored is not None, "resolving must not delete the event"
    assert stored.status.value == "resolved"

    transitions = db.scalars(
        select(AlertTransition)
        .where(AlertTransition.event_id == event.id)
        .order_by(AlertTransition.timestamp)
    ).all()
    assert [t.new_status for t in transitions] == ["acknowledged", "resolved"]


def test_cannot_acknowledge_twice(client, db):
    doctor, patient, event = _setup(db)
    login(client, doctor)

    assert client.post(f"/api/v1/events/{event.id}/acknowledge", json={}).status_code == 200
    second = client.post(f"/api/v1/events/{event.id}/acknowledge", json={})
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "invalid_transition"


def test_terminal_event_cannot_be_reopened(client, db):
    doctor, patient, event = _setup(db)
    login(client, doctor)

    client.post(f"/api/v1/events/{event.id}/resolve", json={})
    response = client.post(f"/api/v1/events/{event.id}/acknowledge", json={})
    assert response.status_code == 409


def test_event_detail_exposes_rule_provenance(client, db):
    """Evidence-before-interpretation: the trigger must be inspectable."""
    doctor, patient, event = _setup(db)
    login(client, doctor)

    body = client.get(f"/api/v1/events/{event.id}").json()
    assert body["rule_version"] == "rules-1.0.0"
    assert body["source"] == "rule"
    assert body["evidence"] == {"threshold_bpm": 120}
