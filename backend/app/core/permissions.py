"""Role-to-permission mapping.

A role grants a permission *set*; it never grants resource access on its own.
Every patient-scoped operation additionally requires an active assignment (or an
explicitly narrow admin support permission). See `app.core.authz`.
"""

from __future__ import annotations

from app.core.enums import Permission, Role

DOCTOR_PERMISSIONS: frozenset[Permission] = frozenset(
    {
        Permission.PATIENTS_READ_ASSIGNED,
        Permission.DEVICES_READ,
        Permission.MONITORING_CONFIG_READ,
        Permission.CLINICAL_NOTES_WRITE,
        Permission.ALERTS_ACKNOWLEDGE,
        Permission.ALERTS_RESOLVE,
    }
)

# Admin permissions are split so that "admin" does not imply unrestricted
# clinical browsing. CLINICAL_DATA_SUPPORT_READ is deliberately NOT granted
# here; it must be handed out explicitly to an administrator who needs it.
ADMIN_PERMISSIONS: frozenset[Permission] = frozenset(
    {
        Permission.PATIENTS_MANAGE,
        Permission.ASSIGNMENTS_MANAGE,
        Permission.DEVICES_READ,
        Permission.DEVICES_MANAGE,
        Permission.MONITORING_CONFIG_READ,
        Permission.MONITORING_CONFIG_MANAGE,
        Permission.AUDIT_READ,
        Permission.USERS_MANAGE,
    }
)

ROLE_PERMISSIONS: dict[Role, frozenset[Permission]] = {
    Role.DOCTOR: DOCTOR_PERMISSIONS,
    Role.ADMIN: ADMIN_PERMISSIONS,
}


def permissions_for_roles(roles: set[Role]) -> set[Permission]:
    """Union of permissions across all active roles. A multi-role user gets the
    combination, from one identity and one session."""
    granted: set[Permission] = set()
    for role in roles:
        granted |= ROLE_PERMISSIONS.get(role, frozenset())
    return granted


def effective_permissions(db, user) -> set[Permission]:
    """Role-derived permissions plus any explicit per-user grants.

    Explicit grants are how a narrow permission such as
    `clinical_data:support_read` reaches a single administrator without being
    implied by the admin role.
    """
    from sqlalchemy import select

    from app.models.identity import UserPermissionGrant

    granted = permissions_for_roles(user.active_roles())
    rows = db.scalars(
        select(UserPermissionGrant).where(
            UserPermissionGrant.user_id == user.id,
            UserPermissionGrant.revoked_at.is_(None),
        )
    ).all()
    for row in rows:
        try:
            granted.add(Permission(row.permission))
        except ValueError:
            continue  # ignore unknown/retired permission strings
    return granted
