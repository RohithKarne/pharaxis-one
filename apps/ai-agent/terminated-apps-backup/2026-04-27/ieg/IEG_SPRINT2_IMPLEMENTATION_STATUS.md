# IEG Sprint 2 Implementation Status

Date: 2026-04-11
Owner: Bala/Codex implementation pass

## Sprint 2 Technical Overview

Sprint 2 extends Sprint 1 with three streams:

1. EAP module lifecycle for internal and external users
2. Integration layer (DMS sync jobs, ClinicalTrials.gov, ERP export)
3. Platform services (cross-module conversion, AI assist, compliance overlay, analytics, policy engine)

## Feature Status (Scope #36-#48)

| # | Feature | Status | Delivery Notes |
|---|---------|--------|----------------|
| 36 | EAP full lifecycle | Completed | `ieg_eap_requests` and lifecycle endpoints added (`/api/eap/*`) + external submit route (`/api/external/eap/submit`) |
| 37 | EAP emergency pathway | Completed | Emergency activation endpoint with SLA event tracking (`/api/eap/requests/:id/emergency-activate`) |
| 38 | EAP safety/PV integration | Completed | Safety event capture + report generation (`/api/eap/requests/:id/safety-event`, `/api/eap/safety-events/:eventId/report`) |
| 39 | Veeva Vault integration pattern | Completed (adapter pattern/stubbed runtime) | DMS sync job orchestration with provider=`veeva` (`/api/integrations/dms/sync-jobs`) |
| 40 | SharePoint integration pattern | Completed (adapter pattern/stubbed runtime) | DMS sync job orchestration with provider=`sharepoint` (`/api/integrations/dms/sync-jobs`) |
| 41 | ClinicalTrials.gov linkage | Completed | Registry link + snapshots (`/api/integrations/clinicaltrials/link`, `/api/integrations/clinicaltrials/:iitProposalId`) |
| 42 | IIT -> Grant conversion | Completed | Cross-module conversion flow + audit continuity (`/api/platform/convert/iit-to-grant`) |
| 43 | AI summaries | Completed | AI summary request + persisted summary record (`/api/platform/ai/summary`) |
| 44 | AI recommendation scoring | Completed | Recommendation score + confidence + rationale (`/api/platform/ai/score`) |
| 45 | ERP disbursement export | Completed | ERP export job + log endpoints (`/api/integrations/erp/exports`) |
| 46 | Global compliance overlay | Completed | Overlay rule CRUD + evaluate (`/api/platform/compliance-overlay/*`) |
| 47 | Advanced analytics dashboard backend | Completed | Portfolio metric aggregation + snapshot (`/api/platform/analytics/*`) |
| 48 | Configurable termination/escalation policies | Completed | Policy rule + action config + policy event evaluation (`/api/platform/policies/*`) |

## Database and Runtime

- MySQL runtime maintained (`DATABASE_URL=mysql://.../pharaxis_ieg_dev`)
- Sprint 2 additive schema applied from `backend/database/schema.mysql.sprint2.sql`
- Server health indicates Sprint 2 (`/api/health` returns `"sprint":"sprint2"`)

## Credential-Based Live Connectors

- Veeva connector: OAuth2/access-token based live sync path via env
- SharePoint connector: Microsoft Graph client-credentials flow + drive upload
- ClinicalTrials.gov connector: optional live snapshot fetch toggle
- ERP connector: optional outbound delivery webhook for export payload
- LLM connector: OpenAI Responses API integration for live summary and scoring

## Verification Evidence

Executed and passed:

- `npm run test:smoke:sprint1`
- `npm run test:gate:sprint1`
- `npm run test:smoke:sprint2`
