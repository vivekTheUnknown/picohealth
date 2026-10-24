"""Doctor-patient assignment management.

Access is computed from these rows on every request, so ending an assignment
revokes clinical access immediately without touching cached state.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict

from app.core import audit
from app.core.deps import AuthDep, DbDep, MetaDep, require_permissions
from app.core.enums import AssignmentStatus, AssignmentType, Permission, Role, UserStatus
from app.core.errors import APIError, not_found
from app.core.pagination import Page, PageDep
from app.models.base import utcnow
from app.models.identity import User
from app.models.patients import DoctorPatientAssignment, Patient

router = APIRouter(tags=["admin:assignments"])

manage = require_permissions(Permission.ASSIGNMENTS_MANAGE)


class AssignmentCreate(BaseModel):
    doctor_user_id: uuid.UUID
    patient_id: uuid.UUID
    assignment_type: AssignmentType = AssignmentType.PRIMARY
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class AssignmentUpdate(BaseModel):
    assignment_type: AssignmentType | None = None
    ends_at: datetime | None = None


class AssignmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    doctor_user_id: uuid.UUID
    doctor_display_name: str | None = None
    patient_id: uuid.UUID
    patient_display_name: str | None = None
    assignment_type: AssignmentType
    status: AssignmentStatus
    starts_at: datetime
    ends_at: datetime | None


@router.get(
    "/admin/assignments",
    response_model=Page[AssignmentResponse],
    dependencies=[Depends(manage)],
)
def list_assignments(
    db: DbDep,
    page: PageDep,
    doctor_user_id: uuid.UUID | None = Query(default=None),
    patient_id: uuid.UUID | None = Query(default=None),
    status_filter: AssignmentStatus | None = Query(default=None, alias="status"),
) -> Page[AssignmentResponse]:
    from sqlalchemy import func, select

    stmt = select(DoctorPatientAssignment)
    if doctor_user_id:
        stmt = stmt.where(DoctorPatientAssignment.doctor_user_id == doctor_user_id)
    if patient_id:
        stmt = stmt.where(DoctorPatientAssignment.patient_id == patient_id)
    if status_filter:
        stmt = stmt.where(DoctorPatientAssignment.status == status_filter)

    total = int(db.scalar(select(func.count()).select_from(stmt.subquery())) or 0)
    rows = db.scalars(
        stmt.order_by(DoctorPatientAssignment.starts_at.desc())
        .limit(page.limit)
        .offset(page.offset)
    ).all()

    doctors = {
        u.id: u.display_name
        for u in db.scalars(
            select(User).where(User.id.in_({r.doctor_user_id for r in rows}))
        ).all()
    }
    patients = {
        p.id: p.display_name
        for p in db.scalars(
            select(Patient).where(Patient.id.in_({r.patient_id for r in rows}))
        ).all()
    }

    items = []
    for row in rows:
        item = AssignmentResponse.model_validate(row)
        item.doctor_display_name = doctors.get(row.doctor_user_id)
        item.patient_display_name = patients.get(row.patient_id)
        items.append(item)

    return Page[AssignmentResponse](
        items=items, total=total, limit=page.limit, offset=page.offset
    )


@router.post(
    "/admin/assignments",
    response_model=AssignmentResponse,
    status_code=201,
    dependencies=[Depends(manage)],
)
def create_assignment(
    payload: AssignmentCreate, ctx: AuthDep, db: DbDep, meta: MetaDep
) -> AssignmentResponse:
    from sqlalchemy import select

    doctor = db.get(User, payload.doctor_user_id)
    if doctor is None or Role.DOCTOR not in doctor.active_roles():
        raise APIError("invalid_doctor", "The selected user is not an active doctor", 422)
    if doctor.status != UserStatus.ACTIVE:
        raise APIError("invalid_doctor", "The selected doctor account is not active", 422)

    patient = db.get(Patient, payload.patient_id)
    if patient is None:
        raise not_found("Patient")

    starts_at = payload.starts_at or utcnow()
    if payload.ends_at is not None and payload.ends_at <= starts_at:
        raise APIError("invalid_window", "ends_at must be after starts_at", 422)

    # Duplicate active assignment is a data-quality problem, not a new record.
    existing = db.scalar(
        select(DoctorPatientAssignment).where(
            DoctorPatientAssignment.doctor_user_id == doctor.id,
            DoctorPatientAssignment.patient_id == patient.id,
            DoctorPatientAssignment.status == AssignmentStatus.ACTIVE,
        )
    )
    if existing is not None:
        raise APIError("already_assigned", "This doctor is already assigned to this patient", 409)

    assignment = DoctorPatientAssignment(
        doctor_user_id=doctor.id,
        patient_id=patient.id,
        assignment_type=payload.assignment_type,
        status=AssignmentStatus.ACTIVE,
        starts_at=starts_at,
        ends_at=payload.ends_at,
        created_by=ctx.user.id,
    )
    db.add(assignment)
    audit.record(
        db,
        action="assignments.created",
        actor_user_id=ctx.user.id,
        target_type="patient",
        target_id=patient.id,
        ip_address=meta.ip_address,
        request_id=meta.request_id,
        context={"doctor_user_id": str(doctor.id)},
    )
    db.commit()

    response = AssignmentResponse.model_validate(assignment)
    response.doctor_display_name = doctor.display_name
    response.patient_display_name = patient.display_name
    return response


@router.patch(
    "/admin/assignments/{assignment_id}",
    response_model=AssignmentResponse,
    dependencies=[Depends(manage)],
)
def update_assignment(
    assignment_id: str, payload: AssignmentUpdate, ctx: AuthDep, db: DbDep, meta: MetaDep
) -> AssignmentResponse:
    from app.core.deps import parse_uuid

    assignment = db.get(DoctorPatientAssignment, parse_uuid(assignment_id))
    if assignment is None:
        raise not_found("Assignment")

    if payload.assignment_type is not None:
        assignment.assignment_type = payload.assignment_type
    if payload.ends_at is not None:
        if payload.ends_at <= assignment.starts_at:
            raise APIError("invalid_window", "ends_at must be after starts_at", 422)
        assignment.ends_at = payload.ends_at
        assignment.status = AssignmentStatus.ENDED

    audit.record(
        db,
        action="assignments.updated",
        actor_user_id=ctx.user.id,
        target_type="patient",
        target_id=assignment.patient_id,
        ip_address=meta.ip_address,
        request_id=meta.request_id,
        context={"status": assignment.status.value},
    )
    db.commit()
    return AssignmentResponse.model_validate(assignment)
