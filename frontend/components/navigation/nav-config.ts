import {
  Bell,
  ClipboardList,
  Cpu,
  FileClock,
  Gauge,
  LayoutDashboard,
  Server,
  Settings,
  UserCog,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

import { hasAnyPermission, hasPermission, isAdmin, isDoctor } from "@/lib/permissions";
import type { Me } from "@/lib/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  visible: (me: Me) => boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/**
 * Navigation is role/permission aware for usability only. The API still
 * authorizes every page and every action.
 */
const SECTIONS: NavSection[] = [
  {
    title: "Clinical",
    items: [
      {
        href: "/overview",
        label: "Clinical overview",
        icon: LayoutDashboard,
        visible: (me) => isDoctor(me),
      },
      {
        href: "/patients",
        label: "Patients",
        icon: Users,
        visible: (me) => isDoctor(me) || hasPermission(me, "patients:read_assigned"),
      },
      {
        href: "/alerts",
        label: "Alerts",
        icon: Bell,
        visible: (me) => isDoctor(me),
      },
    ],
  },
  {
    title: "Administration",
    items: [
      {
        href: "/admin/overview",
        label: "Operations overview",
        icon: Gauge,
        visible: (me) => isAdmin(me),
      },
      {
        href: "/admin/users",
        label: "Users",
        icon: UserCog,
        visible: (me) => isAdmin(me) || hasPermission(me, "users:manage"),
      },
      {
        href: "/admin/patients",
        label: "Patient records",
        icon: UserRound,
        visible: (me) => isAdmin(me) || hasPermission(me, "patients:manage"),
      },
      {
        href: "/admin/assignments",
        label: "Assignments",
        icon: ClipboardList,
        visible: (me) => isAdmin(me) || hasPermission(me, "assignments:manage"),
      },
      {
        href: "/admin/devices",
        label: "Devices",
        icon: Cpu,
        visible: (me) =>
          isAdmin(me) ||
          hasAnyPermission(me, ["devices:read", "devices:manage"]),
      },
      {
        href: "/admin/audit",
        label: "Audit log",
        icon: FileClock,
        visible: (me) => isAdmin(me) || hasPermission(me, "audit:read"),
      },
      {
        href: "/admin/health",
        label: "Platform health",
        icon: Server,
        visible: (me) => isAdmin(me),
      },
    ],
  },
  {
    title: "Account",
    items: [
      {
        href: "/settings",
        label: "Profile & settings",
        icon: Settings,
        visible: () => true,
      },
    ],
  },
];

export function sectionsFor(me: Me): NavSection[] {
  return SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.visible(me)),
  })).filter((section) => section.items.length > 0);
}

export function isActivePath(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}
