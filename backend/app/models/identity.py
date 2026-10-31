"""Identity, access, sessions, and account lifecycle."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import (
    AuditOutcome,
    Permission,
    Role,
    UserStatus,
    VerificationStatus,
)
from app.models.base import (
    Base,
    StrEnumType,
    TimestampMixin,
    UTCDateTime,
    UUIDPrimaryKeyMixin,
    utcnow,
)


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    # Nullable: invited users have no password until they accept the invite.
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[UserStatus] = mapped_column(
        StrEnumType(UserStatus, 20), default=UserStatus.INVITED, nullable=False, index=True
    )
    timezone: Mapped[str] = mapped_column(String(64), default="UTC", nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(UTCDateTime())

    roles: Mapped[list[UserRole]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin",
        foreign_keys="UserRole.user_id",
    )
    doctor_profile: Mapped[DoctorProfile | None] = relationship(
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
        foreign_keys="DoctorProfile.user_id",
    )
    patient_profile: Mapped[PatientProfile | None] = relationship(
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
        foreign_keys="PatientProfile.user_id",
    )

    def active_roles(self) -> set[Role]:
        return {Role(r.role) for r in self.roles if r.revoked_at is None}

    def has_role(self, role: Role) -> bool:
        return role in self.active_roles()


class UserRole(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "user_roles"
    __table_args__ = (
        UniqueConstraint("user_id", "role", name="uq_user_role"),
        Index("ix_user_roles_user_active", "user_id", "revoked_at"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[Role] = mapped_column(StrEnumType(Role, 20), nullable=False)
    granted_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    granted_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime())

    user: Mapped[User] = relationship(back_populates="roles", foreign_keys=[user_id])


class UserPermissionGrant(UUIDPrimaryKeyMixin, Base):
    """A narrowly scoped permission granted to one user, outside their role.

    This exists so that `clinical_data:support_read` can be given to a specific
    administrator without making every administrator a clinical browser. It is
    the concrete mechanism behind design.md's "narrowly scoped permissions".
    """

    __tablename__ = "user_permission_grants"
    __table_args__ = (
        UniqueConstraint("user_id", "permission", name="uq_user_permission"),
        Index("ix_user_permissions_active", "user_id", "revoked_at"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    permission: Mapped[Permission] = mapped_column(StrEnumType(Permission, 60), nullable=False)
    granted_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    granted_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime())



class DoctorProfile(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "doctor_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    verification_status: Mapped[VerificationStatus] = mapped_column(
        StrEnumType(VerificationStatus, 20), default=VerificationStatus.PENDING, nullable=False
    )
    professional_title: Mapped[str | None] = mapped_column(String(120))
    registration_number: Mapped[str | None] = mapped_column(String(80))
    verified_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    verified_at: Mapped[datetime | None] = mapped_column(UTCDateTime())

    user: Mapped[User] = relationship(back_populates="doctor_profile", foreign_keys=[user_id])


class PatientProfile(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """The account-to-patient link for a patient user.

    One user maps to exactly one patient record, and one patient record to at
    most one login. Every patient-scoped route resolves the patient through
    this row; it never accepts a patient id from the client.
    """

    __tablename__ = "patient_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("patients.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )

    user: Mapped[User] = relationship(back_populates="patient_profile", foreign_keys=[user_id])


class Session(UUIDPrimaryKeyMixin, Base):
    """Server-side session record.

    The cookie carries an opaque token; only its SHA-256 hash is stored, so a
    database leak does not yield usable sessions. Revocation is a row update,
    which is what suspension and incident response require.
    """

    __tablename__ = "sessions"
    __table_args__ = (
        Index("ix_sessions_token_hash", "token_hash", unique=True),
        Index("ix_sessions_user_active", "user_id", "revoked_at"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    last_used_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    absolute_expires_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    revoked_reason: Mapped[str | None] = mapped_column(String(120))
    ip_address: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(String(400))


class PasswordResetToken(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "password_reset_tokens"
    __table_args__ = (Index("ix_reset_token_hash", "token_hash", unique=True),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(UTCDateTime())


class Invitation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "invitations"
    __table_args__ = (Index("ix_invitation_token_hash", "token_hash", unique=True),)

    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    role: Mapped[Role] = mapped_column(StrEnumType(Role, 20), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    invited_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(UTCDateTime())


class AuditEvent(UUIDPrimaryKeyMixin, Base):
    """Append-only application audit record.

    Deliberately holds minimal metadata: no health values, no credentials.
    """

    __tablename__ = "audit_events"
    __table_args__ = (
        Index("ix_audit_actor_time", "actor_user_id", "timestamp"),
        Index("ix_audit_target", "target_type", "target_id"),
        Index("ix_audit_action_time", "action", "timestamp"),
    )

    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    target_type: Mapped[str | None] = mapped_column(String(40))
    target_id: Mapped[str | None] = mapped_column(String(64))
    outcome: Mapped[AuditOutcome] = mapped_column(
        StrEnumType(AuditOutcome, 20), default=AuditOutcome.SUCCESS, nullable=False
    )
    timestamp: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    request_id: Mapped[str | None] = mapped_column(String(64))
    ip_address: Mapped[str | None] = mapped_column(String(45))
    context: Mapped[str | None] = mapped_column(Text)
