# Deployment: Neon + Render + Cloudflare Workers

```
Phone ──HTTPS──┐
Browser ───────┴──> Cloudflare Worker (Next.js portal)
                         │  /api/* proxied by app/api/[...path]/route.ts
                         ▼
                    Render (FastAPI)
                         │  psycopg over TLS
                         ▼
                    Neon Postgres
```

Cloudflare Pages cannot run FastAPI. The frontend is deployed with
**Workers + OpenNext** (Cloudflare's supported Next.js 15 path); the backend is
a normal Python web service on Render.

## 1. Neon

Create a project (Postgres 17) and copy the **pooled** connection string:

```
postgresql://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require
```

The backend rewrites `postgresql://` to `postgresql+psycopg://` automatically,
so the raw Neon URL can be used as `DATABASE_URL`.

Run the schema and account seed once from the repository:

```bash
cd backend
DATABASE_URL='postgresql://…-pooler…/neondb?sslmode=require' \
  .venv/bin/alembic upgrade head
DATABASE_URL='postgresql://…-pooler…/neondb?sslmode=require' \
  .venv/bin/python -m scripts.seed
```

Seeding creates only the three accounts and the patient link. No clinical data.

## 2. Render backend

The repository root contains `render.yaml`. Either create a Blueprint from the
Git repository in the Render dashboard, or create a Web Service with:

- Root directory: `backend`
- Runtime: Python 3.12
- Build command: `pip install -e .`
- Start command:
  `uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips=*`
- Health check: `/health/live`
- Environment:
  - `ENVIRONMENT=production`
  - `SECURE_COOKIES=true`
  - `ALLOWED_ORIGINS=[]` (the frontend proxies same-origin, so no CORS)
  - `DATABASE_URL=<Neon pooled URL>`

`backend/Dockerfile` is provided for Fly.io or Cloudflare Containers if Render
is not used.

Note: the Render free plan spins down after inactivity. The first request after
idle can take several seconds. Use a paid instance for an always-on service.

## 3. Cloudflare Worker frontend

```bash
cd frontend
npm ci
npm run build:cf
npx wrangler deploy --var API_PROXY_TARGET:https://YOUR-SERVICE.onrender.com
```

`wrangler.jsonc` uses `nodejs_compat` and a static-assets binding. The
`API_PROXY_TARGET` variable is read at runtime by
`app/api/[...path]/route.ts`; no backend URL is baked into the client bundle.

`wrangler deploy` prints the Worker URL, normally:

```
https://picohealth-portal.<account-subdomain>.workers.dev
```

Set the same URL in the Render environment if you ever add direct CORS; the
proxy does not need it.

## 4. Phone

Rebuild the app with the public portal origin:

```bash
cd mobile
ALLOW_CLEARTEXT=false \
EXPO_PUBLIC_PORTAL_URL=https://picohealth-portal.<account-subdomain>.workers.dev \
EXPO_PUBLIC_PORTAL_IDENTIFIER='kode vivek sai' \
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
```

Settings → Health portal should show the HTTPS URL and the account name. The
bearer token is stored in the Android keystore and synced records appear in the
portal.

## Verification

```bash
curl https://YOUR-SERVICE.onrender.com/health/live
curl -X POST https://YOUR-WORKER.workers.dev/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"kode vivek sai","password":"kodeviveksai"}'
```

The login response must set `portal_session` (HttpOnly) and `portal_csrf`, and
`GET /api/v1/patient/me` through the Worker must return the patient record.

## Operational notes

- **Secrets**: only `DATABASE_URL` is sensitive in Render. Cloudflare holds no
  database credentials; it only forwards `/api/*`.
- **Cookies**: the proxy keeps the cookies first-party on the Worker domain.
  `SECURE_COOKIES=true` is required on Render.
- **Clock skew**: record reads tolerate five minutes so a phone clock ahead of
  the server does not hide data.
- **Scaling**: Render and Neon free tiers are suitable for a demo, not for
  production clinical use.
