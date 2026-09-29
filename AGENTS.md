# AGENTS.md — Base44 dev environment notes for Pharaxis-One

Non-obvious facts for running this repo in the Base44 sandbox. Read the manifests
(`apps/mims/package.json`, `.env.example`) for the rest.

## What runs here

Only the **MIMS** product is brought up in the preview (it is the primary app).
CP Portal (`apps/cp-portal`) is a second product not wired into this compose.

- `mims-frontend` — Vite/React dev server, host port **3000** (the preview entry).
  The app is served under base path **`/mims/`** (so `/mims/login`, `/mims/dashboard`).
  `vite.config.js` redirects bare `/` → `/mims/` so the preview loads the app.
- `mims-backend` — Express API on internal port 3000. The Vite dev server proxies
  `/api`, `/storage`, `/uploads` (and websockets) to it, so the browser sees one
  origin (no CORS / cross-site cookie problems). `CORS_ALLOW_ALL=true` is set in
  dev so the backend does not 500 on the forwarded `Origin` header.
- `mims-mysql` (MySQL 8) and `mims-redis` (Redis 7) are internal infra services.

## Boot behavior (important)

- The backend **runs all DB migrations on startup** (`database/db.js` →
  `migrationRunner.js`), 97 files in `database/migrations/`. It will not listen
  until migrations finish, so first boot takes longer than a typical Node app.
- **Migration 001 refuses to run without `BOOTSTRAP_PLATFORM_ADMIN_PASSWORD`.**
  A dev default is in `.env.base44-defaults`. The bootstrap account is
  `admin@pharaxis.local` / `Pharaxis@Dev2026` — log in at `/mims/login`.
- `JWT_SECRET` has a per-process random fallback in code, but a fixed dev value is
  set in `.env.base44-defaults` so sessions survive nodemon restarts.
- Redis is **optional**: the app degrades to in-memory rate limiting / DB fallback
  if Redis is down. SMTP is also optional — the email poller worker logs warnings
  but the API stays up without it.

## Env / secrets

- `.env.base44-defaults` (committed) holds dev placeholders and is loaded FIRST.
- `/run/base44/app.env` (platform-managed, outside the repo) is loaded LAST and
  always wins — real secrets go there via the dashboard.
- MySQL/Redis credentials are **inline in `docker-compose.base44.yml`** (local
  infra, generated), never in the defaults file or `set_secrets`.

## Verifying it works

- `docker compose -f docker-compose.base44.yml ps` — all four services healthy.
- `curl -fs http://localhost:3000/mims/` → the app HTML (frontend up).
- `curl -fs http://localhost:3000/api/health` → `{"status":"ok",...}` (backend + DB up).
- Log in at the preview's `/mims/login` with the bootstrap admin above.

## Live reload

Both app servers run with live reload (nodemon for the backend, Vite HMR for the
frontend). Source is bind-mounted; `node_modules` live in named volumes and
reinstall from the lockfile on container start.
