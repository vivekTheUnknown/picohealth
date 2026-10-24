"""Test harness.

Each test gets an isolated in-memory database and a fresh app instance, so no
authorization assertion can be polluted by leftover rows from a neighbour.
"""

from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime, timedelta

# Must be set before the application modules import settings.
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("DATABASE_URL", "sqlite://")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.db import get_db
from app.core.enums import (
    AssignmentStatus,
    AssignmentType,
    DeviceStatus,
    EventStatus,
    PatientStatus,
    Role,
    Severity,
    UserStatus,
    VerificationStatus,
)
from app.core.security import hash_password
from app.main import app as application
from app.models import Base
from app.models.clinical import Event
from app.models.devices import Device
from app.models.identity import DoctorProfile, User, UserRole
from app.models.patients import DoctorPatientAssignment, Patient, PatientDevice

PASSWORD = "test-password-123"


@pytest.fixture()
def engine():
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)
    eng.dispose()


@pytest.fixture()
def db(engine):
    maker = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = maker()
    yield session
    session.close()


@pytest.fixture()
def client(engine, db):
    maker = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_db():
        session = maker()
        try:
            yield session
        finally:
            session.close()

    application.dependency_overrides[get_db] = override_get_db
    # Rate limiting is exercised explicitly in its own test.
    original = settings.rate_limit_enabled
    settings.rate_limit_enabled = False

    with TestClient(application) as test_client:
        yield test_client

    settings.rate_limit_enabled = original
    application.dependency_overrides.clear()


# --------------------------------------------------------------------------
# Factories
# --------------------------------------------------------------------------


def make_user(
    db,
    *,
    role: Role = Role.DOCTOR,
    email: str | None = None,
    status: UserStatus = UserStatus.ACTIVE,
    verified: bool = True,
    extra_roles: list[Role] | None = None,
) -> User:
    email = email or f"{role.value}-{uuid.uuid4().hex[:8]}@example.com"
    user = User(
        email=email,
        display_name=email.split("@")[0],
        password_hash=hash_password(PASSWORD),
        status=status,
    )
    db.add(user)
    db.flush()
    for r in [role, *(extra_roles or [])]:
        db.add(UserRole(user_id=user.id, role=r, granted_by=user.id))
    if role == Role.DOCTOR or Role.DOCTOR in (extra_roles or []):
        db.add(
            DoctorProfile(
                user_id=user.id,
                verification_status=(
                    VerificationStatus.VERIFIED if verified else VerificationStatus.PENDING
                ),
            )
        )
    db.commit()
    return user


def make_patient(db, *, code: str | None = None) -> Patient:
    patient = Patient(
        patient_code=code or f"PT-{uuid.uuid4().hex[:6].upper()}",
        display_name=f"Patient {uuid.uuid4().hex[:4]}",
        status=PatientStatus.ACTIVE,
    )
    db.add(patient)
    db.commit()
    return patient


def make_assignment(
    db,
    doctor: User,
    patient: Patient,
    *,
    status: AssignmentStatus = AssignmentStatus.ACTIVE,
    ends_at: datetime | None = None,
    starts_at: datetime | None = None,
) -> DoctorPatientAssignment:
    assignment = DoctorPatientAssignment(
        doctor_user_id=doctor.id,
        patient_id=patient.id,
        assignment_type=AssignmentType.PRIMARY,
        status=status,
        starts_at=starts_at or datetime.now(UTC) - timedelta(days=1),
        ends_at=ends_at,
    )
    db.add(assignment)
    db.commit()
    return assignment


def make_device(db, patient: Patient | None = None) -> Device:
    device = Device(
        hardware_identifier=f"DEV-{uuid.uuid4().hex[:8]}",
        status=DeviceStatus.ACTIVE,
        last_seen_at=datetime.now(UTC),
    )
    db.add(device)
    db.flush()
    if patient is not None:
        db.add(PatientDevice(patient_id=patient.id, device_id=device.id))
    db.commit()
    return device


def make_event(db, patient: Patient, **kwargs) -> Event:
    defaults = dict(
        patient_id=patient.id,
        event_type="tachycardia_sustained",
        severity=Severity.HIGH,
        start_at=datetime.now(UTC) - timedelta(hours=1),
        status=EventStatus.NEW,
        source="rule",
        rule_version="rules-1.0.0",
        evidence='{"threshold_bpm": 120}',
    )
    defaults.update(kwargs)
    event = Event(**defaults)
    db.add(event)
    db.commit()
    return event


# --------------------------------------------------------------------------
# Auth helpers
# --------------------------------------------------------------------------


def login(client: TestClient, user: User, password: str = PASSWORD) -> TestClient:
    response = client.post(
        "/api/v1/auth/login", json={"email": user.email, "password": password}
    )
    assert response.status_code == 200, response.text
    csrf = client.cookies.get("portal_csrf")
    assert csrf, "login must set a CSRF cookie"
    client.headers["X-CSRF-Token"] = csrf
    return client


def auth_headers(client: TestClient) -> dict[str, str]:
    return {"X-CSRF-Token": client.cookies.get("portal_csrf") or ""}
