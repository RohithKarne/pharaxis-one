# Sprint 14 G13 Runbook

Date: 2026-04-07

## Scope Delivered

1. API versioning real contract
- `/api/version`
- `/api/v1/health`
- `/api/v1/version`
- Contract headers on all `/api/v1/*` responses:
  - `X-API-Version: 1`
  - `X-API-Latest-Version: v1`
  - `X-API-Contract-Date: 2026-04-07`
  - `X-API-Supported-Versions: v1`

2. Log aggregation endpoint
- `GET /api/admin/service-logs/aggregation`
- `GET /api/v1/admin/service-logs/aggregation`

Supported query filters:
- `source`
- `status`
- `service_type`
- `date_from`
- `date_to`
- `trend_days` (1..60, default 14)

Response includes:
- `summary.total`
- `summary.by_status`
- `summary.failure_rate_percent`
- `top_sources`
- `by_service_type`
- `trend_daily`

3. Client-facing demo readiness support
- Repeatable smoke: `backend/tests/smoke-sprint14-g13.js`
- NPM commands:
  - `npm run test:smoke:sprint14:g13`
  - `npm run demo:preflight`
  - `npm run test:sprint14:full`

## Execution

From `apps/medical-affairs/mims`:

```bash
npm run test:smoke:sprint14:g13
```

For full Sprint 14 smoke chain:

```bash
npm run test:sprint14:full
```

## Demo Environment Checklist

1. MySQL reachable (`pharaxis_mims_dev`).
2. Backend starts on assigned demo port.
3. `/api/version` returns latest `v1`.
4. `/api/v1/health` returns `version: v1` and version headers.
5. Admin login succeeds and `/api/v1/reports/system-health` returns 200.
6. `/api/v1/admin/service-logs/aggregation` returns summary payload.
