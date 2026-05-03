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
cd apps/mims
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
npm run test:e2e
```

## Default Runtime

- Backend host: `127.0.0.1`
- Backend port: `3000`
- Health endpoint: `GET /api/health`

## Environment

Copy and configure:

- `.env.example` -> `.env`

## SSO And Microsoft 365 Authoring

- Google and Microsoft SSO are now configured per organisation in `Admin Console -> Access Configurations -> Auth Policy`.
- MIMS keeps internal users, org access, and roles as the source of authorization. SSO only authenticates and links external identities.
- Each organisation can choose its own login mode:
  - `Local login only`
  - `SSO only`
  - `Local + SSO`
- The login page is organisation-aware. Users select their organisation first, then MIMS shows the correct password and SSO options for that organisation.
- Microsoft 365 online authoring in this phase is a linked-authoring workflow:
  - create or store the editable document in OneDrive or SharePoint
  - save the Microsoft 365 edit URL in CM Documents
  - continue approvals, metadata, and content governance inside MIMS
- Required platform env vars:
  - `MIMS_FRONTEND_BASE_URL`
  - `MIMS_BACKEND_BASE_URL`
  - `MIMS_ALLOWED_FRONTEND_ORIGINS`
  - `SSO_CONFIG_ENCRYPTION_KEY`
- Provider secrets are stored encrypted per organisation in the database. The admin UI shows `Configured` or `Missing`, but never returns the raw client secret.

## Notes

This app contains significant domain modules and integration routes.
Review `backend/routes/` and `backend/services/` for module-level entry points.
