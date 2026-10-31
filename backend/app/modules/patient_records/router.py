"""Direct ingestion and reading of processed app measurements.

Signal conversion, quality gating and derived metrics all happen on the phone.
This module accepts the published snapshot, stores it idempotently, and serves
it back to the patient and to the clinicians assigned to them.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict, Field

from app.core.authz import require_patient_access, require_self_patient
from app.core.deps import AuthDep, DbDep, parse_uuid
from app.core.enums import DeviceStatus, PatientStatus, Permission
from app.core.errors import APIError, validation_error
from app.models.clinical import AppMeasurementRecord
from app.models.devices import Device
from app.models.patients import Patient, PatientDevice

router = APIRouter(tags=["patient"])

DEFAULT_WINDOW = timedelta(days=7)
MAX_WINDOW = timedelta(days=90)
# Device clocks drift. Without a small forward tolerance a record stamped a
# minute ahead of the server would stay invisible until wall-clock time caught
# up, which looks like data loss.
CLOCK_SKEW = timedelta(minutes=5)


class AppRecordIn(BaseModel):
    """One processed snapshot exactly as the phone computed it."""

    client_record_id: str = Field(min_length=1, max_length=120)
    measured_at: datetime
    device_hardware_id: str | None = Field(default=None, max_length=120)
    device_firmware: str | None = Field(default=None, max_length=40)
    algorithm_version: str | None = Field(default=None, max_length=40)
    signal_quality: str | None = Field(default=None, max_length=40)
    heart_rate_bpm: float | None = Field(default=None, ge=0, le=300)
    spo2_percent: float | None = Field(default=None, ge=0, le=100)
    temperature_c: float | None = Field(default=None, ge=-40, le=85)
    # PI is 100 x AC/DC. It can exceed 100 on a weak, noisy contact, and the
    # phone is the authority on what it computed; store it rather than reject
    # the whole batch.
    perfusion_index_percent: float | None = Field(default=None, ge=0, le=10_000)
    prv_rmssd_ms: float | None = Field(default=None, ge=0, le=5000)
    prv_beats: int | None = Field(default=None, ge=0, le=1000)
    activity_level: str | None = Field(default=None, max_length=40)
    activity_rms_g: float | None = Field(default=None, ge=0, le=20)
    orientation_class: str | None = Field(default=None, max_length=40)
    # Raw counts, angles, statuses, uptime: anything the app displays beyond the
    # first-class metric columns. Stored verbatim so the portal can render it.
    extra: dict[str, Any] | None = None


class AppRecordBatchIn(BaseModel):
    records: list[AppRecordIn] = Field(min_length=1, max_length=120)


class AppRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    client_record_id: str
    patient_id: uuid.UUID
    device_id: uuid.UUID | None
    device_hardware_id: str | None
    measured_at: datetime
    received_at: datetime
    algorithm_version: str | None
    signal_quality: str | None
    heart_rate_bpm: float | None
    spo2_percent: float | None
    temperature_c: float | None
    perfusion_index_percent: float | None
    prv_rmssd_ms: float | None
    prv_beats: int | None
    activity_level: str | None
    activity_rms_g: float | None
    orientation_class: str | None
    extra: dict[str, Any] | None


class AppRecordBatchOut(BaseModel):
    accepted: int
    duplicates: int
    total: int
    latest_measured_at: datetime | None = None


class PatientDeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    hardware_identifier: str
    firmware_version: str | None
    status: str
    last_seen_at: datetime | None
    linked_at: datetime


class PatientSelfOut(BaseModel):
    id: uuid.UUID
    patient_code: str
    display_name: str
    status: PatientStatus
    latest_record: AppRecordOut | None = None
    record_count: int = 0
    device: PatientDeviceOut | None = None


def _now() -> datetime:
    return datetime.now(UTC)


def _device_for(db, record: AppMeasurementRecord) -> Device | None:
    if record.device_id is None:
        return None
    return db.get(Device, record.device_id)


def record_out(db, record: AppMeasurementRecord) -> AppRecordOut:
    device = _device_for(db, record)
    return AppRecordOut(
        id=record.id,
        client_record_id=record.client_record_id,
        patient_id=record.patient_id,
        device_id=record.device_id,
        device_hardware_id=device.hardware_identifier if device else None,
        measured_at=record.measured_at,
        received_at=record.received_at,
        algorithm_version=record.algorithm_version,
        signal_quality=record.signal_quality,
        heart_rate_bpm=record.heart_rate_bpm,
        spo2_percent=record.spo2_percent,
        temperature_c=record.temperature_c,
        perfusion_index_percent=record.perfusion_index_percent,
        prv_rmssd_ms=record.prv_rmssd_ms,
        prv_beats=record.prv_beats,
        activity_level=record.activity_level,
        activity_rms_g=record.activity_rms_g,
        orientation_class=record.orientation_class,
        extra=record.extra,
    )


def ensure_device_link(
    db,
    *,
    patient: Patient,
    hardware_identifier: str | None,
    firmware: str | None,
    seen_at: datetime,
) -> Device | None:
    """Register the physical device on first contact and keep the link current.

    The hardware identifier is the device name advertised over BLE. No device
    row is invented: it exists because a real device sent a record.
    """
    identifier = (hardware_identifier or "").strip()[:120]
    if not identifier:
        return None

    device = db.query(Device).filter(Device.hardware_identifier == identifier).first()
    if device is None:
        device = Device(
            hardware_identifier=identifier,
            firmware_version=(firmware or None),
            status=DeviceStatus.ACTIVE,
            last_seen_at=seen_at,
        )
        db.add(device)
        db.flush()
    else:
        # A hardware identifier is not a secret. Do not let one patient claim a
        # device that is currently linked to someone else.
        other_link = db.query(PatientDevice).filter(
            PatientDevice.device_id == device.id,
            PatientDevice.unlinked_at.is_(None),
            PatientDevice.patient_id != patient.id,
        ).first()
        if other_link is not None:
            raise APIError(
                "device_in_use",
                "This device is linked to another patient",
                409,
            )
        device.last_seen_at = seen_at
        if firmware:
            device.firmware_version = firmware[:40]
        if device.status == DeviceStatus.REGISTERED:
            device.status = DeviceStatus.ACTIVE

    link = db.query(PatientDevice).filter(
        PatientDevice.patient_id == patient.id,
        PatientDevice.device_id == device.id,
        PatientDevice.unlinked_at.is_(None),
    ).first()
    if link is None:
        db.add(
            PatientDevice(
                patient_id=patient.id,
                device_id=device.id,
                linked_at=seen_at,
            )
        )
        db.flush()

    return device


def ingest_records(db, *, patient: Patient, items: list[AppRecordIn]) -> AppRecordBatchOut:
    accepted = 0
    duplicates = 0
    latest: datetime | None = None

    for item in items:
        exists = db.query(AppMeasurementRecord.id).filter(
            AppMeasurementRecord.client_record_id == item.client_record_id
        ).first()
        if exists is not None:
            duplicates += 1
            continue

        device = ensure_device_link(
            db,
            patient=patient,
            hardware_identifier=item.device_hardware_id,
            firmware=item.device_firmware,
            seen_at=item.measured_at,
        )
        db.add(
            AppMeasurementRecord(
                patient_id=patient.id,
                device_id=device.id if device else None,
                client_record_id=item.client_record_id,
                measured_at=item.measured_at,
                received_at=_now(),
                algorithm_version=item.algorithm_version,
                signal_quality=item.signal_quality,
                heart_rate_bpm=item.heart_rate_bpm,
                spo2_percent=item.spo2_percent,
                temperature_c=item.temperature_c,
                perfusion_index_percent=item.perfusion_index_percent,
                prv_rmssd_ms=item.prv_rmssd_ms,
                prv_beats=item.prv_beats,
                activity_level=item.activity_level,
                activity_rms_g=item.activity_rms_g,
                orientation_class=item.orientation_class,
                extra=item.extra,
            )
        )
        accepted += 1
        if latest is None or item.measured_at > latest:
            latest = item.measured_at

    return AppRecordBatchOut(
        accepted=accepted,
        duplicates=duplicates,
        total=len(items),
        latest_measured_at=latest,
    )


def _window(from_ts: datetime | None, to_ts: datetime | None) -> tuple[datetime, datetime]:
    end = to_ts or (_now() + CLOCK_SKEW)
    start = from_ts or (end - DEFAULT_WINDOW)
    if start >= end:
        raise validation_error("'from' must be earlier than 'to'")
    if (end - start) > MAX_WINDOW:
        raise validation_error("Requested window exceeds the 90 day maximum")
    return start, end


def list_records(
    db,
    *,
    patient_id: uuid.UUID,
    from_ts: datetime | None,
    to_ts: datetime | None,
    limit: int,
) -> list[AppRecordOut]:
    start, end = _window(from_ts, to_ts)
    rows = (
        db.query(AppMeasurementRecord)
        .filter(
            AppMeasurementRecord.patient_id == patient_id,
            AppMeasurementRecord.measured_at >= start,
            AppMeasurementRecord.measured_at <= end,
        )
        .order_by(AppMeasurementRecord.measured_at.desc())
        .limit(limit)
        .all()
    )
    return [record_out(db, row) for row in rows]


def latest_record(db, patient_id: uuid.UUID) -> AppMeasurementRecord | None:
    return (
        db.query(AppMeasurementRecord)
        .filter(AppMeasurementRecord.patient_id == patient_id)
        .order_by(AppMeasurementRecord.measured_at.desc())
        .first()
    )


def record_count(db, patient_id: uuid.UUID) -> int:
    return int(
        db.query(AppMeasurementRecord)
        .filter(AppMeasurementRecord.patient_id == patient_id)
        .count()
    )


def active_device(db, patient_id: uuid.UUID) -> PatientDeviceOut | None:
    link = (
        db.query(PatientDevice)
        .filter(
            PatientDevice.patient_id == patient_id,
            PatientDevice.unlinked_at.is_(None),
        )
        .order_by(PatientDevice.linked_at.desc())
        .first()
    )
    if link is None:
        return None
    device = db.get(Device, link.device_id)
    if device is None:
        return None
    return PatientDeviceOut(
        id=device.id,
        hardware_identifier=device.hardware_identifier,
        firmware_version=device.firmware_version,
        status=device.status.value if hasattr(device.status, "value") else str(device.status),
        last_seen_at=device.last_seen_at,
        linked_at=link.linked_at,
    )


@router.get("/patient/me", response_model=PatientSelfOut)
def my_patient_record(ctx: AuthDep, db: DbDep) -> PatientSelfOut:
    patient = require_self_patient(db, ctx)
    latest = latest_record(db, patient.id)
    return PatientSelfOut(
        id=patient.id,
        patient_code=patient.patient_code,
        display_name=patient.display_name,
        status=patient.status,
        latest_record=record_out(db, latest) if latest else None,
        record_count=record_count(db, patient.id),
        device=active_device(db, patient.id),
    )


@router.get("/patient/devices", response_model=list[PatientDeviceOut])
def my_devices(ctx: AuthDep, db: DbDep) -> list[PatientDeviceOut]:
    patient = require_self_patient(db, ctx)
    rows = (
        db.query(PatientDevice)
        .filter(PatientDevice.patient_id == patient.id)
        .order_by(PatientDevice.linked_at.desc())
        .all()
    )
    out: list[PatientDeviceOut] = []
    for link in rows:
        device = db.get(Device, link.device_id)
        if device is None:
            continue
        out.append(
            PatientDeviceOut(
                id=device.id,
                hardware_identifier=device.hardware_identifier,
                firmware_version=device.firmware_version,
                status=(
                    device.status.value if hasattr(device.status, "value") else str(device.status)
                ),
                last_seen_at=device.last_seen_at,
                linked_at=link.linked_at,
            )
        )
    return out


@router.get("/patient/records", response_model=list[AppRecordOut])
def my_records(
    ctx: AuthDep,
    db: DbDep,
    from_ts: datetime | None = Query(default=None, alias="from"),
    to_ts: datetime | None = Query(default=None, alias="to"),
    limit: int = Query(default=500, ge=1, le=2000),
) -> list[AppRecordOut]:
    patient = require_self_patient(db, ctx)
    return list_records(
        db, patient_id=patient.id, from_ts=from_ts, to_ts=to_ts, limit=limit
    )


@router.post("/patient/records", response_model=AppRecordBatchOut, status_code=201)
def sync_records(
    payload: AppRecordBatchIn,
    ctx: AuthDep,
    db: DbDep,
) -> AppRecordBatchOut:
    patient = require_self_patient(
        db, ctx, permission=Permission.PATIENT_SELF_WRITE
    )
    result = ingest_records(db, patient=patient, items=payload.records)
    db.commit()
    return result


@router.get("/patients/{patient_id}/records", response_model=list[AppRecordOut])
def patient_records(
    patient_id: str,
    ctx: AuthDep,
    db: DbDep,
    from_ts: datetime | None = Query(default=None, alias="from"),
    to_ts: datetime | None = Query(default=None, alias="to"),
    limit: int = Query(default=500, ge=1, le=2000),
) -> list[AppRecordOut]:
    patient = require_patient_access(db, ctx, parse_uuid(patient_id))
    return list_records(
        db, patient_id=patient.id, from_ts=from_ts, to_ts=to_ts, limit=limit
    )
