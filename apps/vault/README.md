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

Phase 3 seed + smoke:

```bash
npm run seed:phase3
npm run test:smoke:phase3
npm run test:smoke:phase4
```

## Default Runtime

- Backend port: `5100`
- Health endpoint: `GET /api/health`

## Environment

Copy and configure:

- `.env.example` -> `.env`

Set storage and credential values (`S3_*`, `MINIO_ENDPOINT`, JWT secrets) before non-local deployments.

## Phase 3 Operations

- UAT checklist: `VAULT_PHASE3_UAT_CHECKLIST.md`
- Request tracing: every API response includes `X-Request-Id`
- Auth protection:
  - `/api/auth/login` rate-limited
  - `/api/superadmin/login` rate-limited
  - global `/api` burst limiter enabled

## Phase 4 Workflow Ops

- New admin workflow APIs:
  - `GET /api/workflows/admin/insights`
  - `GET /api/workflows/admin/notifications`
  - `POST /api/admin/workflows/test-email`
- New task action:
  - `POST /api/workflows/tasks/:id/delegate`
- New scheduler:
  - hourly workflow reminder emitter (`due_soon` and `overdue`) persisted to `workflow_task_notifications`
- Delivery channels:
  - assignee email via SMTP
  - active content-channel webhooks (`content_channels.webhook_url`)
- Delivery tracking:
  - `email_delivery_status`, `webhook_delivery_status`, `delivery_error`, `delivered_at` stored per notification

## Phase 5 Workflow Analytics Ops

- New analytics APIs:
  - `GET /api/workflows/admin/analytics?window_days=30`
  - `GET /api/workflows/admin/analytics/export.csv?window_days=30`
- Analytics dimensions:
  - workflow KPI pack (completion %, SLA breach %, median/p95 completion time)
  - bottleneck step ranking (pending/overdue pressure and duration)
  - assignee workload and overdue-risk table
  - notification delivery reliability totals
- Frontend:
  - Admin workflow page includes analytics window selector and CSV export action

## Phase 6 Security + Integration Ops

- New security APIs:
  - `GET /api/admin/security/auth-policy`
  - `PUT /api/admin/security/auth-policy`
  - `GET /api/workflows/admin/rbac-policy`
  - `PUT /api/workflows/admin/rbac-policy`
- New connector APIs:
  - `GET /api/admin/integrations/connectors`
  - `POST /api/admin/integrations/connectors`
  - `PATCH /api/admin/integrations/connectors/:id`
  - `POST /api/admin/integrations/connectors/:id/test`
- Auth additions:
  - optional MFA challenge flow in `/api/auth/login` and `/api/superadmin/login` when policy requires MFA
  - SSO discovery endpoint: `GET /api/auth/sso/discovery/:orgSlug`
- Frontend:
  - `/admin/security` for auth policy and workflow RBAC matrix
  - `/admin/integrations` for connector registry and health tests
