"""Administrative user management.

Account lifecycle changes revoke sessions, because a suspended or
re-permissioned user must not keep an existing token alive.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.core import audit
from app.core.deps import AuthDep, DbDep, MetaDep, parse_uuid, require_permissions
from app.core.enums import Permission, Role, UserStatus
from app.core.errors import APIError, forbidden, not_found
from app.core.pagination import Page, PageDep
from app.core.sessions import revoke_all_for_user
from app.models.identity import DoctorProfile, User, UserRole
from app.modules.auth.service import create_invitation

router = APIRouter(tags=["admin:users"])

manage = require_permissions(Permission.USERS_MANAGE)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str
    status: UserStatus
    roles: list[Role] = Field(default_factory=list)
    last_login_at: datetime | None
    created_at: datetime


class InvitationCreate(BaseModel):
    email: EmailStr
    role: Role


class InvitationResponse(BaseModel):
    user_id: uuid.UUID
    email: str
    role: Role
    # Returned for the prototype so the invite can be delivered out of band.
    invitation_token: str


class StatusUpdate(BaseModel):
    status: UserStatus


class RolesUpdate(BaseModel):
    roles: list[Role] = Field(min_length=1)


class PermissionsUpdate(BaseModel):
    """Explicit per-user grants, used for narrow permissions such as
    clinical_data:support_read that no role should imply."""

    permissions: list[Permission] = Field(default_factory=list)


@router.get("/admin/users", response_model=Page[UserResponse], dependencies=[Depends(manage)])
def list_users(
    db: DbDep,
    page: PageDep,
    search: str | None = Query(default=None, max_length=100),
    status_filter: UserStatus | None = Query(default=None, alias="status"),
    role: Role | None = Query(default=None),
) -> Page[UserResponse]:
    from sqlalchemy import func, or_, select

    stmt = select(User)
    if search:
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(or_(User.display_name.ilike(pattern), User.email.ilike(pattern)))
    if status_filter:
        stmt = stmt.where(User.status == status_filter)
    if role:
        stmt = stmt.where(
            User.id.in_(select(UserRole.user_id).where(UserRole.role == role))
        )

    total = int(db.scalar(select(func.count()).select_from(stmt.subquery())) or 0)
    rows = db.scalars(
        stmt.order_by(User.display_name).limit(page.limit).offset(page.offset)
    ).all()

    items = []
    for user in rows:
        item = UserResponse(
            id=user.id,
            email=user.email,
            display_name=user.display_name,
            status=user.status,
            roles=sorted(user.active_roles(), key=lambda r: r.value),
            last_login_at=user.last_login_at,
            created_at=user.created_at,
        )
        items.append(item)

    return Page[UserResponse](
        items=items, total=total, limit=page.limit, offset=page.offset
    )


@router.post(
    "/admin/users/invitations",
    response_model=InvitationResponse,
    status_code=201,
    dependencies=[Depends(manage)],
)
def invite_user(
    payload: InvitationCreate, ctx: AuthDep, db: DbDep, meta: MetaDep
) -> InvitationResponse:
    user, token = create_invitation(
        db,
        email=payload.email,
        role=payload.role,
        invited_by=ctx.user.id,
        ip_address=meta.ip_address,
        request_id=meta.request_id,
    )

    # A verified doctor profile is created in pending state; verification is a
    # separate, auditable administrative act.
    if payload.role == Role.DOCTOR:
        from sqlalchemy import select

        if db.scalar(select(DoctorProfile).where(DoctorProfile.user_id == user.id)) is None:
            db.add(DoctorProfile(user_id=user.id))
            db.commit()

    return InvitationResponse(
        user_id=user.id,
        email=user.email,
        role=payload.role,
        invitation_token=token,
    )


@router.patch(
    "/admin/users/{user_id}/status",
    response_model=UserResponse,
    dependencies=[Depends(manage)],
)
def update_status(
    user_id: str, payload: StatusUpdate, ctx: AuthDep, db: DbDep, meta: MetaDep
) -> UserResponse:
    target = db.get(User, parse_uuid(user_id))
    if target is None:
        raise not_found("User")
    if target.id == ctx.user.id:
        raise APIError("self_modification", "You cannot change your own account status", 409)

    target.status = payload.status
    if payload.status in {UserStatus.SUSPENDED, UserStatus.DEACTIVATED}:
        revoke_all_for_user(db, target.id, reason=f"status_{payload.status.value}")

    audit.record(
        db,
        action="users.status_changed",
        actor_user_id=ctx.user.id,
        target_type="user",
        target_id=target.id,
        ip_address=meta.ip_address,
        request_id=meta.request_id,
        context={"status": payload.status.value},
    )
    db.commit()
    return UserResponse(
        id=target.id,
        email=target.email,
        display_name=target.display_name,
        status=target.status,
        roles=sorted(target.active_roles(), key=lambda r: r.value),
        last_login_at=target.last_login_at,
        created_at=target.created_at,
    )


@router.put(
    "/admin/users/{user_id}/roles",
    response_model=UserResponse,
    dependencies=[Depends(manage)],
)
def set_roles(
    user_id: str, payload: RolesUpdate, ctx: AuthDep, db: DbDep, meta: MetaDep
) -> UserResponse:
    target = db.get(User, parse_uuid(user_id))
    if target is None:
        raise not_found("User")

    desired = set(payload.roles)
    current = target.active_roles()

    # Guard against an administrator stripping their own access and locking the
    # organization out of user management.
    if target.id == ctx.user.id and Role.ADMIN in current and Role.ADMIN not in desired:
        raise forbidden("You cannot remove your own administrator role")

    for existing in target.roles:
        if existing.revoked_at is None and existing.role not in desired:
            from app.models.base import utcnow

            existing.revoked_at = utcnow()

    for role in desired - current:
        db.add(UserRole(user_id=target.id, role=role, granted_by=ctx.user.id))

    # A privilege change invalidates existing sessions: the caller must sign in
    # again so the new permission set is unambiguous.
    revoke_all_for_user(db, target.id, reason="roles_changed", except_session_id=None)

    audit.record(
        db,
        action="users.roles_changed",
        actor_user_id=ctx.user.id,
        target_type="user",
        target_id=target.id,
        ip_address=meta.ip_address,
        request_id=meta.request_id,
        context={"roles": sorted(r.value for r in desired)},
    )
    db.commit()
    db.refresh(target)
    return UserResponse(
        id=target.id,
        email=target.email,
        display_name=target.display_name,
        status=target.status,
        roles=sorted(target.active_roles(), key=lambda r: r.value),
        last_login_at=target.last_login_at,
        created_at=target.created_at,
    )


@router.put(
    "/admin/users/{user_id}/permissions",
    response_model=UserResponse,
    dependencies=[Depends(manage)],
)
def set_permission_grants(
    user_id: str, payload: PermissionsUpdate, ctx: AuthDep, db: DbDep, meta: MetaDep
) -> UserResponse:
    """Replace explicit permission grants for a user.

    Session revocation happens because effective permissions changed; a caller
    must re-authenticate against the new set.
    """
    from sqlalchemy import select

    from app.models.base import utcnow
    from app.models.identity import UserPermissionGrant

    target = db.get(User, parse_uuid(user_id))
    if target is None:
        raise not_found("User")

    desired = set(payload.permissions)

    existing = db.scalars(
        select(UserPermissionGrant).where(
            UserPermissionGrant.user_id == target.id,
            UserPermissionGrant.revoked_at.is_(None),
        )
    ).all()
    current = {Permission(g.permission) for g in existing}

    for grant in existing:
        if Permission(grant.permission) not in desired:
            grant.revoked_at = utcnow()

    for permission in desired - current:
        db.add(
            UserPermissionGrant(
                user_id=target.id, permission=permission.value, granted_by=ctx.user.id
            )
        )

    revoke_all_for_user(db, target.id, reason="permissions_changed")

    audit.record(
        db,
        action="users.permissions_changed",
        actor_user_id=ctx.user.id,
        target_type="user",
        target_id=target.id,
        ip_address=meta.ip_address,
        request_id=meta.request_id,
        context={"permissions": sorted(p.value for p in desired)},
    )
    db.commit()
    return UserResponse(
        id=target.id,
        email=target.email,
        display_name=target.display_name,
        status=target.status,
        roles=sorted(target.active_roles(), key=lambda r: r.value),
        last_login_at=target.last_login_at,
        created_at=target.created_at,
    )
