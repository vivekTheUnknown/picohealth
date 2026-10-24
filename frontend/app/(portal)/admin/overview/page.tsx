"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ChevronRight,
  Cpu,
  Gauge,
  RefreshCw,
  Server,
  Stethoscope,
  UserCheck,
  Users,
  Watch,
} from "lucide-react";

import { getAdminOverview } from "@/lib/api";
import { formatDateTime, formatNumber, pluralize } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import type { SyncFailure } from "@/lib/types";
import { Button, buttonClasses } from "@/components/forms/button";
import { FormBanner } from "@/components/forms/form-banner";
import { EmptyState } from "@/components/layout/empty-state";
import { ErrorState } from "@/components/layout/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/skeleton";
import { SectionCard } from "@/components/layout/section-card";
import { StatCard } from "@/components/layout/stat-card";
import { DataTable, type Column } from "@/components/tables/data-table";
import { PermissionDenied } from "@/components/status/permission-denied";
import { DeviceStatusBadge } from "@/components/status/device-status-badge";
import { HealthStatusBadge } from "@/components/status/health-status-badge";

export default function AdminOverviewPage() {
  const { me } = useSession();
  const overview = useApi((signal) => getAdminOverview(signal), []);

  if (overview.error?.isForbidden) {
    return (
      <div className="space-y-6">
        <PageHeader title="Operations overview" />
        <PermissionDenied
          title="Operations access restricted"
          description="The API did not permit access to the administration overview."
          detail={overview.error.message}
          actions={
            <Link href="/overview" className={buttonClasses("secondary", "sm")}>
              Clinical overview
            </Link>
          }
        />
      </div>
    );
  }

  if (overview.loading && !overview.data) return <PageSkeleton />;

  if (overview.error && !overview.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Operations overview" />
        <ErrorState
          title="The operations overview is unavailable"
          error={overview.error}
          onRetry={overview.reload}
          retrying={overview.loading}
        />
      </div>
    );
  }

  const data = overview.data;
  if (!data) return <PageSkeleton />;

  const timeZone = me?.timezone ?? "UTC";
  const totalDevices = data.device_status_counts.reduce((sum, entry) => sum + entry.count, 0);
  const maxDeviceCount = Math.max(1, ...data.device_status_counts.map((entry) => entry.count));

  const syncColumns: Column<SyncFailure>[] = [
    {
      key: "device",
      header: "Device",
      render: (failure) => (
        <div>
          <p className="font-mono text-xs text-ink">
            {failure.hardware_identifier ?? failure.device_id ?? "Not reported"}
          </p>
          <p className="text-2xs text-ink-subtle">{failure.patient_name ?? "Patient not reported"}</p>
        </div>
      ),
    },
    {
      key: "failure",
      header: "Failure",
      render: (failure) => (
        <div>
          <p className="text-xs text-ink">{failure.message ?? "No message reported"}</p>
          {failure.failure_code ? (
            <p className="font-mono text-2xs text-ink-subtle">{failure.failure_code}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "time",
      header: "Last failure",
      render: (failure) => (
        <span className="whitespace-nowrap text-2xs text-ink-muted">
          {formatDateTime(failure.last_failure_at, timeZone)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations overview"
        description="Account, device, and synchronization operations. Patient measurements are intentionally not shown here."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={overview.reload}
            loading={overview.loading}
            loadingLabel="Refreshing"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Refresh
          </Button>
        }
        meta={
          <>
            <span>Generated {formatDateTime(data.generated_at, timeZone)}</span>
            <span>Administration workspace</span>
          </>
        }
      />

      {overview.loading ? (
        <p className="text-xs text-ink-subtle" role="status">
          Refreshing operations data…
        </p>
      ) : null}

      {overview.error ? (
        <FormBanner tone="warning" title="The operations overview could not be refreshed">
          Showing the last successful response generated{" "}
          {data.generated_at ? formatDateTime(data.generated_at, timeZone) : "at an unreported time"}.
          Counts and failure lists may be out of date.
        </FormBanner>
      ) : null}

      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Active patients"
          value={data.active_patients}
          hint="Registered and active"
          icon={Users}
          href="/admin/patients"
        />
        <StatCard
          label="Verified doctors"
          value={data.verified_doctors}
          hint="Credential verification complete"
          icon={UserCheck}
          href="/admin/users"
        />
        <StatCard
          label="Registered devices"
          value={data.registered_devices}
          hint="All registry entries"
          icon={Cpu}
          href="/admin/devices"
        />
        <StatCard
          label="Devices needing attention"
          value={data.devices_needing_attention}
          hint="Faulty, lost, or under test"
          icon={Watch}
          href="/admin/devices"
          tone={data.devices_needing_attention && data.devices_needing_attention > 0 ? "attention" : "default"}
        />
        <StatCard
          label="Sync failures"
          value={data.sync_failures}
          hint="Reported failure count"
          icon={AlertTriangle}
          href="/admin/health"
          tone={data.sync_failures && data.sync_failures > 0 ? "critical" : "default"}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <SectionCard
          title="Device status distribution"
          description="Registry state as reported by the API."
          className="xl:col-span-1"
        >
          {data.device_status_counts.length === 0 ? (
            <EmptyState
              compact
              icon={Cpu}
              title="No device distribution reported"
              description="The API did not return device status counts."
            />
          ) : (
            <div className="space-y-3">
              {data.device_status_counts
                .slice()
                .sort((a, b) => b.count - a.count)
                .map((entry) => (
                  <div key={entry.status}>
                    <div className="flex items-center justify-between gap-2">
                      <DeviceStatusBadge status={entry.status} />
                      <span className="text-xs font-medium tabular-nums text-ink">
                        {formatNumber(entry.count, 0)}
                        <span className="ml-1 font-normal text-ink-subtle">
                          ({Math.round((entry.count / Math.max(1, totalDevices)) * 100)}%)
                        </span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-active">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${(entry.count / maxDeviceCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              <p className="pt-1 text-2xs text-ink-subtle">
                {pluralize(totalDevices, "device")} across reported statuses.
              </p>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Recent account and device changes"
          description="Newest administrative changes reported by the API."
          actions={
            <Link href="/admin/audit" className="text-xs font-medium text-accent hover:underline">
              Audit log
            </Link>
          }
          className="xl:col-span-2"
        >
          {data.recent_changes.length === 0 ? (
            <EmptyState
              compact
              icon={Gauge}
              title="No recent changes reported"
              description="No account or device changes were included in this overview."
            />
          ) : (
            <ul className="divide-y divide-line">
              {data.recent_changes.map((change) => (
                <li key={change.id} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-ink">{change.action}</p>
                    <p className="mt-0.5 text-2xs text-ink-subtle">
                      {change.actor_name ?? "Actor not reported"}
                      {change.target ? ` · ${change.target}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-2xs text-ink-subtle">
                    {formatDateTime(change.timestamp, timeZone)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Synchronization failures"
        description="Failures reported in the overview. Use platform health for service-level status."
        actions={
          <Link href="/admin/health" className="text-xs font-medium text-accent hover:underline">
            Platform health
          </Link>
        }
        bodyClassName="p-0"
      >
        {data.sync_failure_list.length === 0 ? (
          <EmptyState
            compact
            icon={AlertTriangle}
            title="No failure rows reported"
            description="The overview did not include a synchronization-failure list. This does not prove that no failures occurred; check platform health for service-level detail."
          />
        ) : (
          <DataTable
            columns={syncColumns}
            rows={data.sync_failure_list}
            rowKey={(failure) => failure.id}
            caption="Reported synchronization failures"
          />
        )}
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="System health summary"
          description="Service indicators as surfaced by the backend."
          actions={
            <Link href="/admin/health" className="inline-flex items-center gap-0.5 text-xs font-medium text-accent hover:underline">
              Details
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          }
        >
          {data.system_health ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <HealthStatusBadge status={data.system_health.status} />
                <span className="text-2xs text-ink-subtle">
                  Checked {formatDateTime(data.system_health.generated_at, timeZone)}
                </span>
              </div>
              {data.system_health.checks.length === 0 ? (
                <p className="text-xs leading-5 text-ink-muted">
                  No individual health checks were included.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {data.system_health.checks.map((check) => (
                    <li key={check.name} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-ink">{check.name}</span>
                      <HealthStatusBadge status={check.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <EmptyState
              compact
              icon={Server}
              title="No health summary reported"
              description="Open platform health to request the current system status directly."
            />
          )}
        </SectionCard>

        <SectionCard title="Reading this page" description="Operational context for administrators.">
          <div className="space-y-3 text-xs leading-5 text-ink-muted">
            <p>
              Counts reflect the API response at the time shown. “—” means the backend did not report
              a value; it is not zero.
            </p>
            <p>
              This overview avoids patient measurements. Clinical data remains available only through
              patient-scoped endpoints and the appropriate clinical permission.
            </p>
            <p className="flex items-center gap-1.5 text-ink-subtle">
              <Stethoscope className="h-3.5 w-3.5" aria-hidden="true" />
              Administration actions are audited by the API.
            </p>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
