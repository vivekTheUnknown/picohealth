"""Development seed data.

Refuses to run in production. All data is synthetic. Passwords come from the
environment or fall back to clearly-marked development values.
"""

from __future__ import annotations

import os
import random
import sys
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.enums import (
    AssignmentStatus,
    AssignmentType,
    DeviceStatus,
    EventStatus,
    MetricType,
    PatientStatus,
    QualityStatus,
    Role,
    Severity,
    SourceType,
    UserStatus,
    VerificationStatus,
)
from app.core.security import hash_password
from app.models.clinical import Event, MeasurementSummary
from app.models.devices import Device
from app.models.identity import DoctorProfile, User, UserRole
from app.models.patients import DoctorPatientAssignment, Patient, PatientDevice

ADMIN_EMAIL = os.environ.get("SEED_ADMIN_EMAIL", "admin@example.com")
DOCTOR_EMAIL = os.environ.get("SEED_DOCTOR_EMAIL", "doctor@example.com")
SEED_PASSWORD = os.environ.get("SEED_PASSWORD", "dev-password-change-me")

random.seed(42)


def _ensure_user(db, *, email: str, name: str, role: Role) -> User:
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(
            email=email,
            display_name=name,
            password_hash=hash_password(SEED_PASSWORD),
            status=UserStatus.ACTIVE,
        )
        db.add(user)
        db.flush()
        db.add(UserRole(user_id=user.id, role=role, granted_by=user.id))
    return user


def main() -> int:
    if settings.is_production:
        print("Refusing to seed a production database.", file=sys.stderr)
        return 1

    with SessionLocal() as db:
        admin = _ensure_user(db, email=ADMIN_EMAIL, name="Asha Administrator", role=Role.ADMIN)
        doctor = _ensure_user(db, email=DOCTOR_EMAIL, name="Dr. Rao", role=Role.DOCTOR)

        if db.scalar(select(DoctorProfile).where(DoctorProfile.user_id == doctor.id)) is None:
            db.add(
                DoctorProfile(
                    user_id=doctor.id,
                    verification_status=VerificationStatus.VERIFIED,
                    professional_title="Consultant Physician",
                    registration_number="DEV-REG-0001",
                )
            )

        # A second doctor with no assignments, for negative tests.
        _ensure_user(db, email="unassigned@example.com", name="Dr. Iyer", role=Role.DOCTOR)

        patients = [
            ("PT-1001", "Meera Nair", 58, "female"),
            ("PT-1002", "Arjun Desai", 64, "male"),
            ("PT-1003", "Fatima Khan", 71, "female"),
        ]
        created_patients: list[Patient] = []
        for code, name, age, sex in patients:
            patient = db.scalar(select(Patient).where(Patient.patient_code == code))
            if patient is None:
                patient = Patient(
                    patient_code=code,
                    display_name=name,
                    date_of_birth=datetime.now(UTC).date()
                    - timedelta(days=age * 365),
                    sex_at_birth=sex,
                    status=PatientStatus.ACTIVE,
                    created_by=admin.id,
                )
                db.add(patient)
                db.flush()
            created_patients.append(patient)

        for idx, patient in enumerate(created_patients, start=1):
            if (
                db.scalar(
                    select(DoctorPatientAssignment).where(
                        DoctorPatientAssignment.doctor_user_id == doctor.id,
                        DoctorPatientAssignment.patient_id == patient.id,
                    )
                )
                is None
            ):
                db.add(
                    DoctorPatientAssignment(
                        doctor_user_id=doctor.id,
                        patient_id=patient.id,
                        assignment_type=AssignmentType.PRIMARY,
                        status=AssignmentStatus.ACTIVE,
                        starts_at=datetime.now(UTC) - timedelta(days=10),
                        created_by=admin.id,
                    )
                )

            device = db.scalar(
                select(Device).where(Device.hardware_identifier == f"PICO-{1000 + idx}")
            )
            if device is None:
                device = Device(
                    hardware_identifier=f"PICO-{1000 + idx}",
                    hardware_revision="rev-c",
                    firmware_version="1.2.0",
                    status=DeviceStatus.ACTIVE,
                    last_seen_at=datetime.now(UTC)
                    - timedelta(minutes=idx * 7),
                    battery_level=90 - idx * 5,
                    registered_by=admin.id,
                )
                db.add(device)
                db.flush()
                db.add(
                    PatientDevice(
                        patient_id=patient.id,
                        device_id=device.id,
                        linked_at=datetime.now(UTC) - timedelta(days=10),
                        linked_by=admin.id,
                    )
                )

            # 24 hours of hourly summaries per patient.
            now = datetime.now(UTC)
            has_measurements = db.scalar(
                select(MeasurementSummary).where(MeasurementSummary.patient_id == patient.id)
            )
            if has_measurements is None:
                for hours_ago in range(24, 0, -1):
                    observed = now - timedelta(hours=hours_ago)
                    # Patient 2 has a deliberate gap and poor quality, so the UI
                    # and charts exercise missing-data handling.
                    if idx == 2 and 8 <= hours_ago <= 12:
                        continue
                    quality = (
                        QualityStatus.POOR
                        if idx == 2 and hours_ago < 14
                        else QualityStatus.GOOD
                    )
                    for metric, base, unit in (
                        (MetricType.HEART_RATE, 72, "bpm"),
                        (MetricType.SPO2, 97, "%"),
                        (MetricType.RESPIRATORY_RATE, 15, "breaths/min"),
                        (MetricType.SKIN_TEMPERATURE, 33.4, "°C"),
                    ):
                        db.add(
                            MeasurementSummary(
                                patient_id=patient.id,
                                device_id=device.id,
                                metric_type=metric.value,
                                value=round(base + random.uniform(-4, 4), 2),
                                unit=unit,
                                observed_at=observed,
                                window_start=observed - timedelta(minutes=30),
                                window_end=observed,
                                quality_status=quality,
                                source_type=(
                                    SourceType.ESTIMATED
                                    if metric == MetricType.RESPIRATORY_RATE
                                    else SourceType.MEASURED
                                ),
                                algorithm_version="proto-0.1",
                            )
                        )

            if db.scalar(select(Event).where(Event.patient_id == patient.id)) is None:
                if idx == 1:
                    db.add(
                        Event(
                            patient_id=patient.id,
                            event_type="tachycardia_sustained",
                            severity=Severity.HIGH,
                            start_at=now - timedelta(hours=2),
                            status=EventStatus.NEW,
                            source="rule",
                            rule_version="rules-1.0.0",
                            evidence='{"threshold_bpm": 120, "window_minutes": 5}',
                        )
                    )
                if idx == 3:
                    db.add(
                        Event(
                            patient_id=patient.id,
                            event_type="spo2_desaturation",
                            severity=Severity.CRITICAL,
                            start_at=now - timedelta(hours=5),
                            status=EventStatus.ACKNOWLEDGED,
                            source="rule",
                            rule_version="rules-1.0.0",
                            evidence='{"threshold_pct": 88, "window_minutes": 3}',
                        )
                    )

        db.commit()

    print("Seed complete.")
    print(f"  admin  : {ADMIN_EMAIL} / {SEED_PASSWORD}")
    print(f"  doctor : {DOCTOR_EMAIL} / {SEED_PASSWORD}")
    print(f"  doctor : unassigned@example.com / {SEED_PASSWORD}  (no assignments)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
