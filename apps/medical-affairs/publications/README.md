# Publications Application (Sprint 1 Kickoff)

This directory contains the initial implementation baseline for Publications.
It now includes Sprint 1 foundation + next feature wave APIs for user lifecycle, publications workflow, milestones, checklist, reviews, document versioning, audit, and notifications.

## Stack

- Backend: Node.js + Express
- Database: MySQL (`pharaxis_publications_dev`) only
- Frontend: React + Vite

PostgreSQL is intentionally not used in this app.

## Paths

- Backend entry: `backend/server.js`
- DB schema: `backend/database/schema.mysql.sql`
- Frontend entry: `frontend/src/App.jsx`

## Local Setup

1. Copy `.env.example` to `.env` in this folder.
2. Install dependencies:
   - `npm install`
   - `cd frontend && npm install`
3. Run DB schema init: `npm run db:migrate`
4. Start app:
   - Backend only: `npm run dev`
   - Backend + Frontend: `npm run dev:all`

## Default Seed Login

- Email: `superadmin.publications@pharaxis.one`
- Password: `Admin@123`

## Health

- Backend health: `GET /api/health`

## Smoke Test

With backend running:

```bash
npm run test:smoke:sprint1
```

## Key API Groups (Current)

- Auth: `/api/auth/*`
- Admin users/tenants/invite/reset: `/api/admin/*`
- Publications workflow: `/api/publications/*`
- Dashboard summary: `/api/dashboard/summary`
- Audit trail: `/api/audit`
- Notifications + preferences: `/api/notifications/*`

## Overdue Milestone Notifications

- Background scan runs on startup and then every `MILESTONE_OVERDUE_SCAN_MINUTES` (default daily).
- Manual trigger endpoint for admin/superadmin sessions:
  - `POST /api/admin/jobs/overdue-milestones/run`
