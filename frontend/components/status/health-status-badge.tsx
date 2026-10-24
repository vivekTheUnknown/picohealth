import { AlertTriangle, CheckCircle2, CircleHelp, XCircle, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/cn";

type Tone = "ok" | "degraded" | "down" | "unknown";

const CONFIG: Record<Tone, { label: string; icon: LucideIcon; classes: string }> = {
  ok: {
    label: "Operational",
    icon: CheckCircle2,
    classes: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  degraded: {
    label: "Degraded",
    icon: AlertTriangle,
    classes: "border-amber-200 bg-amber-50 text-amber-900",
  },
  down: {
    label: "Down",
    icon: XCircle,
    classes: "border-red-200 bg-red-50 text-red-800",
  },
  unknown: {
    label: "Unknown",
    icon: CircleHelp,
    classes: "border-line-strong bg-slate-100 text-slate-700",
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
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
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
