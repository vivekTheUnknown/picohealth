"""Declarative base and shared column helpers."""

from __future__ import annotations

import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, String, Uuid
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import TypeDecorator


def utcnow() -> datetime:
    """Timezone-aware UTC timestamp. Storage is always UTC."""
    return datetime.now(UTC)


class StrEnumType(TypeDecorator):
    """Persist an enum as VARCHAR and restore it as the enum type on load.

    Without this, SQLAlchemy hands back plain strings and every `.value` access
    becomes a latent AttributeError. The DDL stays a plain VARCHAR, so this is
    portable across SQLite and Postgres and needs no native enum type.
    """

    impl = String
    cache_ok = True

    def __init__(self, enum_cls: type[enum.StrEnum], length: int = 40) -> None:
        self.enum_cls = enum_cls
        super().__init__(length=length)

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, enum.Enum):
            return value.value
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        try:
            return self.enum_cls(value)
        except ValueError:
            # Unknown legacy value: return the raw string rather than crashing
            # a read. Explicitly visible in API responses.
            return value


class UTCDateTime(TypeDecorator):
    """Store and return timezone-aware UTC datetimes.

    SQLite discards tzinfo on write, which would otherwise surface as naive
    timestamps in API responses and silently shift every chart by the client's
    offset. Normalising here keeps "storage is UTC" true regardless of backend.
    """

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)


class Base(DeclarativeBase):
    pass


class UUIDPrimaryKeyMixin:
    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )
