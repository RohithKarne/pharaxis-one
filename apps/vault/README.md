# Vault

Vault provides document/content vault foundations within Pharaxis-One.

## Scope

- Authentication and superadmin access flows
- Initial content and metadata schema foundations
- Storage-oriented backend service setup

## Tech Stack

- Backend: Node.js + Express
- Frontend: React + Vite
- Database: MySQL (`pharaxis_vault_dev` by default)

## Paths

- Backend entry: `backend/server.js`
- Frontend app: `frontend/`
- DB init/schema: `backend/database/db.js`

## Run Locally

```bash
cd apps/vault
npm install
npm run dev:all
```

Backend-only:

```bash
npm run dev
```

## Default Runtime

- Backend port: `5000`
- Health endpoint: `GET /api/health`

## Environment

Copy and configure:

- `.env.example` -> `.env`

Set storage and credential values (`S3_*`, `MINIO_ENDPOINT`, JWT secrets) before non-local deployments.
