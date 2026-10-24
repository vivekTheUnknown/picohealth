/**
 * Response normalizers.
 *
 * The portal is coded against the published API contract, but several
 * endpoints are being implemented in parallel. Instead of trusting the wire
 * shape blindly, each resource is mapped into a strict local type. Unknown
 * fields are dropped; missing fields become null and are rendered as
 * "not reported" rather than invented.
 */

import {
  asArray,
  asDict,
  asNumber,
  asString,
  asStringArray,
  asTimestamp,
  findArray,
  firstNumber,
  firstString,
  isDict,
  parseJsonObject,
} from "@/lib/parse";
import { latestObservedAt } from "@/lib/freshness";
import { defaultUnitForMetric } from "@/lib/format";
import type {
  AdminOverview,
  Assignment,
  AssignmentStatus,
  AssignmentType,
  AuditEvent,
  AuditOutcome,
  Baseline,
  ClinicalNote,
  Device,
  DeviceStatus,
  DeviceStatusCount,
  DoctorOverview,
  Event,
  EventStatus,
  EventTransition,
  HealthCheck,
  Measurement,
  Me,
  MetricType,
  Patient,
  PatientOverview,
  PatientStatus,
  PatientSummary,
  PortalUser,
  QualityStatus,
  RecentChange,
  Role,
  Severity,
  SourceType,
  SyncFailure,
  SystemHealth,
  UserStatus,
  VerificationStatus,
} from "@/lib/types";

function compact<T>(items: Array<T | null>): T[] {
  return items.filter((item): item is T => item !== null);
}

function lower(value: unknown): string | null {
  const text = asString(value);
  return text ? text.toLowerCase().replace(/\s+/g, "_") : null;
}

export function isRole(value: string): value is Role {
  return value === "doctor" || value === "admin";
}

export function normalizeUserStatus(value: unknown): UserStatus {
  const status = lower(value);
  if (status === "invited" || status === "active" || status === "suspended" || status === "deactivated") {
    return status;
  }
  return "unknown";
}

export function normalizeVerificationStatus(value: unknown): VerificationStatus | null {
  const status = lower(value);
  if (status === "pending" || status === "verified" || status === "rejected") return status;
  if (status === null) return null;
  return "unknown";
}

export function normalizePatientStatus(value: unknown): PatientStatus {
  const status = lower(value);
  if (status === "active" || status === "inactive") return status;
  return "unknown";
}

export function normalizeAssignmentStatus(value: unknown): AssignmentStatus {
  const status = lower(value);
  if (status === "active" || status === "ended") return status;
  return "unknown";
}

export function normalizeAssignmentType(value: unknown): AssignmentType {
  const type = lower(value);
  if (type === "primary" || type === "secondary") return type;
  return "unknown";
}

export function normalizeDeviceStatus(value: unknown): DeviceStatus {
  const status = lower(value);
  if (
    status === "registered" ||
    status === "active" ||
    status === "faulty" ||
    status === "lost" ||
    status === "retired" ||
    status === "under_test"
  ) {
    return status;
  }
  return "unknown";
}

export function normalizeSeverity(value: unknown): Severity {
  const severity = lower(value);
  if (
    severity === "critical" ||
    severity === "high" ||
    severity === "medium" ||
    severity === "low" ||
    severity === "info"
  ) {
    return severity;
  }
  return "unknown";
}

export function normalizeEventStatus(value: unknown): EventStatus {
  const status = lower(value);
  if (
    status === "new" ||
    status === "acknowledged" ||
    status === "under_review" ||
    status === "resolved" ||
    status === "false_positive"
  ) {
    return status;
  }
  return "unknown";
}

export function normalizeSourceType(value: unknown): SourceType {
  const source = lower(value);
  if (source === "measured" || source === "derived" || source === "estimated") return source;
  return "unknown";
}

export function normalizeQuality(value: unknown): QualityStatus {
  const quality = lower(value);
  if (quality === "good" || quality === "fair" || quality === "poor") return quality;
  return "unknown";
}

export function normalizeAuditOutcome(value: unknown): AuditOutcome {
  const outcome = lower(value);
  if (outcome === "success" || outcome === "denied" || outcome === "failure") return outcome;
  return "unknown";
}

export function normalizeMe(raw: unknown): Me {
  const data = asDict(raw) ?? {};
  const roles = asStringArray(data.roles).filter(isRole);
  const permissions = asStringArray(data.permissions);
  const email = asString(data.email);
  const browserZone =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;

  return {
    id: asString(data.id) ?? "",
    email: email ?? "",
    display_name: asString(data.display_name) ?? email ?? "Signed-in user",
    status: normalizeUserStatus(data.status),
    roles,
    permissions: permissions as Me["permissions"],
    timezone: asString(data.timezone) ?? browserZone ?? "UTC",
    doctor_verification_status: normalizeVerificationStatus(
      data.doctor_verification_status ?? (isDict(data.doctor_profile) ? data.doctor_profile.verification_status : null),
    ),
    last_login_at: asTimestamp(data.last_login_at),
  };
}

export function normalizePatient(raw: unknown): Patient | null {
  const data = asDict(raw);
  if (!data) return null;
  const id = asString(data.id) ?? asString(data.patient_id);
  if (!id) return null;
  return {
    id,
    patient_code: firstString(data, ["patient_code", "code", "identifier", "mrn"]) ?? "",
    display_name:
      firstString(data, ["display_name", "name", "patient_name", "full_name"]) ?? "Unnamed patient",
    status: normalizePatientStatus(data.status),
    date_of_birth: asTimestamp(data.date_of_birth) ?? asString(data.date_of_birth),
    sex_at_birth: firstString(data, ["sex_at_birth", "sex", "gender"]),
    created_at: asTimestamp(data.created_at),
  };
}

export function normalizeMeasurement(raw: unknown): Measurement | null {
  const data = asDict(raw);
  if (!data) return null;
  const metric = firstString(data, ["metric_type", "metric", "type", "name"]);
  if (!metric) return null;
  const value = firstNumber(data, ["value", "latest_value", "reading"]);
  if (value === null) return null;
  const observedAt = asTimestamp(
    firstString(data, ["observed_at", "timestamp", "measured_at", "recorded_at", "captured_at"]),
  );
  const unit = firstString(data, ["unit", "units"]) ?? defaultUnitForMetric(metric);
  return {
    id:
      asString(data.id) ??
      `${metric}:${observedAt ?? "no-time"}:${value}`,
    patient_id: asString(data.patient_id),
    metric_type: metric,
    value,
    unit,
    observed_at: observedAt,
    received_at: asTimestamp(firstString(data, ["received_at", "ingested_at", "synced_at"])),
    window_start: asTimestamp(firstString(data, ["window_start", "interval_start"])),
    window_end: asTimestamp(firstString(data, ["window_end", "interval_end"])),
    quality_status: normalizeQuality(
      firstString(data, ["quality_status", "quality", "signal_quality"]),
    ),
    source_type: normalizeSourceType(firstString(data, ["source_type", "source", "kind"])),
    algorithm_version: firstString(data, ["algorithm_version", "algorithm", "model_version"]),
  };
}

/** Accepts a plain array, a paginated envelope, or a metric-keyed map. */
export function normalizeMeasurementList(raw: unknown): Measurement[] {
  const array = findArray(raw, [
    "measurements",
    "items",
    "data",
    "results",
    "latest_measurements",
    "current_measurements",
  ]);
  if (array) return compact(array.map(normalizeMeasurement));

  if (isDict(raw)) {
    // A single measurement object (e.g. latest_measurement).
    if (
      firstString(raw, ["metric_type", "metric", "type"]) &&
      firstNumber(raw, ["value", "latest_value", "reading"]) !== null
    ) {
      const single = normalizeMeasurement(raw);
      return single ? [single] : [];
    }

    const keyed: Measurement[] = [];
    for (const [key, value] of Object.entries(raw)) {
      if (!isDict(value)) continue;
      const withMetric = {
        ...value,
        metric_type: firstString(value, ["metric_type", "metric", "type"]) ?? key,
      };
      const measurement = normalizeMeasurement(withMetric);
      if (measurement) keyed.push(measurement);
    }
    return keyed;
  }

  return [];
}

export function latestMeasurementsByMetric(
  measurements: Measurement[],
): Map<string, Measurement> {
  const latest = new Map<string, Measurement>();
  for (const measurement of measurements) {
    const existing = latest.get(measurement.metric_type);
    if (!existing) {
      latest.set(measurement.metric_type, measurement);
      continue;
    }
    const existingMs = existing.observed_at ? Date.parse(existing.observed_at) : -Infinity;
    const candidateMs = measurement.observed_at ? Date.parse(measurement.observed_at) : -Infinity;
    if (candidateMs > existingMs) latest.set(measurement.metric_type, measurement);
  }
  return latest;
}

export function normalizeBaseline(raw: unknown): Baseline | null {
  const data = asDict(raw);
  if (!data) return null;
  const metric = firstString(data, ["metric_type", "metric", "type"]);
  if (!metric) return null;
  return {
    metric_type: metric,
    value: firstNumber(data, ["value", "baseline_value", "median"]),
    low: firstNumber(data, ["low", "lower", "p10", "min"]),
    high: firstNumber(data, ["high", "upper", "p90", "max"]),
    window_days: firstNumber(data, ["window_days", "window", "days"]),
    coverage: firstNumber(data, ["coverage", "data_coverage"]),
    calculated_at: asTimestamp(firstString(data, ["calculated_at", "computed_at"])),
  };
}

function normalizeBaselines(raw: unknown): Baseline[] {
  const array = findArray(raw, ["baselines", "items", "data"]);
  if (array) return compact(array.map(normalizeBaseline));
  if (isDict(raw)) {
    const keyed: Baseline[] = [];
    for (const [key, value] of Object.entries(raw)) {
      if (!isDict(value)) continue;
      const baseline = normalizeBaseline({
        ...value,
        metric_type: firstString(value, ["metric_type", "metric"]) ?? key,
      });
      if (baseline) keyed.push(baseline);
    }
    return keyed;
  }
  return [];
}

export function normalizeTransition(raw: unknown): EventTransition | null {
  const data = asDict(raw);
  if (!data) return null;
  const newStatus = firstString(data, ["new_status", "status", "to_status"]);
  if (!newStatus) return null;
  const actor = asDict(data.actor);
  return {
    id: asString(data.id),
    prior_status: firstString(data, ["prior_status", "from_status", "previous_status"]),
    new_status: newStatus,
    actor_user_id: asString(data.actor_user_id),
    actor_name:
      firstString(data, ["actor_name", "actor.display_name", "actor.name"]) ??
      (actor ? firstString(actor, ["display_name", "name", "email"]) : null),
    timestamp: asTimestamp(firstString(data, ["timestamp", "created_at", "at"])),
    note: firstString(data, ["note", "comment", "reason"]),
  };
}

export function normalizeEvent(raw: unknown): Event | null {
  const data = asDict(raw);
  if (!data) return null;
  const id = asString(data.id) ?? asString(data.event_id);
  const patient = asDict(data.patient);
  const eventType = firstString(data, ["event_type", "type", "kind"]) ?? "event";
  const startAt = asTimestamp(firstString(data, ["start_at", "started_at", "onset_at", "timestamp"]));
  if (!id && !startAt) return null;
  return {
    id: id ?? `${eventType}:${startAt ?? "unknown"}`,
    patient_id: asString(data.patient_id) ?? (patient ? asString(patient.id) : null),
    patient_name:
      firstString(data, [
        "patient_name",
        "patient_display_name",
        "patient.display_name",
        "patient.name",
      ]) ??
      (patient ? firstString(patient, ["display_name", "name"]) : null),
    patient_code:
      firstString(data, ["patient_code", "patient.patient_code"]) ??
      (patient ? firstString(patient, ["patient_code", "code"]) : null),
    event_type: eventType,
    severity: normalizeSeverity(data.severity),
    start_at: startAt,
    end_at: asTimestamp(firstString(data, ["end_at", "ended_at", "resolved_at"])),
    status: normalizeEventStatus(data.status),
    source: firstString(data, ["source", "detected_by", "origin"]),
    rule_version: firstString(data, ["rule_version", "algorithm_version", "model_version", "version"]),
    evidence:
      parseJsonObject(data.evidence) ??
      parseJsonObject(data.trigger) ??
      parseJsonObject(data.details),
    created_at: asTimestamp(data.created_at),
    transitions: compact(
      (asArray(data.transitions) ?? asArray(data.alert_transitions) ?? asArray(data.history) ?? []).map(
        normalizeTransition,
      ),
    ),
  };
}

export function normalizeEventList(raw: unknown): Event[] {
  const array = findArray(raw, [
    "events",
    "items",
    "data",
    "results",
    "recent_events",
    "alerts",
    "event_timeline",
  ]);
  if (array) return compact(array.map(normalizeEvent));
  if (Array.isArray(raw)) return compact(raw.map(normalizeEvent));
  return [];
}

export function normalizeNote(raw: unknown): ClinicalNote | null {
  const data = asDict(raw);
  if (!data) return null;
  const content = firstString(data, ["content", "body", "note", "text"]);
  if (!content) return null;
  const author = asDict(data.author);
  const id = asString(data.id) ?? `note:${asString(data.created_at) ?? "unknown"}:${content.slice(0, 12)}`;
  return {
    id,
    patient_id: asString(data.patient_id),
    author_user_id: asString(data.author_user_id),
    author_name:
      firstString(data, ["author_name", "author.display_name", "author.name", "created_by_name"]) ??
      (author ? firstString(author, ["display_name", "name", "email"]) : null),
    related_event_id: asString(data.related_event_id),
    content,
    created_at: asTimestamp(firstString(data, ["created_at", "timestamp"])),
    updated_at: asTimestamp(data.updated_at),
  };
}

export function normalizeNoteList(raw: unknown): ClinicalNote[] {
  const array = findArray(raw, ["notes", "items", "data", "results"]);
  if (array) return compact(array.map(normalizeNote));
  if (Array.isArray(raw)) return compact(raw.map(normalizeNote));
  return [];
}

export function normalizeDevice(raw: unknown): Device | null {
  const data = asDict(raw);
  if (!data) return null;
  const id = asString(data.id) ?? asString(data.device_id);
  const hardware = firstString(data, ["hardware_identifier", "hardware_id", "serial_number", "identifier"]);
  if (!id && !hardware) return null;
  const patient = asDict(data.patient);
  // The current DeviceResponse omits linkage. Only claim "unlinked" when the
  // payload actually carried a link field.
  const patientLinkReported =
    data.patient_id !== undefined ||
    data.patient !== undefined ||
    data.patient_name !== undefined;
  return {
    id: id ?? "",
    hardware_identifier: hardware ?? "",
    hardware_revision: firstString(data, ["hardware_revision", "revision"]),
    firmware_version: firstString(data, ["firmware_version", "firmware"]),
    status: normalizeDeviceStatus(data.status),
    last_seen_at: asTimestamp(firstString(data, ["last_seen_at", "last_contact_at", "last_sync_at"])),
    battery_level: firstNumber(data, ["battery_level", "battery"]),
    registered_at: asTimestamp(firstString(data, ["registered_at", "created_at"])),
    patient_id: asString(data.patient_id) ?? (patient ? asString(patient.id) : null),
    patient_name:
      firstString(data, ["patient_name", "patient_display_name", "patient.display_name", "patient.name"]) ??
      (patient ? firstString(patient, ["display_name", "name"]) : null),
    patient_link_reported: patientLinkReported,
  };
}

export function normalizeDeviceList(raw: unknown): Device[] {
  const array = findArray(raw, ["devices", "items", "data", "results"]);
  if (array) return compact(array.map(normalizeDevice));
  if (Array.isArray(raw)) return compact(raw.map(normalizeDevice));
  return [];
}

export function normalizePatientSummary(raw: unknown): PatientSummary | null {
  const data = asDict(raw);
  if (!data) return null;
  const base = isDict(data.patient) ? { ...data.patient, ...data } : data;
  const patient = normalizePatient(base);
  if (!patient) return null;

  const measurementSource =
    data.measurements ??
    data.latest_measurements ??
    data.current_measurements ??
    data.metrics ??
    data.latest_measurement ??
    data.latest;
  const measurements = normalizeMeasurementList(measurementSource);

  const device = asDict(data.device);
  const latestEvent =
    normalizeEvent(data.latest_event ?? data.current_event ?? data.last_event) ??
    (() => {
      const events = asArray(data.active_events) ?? asArray(data.events);
      if (!events || events.length === 0) return null;
      return normalizeEvent(events[0]);
    })();

  const activeEvents = asArray(data.active_events) ?? asArray(data.events);
  const activeCount =
    firstNumber(data, ["active_event_count", "event_count", "open_events", "active_events_count"]) ??
    (activeEvents ? activeEvents.length : null);

  const lastReceived =
    firstString(data, ["last_received_at", "last_sync_at"]) ??
    latestObservedAt(measurements);

  return {
    ...patient,
    assignment_status: data.assignment_status ? normalizeAssignmentStatus(data.assignment_status) : null,
    last_received_at: asTimestamp(lastReceived),
    measurements,
    latest_event: latestEvent,
    active_event_count: activeCount,
    device_status: data.device_status || device
      ? normalizeDeviceStatus(device?.status ?? data.device_status)
      : null,
    battery_level: firstNumber(data, ["battery_level"]) ?? (device ? asNumber(device.battery_level) : null),
    device_id: asString(data.device_id) ?? (device ? asString(device.id) : null),
  };
}

export function normalizePatientList(raw: unknown): PatientSummary[] {
  const array = findArray(raw, ["patients", "items", "data", "results", "patient_list"]);
  const rows = array ?? (Array.isArray(raw) ? raw : []);
  return compact(rows.map(normalizePatientSummary));
}

export function normalizePatientOverview(raw: unknown, fallbackId = ""): PatientOverview {
  const data = asDict(raw) ?? {};
  const patientData = isDict(data.patient) ? data.patient : data;
  const patient =
    normalizePatient(patientData) ??
    normalizePatient({ ...patientData, id: fallbackId }) ?? {
      id: fallbackId,
      patient_code: "",
      display_name: "Patient record",
      status: "unknown" as PatientStatus,
      date_of_birth: null,
      sex_at_birth: null,
      created_at: null,
    };

  const measurementSource =
    data.measurements ??
    data.latest_measurements ??
    data.current_measurements ??
    data.latest_measurement ??
    data.latest;
  const measurements = normalizeMeasurementList(measurementSource);

  const events = normalizeEventList(data.active_events ?? data.events ?? data.recent_events);
  const assignmentRaw = asDict(data.assignment);
  const assignmentStatus = assignmentRaw?.status ?? data.assignment_status;
  const assignmentType = assignmentRaw?.assignment_type ?? data.assignment_type;
  const assignment =
    assignmentRaw || assignmentStatus || assignmentType
      ? {
          status: normalizeAssignmentStatus(assignmentStatus),
          assignment_type: normalizeAssignmentType(assignmentType),
          starts_at: asTimestamp(
            firstString(assignmentRaw, ["starts_at", "start_at"]) ??
              firstString(data, ["assignment_starts_at", "starts_at"]),
          ),
          ends_at: asTimestamp(
            firstString(assignmentRaw, ["ends_at", "end_at"]) ??
              firstString(data, ["assignment_ends_at", "ends_at"]),
          ),
        }
      : null;

  let device = normalizeDevice(data.device);
  if (!device && data.device_status) {
    device = {
      id: asString(data.device_id) ?? "",
      hardware_identifier: firstString(data, ["hardware_identifier", "device_identifier"]) ?? "",
      hardware_revision: null,
      firmware_version: null,
      status: normalizeDeviceStatus(data.device_status),
      last_seen_at: asTimestamp(firstString(data, ["device_last_seen_at", "last_seen_at"])),
      battery_level: firstNumber(data, ["battery_level"]),
      registered_at: null,
      patient_id: patient.id,
      patient_name: patient.display_name,
      // The overview scopes this device to the patient, so the link is known
      // even though the payload does not include a separate link object.
      patient_link_reported: true,
    };
  }

  const lastReceived =
    firstString(data, ["last_received_at", "last_sync_at", "device_last_seen_at"]) ??
    latestObservedAt(measurements);

  return {
    patient,
    assignment,
    device,
    last_received_at: asTimestamp(lastReceived),
    measurements,
    baselines: normalizeBaselines(data.baselines ?? data.baseline),
    active_events: events,
    generated_at: asTimestamp(firstString(data, ["generated_at", "as_of", "updated_at"])),
  };
}

export function normalizeDoctorOverview(raw: unknown): DoctorOverview {
  const data = asDict(raw) ?? {};
  const summary = isDict(data.summary) ? data.summary : data;

  const patients = normalizePatientList(
    data.patients ??
      data.prioritized_patients ??
      data.patient_rows ??
      data.patient_list ??
      summary.patients,
  );
  const recentEvents = normalizeEventList(
    data.recent_events ?? data.events ?? data.event_timeline ?? summary.recent_events,
  );

  // The overview's event summaries omit the patient name. Fill it from the
  // patient rows in the same response so the UI does not have to guess or call
  // each patient record. Never overwrite a value the API did report.
  const patientsById = new Map(patients.map((patient) => [patient.id, patient]));
  for (const event of recentEvents) {
    if (!event.patient_id) continue;
    const patient = patientsById.get(event.patient_id);
    if (!patient) continue;
    if (!event.patient_name) event.patient_name = patient.display_name;
    if (!event.patient_code) event.patient_code = patient.patient_code || null;
  }

  return {
    patients_monitored: firstNumber(summary, [
      "patients_monitored",
      "monitored_patients",
      "total_patients",
      "patient_count",
    ]),
    active_high_priority_events: firstNumber(summary, [
      "active_high_priority_events",
      "high_priority_events",
      "active_alerts",
      "open_high_priority_events",
    ]),
    patients_stale: firstNumber(summary, [
      "patients_stale",
      "patients_with_stale_data",
      "stale_patients",
    ]),
    devices_needing_attention: firstNumber(summary, [
      "devices_needing_attention",
      "devices_attention",
      "attention_devices",
    ]),
    patients,
    recent_events: recentEvents,
    generated_at: asTimestamp(
      firstString(data, ["generated_at", "as_of"]) ?? firstString(summary, ["generated_at", "as_of"]),
    ),
  };
}

export function normalizePortalUser(raw: unknown): PortalUser | null {
  const data = asDict(raw);
  if (!data) return null;
  const id = asString(data.id) ?? asString(data.user_id);
  if (!id) return null;
  const profile = asDict(data.doctor_profile);
  return {
    id,
    email: asString(data.email) ?? "",
    display_name: firstString(data, ["display_name", "name"]) ?? asString(data.email) ?? "Unnamed user",
    status: normalizeUserStatus(data.status),
    roles: asStringArray(data.roles).filter(isRole),
    verification_status: normalizeVerificationStatus(
      firstString(data, ["doctor_verification_status", "verification_status"]) ??
        (profile ? firstString(profile, ["verification_status"]) : null),
    ),
    last_login_at: asTimestamp(data.last_login_at),
    created_at: asTimestamp(data.created_at),
  };
}

export function normalizeUserList(raw: unknown): PortalUser[] {
  const array = findArray(raw, ["users", "items", "data", "results"]);
  if (array) return compact(array.map(normalizePortalUser));
  if (Array.isArray(raw)) return compact(raw.map(normalizePortalUser));
  return [];
}

export function normalizeAssignment(raw: unknown): Assignment | null {
  const data = asDict(raw);
  if (!data) return null;
  const doctor = asDict(data.doctor);
  const patient = asDict(data.patient);
  const id = asString(data.id) ?? asString(data.assignment_id);
  if (!id) return null;
  return {
    id,
    doctor_user_id: asString(data.doctor_user_id) ?? (doctor ? asString(doctor.id) : null),
    doctor_name:
      firstString(data, ["doctor_name", "doctor_display_name", "doctor.display_name", "doctor.name"]) ??
      (typeof data.doctor === "string" ? data.doctor : null) ??
      (doctor ? firstString(doctor, ["display_name", "name"]) : null),
    doctor_email:
      firstString(data, ["doctor_email", "doctor.email"]) ??
      (doctor ? firstString(doctor, ["email"]) : null),
    patient_id: asString(data.patient_id) ?? (patient ? asString(patient.id) : null),
    patient_name:
      firstString(data, ["patient_name", "patient_display_name", "patient.display_name", "patient.name"]) ??
      (patient ? firstString(patient, ["display_name", "name"]) : null),
    patient_code:
      firstString(data, ["patient_code", "patient.patient_code"]) ??
      (patient ? firstString(patient, ["patient_code", "code"]) : null),
    assignment_type: normalizeAssignmentType(data.assignment_type),
    status: normalizeAssignmentStatus(data.status),
    starts_at: asTimestamp(firstString(data, ["starts_at", "start_at", "created_at"])),
    ends_at: asTimestamp(firstString(data, ["ends_at", "end_at"])),
    created_at: asTimestamp(data.created_at),
  };
}

export function normalizeAssignmentList(raw: unknown): Assignment[] {
  const array = findArray(raw, ["assignments", "items", "data", "results"]);
  if (array) return compact(array.map(normalizeAssignment));
  if (Array.isArray(raw)) return compact(raw.map(normalizeAssignment));
  return [];
}

export function normalizeAuditEvent(raw: unknown): AuditEvent | null {
  const data = asDict(raw);
  if (!data) return null;
  const actor = asDict(data.actor);
  const action = firstString(data, ["action", "event", "event_type", "operation"]);
  if (!action) return null;
  return {
    id:
      asString(data.id) ??
      `${action}:${asString(data.timestamp) ?? "unknown"}:${asString(data.request_id) ?? ""}`,
    timestamp: asTimestamp(firstString(data, ["timestamp", "created_at", "at"])),
    actor_user_id: asString(data.actor_user_id) ?? (actor ? asString(actor.id) : null),
    actor_name:
      firstString(data, ["actor_name", "actor.display_name", "actor.name"]) ??
      (actor ? firstString(actor, ["display_name", "name"]) : null),
    actor_email:
      firstString(data, ["actor_email", "actor.email"]) ??
      (actor ? firstString(actor, ["email"]) : null),
    action,
    target_type: firstString(data, ["target_type", "resource_type"]),
    target_id: firstString(data, ["target_id", "resource_id", "target"]),
    outcome: normalizeAuditOutcome(data.outcome ?? data.result),
    request_id: firstString(data, ["request_id", "correlation_id"]),
  };
}

export function normalizeAuditList(raw: unknown): AuditEvent[] {
  const array = findArray(raw, ["audit_events", "events", "items", "data", "results"]);
  if (array) return compact(array.map(normalizeAuditEvent));
  if (Array.isArray(raw)) return compact(raw.map(normalizeAuditEvent));
  return [];
}

function normalizeHealthCheck(raw: unknown): HealthCheck | null {
  const data = asDict(raw);
  if (!data) return null;
  const name = firstString(data, ["name", "check", "component", "service"]);
  if (!name) return null;
  return {
    name,
    status: firstString(data, ["status", "state", "result"]) ?? "unknown",
    message: firstString(data, ["message", "detail", "error"]),
    latency_ms: firstNumber(data, ["latency_ms", "duration_ms", "response_time_ms"]),
  };
}

export function normalizeSystemHealth(raw: unknown): SystemHealth | null {
  const data = asDict(raw);
  if (!data) return null;

  const database = firstString(data, ["database", "db", "database_status"]);
  const pendingUsers = firstNumber(data, [
    "pending_users",
    "pending_invitations",
    "invited_users",
  ]);

  const rawChecks = findArray(data, ["checks", "services", "components"]);
  let checks = rawChecks ? compact(rawChecks.map(normalizeHealthCheck)) : [];
  if (checks.length === 0 && database) {
    // The current API returns a flat `database` field instead of a checks array.
    checks = [{ name: "Database", status: database, message: null, latency_ms: null }];
  }

  const ingestion = asDict(data.ingestion) ?? asDict(data.ingestion_status);
  const deviceSync = asDict(data.device_sync) ?? asDict(data.sync);
  const staleDevices = firstNumber(data, ["devices_stale", "stale_devices"]);

  return {
    status: firstString(data, ["status", "state", "overall_status"]) ?? "unknown",
    database,
    pending_users: pendingUsers,
    checks,
    ingestion: ingestion
      ? {
          pending_batches: firstNumber(ingestion, ["pending_batches", "pending", "queued"]),
          failed_batches: firstNumber(ingestion, ["failed_batches", "failed", "rejected"]),
          last_success_at: asTimestamp(firstString(ingestion, ["last_success_at", "last_success"])),
          last_failure_at: asTimestamp(firstString(ingestion, ["last_failure_at", "last_failure"])),
        }
      : null,
    device_sync: deviceSync
      ? {
          devices_online: firstNumber(deviceSync, ["devices_online", "online", "connected"]),
          devices_offline: firstNumber(deviceSync, ["devices_offline", "offline", "disconnected"]),
          stale_devices: firstNumber(deviceSync, ["stale_devices", "stale", "delayed"]),
          last_sync_at: asTimestamp(firstString(deviceSync, ["last_sync_at", "last_sync"])),
        }
      : staleDevices !== null
        ? {
            // The flat API build reports only the stale count.
            devices_online: null,
            devices_offline: null,
            stale_devices: staleDevices,
            last_sync_at: null,
          }
        : null,
    generated_at: asTimestamp(firstString(data, ["generated_at", "checked_at", "as_of"])),
  };
}

function normalizeDeviceStatusCounts(raw: unknown): DeviceStatusCount[] {
  if (Array.isArray(raw)) {
    return compact(
      raw.map((entry) => {
        const data = asDict(entry);
        if (!data) return null;
        const count = firstNumber(data, ["count", "total", "value"]);
        const status = firstString(data, ["status", "state"]);
        if (count === null || !status) return null;
        return { status: normalizeDeviceStatus(status), count };
      }),
    );
  }
  if (isDict(raw)) {
    return Object.entries(raw)
      .map(([status, value]) => {
        const count = asNumber(value);
        if (count === null) return null;
        return { status: normalizeDeviceStatus(status), count };
      })
      .filter((entry): entry is DeviceStatusCount => entry !== null);
  }
  return [];
}

function normalizeSyncFailure(raw: unknown): SyncFailure | null {
  const data = asDict(raw);
  if (!data) return null;
  const id = asString(data.id);
  const device = asDict(data.device);
  return {
    id: id ?? `${asString(data.device_id) ?? "device"}:${asString(data.last_failure_at) ?? "unknown"}`,
    device_id: asString(data.device_id) ?? (device ? asString(device.id) : null),
    hardware_identifier:
      firstString(data, ["hardware_identifier", "device.hardware_identifier"]) ??
      (device ? firstString(device, ["hardware_identifier", "hardware_id"]) : null),
    patient_name: firstString(data, ["patient_name", "patient.display_name"]),
    last_failure_at: asTimestamp(firstString(data, ["last_failure_at", "failed_at", "timestamp"])),
    failure_code: firstString(data, ["failure_code", "code", "error_code"]),
    message: firstString(data, ["message", "detail", "error"]),
  };
}

function normalizeRecentChange(raw: unknown): RecentChange | null {
  const data = asDict(raw);
  if (!data) return null;
  const action = firstString(data, ["action", "event", "event_type", "summary"]);
  if (!action) return null;
  return {
    id:
      asString(data.id) ??
      `${action}:${asString(data.timestamp) ?? "unknown"}:${asString(data.target) ?? ""}`,
    timestamp: asTimestamp(firstString(data, ["timestamp", "created_at", "at"])),
    actor_name: firstString(data, ["actor_name", "actor.display_name", "actor.email", "actor"]),
    action,
    target: firstString(data, ["target", "target_id", "resource"]),
  };
}

export function normalizeAdminOverview(raw: unknown): AdminOverview {
  const data = asDict(raw) ?? {};
  const summary = isDict(data.summary) ? data.summary : data;

  const statusCounts = normalizeDeviceStatusCounts(
    data.device_status_counts ??
      data.devices_by_status ??
      data.device_status_distribution ??
      summary.device_status_counts,
  );

  const failureRows = findArray(data, [
    "sync_failure_list",
    "sync_failures_list",
    "failed_syncs",
    "sync_failures.items",
    "sync_failures.recent",
  ]);
  const statusCountsArray = statusCounts;

  const changes = findArray(data, ["recent_changes", "recent_activity", "account_changes"]);

  return {
    active_patients: firstNumber(summary, ["active_patients", "patients_active", "patient_count"]),
    verified_doctors: firstNumber(summary, ["verified_doctors", "doctors_verified", "doctor_count"]),
    registered_devices: firstNumber(summary, ["registered_devices", "device_count", "devices_total"]),
    devices_needing_attention: firstNumber(summary, [
      "devices_needing_attention",
      "devices_attention",
      "attention_devices",
    ]),
    sync_failures: firstNumber(summary, ["sync_failures", "failed_syncs", "sync_failure_count"]),
    device_status_counts: statusCountsArray,
    sync_failure_list: failureRows ? compact(failureRows.map(normalizeSyncFailure)) : [],
    recent_changes: changes ? compact(changes.map(normalizeRecentChange)) : [],
    system_health: normalizeSystemHealth(data.system_health ?? data.health ?? data.health_status),
    generated_at: asTimestamp(
      firstString(data, ["generated_at", "as_of"]) ?? firstString(summary, ["generated_at", "as_of"]),
    ),
  };
}

/** Metrics helper shared by the patient workspace and overview. */
export const METRIC_KEY_ORDER: MetricType[] = [
  "heart_rate",
  "spo2",
  "respiratory_rate",
  "skin_temperature",
  "hrv",
  "activity",
];
