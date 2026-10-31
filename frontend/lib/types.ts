/**
 * Shared API types for the clinical portal.
 *
 * These mirror the FastAPI contract. Optional fields are genuinely optional in
 * the backend today; pages must render honestly when a value is absent rather
 * than substituting a guess.
 */

export type Role = "doctor" | "admin" | "patient";

export type Permission =
  | "patients:read_assigned"
  | "patients:manage"
  | "assignments:manage"
  | "devices:read"
  | "devices:manage"
  | "monitoring_config:read"
  | "monitoring_config:manage"
  | "audit:read"
  | "users:manage"
  | "clinical_notes:write"
  | "alerts:acknowledge"
  | "alerts:resolve"
  | "clinical_data:support_read"
  | "patient_self:read"
  | "patient_self:write";

export type UserStatus =
  | "invited"
  | "active"
  | "suspended"
  | "deactivated"
  | "unknown";

export type VerificationStatus = "pending" | "verified" | "rejected" | "unknown";

export type PatientStatus = "active" | "inactive" | "unknown";

export type AssignmentStatus = "active" | "ended" | "unknown";

export type AssignmentType = "primary" | "secondary" | "unknown";

export type DeviceStatus =
  | "registered"
  | "active"
  | "faulty"
  | "lost"
  | "retired"
  | "under_test"
  | "unknown";

export type MetricType =
  | "heart_rate"
  | "spo2"
  | "respiratory_rate"
  | "skin_temperature"
  | "hrv"
  | "activity";

export type SourceType = "measured" | "derived" | "estimated" | "unknown";

export type QualityStatus = "good" | "fair" | "poor" | "unknown";

export type Severity = "critical" | "high" | "medium" | "low" | "info" | "unknown";

export type EventStatus =
  | "new"
  | "acknowledged"
  | "under_review"
  | "resolved"
  | "false_positive"
  | "unknown";

/**
 * Clinical vocabulary rendered by <StatusBadge>. `stale`, `unavailable` and
 * `unknown` are display states, not backend event statuses.
 */
export type ClinicalStatus =
  | "measured"
  | "derived"
  | "estimated"
  | "stale"
  | "unavailable"
  | "new"
  | "acknowledged"
  | "under_review"
  | "resolved"
  | "false_positive"
  | "unknown";

export type AuditOutcome = "success" | "denied" | "failure" | "unknown";

export interface Me {
  id: string;
  email: string;
  display_name: string;
  status: UserStatus;
  roles: Role[];
  permissions: Permission[];
  timezone: string;
  doctor_verification_status: VerificationStatus | null;
  /** Set for patient accounts: the patient record this login owns. */
  patient_id: string | null;
  last_login_at: string | null;
}

export interface PermissionsResponse {
  roles: Role[];
  permissions: Permission[];
}

export interface Measurement {
  id: string;
  patient_id: string | null;
  metric_type: string;
  value: number;
  unit: string;
  /** Capture time. Null means the backend did not report one. */
  observed_at: string | null;
  /** Server receive time, when exposed. Never substitute for observed_at. */
  received_at: string | null;
  window_start: string | null;
  window_end: string | null;
  quality_status: QualityStatus;
  source_type: SourceType;
  algorithm_version: string | null;
}

export interface Baseline {
  metric_type: string;
  value: number | null;
  low: number | null;
  high: number | null;
  window_days: number | null;
  coverage: number | null;
  calculated_at: string | null;
}

export interface EventTransition {
  id: string | null;
  prior_status: string | null;
  new_status: string;
  actor_user_id: string | null;
  actor_name: string | null;
  timestamp: string | null;
  note: string | null;
}

export interface Event {
  id: string;
  patient_id: string | null;
  patient_name: string | null;
  patient_code: string | null;
  event_type: string;
  severity: Severity;
  start_at: string | null;
  end_at: string | null;
  status: EventStatus;
  source: string | null;
  rule_version: string | null;
  /** Parsed JSON evidence (thresholds, windows) when the backend provides it. */
  evidence: Record<string, unknown> | null;
  created_at: string | null;
  transitions: EventTransition[];
}

export interface ClinicalNote {
  id: string;
  patient_id: string | null;
  author_user_id: string | null;
  author_name: string | null;
  related_event_id: string | null;
  content: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface Patient {
  id: string;
  patient_code: string;
  display_name: string;
  status: PatientStatus;
  date_of_birth: string | null;
  sex_at_birth: string | null;
  created_at: string | null;
}

export interface Device {
  id: string;
  hardware_identifier: string;
  hardware_revision: string | null;
  firmware_version: string | null;
  status: DeviceStatus;
  last_seen_at: string | null;
  battery_level: number | null;
  registered_at: string | null;
  patient_id: string | null;
  patient_name: string | null;
  /**
   * False when the API response contains no patient-link fields at all. In that
   * case a missing `patient_id` means "not reported", not "unlinked".
   */
  patient_link_reported: boolean;
}

export interface PatientSummary extends Patient {
  assignment_status: AssignmentStatus | null;
  /** Patient-level last data receipt; derived from measurements when absent. */
  last_received_at: string | null;
  measurements: Measurement[];
  latest_event: Event | null;
  active_event_count: number | null;
  device_status: DeviceStatus | null;
  battery_level: number | null;
  device_id: string | null;
}

export interface PatientOverview {
  patient: Patient;
  assignment: {
    status: AssignmentStatus;
    assignment_type: AssignmentType;
    starts_at: string | null;
    ends_at: string | null;
  } | null;
  device: Device | null;
  last_received_at: string | null;
  measurements: Measurement[];
  baselines: Baseline[];
  active_events: Event[];
  generated_at: string | null;
}

export interface DoctorOverview {
  patients_monitored: number | null;
  active_high_priority_events: number | null;
  patients_stale: number | null;
  devices_needing_attention: number | null;
  patients: PatientSummary[];
  recent_events: Event[];
  generated_at: string | null;
}

export interface PortalUser {
  id: string;
  email: string;
  display_name: string;
  status: UserStatus;
  roles: Role[];
  verification_status: VerificationStatus | null;
  last_login_at: string | null;
  created_at: string | null;
}

export interface Assignment {
  id: string;
  doctor_user_id: string | null;
  doctor_name: string | null;
  doctor_email: string | null;
  patient_id: string | null;
  patient_name: string | null;
  patient_code: string | null;
  assignment_type: AssignmentType;
  status: AssignmentStatus;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string | null;
}

export interface AuditEvent {
  id: string;
  timestamp: string | null;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  outcome: AuditOutcome;
  request_id: string | null;
}

export interface DeviceStatusCount {
  status: DeviceStatus;
  count: number;
}

export interface SyncFailure {
  id: string;
  device_id: string | null;
  hardware_identifier: string | null;
  patient_name: string | null;
  last_failure_at: string | null;
  failure_code: string | null;
  message: string | null;
}

export interface RecentChange {
  id: string;
  timestamp: string | null;
  actor_name: string | null;
  action: string;
  target: string | null;
}

export interface HealthCheck {
  name: string;
  status: string;
  message: string | null;
  latency_ms: number | null;
}

export interface SystemHealth {
  status: string;
  /** Flat `database` field returned by the current API build. */
  database: string | null;
  /** Accounts awaiting activation, when the API reports it. */
  pending_users: number | null;
  checks: HealthCheck[];
  ingestion: {
    pending_batches: number | null;
    failed_batches: number | null;
    last_success_at: string | null;
    last_failure_at: string | null;
  } | null;
  device_sync: {
    devices_online: number | null;
    devices_offline: number | null;
    stale_devices: number | null;
    last_sync_at: string | null;
  } | null;
  generated_at: string | null;
}

export interface AdminOverview {
  active_patients: number | null;
  verified_doctors: number | null;
  registered_devices: number | null;
  devices_needing_attention: number | null;
  sync_failures: number | null;
  device_status_counts: DeviceStatusCount[];
  sync_failure_list: SyncFailure[];
  recent_changes: RecentChange[];
  system_health: SystemHealth | null;
  generated_at: string | null;
}

export interface PageMeta {
  total: number | null;
}


/* ------------------------------------------------------- app sync records */

export type OpticalState =
  | "no_signal"
  | "signal_present"
  | "verifying_pulse"
  | "pulse_likely"
  | "measurement_valid"
  | "poor_signal"
  | "sensor_error"
  | string;

/**
 * One processed snapshot synced directly from the phone.
 *
 * These are the app's own derived values. The portal does not recompute them;
 * it displays them with their quality state and algorithm version.
 */
export interface AppRecord {
  id: string;
  client_record_id: string;
  patient_id: string | null;
  device_id: string | null;
  device_hardware_id: string | null;
  measured_at: string | null;
  received_at: string | null;
  algorithm_version: string | null;
  signal_quality: OpticalState | null;
  heart_rate_bpm: number | null;
  spo2_percent: number | null;
  temperature_c: number | null;
  perfusion_index_percent: number | null;
  prv_rmssd_ms: number | null;
  prv_beats: number | null;
  activity_level: string | null;
  activity_rms_g: number | null;
  orientation_class: string | null;
  extra: Record<string, unknown> | null;
}

export interface PortalDevice {
  id: string;
  hardware_identifier: string;
  firmware_version: string | null;
  status: DeviceStatus;
  last_seen_at: string | null;
  linked_at: string | null;
}

export interface PatientSelf {
  id: string;
  patient_code: string;
  display_name: string;
  status: PatientStatus;
  latest_record: AppRecord | null;
  record_count: number;
  device: PortalDevice | null;
}
