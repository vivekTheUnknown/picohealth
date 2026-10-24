import { ShieldCheck, Stethoscope } from "lucide-react";

import { cn } from "@/lib/cn";
import type { Role } from "@/lib/types";

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  const isAdmin = role === "admin";
  const Icon = isAdmin ? ShieldCheck : Stethoscope;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 h-5 rounded-sm border px-1.5 text-2xs font-medium",
        isAdmin
          ? "border-info/30 bg-info-subtle text-info"
          : "border-accent/30 bg-accent-subtle text-accent",
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span>{isAdmin ? "Administrator" : "Doctor"}</span>
    </span>
  );
}
