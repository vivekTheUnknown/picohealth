"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  ChevronRight,
  RefreshCw,
  Search,
  Stethoscope,
  Users,
  Watch,
} from "lucide-react";

import { getDoctorOverview } from "@/lib/api";
import { formatDateTime, formatNumber, humanizeEventType, pluralize } from "@/lib/format";
import { freshnessFor } from "@/lib/freshness";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import type { PatientSummary, Severity } from "@/lib/types";
import { Button, buttonClasses } from "@/components/forms/button";
import { FormBanner } from "@/components/forms/form-banner";
import { Input, Select } from "@/components/forms/inputs";
import { EmptyState } from "@/components/layout/empty-state";
import { ErrorState } from "@/components/layout/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/skeleton";
import { SectionCard } from "@/components/layout/section-card";
import { DataTable } from "@/components/tables/data-table";
import { StatCard } from "@/components/layout/stat-card";
import { PermissionDenied } from "@/components/status/permission-denied";
import { DataFreshness } from "@/components/status/data-freshness";
import { DeviceStatusBadge } from "@/components/status/device-status-badge";
import { SeverityBadge } from "@/components/status/severity-badge";
import { StatusBadge } from "@/components/status/status-badge";

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
  unknown: 0,
};

type FreshnessFilter = "all" | "fresh" | "stale" | "none";

function isActiveEvent(patient: PatientSummary): boolean {
  if (!patient.latest_event) return false;
  return !["resolved", "false_positive"].includes(patient.latest_event.status);
}

function patientPriority(patient: PatientSummary): number {
  const severity = patient.latest_event?.severity ?? "unknown";
  return SEVERITY_RANK[severity] * 10 + (isActiveEvent(patient) ? 1 : 0);
}

export default function ClinicalOverviewPage() {
  const { me } = useSession();
  const overview = useApi((signal) => getDoctorOverview(signal), []);
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState<string>("all");
  const [freshness, setFreshness] = useState<FreshnessFilter>("all");

  const patients = overview.data?.patients ?? [];

  const filteredPatients = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = patients.filter((patient) => {
      if (query) {
        const haystack = `${patient.display_name} ${patient.patient_code}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (severity !== "all") {
        const eventSeverity = patient.latest_event?.severity ?? "unknown";
        if (eventSeverity !== severity) return false;
      }
      if (freshness !== "all") {
        const state = freshnessFor(patient.last_received_at).state;
        if (freshness === "none" && state !== "unavailable") return false;
        if (freshness === "fresh" && state !== "fresh") return false;
        if (freshness === "stale" && state !== "stale") return false;
      }
      return true;
    });

    return [...rows].sort((a, b) => {
      const priority = patientPriority(b) - patientPriority(a);
      if (priority !== 0) return priority;
      const aStale = freshnessFor(a.last_received_at).state === "stale" ? 1 : 0;
      const bStale = freshnessFor(b.last_received_at).state === "stale" ? 1 : 0;
      if (aStale !== bStale) return bStale - aStale;
      return a.display_name.localeCompare(b.display_name);
    });
  }, [patients, search, severity, freshness]);

  const computedStale = patients.filter(
    (patient) => freshnessFor(patient.last_received_at).state === "stale",
  ).length;

  if (overview.error?.isForbidden) {
    return (
      <div className="space-y-6">
        <PageHeader title="Clinical overview" />
        <PermissionDenied
          detail={overview.error.message}
          actions={
            <Link href="/" className={buttonClasses("secondary", "sm")}>
              Portal home
            </Link>
          }
        />
      </div>
    );
  }

  if (overview.loading && !overview.data) {
    return <PageSkeleton />;
  }

  if (overview.error && !overview.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Clinical overview" />
        <ErrorState
          title="The clinical overview is unavailable"
          error={overview.error}
          onRetry={overview.reload}
          retrying={overview.loading}
        />
      </div>
    );
  }

  const data = overview.data;
  const monitored = data?.patients_monitored ?? patients.length;
  const staleCount = data?.patients_stale ?? computedStale;
  const activeEvents = data?.active_high_priority_events ?? null;
  const recentEvents = data?.recent_events ?? [];
  const activeFilterCount =
    (search.trim() ? 1 : 0) + (severity !== "all" ? 1 : 0) + (freshness !== "all" ? 1 : 0);

  const resetFilters = () => {
    setSearch("");
    setSeverity("all");
    setFreshness("all");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clinical overview"
        description="Assigned patients who may need review, ordered by event severity and data freshness."
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
            <DataFreshness
              timestamp={data?.generated_at ?? null}
              timeZone={me?.timezone}
              label="Overview generated"
            />
            <span>{pluralize(patients.length, "patient")} in view</span>
          </>
        }
      />

      {overview.data && overview.loading ? (
        <p className="text-xs text-ink-subtle" role="status">
          Refreshing overview data…
        </p>
      ) : null}

      {overview.data && overview.error ? (
        <FormBanner tone="warning" title="The overview could not be refreshed">
          Showing the last successful response generated{" "}
          {overview.data.generated_at
            ? formatDateTime(overview.data.generated_at, me?.timezone)
            : "at an unreported time"}
          . Freshness badges still reflect each patient's last received data, but counts may be out
          of date.
        </FormBanner>
      ) : null}

      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Patients monitored"
          value={monitored}
          hint="Assigned to your account"
          icon={Users}
        />
        <StatCard
          label="High-priority events"
          value={activeEvents}
          hint="Critical and high severity, active"
          icon={Stethoscope}
          tone={activeEvents && activeEvents > 0 ? "critical" : "default"}
        />
        <StatCard
          label="Patients with stale data"
          value={staleCount}
          hint="No data inside freshness window"
          icon={AlertTriangle}
          tone={staleCount > 0 ? "attention" : "default"}
        />
        <StatCard
          label="Devices needing attention"
          value={data?.devices_needing_attention ?? null}
          hint="Faulty, lost, or not reporting"
          icon={Watch}
          tone={
            data?.devices_needing_attention && data.devices_needing_attention > 0
              ? "attention"
              : "default"
          }
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <SectionCard
          title="Prioritized patients"
          description="Freshness reflects the newest data received from the patient's device."
          actions={
            <span className="text-xs text-ink-subtle">
              {filteredPatients.length} of {patients.length}
            </span>
          }
          className="xl:col-span-2"
          bodyClassName="p-0"
        >
          <div className="flex flex-col gap-3 border-b border-line bg-surface-raised/50 p-4 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="min-w-0 flex-1">
              <label
                htmlFor="overview-search"
                className="mb-1 block text-2xs font-medium text-ink-subtle"
              >
                Search
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle"
                  aria-hidden="true"
                />
                <Input
                  id="overview-search"
                  className="pl-9"
                  placeholder="Name or patient code"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </div>
            <div className="w-full sm:w-40">
              <label
                htmlFor="overview-severity"
                className="mb-1 block text-2xs font-medium text-ink-subtle"
              >
                Event severity
              </label>
              <Select
                id="overview-severity"
                value={severity}
                onChange={(event) => setSeverity(event.target.value)}
              >
                <option value="all">All severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="info">Info</option>
              </Select>
            </div>
            <div className="w-full sm:w-40">
              <label
                htmlFor="overview-freshness"
                className="mb-1 block text-2xs font-medium text-ink-subtle"
              >
                Data freshness
              </label>
              <Select
                id="overview-freshness"
                value={freshness}
                onChange={(event) => setFreshness(event.target.value as FreshnessFilter)}
              >
                <option value="all">All data</option>
                <option value="fresh">Fresh</option>
                <option value="stale">Stale</option>
                <option value="none">No data</option>
              </Select>
            </div>
            {activeFilterCount > 0 ? (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                Clear filters
              </Button>
            ) : null}
          </div>

          {patients.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No patients assigned"
              description="When a patient is assigned to you, their latest measurements and events will appear here."
            />
          ) : filteredPatients.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No patients match these filters"
              description="Adjust the search term, severity, or freshness filter."
              action={
                <Button variant="secondary" size="sm" onClick={resetFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <DataTable
              caption="Prioritized patients"
              rows={filteredPatients}
              rowKey={(patient) => patient.id}
              columns={[
                {
                  key: "patient",
                  header: "Patient",
                  className: "min-w-[11rem]",
                  render: (patient) => (
                    <Link href={`/patients/${patient.id}`} className="group block">
                      <span className="block text-sm font-medium leading-5 text-ink transition-colors duration-fast group-hover:text-accent">
                        {patient.display_name}
                      </span>
                      <span className="mono-id block leading-4">{patient.patient_code || "—"}</span>
                    </Link>
                  ),
                },
                {
                  key: "event",
                  header: "Latest event",
                  className: "min-w-[15rem]",
                  render: (patient) =>
                    patient.latest_event ? (
                      <div className="flex items-center gap-1 whitespace-nowrap">
                        <SeverityBadge severity={patient.latest_event.severity} size="sm" />
                        <StatusBadge status={patient.latest_event.status} size="sm" />
                        <span className="text-2xs text-ink-subtle">
                          {humanizeEventType(patient.latest_event.event_type)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-ink-subtle">None reported</span>
                    ),
                },
                {
                  key: "data",
                  header: "Data received",
                  render: (patient) => (
                    <DataFreshness
                      timestamp={patient.last_received_at}
                      timeZone={me?.timezone}
                      label="Received"
                      compact
                    />
                  ),
                },
                {
                  key: "device",
                  header: "Device",
                  render: (patient) =>
                    patient.device_status ? (
                      <DeviceStatusBadge status={patient.device_status} />
                    ) : (
                      <span className="text-xs text-ink-subtle">Not reported</span>
                    ),
                },
              ]}
            />
          )}
        </SectionCard>

        <div className="space-y-5">
          <SectionCard
            title="Recent events"
            description="Newest events from your assigned patients."
            actions={
              <Link
                href="/alerts"
                className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
              >
                All alerts
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            }
            bodyClassName="p-3"
          >
            {recentEvents.length === 0 ? (
              <EmptyState
                compact
                icon={Bell}
                title="No recent events"
                description="No events have been reported for your patients."
              />
            ) : (
              <ul className="space-y-1.5">
                {recentEvents.slice(0, 8).map((event) => (
                  <li key={event.id}>
                    <Link
                      href={`/alerts?event=${encodeURIComponent(event.id)}`}
                      className="flex flex-col gap-1.5 rounded-lg border border-transparent px-2 py-2 hover:border-line hover:bg-surface-raised"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <SeverityBadge severity={event.severity} size="sm" />
                        <StatusBadge status={event.status} size="sm" />
                      </div>
                      <p className="text-xs font-medium text-ink">
                        {humanizeEventType(event.event_type)}
                      </p>
                      <p className="text-2xs text-ink-subtle">
                        {event.patient_name ?? "Patient not reported"}
                        {event.start_at
                          ? ` · ${formatDateTime(event.start_at, me?.timezone)}`
                          : ""}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <div className="rounded-lg border border-line bg-surface p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-info" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-ink">Reading the data</h2>
            </div>
            <p className="mt-2 text-xs leading-5 text-ink-muted">
              Measurements are labelled measured, derived, or estimated. Values outside the
              freshness window are marked stale and show when they were last received; they are not
              current readings.
            </p>
            <p className="mt-2 text-xs leading-5 text-ink-subtle">
              Events are possible signals for clinical review, not diagnoses.
            </p>
          </div>
        </div>
      </div>

      {data ? (
        <p className="text-2xs text-ink-subtle">
          Time zone: {me?.timezone ?? "UTC"}. Summary counts are reported by the API; “—” means the
          value was not reported.
        </p>
      ) : null}
    </div>
  );
}
