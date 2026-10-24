"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Cpu, Plus, RefreshCw, Search, Watch } from "lucide-react";

import {
  linkDevice,
  listAdminPatients,
  listDevices,
  registerDevice,
  updateDevice,
} from "@/lib/api";
import { toApiError, type ApiError } from "@/lib/api-client";
import { formatDateTime, formatNumber, pluralize } from "@/lib/format";
import { hasPermission, isAdmin, PERMISSIONS } from "@/lib/permissions";
import { useSession } from "@/lib/session";
import { useApi, useAsyncAction } from "@/lib/use-api";
import type { Device, DeviceStatus } from "@/lib/types";
import { Button } from "@/components/forms/button";
import { Checkbox } from "@/components/forms/checkbox";
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
import { DataFreshness } from "@/components/status/data-freshness";
import { DeviceStatusBadge } from "@/components/status/device-status-badge";

const DEVICE_STATUSES: Array<{ value: DeviceStatus; label: string }> = [
  { value: "registered", label: "Registered" },
  { value: "active", label: "Active" },
  { value: "under_test", label: "Under test" },
  { value: "faulty", label: "Faulty" },
  { value: "lost", label: "Lost" },
  { value: "retired", label: "Retired" },
];

export default function AdminDevicesPage() {
  const { me } = useSession();
  const devices = useApi((signal) => listDevices(signal), []);
  const patients = useApi((signal) => listAdminPatients(signal), []);
  const canManage = isAdmin(me) || hasPermission(me, PERMISSIONS.DEVICES_MANAGE);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [message, setMessage] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [hardwareIdentifier, setHardwareIdentifier] = useState("");
  const [hardwareRevision, setHardwareRevision] = useState("");
  const [firmwareVersion, setFirmwareVersion] = useState("");
  const [patientId, setPatientId] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<ApiError | null>(null);

  const [managed, setManaged] = useState<Device | null>(null);
  const [nextStatus, setNextStatus] = useState<DeviceStatus>("registered");
  const [nextPatientId, setNextPatientId] = useState("");
  const [unlinkRequested, setUnlinkRequested] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const update = useAsyncAction<[Device, DeviceStatus, string, boolean]>(
    async (device, status, linkedPatientId, unlink) => {
      const input: {
        status?: DeviceStatus;
        patient_id?: string | null;
      } = {};
      if (status !== device.status) input.status = status;
      if (
        unlink ||
        (device.patient_link_reported && Boolean(device.patient_id) && !linkedPatientId)
      ) {
        input.patient_id = null;
      } else if (linkedPatientId && linkedPatientId !== (device.patient_id ?? "")) {
        input.patient_id = linkedPatientId;
      }
      if (input.status === undefined && input.patient_id === undefined) return;
      await updateDevice(device.id, input);
    },
  );

  const rows = devices.data ?? [];
  const activePatients = (patients.data ?? []).filter((patient) => patient.status === "active");
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((device) => {
      if (query) {
        const haystack = `${device.hardware_identifier} ${device.patient_name ?? ""} ${
          device.firmware_version ?? ""
        }`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (statusFilter !== "all" && device.status !== statusFilter) return false;
      return true;
    });
  }, [rows, search, statusFilter]);

  const openManage = (device: Device) => {
    setManaged(device);
    setNextStatus(device.status === "unknown" ? "registered" : device.status);
    setNextPatientId(device.patient_id ?? "");
    setUnlinkRequested(false);
    setManageError(null);
    update.reset();
  };

  const closeManage = () => {
    setManaged(null);
    setConfirmOpen(false);
    setUnlinkRequested(false);
    setManageError(null);
    update.reset();
  };

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const identifier = hardwareIdentifier.trim();
    if (!identifier) {
      setValidation("Enter the hardware identifier printed on the device.");
      return;
    }
    setValidation(null);
    setRegisterError(null);
    setRegistering(true);
    try {
      const device = await registerDevice({
        hardware_identifier: identifier,
        hardware_revision: hardwareRevision.trim() || undefined,
        firmware_version: firmwareVersion.trim() || undefined,
      });

      if (patientId) {
        if (!device?.id) {
          setMessage(
            `Device ${identifier} was registered, but the API did not return an identifier, so it could not be linked. Find it in the registry and link it there.`,
          );
        } else {
          try {
            await linkDevice(device.id, patientId);
            setMessage(
              `Device ${identifier} registered and linked. This API does not report per-device links in the registry, so confirm the link from the patient's workspace.`,
            );
          } catch (caught) {
            const linkError = toApiError(caught);
            setMessage(
              `Device ${identifier} was registered, but linking failed: ${linkError.message} Open the device from the registry and link it again.`,
            );
          }
        }
      } else {
        setMessage(
          `Device ${identifier} registered. Verify its status and patient link before relying on incoming data.`,
        );
      }

      setCreateOpen(false);
      setHardwareIdentifier("");
      setHardwareRevision("");
      setFirmwareVersion("");
      setPatientId("");
      devices.reload();
    } catch (caught) {
      setRegisterError(toApiError(caught));
    } finally {
      setRegistering(false);
    }
  };

  const hasLinkChange = (device: Device, linkedPatientId: string, unlink: boolean): boolean => {
    if (unlink) return true;
    if (linkedPatientId) {
      return !device.patient_link_reported || linkedPatientId !== (device.patient_id ?? "");
    }
    // Blank means "unlink" only when the API told us a link currently exists.
    return device.patient_link_reported && Boolean(device.patient_id);
  };

  const highImpactChange = (
    device: Device,
    status: DeviceStatus,
    linkedPatientId: string,
    unlink: boolean,
  ): boolean => {
    const statusChange =
      status !== device.status && (status === "lost" || status === "retired" || status === "faulty");
    return statusChange || hasLinkChange(device, linkedPatientId, unlink);
  };

  const submitManage = async () => {
    if (!managed) return;
    setManageError(null);
    const statusChanged = nextStatus !== managed.status;
    const linkChanged = hasLinkChange(managed, nextPatientId, unlinkRequested);
    if (!statusChanged && !linkChanged) {
      return;
    }
    if (highImpactChange(managed, nextStatus, nextPatientId, unlinkRequested)) {
      setConfirmOpen(true);
      return;
    }
    const ok = await update.run(managed, nextStatus, nextPatientId, unlinkRequested);
    if (ok) {
      const identifier = managed.hardware_identifier;
      closeManage();
      setMessage(
        `Device ${identifier} updated. ${
          linkChanged ? "The API does not report per-device links; verify the link from the patient workspace." : ""
        }`.trim(),
      );
      devices.reload();
    } else {
      devices.reload();
    }
  };

  const confirmManage = async () => {
    if (!managed) return;
    const ok = await update.run(managed, nextStatus, nextPatientId, unlinkRequested);
    if (ok) {
      const identifier = managed.hardware_identifier;
      closeManage();
      setMessage(`Device ${identifier} updated. The API records the change in the audit log.`);
      devices.reload();
    } else {
      // A status PATCH may have succeeded before a link call failed. Refresh so
      // the dialog is not compared against stale server state.
      devices.reload();
    }
  };

  const noChanges = managed
    ? nextStatus === managed.status && !hasLinkChange(managed, nextPatientId, unlinkRequested)
    : false;

  const columns: Column<Device>[] = [
    {
      key: "device",
      header: "Device",
      render: (device) => (
        <div className="min-w-[11rem]">
          <p className="font-mono text-xs font-medium text-ink">
            {device.hardware_identifier || "Identifier not reported"}
          </p>
          <p className="mt-0.5 text-[10px] text-ink-subtle">
            {device.hardware_revision ? `HW ${device.hardware_revision}` : "Hardware revision not reported"}
            {device.firmware_version ? ` · FW ${device.firmware_version}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (device) => <DeviceStatusBadge status={device.status} />,
    },
    {
      key: "patient",
      header: "Linked patient",
      render: (device) => {
        if (!device.patient_link_reported) {
          return (
            <span
              className="text-[11px] text-ink-subtle"
              title="This API build does not include patient-link fields in the device registry response."
            >
              Link state not reported
            </span>
          );
        }
        if (!device.patient_name && !device.patient_id) {
          return <span className="text-[11px] text-ink-subtle">Not linked</span>;
        }
        return (
          <div>
            <p className="text-xs text-ink">{device.patient_name ?? "Patient name not reported"}</p>
            {device.patient_id ? (
              <p className="font-mono text-[10px] text-ink-subtle">{device.patient_id}</p>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "lastSeen",
      header: "Last contact",
      render: (device) => (
        <DataFreshness timestamp={device.last_seen_at} timeZone={me?.timezone} label="Last contact" />
      ),
    },
    {
      key: "battery",
      header: "Battery",
      align: "right",
      render: (device) => (
        <span className="whitespace-nowrap text-xs text-ink-muted">
          {device.battery_level === null ? "Not reported" : `${formatNumber(device.battery_level, 0)}%`}
        </span>
      ),
    },
    {
      key: "registered",
      header: "Registered",
      render: (device) => (
        <span className="whitespace-nowrap text-[11px] text-ink-subtle">
          {formatDateTime(device.registered_at, me?.timezone)}
        </span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      render: (device) =>
        canManage ? (
          <Button variant="secondary" size="sm" onClick={() => openManage(device)}>
            Manage
          </Button>
        ) : (
          <span className="text-[11px] text-ink-subtle">Read-only</span>
        ),
    },
  ];

  if (devices.error?.isForbidden) {
    return (
      <div className="space-y-6">
        <PageHeader title="Devices" />
        <PermissionDenied
          title="Device registry restricted"
          description="The API did not permit access to the device registry."
          detail={devices.error.message}
        />
      </div>
    );
  }

  if (devices.loading && !devices.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Devices" description="Loading the device registry…" />
        <TableSkeleton rows={8} columns={6} />
      </div>
    );
  }

  if (devices.error && !devices.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Devices" />
        <ErrorState
          title="The device registry is unavailable"
          error={devices.error}
          onRetry={devices.reload}
          retrying={devices.loading}
        />
      </div>
    );
  }

  const patientOptionsUnavailable = Boolean(patients.error && !patients.data);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Devices"
        description="Register hardware, review contact state, and manage patient links. A device should not be actively assigned to more than one patient."
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={devices.reload}
              loading={devices.loading}
              loadingLabel="Refreshing"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Refresh
            </Button>
            {canManage ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setRegisterError(null);
                  setValidation(null);
                  setCreateOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Register device
              </Button>
            ) : null}
          </>
        }
        meta={
          <span>
            {pluralize(rows.length, "device")} · {filtered.length} shown
          </span>
        }
      />

      {!canManage ? (
        <FormBanner tone="info" title="Read-only view">
          Your account can view devices but does not have the{" "}
          <span className="font-mono">devices:manage</span> permission.
        </FormBanner>
      ) : null}

      {message ? (
        <FormBanner tone="success" onDismiss={() => setMessage(null)}>
          {message}
        </FormBanner>
      ) : null}

      {devices.error ? (
        <FormBanner tone="warning" title="The device registry could not be refreshed">
          Showing the last successful response. Device contact and link state may have changed.
        </FormBanner>
      ) : null}

      <SectionCard bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b border-line bg-slate-50/50 p-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-0 flex-1">
            <label
              htmlFor="devices-search"
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
                id="devices-search"
                className="pl-9"
                placeholder="Hardware ID, patient, or firmware"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
          <div className="w-full sm:w-44">
            <label
              htmlFor="devices-status"
              className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-subtle"
            >
              Device status
            </label>
            <Select
              id="devices-status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              {DEVICE_STATUSES.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
              <option value="unknown">Unknown</option>
            </Select>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={Cpu}
            title="No devices registered"
            description="No monitoring devices are in the registry. Register a device, then link it to a patient."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No devices match these filters"
            description="Adjust the search term or device status."
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
            rowKey={(device) => device.id || device.hardware_identifier}
            caption="Device registry"
          />
        )}
      </SectionCard>

      <p className="text-[11px] leading-5 text-ink-subtle">
        Last contact is shown only as reported by the API. “No recent data” means no timestamp was
        available, not that the device is necessarily offline.
      </p>

      {rows.length > 0 && rows.every((device) => !device.patient_link_reported) ? (
        <p className="text-[11px] leading-5 text-ink-subtle">
          This API build does not include patient-link fields in the device registry response, so
          the linked-patient column cannot confirm or deny a link. Confirm links from the patient
          workspace, or link and unlink explicitly here.
        </p>
      ) : null}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Register a device"
        description="Enter the hardware identifier exactly as printed on the device. The API assigns the internal record ID."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              form="register-device-form"
              loading={registering}
              loadingLabel="Registering"
            >
              Register device
            </Button>
          </>
        }
      >
        <form id="register-device-form" onSubmit={handleRegister} className="space-y-4" noValidate>
          {registerError ? (
            <FormBanner tone="error" title="The device could not be registered">
              {apiErrorMessage(registerError)}
            </FormBanner>
          ) : null}
          <Field
            id="device-identifier"
            label="Hardware identifier"
            required
            error={validation}
            hint="This identifier must be unique in the registry."
          >
            <Input
              id="device-identifier"
              className="font-mono"
              value={hardwareIdentifier}
              onChange={(event) => {
                setHardwareIdentifier(event.target.value);
                if (validation) setValidation(null);
              }}
              aria-invalid={validation ? true : undefined}
              placeholder="e.g. HM-0000-0001"
              autoComplete="off"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="device-revision" label="Hardware revision" aside="Optional">
              <Input
                id="device-revision"
                value={hardwareRevision}
                onChange={(event) => setHardwareRevision(event.target.value)}
                placeholder="e.g. rev B"
                autoComplete="off"
              />
            </Field>
            <Field id="device-firmware" label="Firmware version" aside="Optional">
              <Input
                id="device-firmware"
                value={firmwareVersion}
                onChange={(event) => setFirmwareVersion(event.target.value)}
                placeholder="e.g. 1.4.2"
                autoComplete="off"
              />
            </Field>
          </div>
          <Field
            id="device-patient"
            label="Link to patient"
            aside="Optional"
            hint="Only active patients are listed. A device can be linked later from the registry."
          >
            <Select
              id="device-patient"
              value={patientId}
              onChange={(event) => setPatientId(event.target.value)}
            >
              <option value="">
                {patients.loading ? "Loading patients…" : "Leave unlinked"}
              </option>
              {activePatients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.display_name}
                  {patient.patient_code ? ` · ${patient.patient_code}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          {patientOptionsUnavailable ? (
            <FormBanner tone="warning" title="Patient options unavailable">
              The patient directory could not be loaded, so the device cannot be linked during
              registration. Register it unlinked, then link it from the registry.
            </FormBanner>
          ) : null}
          <p className="text-[11px] leading-5 text-ink-subtle">
            Registration records the device; it does not start monitoring. Verify firmware and the
            patient link before relying on incoming data.
          </p>
        </form>
      </Modal>

      <Modal
        open={Boolean(managed)}
        onClose={closeManage}
        title={managed ? `Manage ${managed.hardware_identifier}` : "Manage device"}
        description="Status and patient-link changes are recorded by the API."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={closeManage}>
              Cancel
            </Button>
            <Button
              variant={nextStatus === "lost" || nextStatus === "retired" ? "danger" : "primary"}
              size="sm"
              onClick={submitManage}
              loading={update.pending}
              loadingLabel="Saving changes"
              disabled={noChanges}
            >
              Save changes
            </Button>
          </>
        }
      >
        {managed ? (
          <div className="space-y-4">
            {manageError ? (
              <FormBanner tone="error" title="Changes could not be saved">
                {manageError}
              </FormBanner>
            ) : update.error ? (
              <FormBanner tone="error" title="Changes could not be saved">
                {apiErrorMessage(update.error)}
              </FormBanner>
            ) : null}

            <dl className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-ink-subtle">Device ID</dt>
                <dd className="mt-0.5 font-mono text-ink">{managed.id || "Not reported"}</dd>
              </div>
              <div>
                <dt className="text-ink-subtle">Registered</dt>
                <dd className="mt-0.5 text-ink">{formatDateTime(managed.registered_at, me?.timezone)}</dd>
              </div>
              <div>
                <dt className="text-ink-subtle">Firmware</dt>
                <dd className="mt-0.5 text-ink">{managed.firmware_version ?? "Not reported"}</dd>
              </div>
              <div>
                <dt className="text-ink-subtle">Last contact</dt>
                <dd className="mt-0.5">
                  <DataFreshness
                    timestamp={managed.last_seen_at}
                    timeZone={me?.timezone}
                    label="Last contact"
                  />
                </dd>
              </div>
            </dl>

            <Field
              id="manage-device-status"
              label="Device status"
              hint="Lost, retired, and faulty devices may be excluded from active monitoring."
            >
              <Select
                id="manage-device-status"
                value={nextStatus}
                onChange={(event) => setNextStatus(event.target.value as DeviceStatus)}
              >
                {DEVICE_STATUSES.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              id="manage-device-patient"
              label="Linked patient"
              hint={
                managed.patient_link_reported
                  ? "Choosing “Not linked” unlinks the device. The API preserves device reassignment history."
                  : "This API build does not report the current link. Leave it unchanged, choose a patient to link, or unlink explicitly."
              }
            >
              <Select
                id="manage-device-patient"
                value={unlinkRequested ? "" : nextPatientId}
                disabled={unlinkRequested}
                onChange={(event) => setNextPatientId(event.target.value)}
              >
                <option value="">
                  {managed.patient_link_reported
                    ? "Not linked"
                    : "Leave current link unchanged (not reported)"}
                </option>
                {activePatients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.display_name}
                    {patient.patient_code ? ` · ${patient.patient_code}` : ""}
                  </option>
                ))}
                {managed.patient_id && !activePatients.some((patient) => patient.id === managed.patient_id) ? (
                  <option value={managed.patient_id}>
                    {managed.patient_name ?? managed.patient_id} (current link)
                  </option>
                ) : null}
              </Select>
            </Field>

            <Checkbox
              id="manage-device-unlink"
              label="Unlink this device"
              description="If a patient link exists, the device will be detached. The API records the change in the audit log."
              checked={unlinkRequested}
              onChange={(event) => {
                setUnlinkRequested(event.target.checked);
                if (event.target.checked) setNextPatientId("");
              }}
            />


            {patients.error ? (
              <FormBanner tone="warning" title="Patient options may be incomplete">
                {apiErrorMessage(patients.error)}
              </FormBanner>
            ) : null}

            {noChanges ? (
              <p className="text-xs text-ink-subtle" role="status">
                No changes to save. Update the status or patient link to enable saving.
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm this device change"
        description="Changing device status or its patient link can affect monitoring. Review the change before continuing."
        size="sm"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setConfirmOpen(false)}>
              Back
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={confirmManage}
              loading={update.pending}
              loadingLabel="Applying change"
            >
              Apply change
            </Button>
          </>
        }
      >
        {managed ? (
          <div className="space-y-3 text-sm leading-6 text-ink-muted">
            {managed.status !== nextStatus ? (
              <p>
                Change status from <span className="font-medium text-ink">{managed.status}</span> to{" "}
                <span className="font-medium text-ink">{nextStatus}</span>.
              </p>
            ) : null}
            {hasLinkChange(managed, nextPatientId, unlinkRequested) ? (
              <p>
                {unlinkRequested
                  ? "Unlink this device from its current patient."
                  : nextPatientId
                    ? "Link this device to the selected patient."
                    : "Clear the current patient link."}
              </p>
            ) : null}
            <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <Watch className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Confirm that the hardware identifier matches the physical device. The API records this
              change in the audit log.
            </p>
            {update.error ? (
              <FormBanner tone="error" title="The change was not applied">
                {apiErrorMessage(update.error)}
              </FormBanner>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
