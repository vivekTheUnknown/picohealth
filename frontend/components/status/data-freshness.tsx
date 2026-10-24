"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

import { cn } from "@/lib/cn";
import { formatDateTime, formatRelative } from "@/lib/format";
import {
  DEFAULT_STALE_AFTER_MINUTES,
  freshnessFor,
} from "@/lib/freshness";

export interface DataFreshnessProps {
  /** ISO timestamp of the newest received/observed value. */
  timestamp: string | null | undefined;
  staleAfterMinutes?: number;
  timeZone?: string | null;
  label?: string;
  showAbsolute?: boolean;
  className?: string;
}

/**
 * Never presents an old value as current. Fresh data is quietly labelled; stale
 * data gets an amber, text-explicit "Stale" state with the last-received time.
 */
export function DataFreshness({
  timestamp,
  staleAfterMinutes = DEFAULT_STALE_AFTER_MINUTES,
  timeZone,
  label = "Last received",
  showAbsolute = false,
  className,
}: DataFreshnessProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const freshness = freshnessFor(timestamp, staleAfterMinutes, now);
  const absolute = timestamp ? formatDateTime(timestamp, timeZone) : null;

  if (freshness.state === "unavailable") {
    return (
      <span
        title={
          timestamp
            ? "The timestamp could not be read."
            : "No recent data has been received for this record."
        }
        className={cn("inline-flex items-center gap-1 text-xs text-ink-subtle", className)}
      >
        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
        <span>No recent data</span>
      </span>
    );
  }

  const relative = formatRelative(timestamp, now);

  if (freshness.state === "stale") {
    return (
      <span
        title={`${label}: ${absolute ?? "unknown"}. Older than the ${staleAfterMinutes}-minute freshness window.`}
        className={cn(
          "inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-900",
          className,
        )}
      >
        <Clock className="h-3 w-3" aria-hidden="true" />
        <span>Stale · {label.toLowerCase()} {relative}</span>
        {showAbsolute && absolute ? (
          <span className="font-normal opacity-80">({absolute})</span>
        ) : null}
      </span>
    );
  }

  return (
    <span
      title={`${label}: ${absolute ?? "unknown"}. Within the ${staleAfterMinutes}-minute freshness window.`}
      className={cn("inline-flex items-center gap-1.5 text-xs text-ink-muted", className)}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
      <span>
        {label} {relative}
      </span>
      {showAbsolute && absolute ? (
        <span className="text-ink-subtle">({absolute})</span>
      ) : null}
    </span>
  );
}
