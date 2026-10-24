import type { Me, Permission, Role } from "@/lib/types";

export const PERMISSIONS = {
  PATIENTS_READ_ASSIGNED: "patients:read_assigned",
  PATIENTS_MANAGE: "patients:manage",
  ASSIGNMENTS_MANAGE: "assignments:manage",
  DEVICES_READ: "devices:read",
  DEVICES_MANAGE: "devices:manage",
  MONITORING_CONFIG_READ: "monitoring_config:read",
  MONITORING_CONFIG_MANAGE: "monitoring_config:manage",
  AUDIT_READ: "audit:read",
  USERS_MANAGE: "users:manage",
  CLINICAL_NOTES_WRITE: "clinical_notes:write",
  ALERTS_ACKNOWLEDGE: "alerts:acknowledge",
  ALERTS_RESOLVE: "alerts:resolve",
  CLINICAL_DATA_SUPPORT_READ: "clinical_data:support_read",
} as const satisfies Record<string, Permission>;

/** UI gating only. The API is the authority for every permission. */
export function hasPermission(
  me: Pick<Me, "permissions"> | null | undefined,
  permission: Permission,
): boolean {
  return Boolean(me?.permissions?.includes(permission));
}

export function hasAnyPermission(
  me: Pick<Me, "permissions"> | null | undefined,
  permissions: Permission[],
): boolean {
  return permissions.some((permission) => hasPermission(me, permission));
}

export function hasRole(me: Pick<Me, "roles"> | null | undefined, role: Role): boolean {
  return Boolean(me?.roles?.includes(role));
}

export function isDoctor(me: Pick<Me, "roles"> | null | undefined): boolean {
  return hasRole(me, "doctor");
}

export function isAdmin(me: Pick<Me, "roles"> | null | undefined): boolean {
  return hasRole(me, "admin");
}

/** Admins land in operations; everyone else lands in the clinical workspace. */
export function landingPath(me: Pick<Me, "roles">): string {
  if (isAdmin(me) && !isDoctor(me)) return "/admin/overview";
  return "/overview";
}
