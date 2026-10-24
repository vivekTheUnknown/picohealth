# Doctor & Administration Portal --- Architecture Specification

**Project:** Patient-Centric Wearable Health Monitoring System\
**Document:** `architecture.md`\
**Status:** Prototype architecture baseline\
**Scope:** One Next.js portal with role-based doctor and administration
workspaces, backed by FastAPI and PostgreSQL/Supabase.

## 1. Goals

-   Serve doctors and administrators from one deployable web application
    and sign-in entry point.
-   Enforce role-based and resource-level access in the backend.
-   Support patient measurements, time-series summaries, alerts,
    waveform recordings, notes, device operations, and audit history.
-   Keep the first implementation simple enough for a small team: a
    modular monolith, not microservices.
-   Preserve a path to production-grade privacy, reliability, and
    clinical validation without pretending the prototype is already a
    certified medical device.

## 2. High-level architecture

``` text
Wearable (Pico W / RP2040)
        |
        | BLE
        v
Patient mobile app (React Native + Expo)
  - receives/validates packets
  - local SQLite buffer
  - offline queue and sync
        |
        | HTTPS batch sync / API
        v
FastAPI backend (Koyeb)
  - authentication integration
  - authorization / policy checks
  - ingestion and validation
  - patient/device/assignment services
  - measurements, events, notes, alerts
  - AI orchestration (later, evidence-grounded)
        |
        +--------------------+
        |                    |
        v                    v
PostgreSQL (Supabase)    Supabase Storage
  - relational data      - larger waveform exports
  - metadata/events      - generated reports/attachments
  - audit records        - object metadata in DB
        |
        | HTTPS JSON APIs
        v
Next.js portal (Vercel)
  - shared login and app shell
  - doctor workspace
  - administrator workspace
  - role-aware navigation and screens
```

The Next.js frontend is not a security boundary. FastAPI must authorize
every request and verify that the caller can access the requested
patient, event, recording, device, or administrative operation.

## 3. Recommended stack

  -----------------------------------------------------------------------
  Layer                   Choice                  Responsibility
  ----------------------- ----------------------- -----------------------
  Web application         Next.js + TypeScript    Integrated doctor/admin
                                                  portal

  UI styling              Tailwind CSS and a      Responsive, accessible
                          consistent component    interface
                          system                  

  Charts                  A React charting        Trends and waveform
                          library suitable for    visualization
                          time-series data        

  Backend API             FastAPI + Python        Business rules, access
                                                  control, validation,
                                                  data APIs

  API schemas             Pydantic                Request/response
                                                  validation

  ORM/migrations          SQLAlchemy + Alembic    Relational persistence
                                                  and schema evolution

  Database                PostgreSQL on Supabase  Users/links, patients,
                                                  assignments, events,
                                                  metadata

  Object storage          Supabase Storage        Larger recordings and
                                                  generated documents

  Web hosting             Vercel                  Next.js deployment

  API hosting             Koyeb                   FastAPI deployment

  Authentication          One chosen identity     Identity,
                          provider or             sessions/tokens,
                          FastAPI-owned auth      account lifecycle

  Testing                 Pytest; frontend        Authorization and
                          unit/component tests;   workflow regression
                          Playwright for key      
                          flows                   

  Observability           Structured logs,        Diagnostics without
                          request IDs, health     leaking sensitive data
                          checks                  
  -----------------------------------------------------------------------

Do not add Redis, Kafka, Celery, Kubernetes, GraphQL, or a microservice
architecture until measured requirements justify them.

## 4. Authentication and authorization

### 4.1 Authentication

Choose one authentication owner; do not implement overlapping
independent login systems.

For the prototype, either: - use a supported identity provider and
validate its tokens in FastAPI, or - implement a carefully reviewed
FastAPI-owned session/JWT flow with secure password hashing,
refresh/session revocation, rate limiting, and recovery flows.

The frontend should use secure, appropriately configured session
handling. Avoid storing long-lived bearer tokens in browser local
storage. If cookies are used, configure `HttpOnly`, `Secure`, and
appropriate `SameSite` attributes, and implement CSRF protections for
cookie-authenticated state-changing requests.

### 4.2 Authorization model

Use role-based access control (RBAC) plus resource-level policy checks.

Core roles: - `doctor` - `admin`

Recommended permission examples: - `patients:read_assigned` -
`patients:manage` - `assignments:manage` - `devices:read` -
`devices:manage` - `monitoring_config:read` -
`monitoring_config:manage` - `audit:read` - `users:manage` -
`clinical_notes:write` - `alerts:acknowledge` - `alerts:resolve` -
`clinical_data:support_read` (restricted, optional)

A role maps to a permission set, but each API operation must also check
the resource relationship. A doctor with `patients:read_assigned` may
only read a patient if an active assignment grants access. Admin
permissions should be split where practical; "admin" should not
automatically mean unrestricted clinical browsing.

**Critical rule:** UI hiding is usability only. Authorization is
enforced in FastAPI, on every request, for every resource ID and nested
resource.

### 4.3 Multi-role users

If a person has both doctor and admin responsibilities, represent the
allowed roles explicitly and let them switch workspace. All requests
still use the same identity, and every operation is authorized against
the relevant permission set. Do not create duplicate accounts to
represent each role.

## 5. Backend modular-monolith boundaries

Organize the FastAPI application by domain rather than building one
giant router.

Suggested modules: - `auth`: identity integration, sessions,
password/recovery if owned locally. - `users`: profiles, account status,
role and permission management. - `patients`: registration and approved
profile fields. - `assignments`: doctor--patient access relationships
and history. - `devices`: registry, patient linkage,
firmware/configuration metadata, last-seen state. - `ingestion`:
validated, idempotent batch ingestion and synchronization. -
`measurements`: measurement summaries, query windows, freshness and
quality metadata. - `recordings`: waveform metadata, object-storage
references, access-controlled retrieval. - `events`: detected events and
event timeline. - `alerts`: alert lifecycle, acknowledgement, escalation
and resolution. - `baselines`: personal baseline calculation and
versioning. - `clinical_notes`: clinician-authored notes and
revisions. - `ai_review`: evidence assembly and AI summary generation;
feature-flagged until validated. - `audit`: append-only application
audit events. - `system_health`: health checks and operational
diagnostics.

Keep shared domain logic out of HTTP route handlers. Routes should
authenticate, validate, invoke domain/service logic, and return typed
responses.

## 6. Data model (initial)

Use UUIDs or another stable, non-guessable internal identifier. Use UTC
timestamps in storage; convert for display at the frontend.

### Identity and access

-   `users`: id, identity-provider subject or password-auth reference,
    display name, email, status, created_at, updated_at.
-   `user_roles`: user_id, role, granted_by, granted_at, revoked_at.
-   `doctor_profiles`: user_id, verification_status, professional
    metadata needed for the pilot.
-   `organizations`: optional early if there are multiple
    clinics/organizations; do not overbuild if single-organization only.
-   `organization_memberships`: user_id, organization_id, status, role
    context where needed.

### Patients and assignments

-   `patients`: id, approved demographics/identifiers, status,
    created_at, updated_at.
-   `doctor_patient_assignments`: id, doctor_user_id, patient_id,
    assignment type/status, starts_at, ends_at, created_by.
-   `patient_devices`: id, patient_id, device_id, linked_at,
    unlinked_at, linked_by.

### Devices and monitoring configuration

-   `devices`: id, hardware identifier, hardware_revision,
    firmware_version, status, last_seen_at, registered_at.
-   `device_configs`: id, device_id or profile_id, version, config
    payload, created_by, created_at, rollout status.
-   `monitoring_profiles`: id, name, version, validated settings,
    status, created_by, created_at.

### Measurements and recordings

-   `measurement_batches`: id, device_id, patient_id, captured_from,
    captured_to, received_at, schema_version, idempotency_key,
    processing_status.
-   `measurement_summaries`: id, patient_id, device_id, metric_type,
    value, unit, observed_at, window_start, window_end, quality_status,
    source_type, algorithm_version.
-   `recordings`: id, patient_id, device_id, signal_type, storage_key,
    captured_from, captured_to, sampling_rate, schema_version, quality
    metadata, checksum.
-   `device_sync_status`: device_id, last_success_at, last_failure_at,
    failure_code, pending_count or equivalent.

### Events and clinical review

-   `events`: id, patient_id, event_type, severity, start_at, end_at,
    status, source, rule_or_model_version, evidence references,
    created_at.
-   `alert_transitions`: id, event_id, prior_status, new_status,
    actor_user_id, timestamp, note.
-   `clinical_notes`: id, patient_id, author_user_id, related_event_id
    nullable, content, created_at, updated_at, revision metadata.
-   `baselines`: id, patient_id, metric_type, baseline value/range,
    calculation window, data coverage, algorithm_version, calculated_at.
-   `ai_reviews`: id, patient_id, requested_by, input_window,
    model/version, status, output, evidence references, created_at.
-   `audit_events`: id, actor_user_id, action, target_type, target_id,
    outcome, timestamp, request_id, minimal metadata.

Prefer foreign keys and indexes for patient/time, device/time, event
status/time, active assignments, and audit time/actor. Define retention
rules before storing long-duration raw signals.

### Data classification

Treat patient identifiers, health measurements, recordings, notes, and
AI summaries as sensitive health data. Keep application secrets and
authentication credentials out of ordinary tables/logs. Store
object-storage keys and metadata in PostgreSQL, not large waveforms as
ordinary relational blobs.

## 7. Data ingestion and time-series handling

-   The mobile app should batch samples or derived summaries rather than
    sending one HTTP request per sensor sample.
-   Use a versioned payload schema and validate device identity,
    ownership/linkage, timestamps, sample rates, units, and bounds.
-   Make ingestion idempotent using a batch ID or idempotency key to
    handle retries without duplicate data.
-   Store raw high-frequency recordings in object storage or a
    purpose-built time-series design; store searchable summaries and
    metadata in PostgreSQL.
-   Record capture time separately from server receive time.
-   Preserve gaps and quality flags. Do not fabricate samples to fill
    gaps.
-   Define limits for batch size, recording duration, upload rate, and
    payload size.
-   Return explicit accepted/rejected batch status and retry guidance.
-   Use pagination and bounded time windows for list and chart APIs.

For an initial prototype, PostgreSQL can handle metadata, events, and
moderate summary volumes. Reassess raw-data storage, partitioning,
retention, or a time-series extension after profiling real volumes.

## 8. API surface (illustrative)

All routes below require authentication unless marked public for health
checks. Exact request/response schemas should be defined in OpenAPI.

### Session and identity

-   `GET /api/v1/me`
-   `GET /api/v1/me/permissions`
-   `POST /api/v1/auth/logout` (if application-owned sessions)

### Doctor workspace

-   `GET /api/v1/doctor/overview`
-   `GET /api/v1/patients` --- returns only patients the caller may
    access
-   `GET /api/v1/patients/{patient_id}/overview`
-   `GET /api/v1/patients/{patient_id}/measurements?from=...&to=...&metrics=...`
-   `GET /api/v1/patients/{patient_id}/events`
-   `GET /api/v1/events/{event_id}`
-   `POST /api/v1/events/{event_id}/acknowledge`
-   `POST /api/v1/events/{event_id}/resolve`
-   `GET /api/v1/recordings/{recording_id}/metadata`
-   `GET /api/v1/recordings/{recording_id}/access` --- short-lived
    authorized download/stream URL or proxied stream
-   `GET /api/v1/patients/{patient_id}/notes`
-   `POST /api/v1/patients/{patient_id}/notes`
-   `POST /api/v1/patients/{patient_id}/ai-reviews` --- feature-flagged,
    permission-checked

### Administration

-   `GET /api/v1/admin/overview`
-   `GET /api/v1/admin/users`
-   `POST /api/v1/admin/users/invitations`
-   `PATCH /api/v1/admin/users/{user_id}/status`
-   `PUT /api/v1/admin/users/{user_id}/roles`
-   `POST /api/v1/admin/patients`
-   `PATCH /api/v1/admin/patients/{patient_id}`
-   `GET /api/v1/admin/assignments`
-   `POST /api/v1/admin/assignments`
-   `PATCH /api/v1/admin/assignments/{assignment_id}`
-   `GET /api/v1/admin/devices`
-   `POST /api/v1/admin/devices`
-   `PATCH /api/v1/admin/devices/{device_id}`
-   `GET /api/v1/admin/monitoring-profiles`
-   `POST /api/v1/admin/monitoring-profiles`
-   `GET /api/v1/admin/audit-events`
-   `GET /api/v1/admin/system-health`

### Operations

-   `GET /health/live`
-   `GET /health/ready`

These names are a starting contract, not a requirement to expose every
route in the first sprint. Do not expose a generic endpoint that allows
clients to update arbitrary fields or permissions.

## 9. Frontend application structure

Suggested Next.js App Router structure:

``` text
app/
  (auth)/
    login/
    recover/
  (portal)/
    layout.tsx
    overview/
    patients/
      page.tsx
      [patientId]/
        page.tsx
        trends/
        waveforms/
        events/
        notes/
    alerts/
    admin/
      overview/
      users/
      patients/
      assignments/
      devices/
      monitoring-config/
      audit/
      health/
    settings/
components/
  layout/
  navigation/
  charts/
  waveform/
  tables/
  forms/
  status/
lib/
  api-client.ts
  auth.ts
  permissions.ts
  schemas/
```

Use a shared authenticated layout and reusable components. Prefer typed
API clients and centralized error handling. The frontend can use
permission metadata to render navigation and buttons, but must still
handle `401` and `403` responses correctly. Avoid placing server-only
secrets in client bundles.

## 10. Key workflows

### Doctor signs in and reviews a patient

1.  Authenticate.
2.  Load the current identity and effective permissions.
3.  Fetch the doctor overview and assigned-patient list.
4.  Open a patient workspace.
5.  Backend checks active assignment for every patient-scoped request.
6.  Load bounded measurement windows, event metadata, and waveform
    metadata.
7.  Doctor acknowledges or annotates an event; backend checks permission
    and records an audit event.

### Administrator onboards a patient and device

1.  Admin creates or registers the patient.
2.  Admin registers a device and its capabilities.
3.  Admin links the device to the patient.
4.  Admin assigns one or more doctors.
5.  Backend writes assignment/device-link history and audit events.
6.  Doctor can access the patient only after the active assignment is
    effective.

### AI-assisted review

1.  Doctor requests a summary for an allowed patient and time range.
2.  Backend gathers measurements, data-quality flags, baseline
    comparisons, events, and relevant metadata.
3.  Backend sends a bounded, structured evidence package to the selected
    model.
4.  Output is validated and stored with model/version and evidence
    references.
5.  UI displays the summary with source links and an AI-generated label.
6.  If source data is inadequate, the system reports insufficient
    evidence rather than fabricating conclusions.

## 11. Security and privacy baseline

-   Enforce least privilege and resource-level authorization on the
    backend.
-   Use TLS for all network traffic and managed secrets for credentials.
-   Keep production, staging, and development environments separated.
-   Do not put health data, tokens, passwords, or full request bodies
    into routine logs.
-   Apply rate limits to authentication, search, and expensive
    AI/reporting endpoints.
-   Validate all input and limit query windows, pagination, upload size,
    and waveform access.
-   Use short-lived signed object URLs only after authorization; do not
    expose public buckets for clinical data.
-   Record audit events for sensitive access and administrative changes.
-   Use backups and periodically test restoration.
-   Define data retention, correction, export, deletion, incident
    response, and account offboarding policies.
-   Use secure dependency management and regular updates.
-   Review applicable Indian privacy, health-data, and medical-device
    requirements with qualified counsel/regulatory experts before any
    real-patient deployment. Prototype status does not remove privacy
    obligations.
-   Do not use real patient data in development unless approved
    safeguards and access controls are in place.

## 12. Reliability and observability

-   Structured logs with request/correlation IDs.
-   Separate liveness and readiness checks.
-   Monitor API latency, error rates, database connectivity, failed
    ingestion batches, delayed sync, object-storage errors, and AI
    failures.
-   Make ingestion retry-safe and AI requests idempotent where
    appropriate.
-   Use bounded retries with backoff; do not retry permanent validation
    errors indefinitely.
-   Return useful error codes without exposing stack traces or secrets.
-   Provide a degraded state if AI is unavailable: core monitoring and
    clinician workflows should still function.

## 13. Testing strategy

### Backend

-   Unit tests for domain services and validation.
-   Integration tests against a test database.
-   Authorization matrix tests for every role and patient relationship.
-   Explicit negative tests: doctor requests an unassigned patient,
    admin-only route called by doctor, revoked assignment, suspended
    user, cross-patient recording URL.
-   Idempotency tests for duplicate ingestion.
-   Audit tests for role, assignment, device, and alert changes.

### Frontend

-   Component tests for status, missing data, severity, and permission
    states.
-   End-to-end tests for doctor login/review and admin onboarding.
-   Verify that role switching does not retain unauthorized cached
    patient data.
-   Test responsive layouts, keyboard navigation, and form errors.

### Data/clinical behavior

-   Test missing, stale, noisy, and low-quality signals.
-   Verify charts show gaps and correct time zones.
-   Verify algorithm/model versions and source links appear in event
    details.
-   Validate that AI summaries remain grounded in supplied evidence and
    clearly express uncertainty.

## 14. Deployment and environments

-   `development`: synthetic data and local/test services.
-   `staging`: production-like configuration, synthetic or approved
    de-identified data.
-   `production/pilot`: restricted access, monitored deployments,
    backups, controlled secrets.

Deploy the Next.js portal to Vercel and FastAPI to Koyeb. Use Supabase
PostgreSQL and private object storage. Apply database migrations as a
controlled release step. Keep separate credentials per environment and
restrict production administrative access.

Before onboarding real patients, complete a security review, operational
runbook, backup/restore test, data-retention policy, incident process,
and clinical/measurement validation appropriate to the intended use.

## 15. Suggested implementation sequence

1.  Define user, role, permission, patient, assignment, and device
    schemas.
2.  Choose the authentication owner and implement `/me` plus server-side
    authorization.
3.  Build shared portal shell, login, role-aware routing, and
    access-denied states.
4.  Build admin user/patient/device/assignment management.
5.  Build doctor overview, patient workspace, summary measurements, and
    events.
6.  Add chart trends and waveform access with private storage.
7.  Add alert acknowledgement, clinical notes, and audit history.
8.  Add operational health/sync diagnostics.
9.  Add evidence-grounded AI review behind a feature flag only after
    deterministic event data and access controls are stable.
10. Run role-matrix, data-quality, security, and end-to-end tests before
    any real-patient pilot.

## 16. Architecture decisions to keep explicit

-   One portal application; separate workspaces by role, not separate
    products.
-   FastAPI is the authoritative authorization and business-logic layer.
-   PostgreSQL is the source of truth for relational metadata and
    workflow state.
-   Large recordings live in private object storage, with metadata and
    authorization in PostgreSQL.
-   A modular monolith is preferred until scale or team boundaries
    justify splitting services.
-   Clinical rules and AI interpretation remain separate; AI cannot
    replace deterministic provenance or clinician judgment.
-   The prototype is not a claim of diagnostic accuracy or regulatory
    clearance.
