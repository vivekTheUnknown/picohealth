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
    classes: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  denied: {
    label: "Denied",
    icon: ShieldAlert,
    classes: "border-amber-200 bg-amber-50 text-amber-900",
  },
  failure: {
    label: "Failure",
    icon: XCircle,
    classes: "border-red-200 bg-red-50 text-red-800",
  },
  unknown: {
    label: "Unknown",
    icon: CircleHelp,
    classes: "border-line-strong bg-slate-100 text-slate-700",
  },
};

export function AuditOutcomeBadge({ outcome }: { outcome: AuditOutcome }) {
  const config = OUTCOME[outcome] ?? OUTCOME.unknown;
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
