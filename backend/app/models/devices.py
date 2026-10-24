"""Device registry and monitoring configuration."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import DeviceStatus
from app.models.base import (
    Base,
    StrEnumType,
    TimestampMixin,
    UTCDateTime,
    UUIDPrimaryKeyMixin,
    utcnow,
)


class Device(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "devices"

    hardware_identifier: Mapped[str] = mapped_column(
        String(120), unique=True, nullable=False, index=True
    )
    hardware_revision: Mapped[str | None] = mapped_column(String(40))
    firmware_version: Mapped[str | None] = mapped_column(String(40))
    status: Mapped[DeviceStatus] = mapped_column(
        StrEnumType(DeviceStatus, 20), default=DeviceStatus.REGISTERED, nullable=False, index=True
    )
    last_seen_at: Mapped[datetime | None] = mapped_column(
        UTCDateTime(), index=True
    )
    battery_level: Mapped[int | None] = mapped_column(Integer)
    registered_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )


class MonitoringProfile(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Versioned, validated monitoring settings.

    Alert thresholds live here so a rule change is a versioned, auditable act
    rather than an edit in application code.
    """

    __tablename__ = "monitoring_profiles"
    __table_args__ = (Index("ix_profiles_name_version", "name", "version"),)

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    settings: Mapped[str | None] = mapped_column(Text)  # JSON-encoded
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    activated_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
