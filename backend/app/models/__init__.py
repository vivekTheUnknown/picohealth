"""Model package: importing this module registers every table on Base.metadata."""

from app.models.base import Base
from app.models.clinical import (
    AlertTransition,
    AppMeasurementRecord,
    ClinicalNote,
    Event,
    MeasurementSummary,
)
from app.models.devices import Device, MonitoringProfile
from app.models.identity import (
    AuditEvent,
    DoctorProfile,
    Invitation,
    PasswordResetToken,
    PatientProfile,
    Session,
    User,
    UserPermissionGrant,
    UserRole,
)
from app.models.patients import (
    DoctorPatientAssignment,
    Patient,
    PatientDevice,
)

__all__ = [
    "AlertTransition",
    "AppMeasurementRecord",
    "AuditEvent",
    "Base",
    "ClinicalNote",
    "Device",
    "DoctorPatientAssignment",
    "DoctorProfile",
    "Event",
    "Invitation",
    "MeasurementSummary",
    "MonitoringProfile",
    "PasswordResetToken",
    "Patient",
    "PatientDevice",
    "PatientProfile",
    "Session",
    "User",
    "UserPermissionGrant",
    "UserRole",
]
