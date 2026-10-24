/**
 * Typed API calls. Each function returns normalized domain objects rather than
 * raw JSON, so pages never index into an unvalidated response.
 */

import { api, ApiError } from "@/lib/api-client";
import {
  normalizeAdminOverview,
  normalizeAssignment,
  normalizeAssignmentList,
  normalizeAuditList,
  normalizeDoctorOverview,
  normalizeEvent,
  normalizeEventList,
  normalizeMeasurementList,
  normalizeMe,
  normalizeNote,
  normalizeNoteList,
  normalizePatientList,
  normalizePatientOverview,
  normalizeSystemHealth,
  normalizeUserList,
  normalizeDevice,
  normalizeDeviceList,
} from "@/lib/normalize";
import type {
  AdminOverview,
  Assignment,
  AuditEvent,
  ClinicalNote,
  Device,
  DeviceStatus,
  DoctorOverview,
  Event,
  Me,
  Measurement,
  PatientOverview,
  PatientSummary,
  PortalUser,
  Role,
  SystemHealth,
  UserStatus,
} from "@/lib/types";

const API = "/api/v1";

/* ------------------------------------------------------------------ auth */

export async function login(email: string, password: string): Promise<Me> {
  const raw = await api.post<unknown>(
    `${API}/auth/login`,
    { email, password },
    { redirectOnUnauthorized: false },
  );
  return normalizeMe(raw);
}

export async function logout(): Promise<void> {
  await api.post<unknown>(`${API}/auth/logout`);
}

export async function getMe(signal?: AbortSignal): Promise<Me> {
  const raw = await api.get<unknown>(`${API}/me`, { signal });
  return normalizeMe(raw);
}

export async function requestPasswordRecovery(email: string): Promise<string> {
  const raw = await api.post<unknown>(
    `${API}/auth/recover`,
    { email },
    { redirectOnUnauthorized: false },
  );
  return messageFrom(raw, "If an account exists for that address, a reset link has been sent.");
}

export async function resetPassword(token: string, newPassword: string): Promise<string> {
  const raw = await api.post<unknown>(
    `${API}/auth/reset`,
    { token, new_password: newPassword },
    { redirectOnUnauthorized: false },
  );
  return messageFrom(raw, "Password updated. Sign in with your new password.");
}

export async function acceptInvitation(
  token: string,
  displayName: string,
  password: string,
): Promise<string> {
  const raw = await api.post<unknown>(
    `${API}/auth/accept-invitation`,
    { token, display_name: displayName, password },
    { redirectOnUnauthorized: false },
  );
  return messageFrom(raw, "Account activated. You can now sign in.");
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<string> {
  const raw = await api.post<unknown>(`${API}/auth/change-password`, {
    current_password: currentPassword,
    new_password: newPassword,
  });
  return messageFrom(raw, "Password changed. Other sessions have been signed out.");
}

function messageFrom(raw: unknown, fallback: string): string {
  if (raw && typeof raw === "object" && "message" in raw) {
    const message = (raw as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

/* --------------------------------------------------------------- clinical */

export async function getDoctorOverview(signal?: AbortSignal): Promise<DoctorOverview> {
  const raw = await api.get<unknown>(`${API}/doctor/overview`, { signal });
  return normalizeDoctorOverview(raw);
}

export async function listPatients(signal?: AbortSignal): Promise<PatientSummary[]> {
  const raw = await api.get<unknown>(`${API}/patients`, { signal });
  return normalizePatientList(raw);
}

export async function getPatientOverview(
  patientId: string,
  signal?: AbortSignal,
): Promise<PatientOverview> {
  const raw = await api.get<unknown>(`${API}/patients/${encodeURIComponent(patientId)}/overview`, {
    signal,
  });
  return normalizePatientOverview(raw, patientId);
}

export interface MeasurementQuery {
  from?: string;
  to?: string;
  metrics?: string[];
}

export async function getMeasurements(
  patientId: string,
  query: MeasurementQuery,
  signal?: AbortSignal,
): Promise<Measurement[]> {
  const raw = await api.get<unknown>(
    `${API}/patients/${encodeURIComponent(patientId)}/measurements`,
    {
      signal,
      query: {
        from: query.from,
        to: query.to,
        // Repeated `metrics=` params: FastAPI expects a list, not "a,b".
        metrics: query.metrics?.length ? query.metrics : undefined,
      },
    },
  );
  return normalizeMeasurementList(raw);
}

export async function listPatientEvents(
  patientId: string,
  signal?: AbortSignal,
): Promise<Event[]> {
  const raw = await api.get<unknown>(`${API}/patients/${encodeURIComponent(patientId)}/events`, {
    signal,
  });
  return normalizeEventList(raw);
}

/**
 * All events across the caller's assigned patients.
 *
 * `GET /alerts` is the published endpoint. If a deployment predates it, fall
 * back to the events embedded in the doctor overview and label the result as
 * incomplete rather than pretending the list is whole.
 */
export async function listEvents(
  signal?: AbortSignal,
): Promise<{ events: Event[]; source: "events" | "overview" }> {
  try {
    const raw = await api.get<unknown>(`${API}/alerts`, { signal });
    return { events: normalizeEventList(raw), source: "events" };
  } catch (error) {
    if (error instanceof ApiError && (error.isUnauthorized || error.isForbidden)) throw error;
    if (signal?.aborted) throw error;
    const overview = await getDoctorOverview(signal);
    return { events: overview.recent_events, source: "overview" };
  }
}

export async function getEvent(eventId: string, signal?: AbortSignal): Promise<Event> {
  const raw = await api.get<unknown>(`${API}/events/${encodeURIComponent(eventId)}`, { signal });
  const event = normalizeEvent(raw);
  if (!event) {
    throw new ApiError(502, "invalid_response", "The event could not be read from the response.");
  }
  return event;
}

export async function acknowledgeEvent(
  eventId: string,
  note?: string,
): Promise<void> {
  await api.post<unknown>(
    `${API}/events/${encodeURIComponent(eventId)}/acknowledge`,
    note?.trim() ? { note: note.trim() } : {},
  );
}

export async function resolveEvent(
  eventId: string,
  note?: string,
): Promise<void> {
  await api.post<unknown>(
    `${API}/events/${encodeURIComponent(eventId)}/resolve`,
    note?.trim() ? { note: note.trim() } : {},
  );
}

export async function listNotes(
  patientId: string,
  signal?: AbortSignal,
): Promise<ClinicalNote[]> {
  const raw = await api.get<unknown>(`${API}/patients/${encodeURIComponent(patientId)}/notes`, {
    signal,
  });
  return normalizeNoteList(raw);
}

export async function createNote(
  patientId: string,
  content: string,
  relatedEventId?: string,
): Promise<ClinicalNote | null> {
  const raw = await api.post<unknown>(`${API}/patients/${encodeURIComponent(patientId)}/notes`, {
    content,
    related_event_id: relatedEventId?.trim() ? relatedEventId.trim() : undefined,
  });
  return normalizeNote(raw);
}

/* ----------------------------------------------------------------- admin */

export async function getAdminOverview(signal?: AbortSignal): Promise<AdminOverview> {
  const raw = await api.get<unknown>(`${API}/admin/overview`, { signal });
  return normalizeAdminOverview(raw);
}

export interface UserQuery {
  search?: string;
  status?: string;
  role?: string;
}

export async function listUsers(
  query: UserQuery = {},
  signal?: AbortSignal,
): Promise<PortalUser[]> {
  const raw = await api.get<unknown>(`${API}/admin/users`, {
    signal,
    query: {
      search: query.search,
      status: query.status,
      role: query.role,
      // The API caps a page at 100; the list UI has no pagination yet.
      limit: 100,
    },
  });
  return normalizeUserList(raw);
}

export interface InviteUserInput {
  email: string;
  role: Role;
}

export async function inviteUser(input: InviteUserInput): Promise<void> {
  await api.post<unknown>(`${API}/admin/users/invitations`, input);
}

export async function updateUserStatus(
  userId: string,
  status: UserStatus,
): Promise<void> {
  await api.patch<unknown>(`${API}/admin/users/${encodeURIComponent(userId)}/status`, {
    status,
  });
}

export async function updateUserRoles(userId: string, roles: Role[]): Promise<void> {
  await api.put<unknown>(`${API}/admin/users/${encodeURIComponent(userId)}/roles`, {
    roles,
  });
}

export interface CreatePatientInput {
  display_name: string;
  patient_code?: string;
  date_of_birth?: string;
  sex_at_birth?: string;
}

export async function listAdminPatients(
  signal?: AbortSignal,
): Promise<PatientSummary[]> {
  const raw = await api.get<unknown>(`${API}/admin/patients`, {
    signal,
    query: { limit: 100 },
  });
  return normalizePatientList(raw);
}

export async function createPatient(input: CreatePatientInput): Promise<void> {
  const payload: Record<string, string> = { display_name: input.display_name.trim() };
  if (input.patient_code?.trim()) payload.patient_code = input.patient_code.trim();
  if (input.date_of_birth) payload.date_of_birth = input.date_of_birth;
  if (input.sex_at_birth) payload.sex_at_birth = input.sex_at_birth;
  await api.post<unknown>(`${API}/admin/patients`, payload);
}

export async function listAssignments(
  signal?: AbortSignal,
): Promise<Assignment[]> {
  const raw = await api.get<unknown>(`${API}/admin/assignments`, {
    signal,
    query: { limit: 100 },
  });
  return normalizeAssignmentList(raw);
}

export interface CreateAssignmentInput {
  patient_id: string;
  doctor_user_id: string;
  assignment_type: "primary" | "secondary";
  starts_at?: string;
}

export async function createAssignment(
  input: CreateAssignmentInput,
): Promise<Assignment | null> {
  const raw = await api.post<unknown>(`${API}/admin/assignments`, {
    patient_id: input.patient_id,
    doctor_user_id: input.doctor_user_id,
    assignment_type: input.assignment_type,
    starts_at: input.starts_at,
  });
  return normalizeAssignment(raw);
}

export interface UpdateAssignmentInput {
  /** The API ends an assignment when `ends_at` is set; there is no direct status field. */
  assignment_type?: "primary" | "secondary";
  ends_at?: string;
}

/**
 * Ends or updates an assignment. The API is expected to revoke access when an
 * assignment is ended; the UI never treats this call as the security control.
 */
export async function updateAssignment(
  assignmentId: string,
  input: UpdateAssignmentInput,
): Promise<Assignment | null> {
  const raw = await api.patch<unknown>(
    `${API}/admin/assignments/${encodeURIComponent(assignmentId)}`,
    input,
  );
  return normalizeAssignment(raw);
}

export async function listDevices(signal?: AbortSignal): Promise<Device[]> {
  const raw = await api.get<unknown>(`${API}/admin/devices`, {
    signal,
    query: { limit: 100 },
  });
  // The API wraps results in a paginated envelope (`items`), but older builds
  // returned a bare array. Normalize both instead of treating `devices` as the
  // only possible key.
  return normalizeDeviceList(raw);
}

export async function linkDevice(
  deviceId: string,
  patientId: string,
): Promise<Device | null> {
  const raw = await api.post<unknown>(
    `${API}/admin/devices/${encodeURIComponent(deviceId)}/link`,
    { patient_id: patientId },
  );
  return normalizeDevice(raw);
}

export async function unlinkDevice(deviceId: string): Promise<Device | null> {
  const raw = await api.post<unknown>(
    `${API}/admin/devices/${encodeURIComponent(deviceId)}/unlink`,
  );
  return normalizeDevice(raw);
}

export interface RegisterDeviceInput {
  hardware_identifier: string;
  hardware_revision?: string;
  firmware_version?: string;
}

/**
 * Creates a device record. The current API does not accept a patient link on
 * creation; use `linkDevice()` afterwards. Callers must surface a partial
 * failure honestly if the link step fails.
 */
export async function registerDevice(input: RegisterDeviceInput): Promise<Device | null> {
  const payload: Record<string, string> = {
    hardware_identifier: input.hardware_identifier.trim(),
  };
  if (input.hardware_revision?.trim()) payload.hardware_revision = input.hardware_revision.trim();
  if (input.firmware_version?.trim()) payload.firmware_version = input.firmware_version.trim();
  const raw = await api.post<unknown>(`${API}/admin/devices`, payload);
  return normalizeDevice(raw);
}

export interface UpdateDeviceInput {
  status?: DeviceStatus;
  /** `null` unlinks the device; omit the key to leave the link unchanged. */
  patient_id?: string | null;
  firmware_version?: string;
  hardware_revision?: string;
}

/**
 * Applies device changes. The API separates status/metadata (`PATCH`) from
 * patient linkage (`POST .../link` and `POST .../unlink`), so a single call here
 * may issue up to two requests. If both are present, the PATCH runs first; a
 * failure on the link step leaves the device updated and the error propagates
 * so the page can report the partial result.
 */
export async function updateDevice(
  deviceId: string,
  input: UpdateDeviceInput,
): Promise<Device | null> {
  const patch: Record<string, unknown> = {};
  if (input.status !== undefined) patch.status = input.status;
  if (input.firmware_version !== undefined) patch.firmware_version = input.firmware_version;
  if (input.hardware_revision !== undefined) patch.hardware_revision = input.hardware_revision;

  let device: Device | null = null;
  if (Object.keys(patch).length > 0) {
    const raw = await api.patch<unknown>(
      `${API}/admin/devices/${encodeURIComponent(deviceId)}`,
      patch,
    );
    device = normalizeDevice(raw);
  }

  if (input.patient_id === null) {
    device = await unlinkDevice(deviceId);
  } else if (typeof input.patient_id === "string" && input.patient_id !== "") {
    device = await linkDevice(deviceId, input.patient_id);
  }

  return device;
}

export interface AuditQuery {
  search?: string;
  action?: string;
  outcome?: string;
  from?: string;
  to?: string;
}

export async function listAuditEvents(
  query: AuditQuery = {},
  signal?: AbortSignal,
): Promise<AuditEvent[]> {
  const raw = await api.get<unknown>(`${API}/admin/audit-events`, {
    signal,
    query: {
      action: query.action,
      outcome: query.outcome,
      from: query.from,
      to: query.to,
      // The API caps `limit` at 100. Free-text search is applied client-side
      // because the endpoint has no search parameter.
      limit: 100,
    },
  });
  return normalizeAuditList(raw);
}

export async function getSystemHealth(signal?: AbortSignal): Promise<SystemHealth | null> {
  const raw = await api.get<unknown>(`${API}/admin/system-health`, { signal });
  return normalizeSystemHealth(raw);
}
