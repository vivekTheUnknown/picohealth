"""Resource-level authorization.

The rule both specification documents repeat: a permission check alone is not
enough. This module is the single place that answers "may *this* caller touch
*this* patient?" so the answer cannot drift between routes.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.core.enums import (
    AssignmentStatus,
    Permission,
    Role,
    UserStatus,
    VerificationStatus,
)
from app.core.errors import forbidden, not_found, unauthorized
from app.models.identity import User
from app.models.patients import DoctorPatientAssignment, Patient


@dataclass(frozen=True)
class AuthContext:
    """Everything an endpoint may rely on about the caller."""

    user: User
    session_id: uuid.UUID
    roles: frozenset[Role]
    permissions: frozenset[Permission]

    def has(self, permission: Permission) -> bool:
        return permission in self.permissions


def assert_permission(ctx: AuthContext, permission: Permission) -> None:
    if permission not in ctx.permissions:
        raise forbidden(f"Missing required permission: {permission.value}")


def assert_any_permission(ctx: AuthContext, *permissions: Permission) -> None:
    if not any(p in ctx.permissions for p in permissions):
        joined = ", ".join(p.value for p in permissions)
        raise forbidden(f"Missing required permission: one of {joined}")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def doctor_has_active_assignment(
    db: DbSession, doctor_user_id: uuid.UUID, patient_id: uuid.UUID
) -> bool:
    now = _now()
    rows = db.scalars(
        select(DoctorPatientAssignment).where(
            DoctorPatientAssignment.doctor_user_id == doctor_user_id,
            DoctorPatientAssignment.patient_id == patient_id,
            DoctorPatientAssignment.status == AssignmentStatus.ACTIVE,
        )
    ).all()

    for row in rows:
        if _as_utc(row.starts_at) > now:
            continue
        if row.ends_at is not None and _as_utc(row.ends_at) <= now:
            continue
        return True
    return False


def require_patient_access(
    db: DbSession,
    ctx: AuthContext,
    patient_id: uuid.UUID,
    *,
    permission: Permission = Permission.PATIENTS_READ_ASSIGNED,
) -> Patient:
    """Resolve a patient the caller is allowed to see.

    Two independent paths grant access:

    1. Clinician: holds the required permission *and* has an active assignment.
    2. Administrative support: holds the explicitly granted
       `clinical_data:support_read` permission. The calling route audits this.

    When neither path applies, the response is 404 rather than 403 so the API
    does not confirm that an unassigned patient exists. That is a deliberate
    information-leakage decision and is asserted in the test suite.
    """
    patient = db.get(Patient, patient_id)
    if patient is None:
        raise not_found("Patient")

    if Role.DOCTOR in ctx.roles:
        if not ctx.has(permission):
            raise forbidden(f"Missing required permission: {permission.value}")
        if doctor_has_active_assignment(db, ctx.user.id, patient.id):
            return patient
        raise not_found("Patient")

    # Non-clinicians need the narrow, explicitly granted support permission.
    if ctx.has(Permission.CLINICAL_DATA_SUPPORT_READ):
        return patient

    raise not_found("Patient")


def ensure_account_usable(user: User) -> None:
    """Gate every authenticated request on account status."""
    if user.status == UserStatus.SUSPENDED:
        raise unauthorized("This account has been suspended")
    if user.status == UserStatus.DEACTIVATED:
        raise unauthorized("This account is no longer active")
    if user.status != UserStatus.ACTIVE:
        raise unauthorized("This account has not completed activation")


def is_verified_doctor(user: User) -> bool:
    profile = user.doctor_profile
    return bool(profile and profile.verification_status == VerificationStatus.VERIFIED)
