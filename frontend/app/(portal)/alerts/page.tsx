"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  Filter,
  RefreshCw,
  Search,
  ShieldAlert,
} from "lucide-react";

import { acknowledgeEvent, getEvent, listEvents, resolveEvent } from "@/lib/api";
import type { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  formatDateTime,
  formatEventDuration,
  humanizeEventType,
  pluralize,
} from "@/lib/format";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { useSession } from "@/lib/session";
import { useApi, useAsyncAction } from "@/lib/use-api";
import type { ClinicalStatus, Event, EventStatus } from "@/lib/types";
import { Button, buttonClasses } from "@/components/forms/button";
import { FormBanner, apiErrorMessage } from "@/components/forms/form-banner";
import { Input, Select, Textarea } from "@/components/forms/inputs";
import { EmptyState } from "@/components/layout/empty-state";
import { ErrorState } from "@/components/layout/error-state";
import { Modal } from "@/components/layout/modal";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton, TableSkeleton } from "@/components/layout/skeleton";
import { SectionCard } from "@/components/layout/section-card";
import { DataTable, type Column } from "@/components/tables/data-table";
import { PermissionDenied } from "@/components/status/permission-denied";
import { SeverityBadge } from "@/components/status/severity-badge";
import { StatusBadge } from "@/components/status/status-badge";

type TimeRange = "all" | "24h" | "7d" | "30d";

const ACTIVE_STATUSES = new Set<EventStatus>(["new", "acknowledged", "under_review"]);
const RANK: Record<string, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
  unknown: 0,
};

function eventTime(event: Event): number {
  const value = event.start_at ?? event.created_at;
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isActiveStatus(status: EventStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}

function clinicalStatus(status: string): ClinicalStatus {
  const normalized = status.toLowerCase().replace(/\s+/g, "_");
  if (
    normalized === "new" ||
    normalized === "acknowledged" ||
    normalized === "under_review" ||
    normalized === "resolved" ||
    normalized === "false_positive"
  ) {
    return normalized;
  }
  return "unknown";
}

function formatEvidenceValue(value: unknown): string {
  if (value === null || value === undefined) return "Not reported";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "Unreadable value";
  }
}

function isNotFound(error: ApiError | null): boolean {
  return Boolean(error && (error.status === 404 || error.code === "not_found"));
}

function EventDetailShell({
  event,
  timeZone,
  usingListFallback,
  detailError,
  children,
}: {
  event: Event;
  timeZone: string;
  usingListFallback: boolean;
  detailError: ApiError | null;
  children?: React.ReactNode;
}) {
  const evidenceEntries = event.evidence ? Object.entries(event.evidence) : [];
  const transitions = [...event.transitions].sort((a, b) => {
    const aMs = a.timestamp ? Date.parse(a.timestamp) : 0;
    const bMs = b.timestamp ? Date.parse(b.timestamp) : 0;
    return aMs - bMs;
  });

  return (
    <div className="space-y-4">
      {usingListFallback && detailError ? (
        <FormBanner tone="warning" title="Showing summary details">
          {isNotFound(detailError)
            ? "The detailed event record is not available from this API build. The fields below come from the event list summary; state history and evidence may be missing."
            : "The detailed event record could not be refreshed. The fields below come from the event list summary and may be incomplete."}
        </FormBanner>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        <SeverityBadge severity={event.severity} />
        <StatusBadge status={event.status} />
        {event.source ? (
          <span className="rounded border border-line bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
            Source: {event.source}
          </span>
        ) : null}
      </div>

      <div>
        <h3 className="text-base font-semibold text-ink">
          {humanizeEventType(event.event_type)}
        </h3>
        <p className="mt-1 text-xs leading-5 text-ink-subtle">
          This is a possible signal for clinical review, not a diagnosis. Interpret it alongside the
          source data and the patient's clinical context.
        </p>
      </div>

      <dl className="grid gap-x-4 gap-y-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="font-medium uppercase tracking-wide text-ink-subtle">Patient</dt>
          <dd className="mt-0.5 text-ink">
            {event.patient_id ? (
              <Link
                href={`/patients/${encodeURIComponent(event.patient_id)}`}
                className="font-medium underline-offset-2 hover:text-accent-800 hover:underline"
              >
                {event.patient_name ?? "Open patient workspace"}
              </Link>
            ) : (
              (event.patient_name ?? "Not reported")
            )}
            {event.patient_code ? (
              <span className="ml-1.5 font-mono text-[11px] text-ink-subtle">{event.patient_code}</span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="font-medium uppercase tracking-wide text-ink-subtle">Started</dt>
          <dd className="mt-0.5 text-ink">{formatDateTime(event.start_at, timeZone)}</dd>
        </div>
        <div>
          <dt className="font-medium uppercase tracking-wide text-ink-subtle">Ended</dt>
          <dd className="mt-0.5 text-ink">
            {event.end_at ? formatDateTime(event.end_at, timeZone) : "Not ended"}
          </dd>
        </div>
        <div>
          <dt className="font-medium uppercase tracking-wide text-ink-subtle">Duration</dt>
          <dd className="mt-0.5 text-ink">
            {formatEventDuration(event.start_at, event.end_at, event.status)}
          </dd>
        </div>
        <div>
          <dt className="font-medium uppercase tracking-wide text-ink-subtle">Rule / algorithm</dt>
          <dd className="mt-0.5 font-mono text-[11px] text-ink">
            {event.rule_version ?? "Not reported"}
          </dd>
        </div>
        <div>
          <dt className="font-medium uppercase tracking-wide text-ink-subtle">Created</dt>
          <dd className="mt-0.5 text-ink">{formatDateTime(event.created_at, timeZone)}</dd>
        </div>
      </dl>

      <div className="rounded-lg border border-line bg-slate-50/60 p-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
          Trigger evidence
        </h4>
        {evidenceEntries.length === 0 ? (
          <p className="mt-2 text-xs leading-5 text-ink-muted">
            The API did not include structured evidence (thresholds, observed values, or windows)
            for this event. No interpretation is substituted.
          </p>
        ) : (
          <dl className="mt-2 space-y-1.5">
            {evidenceEntries.map(([key, value]) => (
              <div key={key} className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                <dt className="shrink-0 text-[11px] font-medium text-ink-muted">
                  {key.replace(/[_-]+/g, " ")}
                </dt>
                <dd className="break-words font-mono text-[11px] text-ink">
                  {formatEvidenceValue(value)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
          State history
        </h4>
        {transitions.length === 0 ? (
          <p className="mt-2 text-xs leading-5 text-ink-muted">
            No state transitions were reported. The current status is shown above as received.
          </p>
        ) : (
          <ol className="mt-2 space-y-2">
            {transitions.map((transition, index) => (
              <li
                key={`${transition.id ?? transition.timestamp ?? "transition"}-${index}`}
                className="rounded-md border border-line bg-surface px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  {transition.prior_status ? (
                    <>
                      <StatusBadge status={clinicalStatus(transition.prior_status)} size="sm" />
                      <ChevronRight className="h-3 w-3 text-line-strong" aria-hidden="true" />
                    </>
                  ) : null}
                  <StatusBadge status={clinicalStatus(transition.new_status)} size="sm" />
                  <span className="ml-auto text-[10px] text-ink-subtle">
                    {formatDateTime(transition.timestamp, timeZone)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-ink-muted">
                  {transition.actor_name ?? "Actor not reported"}
                  {transition.note ? ` · ${transition.note}` : ""}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>

      <p className="text-[11px] leading-5 text-ink-subtle">
        Device connection, motion context, and waveform evidence are not exposed by this event
        payload. Their absence is not evidence that the signal was reliable.
      </p>

      {children}
    </div>
  );
}

function AlertsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { me } = useSession();
  const events = useApi((signal) => listEvents(signal), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [eventType, setEventType] = useState("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [note, setNote] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [resolveOpen, setResolveOpen] = useState(false);

  const acknowledged = useAsyncAction(acknowledgeEvent);
  const resolved = useAsyncAction(resolveEvent);

  const requestedEventId = searchParams.get("event");
  useEffect(() => {
    if (requestedEventId) {
      setSelectedId(requestedEventId);
      setNote("");
      setActionMessage(null);
    }
  }, [requestedEventId]);

  const allEvents = events.data?.events ?? [];
  const source = events.data?.source ?? "events";
  const allRows = useMemo(
    () => [...allEvents].sort((a, b) => eventTime(b) - eventTime(a)),
    [allEvents],
  );

  useEffect(() => {
    if (requestedEventId) return;
    if (selectedId || allRows.length === 0) return;
    setSelectedId(allRows[0].id);
  }, [selectedId, allRows, requestedEventId]);

  const eventTypes = useMemo(
    () => Array.from(new Set(allEvents.map((event) => event.event_type))).sort(),
    [allEvents],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const now = Date.now();
    const windowMs =
      timeRange === "24h"
        ? 24 * 60 * 60 * 1000
        : timeRange === "7d"
          ? 7 * 24 * 60 * 60 * 1000
          : timeRange === "30d"
            ? 30 * 24 * 60 * 60 * 1000
            : null;

    return allRows.filter((event) => {
      if (query) {
        const haystack = `${event.patient_name ?? ""} ${event.patient_code ?? ""} ${event.event_type}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (status === "active" && !isActiveStatus(event.status)) return false;
      if (status !== "all" && status !== "active" && event.status !== status) return false;
      if (severity !== "all" && event.severity !== severity) return false;
      if (eventType !== "all" && event.event_type !== eventType) return false;
      if (windowMs !== null && eventTime(event) > 0 && now - eventTime(event) > windowMs) {
        return false;
      }
      return true;
    });
  }, [allRows, search, status, severity, eventType, timeRange]);

  const selectedFromList = allRows.find((event) => event.id === selectedId) ?? null;
  const detail = useApi(
    (signal) => getEvent(selectedId as string, signal),
    [selectedId ?? ""],
    { enabled: Boolean(selectedId) },
  );
  const selected = detail.data ?? selectedFromList;
  const usingListFallback = Boolean(selectedFromList && detail.error && !detail.data);

  const canAcknowledge = hasPermission(me, PERMISSIONS.ALERTS_ACKNOWLEDGE);
  const canResolve = hasPermission(me, PERMISSIONS.ALERTS_RESOLVE);
  const selectedActive = selected ? isActiveStatus(selected.status) : false;
  const canAcknowledgeSelected =
    canAcknowledge && selected && selected.status === "new";
  const canResolveSelected = canResolve && selected && selectedActive;

  const selectEvent = (eventId: string) => {
    setSelectedId(eventId);
    setNote("");
    setActionMessage(null);
    acknowledged.reset();
    resolved.reset();
    router.replace(`/alerts?event=${encodeURIComponent(eventId)}`, { scroll: false });
  };

  const afterAction = (message: string) => {
    setActionMessage(message);
    setNote("");
    setResolveOpen(false);
    events.reload();
    detail.reload();
  };

  const handleAcknowledge = async () => {
    if (!selected) return;
    const ok = await acknowledged.run(selected.id, note);
    if (ok) afterAction("Event acknowledged. The original event and its history are preserved.");
  };

  const handleResolve = async () => {
    if (!selected) return;
    const ok = await resolved.run(selected.id, note);
    if (ok) afterAction("Event resolved. The original event and its history are preserved.");
  };

  const resetFilters = () => {
    setSearch("");
    setStatus("all");
    setSeverity("all");
    setEventType("all");
    setTimeRange("all");
  };

  const activeFilterCount =
    (search.trim() ? 1 : 0) +
    (status !== "all" ? 1 : 0) +
    (severity !== "all" ? 1 : 0) +
    (eventType !== "all" ? 1 : 0) +
    (timeRange !== "all" ? 1 : 0);

  const columns: Column<Event>[] = [
    {
      key: "event",
      header: "Event",
      render: (event) => (
        <div className="min-w-[13rem]">
          <div className="flex flex-wrap items-center gap-1">
            <SeverityBadge severity={event.severity} size="sm" />
            <StatusBadge status={event.status} size="sm" />
          </div>
          <button
            type="button"
            onClick={() => selectEvent(event.id)}
            className="mt-1 block text-left text-xs font-medium text-ink underline-offset-2 hover:text-accent-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
            aria-current={event.id === selectedId ? "true" : undefined}
          >
            {humanizeEventType(event.event_type)}
          </button>
          {event.rule_version ? (
            <p className="mt-0.5 font-mono text-[10px] text-ink-subtle">Rule {event.rule_version}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "patient",
      header: "Patient",
      render: (event) => (
        <div className="min-w-[9rem]">
          <p className="text-xs font-medium text-ink">{event.patient_name ?? "Not reported"}</p>
          {event.patient_code ? (
            <p className="font-mono text-[10px] text-ink-subtle">{event.patient_code}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "start",
      header: "Started",
      render: (event) => (
        <span className="whitespace-nowrap text-[11px] text-ink-muted">
          {formatDateTime(event.start_at, me?.timezone)}
        </span>
      ),
    },
    {
      key: "duration",
      header: "Duration",
      render: (event) => (
        <span className="whitespace-nowrap text-[11px] text-ink-muted">
          {formatEventDuration(event.start_at, event.end_at, event.status)}
        </span>
      ),
    },
    {
      key: "open",
      header: <span className="sr-only">Open</span>,
      align: "right",
      render: (event) => (
        <button
          type="button"
          onClick={() => selectEvent(event.id)}
          className={buttonClasses("secondary", "sm")}
          aria-label={`Open event ${humanizeEventType(event.event_type)}`}
        >
          {event.id === selectedId ? "Viewing" : "Open"}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ),
    },
  ];

  if (events.error?.isForbidden) {
    return (
      <div className="space-y-6">
        <PageHeader title="Alerts and events" />
        <PermissionDenied
          title="Alert access restricted"
          description="The API did not permit access to the event feed for your account."
          detail={events.error.message}
        />
      </div>
    );
  }

  if (events.loading && !events.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Alerts and events" description="Loading the event feed…" />
        <TableSkeleton rows={8} columns={5} />
      </div>
    );
  }

  if (events.error && !events.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Alerts and events" />
        <ErrorState
          title="The event feed is unavailable"
          error={events.error}
          onRetry={events.reload}
          retrying={events.loading}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alerts and events"
        description="Review monitoring events across your assigned patients. Acknowledging or resolving an event preserves the original record and records the actor and time."
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
        meta={
          <>
            <span>{pluralize(allEvents.length, "event")} in feed</span>
            <span>{pluralize(filtered.length, "event")} shown</span>
            <SourceBadge source={source} />
          </>
        }
      />

      {source === "overview" ? (
        <FormBanner tone="warning" title="This feed is a recent-events summary">
          A global event-list endpoint is not available from this API build. Events shown here come
          from the clinical overview and may not include older or closed events. Open an individual
          event to request its detail record directly.
        </FormBanner>
      ) : null}

      {events.error && events.data ? (
        <FormBanner tone="warning" title="The event feed could not be refreshed">
          Showing the last successful response. Event states and counts may have changed since then.
          Refresh before acknowledging or resolving an event.
        </FormBanner>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <SectionCard bodyClassName="p-0">
            <div className="flex flex-col gap-3 border-b border-line bg-slate-50/50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor="alerts-search"
                    className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-subtle"
                  >
                    Search
                  </label>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle"
                      aria-hidden="true"
                    />
                    <Input
                      id="alerts-search"
                      className="pl-9"
                      placeholder="Patient, code, or event type"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </div>
                </div>
                <div className="w-full sm:w-36">
                  <label
                    htmlFor="alerts-status"
                    className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-subtle"
                  >
                    Status
                  </label>
                  <Select id="alerts-status" value={status} onChange={(event) => setStatus(event.target.value)}>
                    <option value="all">All statuses</option>
                    <option value="active">Active only</option>
                    <option value="new">New</option>
                    <option value="acknowledged">Acknowledged</option>
                    <option value="under_review">Under review</option>
                    <option value="resolved">Resolved</option>
                    <option value="false_positive">False positive</option>
                  </Select>
                </div>
                <div className="w-full sm:w-36">
                  <label
                    htmlFor="alerts-severity"
                    className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-subtle"
                  >
                    Severity
                  </label>
                  <Select
                    id="alerts-severity"
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
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <div className="w-full sm:w-44">
                  <label
                    htmlFor="alerts-type"
                    className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-subtle"
                  >
                    Event type
                  </label>
                  <Select
                    id="alerts-type"
                    value={eventType}
                    onChange={(event) => setEventType(event.target.value)}
                  >
                    <option value="all">All event types</option>
                    {eventTypes.map((type) => (
                      <option key={type} value={type}>
                        {humanizeEventType(type)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="w-full sm:w-36">
                  <label
                    htmlFor="alerts-range"
                    className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-subtle"
                  >
                    Time range
                  </label>
                  <Select
                    id="alerts-range"
                    value={timeRange}
                    onChange={(event) => setTimeRange(event.target.value as TimeRange)}
                  >
                    <option value="all">All time</option>
                    <option value="24h">Last 24 hours</option>
                    <option value="7d">Last 7 days</option>
                    <option value="30d">Last 30 days</option>
                  </Select>
                </div>
                <div className="flex items-center gap-2 sm:ml-auto">
                  <span className="inline-flex items-center gap-1 text-[11px] text-ink-subtle">
                    <Filter className="h-3 w-3" aria-hidden="true" />
                    {activeFilterCount > 0
                      ? `${pluralize(activeFilterCount, "filter")} active`
                      : "No filters"}
                  </span>
                  {activeFilterCount > 0 ? (
                    <Button variant="ghost" size="sm" onClick={resetFilters}>
                      Clear
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            {allRows.length === 0 ? (
              <EmptyState
                icon={Bell}
                title="No events reported"
                description="No monitoring events are available for your assigned patients. Absence of events does not by itself confirm that a patient is well."
              />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={Search}
                title="No events match these filters"
                description="Adjust the search, status, severity, event type, or time range."
                action={
                  <Button variant="secondary" size="sm" onClick={resetFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <DataTable
                columns={columns}
                rows={filtered}
                rowKey={(event) => event.id}
                isRowActive={(event) => event.id === selectedId}
                caption="Monitoring events"
              />
            )}
          </SectionCard>

          <p className="text-[11px] leading-5 text-ink-subtle">
            The list shows the fields the API reports. Severity and status are always shown with
            text, not colour alone. Events are possible signals, not diagnoses.
          </p>
        </div>

        <div className="min-w-0 space-y-5 xl:sticky xl:top-6 xl:self-start">
          <SectionCard
            title="Event detail"
            description={selected ? "Review the evidence and state history before acting." : undefined}
            actions={
              selected ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={detail.reload}
                  loading={detail.loading}
                  loadingLabel="Refreshing detail"
                  disabled={!selectedId}
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Refresh
                </Button>
              ) : null
            }
          >
            {!selectedId ? (
              <EmptyState
                compact
                icon={ShieldAlert}
                title="Select an event"
                description="Choose an event from the list to review its trigger evidence, state history, and permitted actions."
              />
            ) : detail.loading && !detail.data && !selectedFromList ? (
              <div className="space-y-3" role="status" aria-live="polite">
                <span className="sr-only">Loading event detail</span>
                <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200/80" />
                <div className="h-3 w-full animate-pulse rounded bg-slate-200/80" />
                <div className="h-3 w-4/5 animate-pulse rounded bg-slate-200/80" />
                <div className="h-24 w-full animate-pulse rounded bg-slate-200/80" />
              </div>
            ) : !selected ? (
              <EmptyState
                compact
                icon={ShieldAlert}
                title="Event detail unavailable"
                description="The selected event is not in the current list, and its detail record could not be loaded."
              />
            ) : detail.error?.isForbidden ? (
              <PermissionDenied
                title="Event detail restricted"
                description="The API did not permit access to this event's detail record."
                detail={detail.error.message}
                actions={<span />}
              />
            ) : (
              <div className="space-y-4">
                {actionMessage ? (
                  <FormBanner tone="success" onDismiss={() => setActionMessage(null)}>
                    {actionMessage}
                  </FormBanner>
                ) : null}

                <EventDetailShell
                  event={selected}
                  timeZone={me?.timezone ?? "UTC"}
                  usingListFallback={usingListFallback}
                  detailError={detail.error}
                >
                  {selectedActive ? (
                    <div className="space-y-3 border-t border-line pt-4">
                      {!canAcknowledge && !canResolve ? (
                        <p className="rounded-md border border-line bg-slate-50 px-3 py-2 text-xs leading-5 text-ink-muted">
                          Your account can view this event but does not have permission to
                          acknowledge or resolve it. The API enforces this independently.
                        </p>
                      ) : (
                        <>
                          <div>
                            <label
                              htmlFor="event-action-note"
                              className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-subtle"
                            >
                              Action note (optional)
                            </label>
                            <Textarea
                              id="event-action-note"
                              rows={3}
                              maxLength={1000}
                              value={note}
                              onChange={(event) => setNote(event.target.value)}
                              placeholder="Reason for acknowledging or resolving this event…"
                              aria-describedby="event-action-note-hint"
                            />
                            <p id="event-action-note-hint" className="mt-1 text-[11px] text-ink-subtle">
                              The note is stored with the event's state history. Actions do not
                              delete the original event.
                            </p>
                          </div>

                          {acknowledged.error ? (
                            <FormBanner tone="error" title="Acknowledging failed">
                              {apiErrorMessage(acknowledged.error)}
                            </FormBanner>
                          ) : null}
                          {resolved.error ? (
                            <FormBanner tone="error" title="Resolving failed">
                              {apiErrorMessage(resolved.error)}
                            </FormBanner>
                          ) : null}

                          <div className="flex flex-wrap gap-2">
                            {canAcknowledgeSelected ? (
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={handleAcknowledge}
                                loading={acknowledged.pending}
                                loadingLabel="Acknowledging"
                              >
                                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                                Acknowledge
                              </Button>
                            ) : null}
                            {canResolve ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setResolveOpen(true)}
                                disabled={!canResolveSelected || resolved.pending}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                                Resolve…
                              </Button>
                            ) : null}
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="rounded-md border border-line bg-slate-50 px-3 py-2 text-xs leading-5 text-ink-muted">
                      This event is closed. Its record and state history remain available for
                      review; no further state action is offered.
                    </p>
                  )}
                </EventDetailShell>
              </div>
            )}
          </SectionCard>

          <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-ink-subtle" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-ink">Time and data context</h2>
            </div>
            <p className="mt-2 text-xs leading-5 text-ink-muted">
              Times are shown in {me?.timezone ?? "UTC"}. An event can remain open after data stops
              arriving; check the patient workspace for freshness and device state before concluding
              that a signal is current.
            </p>
          </div>
        </div>
      </div>

      <Modal
        open={resolveOpen}
        onClose={() => setResolveOpen(false)}
        title="Resolve this event?"
        description="Resolving closes the event as resolved. It does not delete the event or its history."
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setResolveOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleResolve}
              loading={resolved.pending}
              loadingLabel="Resolving"
            >
              Resolve event
            </Button>
          </>
        }
      >
        {selected ? (
          <div className="space-y-3">
            <dl className="space-y-1.5 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-subtle">Event</dt>
                <dd className="text-right font-medium text-ink">
                  {humanizeEventType(selected.event_type)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-subtle">Patient</dt>
                <dd className="text-right text-ink">{selected.patient_name ?? "Not reported"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-subtle">Current status</dt>
                <dd className="text-right">
                  <StatusBadge status={selected.status} size="sm" />
                </dd>
              </div>
            </dl>
            {note.trim() ? (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">
                  Note to record
                </p>
                <p className="mt-1 whitespace-pre-wrap rounded-md border border-line bg-slate-50 px-2.5 py-2 text-xs leading-5 text-ink">
                  {note.trim()}
                </p>
              </div>
            ) : null}
            <p className="text-xs leading-5 text-ink-muted">
              The API records your account and the current time with this state change. If resolving
              is not appropriate, cancel and continue review.
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function SourceBadge({ source }: { source: "events" | "overview" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        source === "events"
          ? "border-line-strong bg-slate-50 text-ink-subtle"
          : "border-amber-200 bg-amber-50 text-amber-900",
      )}
    >
      {source === "events" ? "Event feed" : "Overview summary"}
    </span>
  );
}

export default function AlertsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AlertsContent />
    </Suspense>
  );
}
