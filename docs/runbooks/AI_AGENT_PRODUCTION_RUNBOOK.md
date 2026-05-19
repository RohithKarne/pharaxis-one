# AI-Agent Production Runbook

## Product Summary

| Item | Value |
| --- | --- |
| Product | AI-Agent |
| App path | `apps/ai-agent` |
| Deploy workflow | `.github/workflows/deploy-ai-agent.yml` |
| Release workflow | `.github/workflows/release-ai-agent.yml` |
| GitHub environment | `ai-agent-prod` |
| Runtime | Node/Express + MySQL + React/Vite |
| PM2 app | `ai-agent` |
| Frontend path | `/ai-agent/` |
| Health endpoint | `/ai-agent/api/v1/agent/health` |

## Predeploy

1. Confirm `AI-Agent CI` passed.
2. Confirm MySQL backup exists.
3. Confirm provider keys and internal auth token handling are valid.

## Deploy

1. Merge to `main`.
2. GitHub runs `.github/workflows/deploy-ai-agent.yml`.
3. Approve `ai-agent-prod` if configured.

## Postdeploy Verification

- `GET /ai-agent/api/v1/agent/health`
- frontend shell at `/ai-agent/`
- protected admin barrier
- provider/admin configuration route behavior

## Rollback

1. Revert or redeploy last good commit.
2. Restore MySQL only when data or migration issue exists.

## Data Recovery

- DB type: MySQL
- Backup requirement: daily + predeploy
- Provider configs and keys must be recoverable from secret management, not only DB state

## Observability Focus

- provider request failures
- rate-limit spikes
- admin/config route failures
- DB and PM2 availability
