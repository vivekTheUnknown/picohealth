import {
  AlertTriangle,
  Check,
  CircleHelp,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/cn";
import type { QualityStatus } from "@/lib/types";

const QUALITY: Record<
  QualityStatus,
  { label: string; icon: LucideIcon; classes: string; description: string }
> = {
  good: {
    label: "Signal good",
    icon: Check,
    classes: "border-success/30 bg-success-subtle text-success",
    description: "Signal quality is reported as good for this value.",
  },
  fair: {
    label: "Signal fair",
    icon: AlertTriangle,
    classes: "border-warning/30 bg-warning-subtle text-warning",
    description: "Signal quality is fair. Interpret with some caution.",
  },
  poor: {
    label: "Signal poor",
    icon: XCircle,
    classes: "border-danger/30 bg-danger-subtle text-danger",
    description: "Signal quality is poor. The value may be unreliable.",
  },
  unknown: {
    label: "Signal unknown",
    icon: CircleHelp,
    classes: "border-line bg-surface-active text-ink-muted",
    description: "No signal-quality assessment was reported.",
  },
};

export function QualityBadge({
  quality,
  className,
}: {
  quality: QualityStatus;
  className?: string;
}) {
  const config = QUALITY[quality] ?? QUALITY.unknown;
  const Icon = config.icon;
  return (
    <span
      title={config.description}
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
