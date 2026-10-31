"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, RefreshCw, UserX } from "lucide-react";

import { getPatientOverview } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import type { ApiError } from "@/lib/api-client";
import { Button, buttonClasses } from "@/components/forms/button";
import { FormBanner } from "@/components/forms/form-banner";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/skeleton";
import { ErrorState } from "@/components/layout/error-state";
import { PermissionDenied } from "@/components/status/permission-denied";
import { DataFreshness } from "@/components/status/data-freshness";
import { DeviceStatusBadge } from "@/components/status/device-status-badge";
import { Tabs, type TabItem } from "@/components/navigation/tabs";
import { AppRecordsTab } from "@/components/clinical/app-records-tab";
import { MeasurementsPanel } from "@/components/clinical/measurements-panel";
import { TrendsPanel } from "@/components/clinical/trends-panel";
import { PatientEventsPanel } from "@/components/clinical/patient-events-panel";
import { NotesPanel } from "@/components/clinical/notes-panel";

type TabId = "measurements" | "app" | "trends" | "events" | "notes";

const TAB_PANEL_ID = "patient-workspace-panel";

function PatientNotFound({ patientId }: { patientId: string }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Patient not found"
        breadcrumbs={[{ label: "Patients", href: "/patients" }, { label: "Not found" }]}
      />
      <div className="flex flex-col items-start gap-4 rounded-lg border border-line bg-surface p-6 sm:flex-row">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-active text-ink-subtle">
          <UserX className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">This patient record is unavailable</h2>
          <p className="mt-1 text-sm leading-6 text-ink-muted">
            The API returned no patient for identifier <span className="font-mono">{patientId}</span>.
            The record may not exist, or it may not be assigned to your account. The portal does not
            reveal which.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/patients" className={buttonClasses("secondary", "sm")}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Back to patients
            </Link>
            <Link href="/overview" className={buttonClasses("ghost", "sm")}>
              Clinical overview
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function isNotFound(error: ApiError | null): boolean {
  return Boolean(error && (error.status === 404 || error.code === "not_found"));
}

export default function PatientWorkspacePage() {
  const params = useParams<{ patientId: string | string[] }>();
  const patientId = Array.isArray(params.patientId) ? params.patientId[0] ?? "" : params.patientId;
  const { me } = useSession();
  const overview = useApi((signal) => getPatientOverview(patientId, signal), [patientId]);
  const [tab, setTab] = useState<TabId>("measurements");

  if (overview.error?.isForbidden) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Patient workspace"
          breadcrumbs={[{ label: "Patients", href: "/patients" }, { label: "Restricted" }]}
        />
        <PermissionDenied
          title="Patient access restricted"
          description="The API refused access to this patient record. An active assignment may be required, or your role may not permit it."
          detail={overview.error.message}
        />
      </div>
    );
  }

  if (isNotFound(overview.error)) {
    return <PatientNotFound patientId={patientId} />;
  }

  if (overview.loading && !overview.data) {
    return <PageSkeleton />;
  }

  if (overview.error && !overview.data) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Patient workspace"
          breadcrumbs={[{ label: "Patients", href: "/patients" }, { label: "Unavailable" }]}
        />
        <ErrorState
          title="The patient workspace could not be loaded"
          error={overview.error}
          onRetry={overview.reload}
          retrying={overview.loading}
        />
      </div>
    );
  }

  if (!overview.data) return <PageSkeleton />;

  const data = overview.data;
  const timeZone = me?.timezone ?? "UTC";
  const patient = data.patient;
  const assignment = data.assignment;
  const device = data.device;

  const tabs: TabItem[] = [
    { id: "measurements", label: "Measurements", count: data.measurements.length || null },
    { id: "app", label: "App data" },
    { id: "trends", label: "Trends" },
    {
      id: "events",
      label: "Events",
      count: data.active_events.length > 0 ? data.active_events.length : null,
    },
    { id: "notes", label: "Notes" },
  ];

  // Sentence case, spelled out rather than uppercased by CSS.
  const typeLabel =
    assignment?.assignment_type === "secondary"
      ? "Secondary assignment"
      : assignment?.assignment_type === "primary"
        ? "Primary assignment"
        : "Assignment";
  const statusLabel =
    assignment?.status === "active"
      ? "active"
      : assignment?.status === "ended"
        ? "ended"
        : "status not reported";
  const assignmentText = assignment ? `${typeLabel} · ${statusLabel}` : "Assignment not reported";

  return (
    <div className="space-y-6">
      <PageHeader
        title={patient.display_name}
        description={
          <>
            {patient.patient_code ? (
              <span className="font-mono text-xs text-ink-muted">{patient.patient_code}</span>
            ) : (
              <span className="text-xs text-ink-subtle">No patient code reported</span>
            )}
            {patient.date_of_birth ? (
              <span className="ml-2 text-xs text-ink-subtle">
                · Date of birth {formatDate(patient.date_of_birth, timeZone)}
              </span>
            ) : null}
          </>
        }
        breadcrumbs={[
          { label: "Patients", href: "/patients" },
          { label: patient.display_name },
        ]}
        actions={
          <>
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
            <Link href="/patients" className={buttonClasses("ghost", "sm")}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Directory
            </Link>
          </>
        }
        meta={
          <>
            <DataFreshness
              timestamp={data.last_received_at}
              timeZone={timeZone}
              label="Data received"
              showAbsolute
            />
            <span>{assignmentText}</span>
            {assignment?.starts_at ? (
              <span>Assigned {formatDateTime(assignment.starts_at, timeZone)}</span>
            ) : null}
            {device ? (
              <span className="inline-flex items-center gap-1">
                Device <DeviceStatusBadge status={device.status} />
              </span>
            ) : (
              <span>Device not reported</span>
            )}
            <span>
              Patient status: {patient.status === "unknown" ? "not reported" : patient.status}
            </span>
          </>
        }
      />

      {overview.loading ? (
        <p className="text-xs text-ink-subtle" role="status">
          Refreshing workspace data…
        </p>
      ) : null}

      {overview.error ? (
        <FormBanner
          tone="warning"
          title="The workspace could not be refreshed"
        >
          Showing the last successful response received{" "}
          {data.generated_at ? formatDateTime(data.generated_at, timeZone) : "at an unreported time"}.
          Values remain subject to the freshness labels below. Retry before acting on them.
          <span className="mt-1 block">
            <Button variant="secondary" size="sm" onClick={overview.reload} loading={overview.loading}>
              Retry refresh
            </Button>
          </span>
        </FormBanner>
      ) : null}

      <div>
        <div>
          <Tabs
            items={tabs}
            value={tab}
            onChange={(next) => setTab(next as TabId)}
            idPrefix="patient-workspace"
            panelId={TAB_PANEL_ID}
            ariaLabel="Patient workspace sections"
          />
        </div>
        <div
          id={TAB_PANEL_ID}
          role="tabpanel"
          aria-labelledby={`patient-workspace-tab-${tab}`}
          tabIndex={0}
          className="pt-4 focus-visible:outline-none"
        >
          {tab === "measurements" ? (
            <MeasurementsPanel patientId={patientId} overview={data} timeZone={timeZone} />
          ) : null}
          {tab === "app" ? (
            <AppRecordsTab patientId={patientId} timeZone={timeZone} />
          ) : null}
          {tab === "trends" ? (
            <TrendsPanel patientId={patientId} overview={data} timeZone={timeZone} />
          ) : null}
          {tab === "events" ? (
            <PatientEventsPanel patientId={patientId} overview={data} timeZone={timeZone} />
          ) : null}
          {tab === "notes" ? (
            <NotesPanel patientId={patientId} overview={data} timeZone={timeZone} />
          ) : null}
        </div>
      </div>

      <p className="text-2xs leading-5 text-ink-subtle">
        Times are shown in {timeZone}. Measurements are summaries from the monitoring service, not a
        continuous clinical recording. Events are possible signals for review, not diagnoses.
      </p>
    </div>
  );
}
