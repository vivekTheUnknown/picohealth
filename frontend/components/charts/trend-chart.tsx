"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";

import { cn } from "@/lib/cn";
import { CHART_TOKENS, METRIC_CHART_COLORS } from "@/lib/constants";
import {
  formatAxisTick,
  formatDateTime,
  formatNumber,
  humanizeMetric,
} from "@/lib/format";
import type { Baseline, Measurement } from "@/lib/types";

export interface TrendDatum {
  t: number;
  value: number | null;
}

/**
 * Builds a series with explicit nulls across long gaps. Recharts then breaks
 * the line instead of drawing continuity that the data does not support.
 */
export function buildTrendData(
  measurements: Measurement[],
  metric: string,
): TrendDatum[] {
  const points = measurements
    .filter((measurement) => measurement.metric_type === metric && measurement.observed_at)
    .map((measurement) => ({
      t: Date.parse(measurement.observed_at as string),
      value: measurement.value,
    }))
    .filter((point) => !Number.isNaN(point.t))
    .sort((a, b) => a.t - b.t);

  if (points.length < 2) return points;

  const intervals: number[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const delta = points[index].t - points[index - 1].t;
    if (delta > 0) intervals.push(delta);
  }
  intervals.sort((a, b) => a - b);
  const median = intervals.length > 0 ? intervals[Math.floor(intervals.length / 2)] : 0;
  const gapThreshold = Math.max(median * 3, 5 * 60_000);

  const withGaps: TrendDatum[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const previous = points[index - 1];
    if (previous && point.t - previous.t > gapThreshold) {
      withGaps.push({ t: previous.t + gapThreshold / 2, value: null });
    }
    withGaps.push(point);
  }
  return withGaps;
}

function ChartTooltip({
  active,
  payload,
  label,
  unit,
  timeZone,
}: TooltipContentProps & { unit: string; timeZone?: string | null }) {
  if (!active || !payload || payload.length === 0) return null;
  const value = payload[0]?.value;
  const numericValue = typeof value === "number" ? value : Number(value);
  const time = typeof label === "number" ? label : Number(label);

  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-raised">
      <p className="font-medium text-ink">
        {Number.isFinite(numericValue)
          ? `${formatNumber(numericValue)} ${unit}`
          : "No value"}
      </p>
      <p className="mt-0.5 text-ink-subtle">
        {Number.isFinite(time) ? formatDateTime(time, timeZone) : "Time unavailable"}
      </p>
    </div>
  );
}

export interface TrendChartProps {
  measurements: Measurement[];
  metric: string;
  fromMs: number;
  toMs: number;
  timeZone?: string | null;
  baseline?: Baseline | null;
  height?: number;
  className?: string;
}

export function TrendChart({
  measurements,
  metric,
  fromMs,
  toMs,
  timeZone,
  baseline,
  height = 240,
  className,
}: TrendChartProps) {
  const data = useMemo(() => buildTrendData(measurements, metric), [measurements, metric]);
  const points = useMemo(() => data.filter((point) => point.value !== null), [data]);
  const color = METRIC_CHART_COLORS[metric] ?? CHART_TOKENS.accent;
  const label = humanizeMetric(metric);
  const unit = measurements.find((measurement) => measurement.metric_type === metric)?.unit ?? "";
  const span = Math.max(1, toMs - fromMs);

  if (points.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-surface-raised/50 px-4 text-center",
          className,
        )}
        style={{ height }}
      >
        <p className="text-sm font-medium text-ink">No measurements in this window</p>
        <p className="mt-1 max-w-sm text-xs leading-5 text-ink-subtle">
          The device may have been disconnected, the sensor unavailable, or data may not have
          synced yet. Gaps are not filled with estimated values.
        </p>
      </div>
    );
  }

  const ariaSummary = `${label} trend with ${points.length} recorded points between ${formatDateTime(
    fromMs,
    timeZone,
  )} and ${formatDateTime(toMs, timeZone)}.`;

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
          {label}
          {unit ? <span className="font-normal text-ink-subtle">({unit})</span> : null}
        </span>
        <span className="text-2xs text-ink-subtle">
          {points.length} {points.length === 1 ? "value" : "values"}
        </span>
      </div>

      <div role="img" aria-label={ariaSummary} style={{ width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={CHART_TOKENS.grid} strokeDasharray="3 3" vertical={false} />
            {baseline && baseline.low !== null && baseline.high !== null ? (
              <ReferenceArea
                y1={baseline.low}
                y2={baseline.high}
                fill={CHART_TOKENS.axis}
                fillOpacity={0.06}
                stroke="none"
              />
            ) : null}
            {baseline && baseline.value !== null ? (
              <ReferenceLine
                y={baseline.value}
                stroke={CHART_TOKENS.axis}
                strokeDasharray="4 4"
                label={{
                  value: "Personal baseline",
                  position: "insideTopRight",
                  fill: CHART_TOKENS.axis,
                  fontSize: 10,
                }}
              />
            ) : null}
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[fromMs, toMs]}
              tickFormatter={(value) => formatAxisTick(Number(value), timeZone, span)}
              tick={{ fontSize: 11, fill: CHART_TOKENS.axis }}
              stroke={CHART_TOKENS.grid}
              minTickGap={32}
            />
            <YAxis
              domain={["auto", "auto"]}
              width={48}
              tick={{ fontSize: 11, fill: CHART_TOKENS.axis }}
              stroke={CHART_TOKENS.grid}
              tickFormatter={(value) => formatNumber(Number(value), 0)}
            />
            <Tooltip
              content={(props) => (
                <ChartTooltip {...props} unit={unit} timeZone={timeZone} />
              )}
              cursor={{ stroke: CHART_TOKENS.baseline, strokeDasharray: "3 3" }}
            />
            <Line
              type="monotone"
              dataKey="value"
              name={label}
              stroke={color}
              strokeWidth={2}
              dot={points.length <= 48 ? { r: 2, strokeWidth: 0, fill: color } : false}
              activeDot={{ r: 4, strokeWidth: 0, fill: color }}
              isAnimationActive={false}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <details className="mt-1.5">
        <summary className="cursor-pointer select-none text-xs text-accent hover:underline">
          View underlying values
        </summary>
        <div className="mt-2 max-h-48 overflow-auto rounded-md border border-line">
          <table className="min-w-full text-left text-xs">
            <caption className="sr-only">{label} recorded values</caption>
            <thead className="sticky top-0 bg-surface-raised">
              <tr>
                <th scope="col" className="px-2 py-1.5 font-medium text-ink-subtle">
                  Time
                </th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium text-ink-subtle">
                  Value
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {points.slice(-200).map((point, index) => (
                <tr key={`${point.t}-${index}`}>
                  <td className="whitespace-nowrap px-2 py-1.5 text-ink-muted">
                    {formatDateTime(point.t, timeZone)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-ink">
                    {formatNumber(point.value)} {unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {points.length > 200 ? (
          <p className="mt-1 text-2xs text-ink-subtle">Showing the 200 most recent values.</p>
        ) : null}
      </details>
    </div>
  );
}
