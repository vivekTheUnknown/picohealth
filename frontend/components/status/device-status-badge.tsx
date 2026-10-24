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
    classes: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  registered: {
    label: "Registered",
    icon: Circle,
    classes: "border-line-strong bg-slate-100 text-slate-700",
  },
  faulty: {
    label: "Faulty",
    icon: AlertTriangle,
    classes: "border-red-200 bg-red-50 text-red-800",
  },
  lost: {
    label: "Lost",
    icon: AlertOctagon,
    classes: "border-red-200 bg-red-50 text-red-800",
  },
  retired: {
    label: "Retired",
    icon: Archive,
    classes: "border-line-strong bg-slate-100 text-slate-700",
  },
  under_test: {
    label: "Under test",
    icon: FlaskConical,
    classes: "border-amber-200 bg-amber-50 text-amber-900",
  },
  unknown: {
    label: "Unknown status",
    icon: CircleHelp,
    classes: "border-line-strong bg-slate-100 text-slate-700",
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
