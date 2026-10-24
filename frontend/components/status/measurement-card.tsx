import { ArrowDownRight, ArrowUpRight, Clock, Minus } from "lucide-react";

import { cn } from "@/lib/cn";
import { metricFreshness } from "@/lib/freshness";
import {
  formatNumber,
  formatWindow,
  humanizeMetric,
  shortMetricLabel,
} from "@/lib/format";
import type { Baseline, Measurement, QualityStatus } from "@/lib/types";
import { DataFreshness } from "@/components/status/data-freshness";
import { QualityBadge } from "@/components/status/quality-badge";
import { StatusBadge } from "@/components/status/status-badge";

function baselineNote(measurement: Measurement, baseline: Baseline | null | undefined): {
  text: string;
  direction: "up" | "down" | "level";
} | null {
  if (!baseline || baseline.value === null) return null;
  const delta = measurement.value - baseline.value;
  const epsilon = Math.abs(baseline.value) * 0.02 || 0.5;
  const windowText = baseline.window_days ? ` over ${baseline.window_days} days` : "";
  if (Math.abs(delta) <= epsilon) {
    return { text: `At personal baseline${windowText}`, direction: "level" };
  }
  return {
    text: `${formatNumber(Math.abs(delta))} ${measurement.unit} ${
      delta > 0 ? "above" : "below"
    } personal baseline${windowText}`,
    direction: delta > 0 ? "up" : "down",
  };
}

export interface MeasurementCardProps {
  metric: string;
  measurement: Measurement | null;
  baseline?: Baseline | null;
  timeZone?: string | null;
  className?: string;
}

/**
 * One current-measurement tile. A stale value is explicitly labelled
 * "Last known", carries a Stale status, and shows when it was last received.
 */
export function MeasurementCard({
  metric,
  measurement,
  baseline,
  timeZone,
  className,
}: MeasurementCardProps) {
  const freshness = metricFreshness(metric, measurement?.observed_at);
  const stale = freshness.state === "stale";
  const sourceStatus = measurement
    ? measurement.source_type === "unknown"
      ? "unknown"
      : measurement.source_type
    : "unavailable";
  const quality: QualityStatus = measurement?.quality_status ?? "unknown";
  const windowLabel = measurement
    ? formatWindow(measurement.window_start, measurement.window_end, timeZone)
    : null;
  const comparison = measurement ? baselineNote(measurement, baseline) : null;

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border border-line bg-surface p-3.5",
        stale && "border-amber-200",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-ink-subtle">{humanizeMetric(metric)}</p>
          {measurement ? (
            <>
              {stale ? (
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                  Last known value
                </p>
              ) : null}
              <p className="mt-0.5 flex flex-wrap items-baseline gap-1.5">
                <span
                  className={cn(
                    "text-2xl font-semibold tabular-nums tracking-tight",
                    stale ? "text-ink-muted" : "text-ink",
                  )}
                >
                  {formatNumber(measurement.value)}
                </span>
                <span className="text-xs text-ink-subtle">{measurement.unit}</span>
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm font-medium text-ink-muted">No recent data</p>
          )}
        </div>
        <StatusBadge status={sourceStatus} size="sm" />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {measurement ? (
          measurement.observed_at ? (
            <DataFreshness
              timestamp={measurement.observed_at}
              staleAfterMinutes={freshness.staleAfterMinutes}
              timeZone={timeZone}
            />
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-900">
              <Clock className="h-3 w-3" aria-hidden="true" />
              Timestamp not reported
            </span>
          )
        ) : (
          <span className="text-xs text-ink-subtle">No measurement received for this period.</span>
        )}
        {measurement ? <QualityBadge quality={quality} /> : null}
      </div>

      {measurement ? (
        <div className="mt-2 space-y-1 text-[11px] leading-4 text-ink-subtle">
          {windowLabel ? (
            <p>
              Aggregation window {windowLabel}
              {measurement.algorithm_version ? ` · algorithm ${measurement.algorithm_version}` : ""}
            </p>
          ) : measurement.algorithm_version ? (
            <p>Algorithm {measurement.algorithm_version}</p>
          ) : null}
          {comparison ? (
            <p
              className={cn(
                "inline-flex items-center gap-1",
                comparison.direction === "up" && "text-ocean-800",
                comparison.direction === "down" && "text-ocean-800",
              )}
            >
              {comparison.direction === "up" ? (
                <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
              ) : comparison.direction === "down" ? (
                <ArrowDownRight className="h-3 w-3" aria-hidden="true" />
              ) : (
                <Minus className="h-3 w-3" aria-hidden="true" />
              )}
              {comparison.text}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function MeasurementChip({
  metric,
  measurement,
}: {
  metric: string;
  measurement: Measurement | null;
}) {
  const freshness = metricFreshness(metric, measurement?.observed_at);
  const stale = freshness.state === "stale";
  const unknownTime = Boolean(measurement && !measurement.observed_at);
  return (
    <span
      title={
        measurement
          ? `${humanizeMetric(metric)}: ${formatNumber(measurement.value)} ${measurement.unit}${
              measurement.observed_at ? ` at ${measurement.observed_at}` : " (time not reported)"
            }`
          : `${humanizeMetric(metric)}: no recent data`
      }
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]",
        !measurement
          ? "border-line bg-slate-50 text-ink-subtle"
          : stale || unknownTime
            ? "border-amber-200 bg-amber-50 text-amber-900"
            : "border-line bg-surface text-ink",
      )}
    >
      <span className="font-medium">{shortMetricLabel(metric)}</span>
      {measurement ? (
        <span className="tabular-nums">
          {formatNumber(measurement.value)} {measurement.unit}
        </span>
      ) : (
        <span>—</span>
      )}
      {stale ? <span className="font-semibold">stale</span> : null}
      {unknownTime ? <span className="font-semibold">time?</span> : null}
    </span>
  );
}
