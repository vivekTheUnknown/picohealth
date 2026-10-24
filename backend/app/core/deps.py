"""FastAPI dependencies: request metadata, caller identity, permissions."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session as DbSession

from app.core import sessions as session_service
from app.core.authz import AuthContext, ensure_account_usable
from app.core.config import settings
from app.core.db import get_db
from app.core.enums import Permission
from app.core.errors import unauthorized
from app.core.permissions import effective_permissions
from app.models.identity import User

DbDep = Annotated[DbSession, Depends(get_db)]


@dataclass(frozen=True)
class RequestMeta:
    ip_address: str | None
    user_agent: str | None
    request_id: str


def get_request_meta(request: Request) -> RequestMeta:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip_address = forwarded.split(",")[0].strip()
    else:
        ip_address = request.client.host if request.client else None
    return RequestMeta(
        ip_address=ip_address,
        user_agent=request.headers.get("user-agent"),
        request_id=getattr(request.state, "request_id", "-"),
    )


MetaDep = Annotated[RequestMeta, Depends(get_request_meta)]


def get_auth_context(request: Request, db: DbDep) -> AuthContext:
    """Resolve the session cookie into a caller identity.

    Rejects missing, expired, revoked, and suspended-account sessions alike.
    """
    raw_token = request.cookies.get(settings.session_cookie_name)
    session = session_service.resolve_session(db, raw_token)
    if session is None:
        raise unauthorized()

    user = db.get(User, session.user_id)
    if user is None:
        raise unauthorized()

    ensure_account_usable(user)

    roles = user.active_roles()
    if not roles:
        raise unauthorized("This account has no active role")

    db.commit()  # persist any idle-window slide

    return AuthContext(
        user=user,
        session_id=session.id,
        roles=frozenset(roles),
        permissions=frozenset(effective_permissions(db, user)),
    )


AuthDep = Annotated[AuthContext, Depends(get_auth_context)]


def require_permissions(*required: Permission):
    """Require ALL of the given permissions."""

    def dependency(ctx: AuthDep) -> AuthContext:
        for permission in required:
            if not ctx.has(permission):
                from app.core.errors import forbidden

                raise forbidden(f"Missing required permission: {permission.value}")
        return ctx

    return dependency


def require_any_permission(*permitted: Permission):
    """Require AT LEAST ONE of the given permissions."""

    def dependency(ctx: AuthDep) -> AuthContext:
        if not any(ctx.has(p) for p in permitted):
            from app.core.errors import forbidden

            joined = ", ".join(p.value for p in permitted)
            raise forbidden(f"Missing required permission: one of {joined}")
        return ctx

    return dependency


def parse_uuid(value: str) -> uuid.UUID:
    """Path parameters arrive as strings; malformed ids are treated as missing
    resources so we never echo back parser internals."""
    try:
        return uuid.UUID(value)
    except (ValueError, AttributeError, TypeError):
        from app.core.errors import not_found

        raise not_found("Resource")
