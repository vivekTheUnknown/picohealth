# Doctor & Administration Portal --- Design Specification

**Project:** Patient-Centric Wearable Health Monitoring System\
**Document:** `design.md`\
**Status:** Prototype design baseline\
**Scope:** One integrated web portal with role-based access for doctors
and administrators.

## 1. Product intent

Build one secure, responsive web portal for the clinical and operational
sides of the wearable-monitoring platform. Doctors and administrators
use the same application and sign-in entry point, but see different
navigation, data, and actions according to their assigned roles and
permissions.

The portal supports clinical review of patient measurements and events,
monitoring-device operations, user and assignment administration, and
auditable access to sensitive data. It is a clinician-support tool, not
an autonomous diagnostic system.

## 2. Design principles

1.  **One portal, role-aware experience.** Shared shell, authentication,
    design system, and routing; distinct doctor and administration
    workspaces.
2.  **Clinical clarity over visual noise.** Prioritize current status,
    signal quality, meaningful changes, and actionable events.
3.  **Evidence before interpretation.** Every alert or AI-generated
    summary should link back to the measurements, time range,
    signal-quality context, and rules or model version behind it.
4.  **No false certainty.** Label estimates and possible indicators as
    such. Do not present wrist skin temperature as core temperature or
    unvalidated metrics as clinical diagnoses.
5.  **Secure by default.** A user sees only records and actions
    permitted by their role and patient assignments.
6.  **Responsive and accessible.** Support desktop clinical workflows
    first, with tablet and narrow-screen layouts that preserve core
    functionality.
7.  **Progressive scope.** Ship patient monitoring and device/user
    administration before appointments, billing, hospital inventory,
    doctor marketplace, or other full-HMS functions.

## 3. Roles and access model

### Doctor

A doctor can: - View only patients assigned to them, unless a separately
granted organization-level permission allows more. - Review current
measurements, historical trends, event timelines, signal-quality
indicators, and available ECG/PPG recordings. - Acknowledge, annotate,
and resolve alerts according to policy. - Add clinical notes and review
AI-assisted summaries with supporting evidence. - View device status for
assigned patients and identify stale or missing data. - Update their own
profile and notification preferences.

A doctor cannot: - Create administrator accounts or grant roles. -
Change global system configuration or firmware policy. - Browse
unassigned patients by default. - Alter raw sensor data or silently
overwrite the event history. - Treat AI output as a confirmed diagnosis
without clinical review.

### Administrator

An administrator can: - Register patients, doctors, and devices. -
Verify doctor accounts and manage account status. - Assign and unassign
doctors to patients. - Associate devices with patients and manage device
metadata. - Configure supported monitoring profiles and permitted
thresholds/rules. - Review synchronization failures, device
connectivity, and platform health. - Search audit logs and investigate
access or operational incidents. - Manage organization settings and role
grants, subject to least privilege.

Administrative access to clinical content should be limited to what is
operationally necessary and explicitly permitted. Consider separate
permissions for **user administration**, **device operations**,
**clinical-data support**, and **audit review**, rather than treating
every administrator as unrestricted.

### Optional future roles

-   **Clinical supervisor:** organization-wide clinical oversight.
-   **Read-only reviewer:** view permitted records without modifying
    them.
-   **Support operator:** troubleshoot devices without routine access to
    detailed clinical history.

Do not implement these roles until a concrete workflow requires them.

## 4. Shared application shell

### Global elements

-   Product logo/name and environment indicator
    (development/staging/production).
-   Role-specific primary navigation.
-   Global search constrained by permissions.
-   Notifications and alert badge.
-   Current user menu, profile, preferences, and sign out.
-   Visible connectivity/sync status where relevant.
-   Consistent page title, breadcrumbs, loading states, empty states,
    and error handling.

After login, route users to the workspace appropriate to their
permissions: - Doctor → **Clinical Overview** - Administrator →
**Operations Overview** - Multi-role user → role/workspace chooser or a
workspace switcher

Do not rely on hiding menu items as security. The API must independently
enforce every permission.

## 5. Doctor workspace: screens and functionality

### 5.1 Clinical Overview

**Purpose:** Help a doctor identify which assigned patients need review.

**Layout:** - Header with page title, selected time window, and
refresh/data freshness indicator. - Summary cards: patients monitored,
active high-priority events, patients with stale data, devices needing
attention. - Prioritized patient/event list. - Recent event timeline. -
Filters for event severity, data freshness, device status, and
patient. - Clear labels for "last received" timestamps and time zone.

**Patient row/card:** - Patient name and approved identifier. - Current
available measurements: heart rate, SpO₂, respiratory-rate estimate,
skin temperature, HRV where available. - Trend or baseline-deviation
indicator with time window. - Latest event and severity. - Signal
quality and last sync. - Device battery/connectivity status when
reported.

Do not show a metric as current if it is stale. Use "No recent data" or
"Last received ..." rather than carrying forward an old value without
disclosure.

### 5.2 Patient Directory

-   Search and filter assigned patients.
-   Patient name, approved identifier, assignment status, last sync,
    active event count.
-   Open the patient monitoring workspace.
-   Show an explicit empty state when no patients are assigned.
-   Avoid exposing patient existence or details to unauthorized users.

### 5.3 Patient Monitoring Workspace

**Header** - Patient name and approved identifier. - Assignment and
device status. - Last sync time and data freshness. - Relevant
profile/context fields only where available and authorized.

**Measurement summary** - Heart rate. - SpO₂, with signal-quality
context. - Respiratory-rate estimate. - Skin temperature (explicitly
labelled as skin temperature). - HRV metric(s) with the calculation
window shown. - Activity/movement. - Battery and device connection
state.

Every measurement should have: - Value and unit. - Measurement timestamp
and aggregation window. - Source/status: measured, derived, estimated,
unavailable, or stale. - Signal-quality state where applicable. -
Baseline comparison only when a suitable baseline exists.

**Main panels** 1. Current measurements and quality. 2. Trends and
personal baseline. 3. Event timeline. 4. ECG/PPG recordings, if
available. 5. Notes and review history. 6. Device/sync diagnostics, with
clinical and operational details separated.

### 5.4 Trends and Correlated Timeline

-   Time-range selector: 1 hour, 6 hours, 24 hours, 7 days, 30 days,
    plus custom range if supported.
-   Plot measurements against time with units and visible missing-data
    gaps.
-   Overlay events and annotations.
-   Allow related signals to be compared without implying causation.
-   Show personal baseline, confidence/coverage, and baseline period
    when available.
-   Explain gaps caused by device disconnection, poor signal quality, or
    unavailable sensor data.
-   Allow users to zoom, pan, and inspect a point's timestamp and
    quality metadata.

Avoid drawing continuous lines across long missing-data gaps. Use
consistent units and explicit local time zone.

### 5.5 ECG/PPG Waveform Viewer

-   Select a recording or event window.
-   Display waveform with time and amplitude axes, units/scales where
    known.
-   Zoom and pan across a recording.
-   Show detected peaks and event markers only when generated by a known
    algorithm version.
-   Display signal-quality and motion-artifact indicators.
-   Show recording start/end, sampling rate, source device, and missing
    samples.
-   Allow export only if policy and permissions permit it.
-   Clearly label algorithmic measurements as automated estimates
    requiring review.

Do not claim diagnostic-grade waveform interpretation until the
acquisition hardware, algorithms, and intended use have been validated.

### 5.6 Alerts and Events

**List view** - Severity, event type, patient, start time, duration,
current state, last update. - Filters for status, severity, event type,
and time range.

**Detail view** - What triggered the event, in plain language. -
Measurements and thresholds/rules involved. - Comparison to patient
baseline where applicable. - Signal quality and motion context. - Event
time window with relevant charts/waveforms. - Data gaps and
sensor/device state. - Rule/model version and creation timestamp. -
Acknowledge, add note, escalate, or resolve actions as permitted.

Use explicit states such as **New**, **Acknowledged**, **Under review**,
**Resolved**, and **False positive**. Preserve an audit trail of state
changes. Acknowledge/resolve actions must not delete the original event.

### 5.7 AI-Assisted Clinical Review

-   Generate a concise summary of changes over a selected time window.
-   Summarize event chronology and relevant trends.
-   Include links to the exact charts, events, and recording windows
    supporting each statement.
-   Distinguish observed measurements from derived estimates and
    model-generated interpretation.
-   Show generation time, input time range, and model/version metadata
    where appropriate.
-   Allow the doctor to mark a summary useful/not useful and add a note.
-   Provide a clear "AI-generated --- verify against source data" label.

The AI must not invent missing values, silently infer diagnoses,
recommend treatment as an authority, or obscure uncertainty. If evidence
is insufficient or signal quality is poor, it should say so. Keep AI
output separate from clinician-authored notes.

### 5.8 Clinical Notes and Review History

-   Add dated notes linked to a patient, event, or review period.
-   Display author and creation/update timestamps.
-   Preserve note revisions or a suitable audit history.
-   Distinguish clinician-authored content from AI-generated content.
-   Do not allow silent deletion of notes that have already informed
    care; follow the chosen retention/correction policy.

### 5.9 Doctor Profile and Preferences

-   Profile and verified professional details.
-   Notification preferences.
-   Time zone and display preferences.
-   Password/session management through the selected authentication
    flow.
-   Assigned-patient list.

## 6. Administration workspace: screens and functionality

### 6.1 Operations Overview

-   Counts of active patients, verified doctors, registered devices,
    devices needing attention, and sync failures.
-   Recent account/device changes.
-   Device status and last-seen distribution.
-   Ingestion/synchronization failure list.
-   System-health indicators surfaced by the backend.
-   Links to relevant management screens.

Avoid displaying detailed patient measurements on the default admin
overview unless the administrator has explicit clinical-data
permissions.

### 6.2 User Management

-   Search/filter users by name, approved identifier, role, status, and
    organization.
-   Create or invite doctor and administrator accounts through a secure
    flow.
-   Verify doctor credentials/status according to the project's
    real-world process.
-   Activate, suspend, or deactivate accounts.
-   Assign roles and narrowly scoped permissions.
-   Force session revocation after suspension or a security incident.
-   View account creation and role-change audit history.

Never expose plaintext passwords. Avoid a general "promote to admin"
action available to ordinary users.

### 6.3 Patient Registration and Management

-   Register patient with minimum necessary fields.
-   Generate/use a stable internal patient ID.
-   Update approved profile fields.
-   View doctor assignments and associated device.
-   Mark a record inactive where appropriate; do not casually
    hard-delete clinical records.
-   Prevent accidental duplicate records with an explicit
    merge/reconciliation workflow if needed.

### 6.4 Doctor--Patient Assignments

-   Assign one or more authorized doctors to a patient.
-   Define primary/secondary responsibility if the workflow needs it.
-   Set start/end dates and assignment status.
-   Review assignment history.
-   Revoke access immediately when an assignment ends, subject to
    approved retention/audit policy.

### 6.5 Device Registry

-   Register a device and its unique device identifier.
-   Link/unlink device to a patient.
-   Record hardware revision, firmware version, sensor configuration,
    provisioning state, and status.
-   View last contact, battery telemetry, packet/sync failures, and
    supported capabilities.
-   Mark a device lost, retired, faulty, or under test.
-   Preserve device reassignment history.
-   Prevent a device from being simultaneously active for multiple
    patients unless explicitly supported.

### 6.6 Monitoring Configuration

-   Manage versioned monitoring profiles and supported
    sampling/configuration settings.
-   Configure alert rules only within validated, documented bounds.
-   Show who changed a setting, when, why, and which devices/patients it
    affects.
-   Require confirmation for changes that could materially alter
    monitoring.
-   Support staged rollout and rollback before any broad deployment.
-   Do not let a general administrator silently change clinical
    thresholds without the appropriate permission and review.

### 6.7 Audit Log

-   Search by actor, action, target, time range, and outcome.
-   Include sign-ins, failed access attempts, role changes, patient
    access, assignment changes, device reassignment, configuration
    changes, and alert-state changes.
-   Record timestamp, actor ID, action, target/resource ID, result, and
    relevant request/correlation ID.
-   Make logs append-only from the application perspective; restrict
    access and protect against tampering.
-   Avoid putting unnecessary sensitive health data or secrets into log
    messages.

### 6.8 Platform and Synchronization Health

-   API and database status as reported by backend health checks.
-   Data-ingestion failures, invalid payloads, duplicate batches,
    delayed syncs, and retry status.
-   Device last-seen and firmware/configuration distribution.
-   Error detail useful for troubleshooting, with sensitive data
    redacted.
-   Export diagnostic reports only to permitted roles.

## 7. Navigation map

### Shared

-   Sign in
-   Account/profile
-   Notifications
-   Help / system status (as appropriate)

### Doctor

-   Clinical Overview
-   Patients
    -   Patient Monitoring Workspace
    -   Trends
    -   Waveforms
    -   Events
    -   Notes / Review History
-   Alerts
-   Profile / Preferences

### Administrator

-   Operations Overview
-   Users
-   Patients
-   Assignments
-   Devices
-   Monitoring Configuration
-   Audit Logs
-   Platform Health
-   Organization Settings

Navigation items should be role-aware, but every page and API must
enforce authorization server-side.

## 8. Visual design direction

-   Calm, clinical, modern, and information-dense without looking like a
    trading terminal.
-   Neutral background with restrained blue/teal accents; reserve strong
    red/orange for meaningful event severity.
-   Use cards for high-level summaries, tables for management, and
    full-width chart panels for time-series analysis.
-   Use a consistent severity system with text labels and icons; never
    rely on color alone.
-   Use readable typography, clear chart legends, sufficient contrast,
    keyboard navigation, visible focus states, and accessible form
    labels.
-   Keep primary actions predictable and use confirmation dialogs for
    destructive or high-impact changes.
-   Provide skeleton/loading states, empty states, permission-denied
    states, and recoverable error messages.

## 9. Data and clinical-language conventions

-   **Measured:** directly acquired by a sensor or device, subject to
    its limitations.
-   **Derived:** calculated from source data using a documented
    algorithm.
-   **Estimated:** inferred and uncertain, such as estimated respiratory
    rate or sleep stage.
-   **Possible signal/event:** a pattern that warrants review, not a
    diagnosis.
-   **Stale:** the value's age exceeds the relevant freshness policy.
-   **Unavailable:** no usable value exists for the selected period.

Show units, timestamps, aggregation windows, source, quality, and
missingness where material. Keep patient-specific baselines distinct
from population reference ranges.

## 10. MVP acceptance criteria

1.  Doctors and administrators sign in through the same portal entry
    point and are routed to the correct workspace.
2.  Doctor API requests cannot access unassigned patients by changing a
    URL or identifier.
3.  Admin functions are inaccessible to doctor-only users at both UI and
    API layers.
4.  The doctor overview distinguishes fresh, stale, and missing data.
5.  Patient pages display measurements, trends, event timelines, and
    signal-quality context when data exists.
6.  Alert acknowledgement and resolution preserve the event and record
    the actor and timestamp.
7.  Admins can manage users, patient assignments, and device
    associations within their permissions.
8.  Role changes, access-sensitive actions, assignments, and
    configuration changes are auditable.
9.  AI summaries are visibly labelled, evidence-linked, and never
    presented as definitive diagnoses.
10. The portal works at supported desktop and tablet widths and provides
    clear loading, empty, and error states.

## 11. Explicitly out of scope for the first portal release

-   Full hospital management system (HMS).
-   Billing, insurance, inventory, pharmacy, and payroll.
-   Doctor marketplace, public ratings, and hiring workflows.
-   Autonomous diagnosis or treatment decisions.
-   Unvalidated claims of medical-grade detection.
-   Complex multi-tenant enterprise configuration unless a real pilot
    requires it.
