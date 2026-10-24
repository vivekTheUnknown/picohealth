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

import { Badge, type BadgeTone } from "@/components/status/badge";
import type { ClinicalStatus } from "@/lib/types";

interface StatusConfig {
  label: string;
  icon: LucideIcon;
  tone: BadgeTone;
  description: string;
}

const STATUS_CONFIG: Record<ClinicalStatus, StatusConfig> = {
  measured: {
    label: "Measured",
    icon: Activity,
    tone: "success",
    description: "Directly acquired by a sensor or device, subject to its limitations.",
  },
  derived: {
    label: "Derived",
    icon: Sigma,
    tone: "info",
    description: "Calculated from source data using a documented algorithm.",
  },
  estimated: {
    label: "Estimated",
    icon: Waves,
    tone: "info",
    description: "Inferred and uncertain. Treat as an estimate, not a direct measurement.",
  },
  stale: {
    label: "Stale",
    icon: Clock,
    tone: "warning",
    description: "The value is older than the freshness policy for this metric.",
  },
  unavailable: {
    label: "Unavailable",
    icon: MinusCircle,
    tone: "neutral",
    description: "No usable value exists for the selected period.",
  },
  new: {
    label: "New",
    icon: Bell,
    tone: "info",
    description: "A newly detected event that has not been acknowledged.",
  },
  acknowledged: {
    label: "Acknowledged",
    icon: Eye,
    tone: "info",
    description: "A clinician has seen and acknowledged the event.",
  },
  under_review: {
    label: "Under review",
    icon: Search,
    tone: "info",
    description: "The event is being reviewed by a clinician.",
  },
  resolved: {
    label: "Resolved",
    icon: CheckCircle2,
    tone: "success",
    description: "The event is closed. Its original record is preserved.",
  },
  false_positive: {
    label: "False positive",
    icon: XCircle,
    tone: "neutral",
    description: "Reviewed and determined not to represent a real signal.",
  },
  unknown: {
    label: "Unknown status",
    icon: CircleHelp,
    tone: "neutral",
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
