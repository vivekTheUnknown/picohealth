"use client";

import { RefreshCw } from "lucide-react";

import { getPatientRecords } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import { Button } from "@/components/forms/button";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/layout/skeleton";
import { ErrorState } from "@/components/layout/error-state";
import { AppRecordsPanel } from "@/components/clinical/app-records-panel";

export default function PatientRecordsPage() {
  const { me } = useSession();
  const records = useApi((signal) => getPatientRecords(signal), []);
  const timeZone = me?.timezone ?? "UTC";

  return (
    <div className="space-y-6">
      <PageHeader
        title="My readings"
        description="Processed snapshots synced directly from the PicoHealth app. Newest first."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={records.reload}
            loading={records.loading}
            loadingLabel="Refreshing"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      {records.loading && !records.data ? <PageSkeleton /> : null}

      {records.error && !records.data ? (
        <ErrorState
          title="Readings could not be loaded"
          error={records.error}
          onRetry={records.reload}
          retrying={records.loading}
        />
      ) : null}

      {records.data ? (
        <AppRecordsPanel
          records={records.data}
          timeZone={timeZone}
          title="Synced readings"
          description="All metrics the app computed, including signal state and device context."
        />
      ) : null}
    </div>
  );
}
