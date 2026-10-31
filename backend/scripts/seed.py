"""Account provisioning seed.

Creates only real accounts and the links they need. No patients, devices,
measurements or events are invented: measurements appear only when the mobile
app syncs them.

Idempotent. Refuses to run in production.

Environment overrides:
    SEED_ADMIN_EMAIL, SEED_DOCTOR_EMAIL, SEED_PATIENT_EMAIL
    SEED_PASSWORD          (admin and doctor)
    SEED_PATIENT_PASSWORD  (patient)
"""

from __future__ import annotations

import os
import sys
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.enums import (
    AssignmentStatus,
    AssignmentType,
    PatientStatus,
    Role,
    UserStatus,
    VerificationStatus,
)
from app.core.security import hash_password
from app.models.devices import Device
from app.models.identity import DoctorProfile, PatientProfile, User, UserRole
from app.models.patients import DoctorPatientAssignment, Patient

ADMIN_EMAIL = os.environ.get("SEED_ADMIN_EMAIL", "admin@example.com")
DOCTOR_EMAIL = os.environ.get("SEED_DOCTOR_EMAIL", "doctor@example.com")
PATIENT_EMAIL = os.environ.get("SEED_PATIENT_EMAIL", "kode.vivek.sai@example.com")
SEED_PASSWORD = os.environ.get("SEED_PASSWORD", "dev-password-change-me")
PATIENT_PASSWORD = os.environ.get("SEED_PATIENT_PASSWORD", "kodeviveksai")

PATIENT_NAME = "kode vivek sai"
PATIENT_CODE = "PT-KVS-0001"


def _ensure_user(
    db,
    *,
    email: str,
    name: str,
    role: Role,
    password: str,
) -> User:
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(
            email=email,
            display_name=name,
            password_hash=hash_password(password),
            status=UserStatus.ACTIVE,
        )
        db.add(user)
        db.flush()
    else:
        user.display_name = name
        user.status = UserStatus.ACTIVE
        if not user.password_hash:
            user.password_hash = hash_password(password)

    has_role = db.scalar(
        select(UserRole).where(
            UserRole.user_id == user.id,
            UserRole.role == role,
            UserRole.revoked_at.is_(None),
        )
    )
    if has_role is None:
        db.add(UserRole(user_id=user.id, role=role, granted_by=user.id))
    return user


def _ensure_patient(db, *, name: str, code: str, created_by) -> Patient:
    patient = db.scalar(select(Patient).where(Patient.patient_code == code))
    if patient is None:
        patient = Patient(
            patient_code=code,
            display_name=name,
            status=PatientStatus.ACTIVE,
            created_by=created_by,
        )
        db.add(patient)
        db.flush()
    else:
        patient.display_name = name
    return patient


def _remove_previous_demo_rows(db) -> None:
    """Delete rows created by the old synthetic seed.

    The old script inserted three fabricated patients, devices, 24 hours of
    measurements and two events. They are removed so the portal never presents
    synthetic clinical data as real.
    """
    demo_patients = db.scalars(
        select(Patient).where(Patient.patient_code.in_(["PT-1001", "PT-1002", "PT-1003"]))
    ).all()
    for patient in demo_patients:
        db.delete(patient)

    demo_devices = db.scalars(
        select(Device).where(Device.hardware_identifier.in_(["PICO-1001", "PICO-1002", "PICO-1003"]))
    ).all()
    for device in demo_devices:
        db.delete(device)

    demo_doctor = db.scalar(select(User).where(User.email == "unassigned@example.com"))
    if demo_doctor is not None:
        db.delete(demo_doctor)

    if demo_patients or demo_devices or demo_doctor:
        print(
            f"Removed old synthetic seed: {len(demo_patients)} patients, "
            f"{len(demo_devices)} devices."
        )


def main() -> int:
    if settings.is_production:
        print("Refusing to seed a production database.", file=sys.stderr)
        return 1

    with SessionLocal() as db:
        _remove_previous_demo_rows(db)

        admin = _ensure_user(
            db, email=ADMIN_EMAIL, name="Portal Administrator", role=Role.ADMIN,
            password=SEED_PASSWORD,
        )
        doctor = _ensure_user(
            db, email=DOCTOR_EMAIL, name="Dr. Portal", role=Role.DOCTOR,
            password=SEED_PASSWORD,
        )
        patient_user = _ensure_user(
            db, email=PATIENT_EMAIL, name=PATIENT_NAME, role=Role.PATIENT,
            password=PATIENT_PASSWORD,
        )

        if db.scalar(select(DoctorProfile).where(DoctorProfile.user_id == doctor.id)) is None:
            db.add(
                DoctorProfile(
                    user_id=doctor.id,
                    verification_status=VerificationStatus.VERIFIED,
                    professional_title="Clinician",
                )
            )

        patient = _ensure_patient(
            db, name=PATIENT_NAME, code=PATIENT_CODE, created_by=admin.id
        )

        link = db.scalar(
            select(PatientProfile).where(PatientProfile.user_id == patient_user.id)
        )
        if link is None:
            db.add(PatientProfile(user_id=patient_user.id, patient_id=patient.id))
        else:
            link.patient_id = patient.id

        assignment = db.scalar(
            select(DoctorPatientAssignment).where(
                DoctorPatientAssignment.doctor_user_id == doctor.id,
                DoctorPatientAssignment.patient_id == patient.id,
                DoctorPatientAssignment.status == AssignmentStatus.ACTIVE,
            )
        )
        if assignment is None:
            db.add(
                DoctorPatientAssignment(
                    doctor_user_id=doctor.id,
                    patient_id=patient.id,
                    assignment_type=AssignmentType.PRIMARY,
                    status=AssignmentStatus.ACTIVE,
                    starts_at=datetime.now(UTC) - timedelta(days=1),
                    created_by=admin.id,
                )
            )

        db.commit()

    print("Seed complete (accounts only, no clinical data).")
    print(f"  admin   : {ADMIN_EMAIL} / {SEED_PASSWORD}")
    print(f"  doctor  : {DOCTOR_EMAIL} / {SEED_PASSWORD}")
    print(f"  patient : {PATIENT_EMAIL} / {PATIENT_PASSWORD}")
    print(f"            or sign in by name: {PATIENT_NAME}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
