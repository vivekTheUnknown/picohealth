import {
  CheckCircle2,
  CircleHelp,
  Mail,
  ShieldAlert,
  UserX,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/cn";
import type { UserStatus, VerificationStatus } from "@/lib/types";

const USER_STATUS: Record<
  UserStatus,
  { label: string; icon: LucideIcon; classes: string }
> = {
  active: {
    label: "Active",
    icon: CheckCircle2,
    classes: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  invited: {
    label: "Invited",
    icon: Mail,
    classes: "border-ocean-200 bg-ocean-50 text-ocean-800",
  },
  suspended: {
    label: "Suspended",
    icon: ShieldAlert,
    classes: "border-red-200 bg-red-50 text-red-800",
  },
  deactivated: {
    label: "Deactivated",
    icon: UserX,
    classes: "border-line-strong bg-slate-100 text-slate-700",
  },
  unknown: {
    label: "Unknown status",
    icon: CircleHelp,
    classes: "border-line-strong bg-slate-100 text-slate-700",
  },
};

export function UserStatusBadge({ status }: { status: UserStatus }) {
  const config = USER_STATUS[status] ?? USER_STATUS.unknown;
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
        config.classes,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  );
}

const VERIFICATION: Record<
  VerificationStatus,
  { label: string; icon: LucideIcon; classes: string }
> = {
  verified: {
    label: "Verified",
    icon: CheckCircle2,
    classes: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  pending: {
    label: "Verification pending",
    icon: Mail,
    classes: "border-amber-200 bg-amber-50 text-amber-900",
  },
  rejected: {
    label: "Verification rejected",
    icon: ShieldAlert,
    classes: "border-red-200 bg-red-50 text-red-800",
  },
  unknown: {
    label: "Verification unknown",
    icon: CircleHelp,
    classes: "border-line-strong bg-slate-100 text-slate-700",
  },
};

export function VerificationBadge({
  status,
  className,
}: {
  status: VerificationStatus | null;
  className?: string;
}) {
  if (!status) return <span className="text-xs text-ink-subtle">Not applicable</span>;
  const config = VERIFICATION[status] ?? VERIFICATION.unknown;
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
        config.classes,
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  );
}
