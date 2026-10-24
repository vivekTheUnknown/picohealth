# Clinical Portal — Frontend

Next.js 15 (App Router) + TypeScript + Tailwind CSS frontend for the doctor and
administration portal described in `../architecture.md` and `../design.md`.

The application is a **client-rendered portal** behind a cookie-authenticated
FastAPI service. It never treats browser-side role checks as authorization:
every page tolerates `401` and `403`, and the API remains the authority for all
access decisions.

## Requirements

- Node.js 22+
- npm 10+
- A running API service (default proxy target: `http://localhost:8000`)

## Environment

Create `.env.local` in this directory:

```bash
# Where Next.js proxies /api/* requests. Server-side rewrite target only.
API_PROXY_TARGET=http://localhost:8000

# Optional. Leave blank when the browser should call the same origin and use the
# /api rewrite below. Set this only when the browser must call the API directly.
NEXT_PUBLIC_API_BASE_URL=

# Optional display label: development | staging | production
NEXT_PUBLIC_APP_ENV=development
```

`NEXT_PUBLIC_*` values are embedded in the client bundle. Never put secrets in
them.

### Proxy topology

```
Browser
  │  same-origin fetch, credentials: "include"
  ▼
Next.js (this app)
  │  rewrite: /api/:path* → ${API_PROXY_TARGET}/api/:path*
  ▼
FastAPI service
```

The proxy keeps the session cookie first-party and avoids CORS. If
`NEXT_PUBLIC_API_BASE_URL` is set, the client calls that URL directly and the
browser must be able to send the session cookie to it (same-site or explicitly
configured CORS + credentials).

## Run

```bash
npm install
npm run dev        # http://localhost:3000
```

Production build:

```bash
npm run build
npm start
```

Type check only:

```bash
npm run typecheck
```

## Authentication and request handling

- `lib/api-client.ts` is the only fetch wrapper:
  - sends `credentials: "include"`;
  - reads the readable `portal_csrf` cookie and echoes it in `X-CSRF-Token` on
    `POST`, `PUT`, `PATCH`, and `DELETE`;
  - normalizes the `{ "error": { "code", "message", "retryable" } }` envelope
    into a typed `ApiError`;
  - dispatches `portal:unauthorized` on `401` so the session provider can move
    the user to `/login`;
  - leaves `403` to the page, which renders an access-denied state.
- `lib/session.tsx` loads `GET /api/v1/me` once for the portal shell and exposes
  the current identity and permissions.
- The `(portal)` layout is a client-side guard. It is a usability redirect, not a
  security boundary.

## Data honesty rules

This frontend deliberately does **not** invent clinical values.

- A measurement is current only inside its freshness window
  (`lib/freshness.ts`). Older values are labelled **Stale** with the last-received
  time; missing values show **No recent data** / **Unavailable**.
- Every severity and status is rendered as text **and** icon **and** colour,
  never colour alone (`components/status/`).
- Unknown API fields become `null` / `unknown` through the normalizers in
  `lib/normalize.ts` and are displayed as “Not reported”.
- No mock patients, fake measurements, or placeholder clinical values are used.
- AI-assisted review is out of scope for this release. There is no AI UI.

## Routes

| Route | Purpose |
| --- | --- |
| `/login` | Sign in |
| `/recover` | Request a password reset, or set a new password with a reset token (`?token=`) |
| `/accept-invitation` | Activate an invited account (`?token=`) |
| `/` | Redirects to the workspace appropriate to the account |
| `/overview` | Doctor clinical overview |
| `/patients` | Assigned-patient directory |
| `/patients/[patientId]` | Patient workspace: measurements, trends, events, notes |
| `/alerts` | Event list and detail, acknowledge/resolve (`?event=` deep link) |
| `/admin/overview` | Operations overview |
| `/admin/users` | Invite users, manage status and roles |
| `/admin/patients` | Register and review patient records |
| `/admin/assignments` | Doctor–patient assignments; create and end |
| `/admin/devices` | Device registry; register and manage status/patient link |
| `/admin/audit` | Audit log with server-side filters |
| `/admin/health` | Platform and synchronization health |
| `/settings` | Profile, effective permissions, password change, sign out |

## API contract notes and graceful degradation

Several list endpoints may be implemented in parallel with this frontend. The UI
is written to degrade rather than crash:

- **Event feed.** The published contract has no global event-list endpoint.
  `listEvents()` first tries `GET /api/v1/events`. If that is unavailable (and the
  failure is not `401`/`403`), it falls back to the `recent_events` embedded in
  `GET /api/v1/doctor/overview`. The alerts page labels this fallback explicitly;
  it is not presented as a complete feed.
- **Patient events.** `GET /api/v1/patients/{id}/events` is preferred. If it
  fails, the patient workspace can show active events from the patient overview,
  again with an explicit warning.
- **Normalizers.** Responses are accepted as a bare array, a paginated envelope,
  or a keyed map where practical. Field aliases are mapped in
  `lib/normalize.ts` so a parallel backend response shape does not crash a page.
- **Device and assignment updates.** `PATCH /api/v1/admin/assignments/{id}` and
  `PATCH /api/v1/admin/devices/{id}` are used for ending assignments and managing
  device status/link. If a deployment does not expose them, the action surfaces
  the API error and leaves the record unchanged.
- **Pagination.** The audit page requests at most 200 recent matching events. No
  client-side pagination is implemented for list endpoints that do not expose a
  page contract.

All API failures are shown as recoverable error states with a retry action; an
empty list is never silently presented as “healthy”.

## Project structure

```
app/
  (auth)/            sign-in, recovery, invitation
  (portal)/          authenticated shell and all portal pages
components/
  layout/            page shell, cards, states, modal, skeletons
  navigation/        nav config, sidebar, top bar, tabs
  charts/            recharts trend chart
  tables/            generic accessible data table
  forms/             buttons, fields, inputs, password input, banners
  status/            status/severity/quality/device/user badges,
                     freshness, permission-denied, measurement card
  clinical/          measurements, trends, events, and notes panels
lib/
  api-client.ts      typed fetch + CSRF + error normalization
  api.ts             endpoint functions
  normalize.ts       tolerant response mapping
  types.ts           domain types
  freshness.ts       display freshness policy
  permissions.ts     UI-only permission helpers
  session.tsx        current identity context
  use-api.ts         data loading and mutation hooks
```

## Styling system

The visual layer follows `../style.md` and is built bottom-up: tokens → primitives
→ shell → screens.

**Tokens.** Every colour, radius, duration and font stack is declared once in
`app/globals.css`. `tailwind.config.ts` only maps semantic names onto those
variables. Colours are stored as raw RGB channels (`--accent: 62 207 142`) so
Tailwind's opacity modifier works — with hex values, `ring-accent/25` silently
falls back to Tailwind's default blue.

Adding a light theme means overriding `:root[data-theme="light"]` with the same
variable names. No component changes.

**Verified contrast** (WCAG 2.2 AA, checked before implementation as §2 requires):

| Pair | Ratio | Requirement |
|---|---|---|
| `text-primary` on `surface` | 13.57:1 | 4.5 |
| `text-secondary` on `surface` | 7.20:1 | 4.5 |
| `text-muted` on `surface` | 5.65:1 | 4.5 |
| `accent` on `surface` | 8.19:1 | 4.5 |
| `accent-fg` on `accent` | 8.61:1 | 4.5 |
| `border-control` on `surface` | 3.40:1 | 3.0 |

`--text-muted` was raised from the guide's starting `#78828C` (4.18:1, failing)
to `#8F99A3`. `--border-control` is separate from `--border` because an input's
outline is the information that identifies the control (WCAG 1.4.11), while a
divider is decorative.

**Primitives.** `panel`/`SectionCard`, `DataTable` (40–48px rows, sticky header
option, content-driven height), `Button` (32px toolbar / 38px form heights),
`Field`/`Input`, `Badge` (text + icon + tone), `StatCard` (a strip cell, not a
tile), `Tabs`, `EmptyState`, `ErrorState`, `PermissionDenied`.

**Composition rules applied.** KPI cells share one hairline-divided panel rather
than four floating tiles; the measurement strip is one bordered grid of
borderless cells; tables replace card lists for patients, events, users,
devices, assignments and audit; the patient workspace no longer nests panels
inside a tabbed panel.

**Motion.** 100–160ms transitions, no decorative animation, and
`prefers-reduced-motion` collapses all durations.

## Accessibility

- Keyboard-operable tabs, menus, and modals, including focus trapping and focus
  restoration.
- Visible focus styles and a skip link.
- Tables use `<caption>`, scoped headers, and labelled actions.
- Forms use explicit labels, hints, and error associations.
- Status and severity never rely on colour alone.

## Security baseline

- No secrets in the client bundle.
- Session cookies are HttpOnly and managed by the API.
- CSRF uses the double-submit token issued by the backend.
- `next.config.ts` sets `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, and a restrictive `Permissions-Policy`.
- The portal is marked `noindex`.
- The frontend does not expose patient identifiers to unauthenticated users; the
  API filters every listing and enforces assignment checks.
