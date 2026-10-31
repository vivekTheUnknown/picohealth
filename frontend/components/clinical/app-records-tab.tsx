"use client";

import { getAppRecords } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { PageSkeleton } from "@/components/layout/skeleton";
import { ErrorState } from "@/components/layout/error-state";
import { AppRecordsPanel } from "@/components/clinical/app-records-panel";

/** Clinician view of the processed records the patient's phone synced. */
export function AppRecordsTab({
  patientId,
  timeZone,
}: {
  patientId: string;
  timeZone: string;
}) {
  const records = useApi((signal) => getAppRecords(patientId, signal), [patientId]);

  if (records.loading && !records.data) return <PageSkeleton />;

  if (records.error && !records.data) {
    return (
      <ErrorState
        title="App measurements could not be loaded"
        error={records.error}
        onRetry={records.reload}
        retrying={records.loading}
      />
    );
  }

  return (
    <AppRecordsPanel
      records={records.data ?? []}
      timeZone={timeZone}
      title="App measurements"
      description="Computed on the patient's phone and synced directly. The portal does not recompute these values."
    />
  );
}
