# CP Portal

CP Portal is the medical-affairs external interaction layer in Pharaxis-One.
It includes both internal admin controls and public-facing portal APIs/UI.

## Scope

- Admin Console configuration workflows
- Public portal content and submission flows
- Notification and scheduled content publication support

## Tech Stack

- Backend: Node.js + Express
- Frontend: React + Vite
- Database: MySQL (`pharaxis_cp_portal_dev` by default)

## Paths

- Backend: `backend/`
- Frontend: `frontend/`
- DB init/schema: `backend/database/db.js`

## Run Locally

### Backend

```bash
cd apps/cp-portal/backend
npm install
npm run dev
```

### Frontend

```bash
cd apps/cp-portal/frontend
npm install
npm run dev
```

## Default Runtime

- Backend port: `4000` (`CP_PORT`)
- Frontend port: `5174`
- Health endpoint: `GET /api/health`

## API Areas

- `/api/admin/*` for authenticated admin operations
- `/api/portal/*` for public/portal-side flows

## Environment

Copy and configure:

- `backend/.env.example` -> `backend/.env`

## Cross-App Context

CP Portal is designed to operate alongside MIMS and can exchange submission/content context as part of wider product workflows.

See cross-repo docs:
- `docs/ARCHITECTURE.md`
- `docs/DB_DETAILS.md`
