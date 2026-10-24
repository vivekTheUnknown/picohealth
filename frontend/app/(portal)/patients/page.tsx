"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, RefreshCw, Search, Users } from "lucide-react";

import { listPatients } from "@/lib/api";
import { freshnessFor } from "@/lib/freshness";
import { formatNumber, humanizeEventType, pluralize } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import type { PatientSummary } from "@/lib/types";
import { Button, buttonClasses } from "@/components/forms/button";
import { FormBanner } from "@/components/forms/form-banner";
import { Input, Select } from "@/components/forms/inputs";
import { DataTable, type Column } from "@/components/tables/data-table";
import { EmptyState } from "@/components/layout/empty-state";
import { ErrorState } from "@/components/layout/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { SectionCard } from "@/components/layout/section-card";
import { TableSkeleton } from "@/components/layout/skeleton";
import { PermissionDenied } from "@/components/status/permission-denied";
import { DataFreshness } from "@/components/status/data-freshness";
import { DeviceStatusBadge } from "@/components/status/device-status-badge";
import { SeverityBadge } from "@/components/status/severity-badge";
import { StatusBadge } from "@/components/status/status-badge";

function PatientStatusPill({ status }: { status: string }) {
  const label = status === "active" ? "Active" : status === "inactive" ? "Inactive" : "Unknown";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
      <span
        className={
          status === "active"
            ? "h-1.5 w-1.5 rounded-full bg-success"
            : status === "inactive"
              ? "h-1.5 w-1.5 rounded-full bg-ink-subtle"
              : "h-1.5 w-1.5 rounded-full bg-warning"
        }
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

export default function PatientsDirectoryPage() {
  const { me } = useSession();
  const patients = useApi((signal) => listPatients(signal), []);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [freshness, setFreshness] = useState("all");

  const rows = patients.data ?? [];

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((patient) => {
      if (query) {
        const haystack = `${patient.display_name} ${patient.patient_code}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (status !== "all" && patient.status !== status) return false;
      if (freshness !== "all") {
        const state = freshnessFor(patient.last_received_at).state;
        if (freshness === "fresh" && state !== "fresh") return false;
        if (freshness === "stale" && state !== "stale") return false;
        if (freshness === "none" && state !== "unavailable") return false;
      }
      return true;
    });
  }, [rows, search, status, freshness]);

  const columns: Column<PatientSummary>[] = [
    {
      key: "patient",
      header: "Patient",
      render: (patient) => (
        <div className="min-w-0">
          <Link
            href={`/patients/${patient.id}`}
            className="font-medium text-ink underline-offset-2 hover:text-accent hover:underline"
          >
            {patient.display_name}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-2xs text-ink-subtle">
            {patient.patient_code ? (
              <span className="font-mono">{patient.patient_code}</span>
            ) : (
              <span>No patient code reported</span>
            )}
            <PatientStatusPill status={patient.status} />
          </div>
        </div>
      ),
    },
    {
      key: "event",
      header: "Latest event",
      render: (patient) =>
        patient.latest_event ? (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-1">
              <SeverityBadge severity={patient.latest_event.severity} size="sm" />
              <StatusBadge status={patient.latest_event.status} size="sm" />
            </div>
            <p className="text-xs text-ink-muted">
              {humanizeEventType(patient.latest_event.event_type)}
            </p>
          </div>
        ) : (
          <span className="text-xs text-ink-subtle">None reported</span>
        ),
    },
    {
      key: "data",
      header: "Last data",
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
          <div className="space-y-1">
            <DeviceStatusBadge status={patient.device_status} />
            {patient.battery_level !== null ? (
              <p className="text-2xs text-ink-subtle">
                Battery {formatNumber(patient.battery_level, 0)}%
              </p>
            ) : null}
          </div>
        ) : (
          <span className="text-xs text-ink-subtle">Not reported</span>
        ),
    },
    {
      key: "open",
      header: <span className="sr-only">Open</span>,
      align: "right",
      render: (patient) => (
        <Link
          href={`/patients/${patient.id}`}
          className={buttonClasses("secondary", "sm")}
          aria-label={`Open patient workspace for ${patient.display_name}`}
        >
          Open
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      ),
    },
  ];

  if (patients.error?.isForbidden) {
    return (
      <div className="space-y-6">
        <PageHeader title="Patients" />
        <PermissionDenied detail={patients.error.message} />
      </div>
    );
  }

  if (patients.loading && !patients.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Patients" description="Loading your assigned patients…" />
        <TableSkeleton rows={8} columns={5} />
      </div>
    );
  }

  if (patients.error && !patients.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Patients" />
        <ErrorState
          title="The patient directory is unavailable"
          error={patients.error}
          onRetry={patients.reload}
          retrying={patients.loading}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Patients"
        description="Patients your account is authorized to access. Search and open a monitoring workspace."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={patients.reload}
            loading={patients.loading}
            loadingLabel="Refreshing"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Refresh
          </Button>
        }
        meta={
          <span>
            {pluralize(rows.length, "patient")} accessible · {filtered.length} shown
          </span>
        }
      />

      <SectionCard bodyClassName="p-0">
        {patients.error ? (
          <div className="border-b border-line p-4">
            <FormBanner tone="warning" title="The patient directory could not be refreshed">
              Showing the last successful response. Assignment and device state may have changed;
              retry before acting on this list.
            </FormBanner>
          </div>
        ) : null}
        <div className="flex flex-col gap-3 border-b border-line bg-surface-raised/50 p-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-0 flex-1">
            <label
              htmlFor="directory-search"
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
                id="directory-search"
                className="pl-9"
                placeholder="Name or patient code"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
          <div className="w-full sm:w-40">
            <label
              htmlFor="directory-status"
              className="mb-1 block text-2xs font-medium text-ink-subtle"
            >
              Patient status
            </label>
            <Select id="directory-status" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </div>
          <div className="w-full sm:w-40">
            <label
              htmlFor="directory-freshness"
              className="mb-1 block text-2xs font-medium text-ink-subtle"
            >
              Data freshness
            </label>
            <Select
              id="directory-freshness"
              value={freshness}
              onChange={(event) => setFreshness(event.target.value)}
            >
              <option value="all">All data</option>
              <option value="fresh">Fresh</option>
              <option value="stale">Stale</option>
              <option value="none">No data</option>
            </Select>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No patients assigned"
            description="Your account has no patient assignments yet. An administrator can assign patients to you. If you expected to see patients here, contact an administrator."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No patients match these filters"
            description="Adjust the search term, status, or freshness filter."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setStatus("all");
                  setFreshness("all");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(patient) => patient.id}
            caption="Assigned patients"
          />
        )}
      </SectionCard>

      <p className="text-2xs leading-5 text-ink-subtle">
        The API returns only patients your role and active assignments permit. A patient missing
        from this list is not necessarily an error; it may mean you are not assigned.
      </p>
    </div>
  );
}
