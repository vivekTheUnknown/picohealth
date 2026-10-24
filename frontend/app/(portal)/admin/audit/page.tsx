"use client";

import { useState, type FormEvent } from "react";
import { FileClock, RefreshCw, Search, ShieldCheck } from "lucide-react";

import { listAuditEvents, type AuditQuery } from "@/lib/api";
import { formatDateTime, pluralize } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import type { AuditEvent } from "@/lib/types";
import { Button } from "@/components/forms/button";
import { Field } from "@/components/forms/field";
import { Input, Select } from "@/components/forms/inputs";
import { EmptyState } from "@/components/layout/empty-state";
import { ErrorState } from "@/components/layout/error-state";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton, TableSkeleton } from "@/components/layout/skeleton";
import { SectionCard } from "@/components/layout/section-card";
import { DataTable, type Column } from "@/components/tables/data-table";
import { AuditOutcomeBadge } from "@/components/status/audit-outcome-badge";
import { PermissionDenied } from "@/components/status/permission-denied";

function toIsoStart(date: string): string | undefined {
  return date ? new Date(`${date}T00:00:00.000Z`).toISOString() : undefined;
}

function toIsoEnd(date: string): string | undefined {
  return date ? new Date(`${date}T23:59:59.999Z`).toISOString() : undefined;
}

export default function AdminAuditPage() {
  const { me } = useSession();
  const [searchInput, setSearchInput] = useState("");
  const [actionInput, setActionInput] = useState("");
  const [outcomeInput, setOutcomeInput] = useState("all");
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const [filters, setFilters] = useState<AuditQuery>({});

  const audit = useApi(
    (signal) =>
      listAuditEvents(
        {
          search: filters.search,
          action: filters.action,
          outcome: filters.outcome,
          from: filters.from,
          to: filters.to,
        },
        signal,
      ),
    [filters.search ?? "", filters.action ?? "", filters.outcome ?? "", filters.from ?? "", filters.to ?? ""],
  );

  const rows = audit.data ?? [];
  const searchTerm = (filters.search ?? "").trim().toLowerCase();
  const filteredRows = searchTerm
    ? rows.filter((event) =>
        [
          event.actor_name,
          event.actor_email,
          event.actor_user_id,
          event.action,
          event.target_type,
          event.target_id,
          event.request_id,
        ]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.toLowerCase().includes(searchTerm)),
      )
    : rows;
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (fromInput && toInput && fromInput > toInput) {
      setValidation("The start date must be on or before the end date.");
      return;
    }
    setValidation(null);
    setFilters({
      search: searchInput.trim() || undefined,
      action: actionInput.trim() || undefined,
      outcome: outcomeInput === "all" ? undefined : outcomeInput,
      from: toIsoStart(fromInput),
      to: toIsoEnd(toInput),
    });
  };

  const clearFilters = () => {
    setSearchInput("");
    setActionInput("");
    setOutcomeInput("all");
    setFromInput("");
    setToInput("");
    setValidation(null);
    setFilters({});
    audit.reload();
  };

  const columns: Column<AuditEvent>[] = [
    {
      key: "time",
      header: "Time",
      render: (event) => (
        <span className="whitespace-nowrap text-[11px] text-ink-muted">
          {formatDateTime(event.timestamp, me?.timezone)}
        </span>
      ),
    },
    {
      key: "actor",
      header: "Actor",
      render: (event) => (
        <div className="min-w-[10rem]">
          <p className="text-xs font-medium text-ink">
            {event.actor_name ?? event.actor_email ?? "Not reported"}
          </p>
          {event.actor_email && event.actor_name ? (
            <p className="text-[10px] text-ink-subtle">{event.actor_email}</p>
          ) : null}
          {event.actor_user_id ? (
            <p className="font-mono text-[10px] text-ink-subtle">{event.actor_user_id}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "action",
      header: "Action",
      render: (event) => (
        <span className="break-words font-mono text-[11px] text-ink">{event.action}</span>
      ),
    },
    {
      key: "target",
      header: "Target",
      render: (event) => (
        <div className="min-w-[8rem]">
          <p className="text-[11px] text-ink-muted">{event.target_type ?? "Not reported"}</p>
          {event.target_id ? (
            <p className="break-all font-mono text-[10px] text-ink-subtle">{event.target_id}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "outcome",
      header: "Outcome",
      render: (event) => <AuditOutcomeBadge outcome={event.outcome} />,
    },
    {
      key: "request",
      header: "Request ID",
      render: (event) => (
        <span className="break-all font-mono text-[10px] text-ink-subtle">
          {event.request_id ?? "Not reported"}
        </span>
      ),
    },
  ];

  if (audit.error?.isForbidden) {
    return (
      <div className="space-y-6">
        <PageHeader title="Audit log" />
        <PermissionDenied
          title="Audit access restricted"
          description="The API did not permit access to audit events."
          detail={audit.error.message}
        />
      </div>
    );
  }

  if (audit.loading && !audit.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Audit log" description="Loading audit events…" />
        <PageSkeleton />
      </div>
    );
  }

  if (audit.error && !audit.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Audit log" />
        <ErrorState
          title="The audit log is unavailable"
          error={audit.error}
          onRetry={audit.reload}
          retrying={audit.loading}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Access-sensitive actions recorded by the API. Logs are append-only from the application's perspective; this page cannot edit or delete them."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={audit.reload}
            loading={audit.loading}
            loadingLabel="Refreshing"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Refresh
          </Button>
        }
        meta={
          <>
            <span>
              {searchTerm
                ? `${pluralize(filteredRows.length, "event")} shown of ${pluralize(rows.length, "event")}`
                : `${pluralize(rows.length, "event")} returned`}
            </span>
            <span>{activeFilterCount > 0 ? `${pluralize(activeFilterCount, "filter")} active` : "No filters"}</span>
          </>
        }
      />

      <SectionCard
        title="Filters"
        description="Action, outcome, and date filters are applied by the API, which returns at most the 100 most recent matching events. Free-text search matches the events loaded in this browser."
        className="overflow-visible"
      >
        <form onSubmit={applyFilters} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field id="audit-search" label="Search" hint="Actor, action, target, or request ID in the loaded events.">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle"
                  aria-hidden="true"
                />
                <Input
                  id="audit-search"
                  className="pl-9"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search audit text"
                />
              </div>
            </Field>
            <Field id="audit-action" label="Action" hint="For example, user.suspended.">
              <Input
                id="audit-action"
                value={actionInput}
                onChange={(event) => setActionInput(event.target.value)}
                placeholder="Exact action name"
                autoComplete="off"
              />
            </Field>
            <Field id="audit-outcome" label="Outcome">
              <Select
                id="audit-outcome"
                value={outcomeInput}
                onChange={(event) => setOutcomeInput(event.target.value)}
              >
                <option value="all">All outcomes</option>
                <option value="success">Success</option>
                <option value="denied">Denied</option>
                <option value="failure">Failure</option>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id="audit-from" label="From">
                <Input
                  id="audit-from"
                  type="date"
                  value={fromInput}
                  onChange={(event) => setFromInput(event.target.value)}
                />
              </Field>
              <Field id="audit-to" label="To">
                <Input
                  id="audit-to"
                  type="date"
                  value={toInput}
                  onChange={(event) => setToInput(event.target.value)}
                />
              </Field>
            </div>
          </div>
          {validation ? (
            <p role="alert" className="text-xs font-medium text-red-700">
              {validation}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="primary" size="sm">
              Apply filters
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={clearFilters}>
              Clear
            </Button>
          </div>
        </form>
      </SectionCard>

      <SectionCard bodyClassName="p-0">
        {audit.error ? (
          <div className="p-4">
            <ErrorState
              title="The filtered audit events could not be loaded"
              error={audit.error}
              onRetry={audit.reload}
              retrying={audit.loading}
            />
          </div>
        ) : audit.loading && !audit.data ? (
          <TableSkeleton rows={8} columns={6} />
        ) : filteredRows.length === 0 ? (
          <EmptyState
            icon={FileClock}
            title={activeFilterCount > 0 ? "No audit events match these filters" : "No audit events returned"}
            description={
              activeFilterCount > 0
                ? searchTerm && rows.length > 0
                  ? "No loaded event matches the search text. Clear or adjust the search; the API filters above apply to at most the 100 most recent events."
                  : "Adjust or clear the filters. The API may also have no matching events in the selected period."
                : "The API returned no audit events. This may mean no events are available to your account or that the audit store is empty."
            }
            action={
              activeFilterCount > 0 ? (
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : null
            }
          />
        ) : (
          <DataTable
            columns={columns}
            rows={filteredRows}
            rowKey={(event) => event.id}
            caption="Audit events"
          />
        )}
      </SectionCard>

      <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-accent-700" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-ink">Reading audit records</h2>
        </div>
        <p className="mt-2 text-xs leading-5 text-ink-muted">
          Times are shown in {me?.timezone ?? "UTC"}. A denied outcome means the API refused the
          action; it does not necessarily indicate a security incident. This view intentionally
          shows metadata only and does not expose patient measurements or secrets.
        </p>
      </div>
    </div>
  );
}
