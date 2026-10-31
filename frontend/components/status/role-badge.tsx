import { HeartPulse, ShieldCheck, Stethoscope } from "lucide-react";

import { cn } from "@/lib/cn";
import type { Role } from "@/lib/types";

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  const config =
    role === "admin"
      ? { label: "Administrator", Icon: ShieldCheck, classes: "border-info/30 bg-info-subtle text-info" }
      : role === "patient"
        ? { label: "Patient", Icon: HeartPulse, classes: "border-success/30 bg-success-subtle text-success" }
        : { label: "Doctor", Icon: Stethoscope, classes: "border-accent/30 bg-accent-subtle text-accent" };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 h-5 rounded-sm border px-1.5 text-2xs font-medium",
        config.classes,
        className,
      )}
    >
      <config.Icon className="h-3 w-3" aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  );
}
