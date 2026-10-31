"""Shared enumerations.

These values are persisted, so treat changes as schema migrations.
"""

from __future__ import annotations

from enum import StrEnum


class Role(StrEnum):
    DOCTOR = "doctor"
    ADMIN = "admin"
    PATIENT = "patient"


class Permission(StrEnum):
    # Patient access
    PATIENTS_READ_ASSIGNED = "patients:read_assigned"
    PATIENTS_MANAGE = "patients:manage"
    # Access relationships
    ASSIGNMENTS_MANAGE = "assignments:manage"
    # Devices
    DEVICES_READ = "devices:read"
    DEVICES_MANAGE = "devices:manage"
    # Monitoring configuration
    MONITORING_CONFIG_READ = "monitoring_config:read"
    MONITORING_CONFIG_MANAGE = "monitoring_config:manage"
    # Oversight
    AUDIT_READ = "audit:read"
    USERS_MANAGE = "users:manage"
    # Clinical actions
    CLINICAL_NOTES_WRITE = "clinical_notes:write"
    ALERTS_ACKNOWLEDGE = "alerts:acknowledge"
    ALERTS_RESOLVE = "alerts:resolve"
    # Deliberately narrow admin ability to view clinical content.
    CLINICAL_DATA_SUPPORT_READ = "clinical_data:support_read"
    # Patient self-service. A patient can only ever reach their own record.
    PATIENT_SELF_READ = "patient_self:read"
    PATIENT_SELF_WRITE = "patient_self:write"


class UserStatus(StrEnum):
    INVITED = "invited"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    DEACTIVATED = "deactivated"


class VerificationStatus(StrEnum):
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


class PatientStatus(StrEnum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class AssignmentStatus(StrEnum):
    ACTIVE = "active"
    ENDED = "ended"


class AssignmentType(StrEnum):
    PRIMARY = "primary"
    SECONDARY = "secondary"


class DeviceStatus(StrEnum):
    REGISTERED = "registered"
    ACTIVE = "active"
    FAULTY = "faulty"
    LOST = "lost"
    RETIRED = "retired"
    UNDER_TEST = "under_test"


class EventStatus(StrEnum):
    NEW = "new"
    ACKNOWLEDGED = "acknowledged"
    UNDER_REVIEW = "under_review"
    RESOLVED = "resolved"
    FALSE_POSITIVE = "false_positive"


class Severity(StrEnum):
    INFO = "info"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class MetricType(StrEnum):
    HEART_RATE = "heart_rate"
    SPO2 = "spo2"
    RESPIRATORY_RATE = "respiratory_rate"
    SKIN_TEMPERATURE = "skin_temperature"
    HRV = "hrv"
    ACTIVITY = "activity"


class QualityStatus(StrEnum):
    GOOD = "good"
    FAIR = "fair"
    POOR = "poor"
    UNKNOWN = "unknown"


class SourceType(StrEnum):
    MEASURED = "measured"
    DERIVED = "derived"
    ESTIMATED = "estimated"


class AuditOutcome(StrEnum):
    SUCCESS = "success"
    DENIED = "denied"
    FAILURE = "failure"
