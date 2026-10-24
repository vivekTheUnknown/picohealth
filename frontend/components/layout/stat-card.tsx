import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

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

/**
 * One metric cell, not a standalone tile.
 *
 * style.md §4 prefers compact measurement strips over oversized metric tiles,
 * so this renders flush and is composed inside a single bordered panel (see the
 * overview pages). Only the icon carries a semantic tone; the number stays
 * primary text so a "0" is never dressed up as a success.
 */
const TONES: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "text-ink-subtle",
  attention: "text-warning",
  critical: "text-danger",
  positive: "text-accent",
};

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
      <div className="flex items-center gap-1.5 text-2xs text-ink-subtle">
        <Icon className={cn("h-3.5 w-3.5 shrink-0", TONES[tone])} aria-hidden="true" />
        <span className="truncate">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-6 w-12" />
      ) : (
        <p className="mt-1.5 text-4xl font-semibold tracking-tight text-ink tabular">
          {displayValue}
        </p>
      )}
      <p className="mt-0.5 flex items-center gap-1 text-2xs leading-4 text-ink-subtle">
        {value === null && !loading ? "Not reported" : hint}
        {href ? (
          <>
            <span className="sr-only">. Open detail.</span>
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </>
        ) : null}
      </p>
    </>
  );

  const classes = cn(
    "group relative flex flex-col bg-surface px-4 py-3 transition-colors duration-fast",
    href && "hover:bg-surface-raised/60 focus-within:bg-surface-raised/60",
  );

  if (!href) {
    return <div className={classes}>{body}</div>;
  }

  return (
    <div className={classes}>
      <Link
        href={href}
        className="absolute inset-0 rounded-sm focus-visible:outline-offset-[-2px]"
        aria-label={`${label}: ${displayValue}. Open detail.`}
      />
      {body}
    </div>
  );
}
