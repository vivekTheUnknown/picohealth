"""Patient queries and lifecycle rules."""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session as DbSession

from app.core.enums import AssignmentStatus, EventStatus, PatientStatus
from app.core.errors import APIError
from app.models.clinical import Event
from app.models.devices import Device
from app.models.patients import DoctorPatientAssignment, Patient, PatientDevice

# A measurement older than this is presented as stale rather than current.
DATA_FRESHNESS_MINUTES = 15


def _now() -> datetime:
    return datetime.now(UTC)


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def generate_patient_code() -> str:
    """Human-readable, non-sequential, non-guessable."""
    return "PT-" + secrets.token_hex(4).upper()


def create_patient(
    db: DbSession,
    *,
    display_name: str,
    patient_code: str | None,
    date_of_birth,
    sex_at_birth: str | None,
    created_by: uuid.UUID | None,
) -> Patient:
    code = (patient_code or generate_patient_code()).strip().upper()
    if db.scalar(select(Patient).where(Patient.patient_code == code)):
        raise APIError("duplicate_patient_code", "That patient code is already in use", 409)

    patient = Patient(
        patient_code=code,
        display_name=display_name.strip(),
        date_of_birth=date_of_birth,
        sex_at_birth=sex_at_birth,
        status=PatientStatus.ACTIVE,
        created_by=created_by,
    )
    db.add(patient)
    db.flush()
    return patient


def assigned_patient_ids(db: DbSession, doctor_user_id: uuid.UUID) -> list[uuid.UUID]:
    now = _now()
    rows = db.scalars(
        select(DoctorPatientAssignment).where(
            DoctorPatientAssignment.doctor_user_id == doctor_user_id,
            DoctorPatientAssignment.status == AssignmentStatus.ACTIVE,
        )
    ).all()
    return [
        row.patient_id
        for row in rows
        if _as_utc(row.starts_at) <= now
        and (row.ends_at is None or _as_utc(row.ends_at) > now)
    ]


def active_device_for_patient(db: DbSession, patient_id: uuid.UUID) -> Device | None:
    link = db.scalar(
        select(PatientDevice)
        .where(PatientDevice.patient_id == patient_id, PatientDevice.unlinked_at.is_(None))
        .order_by(PatientDevice.linked_at.desc())
    )
    if link is None:
        return None
    return db.get(Device, link.device_id)


def active_event_count(db: DbSession, patient_id: uuid.UUID) -> int:
    return int(
        db.scalar(
            select(func.count(Event.id)).where(
                Event.patient_id == patient_id,
                Event.status.in_(
                    [EventStatus.NEW, EventStatus.ACKNOWLEDGED, EventStatus.UNDER_REVIEW]
                ),
            )
        )
        or 0
    )


def latest_event_for(db: DbSession, patient_id: uuid.UUID) -> Event | None:
    """Most recent event for a patient row, whatever its state.

    Resolved and false-positive events are included on purpose: the row should
    show that the last event is closed, not imply nothing was ever detected.
    """
    return db.scalar(
        select(Event)
        .where(Event.patient_id == patient_id)
        .order_by(Event.start_at.desc())
        .limit(1)
    )


def freshness_label(last_seen: datetime | None) -> str:
    if last_seen is None:
        return "unknown"
    age_minutes = (_now() - _as_utc(last_seen)).total_seconds() / 60
    if age_minutes <= DATA_FRESHNESS_MINUTES:
        return "fresh"
    return "stale"


def list_for_doctor(
    db: DbSession,
    doctor_user_id: uuid.UUID,
    *,
    search: str | None,
    limit: int,
    offset: int,
) -> tuple[list[dict], int]:
    """Only patients with an active assignment. Never the full patient table."""
    ids = assigned_patient_ids(db, doctor_user_id)
    if not ids:
        return [], 0

    stmt = select(Patient).where(Patient.id.in_(ids))
    if search:
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(Patient.display_name.ilike(pattern), Patient.patient_code.ilike(pattern))
        )

    total = int(
        db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    )
    patients = db.scalars(
        stmt.order_by(Patient.display_name).limit(limit).offset(offset)
    ).all()

    items = []
    for patient in patients:
        device = active_device_for_patient(db, patient.id)
        latest = latest_event_for(db, patient.id)
        items.append(
            {
                "id": patient.id,
                "patient_code": patient.patient_code,
                "display_name": patient.display_name,
                "status": patient.status,
                "last_sync_at": device.last_seen_at if device else None,
                "active_event_count": active_event_count(db, patient.id),
                "device_status": device.status if device else None,
                "latest_event": (
                    {
                        "id": latest.id,
                        "patient_id": latest.patient_id,
                        "event_type": latest.event_type,
                        "severity": latest.severity,
                        "status": latest.status,
                        "start_at": latest.start_at,
                    }
                    if latest
                    else None
                ),
            }
        )
    return items, total
