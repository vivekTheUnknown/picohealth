import {
  AlertCircle,
  AlertTriangle,
  Circle,
  CircleHelp,
  Info,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/cn";
import type { Severity } from "@/lib/types";

interface SeverityConfig {
  label: string;
  icon: LucideIcon;
  classes: string;
  description: string;
}

const SEVERITY_CONFIG: Record<Severity, SeverityConfig> = {
  critical: {
    label: "Critical",
    icon: ShieldAlert,
    classes: "border-red-300 bg-red-50 text-red-800",
    description: "Highest priority. Requires prompt clinical review.",
  },
  high: {
    label: "High",
    icon: AlertTriangle,
    classes: "border-orange-300 bg-orange-50 text-orange-900",
    description: "High priority. Review as soon as practical.",
  },
  medium: {
    label: "Medium",
    icon: AlertCircle,
    classes: "border-amber-300 bg-amber-50 text-amber-900",
    description: "Moderate priority. Review during the next clinical pass.",
  },
  low: {
    label: "Low",
    icon: Circle,
    classes: "border-sky-200 bg-sky-50 text-sky-800",
    description: "Low priority. Informational follow-up.",
  },
  info: {
    label: "Info",
    icon: Info,
    classes: "border-line-strong bg-slate-100 text-slate-700",
    description: "Informational event with no urgency implied.",
  },
  unknown: {
    label: "Unknown severity",
    icon: CircleHelp,
    classes: "border-line-strong bg-slate-100 text-slate-700",
    description: "The service did not report a recognised severity.",
  },
};

export interface SeverityBadgeProps {
  severity: Severity;
  size?: "sm" | "md";
  className?: string;
}

/** Severity is always text + icon + colour, never colour alone. */
export function SeverityBadge({ severity, size = "md", className }: SeverityBadgeProps) {
  const config = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.unknown;
  const Icon = config.icon;
  return (
    <span
      title={config.description}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border font-semibold",
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
