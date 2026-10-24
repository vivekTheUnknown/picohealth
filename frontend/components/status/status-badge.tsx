import {
  Activity,
  Bell,
  CheckCircle2,
  CircleHelp,
  Clock,
  Eye,
  MinusCircle,
  Search,
  Sigma,
  Waves,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/cn";
import type { ClinicalStatus } from "@/lib/types";

interface StatusConfig {
  label: string;
  icon: LucideIcon;
  classes: string;
  description: string;
}

const STATUS_CONFIG: Record<ClinicalStatus, StatusConfig> = {
  measured: {
    label: "Measured",
    icon: Activity,
    classes: "border-emerald-200 bg-emerald-50 text-emerald-800",
    description: "Directly acquired by a sensor or device, subject to its limitations.",
  },
  derived: {
    label: "Derived",
    icon: Sigma,
    classes: "border-ocean-200 bg-ocean-50 text-ocean-800",
    description: "Calculated from source data using a documented algorithm.",
  },
  estimated: {
    label: "Estimated",
    icon: Waves,
    classes: "border-violet-200 bg-violet-50 text-violet-800",
    description: "Inferred and uncertain. Treat as an estimate, not a direct measurement.",
  },
  stale: {
    label: "Stale",
    icon: Clock,
    classes: "border-amber-200 bg-amber-50 text-amber-900",
    description: "The value is older than the freshness policy for this metric.",
  },
  unavailable: {
    label: "Unavailable",
    icon: MinusCircle,
    classes: "border-line-strong bg-slate-100 text-slate-700",
    description: "No usable value exists for the selected period.",
  },
  new: {
    label: "New",
    icon: Bell,
    classes: "border-ocean-200 bg-ocean-50 text-ocean-800",
    description: "A newly detected event that has not been acknowledged.",
  },
  acknowledged: {
    label: "Acknowledged",
    icon: Eye,
    classes: "border-sky-200 bg-sky-50 text-sky-800",
    description: "A clinician has seen and acknowledged the event.",
  },
  under_review: {
    label: "Under review",
    icon: Search,
    classes: "border-indigo-200 bg-indigo-50 text-indigo-800",
    description: "The event is being reviewed by a clinician.",
  },
  resolved: {
    label: "Resolved",
    icon: CheckCircle2,
    classes: "border-emerald-200 bg-emerald-50 text-emerald-800",
    description: "The event is closed. Its original record is preserved.",
  },
  false_positive: {
    label: "False positive",
    icon: XCircle,
    classes: "border-line-strong bg-slate-100 text-slate-700",
    description: "Reviewed and determined not to represent a real signal.",
  },
  unknown: {
    label: "Unknown status",
    icon: CircleHelp,
    classes: "border-line-strong bg-slate-100 text-slate-700",
    description: "The service did not report a recognised status.",
  },
};

export function statusLabel(status: ClinicalStatus): string {
  return STATUS_CONFIG[status].label;
}

export interface StatusBadgeProps {
  status: ClinicalStatus;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Clinical status vocabulary. Every state carries visible text, an icon, and
 * colour, so meaning never depends on colour perception alone.
 */
export function StatusBadge({ status, size = "md", className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown;
  const Icon = config.icon;
  return (
    <span
      title={config.description}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border font-medium",
        size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs",
        config.classes,
        className,
      )}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  );
}
