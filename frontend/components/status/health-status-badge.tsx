import { AlertTriangle, CheckCircle2, CircleHelp, XCircle, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/cn";

type Tone = "ok" | "degraded" | "down" | "unknown";

const CONFIG: Record<Tone, { label: string; icon: LucideIcon; classes: string }> = {
  ok: {
    label: "Operational",
    icon: CheckCircle2,
    classes: "border-success/30 bg-success-subtle text-success",
  },
  degraded: {
    label: "Degraded",
    icon: AlertTriangle,
    classes: "border-warning/30 bg-warning-subtle text-warning",
  },
  down: {
    label: "Down",
    icon: XCircle,
    classes: "border-danger/30 bg-danger-subtle text-danger",
  },
  unknown: {
    label: "Unknown",
    icon: CircleHelp,
    classes: "border-line bg-surface-active text-ink-muted",
  },
};

export function healthTone(status: string | null | undefined): Tone {
  const value = (status ?? "").toLowerCase();
  if (["ok", "up", "healthy", "operational", "pass", "ready", "available"].includes(value)) {
    return "ok";
  }
  if (["degraded", "warning", "warn", "partial", "slow", "starting"].includes(value)) {
    return "degraded";
  }
  if (["down", "unhealthy", "error", "fail", "failed", "critical", "unavailable"].includes(value)) {
    return "down";
  }
  return "unknown";
}

export function HealthStatusBadge({
  status,
  label,
  className,
}: {
  status: string | null | undefined;
  /** Overrides the generic label while keeping the tone and icon. */
  label?: string;
  className?: string;
}) {
  const config = CONFIG[healthTone(status)];
  const Icon = config.icon;
  return (
    <span
      title={status ? `Reported status: ${status}` : "No status was reported."}
      className={cn(
        "inline-flex items-center gap-1 h-5 rounded-sm border px-1.5 text-2xs font-medium",
        config.classes,
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span>{label ?? config.label}</span>
      {status ? <span className="font-normal opacity-80">({status})</span> : null}
    </span>
  );
}
