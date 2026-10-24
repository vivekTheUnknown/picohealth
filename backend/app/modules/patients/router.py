"""Patient routes.

Two surfaces with different rules:
- `/patients`    doctor-facing, assignment-scoped
- `/admin/patients` administrative management
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.core import audit
from app.core.authz import require_patient_access
from app.core.deps import AuthDep, DbDep, MetaDep, parse_uuid, require_permissions
from app.core.enums import AssignmentStatus, Permission, Role
from app.core.errors import not_found
from app.core.pagination import Page, PageDep
from app.models.patients import DoctorPatientAssignment, Patient
from app.modules.patients import service
from app.modules.patients.schemas import (
    PatientCreate,
    PatientListItem,
    PatientOverview,
    PatientResponse,
    PatientUpdate,
)

doctor_router = APIRouter(tags=["patients"])
admin_router = APIRouter(tags=["admin:patients"])


@doctor_router.get("/patients", response_model=Page[PatientListItem])
def list_assigned_patients(
    ctx: AuthDep,
    db: DbDep,
    page: PageDep,
    search: str | None = Query(default=None, max_length=100),
) -> Page[PatientListItem]:
    if Role.DOCTOR not in ctx.roles:
        from app.core.errors import forbidden

        raise forbidden("This endpoint is for assigned clinicians")

    items, total = service.list_for_doctor(
        db, ctx.user.id, search=search, limit=page.limit, offset=page.offset
    )
    return Page[PatientListItem](
        items=[PatientListItem(**item) for item in items],
        total=total,
        limit=page.limit,
        offset=page.offset,
    )


@doctor_router.get("/patients/{patient_id}/overview", response_model=PatientOverview)
def patient_overview(
    patient_id: str,
    ctx: AuthDep,
    db: DbDep,
    meta: MetaDep,
) -> PatientOverview:
    pid = parse_uuid(patient_id)
    # Raises 404 if no active assignment (or no narrow admin grant).
    patient = require_patient_access(db, ctx, pid)

    device = service.active_device_for_patient(db, patient.id)
    assignment = db.query(DoctorPatientAssignment).filter(
        DoctorPatientAssignment.doctor_user_id == ctx.user.id,
        DoctorPatientAssignment.patient_id == patient.id,
        DoctorPatientAssignment.status == AssignmentStatus.ACTIVE,
    ).first()

    # Admins reaching clinical content through the narrow support permission
    # are audited. Clinician access is covered by assignment records instead.
    if Role.DOCTOR not in ctx.roles:
        audit.record(
            db,
            action="clinical_data.accessed",
            actor_user_id=ctx.user.id,
            target_type="patient",
            target_id=patient.id,
            ip_address=meta.ip_address,
            request_id=meta.request_id,
            context={"reason": "support_read"},
        )
        db.commit()

    return PatientOverview(
        id=patient.id,
        patient_code=patient.patient_code,
        display_name=patient.display_name,
        date_of_birth=patient.date_of_birth,
        sex_at_birth=patient.sex_at_birth,
        status=patient.status,
        assignment_type=assignment.assignment_type if assignment else None,
        device_status=device.status if device else None,
        device_last_seen_at=device.last_seen_at if device else None,
        active_event_count=service.active_event_count(db, patient.id),
        data_freshness=service.freshness_label(device.last_seen_at if device else None),
    )


@admin_router.get(
    "/admin/patients",
    response_model=Page[PatientResponse],
    dependencies=[Depends(require_permissions(Permission.PATIENTS_MANAGE))],
)
def admin_list_patients(
    db: DbDep,
    page: PageDep,
    search: str | None = Query(default=None, max_length=100),
) -> Page[PatientResponse]:
    from sqlalchemy import func, or_, select

    stmt = select(Patient)
    if search:
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(Patient.display_name.ilike(pattern), Patient.patient_code.ilike(pattern))
        )
    total = int(db.scalar(select(func.count()).select_from(stmt.subquery())) or 0)
    rows = db.scalars(
        stmt.order_by(Patient.display_name).limit(page.limit).offset(page.offset)
    ).all()
    return Page[PatientResponse](
        items=[PatientResponse.model_validate(p) for p in rows],
        total=total,
        limit=page.limit,
        offset=page.offset,
    )


@admin_router.post(
    "/admin/patients",
    response_model=PatientResponse,
    status_code=201,
    dependencies=[Depends(require_permissions(Permission.PATIENTS_MANAGE))],
)
def admin_create_patient(
    payload: PatientCreate, ctx: AuthDep, db: DbDep, meta: MetaDep
) -> PatientResponse:
    patient = service.create_patient(
        db,
        display_name=payload.display_name,
        patient_code=payload.patient_code,
        date_of_birth=payload.date_of_birth,
        sex_at_birth=payload.sex_at_birth,
        created_by=ctx.user.id,
    )
    audit.record(
        db,
        action="patients.created",
        actor_user_id=ctx.user.id,
        target_type="patient",
        target_id=patient.id,
        ip_address=meta.ip_address,
        request_id=meta.request_id,
    )
    db.commit()
    return PatientResponse.model_validate(patient)


@admin_router.patch(
    "/admin/patients/{patient_id}",
    response_model=PatientResponse,
    dependencies=[Depends(require_permissions(Permission.PATIENTS_MANAGE))],
)
def admin_update_patient(
    patient_id: str, payload: PatientUpdate, ctx: AuthDep, db: DbDep, meta: MetaDep
) -> PatientResponse:
    patient = db.get(Patient, parse_uuid(patient_id))
    if patient is None:
        raise not_found("Patient")

    changed = payload.model_dump(exclude_unset=True)
    for field, value in changed.items():
        setattr(patient, field, value)

    audit.record(
        db,
        action="patients.updated",
        actor_user_id=ctx.user.id,
        target_type="patient",
        target_id=patient.id,
        ip_address=meta.ip_address,
        request_id=meta.request_id,
        context={"fields": sorted(changed)},
    )
    db.commit()
    return PatientResponse.model_validate(patient)
