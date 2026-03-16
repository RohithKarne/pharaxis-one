# MIMS-CP Portal — Codebase Map (Quick Orientation)

This file is a lightweight “memory” of the repo layout: where to run things, and where key logic lives.

## Repo Layout

- `mims/` — **MIMS** (Medical Information Management System): active app
- `cp-portal/` — **CP Portal** (Collaboration Portal): planned placeholder (README only right now)
- `SHARED_CONTEXT.md` — cross-AI shared project context
- `CLAUDE_LOG.md` / `CODEX_LOG.md` — change logs

## Run Locally (MIMS)

Backend (Express API + poller):
- `cd mims`
- `npm run dev` (or `npm start`)
- Serves on `http://127.0.0.1:3000` (see `mims/backend/server.js`)

Frontend (React + Vite, multi-page):
- `cd mims/frontend`
- `npm run dev`
- Runs on `http://localhost:5173`
- API calls to `/api/*` are proxied to `http://localhost:3000` (see `mims/frontend/vite.config.js`)
- Entry points: `index.html` (MIMS), `admin.html` (Admin Console), `content.html` (Content), `dv.html` (DV), `superadmin.html` (Superadmin)
- Superadmin is a separate module entry (permission-gated via `superadmin_console`)

## MIMS Backend (Node/Express)

Entrypoint:
- `mims/backend/server.js` — mounts routes and starts the email poller

Routes (mounted in `server.js`):
- `mims/backend/routes/auth.js` → `/api/auth/*`
- `mims/backend/routes/inbox.js` → `/api/inbox/*`
- `mims/backend/routes/admin/orgs.js` → `/api/admin/orgs/*`
- `mims/backend/routes/admin/config.js` → `/api/admin/*` (workflow/source/products/users/audit/esig/permissions/email-accounts)
- `mims/backend/routes/superadmin.js` → `/api/superadmin/*` (per-user module access)

Notes:
- Superadmin login is isolated (own localStorage prefix); Admin/Content/DV can auto-login from MIMS session.
- Default Superadmin user enforced at startup: `Superadmin` / `Manager@123`.

Auth:
- `mims/backend/middleware/auth.js` — `authenticate` (JWT) + `requireRole(...)`
- `mims/backend/controllers/authController.js` — login/register/me + writes `login_audit`
- `mims/backend/models/userModel.js` — `users` table queries

Database:
- `mims/backend/database/db.js` — opens SQLite DB file and initializes schema
- DB file location: `mims/backend/database/mims.db`

Key tables created/used:
- `users`, `sessions`
- Admin Console: `organisations`, `sites`, `workflow_states`, `source_types`, `products`
- Compliance: `audit_logs`, `login_audit`, `role_permissions`
- Email intake: `email_accounts`, `inquiries`, `inquiry_attachments`

Inbox data behavior:
- `GET /api/inbox` returns DB-backed `inquiries` if any exist; otherwise returns seed data
- `PATCH /api/inbox/:id` updates DB inquiry fields (status/lock/color) for DB-backed inbox items

Email ingestion:
- `mims/backend/services/emailPoller.js`
  - Uses `node-cron` to poll active inbound `email_accounts`
  - Connects via IMAP, parses bodies via `mailparser`, writes rows to `inquiries`
  - Optional attachment download stored under `mims/backend/storage/email_attachments/…`

## MIMS Frontend (React)

Entrypoints:
- `mims/frontend/src/modules/max/main.jsx` — MIMS bootstrapping + global CSS
- `mims/frontend/src/modules/max/App.jsx` — routes: `/login`, `/dashboard`, `/inbox`
- `mims/frontend/src/modules/superadmin/main.jsx` — Superadmin module entry

Pages:
- `mims/frontend/src/pages/LoginPage.jsx` — login flow (stores JWT)
- `mims/frontend/src/pages/InboxPage.jsx` — inbox UI (tabs, search, lock/color, split view, sync)
- `mims/frontend/src/pages/AdminConsolePage.jsx` — admin console UI (config + email accounts)

Notes:
- Inbox UI persists per-user state in `localStorage` and supports DB-backed syncing via `/api/inbox`.

## Legacy / Misc

- `mims/frontend-legacy/` — older static HTML/CSS/JS implementation (kept around for reference)
