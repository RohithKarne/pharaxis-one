# IEG Application (Sprint 1 + Sprint 2)

This directory contains the Sprint 1 and Sprint 2 implementation for IEG (Investigator Engagement & Grants).

## Scope Included

- Shared Foundation (Auth/RBAC/module access, task queue, workflow state machine, soft warnings, audit log, native DMS, native e-signature, notifications, compliance rules, approval matrix, disbursement model, evidence taxonomy)
- Grants module baseline lifecycle
- IIT module baseline lifecycle
- EAP module lifecycle (including emergency and safety/PV operations)
- External applicant portal endpoints for Grants, IIT, and EAP
- Integrations: DMS sync (Veeva/SharePoint pattern), ClinicalTrials.gov linkage, ERP export jobs
- Platform enhancements: IIT-to-Grant conversion, AI summaries and scoring, compliance overlay, analytics snapshot, policy rules/evaluation

## Stack

- Backend: Node.js + Express
- Database: MySQL (`DATABASE_URL`)
- Frontend: React + Vite

## Paths

- Backend entry: `backend/server.js`
- DB schema: `backend/database/schema.mysql.sql` + `backend/database/schema.mysql.sprint2.sql`
- Frontend entry: `frontend/src/App.jsx`

## Local Setup

1. Copy `.env.example` to `.env` in this folder and adjust values.
2. Install dependencies:
   - `npm install`
   - `cd frontend && npm install`
3. Run DB schema init: `npm run db:migrate`
4. Start app:
   - Backend only: `npm run dev`
   - Backend + Frontend: `npm run dev:all`

Default internal login after first boot:

- Email: `superadmin.ieg@pharaxis.one`
- Password: `Admin@123`

## Smoke Verification

Run backend, then execute:

- `npm run test:smoke:sprint1`
- `npm run test:gate:sprint1`
- `npm run test:smoke:sprint2`

`test:smoke:sprint1` verifies baseline runtime behavior.
`test:gate:sprint1` verifies full checkpoint and pending-item closure behavior including warnings, approval routing, exports, and negative-path checks.
`test:smoke:sprint2` verifies Sprint 2 EAP + integrations + platform features.

## Production Integration Wiring

All external integrations are credential-driven and can be toggled from `.env`.

- Veeva Vault:
  - set `VEEVA_INTEGRATION_ENABLED=true`
  - configure `VEEVA_BASE_URL` and either:
    - `VEEVA_ACCESS_TOKEN`, or
    - `VEEVA_TOKEN_URL`, `VEEVA_CLIENT_ID`, `VEEVA_CLIENT_SECRET`
- SharePoint (Microsoft Graph):
  - set `SHAREPOINT_INTEGRATION_ENABLED=true`
  - configure `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `SHAREPOINT_SITE_ID`, `SHAREPOINT_DRIVE_ID`
- ClinicalTrials.gov live snapshot:
  - set `CTG_LIVE_FETCH_ENABLED=true`
- ERP push delivery:
  - set `ERP_EXPORT_DELIVERY_ENABLED=true`
  - configure `ERP_EXPORT_ENDPOINT_URL` and `ERP_EXPORT_AUTH_TOKEN` (optional)
- LLM summaries/scoring:
  - set `LLM_LIVE_ENABLED=true`
  - configure `OPENAI_API_KEY` and optionally `OPENAI_MODEL`

When provider flags are `false`, the app runs in safe stub mode and keeps workflows operational.

### Shared Integration Setup Storage

- Internal users (`superadmin`/`admin`) can store integration setup centrally from UI.
- Backend API:
  - `GET /api/integrations/setup`
  - `PUT /api/integrations/setup`
- Secrets are stored encrypted at rest in `ieg_integration_settings.encrypted_secret`.
- Set `INTEGRATION_CONFIG_SECRET_KEY` in `.env` for production-grade encryption key management.
