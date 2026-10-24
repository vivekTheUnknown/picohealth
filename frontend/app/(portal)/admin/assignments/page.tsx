"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ClipboardList, Plus, RefreshCw, Search, ShieldAlert } from "lucide-react";

import {
  createAssignment,
  listAdminPatients,
  listAssignments,
  listUsers,
  updateAssignment,
} from "@/lib/api";
import { formatDateTime, pluralize, shortId } from "@/lib/format";
import { hasPermission, isAdmin, PERMISSIONS } from "@/lib/permissions";
import { useSession } from "@/lib/session";
import { useApi, useAsyncAction } from "@/lib/use-api";
import type { Assignment } from "@/lib/types";
import { Button } from "@/components/forms/button";
import { Field } from "@/components/forms/field";
import { FormBanner, apiErrorMessage } from "@/components/forms/form-banner";
import { Input, Select } from "@/components/forms/inputs";
import { EmptyState } from "@/components/layout/empty-state";
import { ErrorState } from "@/components/layout/error-state";
import { Modal } from "@/components/layout/modal";
import { PageHeader } from "@/components/layout/page-header";
import { TableSkeleton } from "@/components/layout/skeleton";
import { SectionCard } from "@/components/layout/section-card";
import { DataTable, type Column } from "@/components/tables/data-table";
import { PermissionDenied } from "@/components/status/permission-denied";

function AssignmentStatus({ status }: { status: string }) {
  const label = status === "active" ? "Active" : status === "ended" ? "Ended" : "Not reported";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
      <span
        className={
          status === "active"
            ? "h-1.5 w-1.5 rounded-full bg-success"
            : status === "ended"
              ? "h-1.5 w-1.5 rounded-full bg-ink-subtle"
              : "h-1.5 w-1.5 rounded-full bg-warning"
        }
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

function typeLabel(type: string): string {
  if (type === "primary") return "Primary";
  if (type === "secondary") return "Secondary";
  return "Not reported";
}

export default function AdminAssignmentsPage() {
  const { me } = useSession();
  const assignments = useApi((signal) => listAssignments(signal), []);
  const patients = useApi((signal) => listAdminPatients(signal), []);
  const doctors = useApi((signal) => listUsers({ role: "doctor" }, signal), []);
  const canManage = isAdmin(me) || hasPermission(me, PERMISSIONS.ASSIGNMENTS_MANAGE);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [message, setMessage] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [assignmentType, setAssignmentType] = useState<"primary" | "secondary">("primary");
  const [startsAt, setStartsAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [validation, setValidation] = useState<string | null>(null);
  const create = useAsyncAction(createAssignment);

  const [ending, setEnding] = useState<Assignment | null>(null);
  const end = useAsyncAction(updateAssignment);

  const rows = assignments.data ?? [];
  const activePatients = (patients.data ?? []).filter((patient) => patient.status === "active");
  const activeDoctors = (doctors.data ?? []).filter(
    (user) => user.roles.includes("doctor") && user.status === "active",
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((assignment) => {
      if (query) {
        const haystack = `${assignment.patient_name ?? ""} ${assignment.patient_code ?? ""} ${
          assignment.doctor_name ?? ""
        } ${assignment.doctor_email ?? ""}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (statusFilter !== "all" && assignment.status !== statusFilter) return false;
      if (typeFilter !== "all" && assignment.assignment_type !== typeFilter) return false;
      return true;
    });
  }, [rows, search, statusFilter, typeFilter]);

  const resetCreate = () => {
    setPatientId("");
    setDoctorId("");
    setAssignmentType("primary");
    setStartsAt(new Date().toISOString().slice(0, 10));
    setValidation(null);
    create.reset();
  };

  const openCreate = () => {
    resetCreate();
    setCreateOpen(true);
    if (patients.data === null && !patients.loading) patients.reload();
    if (doctors.data === null && !doctors.loading) doctors.reload();
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!patientId) {
      setValidation("Select a patient.");
      return;
    }
    if (!doctorId) {
      setValidation("Select a doctor.");
      return;
    }
    setValidation(null);
    const ok = await create.run({
      patient_id: patientId,
      doctor_user_id: doctorId,
      assignment_type: assignmentType,
      starts_at: startsAt ? new Date(`${startsAt}T00:00:00`).toISOString() : undefined,
    });
    if (ok) {
      setCreateOpen(false);
      resetCreate();
      setMessage("Assignment created. The doctor's access is enforced by the API for active assignments.");
      assignments.reload();
    }
  };

  const handleEnd = async () => {
    if (!ending) return;
    const ok = await end.run(ending.id, {
      ends_at: new Date().toISOString(),
    });
    if (ok) {
      const patient = ending.patient_name ?? "the patient";
      setEnding(null);
      setMessage(`Assignment ended for ${patient}. The assignment record is preserved.`);
      assignments.reload();
    }
  };

  const columns: Column<Assignment>[] = [
    {
      key: "patient",
      header: "Patient",
      render: (assignment) => (
        <div className="min-w-[10rem]">
          <p className="text-xs font-medium text-ink">
            {assignment.patient_name ?? "Patient not reported"}
          </p>
          <p className="mono-id truncate" title={assignment.patient_id ?? undefined}>
            {assignment.patient_code ||
              (assignment.patient_id ? shortId(assignment.patient_id) : "No identifier")}
          </p>
        </div>
      ),
    },
    {
      key: "doctor",
      header: "Doctor",
      render: (assignment) => (
        <div className="min-w-[10rem]">
          <p className="text-xs font-medium text-ink">
            {assignment.doctor_name ?? "Doctor not reported"}
          </p>
          <p
            className="mono-id truncate"
            title={assignment.doctor_user_id ?? undefined}
          >
            {assignment.doctor_email ||
              (assignment.doctor_user_id ? shortId(assignment.doctor_user_id) : "")}
          </p>
        </div>
      ),
    },
    {
      key: "type",
      header: "Responsibility",
      render: (assignment) => (
        <span className="text-xs text-ink-muted">{typeLabel(assignment.assignment_type)}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (assignment) => <AssignmentStatus status={assignment.status} />,
    },
    {
      key: "dates",
      header: "Starts / ends",
      render: (assignment) => (
        <div className="whitespace-nowrap text-2xs text-ink-muted">
          <p>{assignment.starts_at ? formatDateTime(assignment.starts_at, me?.timezone) : "Start not reported"}</p>
          <p className="text-ink-subtle">
            {assignment.ends_at ? `Ends ${formatDateTime(assignment.ends_at, me?.timezone)}` : "No end reported"}
          </p>
        </div>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      render: (assignment) =>
        canManage && assignment.status === "active" ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setEnding(assignment)}
            aria-label={`End the assignment for ${assignment.patient_name ?? "this patient"}`}
          >
            End assignment
          </Button>
        ) : (
          <span className="text-2xs text-ink-subtle">
            {assignment.status === "active" ? "Read-only" : "Closed"}
          </span>
        ),
    },
  ];

  if (assignments.error?.isForbidden) {
    return (
      <div className="space-y-6">
        <PageHeader title="Assignments" />
        <PermissionDenied
          title="Assignment access restricted"
          description="The API did not permit access to the assignment directory."
          detail={assignments.error.message}
        />
      </div>
    );
  }

  if (assignments.loading && !assignments.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Assignments" description="Loading doctor–patient assignments…" />
        <TableSkeleton rows={8} columns={6} />
      </div>
    );
  }

  if (assignments.error && !assignments.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Assignments" />
        <ErrorState
          title="The assignment directory is unavailable"
          error={assignments.error}
          onRetry={assignments.reload}
          retrying={assignments.loading}
        />
      </div>
    );
  }

  const optionsUnavailable =
    (patients.error && !patients.data) || (doctors.error && !doctors.data);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assignments"
        description="Assign doctors to patients, define primary or secondary responsibility, and end assignments when responsibility changes. Ending an assignment is recorded and preserved."
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={assignments.reload}
              loading={assignments.loading}
              loadingLabel="Refreshing"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Refresh
            </Button>
            {canManage ? (
              <Button variant="primary" size="sm" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                New assignment
              </Button>
            ) : null}
          </>
        }
        meta={
          <span>
            {pluralize(rows.length, "assignment")} · {filtered.length} shown
          </span>
        }
      />

      {!canManage ? (
        <FormBanner tone="info" title="Read-only view">
          Your account can view assignments but does not have the{" "}
          <span className="font-mono">assignments:manage</span> permission.
        </FormBanner>
      ) : null}

      {patients.error?.isForbidden || doctors.error?.isForbidden ? (
        <FormBanner tone="warning" title="Some assignment options are restricted">
          The API refused access to the patient or doctor directory needed for creating assignments.
          Existing assignments may still be reviewed.
        </FormBanner>
      ) : null}

      {message ? (
        <FormBanner tone="success" onDismiss={() => setMessage(null)}>
          {message}
        </FormBanner>
      ) : null}

      {assignments.error ? (
        <FormBanner tone="warning" title="The assignment directory could not be refreshed">
          Showing the last successful response. Assignment status may have changed.
        </FormBanner>
      ) : null}

      <SectionCard bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b border-line bg-surface-raised/50 p-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-0 flex-1">
            <label
              htmlFor="assignments-search"
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
                id="assignments-search"
                className="pl-9"
                placeholder="Patient, code, doctor, or email"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
          <div className="w-full sm:w-36">
            <label
              htmlFor="assignments-status"
              className="mb-1 block text-2xs font-medium text-ink-subtle"
            >
              Status
            </label>
            <Select
              id="assignments-status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="ended">Ended</option>
            </Select>
          </div>
          <div className="w-full sm:w-40">
            <label
              htmlFor="assignments-type"
              className="mb-1 block text-2xs font-medium text-ink-subtle"
            >
              Responsibility
            </label>
            <Select
              id="assignments-type"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
            >
              <option value="all">All types</option>
              <option value="primary">Primary</option>
              <option value="secondary">Secondary</option>
            </Select>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No assignments"
            description="No doctor–patient assignments have been created. Create one to grant a doctor access to a patient."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No assignments match these filters"
            description="Adjust the search term, status, or responsibility type."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setTypeFilter("all");
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
            rowKey={(assignment) => assignment.id}
            caption="Doctor–patient assignments"
          />
        )}
      </SectionCard>

      <p className="text-2xs leading-5 text-ink-subtle">
        Assignments determine which patients a doctor may request. The API checks the active
        assignment on every patient-scoped request; this page is not the security boundary.
      </p>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create an assignment"
        description="Grant a doctor access to a patient. Access is effective only while the assignment is active."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              form="create-assignment-form"
              loading={create.pending}
              loadingLabel="Creating assignment"
            >
              Create assignment
            </Button>
          </>
        }
      >
        <form id="create-assignment-form" onSubmit={handleCreate} className="space-y-4" noValidate>
          {create.error ? (
            <FormBanner tone="error" title="The assignment could not be created">
              {apiErrorMessage(create.error)}
            </FormBanner>
          ) : null}
          {optionsUnavailable ? (
            <FormBanner tone="warning" title="Patient or doctor options are unavailable">
              The API did not return the directories needed to create an assignment. Close this
              dialog and retry the page.
            </FormBanner>
          ) : null}
          {patients.error ? (
            <FormBanner tone="warning" title="Patient options may be incomplete">
              {apiErrorMessage(patients.error)}
            </FormBanner>
          ) : null}
          {doctors.error ? (
            <FormBanner tone="warning" title="Doctor options may be incomplete">
              {apiErrorMessage(doctors.error)}
            </FormBanner>
          ) : null}

          <Field
            id="assignment-patient"
            label="Patient"
            required
            hint="Only active patients are listed. A patient must be registered first."
          >
            <Select
              id="assignment-patient"
              value={patientId}
              onChange={(event) => setPatientId(event.target.value)}
            >
              <option value="">
                {patients.loading ? "Loading patients…" : "Select an active patient"}
              </option>
              {activePatients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.display_name}
                  {patient.patient_code ? ` · ${patient.patient_code}` : ""}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            id="assignment-doctor"
            label="Doctor"
            required
            hint="Only active accounts with the doctor role are listed. Verification status is shown in user management."
          >
            <Select
              id="assignment-doctor"
              value={doctorId}
              onChange={(event) => setDoctorId(event.target.value)}
            >
              <option value="">
                {doctors.loading ? "Loading doctors…" : "Select an active doctor"}
              </option>
              {activeDoctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.display_name} · {doctor.email}
                </option>
              ))}
            </Select>
          </Field>

          {!patients.loading && activePatients.length === 0 ? (
            <p className="rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-xs leading-5 text-warning">
              No active patients are available. Register and activate a patient before assigning a
              doctor.
            </p>
          ) : null}
          {!doctors.loading && activeDoctors.length === 0 ? (
            <p className="rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-xs leading-5 text-warning">
              No active doctors are available. Invite and activate a doctor account first.
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="assignment-type"
              label="Responsibility"
              required
              hint="Primary and secondary are workflow labels; both grant access while active."
            >
              <Select
                id="assignment-type"
                value={assignmentType}
                onChange={(event) =>
                  setAssignmentType(event.target.value === "secondary" ? "secondary" : "primary")
                }
              >
                <option value="primary">Primary</option>
                <option value="secondary">Secondary</option>
              </Select>
            </Field>
            <Field id="assignment-start" label="Start date" aside="Optional">
              <Input
                id="assignment-start"
                type="date"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
              />
            </Field>
          </div>

          {validation ? (
            <p role="alert" className="text-xs font-medium text-danger">
              {validation}
            </p>
          ) : null}
        </form>
      </Modal>

      <Modal
        open={Boolean(ending)}
        onClose={() => setEnding(null)}
        title="End this assignment?"
        description="Ending an assignment removes the doctor's access to this patient, subject to API policy. The assignment record is preserved."
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEnding(null)}>
              Keep assignment
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleEnd}
              loading={end.pending}
              loadingLabel="Ending assignment"
            >
              End assignment
            </Button>
          </>
        }
      >
        {ending ? (
          <div className="space-y-3">
            <dl className="space-y-1.5 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-subtle">Patient</dt>
                <dd className="text-right text-ink">{ending.patient_name ?? "Not reported"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-subtle">Doctor</dt>
                <dd className="text-right text-ink">{ending.doctor_name ?? "Not reported"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-subtle">Responsibility</dt>
                <dd className="text-right text-ink">{typeLabel(ending.assignment_type)}</dd>
              </div>
            </dl>
            <p className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-xs leading-5 text-warning">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              The API records the end time and actor. Access revocation is enforced by the API.
            </p>
            {end.error ? (
              <FormBanner tone="error" title="The assignment could not be ended">
                {apiErrorMessage(end.error)}
              </FormBanner>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
