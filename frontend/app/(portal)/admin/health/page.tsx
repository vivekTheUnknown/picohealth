"use client";

import { Activity, AlertTriangle, Database, MailPlus, RefreshCw, Server, Smartphone } from "lucide-react";

import { getSystemHealth } from "@/lib/api";
import { formatDateTime, formatNumber, pluralize } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import type { HealthCheck } from "@/lib/types";
import { Button } from "@/components/forms/button";
import { FormBanner } from "@/components/forms/form-banner";
import { EmptyState } from "@/components/layout/empty-state";
import { ErrorState } from "@/components/layout/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/skeleton";
import { SectionCard } from "@/components/layout/section-card";
import { DataTable, type Column } from "@/components/tables/data-table";
import { HealthStatusBadge, healthTone } from "@/components/status/health-status-badge";
import { PermissionDenied } from "@/components/status/permission-denied";

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-slate-50/50 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-ink-subtle">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink">{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] leading-4 text-ink-subtle">{hint}</p> : null}
    </div>
  );
}

function StatTile({
  label,
  icon: Icon,
  hint,
  children,
}: {
  label: string;
  icon: typeof Activity;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{label}</p>
        <Icon className="h-4 w-4 text-accent-700" aria-hidden="true" />
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-ink">{children}</div>
      <p className="mt-1 text-xs text-ink-subtle">{hint}</p>
    </div>
  );
}

export default function AdminHealthPage() {
  const { me } = useSession();
  const health = useApi((signal) => getSystemHealth(signal), []);

  const columns: Column<HealthCheck>[] = [
    {
      key: "name",
      header: "Check",
      render: (check) => <span className="text-xs font-medium text-ink">{check.name}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (check) => <HealthStatusBadge status={check.status} />,
    },
    {
      key: "message",
      header: "Detail",
      render: (check) => (
        <span className="text-[11px] leading-5 text-ink-muted">{check.message ?? "No detail reported"}</span>
      ),
    },
    {
      key: "latency",
      header: "Latency",
      align: "right",
      render: (check) => (
        <span className="whitespace-nowrap text-[11px] text-ink-muted">
          {check.latency_ms === null ? "Not reported" : `${formatNumber(check.latency_ms, 0)} ms`}
        </span>
      ),
    },
  ];

  if (health.error?.isForbidden) {
    return (
      <div className="space-y-6">
        <PageHeader title="Platform health" />
        <PermissionDenied
          title="Platform health restricted"
          description="The API did not permit access to platform health."
          detail={health.error.message}
        />
      </div>
    );
  }

  if (health.loading && health.data === null) return <PageSkeleton />;

  if (health.error && health.data === null) {
    return (
      <div className="space-y-6">
        <PageHeader title="Platform health" />
        <ErrorState
          title="Platform health is unavailable"
          error={health.error}
          onRetry={health.reload}
          retrying={health.loading}
        />
      </div>
    );
  }

  const data = health.data;
  const tone = data ? healthTone(data.status) : "unknown";
  const statusText = data?.status?.trim() ?? "";
  const statusReported = statusText !== "" && statusText.toLowerCase() !== "unknown";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform health"
        description="Service-level status reported by the backend. This page shows operational metadata only, not patient measurements."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={health.reload}
            loading={health.loading}
            loadingLabel="Refreshing"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Refresh
          </Button>
        }
        meta={
          data ? (
            <>
              {statusReported ? (
                <HealthStatusBadge status={data.status} />
              ) : (
                <span>Overall status not reported</span>
              )}
              <span>Checked {formatDateTime(data.generated_at, me?.timezone)}</span>
            </>
          ) : (
            <span>No health payload reported</span>
          )
        }
      />

      {health.error ? (
        <FormBanner tone="warning" title="Platform health could not be refreshed">
          Showing the last successful response. Status may have changed; refresh before relying on
          it.
        </FormBanner>
      ) : null}

      {!data ? (
        <EmptyState
          icon={Server}
          title="No health status reported"
          description="The API returned no usable system-health payload. This is not evidence that the platform is healthy or unhealthy. Retry the request or use the backend health endpoints directly."
          action={
            <Button variant="secondary" size="sm" onClick={health.reload} loading={health.loading}>
              Retry
            </Button>
          }
        />
      ) : (
        <>
          {!statusReported ? (
            <FormBanner tone="info" title="No overall platform status was reported">
              The API returned individual indicators without an overall status. They are shown
              exactly as reported; this is not confirmation that the platform is healthy.
            </FormBanner>
          ) : tone === "down" ? (
            <FormBanner tone="error" title="The API reports an unhealthy platform state">
              The overall status is <span className="font-mono">{data.status}</span>. Review the
              individual checks and ingestion details below. This page cannot remediate failures.
            </FormBanner>
          ) : tone === "degraded" ? (
            <FormBanner tone="warning" title="The API reports a degraded platform state">
              The overall status is <span className="font-mono">{data.status}</span>. Some checks or
              synchronization paths may be impaired.
            </FormBanner>
          ) : tone === "ok" ? (
            <FormBanner tone="success" title="The API reports an operational platform state">
              Every status shown here is point-in-time. Refresh to request a current assessment.
            </FormBanner>
          ) : (
            <FormBanner tone="info" title="The platform status is not in a recognised state">
              The API reported <span className="font-mono">{data.status || "no status"}</span>. Treat
              an unrecognised status as unknown rather than healthy.
            </FormBanner>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Service checks"
              icon={Activity}
              hint={`${pluralize(data.checks.length, "check")} reported`}
            >
              {data.checks.length === 0 ? "—" : formatNumber(data.checks.length, 0)}
            </StatTile>

            {data.database ? (
              <StatTile
                label="Database"
                icon={Database}
                hint="Connectivity check reported by the API"
              >
                <HealthStatusBadge status={data.database} className="text-xs" />
              </StatTile>
            ) : data.device_sync && data.device_sync.devices_online !== null ? (
              <StatTile
                label="Devices online"
                icon={Smartphone}
                hint="Reported by device sync"
              >
                {formatNumber(data.device_sync.devices_online, 0)}
              </StatTile>
            ) : null}

            {data.device_sync && data.device_sync.stale_devices !== null ? (
              <StatTile
                label="Stale devices"
                icon={Smartphone}
                hint="Last contact outside the staleness window"
              >
                {formatNumber(data.device_sync.stale_devices, 0)}
              </StatTile>
            ) : null}

            {data.pending_users !== null ? (
              <StatTile
                label="Pending invitations"
                icon={MailPlus}
                hint="Accounts awaiting activation"
              >
                {formatNumber(data.pending_users, 0)}
              </StatTile>
            ) : null}

            {data.ingestion && data.ingestion.failed_batches !== null ? (
              <StatTile
                label="Failed ingestion batches"
                icon={AlertTriangle}
                hint="Reported by ingestion"
              >
                <span
                  className={
                    data.ingestion.failed_batches > 0 ? "text-red-700" : undefined
                  }
                >
                  {formatNumber(data.ingestion.failed_batches, 0)}
                </span>
              </StatTile>
            ) : null}

            {data.ingestion && data.ingestion.pending_batches !== null ? (
              <StatTile
                label="Pending batches"
                icon={Database}
                hint="Reported by ingestion"
              >
                {formatNumber(data.ingestion.pending_batches, 0)}
              </StatTile>
            ) : null}
          </div>

          <SectionCard
            title="Service checks"
            description="Each row is a check returned by the backend. Unknown means no recognised status was reported."
            bodyClassName="p-0"
          >
            {data.checks.length === 0 ? (
              <EmptyState
                compact
                icon={Server}
                title="No individual checks reported"
                description="The API did not include service-level checks in this response. This is not evidence that the platform is healthy."
              />
            ) : (
              <DataTable
                columns={columns}
                rows={data.checks}
                rowKey={(check) => check.name}
                caption="Platform service checks"
              />
            )}
          </SectionCard>

          <div className="grid gap-5 lg:grid-cols-2">
            <SectionCard title="Data ingestion" description="Batch processing state reported by the API.">
              {data.ingestion ? (
                <div className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Metric
                      label="Pending batches"
                      value={
                        data.ingestion.pending_batches === null
                          ? "Not reported"
                          : formatNumber(data.ingestion.pending_batches, 0)
                      }
                    />
                    <Metric
                      label="Failed batches"
                      value={
                        data.ingestion.failed_batches === null
                          ? "Not reported"
                          : formatNumber(data.ingestion.failed_batches, 0)
                      }
                    />
                  </div>
                  <dl className="space-y-1.5 text-xs">
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-subtle">Last success</dt>
                      <dd className="text-right text-ink">
                        {formatDateTime(data.ingestion.last_success_at, me?.timezone)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-subtle">Last failure</dt>
                      <dd className="text-right text-ink">
                        {formatDateTime(data.ingestion.last_failure_at, me?.timezone)}
                      </dd>
                    </div>
                  </dl>
                  <p className="text-[11px] leading-5 text-ink-subtle">
                    Pending or failed batches indicate processing work, not necessarily lost
                    measurements. Do not infer clinical status from ingestion counters.
                  </p>
                </div>
              ) : (
                <EmptyState
                  compact
                  icon={Database}
                  title="Ingestion state not reported"
                  description="The API did not include ingestion status in this response."
                />
              )}
            </SectionCard>

            <SectionCard title="Device synchronization" description="Connectivity and staleness as reported.">
              {data.device_sync ? (
                <div className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Metric
                      label="Online"
                      value={
                        data.device_sync.devices_online === null
                          ? "—"
                          : formatNumber(data.device_sync.devices_online, 0)
                      }
                    />
                    <Metric
                      label="Offline"
                      value={
                        data.device_sync.devices_offline === null
                          ? "—"
                          : formatNumber(data.device_sync.devices_offline, 0)
                      }
                    />
                    <Metric
                      label="Stale"
                      value={
                        data.device_sync.stale_devices === null
                          ? "—"
                          : formatNumber(data.device_sync.stale_devices, 0)
                      }
                    />
                  </div>
                  <dl className="space-y-1.5 text-xs">
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-subtle">Last successful sync</dt>
                      <dd className="text-right text-ink">
                        {formatDateTime(data.device_sync.last_sync_at, me?.timezone)}
                      </dd>
                    </div>
                  </dl>
                  <p className="text-[11px] leading-5 text-ink-subtle">
                    Device counts reflect the API's last assessment. Per-device contact state is in
                    the device registry.
                  </p>
                </div>
              ) : (
                <EmptyState
                  compact
                  icon={Smartphone}
                  title="Device sync state not reported"
                  description="The API did not include device synchronization status in this response."
                />
              )}
            </SectionCard>
          </div>

          <p className="text-[11px] leading-5 text-ink-subtle">
            Times are shown in {me?.timezone ?? "UTC"}. Health checks are operational telemetry and
            do not establish that clinical data is complete or accurate.
          </p>
        </>
      )}
    </div>
  );
}
