"use client";

import { useMemo, useState } from "react";
import { RefreshCw, Watch } from "lucide-react";

import { getMeasurements } from "@/lib/api";
import { METRIC_ORDER } from "@/lib/constants";
import {
  formatBattery,
  formatDateTime,
  formatNumber,
  formatWindow,
  humanizeMetric,
} from "@/lib/format";
import { latestMeasurementsByMetric } from "@/lib/normalize";
import { useApi } from "@/lib/use-api";
import type { Measurement, PatientOverview } from "@/lib/types";
import { Button } from "@/components/forms/button";
import { FormBanner } from "@/components/forms/form-banner";
import { DataTable, type Column } from "@/components/tables/data-table";
import { EmptyState } from "@/components/layout/empty-state";
import { ErrorState } from "@/components/layout/error-state";
import { SectionCard } from "@/components/layout/section-card";
import { Skeleton, TableSkeleton } from "@/components/layout/skeleton";
import { DataFreshness } from "@/components/status/data-freshness";
import { DeviceStatusBadge } from "@/components/status/device-status-badge";
import { MeasurementCard } from "@/components/status/measurement-card";
import { StatusBadge } from "@/components/status/status-badge";
import { PermissionDenied } from "@/components/status/permission-denied";

const DAY_MS = 24 * 60 * 60 * 1000;

export function MeasurementsPanel({
  patientId,
  overview,
  timeZone,
}: {
  patientId: string;
  overview: PatientOverview;
  timeZone: string;
}) {
  const [anchor, setAnchor] = useState(() => Date.now());
  const from = useMemo(() => new Date(anchor - DAY_MS).toISOString(), [anchor]);
  const to = useMemo(() => new Date(anchor).toISOString(), [anchor]);

  const measurements = useApi(
    (signal) => getMeasurements(patientId, { from, to }, signal),
    [patientId, from, to],
  );

  const fetched = measurements.data;
  const source = fetched && fetched.length > 0 ? fetched : overview.measurements;
  const usingOverview = (!fetched || fetched.length === 0) && overview.measurements.length > 0;
  const latest = latestMeasurementsByMetric(source);
  const baselines = new Map(overview.baselines.map((baseline) => [baseline.metric_type, baseline]));

  const sorted = useMemo(
    () =>
      [...source].sort((a, b) => {
        const aMs = a.observed_at ? Date.parse(a.observed_at) : 0;
        const bMs = b.observed_at ? Date.parse(b.observed_at) : 0;
        return bMs - aMs;
      }),
    [source],
  );

  const columns: Column<Measurement>[] = [
    {
      key: "time",
      header: "Observed",
      render: (measurement) => (
        <span className="whitespace-nowrap text-xs text-ink-muted">
          {formatDateTime(measurement.observed_at, timeZone)}
        </span>
      ),
    },
    {
      key: "metric",
      header: "Metric",
      render: (measurement) => (
        <span className="text-xs font-medium text-ink">{humanizeMetric(measurement.metric_type)}</span>
      ),
    },
    {
      key: "value",
      header: "Value",
      align: "right",
      render: (measurement) => (
        <span className="whitespace-nowrap text-xs tabular-nums text-ink">
          {formatNumber(measurement.value)} {measurement.unit}
        </span>
      ),
    },
    {
      key: "source",
      header: "Source",
      render: (measurement) => (
        <StatusBadge
          status={measurement.source_type === "unknown" ? "unknown" : measurement.source_type}
          size="sm"
        />
      ),
    },
    {
      key: "quality",
      header: "Quality",
      render: (measurement) => (
        <span className="text-xs capitalize text-ink-muted">{measurement.quality_status}</span>
      ),
    },
    {
      key: "window",
      header: "Window",
      render: (measurement) => (
        <span className="whitespace-nowrap text-[11px] text-ink-subtle">
          {formatWindow(measurement.window_start, measurement.window_end, timeZone) ?? "—"}
        </span>
      ),
    },
  ];

  const device = overview.device;

  return (
    <div className="space-y-5">
      <SectionCard
        title="Current measurements"
        description="Values are current only inside each metric's freshness window. Older values are labelled stale with their last-received time."
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
          {measurements.error?.isForbidden ? (
            <PermissionDenied
              title="Measurement access restricted"
              description="The API did not permit access to this patient's measurement history."
              detail={measurements.error.message}
            />
          ) : null}

          {measurements.error && !measurements.error.isForbidden ? (
            <FormBanner tone="warning" title="Could not refresh measurements">
              {usingOverview
                ? "Showing the latest values from the patient overview instead. The 24-hour history may be incomplete."
                : "The measurement history could not be loaded. The summary values below may be unavailable."}
            </FormBanner>
          ) : null}

          {usingOverview ? (
            <FormBanner tone="info">
              No measurements were returned for the last 24 hours. Showing the latest values from
              the patient overview; check the timestamps before interpreting them.
            </FormBanner>
          ) : null}

          {measurements.loading && !measurements.data && source.length === 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-32 w-full rounded-lg" />
              ))}
            </div>
          ) : source.length === 0 ? (
            <EmptyState
              title="No measurements received"
              description="No measurement summaries are available for this patient. The device may not have synced, or monitoring may not have started."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {METRIC_ORDER.map((metric) => (
                <MeasurementCard
                  key={metric}
                  metric={metric}
                  measurement={latest.get(metric) ?? null}
                  baseline={baselines.get(metric) ?? null}
                  timeZone={timeZone}
                />
              ))}
            </div>
          )}

          <p className="text-[11px] leading-5 text-ink-subtle">
            Window: {formatDateTime(from, timeZone)} to {formatDateTime(to, timeZone)} ·{" "}
            {source.length} {source.length === 1 ? "summary" : "summaries"}
          </p>
        </div>
      </SectionCard>

      <SectionCard
        title="Measurement history"
        description="Most recent summary values in the selected window."
        bodyClassName="p-0"
      >
        {measurements.error && !measurements.data ? (
          <div className="p-4">
            <ErrorState
              title="The measurement history could not be loaded"
              error={measurements.error}
              onRetry={measurements.reload}
              retrying={measurements.loading}
            />
          </div>
        ) : measurements.loading && !measurements.data ? (
          <TableSkeleton rows={6} columns={6} />
        ) : sorted.length === 0 ? (
          <EmptyState
            compact
            title="No history to display"
            description="No measurement summaries were returned for this window."
          />
        ) : (
          <DataTable
            columns={columns}
            rows={sorted.slice(0, 100)}
            rowKey={(measurement) => measurement.id}
            caption="Recent measurement summaries"
          />
        )}
        {sorted.length > 100 ? (
          <p className="border-t border-line px-4 py-2 text-[11px] text-ink-subtle">
            Showing the 100 most recent of {sorted.length} summaries.
          </p>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Device and sync diagnostics"
        description="Operational details, separated from clinical interpretation."
      >
        {device ? (
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">
                Device status
              </dt>
              <dd className="mt-1">
                <DeviceStatusBadge status={device.status} />
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">
                Last contact
              </dt>
              <dd className="mt-1">
                <DataFreshness timestamp={device.last_seen_at} timeZone={timeZone} label="Last contact" />
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">
                Battery
              </dt>
              <dd className="mt-1 text-sm text-ink">{formatBattery(device.battery_level)}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">
                Hardware identifier
              </dt>
              <dd className="mt-1 font-mono text-xs text-ink-muted">
                {device.hardware_identifier || "Not reported"}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">
                Firmware
              </dt>
              <dd className="mt-1 text-sm text-ink">{device.firmware_version ?? "Not reported"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">
                Hardware revision
              </dt>
              <dd className="mt-1 text-sm text-ink">{device.hardware_revision ?? "Not reported"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">
                Assignment
              </dt>
              <dd className="mt-1 text-sm capitalize text-ink">
                {overview.assignment
                  ? `${overview.assignment.assignment_type === "unknown" ? "Assignment" : overview.assignment.assignment_type} · ${overview.assignment.status}`
                  : "Not reported"}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">
                Device linked
              </dt>
              <dd className="mt-1 text-sm text-ink">
                {device.patient_id ? "Linked to this patient" : "Link not reported"}
              </dd>
            </div>
          </dl>
        ) : (
          <div className="flex items-start gap-2.5 rounded-lg border border-line bg-slate-50 p-4">
            <Watch className="mt-0.5 h-4 w-4 shrink-0 text-ink-subtle" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-ink">No device linked or reported</p>
              <p className="mt-0.5 text-xs leading-5 text-ink-muted">
                The overview did not include a device for this patient. Operational status cannot
                be shown.
              </p>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
