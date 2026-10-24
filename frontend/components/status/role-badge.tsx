import { ShieldCheck, Stethoscope } from "lucide-react";

import { cn } from "@/lib/cn";
import type { Role } from "@/lib/types";

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  const isAdmin = role === "admin";
  const Icon = isAdmin ? ShieldCheck : Stethoscope;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
        isAdmin
          ? "border-indigo-200 bg-indigo-50 text-indigo-800"
          : "border-accent-200 bg-accent-50 text-accent-800",
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span>{isAdmin ? "Administrator" : "Doctor"}</span>
    </span>
  );
}
