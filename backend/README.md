# Backend — Health Monitoring Portal API

FastAPI + SQLAlchemy (sync) + PostgreSQL/SQLite, implementing the authorization
and clinical-workflow layer described in `../architecture.md`.

## Run it

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -e .   # or: uv sync
cp .env.example .env
.venv/bin/alembic upgrade head
.venv/bin/python -m scripts.seed
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Seed accounts (development only, never in production):

| role   | email                   | password                 |
|--------|-------------------------|--------------------------|
| admin  | admin@example.com       | dev-password-change-me   |
| doctor | doctor@example.com      | dev-password-change-me   |
| doctor | unassigned@example.com  | dev-password-change-me   |

`unassigned@example.com` deliberately has no patient assignments, so the
negative authorization paths can be exercised by hand.

API docs: <http://localhost:8000/docs>

## Tests

```bash
.venv/bin/python -m pytest -q
```

The suite runs against in-memory SQLite with a fresh schema per test. It covers
the matrix `architecture.md` §13 asks for by name: unassigned-patient access,
admin routes called by a doctor, revoked/expired assignments, suspended users,
cross-patient resource access, and CSRF.

## Structure

```
app/
  core/          config, db, security, sessions, authz, deps, errors, audit,
                 rate limiting, pagination, middleware
  models/        identity, patients, devices, clinical
  modules/
    auth/        login, logout, recover, reset, invitations
    patients/    doctor-scoped directory, admin CRUD
    assignments/ doctor-patient relationships
    devices/     registry, linkage, monitoring profiles
    measurements/bounded time-series reads
    events/      alert lifecycle and transitions
    notes/       clinician notes (no delete, by design)
    users/       admin user management, roles, permission grants
    audit/       read-only audit search
    dashboard/   doctor/admin overview, system health
    system_health/ liveness and readiness
migrations/      Alembic
tests/           auth, authorization matrix, events, admin, rate limiting
scripts/seed.py  synthetic development data
```

## Decisions worth knowing

**Sessions are server-side, not JWTs.** The cookie carries an opaque token; only
its SHA-256 hash is stored. Revocation is a row update, which is what suspension
and incident response require. `revoke_all_for_user` is called on suspension,
password change, password reset, role change, and permission-grant change.

**Two authorization paths, one function.** Every patient-scoped route calls
`require_patient_access`. A clinician needs the permission *and* a live
assignment; an administrator needs the explicitly granted
`clinical_data:support_read` permission, and the calling route writes an audit
row. Failure returns **404, not 403**, so the API never confirms that an
unassigned patient exists. This is asserted in tests.

**`admin` does not imply clinical access.** `ADMIN_PERMISSIONS` deliberately
omits `clinical_data:support_read`. Narrow grants live in
`user_permission_grants` and are managed via
`PUT /api/v1/admin/users/{id}/permissions`, which also revokes sessions.

**Multi-role users are one identity.** A person with both roles has two
`user_roles` rows and one login; permissions are the union. No duplicate
accounts.

**CSRF is double-submit.** Session cookie is `HttpOnly`; the CSRF cookie is
readable so the portal can echo it in `X-CSRF-Token`. Pre-authentication
endpoints (`login`, `recover`, `reset`, `accept-invitation`) are exempt because
no session exists yet; they are covered by rate limiting and `SameSite=Lax`.

**UTC is enforced at the data layer.** `UTCDateTime` normalises on write and
restore, so SQLite cannot silently drop `tzinfo` and shift every chart.

**Timestamps are distinct.** `observed_at` (capture) never conflated with
server receive time. Gaps are preserved; nothing is interpolated.

**Freshness is explicit.** `freshness_label()` returns `fresh` / `stale` /
`unknown`; the portal must render stale data as stale.

**Enums persist as `VARCHAR` + `StrEnumType`,** not native DB enums, for
portability. The API still speaks the enum, never a bare string.

## Deliberately not built yet

- **Ingestion endpoint** (`POST /ingestion/batches`). The schema for
  `measurement_batches` and idempotency keys is designed but not implemented.
  This is the next backend slice.
- **Recordings / waveform storage.** Metadata model not yet added; object
  storage is not wired.
- **AI review.** Out of scope per the current project decision.
- **Refresh-token rotation.** Idle + absolute expiry with server-side
  revocation is in place; rotation-on-refresh is unnecessary without refresh
  tokens.
- **Redis-backed rate limiting.** The current limiter is per-process and resets
  on restart. Correct for a single instance; replace before scaling out.

## Production checklist (from `architecture.md` §11/§14)

- [ ] `SECURE_COOKIES=true`, HTTPS only
- [ ] PostgreSQL, not SQLite (`DATABASE_URL`); `_assert_production_safety` enforces this
- [ ] Rotate every seed credential; seed script refuses to run in production
- [ ] Move rate limiting to a shared store before running >1 replica
- [ ] Backup and restore rehearsal
- [ ] Retention, correction, export, and deletion policies signed off
- [ ] Legal review of applicable health-data and device regulation before any real-patient use
