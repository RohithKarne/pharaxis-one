# CP Portal

CP Portal is part of the Pharaxis-One monorepo and includes:

- Admin Console (configuration and operations)
- Public Portal (external user-facing experience)

## Current Status

Implemented and maintained in this repository. The app is not a placeholder.

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: MySQL (`cp_portal_dev` by default)

## Run Locally

### Backend

```bash
cd apps/medical-affairs/cp-portal/backend
npm install
npm run dev
```

### Frontend

```bash
cd apps/medical-affairs/cp-portal/frontend
npm install
npm run dev
```

## Database

Backend DB initialization is in:

- `apps/medical-affairs/cp-portal/backend/database/db.js`

Default connection behavior:

- Host: `localhost`
- Port: `3306`
- Database: `cp_portal_dev`
- User/password defaults exist in code for local development only.

See [DB details](../../../docs/DB_DETAILS.md) for cross-app setup.

## Integration Context

CP Portal is designed to integrate with MIMS workflows for submission and status exchange.
