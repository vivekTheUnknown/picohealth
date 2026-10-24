"""Authentication domain logic.

Routes authenticate, call these functions, and return typed responses. No
business rules live in the HTTP layer.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.core import audit
from app.core.authz import AuthContext
from app.core.config import settings
from app.core.enums import AuditOutcome, Role, UserStatus
from app.core.errors import APIError, forbidden, unauthorized
from app.core.rate_limit import limiter
from app.core.security import (
    generate_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.core.sessions import create_session, revoke_all_for_user, revoke_session
from app.models.identity import Invitation as InvitationModel
from app.models.identity import PasswordResetToken, User


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def normalise_email(email: str) -> str:
    return email.strip().lower()


def authenticate(
    db: DbSession,
    *,
    email: str,
    password: str,
    ip_address: str | None,
    request_id: str | None,
) -> tuple[User, str, str]:
    """Verify credentials and open a session.

    Returns (user, session_token, csrf_token).
    """
    email = normalise_email(email)

    if not limiter.check(
        "login-ip",
        ip_address or "unknown",
        limit=settings.login_max_attempts_per_window,
        window_seconds=settings.login_window_seconds,
    ):
        audit.record(
            db,
            action="auth.login.rate_limited",
            outcome=AuditOutcome.DENIED,
            ip_address=ip_address,
            request_id=request_id,
            context={"email": email},
        )
        db.commit()
        raise APIError(
            "rate_limited",
            "Too many sign-in attempts. Try again later.",
            429,
            retryable=True,
        )

    user = db.scalar(select(User).where(User.email == email))

    # Always run the hash comparison so unknown emails and bad passwords take
    # comparable time.
    password_ok = verify_password(password, user.password_hash if user else None)

    if user is None or not password_ok:
        audit.record(
            db,
            action="auth.login.failed",
            target_type="user",
            target_id=user.id if user else None,
            outcome=AuditOutcome.FAILURE,
            ip_address=ip_address,
            request_id=request_id,
        )
        db.commit()
        raise unauthorized("Invalid email or password")

    if user.status == UserStatus.SUSPENDED:
        audit.record(
            db,
            action="auth.login.denied",
            actor_user_id=user.id,
            outcome=AuditOutcome.DENIED,
            ip_address=ip_address,
            request_id=request_id,
            context={"reason": "suspended"},
        )
        db.commit()
        raise forbidden("This account has been suspended")

    if user.status != UserStatus.ACTIVE:
        audit.record(
            db,
            action="auth.login.denied",
            actor_user_id=user.id,
            outcome=AuditOutcome.DENIED,
            ip_address=ip_address,
            request_id=request_id,
            context={"reason": user.status.value},
        )
        db.commit()
        raise forbidden("This account has not completed activation")

    if not user.active_roles():
        raise forbidden("This account has no active role")

    raw_session, _session = create_session(db, user, ip_address=ip_address)
    csrf_token = generate_token(24)
    user.last_login_at = _now()

    audit.record(
        db,
        action="auth.login.succeeded",
        actor_user_id=user.id,
        target_type="user",
        target_id=user.id,
        ip_address=ip_address,
        request_id=request_id,
    )
    db.commit()

    limiter.reset("login-ip", ip_address or "unknown")
    return user, raw_session, csrf_token


def logout(db: DbSession, ctx: AuthContext, *, ip_address: str | None, request_id: str | None):
    from app.models.identity import Session as AuthSession

    session = db.get(AuthSession, ctx.session_id)
    if session is not None:
        revoke_session(db, session, reason="logout")
    audit.record(
        db,
        action="auth.logout",
        actor_user_id=ctx.user.id,
        ip_address=ip_address,
        request_id=request_id,
    )
    db.commit()


def request_password_reset(
    db: DbSession, *, email: str, ip_address: str | None, request_id: str | None
) -> str | None:
    """Create a reset token. Returns the raw token, or None for unknown emails.

    The caller must return the same response either way, so the endpoint cannot
    be used to enumerate accounts. In this prototype the token is returned to
    the caller for testability; delivery is a separate concern.
    """
    email = normalise_email(email)
    user = db.scalar(select(User).where(User.email == email))

    audit.record(
        db,
        action="auth.password.reset_requested",
        target_type="user",
        target_id=user.id if user else None,
        ip_address=ip_address,
        request_id=request_id,
    )

    if user is None or user.status != UserStatus.ACTIVE:
        db.commit()
        return None

    raw = generate_token()
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=hash_token(raw),
            expires_at=_now() + timedelta(minutes=settings.reset_token_ttl_minutes),
        )
    )
    db.commit()
    return raw


def consume_password_reset(
    db: DbSession,
    *,
    token: str,
    new_password: str,
    ip_address: str | None,
    request_id: str | None,
) -> None:
    row = db.scalar(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_token(token))
    )
    now = _now()
    if row is None or row.used_at is not None or _as_utc(row.expires_at) <= now:
        raise APIError("invalid_token", "This reset link is invalid or has expired", 400)

    user = db.get(User, row.user_id)
    if user is None or user.status != UserStatus.ACTIVE:
        raise APIError("invalid_token", "This reset link is invalid or has expired", 400)

    user.password_hash = hash_password(new_password)
    row.used_at = now
    # A password change invalidates every existing session.
    revoke_all_for_user(db, user.id, reason="password_reset")

    audit.record(
        db,
        action="auth.password.reset_completed",
        actor_user_id=user.id,
        target_type="user",
        target_id=user.id,
        ip_address=ip_address,
        request_id=request_id,
    )
    db.commit()


def create_invitation(
    db: DbSession,
    *,
    email: str,
    role: Role,
    invited_by: uuid.UUID | None,
    ip_address: str | None,
    request_id: str | None,
) -> tuple[User, str]:
    """Invite a user. Creates an INVITED account with no password."""
    email = normalise_email(email)

    existing = db.scalar(select(User).where(User.email == email))
    if existing is not None and existing.status != UserStatus.INVITED:
        raise APIError("already_exists", "A user with this email already exists", 409)

    user = existing
    if user is None:
        user = User(
            email=email,
            display_name=email.split("@")[0],
            status=UserStatus.INVITED,
        )
        db.add(user)
        db.flush()

    raw = generate_token()
    db.add(
        InvitationModel(
            email=email,
            role=role,
            token_hash=hash_token(raw),
            invited_by=invited_by,
            expires_at=_now() + timedelta(hours=settings.invitation_token_ttl_hours),
        )
    )

    audit.record(
        db,
        action="users.invited",
        actor_user_id=invited_by,
        target_type="user",
        target_id=user.id,
        ip_address=ip_address,
        request_id=request_id,
        context={"role": role.value},
    )
    db.commit()
    return user, raw


def accept_invitation(
    db: DbSession,
    *,
    token: str,
    display_name: str,
    password: str,
    ip_address: str | None,
    request_id: str | None,
) -> User:
    row = db.scalar(
        select(InvitationModel).where(InvitationModel.token_hash == hash_token(token))
    )
    now = _now()
    if row is None or row.accepted_at is not None or _as_utc(row.expires_at) <= now:
        raise APIError("invalid_token", "This invitation is invalid or has expired", 400)

    user = db.scalar(select(User).where(User.email == row.email))
    if user is None:
        raise APIError("invalid_token", "This invitation is invalid or has expired", 400)

    from app.models.identity import UserRole

    user.display_name = display_name.strip()[:200]
    user.password_hash = hash_password(password)
    user.status = UserStatus.ACTIVE
    row.accepted_at = now

    db.add(UserRole(user_id=user.id, role=row.role, granted_by=row.invited_by or user.id))

    audit.record(
        db,
        action="users.invitation_accepted",
        actor_user_id=user.id,
        target_type="user",
        target_id=user.id,
        ip_address=ip_address,
        request_id=request_id,
        context={"role": row.role.value},
    )
    db.commit()
    return user


def change_password(
    db: DbSession,
    ctx: AuthContext,
    *,
    current_password: str,
    new_password: str,
    ip_address: str | None,
    request_id: str | None,
) -> None:
    user = ctx.user
    if not verify_password(current_password, user.password_hash):
        audit.record(
            db,
            action="auth.password.change_denied",
            actor_user_id=user.id,
            outcome=AuditOutcome.DENIED,
            ip_address=ip_address,
            request_id=request_id,
        )
        db.commit()
        raise unauthorized("Current password is incorrect")

    user.password_hash = hash_password(new_password)
    revoke_all_for_user(db, user.id, reason="password_change", except_session_id=ctx.session_id)

    audit.record(
        db,
        action="auth.password.changed",
        actor_user_id=user.id,
        target_type="user",
        target_id=user.id,
        ip_address=ip_address,
        request_id=request_id,
    )
    db.commit()
