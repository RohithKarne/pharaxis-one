# GitHub Product Operations Setup

Effective date: 2026-05-19  
Owner: Engineering + Product Operations

## Purpose

This repo now operates as one engineering monorepo with five separately sold products:

- `mims`
- `qms`
- `vault`
- `cp-portal`
- `ai-agent`

The workflows are already split by app. This document defines the GitHub settings that remain useful now that Pharaxis apps are local-only.

## Local-Only Status

The AWS/EC2 Pharaxis host has been deleted. GitHub Actions must not attempt remote deployment, SSH, SCP, server-side `git pull`, `/var/www/pharaxis` publishing, or PM2 restarts.

Current GitHub usage:

- CI workflows validate app builds and tests.
- Release workflows produce validation artifacts from tagged releases.
- Label, PR, CODEOWNERS, Dependabot, and branch-protection automation remain active.
- Runtime checks happen on local services, not a GitHub-hosted deploy target.
- Manual deploy workflow runs fail intentionally so they cannot be mistaken for a completed deployment.

## Production Environments

Do not create or maintain production deploy environments unless a new hosting target is approved. The old environment names are retained here only as historical references.

| Environment | Product | Deploy workflow |
| --- | --- | --- |
| `mims-prod` | MIMS | `.github/workflows/deploy-mims.yml` |
| `qms-prod` | QMS | `.github/workflows/deploy-qms.yml` |
| `vault-prod` | Vault | `.github/workflows/deploy-vault.yml` |
| `cp-portal-prod` | CP Portal | `.github/workflows/deploy-cp-portal.yml` |
| `ai-agent-prod` | AI-Agent | `.github/workflows/deploy-ai-agent.yml` |

## Repo Automation Helpers

After `gh auth login` is working on an admin machine, these scripts can apply most of the setup:

- `./scripts/github/bootstrap-product-ops.sh`
- `./scripts/github/apply-main-branch-protection.sh`

## Minimum Environment Rules

If remote hosting is reintroduced later, apply these rules to each production environment before enabling deployment:

| Rule | Recommended setting |
| --- | --- |
| Required reviewers | At least 1 approver |
| Wait timer | Optional, 0 to 10 minutes depending on release discipline |
| Deployment branches | `main` only |
| Prevent self-review | Enabled for production if possible |
| Environment secrets | Scoped per product |

Note:

- Some private-repo environment protection features may depend on the current GitHub billing plan.
- If the API rejects `wait_timer`, `prevent_self_review`, or deployment branch policies, keep the environment itself and apply only the protections your plan supports.

## Secret Model

No EC2 deployment transport secrets are currently required. Remove or ignore old `EC2_*` environment secrets because there is no active AWS host.

### Retired deployment transport secrets

| Secret | Meaning |
| --- | --- |
| `EC2_HOST` | Retired target deployment host |
| `EC2_SSH_PORT` | Retired SSH port |
| `EC2_USER` | Retired SSH user |
| `EC2_SSH_KEY` | Retired private deploy key |

### Product runtime secrets to manage outside GitHub

These are not consumed directly by GitHub Actions today, but each product must still own them separately in local `.env` files or the next approved runtime environment.

| Product | Secret families to isolate |
| --- | --- |
| `mims` | MySQL, JWT, mail/worker, integrations, Redis if enabled |
| `qms` | PostgreSQL, JWT/auth, SMTP, Keycloak or future IdP |
| `vault` | MySQL, JWT, SMTP, S3/object storage |
| `cp-portal` | MySQL, admin auth, upload/storage, SMTP |
| `ai-agent` | MySQL, internal auth token, provider keys, JWT/admin secrets |

## Label Sync

Run `.github/workflows/sync-labels.yml` once after merge if labels do not already exist.

Expected labels:

- `app:mims`
- `app:qms`
- `app:vault`
- `app:cp-portal`
- `app:ai-agent`
- `area:github`
- `area:docs`
- `area:scripts`
- `area:ci`
- `type:bug`
- `type:enhancement`
- `dependencies`
- `frontend`
- `backend`

## PR Automation

The repo now includes:

- `.github/CODEOWNERS`
- `.github/labeler.yml`
- `.github/workflows/pr-labeler.yml`

Result:

- PRs are labeled automatically from changed paths.
- Product ownership can evolve without changing workflow logic.

## Release Tagging Standard

Do not use generic repo-wide tags like `v1.2.3` for product releases.

Use:

| Product | Tag pattern |
| --- | --- |
| `mims` | `mims-v*.*.*` |
| `qms` | `qms-v*.*.*` |
| `vault` | `vault-v*.*.*` |
| `cp-portal` | `cp-portal-v*.*.*` |
| `ai-agent` | `ai-agent-v*.*.*` |

## Manual Setup Checklist

- [ ] Run label sync once
- [ ] Confirm PR labeler has permission to write labels
- [ ] Start using app-specific release tags
- [ ] Apply branch protection with the exact required GitHub check names
- [ ] If branch protection is blocked by plan, either upgrade GitHub plan or apply the closest available UI protections manually
- [ ] Keep deploy workflows manual-only and intentionally failing until a new hosting target is approved
