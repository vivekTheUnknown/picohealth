"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { ChevronRight, RefreshCw, Search, UserPlus, Users } from "lucide-react";

import { createPatient, listAdminPatients } from "@/lib/api";
import { formatDate, formatDateTime, pluralize } from "@/lib/format";
import { hasPermission, isAdmin, isDoctor, PERMISSIONS } from "@/lib/permissions";
import { useSession } from "@/lib/session";
import { useApi, useAsyncAction } from "@/lib/use-api";
import type { PatientSummary } from "@/lib/types";
import { Button, buttonClasses } from "@/components/forms/button";
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

function PatientStatus({ status }: { status: string }) {
  const label = status === "active" ? "Active" : status === "inactive" ? "Inactive" : "Not reported";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
      <span
        className={
          status === "active"
            ? "h-1.5 w-1.5 rounded-full bg-emerald-500"
            : status === "inactive"
              ? "h-1.5 w-1.5 rounded-full bg-slate-400"
              : "h-1.5 w-1.5 rounded-full bg-amber-500"
        }
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

export default function AdminPatientsPage() {
  const { me } = useSession();
  const patients = useApi((signal) => listAdminPatients(signal), []);
  const canManage = isAdmin(me) || hasPermission(me, PERMISSIONS.PATIENTS_MANAGE);
  const canOpenWorkspace =
    isDoctor(me) || hasPermission(me, PERMISSIONS.PATIENTS_READ_ASSIGNED);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [message, setMessage] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [patientCode, setPatientCode] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [sexAtBirth, setSexAtBirth] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const create = useAsyncAction(createPatient);

  const rows = patients.data ?? [];
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((patient) => {
      if (query) {
        const haystack = `${patient.display_name} ${patient.patient_code}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (statusFilter !== "all" && patient.status !== statusFilter) return false;
      return true;
    });
  }, [rows, search, statusFilter]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = displayName.trim();
    if (!name) {
      setValidation("Enter the patient's display name.");
      return;
    }
    setValidation(null);
    const ok = await create.run({
      display_name: name,
      patient_code: patientCode.trim() || undefined,
      date_of_birth: dateOfBirth || undefined,
      sex_at_birth: sexAtBirth || undefined,
    });
    if (ok) {
      setCreateOpen(false);
      setDisplayName("");
      setPatientCode("");
      setDateOfBirth("");
      setSexAtBirth("");
      setMessage(`Patient record created for ${name}. Assign a doctor and device before monitoring.`);
      patients.reload();
    }
  };

  const columns: Column<PatientSummary>[] = [
    {
      key: "patient",
      header: "Patient",
      render: (patient) => (
        <div className="min-w-[12rem]">
          <p className="text-xs font-semibold text-ink">{patient.display_name}</p>
          <p className="mt-0.5 font-mono text-[11px] text-ink-subtle">
            {patient.patient_code || "No patient code reported"}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (patient) => <PatientStatus status={patient.status} />,
    },
    {
      key: "dob",
      header: "Date of birth",
      render: (patient) => (
        <span className="whitespace-nowrap text-[11px] text-ink-muted">
          {patient.date_of_birth ? formatDate(patient.date_of_birth) : "Not reported"}
        </span>
      ),
    },
    {
      key: "created",
      header: "Registered",
      render: (patient) => (
        <span className="whitespace-nowrap text-[11px] text-ink-muted">
          {formatDateTime(patient.created_at, me?.timezone)}
        </span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      render: (patient) =>
        canOpenWorkspace ? (
          <Link
            href={`/patients/${patient.id}`}
            className={buttonClasses("secondary", "sm")}
            aria-label={`Open patient workspace for ${patient.display_name}`}
          >
            Workspace
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : (
          <span className="text-[11px] text-ink-subtle">Clinical access not granted</span>
        ),
    },
  ];

  if (patients.error?.isForbidden) {
    return (
      <div className="space-y-6">
        <PageHeader title="Patient records" />
        <PermissionDenied
          title="Patient records restricted"
          description="The API did not permit access to the administrative patient directory."
          detail={patients.error.message}
        />
      </div>
    );
  }

  if (patients.loading && !patients.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Patient records" description="Loading registered patients…" />
        <TableSkeleton rows={8} columns={5} />
      </div>
    );
  }

  if (patients.error && !patients.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Patient records" />
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
        title="Patient records"
        description="Register patients with the minimum necessary fields. Clinical measurements remain on the patient workspace and are not shown here."
        actions={
          <>
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
            {canManage ? (
              <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                Register patient
              </Button>
            ) : null}
          </>
        }
        meta={
          <span>
            {pluralize(rows.length, "patient")} · {filtered.length} shown
          </span>
        }
      />

      {!canManage ? (
        <FormBanner tone="info" title="Read-only view">
          Your account can view patient records but does not have the{" "}
          <span className="font-mono">patients:manage</span> permission.
        </FormBanner>
      ) : null}

      {message ? (
        <FormBanner tone="success" onDismiss={() => setMessage(null)}>
          {message}
        </FormBanner>
      ) : null}

      {patients.error ? (
        <FormBanner tone="warning" title="The patient directory could not be refreshed">
          Showing the last successful response. Patient status and record counts may have changed.
        </FormBanner>
      ) : null}

      <SectionCard bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b border-line bg-slate-50/50 p-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-0 flex-1">
            <label
              htmlFor="admin-patients-search"
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
                id="admin-patients-search"
                className="pl-9"
                placeholder="Name or patient code"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
          <div className="w-full sm:w-40">
            <label
              htmlFor="admin-patients-status"
              className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-subtle"
            >
              Status
            </label>
            <Select
              id="admin-patients-status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No patient records"
            description="No patients have been registered yet. Register a patient, then assign a doctor and device."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No patients match these filters"
            description="Adjust the search term or status filter."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
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
            caption="Registered patients"
          />
        )}
      </SectionCard>

      <p className="text-[11px] leading-5 text-ink-subtle">
        This directory is administrative. A patient appearing here does not mean the patient is
        assigned to you or that you can access their clinical data.
      </p>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Register a patient"
        description="Use minimum necessary fields. A stable patient ID and code are assigned by the API where supported."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              form="create-patient-form"
              loading={create.pending}
              loadingLabel="Registering"
            >
              Register patient
            </Button>
          </>
        }
      >
        <form id="create-patient-form" onSubmit={handleCreate} className="space-y-4" noValidate>
          {create.error ? (
            <FormBanner tone="error" title="The patient could not be registered">
              {apiErrorMessage(create.error)}
            </FormBanner>
          ) : null}
          <Field
            id="patient-name"
            label="Display name"
            required
            error={validation}
            hint="The name shown in clinical and administrative screens."
          >
            <Input
              id="patient-name"
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value);
                if (validation) setValidation(null);
              }}
              aria-invalid={validation ? true : undefined}
              placeholder="Patient display name"
              autoComplete="off"
            />
          </Field>
          <Field
            id="patient-code"
            label="Patient code"
            aside="Optional"
            hint="If left blank, the API may generate an identifier. Codes must be unique."
          >
            <Input
              id="patient-code"
              value={patientCode}
              onChange={(event) => setPatientCode(event.target.value)}
              placeholder="e.g. PT-000123"
              autoComplete="off"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="patient-dob" label="Date of birth" aside="Optional">
              <Input
                id="patient-dob"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={dateOfBirth}
                onChange={(event) => setDateOfBirth(event.target.value)}
              />
            </Field>
            <Field id="patient-sex" label="Sex at birth" aside="Optional">
              <Select
                id="patient-sex"
                value={sexAtBirth}
                onChange={(event) => setSexAtBirth(event.target.value)}
              >
                <option value="">Not specified</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="intersex">Intersex</option>
                <option value="other">Other</option>
              </Select>
            </Field>
          </div>
          <p className="text-[11px] leading-5 text-ink-subtle">
            Registration does not start monitoring. A doctor assignment and a linked device are
            required before measurements can arrive.
          </p>
        </form>
      </Modal>
    </div>
  );
}
