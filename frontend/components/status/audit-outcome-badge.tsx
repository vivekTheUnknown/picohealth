import { CheckCircle2, CircleHelp, ShieldAlert, XCircle, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/cn";
import type { AuditOutcome } from "@/lib/types";

const OUTCOME: Record<
  AuditOutcome,
  { label: string; icon: LucideIcon; classes: string }
> = {
  success: {
    label: "Success",
    icon: CheckCircle2,
    classes: "border-success/30 bg-success-subtle text-success",
  },
  denied: {
    label: "Denied",
    icon: ShieldAlert,
    classes: "border-warning/30 bg-warning-subtle text-warning",
  },
  failure: {
    label: "Failure",
    icon: XCircle,
    classes: "border-danger/30 bg-danger-subtle text-danger",
  },
  unknown: {
    label: "Unknown",
    icon: CircleHelp,
    classes: "border-line bg-surface-active text-ink-muted",
  },
};

export function AuditOutcomeBadge({ outcome }: { outcome: AuditOutcome }) {
  const config = OUTCOME[outcome] ?? OUTCOME.unknown;
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
