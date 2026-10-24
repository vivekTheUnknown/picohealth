"""Server-side session lifecycle.

Design: opaque token in an HttpOnly cookie, SHA-256 hash stored in Postgres.
Revocation is immediate and durable — required for suspension and incident
response, and impossible with stateless tokens.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session as DbSession

from app.core.config import settings
from app.core.security import generate_token, hash_token
from app.models.identity import Session as AuthSession
from app.models.identity import User


def _now() -> datetime:
    return datetime.now(UTC)


def create_session(
    db: DbSession,
    user: User,
    *,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> tuple[str, AuthSession]:
    raw_token = generate_token()
    now = _now()
    session = AuthSession(
        user_id=user.id,
        token_hash=hash_token(raw_token),
        created_at=now,
        last_used_at=now,
        expires_at=now + timedelta(minutes=settings.session_idle_timeout_minutes),
        absolute_expires_at=now + timedelta(hours=settings.session_absolute_timeout_hours),
        ip_address=ip_address,
        user_agent=(user_agent or "")[:400] or None,
    )
    db.add(session)
    db.flush()
    return raw_token, session


def resolve_session(db: DbSession, raw_token: str | None) -> AuthSession | None:
    """Validate a cookie token, sliding the idle window forward on use."""
    if not raw_token:
        return None

    session = db.scalar(
        select(AuthSession).where(AuthSession.token_hash == hash_token(raw_token))
    )
    if session is None:
        return None

    now = _now()
    if session.revoked_at is not None:
        return None
    if _as_utc(session.expires_at) <= now or _as_utc(session.absolute_expires_at) <= now:
        return None

    # Only write when the idle window has actually drifted, to avoid a database
    # write on every single request.
    if (now - _as_utc(session.last_used_at)) > timedelta(seconds=60):
        session.last_used_at = now
        session.expires_at = min(
            now + timedelta(minutes=settings.session_idle_timeout_minutes),
            _as_utc(session.absolute_expires_at),
        )
        db.add(session)
    return session


def revoke_session(
    db: DbSession,
    session: AuthSession,
    *,
    reason: str = "logout",
) -> None:
    session.revoked_at = _now()
    session.revoked_reason = reason[:120]
    db.add(session)


def revoke_all_for_user(
    db: DbSession,
    user_id: uuid.UUID,
    *,
    reason: str,
    except_session_id: uuid.UUID | None = None,
) -> int:
    stmt = (
        update(AuthSession)
        .where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=_now(), revoked_reason=reason[:120])
    )
    if except_session_id is not None:
        stmt = stmt.where(AuthSession.id != except_session_id)
    result = db.execute(stmt)
    return int(result.rowcount or 0)


def purge_expired(db: DbSession) -> int:
    """Housekeeping hook; called by an operator task, not on the request path."""
    now = _now()
    stmt = (
        update(AuthSession)
        .where(
            AuthSession.revoked_at.is_(None),
            AuthSession.absolute_expires_at <= now,
        )
        .values(revoked_at=now, revoked_reason="expired")
    )
    return int((db.execute(stmt).rowcount) or 0)


def _as_utc(value: datetime) -> datetime:
    """SQLite returns naive datetimes; normalise before comparison."""
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)
