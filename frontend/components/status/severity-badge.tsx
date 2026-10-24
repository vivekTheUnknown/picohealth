import {
  AlertCircle,
  AlertTriangle,
  Circle,
  CircleHelp,
  Info,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

import { Badge, type BadgeTone } from "@/components/status/badge";
import type { Severity } from "@/lib/types";

interface SeverityConfig {
  label: string;
  icon: LucideIcon;
  tone: BadgeTone;
  description: string;
}

const SEVERITY_CONFIG: Record<Severity, SeverityConfig> = {
  critical: {
    label: "Critical",
    icon: ShieldAlert,
    tone: "danger",
    description: "Highest priority. Requires prompt clinical review.",
  },
  high: {
    label: "High",
    icon: AlertTriangle,
    tone: "warning",
    description: "High priority. Review as soon as practical.",
  },
  medium: {
    label: "Medium",
    icon: AlertCircle,
    tone: "warning",
    description: "Moderate priority. Review during the next clinical pass.",
  },
  low: {
    label: "Low",
    icon: Circle,
    tone: "info",
    description: "Low priority. Informational follow-up.",
  },
  info: {
    label: "Info",
    icon: Info,
    tone: "neutral",
    description: "Informational event with no urgency implied.",
  },
  unknown: {
    label: "Unknown severity",
    icon: CircleHelp,
    tone: "neutral",
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
  return (
    <Badge
      tone={config.tone}
      icon={config.icon}
      size={size}
      title={config.description}
      className={className}
    >
      {config.label}
    </Badge>
  );
}
