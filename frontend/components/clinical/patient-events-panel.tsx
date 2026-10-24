"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Bell, ChevronRight, RefreshCw } from "lucide-react";

import { listPatientEvents } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  formatDateTime,
  formatEventDuration,
  humanizeEventType,
  pluralize,
} from "@/lib/format";
import { useApi } from "@/lib/use-api";
import type { Event, PatientOverview } from "@/lib/types";
import { Button } from "@/components/forms/button";
import { FormBanner } from "@/components/forms/form-banner";
import { EmptyState } from "@/components/layout/empty-state";
import { ErrorState } from "@/components/layout/error-state";
import { SectionCard } from "@/components/layout/section-card";
import { Skeleton } from "@/components/layout/skeleton";
import { PermissionDenied } from "@/components/status/permission-denied";
import { SeverityBadge } from "@/components/status/severity-badge";
import { StatusBadge } from "@/components/status/status-badge";

type EventFilter = "all" | "active" | "closed";

const ACTIVE_STATUSES = new Set(["new", "acknowledged", "under_review"]);

function eventTime(event: Event): number {
  const value = event.start_at ?? event.created_at;
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isActive(event: Event): boolean {
  return ACTIVE_STATUSES.has(event.status);
}

export function PatientEventsPanel({
  patientId,
  overview,
  timeZone,
}: {
  patientId: string;
  overview: PatientOverview;
  timeZone: string;
}) {
  const events = useApi((signal) => listPatientEvents(patientId, signal), [patientId]);
  const [filter, setFilter] = useState<EventFilter>("all");

  const fallbackUsed = Boolean(events.error && !events.error.isForbidden && overview.active_events.length > 0);
  const source = events.data && events.data.length > 0 ? events.data : fallbackUsed ? overview.active_events : [];
  const rows = useMemo(
    () =>
      [...source]
        .filter((event) => {
          if (filter === "active") return isActive(event);
          if (filter === "closed") return !isActive(event);
          return true;
        })
        .sort((a, b) => eventTime(b) - eventTime(a)),
    [source, filter],
  );

  const activeCount = source.filter(isActive).length;

  if (events.error?.isForbidden) {
    return (
      <PermissionDenied
        title="Event access restricted"
        description="The API did not permit access to this patient's event history."
        detail={events.error.message}
        actions={null}
      />
    );
  }

  return (
    <SectionCard
      title="Event timeline"
      description="Possible signals for clinical review, not diagnoses. Event state changes are recorded and never delete the original event."
      actions={
        <Button
          variant="secondary"
          size="sm"
          onClick={events.reload}
          loading={events.loading}
          loadingLabel="Refreshing"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Refresh
        </Button>
      }
    >
      <div className="space-y-4">
        {fallbackUsed ? (
          <FormBanner tone="warning" title="Showing active events from the patient overview">
            The full event history could not be loaded. Only currently active events reported in the
            patient overview are shown; older or closed events may be missing.
          </FormBanner>
        ) : null}

        {events.error && !fallbackUsed ? (
          <ErrorState
            title="The event timeline could not be loaded"
            error={events.error}
            onRetry={events.reload}
            retrying={events.loading}
          />
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface-raised p-1"
            role="group"
            aria-label="Filter events by state"
          >
            {(
              [
                { key: "all", label: "All events", count: source.length },
                { key: "active", label: "Active", count: activeCount },
                { key: "closed", label: "Closed", count: source.length - activeCount },
              ] as const
            ).map((entry) => (
              <button
                key={entry.key}
                type="button"
                aria-pressed={filter === entry.key}
                onClick={() => setFilter(entry.key)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  filter === entry.key
                    ? "bg-surface text-ink"
                    : "text-ink-muted hover:bg-surface/70 hover:text-ink",
                )}
              >
                {entry.label}
                <span className="ml-1.5 text-2xs tabular-nums text-ink-subtle">{entry.count}</span>
              </button>
            ))}
          </div>
          <p className="text-2xs text-ink-subtle">
            {pluralize(rows.length, "event")} shown · {pluralize(activeCount, "active event")}
          </p>
        </div>

        {events.loading && !events.data && !fallbackUsed ? (
          <div className="space-y-2" role="status" aria-live="polite">
            <span className="sr-only">Loading event timeline</span>
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={source.length === 0 ? "No events reported" : "No events match this filter"}
            description={
              source.length === 0
                ? "No monitoring events have been recorded for this patient. Absence of events does not by itself confirm that the patient is well."
                : "Change the state filter to see other events."
            }
          />
        ) : (
          <ol className="space-y-2">
            {rows.map((event) => (
              <li key={event.id}>
                <div className="rounded-lg border border-line bg-surface p-3.5 transition-colors hover:border-line-strong hover:bg-surface-raised/60 sm:p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <SeverityBadge severity={event.severity} size="sm" />
                        <StatusBadge status={event.status} size="sm" />
                        {event.source ? (
                          <span className="rounded border border-line bg-surface-raised px-1.5 py-0.5 text-2xs font-medium text-ink-subtle">
                            {event.source}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1.5 text-sm font-medium text-ink">
                        {humanizeEventType(event.event_type)}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-ink-subtle">
                        <span>Started {formatDateTime(event.start_at, timeZone)}</span>
                        <span>Duration {formatEventDuration(event.start_at, event.end_at, event.status)}</span>
                        {event.rule_version ? (
                          <span className="font-mono">Rule {event.rule_version}</span>
                        ) : null}
                        {event.transitions.length > 0 ? (
                          <span>{pluralize(event.transitions.length, "state change")}</span>
                        ) : null}
                      </div>
                    </div>
                    <Link
                      href={`/alerts?event=${encodeURIComponent(event.id)}`}
                      className="inline-flex shrink-0 items-center gap-0.5 self-start rounded text-xs font-medium text-accent underline-offset-2 hover:underline focus-visible:outline-none"
                    >
                      Open event
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </SectionCard>
  );
}
