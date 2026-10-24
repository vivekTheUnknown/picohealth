"""Model package: importing this module registers every table on Base.metadata."""

from app.models.base import Base
from app.models.clinical import (
    AlertTransition,
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
    "Base",
    "AlertTransition",
    "AuditEvent",
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
    "Session",
    "User",
    "UserPermissionGrant",
    "UserRole",
]
