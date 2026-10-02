# AGENTS.md — Base44 dev environment notes

Platform-specific findings for running this repo in the Base44 sandbox. The repo's
own rules live in `CLAUDE.md` and `docs/TEAM_OPERATING_SOP.md` — those win for
product work; this file only covers what is non-obvious about running the app here.

## What runs

`docker compose -f docker-compose.base44.yml up -d` starts **CP Portal only**:
MySQL 8 (`pharaxis_cp_portal_dev`), a ClamAV container, the backend (nodemon,
port 4000) and the frontend (Vite dev, mapped to host port 3000 — the preview).
MIMS is not started; the investigated failing commits were CP Portal's, and the
MIMS↔CP Portal bridge degrades gracefully without it (retry pollers).

- Backend: bind-mounted at `/app` from `apps/cp-portal/backend`, deps installed
  on container start with `npm ci`, then `npx nodemon server.js`. The app's own
  `predev` scanner script is macOS-oriented and deliberately bypassed — ClamAV
  runs as its own compose service (`CLAMAV_HOST=clamav`, port 3310).
- Frontend: Vite 7 dev server. `vite.config.js` proxies `/api` and `/uploads` to
  `CP_API_PROXY` (set to `http://cp-backend:4000`), so the preview is single-origin —
  no cookie/CORS gymnastics needed.
- `CP_CORS_ORIGINS` must include `https://3000-${BASE44_PUBLIC_HOST_SUFFIX}`:
  the Vite proxy forwards the browser's Origin header, and the backend answers a
  foreign origin with 403.
- `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` is passed bare (platform-set) so Vite
  accepts the sandbox preview host.

## Boot behaviour (no separate migration step)

`server.js` runs `runMigrations()` then `initializeDatabase()` before listening.
On an empty DB the superadmin seed **throws** unless `CP_BOOTSTRAP_SUPERADMIN_PASSWORD`
is set — it is (dev value) in the compose file. Admin login: email `cpadmin`.
JWT secrets and `CP_SECRET_ENCRYPTION_KEY` have dev values inline; the code only
demands real ones outside development. No user-supplied secrets are required.

## Verifying

- Health: `curl localhost:3000/api/health` (proxied) or exec into `cp-backend`.
- Frontend production build: `docker compose -f docker-compose.base44.yml exec -T cp-frontend npm run build`.
- Static backend check: `... exec -T cp-backend npm run test:static`.
- Logo upload route (branding.js): verified end-to-end with the flow in this
  session — valid PNG → 200 and serves; disguised non-image → 400 and the current
  logo survives; >5 MB → 413, logo survives.

## Repo quirks

- Two `.gitignore`d write targets land in the working tree at runtime:
  `apps/cp-portal/backend/uploads/` and `node_modules/` under both bind mounts.
- Root-level files are restricted by the team's own rule to four files; the
  Base44 artifacts (`docker-compose.base44.yml`, `.base44/`, this file) are
  platform-mandated additions carried by the setup PR.
