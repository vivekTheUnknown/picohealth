import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Archive,
  Circle,
  CircleHelp,
  FlaskConical,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/cn";
import type { DeviceStatus } from "@/lib/types";

const DEVICE: Record<
  DeviceStatus,
  { label: string; icon: LucideIcon; classes: string }
> = {
  active: {
    label: "Active",
    icon: Activity,
    classes: "border-success/30 bg-success-subtle text-success",
  },
  registered: {
    label: "Registered",
    icon: Circle,
    classes: "border-line bg-surface-active text-ink-muted",
  },
  faulty: {
    label: "Faulty",
    icon: AlertTriangle,
    classes: "border-danger/30 bg-danger-subtle text-danger",
  },
  lost: {
    label: "Lost",
    icon: AlertOctagon,
    classes: "border-danger/30 bg-danger-subtle text-danger",
  },
  retired: {
    label: "Retired",
    icon: Archive,
    classes: "border-line bg-surface-active text-ink-muted",
  },
  under_test: {
    label: "Under test",
    icon: FlaskConical,
    classes: "border-warning/30 bg-warning-subtle text-warning",
  },
  unknown: {
    label: "Unknown status",
    icon: CircleHelp,
    classes: "border-line bg-surface-active text-ink-muted",
  },
};

export function DeviceStatusBadge({
  status,
  className,
}: {
  status: DeviceStatus;
  className?: string;
}) {
  const config = DEVICE[status] ?? DEVICE.unknown;
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
