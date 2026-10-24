"use client";

import { useMemo, useState } from "react";
import { RefreshCw, TrendingUp } from "lucide-react";

import { getMeasurements } from "@/lib/api";
import { TREND_METRICS, TREND_RANGES, type TrendRangeKey } from "@/lib/constants";
import { cn } from "@/lib/cn";
import { formatDateTime, humanizeMetric } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import type { PatientOverview } from "@/lib/types";
import { Button } from "@/components/forms/button";
import { EmptyState } from "@/components/layout/empty-state";
import { ErrorState } from "@/components/layout/error-state";
import { SectionCard } from "@/components/layout/section-card";
import { Skeleton } from "@/components/layout/skeleton";
import { TrendChart } from "@/components/charts/trend-chart";

export function TrendsPanel({
  patientId,
  overview,
  timeZone,
}: {
  patientId: string;
  overview: PatientOverview;
  timeZone: string;
}) {
  const [rangeKey, setRangeKey] = useState<TrendRangeKey>("24h");
  const [anchor, setAnchor] = useState(() => Date.now());

  const range = TREND_RANGES.find((entry) => entry.key === rangeKey) ?? TREND_RANGES[2];
  const from = useMemo(
    () => new Date(anchor - range.hours * 60 * 60 * 1000).toISOString(),
    [anchor, range.hours],
  );
  const to = useMemo(() => new Date(anchor).toISOString(), [anchor]);

  const measurements = useApi(
    (signal) =>
      getMeasurements(
        patientId,
        { from, to, metrics: TREND_METRICS as string[] },
        signal,
      ),
    [patientId, from, to],
  );

  const data = measurements.data ?? [];
  const available = TREND_METRICS.filter((metric) =>
    data.some((measurement) => measurement.metric_type === metric),
  );
  const unavailable = TREND_METRICS.filter((metric) => !available.includes(metric));
  const baselines = new Map(overview.baselines.map((baseline) => [baseline.metric_type, baseline]));
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);

  const selectRange = (next: TrendRangeKey) => {
    setRangeKey(next);
    setAnchor((previous) => Math.max(Date.now(), previous + 1));
  };

  return (
    <div className="space-y-5">
      <SectionCard
        title="Trends"
        description="Measurements are plotted from recorded summaries only. Long gaps break the line; missing values are not interpolated."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAnchor((previous) => Math.max(Date.now(), previous + 1))}
            loading={measurements.loading}
            loadingLabel="Refreshing"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Refresh
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div
              className="flex flex-wrap gap-1 rounded-lg border border-line bg-slate-50 p-1"
              role="group"
              aria-label="Trend time range"
            >
              {TREND_RANGES.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  aria-pressed={entry.key === rangeKey}
                  onClick={() => selectRange(entry.key)}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                    entry.key === rangeKey
                      ? "bg-surface text-accent-900 shadow-sm"
                      : "text-ink-muted hover:bg-surface/70 hover:text-ink",
                  )}
                >
                  {entry.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-ink-subtle">
              {formatDateTime(from, timeZone)} → {formatDateTime(to, timeZone)}
            </p>
          </div>

          {measurements.error ? (
            measurements.error.isForbidden ? (
              <ErrorState
                title="Trend access restricted"
                error={measurements.error}
                message="The API did not permit access to this patient's trend data."
              />
            ) : (
              <ErrorState
                title="Trend data could not be loaded"
                error={measurements.error}
                onRetry={measurements.reload}
                retrying={measurements.loading}
              />
            )
          ) : measurements.loading && !measurements.data ? (
            <div className="space-y-3" role="status" aria-live="polite">
              <span className="sr-only">Loading trend data</span>
              <Skeleton className="h-64 w-full rounded-xl" />
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          ) : data.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="No measurements in this window"
              description="No summaries were recorded for this range. Try a longer range. Gaps may reflect device disconnection, unavailable sensors, or unsynced data."
            />
          ) : (
            <>
              <div className="space-y-4">
                {available.map((metric) => (
                  <div
                    key={metric}
                    className="rounded-xl border border-line bg-surface p-4 shadow-card"
                  >
                    <TrendChart
                      measurements={data}
                      metric={metric}
                      fromMs={fromMs}
                      toMs={toMs}
                      timeZone={timeZone}
                      baseline={baselines.get(metric) ?? null}
                    />
                  </div>
                ))}
              </div>
              {unavailable.length > 0 ? (
                <p className="text-[11px] leading-5 text-ink-subtle">
                  No recorded values in this range for:{" "}
                  {unavailable.map((metric) => humanizeMetric(metric)).join(", ")}.
                </p>
              ) : null}
              {overview.baselines.length > 0 ? (
                <p className="text-[11px] leading-5 text-ink-subtle">
                  Personal baselines are shown only where the backend reported a suitable
                  baseline. They are patient-specific, not population reference ranges.
                </p>
              ) : null}
            </>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
