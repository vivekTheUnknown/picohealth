import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/cn";
import { Skeleton } from "@/components/layout/skeleton";

export interface StatCardProps {
  label: string;
  value: number | string | null;
  hint?: string;
  icon: LucideIcon;
  href?: string;
  tone?: "default" | "attention" | "critical" | "positive";
  loading?: boolean;
}

const TONES = {
  default: "bg-accent-50 text-accent-700",
  attention: "bg-amber-50 text-amber-700",
  critical: "bg-red-50 text-red-700",
  positive: "bg-emerald-50 text-emerald-700",
} as const;

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
  tone = "default",
  loading = false,
}: StatCardProps) {
  const displayValue = value === null || value === undefined || value === "" ? "—" : value;
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{label}</p>
        <span
          className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", TONES[tone])}
          aria-hidden="true"
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-16" />
      ) : (
        <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-ink">
          {displayValue}
        </p>
      )}
      <p className="mt-1 min-h-4 text-xs leading-5 text-ink-subtle">
        {value === null && !loading ? "Not reported" : hint}
      </p>
      {href ? (
        <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent-800">
          Open
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </span>
      ) : null}
    </>
  );

  const className =
    "block rounded-xl border border-line bg-surface p-4 shadow-card transition-colors";

  if (href) {
    return (
      <Link href={href} className={cn(className, "hover:border-accent-300 hover:bg-accent-50/30")}>
        {body}
      </Link>
    );
  }

  return <div className={className}>{body}</div>;
}
