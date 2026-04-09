# MIMS (Medical Information Management System)

MIMS is the core medical-affairs operations system in Pharaxis-One.

## Scope

- Case lifecycle management
- Admin setup and controls
- Inbox/workflow operations
- Reporting and integration endpoints

## Tech Stack

- Backend: Node.js + Express
- Frontend: React + Vite
- Database: MySQL (`pharaxis_mims_dev` by default)

## Paths

- Backend entry: `backend/server.js`
- Frontend app: `frontend/`
- DB init/schema: `backend/database/db.js`

## Run Locally

```bash
cd apps/medical-affairs/mims
npm install
npm run dev:all
```

Backend-only:

```bash
npm run dev
```

## Tests

```bash
npm run test
npm run test:smoke:case-regression
npm run test:e2e
```

## Default Runtime

- Backend host: `127.0.0.1`
- Backend port: `3000`
- Health endpoint: `GET /api/health`

## Environment

Copy and configure:

- `.env.example` -> `.env`

## Notes

This app contains significant domain modules and integration routes.
Review `backend/routes/` and `backend/services/` for module-level entry points.
