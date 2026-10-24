"""Device registry, linkage rules, and monitoring profiles."""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field

from app.core import audit
from app.core.deps import AuthDep, DbDep, MetaDep, parse_uuid, require_permissions
from app.core.enums import DeviceStatus, Permission
from app.core.errors import APIError, not_found
from app.core.pagination import Page, PageDep
from app.models.base import utcnow
from app.models.devices import Device
from app.models.patients import Patient, PatientDevice

router = APIRouter(tags=["admin:devices"])

manage = require_permissions(Permission.DEVICES_MANAGE)


class DeviceCreate(BaseModel):
    hardware_identifier: str = Field(min_length=1, max_length=120)
    hardware_revision: str | None = Field(default=None, max_length=40)
    firmware_version: str | None = Field(default=None, max_length=40)


class DeviceUpdate(BaseModel):
    hardware_revision: str | None = Field(default=None, max_length=40)
    firmware_version: str | None = Field(default=None, max_length=40)
    status: DeviceStatus | None = None


class DeviceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    hardware_identifier: str
    hardware_revision: str | None
    firmware_version: str | None
    status: DeviceStatus
    last_seen_at: datetime | None
    battery_level: int | None
    # Domain name for the shared created_at column.
    registered_at: datetime = Field(validation_alias="created_at")


class LinkRequest(BaseModel):
    patient_id: uuid.UUID


def _device_response(device: Device) -> DeviceResponse:
    return DeviceResponse.model_validate(device)


@router.get(
    "/admin/devices",
    response_model=Page[DeviceResponse],
    dependencies=[Depends(require_permissions(Permission.DEVICES_READ))],
)
def list_devices(
    db: DbDep,
    page: PageDep,
    search: str | None = Query(default=None, max_length=100),
    status_filter: DeviceStatus | None = Query(default=None, alias="status"),
) -> Page[DeviceResponse]:
    from sqlalchemy import func, select

    stmt = select(Device)
    if search:
        stmt = stmt.where(Device.hardware_identifier.ilike(f"%{search.strip()}%"))
    if status_filter:
        stmt = stmt.where(Device.status == status_filter)

    total = int(db.scalar(select(func.count()).select_from(stmt.subquery())) or 0)
    rows = db.scalars(
        stmt.order_by(Device.created_at.desc()).limit(page.limit).offset(page.offset)
    ).all()
    return Page[DeviceResponse](
        items=[_device_response(d) for d in rows],
        total=total,
        limit=page.limit,
        offset=page.offset,
    )


@router.post(
    "/admin/devices", response_model=DeviceResponse, status_code=201, dependencies=[Depends(manage)]
)
def register_device(
    payload: DeviceCreate, ctx: AuthDep, db: DbDep, meta: MetaDep
) -> DeviceResponse:
    from sqlalchemy import select

    identifier = payload.hardware_identifier.strip()
    if db.scalar(select(Device).where(Device.hardware_identifier == identifier)):
        raise APIError("duplicate_device", "That hardware identifier is already registered", 409)

    device = Device(
        hardware_identifier=identifier,
        hardware_revision=payload.hardware_revision,
        firmware_version=payload.firmware_version,
        status=DeviceStatus.REGISTERED,
        registered_by=ctx.user.id,
    )
    db.add(device)
    audit.record(
        db,
        action="devices.registered",
        actor_user_id=ctx.user.id,
        target_type="device",
        target_id=device.id,
        ip_address=meta.ip_address,
        request_id=meta.request_id,
    )
    db.commit()
    return _device_response(device)


@router.patch(
    "/admin/devices/{device_id}",
    response_model=DeviceResponse,
    dependencies=[Depends(manage)],
)
def update_device(
    device_id: str, payload: DeviceUpdate, ctx: AuthDep, db: DbDep, meta: MetaDep
) -> DeviceResponse:
    device = db.get(Device, parse_uuid(device_id))
    if device is None:
        raise not_found("Device")

    changed = payload.model_dump(exclude_unset=True)
    for field, value in changed.items():
        setattr(device, field, value)

    audit.record(
        db,
        action="devices.updated",
        actor_user_id=ctx.user.id,
        target_type="device",
        target_id=device.id,
        ip_address=meta.ip_address,
        request_id=meta.request_id,
        context={"fields": sorted(changed)},
    )
    db.commit()
    return _device_response(device)


@router.post(
    "/admin/devices/{device_id}/link",
    response_model=DeviceResponse,
    dependencies=[Depends(manage)],
)
def link_device(
    device_id: str, payload: LinkRequest, ctx: AuthDep, db: DbDep, meta: MetaDep
) -> DeviceResponse:
    from sqlalchemy import select

    device = db.get(Device, parse_uuid(device_id))
    if device is None:
        raise not_found("Device")
    patient = db.get(Patient, payload.patient_id)
    if patient is None:
        raise not_found("Patient")

    # A device may serve only one patient at a time.
    existing = db.scalar(
        select(PatientDevice).where(
            PatientDevice.device_id == device.id, PatientDevice.unlinked_at.is_(None)
        )
    )
    if existing is not None and existing.patient_id != patient.id:
        raise APIError(
            "device_already_linked",
            "This device is currently linked to another patient",
            409,
        )

    db.add(
        PatientDevice(
            patient_id=patient.id,
            device_id=device.id,
            linked_at=utcnow(),
            linked_by=ctx.user.id,
        )
    )
    device.status = DeviceStatus.ACTIVE

    audit.record(
        db,
        action="devices.linked",
        actor_user_id=ctx.user.id,
        target_type="device",
        target_id=device.id,
        ip_address=meta.ip_address,
        request_id=meta.request_id,
        context={"patient_id": str(patient.id)},
    )
    db.commit()
    return _device_response(device)


@router.post(
    "/admin/devices/{device_id}/unlink",
    response_model=DeviceResponse,
    dependencies=[Depends(manage)],
)
def unlink_device(
    device_id: str, ctx: AuthDep, db: DbDep, meta: MetaDep
) -> DeviceResponse:
    from sqlalchemy import select

    device = db.get(Device, parse_uuid(device_id))
    if device is None:
        raise not_found("Device")

    link = db.scalar(
        select(PatientDevice).where(
            PatientDevice.device_id == device.id, PatientDevice.unlinked_at.is_(None)
        )
    )
    if link is None:
        raise APIError("not_linked", "This device is not linked to a patient", 409)

    # History is preserved; the row is closed, not deleted.
    link.unlinked_at = utcnow()
    device.status = DeviceStatus.REGISTERED

    audit.record(
        db,
        action="devices.unlinked",
        actor_user_id=ctx.user.id,
        target_type="device",
        target_id=device.id,
        ip_address=meta.ip_address,
        request_id=meta.request_id,
        context={"patient_id": str(link.patient_id)},
    )
    db.commit()
    return _device_response(device)
