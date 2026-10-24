"""Authentication routes.

Thin by design: authenticate, delegate to the service, shape the response.
"""

from __future__ import annotations

from fastapi import APIRouter, Request, Response, status

from app.core.authz import AuthContext
from app.core.cookies import clear_session_cookies, set_session_cookies
from app.core.deps import AuthDep, DbDep, MetaDep
from app.modules.auth import service
from app.modules.auth.schemas import (
    AcceptInvitationRequest,
    ChangePasswordRequest,
    LoginRequest,
    MeResponse,
    MessageResponse,
    PermissionsResponse,
    RecoverRequest,
    ResetRequest,
)

router = APIRouter(tags=["auth"])


def to_me(ctx: AuthContext) -> MeResponse:
    user = ctx.user
    profile = user.doctor_profile
    return MeResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        status=user.status,
        roles=sorted(ctx.roles, key=lambda r: r.value),
        permissions=sorted(ctx.permissions, key=lambda p: p.value),
        timezone=user.timezone,
        doctor_verification_status=profile.verification_status if profile else None,
        last_login_at=user.last_login_at,
    )


@router.post("/auth/login", response_model=MeResponse)
def login(
    payload: LoginRequest,
    response: Response,
    db: DbDep,
    meta: MetaDep,
) -> MeResponse:
    user, session_token, csrf_token = service.authenticate(
        db,
        email=payload.email,
        password=payload.password,
        ip_address=meta.ip_address,
        request_id=meta.request_id,
    )
    set_session_cookies(response, session_token=session_token, csrf_token=csrf_token)

    # Rebuild a minimal context for the response body without another lookup.
    from app.core.permissions import effective_permissions

    roles = user.active_roles()
    return MeResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        status=user.status,
        roles=sorted(roles, key=lambda r: r.value),
        permissions=sorted(effective_permissions(db, user), key=lambda p: p.value),
        timezone=user.timezone,
        doctor_verification_status=(
            user.doctor_profile.verification_status if user.doctor_profile else None
        ),
        last_login_at=user.last_login_at,
    )


@router.post("/auth/logout", response_model=MessageResponse)
def logout(response: Response, ctx: AuthDep, db: DbDep, meta: MetaDep) -> MessageResponse:
    service.logout(db, ctx, ip_address=meta.ip_address, request_id=meta.request_id)
    clear_session_cookies(response)
    return MessageResponse(message="Signed out")


@router.post("/auth/recover", status_code=status.HTTP_202_ACCEPTED, response_model=MessageResponse)
def recover(payload: RecoverRequest, db: DbDep, meta: MetaDep) -> MessageResponse:
    # Deliberately identical response whether or not the account exists.
    service.request_password_reset(
        db, email=payload.email, ip_address=meta.ip_address, request_id=meta.request_id
    )
    return MessageResponse(
        message="If an account exists for that address, a reset link has been sent."
    )


@router.post("/auth/reset", response_model=MessageResponse)
def reset(payload: ResetRequest, db: DbDep, meta: MetaDep) -> MessageResponse:
    service.consume_password_reset(
        db,
        token=payload.token,
        new_password=payload.new_password,
        ip_address=meta.ip_address,
        request_id=meta.request_id,
    )
    return MessageResponse(message="Password updated. Sign in with your new password.")


@router.post("/auth/accept-invitation", response_model=MessageResponse)
def accept_invitation(
    payload: AcceptInvitationRequest, db: DbDep, meta: MetaDep
) -> MessageResponse:
    service.accept_invitation(
        db,
        token=payload.token,
        display_name=payload.display_name,
        password=payload.password,
        ip_address=meta.ip_address,
        request_id=meta.request_id,
    )
    return MessageResponse(message="Account activated. You can now sign in.")


@router.post("/auth/change-password", response_model=MessageResponse)
def change_password(
    payload: ChangePasswordRequest, ctx: AuthDep, db: DbDep, meta: MetaDep
) -> MessageResponse:
    service.change_password(
        db,
        ctx,
        current_password=payload.current_password,
        new_password=payload.new_password,
        ip_address=meta.ip_address,
        request_id=meta.request_id,
    )
    return MessageResponse(message="Password changed. Other sessions have been signed out.")


@router.get("/me", response_model=MeResponse)
def me(ctx: AuthDep) -> MeResponse:
    return to_me(ctx)


@router.get("/me/permissions", response_model=PermissionsResponse)
def my_permissions(ctx: AuthDep) -> PermissionsResponse:
    return PermissionsResponse(
        roles=sorted(ctx.roles, key=lambda r: r.value),
        permissions=sorted(ctx.permissions, key=lambda p: p.value),
    )
