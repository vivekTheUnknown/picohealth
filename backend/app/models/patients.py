"""Patients, doctor assignments, and device linkage."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Date,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import AssignmentStatus, AssignmentType, PatientStatus
from app.models.base import (
    Base,
    StrEnumType,
    TimestampMixin,
    UTCDateTime,
    UUIDPrimaryKeyMixin,
    utcnow,
)


class Patient(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "patients"

    # Stable, non-guessable internal id above; this is the human-facing code.
    patient_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    sex_at_birth: Mapped[str | None] = mapped_column(String(20))
    status: Mapped[PatientStatus] = mapped_column(
        StrEnumType(PatientStatus, 20), default=PatientStatus.ACTIVE, nullable=False, index=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    assignments: Mapped[list[DoctorPatientAssignment]] = relationship(
        back_populates="patient", cascade="all, delete-orphan"
    )
    device_links: Mapped[list[PatientDevice]] = relationship(
        back_populates="patient", cascade="all, delete-orphan"
    )


class DoctorPatientAssignment(UUIDPrimaryKeyMixin, Base):
    """The authorization anchor for clinical access.

    A doctor may read a patient only while a row here is ACTIVE and the current
    time falls inside [starts_at, ends_at). Revoking access means ending the
    assignment, not deleting history.
    """

    __tablename__ = "doctor_patient_assignments"
    __table_args__ = (
        Index("ix_assignments_doctor_active", "doctor_user_id", "status"),
        Index("ix_assignments_patient_active", "patient_id", "status"),
    )

    doctor_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False
    )
    assignment_type: Mapped[AssignmentType] = mapped_column(
        StrEnumType(AssignmentType, 20), default=AssignmentType.PRIMARY, nullable=False
    )
    status: Mapped[AssignmentStatus] = mapped_column(
        StrEnumType(AssignmentStatus, 20), default=AssignmentStatus.ACTIVE, nullable=False
    )
    starts_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utcnow, nullable=False
    )
    ends_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)

    patient: Mapped[Patient] = relationship(back_populates="assignments")


class PatientDevice(UUIDPrimaryKeyMixin, Base):
    """Device-to-patient link history.

    A device may only be linked to one patient at a time; ending a link sets
    unlinked_at rather than deleting the record.
    """

    __tablename__ = "patient_devices"
    __table_args__ = (
        UniqueConstraint("device_id", "patient_id", "linked_at", name="uq_patient_device_link"),
        Index("ix_patient_devices_patient_active", "patient_id", "unlinked_at"),
        Index("ix_patient_devices_device_active", "device_id", "unlinked_at"),
    )

    patient_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False
    )
    device_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("devices.id", ondelete="CASCADE"), nullable=False
    )
    linked_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utcnow, nullable=False
    )
    unlinked_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    linked_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    patient: Mapped[Patient] = relationship(back_populates="device_links")
