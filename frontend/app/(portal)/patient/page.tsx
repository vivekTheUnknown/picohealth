"use client";

import Link from "next/link";
import { Activity, Cpu, Database, RefreshCw } from "lucide-react";

import { getPatientRecords, getPatientSelf } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import { activityLabel, opticalStateView, orientationLabel } from "@/lib/app-metrics";
import { Button, buttonClasses } from "@/components/forms/button";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/skeleton";
import { ErrorState } from "@/components/layout/error-state";
import { SectionCard } from "@/components/layout/section-card";
import { Badge } from "@/components/status/badge";
import { AppRecordsPanel } from "@/components/clinical/app-records-panel";

export default function PatientOverviewPage() {
  const { me } = useSession();
  const self = useApi((signal) => getPatientSelf(signal), []);
  const records = useApi((signal) => getPatientRecords(signal), []);
  const timeZone = me?.timezone ?? "UTC";

  if (self.loading && !self.data) return <PageSkeleton />;

  if (self.error && !self.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="My health" />
        <ErrorState
          title="Your health record could not be loaded"
          error={self.error}
          message="The portal could not read your patient record. Retry, or contact your clinic if this persists."
          onRetry={self.reload}
          retrying={self.loading}
        />
      </div>
    );
  }

  if (!self.data) return <PageSkeleton />;

  const data = self.data;
  const latest = data.latest_record;
  const state = opticalStateView(latest?.signal_quality ?? null);

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.display_name}
        description={
          <>
            <span className="font-mono text-xs text-ink-muted">{data.patient_code}</span>
            <span className="ml-2 text-xs text-ink-subtle">
              {" · "}
              {data.record_count} measurement{data.record_count === 1 ? "" : "s"} synced
            </span>
          </>
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                self.reload();
                records.reload();
              }}
              loading={self.loading || records.loading}
              loadingLabel="Refreshing"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Refresh
            </Button>
            <Link href="/patient/records" className={buttonClasses("ghost", "sm")}>
              All readings
            </Link>
          </>
        }
        meta={
          <>
            <span className="inline-flex items-center gap-1">
              <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
              {data.device ? data.device.hardware_identifier : "No device synced yet"}
            </span>
            {data.device?.last_seen_at ? (
              <span>Device last seen {formatDateTime(data.device.last_seen_at, timeZone)}</span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <Database className="h-3.5 w-3.5" aria-hidden="true" />
              Stored on the portal from your phone
            </span>
          </>
        }
      />

      {latest ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-line bg-surface p-3">
            <p className="text-2xs text-ink-subtle">Latest record</p>
            <p className="mt-1 text-sm text-ink">{formatDateTime(latest.measured_at, timeZone)}</p>
            <Badge tone={state.tone} size="sm" title={state.detail} className="mt-2">
              {state.label}
            </Badge>
          </div>
          <div className="rounded-lg border border-line bg-surface p-3">
            <p className="text-2xs text-ink-subtle">Movement</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink">
              <Activity className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {activityLabel(latest.activity_level)}
            </p>
            <p className="mt-0.5 text-2xs text-ink-subtle">
              {latest.activity_rms_g !== null ? `${latest.activity_rms_g.toFixed(3)} g RMS` : "Not reported"}
            </p>
          </div>
          <div className="rounded-lg border border-line bg-surface p-3">
            <p className="text-2xs text-ink-subtle">Device orientation</p>
            <p className="mt-1 text-sm text-ink">{orientationLabel(latest.orientation_class)}</p>
            <p className="mt-0.5 text-2xs text-ink-subtle">Device, not body posture</p>
          </div>
          <div className="rounded-lg border border-line bg-surface p-3">
            <p className="text-2xs text-ink-subtle">Algorithm</p>
            <p className="mt-1 font-mono text-sm text-ink">{latest.algorithm_version ?? "—"}</p>
            <p className="mt-0.5 text-2xs text-ink-subtle">Computed on your phone</p>
          </div>
        </div>
      ) : (
        <SectionCard title="No measurements yet">
          <p className="text-sm leading-6 text-ink-muted">
            Open the PicoHealth app, connect the device, then sign in under Settings → Health
            portal. Readings appear here after the first successful sync. The portal does not
            invent or backfill data.
          </p>
        </SectionCard>
      )}

      {records.error ? (
        <ErrorState
          title="Readings could not be refreshed"
          error={records.error}
          onRetry={records.reload}
          retrying={records.loading}
        />
      ) : null}

      <AppRecordsPanel
        records={records.data ?? []}
        timeZone={timeZone}
        title="My measurements"
        description="Every value below was computed on your phone and synced here unchanged."
      />

      <SectionCard title="What this data is">
        <p className="text-xs leading-5 text-ink-muted">
          Signal conversion, quality gating and derived metrics all run on the phone. The portal
          stores the published snapshot, including the optical state and algorithm version, so a
          value can always be traced to the conditions that produced it. Heart rate and SpO₂ are
          withheld when contact, motion, interval-consistency or red/IR correspondence checks fail.
          PRV is PPG-derived RMSSD, not ECG HRV.
        </p>
      </SectionCard>
    </div>
  );
}
