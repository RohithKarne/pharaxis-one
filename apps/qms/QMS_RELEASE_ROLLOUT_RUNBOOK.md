# QMS Release Rollout Runbook

## Scope
- Workflow Inbox (`/workflow-inbox`)
- Notifications Center (`/notifications-center`)
- Notification read endpoints (`PATCH /platform/notifications/:id/read`, `PATCH /platform/notifications/read-all`)
- Shared enterprise data grid and collaboration panel foundations

## Feature Flags
Configure in `apps/qms/frontend/.env`:

```env
VITE_FEATURE_WORKFLOW_INBOX=true
VITE_FEATURE_NOTIFICATIONS_CENTER=true
VITE_FEATURE_COLLAB_PANEL=true
VITE_FEATURE_API_GET_CACHE=true
VITE_QMS_GET_CACHE_TTL_MS=15000
```

## Pre-Deploy Checks
1. Backend syntax:
```bash
node --check apps/qms/backend/src/routes/platform.js
```
2. Frontend build:
```bash
cd apps/qms/frontend && npm run build
```
3. Frontend smoke:
```bash
cd apps/qms/frontend && npm run smoke:workflow-notifications
```
4. Backend smoke:
```bash
cd apps/qms/backend && npm run smoke:workflow-notifications
```

## UAT Data Seeding
Seed realistic UAT volume through API contracts:

```bash
cd apps/qms/backend
QMS_UAT_CAPA_COUNT=30 QMS_UAT_DEVIATION_COUNT=30 QMS_UAT_CHANGE_COUNT=30 npm run db:seed:uat:volume
```

## Go-Live Sequence
1. Deploy backend.
2. Run backend smoke suite.
3. Deploy frontend.
4. Run frontend smoke suite.
5. Enable feature flags:
   - Start with `workflowInbox=true`, `notificationsCenter=true`
   - Keep `collabPanel=true` only after stakeholder validation
6. Confirm role-based access:
   - `viewer` can open inbox/notifications
   - `approver/qa_reviewer/admin/superadmin` can submit approvals from inbox

## Rollback Plan
Immediate rollback option without redeploy:
1. Set flags to `false`:
```env
VITE_FEATURE_WORKFLOW_INBOX=false
VITE_FEATURE_NOTIFICATIONS_CENTER=false
VITE_FEATURE_COLLAB_PANEL=false
```
2. Rebuild/redeploy frontend.

If backend issue persists:
1. Revert API traffic to previous backend release.
2. Keep frontend flags disabled until root cause closure.

## Post-Release Observability
- Monitor `qms_notifications` unread trend.
- Monitor failed email/outbox counts.
- Verify Workflow Inbox approval completion time and error rates.
- Run `smoke:workflow-notifications` at every deployment gate.
