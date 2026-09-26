# CP Portal Production Runbook

> **Status, 2026-09-24: local only.** Both products run on a developer machine and
> nowhere else. Every deployment pipeline, container image and server template was
> removed — including the Google Cloud pipeline that had been live for CP Portal.
> A cloud will be chosen later and the path built for it then. See
> `TEAM_OPERATING_SOP.md` §38.12. **This runbook is the future bar, not a
> description of anything running today.**

## Product Summary

| Item | Value |
| --- | --- |
| Product | CP Portal |
| App path | `apps/cp-portal` |
| Deploy workflow | **None.** Removed 2026-09-24 (§38.12) |
| Release workflow | `.github/workflows/release-cp-portal.yml` |
| GitHub environment | Retired until new hosting is approved |
| Runtime | Node/Express + MySQL + React/Vite |
| Process manager | **None.** The template was removed 2026-09-24 (§38.12) |
| Frontend path | `/cp-portal/` |
| Health endpoint | `/cp-portal/api/health` |

## Local Verification

1. Confirm `CP Portal CI` passed.
2. Run backend and frontend locally.
3. Confirm admin/public portal behavior is understood for the release.

## Deploy

**No deploy workflow exists at all** — the disabled notices were removed along with the live Google Cloud pipeline on 2026-09-24. Nothing in GitHub Actions may deploy, SSH, publish to a server or restart a process manager until a hosting target is chosen and agreed with Rohith.

## Local Runtime Verification

- `GET /cp-portal/api/health`
- frontend shell at `/cp-portal/`
- protected barrier behavior
- admin login or auth me route
- public portal landing path

## Rollback

1. Revert the bad commit or switch back to the last good local branch.
2. Restore local MySQL only if needed for data or migration fault.

## Data Recovery

- DB type: MySQL
- Backup requirement: daily + predeploy
- Upload persistence should be treated as production data

## Observability Focus

- admin auth failures
- public portal errors
- scheduler behavior after restart
- upload/storage health
