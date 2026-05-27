# AI-Agent Production Runbook

> Status: Remote production hosting is currently inactive. Pharaxis apps are local-only as of 2026-05-27 because the AWS/EC2 host was deleted.

## Product Summary

| Item | Value |
| --- | --- |
| Product | AI-Agent |
| App path | `apps/ai-agent` |
| Deploy workflow | `.github/workflows/deploy-ai-agent.yml` manual disabled notice |
| Release workflow | `.github/workflows/release-ai-agent.yml` |
| GitHub environment | Retired until new hosting is approved |
| Runtime | Node/Express + MySQL + React/Vite |
| PM2 app | Retired remote process name: `ai-agent` |
| Frontend path | `/ai-agent/` |
| Health endpoint | `/ai-agent/api/v1/agent/health` |

## Local Verification

1. Confirm `AI-Agent CI` passed.
2. Run backend and frontend locally.
3. Confirm provider keys and internal auth token handling are valid in local `.env` files.

## Deploy

No active remote deploy exists. GitHub deploy workflows are manual-only disabled notices that fail intentionally and must not SSH, SCP, publish to `/var/www`, or restart PM2 until a new hosting target is approved.

## Local Runtime Verification

- `GET /ai-agent/api/v1/agent/health`
- frontend shell at `/ai-agent/`
- protected admin barrier
- provider/admin configuration route behavior

## Rollback

1. Revert the bad commit or switch back to the last good local branch.
2. Restore local MySQL only when data or migration issue exists.

## Data Recovery

- DB type: MySQL
- Backup requirement: daily + predeploy
- Provider configs and keys must be recoverable from secret management, not only DB state

## Observability Focus

- provider request failures
- rate-limit spikes
- admin/config route failures
- DB and PM2 availability
