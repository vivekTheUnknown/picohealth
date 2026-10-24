"""Overview screens.

The administrative overview deliberately excludes patient measurements. An
administrator sees operational counts unless explicitly granted the narrow
clinical support permission.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends

from app.core.deps import AuthDep, DbDep, require_permissions
from app.core.enums import (
    DeviceStatus,
    EventStatus,
    Permission,
    Severity,
    UserStatus,
    VerificationStatus,
)
from app.models.clinical import Event
from app.models.devices import Device
from app.models.identity import AuditEvent, DoctorProfile, User
from app.models.patients import Patient, PatientDevice
from app.modules.patients import service as patient_service

router = APIRouter(tags=["dashboard"])

STALE_AFTER = timedelta(minutes=patient_service.DATA_FRESHNESS_MINUTES)
ACTIVE_EVENT_STATES = (EventStatus.NEW, EventStatus.ACKNOWLEDGED, EventStatus.UNDER_REVIEW)


def _now() -> datetime:
    return datetime.now(timezone.utc)


@router.get("/doctor/overview", dependencies=[Depends(require_permissions(Permission.PATIENTS_READ_ASSIGNED))])
def doctor_overview(ctx: AuthDep, db: DbDep) -> dict:
    from sqlalchemy import func, select

    ids = patient_service.assigned_patient_ids(db, ctx.user.id)
    if not ids:
        return {
            "patients_monitored": 0,
            "active_high_priority_events": 0,
            "patients_with_stale_data": 0,
            "devices_needing_attention": 0,
            "patients": [],
            "recent_events": [],
        }

    high_priority = int(
        db.scalar(
            select(func.count(Event.id)).where(
                Event.patient_id.in_(ids),
                Event.status.in_(ACTIVE_EVENT_STATES),
                Event.severity.in_([Severity.HIGH, Severity.CRITICAL]),
            )
        )
        or 0
    )

    items, _total = patient_service.list_for_doctor(
        db, ctx.user.id, search=None, limit=100, offset=0
    )

    now = _now()
    stale = 0
    for item in items:
        last = item["last_sync_at"]
        if last is None:
            stale += 1
        else:
            aware = last if last.tzinfo else last.replace(tzinfo=timezone.utc)
            if now - aware > STALE_AFTER:
                stale += 1

    # Sort so the most urgent patients lead, per the design's triage intent.
    severity_rank = {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}
    items.sort(
        key=lambda i: (i["active_event_count"] == 0, i["last_sync_at"] or 0),
    )

    recent = db.scalars(
        select(Event)
        .where(Event.patient_id.in_(ids))
        .order_by(Event.start_at.desc())
        .limit(10)
    ).all()

    device_attention = int(
        db.scalar(
            select(func.count(Device.id))
            .join(PatientDevice, PatientDevice.device_id == Device.id)
            .where(
                PatientDevice.patient_id.in_(ids),
                PatientDevice.unlinked_at.is_(None),
                Device.status.in_(
                    [DeviceStatus.FAULTY, DeviceStatus.LOST, DeviceStatus.UNDER_TEST]
                ),
            )
        )
        or 0
    )

    return {
        "patients_monitored": len(items),
        "active_high_priority_events": high_priority,
        "patients_with_stale_data": stale,
        "devices_needing_attention": device_attention,
        "patients": items,
        "recent_events": [
            {
                "id": str(e.id),
                "patient_id": str(e.patient_id),
                "event_type": e.event_type,
                "severity": e.severity,
                "status": e.status,
                "start_at": e.start_at.isoformat(),
            }
            for e in recent
        ],
        "generated_at": now.isoformat(),
    }


@router.get(
    "/admin/overview",
    dependencies=[Depends(require_permissions(Permission.PATIENTS_MANAGE))],
)
def admin_overview(db: DbDep) -> dict:
    from sqlalchemy import func, select

    now = _now()
    stale_cutoff = now - STALE_AFTER

    active_patients = int(
        db.scalar(select(func.count(Patient.id)).where(Patient.status == "active")) or 0
    )
    verified_doctors = int(
        db.scalar(
            select(func.count(DoctorProfile.id)).where(
                DoctorProfile.verification_status == VerificationStatus.VERIFIED
            )
        )
        or 0
    )
    registered_devices = int(db.scalar(select(func.count(Device.id))) or 0)
    devices_needing_attention = int(
        db.scalar(
            select(func.count(Device.id)).where(
                Device.status.in_([DeviceStatus.FAULTY, DeviceStatus.LOST])
            )
        )
        or 0
    )
    # "Sync failure" for the prototype: an active device that has never been
    # seen or has not reported recently.
    sync_failures = int(
        db.scalar(
            select(func.count(Device.id))
            .join(PatientDevice, PatientDevice.device_id == Device.id)
            .where(
                PatientDevice.unlinked_at.is_(None),
                (Device.last_seen_at.is_(None)) | (Device.last_seen_at < stale_cutoff),
            )
        )
        or 0
    )

    recent_changes = db.scalars(
        select(AuditEvent)
        .where(
            AuditEvent.action.in_(
                [
                    "users.invited",
                    "users.status_changed",
                    "users.roles_changed",
                    "devices.registered",
                    "devices.linked",
                    "assignments.created",
                ]
            )
        )
        .order_by(AuditEvent.timestamp.desc())
        .limit(10)
    ).all()

    return {
        "active_patients": active_patients,
        "verified_doctors": verified_doctors,
        "registered_devices": registered_devices,
        "devices_needing_attention": devices_needing_attention,
        "sync_failures": sync_failures,
        "recent_changes": [
            {
                "action": e.action,
                "target_type": e.target_type,
                "target_id": e.target_id,
                "timestamp": e.timestamp.isoformat(),
                "actor_user_id": str(e.actor_user_id) if e.actor_user_id else None,
            }
            for e in recent_changes
        ],
        "generated_at": now.isoformat(),
    }


@router.get(
    "/admin/system-health",
    dependencies=[Depends(require_permissions(Permission.MONITORING_CONFIG_READ))],
)
def system_health(db: DbDep) -> dict:
    from sqlalchemy import func, select, text

    db_ok = True
    try:
        db.execute(text("SELECT 1"))
    except Exception:  # pragma: no cover
        db_ok = False

    return {
        "database": "up" if db_ok else "down",
        "pending_users": int(
            db.scalar(select(func.count(User.id)).where(User.status == UserStatus.INVITED)) or 0
        ),
        "devices_stale": int(
            db.scalar(
                select(func.count(Device.id)).where(
                    (Device.last_seen_at.is_(None))
                    | (Device.last_seen_at < _now() - STALE_AFTER)
                )
            )
            or 0
        ),
        "generated_at": _now().isoformat(),
    }
