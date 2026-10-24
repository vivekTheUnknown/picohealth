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
  /** Short form for table cells: omits the "received" label. */
  compact?: boolean;
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
  compact = false,
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
          "inline-flex min-h-5 items-center gap-1 whitespace-nowrap rounded-sm border border-warning/30 bg-warning-subtle px-1.5 py-0.5 text-2xs font-medium text-warning",
          className,
        )}
      >
        <Clock className="h-3 w-3" aria-hidden="true" />
        <span>
          Stale · {compact ? "" : `${label.toLowerCase()} `}
          {relative}
        </span>
        {showAbsolute && absolute ? (
          <span className="font-normal opacity-80">({absolute})</span>
        ) : null}
      </span>
    );
  }

  return (
    <span
      title={`${label}: ${absolute ?? "unknown"}. Within the ${staleAfterMinutes}-minute freshness window.`}
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-muted", className)}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />
      <span>
        {compact ? "" : `${label} `}
        {relative}
      </span>
      {showAbsolute && absolute ? (
        <span className="text-ink-subtle">({absolute})</span>
      ) : null}
    </span>
  );
}
