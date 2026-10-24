# Patient-Centric Wearable Health Monitoring — Doctor & Administration Portal

A clinical web portal for a wearable monitoring platform. Doctors review
assigned patients' measurements, trends, events, and notes; administrators
manage users, patients, devices, assignments, and audit history.

Both roles use **one portal, one sign-in, one identity**. Authorization is
enforced in the API on every request, per resource.

> **Prototype.** This is not a certified medical device and makes no diagnostic
> claims. Do not use real patient data without the safeguards in
> `architecture.md` §11.

## Layout

```
architecture.md   system architecture specification
design.md         product and interface specification
backend/          FastAPI API, SQLAlchemy models, Alembic migrations, tests
frontend/         Next.js portal (App Router, TypeScript, Tailwind)
```

## Quick start

Two terminals.

**Backend** — <http://localhost:8000> (<http://localhost:8000/docs>)

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -e .
cp .env.example .env
.venv/bin/alembic upgrade head
.venv/bin/python -m scripts.seed
.venv/bin/uvicorn app.main:app --reload --port 8000
```

**Frontend** — <http://localhost:3000>

```bash
cd frontend
npm install
npm run dev
```

Sign in with a seeded account:

| role   | email                  | password               |
|--------|------------------------|------------------------|
| admin  | admin@example.com      | dev-password-change-me |
| doctor | doctor@example.com     | dev-password-change-me |

`unassigned@example.com` is a doctor with no patients — useful for confirming
that access control, not just navigation, is doing the work.

## Core design decisions

| Decision | Rationale |
|---|---|
| Modular monolith (FastAPI + Next.js) | Small team; no Redis/Kafka/Kubernetes/microservices until measured need |
| FastAPI owns sessions | Opaque tokens, hashed at rest, revocable per session — required for suspension and incident response |
| `HttpOnly` + `SameSite=Lax` cookies, double-submit CSRF | No long-lived bearer tokens in browser storage |
| Frontend proxies `/api/*` through Next.js | Same-origin cookies, no CORS, smaller CSRF surface |
| FastAPI is the only authorization boundary | UI hiding is usability only |
| RBAC **plus** resource checks | A permission never grants patient access on its own |
| `admin` ≠ clinical access | Clinical reads need the narrow, explicitly granted `clinical_data:support_read` |
| 404 for unauthorised patients | Does not confirm that an unassigned patient exists |
| Large waveforms in object storage | PostgreSQL holds metadata, keys, and authorization, not blobs |
| UTC enforced at the data layer | Charts cannot silently shift by a client offset |
| Gaps preserved, never interpolated | A missing sample is information |
| AI review excluded for now | Deterministic rules first; interpretation must remain traceable |

## What works today

- **Auth**: login, logout, password change, recovery/reset, invitations,
  server-side revocation, CSRF, login rate limiting, account-status gating.
- **Doctor workspace**: assigned-patient directory, patient overview, bounded
  measurement windows, event list/detail, acknowledge/resolve with full
  transition history, clinical notes.
- **Administration**: user list/invite/status/roles/permission grants, patient
  CRUD, device registry with single-patient linkage rules, assignments,
  audit-log search, operations overview, system health.
- **Tests**: 44 backend tests including the full authorization matrix.

## Not built yet

- Ingestion endpoint (`POST /ingestion/batches`) with idempotency keys — the
  schema is designed, the route is not implemented.
- Recordings/waveform storage and signed-URL access.
- Frontend chart/waveform rendering against real data volumes.
- AI-assisted review (excluded by current scope).

## Before real patients

See `backend/README.md` for the production checklist: TLS, `SECURE_COOKIES`,
PostgreSQL, shared rate limiting, backups, retention policy, and legal review of
applicable health-data and medical-device regulation.
