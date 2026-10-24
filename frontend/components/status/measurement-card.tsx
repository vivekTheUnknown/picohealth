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
 * One cell of the measurement strip (style.md §9).
 *
 * Borderless by design: cells are separated by hairlines from the grid that
 * composes them, so six metrics read as one strip rather than six nested cards
 * (style.md §4 forbids card-on-card). A stale value is de-emphasised, labelled
 * "Last known", and carries its last-received time.
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
  const quality: QualityStatus = measurement?.quality_status ?? "unknown";
  const windowLabel = measurement
    ? formatWindow(measurement.window_start, measurement.window_end, timeZone)
    : null;
  const comparison = measurement ? baselineNote(measurement, baseline) : null;
  const noData = !measurement;

  return (
    <div className={cn("flex min-w-0 flex-col bg-surface px-4 py-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-2xs font-medium text-ink-subtle">
          {humanizeMetric(metric)}
        </p>
        {stale ? (
          <span className="shrink-0 text-2xs font-medium text-warning">Last known</span>
        ) : null}
      </div>

      {measurement ? (
        <p className="mt-1 flex flex-wrap items-baseline gap-1">
          <span
            className={cn(
              "text-4xl font-semibold tracking-tight tabular",
              stale ? "text-ink-muted" : "text-ink",
            )}
          >
            {formatNumber(measurement.value)}
          </span>
          <span className="text-xs text-ink-subtle">{measurement.unit}</span>
        </p>
      ) : (
        <p className="mt-1.5 text-xl font-medium text-ink-subtle">No recent data</p>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {measurement ? (
          measurement.observed_at ? (
            <DataFreshness
              timestamp={measurement.observed_at}
              staleAfterMinutes={freshness.staleAfterMinutes}
              timeZone={timeZone}
            />
          ) : (
            <span className="inline-flex h-5 items-center gap-1 rounded-sm border border-warning/30 bg-warning-subtle px-1.5 text-2xs font-medium text-warning">
              <Clock className="h-3 w-3" aria-hidden="true" />
              Timestamp not reported
            </span>
          )
        ) : null}
        {measurement ? <QualityBadge quality={quality} /> : null}
      </div>

      <div className="mt-auto pt-2 text-2xs leading-4 text-ink-subtle">
        {noData ? (
          <p>No measurement received for this period.</p>
        ) : (
          <>
            {windowLabel ? (
              <p className="truncate">
                Window {windowLabel}
                {measurement?.algorithm_version ? ` · ${measurement.algorithm_version}` : ""}
              </p>
            ) : measurement?.algorithm_version ? (
              <p className="truncate">Algorithm {measurement.algorithm_version}</p>
            ) : null}
            {comparison ? (
              <p className="mt-0.5 inline-flex items-center gap-1">
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
          </>
        )}
      </div>
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
        "inline-flex h-5 items-center gap-1 rounded-sm border px-1.5 text-2xs",
        !measurement
          ? "border-line bg-surface-raised text-ink-subtle"
          : stale || unknownTime
            ? "border-warning/30 bg-warning-subtle text-warning"
            : "border-line bg-surface text-ink",
      )}
    >
      <span className="font-medium">{shortMetricLabel(metric)}</span>
      {measurement ? (
        <span className="tabular">
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
