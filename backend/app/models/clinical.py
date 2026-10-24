"""Measurements, events, alerts, and clinical notes."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Float,
    ForeignKey,
    Index,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import EventStatus, MetricType, QualityStatus, Severity, SourceType
from app.models.base import (
    Base,
    StrEnumType,
    TimestampMixin,
    UTCDateTime,
    UUIDPrimaryKeyMixin,
    utcnow,
)


class MeasurementSummary(UUIDPrimaryKeyMixin, Base):
    """Searchable, time-windowed metric values.

    Raw high-frequency waveforms do not belong here; they live in object
    storage with a `recordings` row pointing at them.
    """

    __tablename__ = "measurement_summaries"
    __table_args__ = (
        Index("ix_measurements_patient_metric_time", "patient_id", "metric_type", "observed_at"),
        Index("ix_measurements_device_time", "device_id", "observed_at"),
    )

    patient_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False
    )
    device_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("devices.id", ondelete="SET NULL")
    )
    metric_type: Mapped[MetricType] = mapped_column(StrEnumType(MetricType, 40), nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    observed_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), nullable=False, index=True
    )
    window_start: Mapped[datetime | None] = mapped_column(UTCDateTime())
    window_end: Mapped[datetime | None] = mapped_column(UTCDateTime())
    quality_status: Mapped[QualityStatus] = mapped_column(
        StrEnumType(QualityStatus, 20), default=QualityStatus.UNKNOWN, nullable=False
    )
    source_type: Mapped[SourceType] = mapped_column(
        StrEnumType(SourceType, 20), default=SourceType.MEASURED, nullable=False
    )
    algorithm_version: Mapped[str | None] = mapped_column(String(40))


class Event(UUIDPrimaryKeyMixin, Base):
    """A rule-detected event.

    `rule_version` and `evidence` make the trigger reproducible and reviewable,
    which is the whole point of separating interpretation from raw data.
    """

    __tablename__ = "events"
    __table_args__ = (
        Index("ix_events_patient_time", "patient_id", "start_at"),
        Index("ix_events_status_time", "status", "start_at"),
    )

    patient_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(60), nullable=False)
    severity: Mapped[Severity] = mapped_column(
        StrEnumType(Severity, 20), default=Severity.MEDIUM, nullable=False, index=True
    )
    start_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    end_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    status: Mapped[EventStatus] = mapped_column(
        StrEnumType(EventStatus, 20), default=EventStatus.NEW, nullable=False
    )
    source: Mapped[str] = mapped_column(String(40), default="rule", nullable=False)
    rule_version: Mapped[str | None] = mapped_column(String(40))
    evidence: Mapped[str | None] = mapped_column(Text)  # JSON: thresholds, windows
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)

    transitions: Mapped[list[AlertTransition]] = relationship(
        back_populates="event", cascade="all, delete-orphan"
    )


class AlertTransition(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "alert_transitions"

    event_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False
    )
    prior_status: Mapped[EventStatus | None] = mapped_column(StrEnumType(EventStatus, 20))
    new_status: Mapped[EventStatus] = mapped_column(
        StrEnumType(EventStatus, 20), nullable=False
    )
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    timestamp: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    note: Mapped[str | None] = mapped_column(Text)

    event: Mapped[Event] = relationship(back_populates="transitions")


class ClinicalNote(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "clinical_notes"
    __table_args__ = (Index("ix_notes_patient_time", "patient_id", "created_at"),)

    patient_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False
    )
    author_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    related_event_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("events.id", ondelete="SET NULL")
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
