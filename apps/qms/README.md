# Pharaxis QMS (Sprint 1 Bootstrap)

This app is now bootstrapped with:
- Node.js + Express backend
- Vue + Tailwind frontend
- PostgreSQL migrations with RLS policies
- JWT + Keycloak auth foundation
- Hash-chain audit function baseline

## Structure

- `backend/`
- `frontend/`

## Backend Quick Start

1. Copy env file:
```bash
cd apps/qms/backend
cp .env.example .env
```

2. Install dependencies:
```bash
npm install
```

3. Run DB migrations:
```bash
npm run db:migrate
```

4. Start backend:
```bash
npm run dev
```

Default backend port: `3145`

Health check:
```bash
curl -s http://127.0.0.1:3145/api/health
```

## Frontend Quick Start

```bash
cd apps/qms/frontend
npm install
npm run dev
```

Default frontend port: `3146`

## Current Auth Login Payload (JWT Path)

`POST /api/auth/login`
```json
{
  "email": "admin@pharaxis.local",
  "password": "Admin@123",
  "orgCode": "PHA_DEV"
}
```

## Notes

- Keycloak auth is implemented as middleware foundation and requires environment configuration.
- Superadmin module APIs are available in backend:
  - `GET /api/superadmin/orgs`
  - `POST /api/superadmin/orgs`
  - `PATCH /api/superadmin/orgs/:orgId/status`
  - `GET /api/superadmin/users`
  - `POST /api/superadmin/users`
  - `PATCH /api/superadmin/users/:userId/status`
  - `GET /api/superadmin/billing/:orgId`
  - `PUT /api/superadmin/billing/:orgId`
  - `GET /api/superadmin/reports/billing-summary`
- Payment collection is intentionally not implemented in Sprint 1 scope.
- Document Control baseline APIs are available in backend:
  - `POST /api/document-control/documents`
  - `POST /api/document-control/documents/:documentId/revisions`
  - `POST /api/document-control/documents/:documentId/versions/:versionId/transition`
  - `POST /api/document-control/documents/:documentId/versions/:versionId/acknowledge`
  - `GET /api/document-control/documents`
  - `GET /api/document-control/documents/:documentId`
  - `GET /api/document-control/documents/:documentId/versions/:versionId/controlled-preview`
- CAPA APIs:
  - `POST /api/capa`
  - `POST /api/capa/:capaId/actions`
  - `PATCH /api/capa/:capaId/actions/:actionId/status`
  - `POST /api/capa/:capaId/effectiveness`
  - `POST /api/capa/:capaId/close`
  - `GET /api/capa`
- Deviation APIs:
  - `POST /api/deviations`
  - `POST /api/deviations/:deviationId/containment`
  - `POST /api/deviations/:deviationId/investigation`
  - `POST /api/deviations/:deviationId/link-capa`
  - `POST /api/deviations/:deviationId/close`
  - `GET /api/deviations`
- Audit + Binder APIs:
  - `POST /api/audits`
  - `POST /api/audits/:auditId/findings`
  - `POST /api/audits/:auditId/findings/:findingId/link-capa`
  - `POST /api/audits/:auditId/respond/:findingId`
  - `POST /api/audits/binder/generate`
  - `GET /api/audits/binder/jobs`
  - `GET /api/audits`
- Validation Services APIs:
  - `POST /api/validation/systems`
  - `POST /api/validation/systems/:systemId/plans`
  - `POST /api/validation/plans/:planId/protocols`
  - `POST /api/validation/protocols/:protocolId/scripts`
  - `PATCH /api/validation/steps/:stepId/execute`
  - `POST /api/validation/systems/:systemId/revalidation-flag`
  - `POST /api/validation/reports/:systemId/generate-vsr`
  - `GET /api/validation/systems`
  - `GET /api/validation/deviations`
- Platform shared services APIs:
  - `POST /api/platform/notifications/in-app`
  - `POST /api/platform/notifications/email`
  - `POST /api/platform/events/outbox`
  - `POST /api/platform/events/outbox/:eventId/publish`
  - `GET /api/platform/notifications`
  - `POST /api/platform/alerts/run`
- Frontend workspace includes module routes:
  - `/document-control`
  - `/capa`
  - `/deviations`
  - `/audits`
  - `/validation`
  - `/superadmin`
