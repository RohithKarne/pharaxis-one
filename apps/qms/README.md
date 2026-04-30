# Pharaxis QMS

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

4. Seed default org + users (idempotent):
```bash
npm run db:seed:dev
```

5. Start backend:
```bash
npm run dev
```

6. Run post-deploy smoke (backend + auth + superadmin + frontend login page):
```bash
npm run smoke:postdeploy
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

Create frontend env file:
```bash
cd apps/qms/frontend
cp .env.example .env
```

## Access URLs

- Local user login: `http://127.0.0.1:3146/qms/login`
- Local superadmin login: `http://127.0.0.1:3146/qms/superadmin/login`
- Backend API base: `http://127.0.0.1:3145/api`

For server deployment, replace `127.0.0.1` with your host/IP:

- `http://<SERVER_HOST>:3146/qms/login`
- `http://<SERVER_HOST>:3146/qms/superadmin/login`
- `http://<SERVER_HOST>:3145/api`

Server env notes:
- Backend CORS allow-list: `CORS_ALLOWED_ORIGINS` (comma-separated origins)
- Optional wildcard CORS (non-production only): `CORS_ALLOW_ALL=true`
- Frontend API target override: `VITE_QMS_API_BASE=http://<SERVER_HOST>:3145/api`

## Current Auth Login Payloads (JWT Path)

`POST /api/auth/login`
```json
{
  "userId": "admin",
  "password": "Admin@123",
  "orgCode": "PHA_DEV"
}
```

`POST /api/auth/superadmin/login`
```json
{
  "userId": "Superadmin",
  "password": "Manager@123"
}
```

`GET /api/auth/orgs`
```json
{
  "orgs": [
    { "orgCode": "PHA_DEV", "orgName": "Pharaxis Development" }
  ]
}
```

## Default Seeded Credentials (`npm run db:seed:dev`)

| Surface | User ID | Email | Password | Org Code |
|---|---|---|---|---|
| Superadmin | `superadmin` | `superadmin` (default seed identifier) | `Manager@123` | n/a |
| User Admin | `admin` | `admin@pharaxis.local` | `Admin@123` | `PHA_DEV` |
| User Author | `author` | `author@pharaxis.local` | `Author@123` | `PHA_DEV` |
| User QA Reviewer | `qareviewer` | `qareviewer@pharaxis.local` | `QaReviewer@123` | `PHA_DEV` |
| User Approver | `approver` | `approver@pharaxis.local` | `Approver@123` | `PHA_DEV` |
| User Viewer | `viewer` | `viewer@pharaxis.local` | `Viewer@123` | `PHA_DEV` |

Notes:
- User login accepts either full email or local-part as `userId` (for example `admin` or `admin@pharaxis.local`).
- Superadmin login also accepts full email or local-part as `userId`.

## Notes

- Keycloak auth is implemented as middleware foundation and requires environment configuration.
- Superadmin module APIs are available in backend:
  - `GET /api/superadmin/orgs`
  - `POST /api/superadmin/orgs`
  - `PATCH /api/superadmin/orgs/:orgId/status`
  - `GET /api/superadmin/users`
  - `GET /api/superadmin/users/security-groups/:orgId`
  - `POST /api/superadmin/users`
  - `PATCH /api/superadmin/users/:userId/security-groups`
  - `PATCH /api/superadmin/users/:userId/status`
  - `GET /api/superadmin/billing/:orgId`
  - `PUT /api/superadmin/billing/:orgId`
  - `GET /api/superadmin/reports/billing-summary`
  - `GET /api/superadmin/reports/login-audit`
  - `GET /api/superadmin/platform/email-config`
  - `PUT /api/superadmin/platform/email-config`
  - `GET /api/superadmin/platform/readiness`
  - `GET /api/superadmin/platform/upload-policy/:orgId`
  - `PUT /api/superadmin/platform/upload-policy/:orgId`
- Payment collection is intentionally not implemented in Sprint 1 scope.
- Document Control baseline APIs are available in backend:
  - `POST /api/document-control/documents`
  - `POST /api/document-control/documents/:documentId/revisions`
  - `POST /api/document-control/documents/:documentId/versions/:versionId/transition`
  - `POST /api/document-control/documents/:documentId/versions/:versionId/acknowledge`
  - `POST /api/document-control/documents/:documentId/versions/:versionId/export`
  - `PUT /api/document-control/documents/:documentId/access-policies`
  - `POST /api/document-control/documents/:documentId/reviews/:reviewId/complete`
  - `GET /api/document-control/documents`
  - `GET /api/document-control/documents/:documentId`
  - `GET /api/document-control/documents/:documentId/versions`
  - `GET /api/document-control/documents/:documentId/timeline`
  - `GET /api/document-control/documents/:documentId/reviews`
  - `GET /api/document-control/documents/:documentId/versions/:versionId/controlled-preview`
- CAPA APIs:
  - `POST /api/capa`
  - `PATCH /api/capa/:capaId`
  - `POST /api/capa/:capaId/submit`
  - `POST /api/capa/:capaId/triage`
  - `POST /api/capa/:capaId/rca/5why`
  - `POST /api/capa/:capaId/rca/fishbone`
  - `POST /api/capa/:capaId/actions`
  - `PATCH /api/capa/:capaId/actions/:actionId`
  - `POST /api/capa/:capaId/approve`
  - `POST /api/capa/:capaId/effectiveness`
  - `POST /api/capa/:capaId/close`
  - `POST /api/capa/:capaId/reopen`
  - `GET /api/capa/:capaId`
  - `GET /api/capa/:capaId/timeline`
  - `GET /api/capa`
- Deviation APIs:
  - `POST /api/deviations`
  - `PATCH /api/deviations/:deviationId`
  - `POST /api/deviations/:deviationId/triage`
  - `POST /api/deviations/:deviationId/containment`
  - `POST /api/deviations/:deviationId/investigation`
  - `POST /api/deviations/:deviationId/qa-review`
  - `POST /api/deviations/:deviationId/link-capa`
  - `POST /api/deviations/:deviationId/close`
  - `POST /api/deviations/:deviationId/reopen`
  - `GET /api/deviations/:deviationId`
  - `GET /api/deviations/:deviationId/timeline`
  - `GET /api/deviations`
- Audit + Binder APIs:
  - `POST /api/audits`
  - `POST /api/audits/:auditId/start`
  - `POST /api/audits/:auditId/findings`
  - `POST /api/audits/:auditId/findings/:findingId/link-capa`
  - `POST /api/audits/:auditId/findings/:findingId/respond`
  - `POST /api/audits/:auditId/findings/:findingId/close`
  - `POST /api/audits/:auditId/respond/:findingId`
  - `POST /api/audits/:auditId/close`
  - `POST /api/audits/binder/generate`
  - `GET /api/audits/binder/jobs`
  - `GET /api/audits/:auditId`
  - `GET /api/audits/:auditId/timeline`
  - `GET /api/audits`
- Validation Services APIs:
  - `POST /api/validation/systems`
  - `POST /api/validation/systems/:systemId/requirements`
  - `POST /api/validation/systems/:systemId/traceability`
  - `POST /api/validation/systems/:systemId/plans`
  - `POST /api/validation/plans/:planId/protocols`
  - `POST /api/validation/protocols/:protocolId/scripts`
  - `PATCH /api/validation/steps/:stepId/execute`
  - `POST /api/validation/systems/:systemId/revalidation-flag`
  - `POST /api/validation/systems/:systemId/reviews/:reviewId/complete`
  - `POST /api/validation/systems/:systemId/complete`
  - `GET /api/validation/systems/:systemId`
  - `GET /api/validation/systems/:systemId/timeline`
  - `POST /api/validation/reports/:systemId/generate-vsr`
  - `GET /api/validation/systems`
  - `GET /api/validation/deviations`
- Change Control APIs:
  - `POST /api/change-control`
  - `POST /api/change-control/:changeId/impact-assessment`
  - `POST /api/change-control/:changeId/cab-review`
  - `POST /api/change-control/:changeId/approvals`
  - `POST /api/change-control/:changeId/implementation`
  - `POST /api/change-control/:changeId/close`
  - `POST /api/change-control/:changeId/reopen`
  - `GET /api/change-control/:changeId`
  - `GET /api/change-control/:changeId/timeline`
  - `GET /api/change-control`
- Complaints APIs:
  - `POST /api/complaints`
  - `PATCH /api/complaints/:complaintId`
  - `POST /api/complaints/:complaintId/link-capa`
  - `GET /api/complaints/:complaintId`
  - `GET /api/complaints`
- Nonconformance APIs:
  - `POST /api/nonconformance`
  - `PATCH /api/nonconformance/:recordId`
  - `POST /api/nonconformance/:recordId/link-capa`
  - `GET /api/nonconformance/:recordId`
  - `GET /api/nonconformance`
- Supplier Quality APIs:
  - `POST /api/supplier-quality/suppliers`
  - `PATCH /api/supplier-quality/suppliers/:supplierId`
  - `POST /api/supplier-quality/suppliers/:supplierId/audits`
  - `POST /api/supplier-quality/suppliers/:supplierId/scars`
  - `PATCH /api/supplier-quality/scars/:scarId`
  - `GET /api/supplier-quality`
- Risk Management APIs:
  - `POST /api/risk-management/register`
  - `PATCH /api/risk-management/register/:riskId`
  - `POST /api/risk-management/register/:riskId/review`
  - `GET /api/risk-management/register/:riskId`
  - `GET /api/risk-management`
- Management Review APIs:
  - `POST /api/management-review`
  - `PATCH /api/management-review/:reviewId`
  - `POST /api/management-review/:reviewId/actions`
  - `PATCH /api/management-review/actions/:actionId`
  - `GET /api/management-review/:reviewId`
  - `GET /api/management-review`
- Intelligence APIs:
  - `GET /api/intelligence/event-hub`
  - `GET /api/intelligence/quality-insights`
  - `GET /api/intelligence/quality-insights/cached`
- Integrations APIs:
  - `PUT /api/integrations/adapters/:adapterKey`
  - `POST /api/integrations/adapters/:adapterKey/sync`
  - `PATCH /api/integrations/jobs/:jobId`
  - `GET /api/integrations`
- Platform shared services APIs:
  - `POST /api/platform/notifications/in-app`
  - `POST /api/platform/notifications/email`
  - `POST /api/platform/notifications/email/:emailId/retry`
  - `POST /api/platform/notifications/email/:emailId/fail`
  - `POST /api/platform/notifications/email/:emailId/mark-sent`
  - `POST /api/platform/events/outbox`
  - `POST /api/platform/events/outbox/:eventId/publish`
  - `POST /api/platform/events/outbox/:eventId/retry`
  - `POST /api/platform/events/outbox/:eventId/fail`
  - `GET /api/platform/trace-links`
  - `POST /api/platform/training/catalog`
  - `POST /api/platform/training/assignments`
  - `POST /api/platform/training/assignments/:assignmentId/complete`
  - `GET /api/platform/training/catalog`
  - `GET /api/platform/training/assignments`
  - `GET /api/platform/notifications`
  - `POST /api/platform/alerts/run`
- Frontend routes:
  - `/login` (user login)
  - `/superadmin/login` (separate superadmin login)
  - `/dashboard`
  - `/document-control`
  - `/capa`
  - `/deviations`
  - `/event-hub`
  - `/complaints`
  - `/nonconformance`
  - `/audits`
  - `/validation`
  - `/change-control`
  - `/supplier-quality`
  - `/risk-management`
  - `/training-management`
  - `/management-review`
  - `/quality-insights`
  - `/integrations`
  - `/superadmin`
