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
    classes: "border-emerald-200 bg-emerald-50 text-emerald-800",
    description: "Signal quality is reported as good for this value.",
  },
  fair: {
    label: "Signal fair",
    icon: AlertTriangle,
    classes: "border-amber-200 bg-amber-50 text-amber-900",
    description: "Signal quality is fair. Interpret with some caution.",
  },
  poor: {
    label: "Signal poor",
    icon: XCircle,
    classes: "border-red-200 bg-red-50 text-red-800",
    description: "Signal quality is poor. The value may be unreliable.",
  },
  unknown: {
    label: "Signal unknown",
    icon: CircleHelp,
    classes: "border-line-strong bg-slate-100 text-slate-700",
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
