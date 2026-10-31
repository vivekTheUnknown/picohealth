"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  CircleDot,
  Droplets,
  Gauge,
  HeartPulse,
  Thermometer,
  Waves,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { activityLabel, opticalStateView, orientationLabel } from "@/lib/app-metrics";
import { cn } from "@/lib/cn";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { AppRecord } from "@/lib/types";
import { Badge } from "@/components/status/badge";
import { SectionCard } from "@/components/layout/section-card";
import { EmptyState } from "@/components/layout/empty-state";
import { DataTable, type Column } from "@/components/tables/data-table";

function MetricCell({
  label,
  value,
  unit,
  hint,
  icon: Icon,
  tone = "text-ink",
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: string;
}) {
  return (
    <div className="rounded-md border border-line bg-surface p-3">
      <div className="flex items-center gap-1.5 text-2xs text-ink-subtle">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{label}</span>
      </div>
      <p className={cn("mt-1.5 text-2xl font-semibold tracking-tight tabular", tone)}>
        {value}
        {unit ? <span className="ml-1 text-xs font-normal text-ink-subtle">{unit}</span> : null}
      </p>
      {hint ? <p className="mt-0.5 text-2xs leading-4 text-ink-subtle">{hint}</p> : null}
    </div>
  );
}

function numberOrDash(value: number | null, digits = 1): string {
  return value === null ? "—" : formatNumber(value, digits);
}

interface TrendPoint {
  t: number;
  value: number | null;
}

const METRICS = [
  { key: "heart_rate_bpm", label: "Heart rate", unit: "bpm", color: "#E5484D" },
  { key: "spo2_percent", label: "SpO₂", unit: "%", color: "#3E9ED0" },
  { key: "temperature_c", label: "Temperature", unit: "°C", color: "#E5A23A" },
  { key: "perfusion_index_percent", label: "Perfusion index", unit: "%", color: "#8E6CE0" },
  { key: "prv_rmssd_ms", label: "PRV (RMSSD)", unit: "ms", color: "#2FA36B" },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];

function metricValue(record: AppRecord, key: MetricKey): number | null {
  return record[key];
}

function extraNumber(extra: Record<string, unknown> | null, key: string): number | null {
  if (!extra) return null;
  const value = extra[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extraString(extra: Record<string, unknown> | null, key: string): string | null {
  if (!extra) return null;
  const value = extra[key];
  return typeof value === "string" ? value : null;
}

function triple(extra: Record<string, unknown> | null, key: string): string {
  if (!extra) return "—";
  const value = extra[key];
  if (!Array.isArray(value) || value.length !== 3) return "—";
  if (!value.every((entry) => typeof entry === "number")) return "—";
  return value
    .map((entry) => formatNumber(entry as number, 2))
    .join(", ");
}

/** Five-minute temperature trend, matching the app's dashboard window. */
function temperatureTrend(records: AppRecord[]): { delta: number | null; average: number | null } {
  const withTemperature = records
    .filter((record) => record.temperature_c !== null && record.measured_at)
    .sort((a, b) => Date.parse(a.measured_at as string) - Date.parse(b.measured_at as string));
  if (withTemperature.length < 2) {
    return {
      delta: null,
      average:
        withTemperature.length === 1 ? withTemperature[0].temperature_c : null,
    };
  }
  const latestMs = Date.parse(withTemperature[withTemperature.length - 1].measured_at as string);
  const window = withTemperature.filter(
    (record) => Date.parse(record.measured_at as string) >= latestMs - 5 * 60_000,
  );
  if (window.length < 2) return { delta: null, average: window[0]?.temperature_c ?? null };
  const first = window[0].temperature_c as number;
  const last = window[window.length - 1].temperature_c as number;
  const average =
    window.reduce((sum, record) => sum + (record.temperature_c as number), 0) / window.length;
  // Avoid "-0 °C" after rounding a tiny negative difference.
  const delta = Number((last - first).toFixed(2));
  return { delta: Object.is(delta, -0) ? 0 : delta, average };
}

export function AppRecordsPanel({
  records,
  timeZone,
  title = "App measurements",
  description,
}: {
  records: AppRecord[];
  timeZone: string;
  title?: string;
  description?: string;
}) {
  const [metric, setMetric] = useState<MetricKey>("heart_rate_bpm");
  const latest = records[0] ?? null;

  const trend = useMemo(() => {
    const selected = METRICS.find((entry) => entry.key === metric)!;
    const points: TrendPoint[] = records
      .filter((record) => record.measured_at)
      .map((record) => ({
        t: Date.parse(record.measured_at as string),
        value: metricValue(record, selected.key),
      }))
      .filter((point) => !Number.isNaN(point.t))
      .sort((a, b) => a.t - b.t);
    return { points, selected };
  }, [records, metric]);

  const temperature = useMemo(() => temperatureTrend(records), [records]);
  const state = opticalStateView(latest?.signal_quality ?? null);
  const latestExtra = latest?.extra ?? null;

  const columns: Column<AppRecord>[] = [
    {
      key: "measured",
      header: "Measured",
      render: (row) => (
        <span className="whitespace-nowrap text-xs text-ink-muted">
          {formatDateTime(row.measured_at, timeZone)}
        </span>
      ),
    },
    {
      key: "state",
      header: "State",
      render: (row) => {
        const view = opticalStateView(row.signal_quality);
        return (
          <Badge tone={view.tone} size="sm" title={view.detail}>
            {view.label}
          </Badge>
        );
      },
    },
    {
      key: "hr",
      header: "HR",
      align: "right",
      render: (row) => (
        <span className="tabular">
          {numberOrDash(row.heart_rate_bpm, 0)}
          {row.heart_rate_bpm !== null ? <span className="text-ink-subtle"> bpm</span> : null}
        </span>
      ),
    },
    {
      key: "spo2",
      header: "SpO₂",
      align: "right",
      render: (row) => (
        <span className="tabular">
          {numberOrDash(row.spo2_percent, 0)}
          {row.spo2_percent !== null ? <span className="text-ink-subtle"> %</span> : null}
        </span>
      ),
    },
    {
      key: "temp",
      header: "Temp",
      align: "right",
      render: (row) => (
        <span className="tabular">
          {numberOrDash(row.temperature_c, 2)}
          {row.temperature_c !== null ? <span className="text-ink-subtle"> °C</span> : null}
        </span>
      ),
    },
    {
      key: "pi",
      header: "PI",
      align: "right",
      render: (row) => (
        <span className="tabular">
          {numberOrDash(row.perfusion_index_percent, 2)}
          {row.perfusion_index_percent !== null ? <span className="text-ink-subtle"> %</span> : null}
        </span>
      ),
    },
    {
      key: "prv",
      header: "PRV",
      align: "right",
      render: (row) => (
        <span className="tabular">
          {numberOrDash(row.prv_rmssd_ms, 1)}
          {row.prv_rmssd_ms !== null ? <span className="text-ink-subtle"> ms</span> : null}
          {row.prv_beats !== null ? (
            <span className="block text-2xs text-ink-subtle">{row.prv_beats} beats</span>
          ) : null}
        </span>
      ),
    },
    {
      key: "movement",
      header: "Movement",
      render: (row) => (
        <span className="whitespace-nowrap">
          {activityLabel(row.activity_level)}
          {row.activity_rms_g !== null ? (
            <span className="block text-2xs text-ink-subtle tabular">
              {formatNumber(row.activity_rms_g, 3)} g RMS
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "orientation",
      header: "Orientation",
      render: (row) => <span className="whitespace-nowrap">{orientationLabel(row.orientation_class)}</span>,
    },
    {
      key: "device",
      header: "Device",
      render: (row) => (
        <span className="whitespace-nowrap font-mono text-2xs text-ink-subtle">
          {row.device_hardware_id ?? "—"}
          {row.algorithm_version ? (
            <span className="block">{row.algorithm_version}</span>
          ) : null}
        </span>
      ),
    },
  ];

  if (records.length === 0) {
    return (
      <SectionCard title={title} description={description}>
        <EmptyState
          title="No app measurements yet"
          description="Records appear here as soon as the patient's phone syncs them. Nothing is inferred or backfilled."
        />
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title={title}
        description={description}
        actions={
          latest ? (
            <Badge tone={state.tone} title={state.detail}>
              {state.label}
            </Badge>
          ) : null
        }
      >
        <p className="text-xs leading-5 text-ink-subtle">
          Latest snapshot {formatDateTime(latest?.measured_at, timeZone)} ·{" "}
          {records.length} record{records.length === 1 ? "" : "s"} loaded · algorithm{" "}
          {latest?.algorithm_version ?? "not reported"}
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCell
            label="Heart rate"
            value={numberOrDash(latest?.heart_rate_bpm ?? null, 0)}
            unit="bpm"
            hint={
              latest?.heart_rate_bpm === null
                ? "Withheld: no valid pulse window"
                : "MAX30102, app-side adaptive PPG detector"
            }
            icon={HeartPulse}
            tone={latest?.heart_rate_bpm === null ? "text-ink-subtle" : "text-ink"}
          />
          <MetricCell
            label="SpO₂"
            value={numberOrDash(latest?.spo2_percent ?? null, 0)}
            unit="%"
            hint={latest?.spo2_percent === null ? "Withheld by quality gates" : "Red/IR ratio"}
            icon={Droplets}
          />
          <MetricCell
            label="Skin temperature"
            value={numberOrDash(latest?.temperature_c ?? null, 2)}
            unit="°C"
            hint={
              temperature.delta !== null
                ? `${temperature.delta >= 0 ? "+" : ""}${formatNumber(temperature.delta, 2)} °C over 5 min · avg ${formatNumber(temperature.average, 2)} °C`
                : "Trend needs two samples in 5 minutes"
            }
            icon={Thermometer}
          />
          <MetricCell
            label="Perfusion index"
            value={numberOrDash(latest?.perfusion_index_percent ?? null, 2)}
            unit="%"
            hint="100 × AC/DC on the IR channel"
            icon={Gauge}
          />
          <MetricCell
            label="PRV (RMSSD)"
            value={numberOrDash(latest?.prv_rmssd_ms ?? null, 1)}
            unit="ms"
            hint={
              latest?.prv_rmssd_ms === null
                ? `Needs 12 beats · ${latest?.prv_beats ?? 0} so far`
                : `${latest?.prv_beats ?? 0} accepted beats · PPG-derived`
            }
            icon={Waves}
          />
          <MetricCell
            label="Movement intensity"
            value={activityLabel(latest?.activity_level ?? null)}
            hint={`${formatNumber(latest?.activity_rms_g ?? null, 3)} g dynamic RMS`}
            icon={Activity}
          />
          <MetricCell
            label="Device orientation"
            value={orientationLabel(latest?.orientation_class ?? null)}
            hint={`Roll ${numberOrDash(extraNumber(latestExtra, "roll_deg"), 1)}° · Pitch ${numberOrDash(extraNumber(latestExtra, "pitch_deg"), 1)}° · Yaw ${numberOrDash(extraNumber(latestExtra, "yaw_deg"), 1)}°`}
            icon={CircleDot}
          />
          <MetricCell
            label="Optical signal"
            value={state.label}
            hint={state.detail}
            icon={Activity}
            tone={
              state.tone === "success"
                ? "text-success"
                : state.tone === "danger"
                  ? "text-danger"
                  : state.tone === "warning"
                    ? "text-warning"
                    : "text-ink"
            }
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Trend"
        description="Every point is a synced app record. Gaps are left as gaps."
        actions={
          <div className="flex flex-wrap gap-1">
            {METRICS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => setMetric(entry.key)}
                aria-pressed={metric === entry.key}
                className={cn(
                  "h-7 rounded-sm border px-2 text-2xs font-medium transition-colors",
                  metric === entry.key
                    ? "border-accent/40 bg-accent-subtle text-accent"
                    : "border-line text-ink-muted hover:bg-surface-active hover:text-ink",
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>
        }
      >
        {trend.points.filter((point) => point.value !== null).length < 2 ? (
          <p className="py-6 text-center text-sm text-ink-subtle">
            Not enough {trend.selected.label.toLowerCase()} values to draw a trend.
          </p>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend.points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#232B33" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(value: number) =>
                    new Date(value).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  }
                  stroke="#6B7684"
                  tick={{ fontSize: 11 }}
                  minTickGap={32}
                />
                <YAxis
                  stroke="#6B7684"
                  tick={{ fontSize: 11 }}
                  width={44}
                  domain={["auto", "auto"]}
                  tickFormatter={(value: number) => formatNumber(value, 1)}
                />
                <Tooltip
                  contentStyle={{
                    background: "#12181E",
                    border: "1px solid #2A343D",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                  labelFormatter={(value) => new Date(Number(value)).toLocaleString()}
                  formatter={(value) => [
                    `${formatNumber(Number(value), 2)} ${trend.selected.unit}`,
                    trend.selected.label,
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={trend.selected.color}
                  strokeWidth={1.8}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Sensor context"
        description="Raw counts and device state exactly as the phone published them."
      >
        <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex justify-between gap-3 border-b border-line-subtle py-1">
            <dt className="text-ink-subtle">IR / Red raw</dt>
            <dd className="tabular text-ink">
              {numberOrDash(extraNumber(latestExtra, "ir_raw"), 0)} /{" "}
              {numberOrDash(extraNumber(latestExtra, "red_raw"), 0)}
            </dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-line-subtle py-1">
            <dt className="text-ink-subtle">Optical samples</dt>
            <dd className="tabular text-ink">
              {numberOrDash(extraNumber(latestExtra, "optical_samples"), 0)}
            </dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-line-subtle py-1">
            <dt className="text-ink-subtle">Acceleration (g)</dt>
            <dd className="tabular text-ink">{triple(latestExtra, "accel_g")}</dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-line-subtle py-1">
            <dt className="text-ink-subtle">Gyroscope (dps)</dt>
            <dd className="tabular text-ink">{triple(latestExtra, "gyro_dps")}</dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-line-subtle py-1">
            <dt className="text-ink-subtle">Lateral acceleration</dt>
            <dd className="tabular text-ink">{triple(latestExtra, "lateral_g")}</dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-line-subtle py-1">
            <dt className="text-ink-subtle">Source</dt>
            <dd className="text-ink">{extraString(latestExtra, "source") ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-line-subtle py-1">
            <dt className="text-ink-subtle">Sensor flags</dt>
            <dd className="tabular text-ink">
              {numberOrDash(extraNumber(latestExtra, "sensor_flags"), 0)}
            </dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-line-subtle py-1">
            <dt className="text-ink-subtle">Device uptime</dt>
            <dd className="tabular text-ink">
              {numberOrDash(extraNumber(latestExtra, "uptime_ms"), 0)} ms
            </dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-line-subtle py-1">
            <dt className="text-ink-subtle">Sequence</dt>
            <dd className="tabular text-ink">
              {numberOrDash(extraNumber(latestExtra, "sequence"), 0)}
            </dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-line-subtle py-1">
            <dt className="text-ink-subtle">Optical status</dt>
            <dd className="text-ink">{extraString(latestExtra, "optical_status") ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-line-subtle py-1">
            <dt className="text-ink-subtle">Temperature status</dt>
            <dd className="text-ink">
              {extraString(latestExtra, "temperature_status") ?? "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-line-subtle py-1">
            <dt className="text-ink-subtle">IMU status</dt>
            <dd className="text-ink">{extraString(latestExtra, "imu_status") ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-line-subtle py-1">
            <dt className="text-ink-subtle">Device</dt>
            <dd className="text-ink">{latest?.device_hardware_id ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-line-subtle py-1">
            <dt className="text-ink-subtle">Received by portal</dt>
            <dd className="text-ink">{formatDateTime(latest?.received_at, timeZone)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-2xs leading-5 text-ink-subtle">
          PRV is PPG-derived RMSSD, not ECG HRV. Movement thresholds are uncalibrated for a
          wearing position, and orientation describes the device, not body posture. Heart rate
          and SpO₂ are withheld when the app&apos;s quality gates fail.
        </p>
      </SectionCard>

      <SectionCard
        title="Synced records"
        description="Newest first."
        flush
        footer={`Showing ${Math.min(records.length, 200)} of ${records.length} synced record${
          records.length === 1 ? "" : "s"
        }. Older records remain stored and are available through the API.`}
      >
        <DataTable
          columns={columns}
          rows={records.slice(0, 200)}
          rowKey={(row) => row.id}
          caption="App measurements synced from the patient phone"
        />
      </SectionCard>
    </div>
  );
}
