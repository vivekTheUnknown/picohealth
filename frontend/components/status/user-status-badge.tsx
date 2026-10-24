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
    classes: "border-success/30 bg-success-subtle text-success",
  },
  invited: {
    label: "Invited",
    icon: Mail,
    classes: "border-info/30 bg-info-subtle text-info",
  },
  suspended: {
    label: "Suspended",
    icon: ShieldAlert,
    classes: "border-danger/30 bg-danger-subtle text-danger",
  },
  deactivated: {
    label: "Deactivated",
    icon: UserX,
    classes: "border-line bg-surface-active text-ink-muted",
  },
  unknown: {
    label: "Unknown status",
    icon: CircleHelp,
    classes: "border-line bg-surface-active text-ink-muted",
  },
};

export function UserStatusBadge({ status }: { status: UserStatus }) {
  const config = USER_STATUS[status] ?? USER_STATUS.unknown;
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 h-5 rounded-sm border px-1.5 text-2xs font-medium",
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
    classes: "border-success/30 bg-success-subtle text-success",
  },
  pending: {
    label: "Verification pending",
    icon: Mail,
    classes: "border-warning/30 bg-warning-subtle text-warning",
  },
  rejected: {
    label: "Verification rejected",
    icon: ShieldAlert,
    classes: "border-danger/30 bg-danger-subtle text-danger",
  },
  unknown: {
    label: "Verification unknown",
    icon: CircleHelp,
    classes: "border-line bg-surface-active text-ink-muted",
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
        "inline-flex items-center gap-1 h-5 rounded-sm border px-1.5 text-2xs font-medium",
        config.classes,
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  );
}
