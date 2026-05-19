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

The workflows are already split by app. This document defines the GitHub settings that must exist outside the repo so the split works correctly in production.

## Environments To Create

Create these GitHub environments in the repository settings:

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

Apply these rules to each production environment:

| Rule | Recommended setting |
| --- | --- |
| Required reviewers | At least 1 approver |
| Wait timer | Optional, 0 to 10 minutes depending on release discipline |
| Deployment branches | `main` only |
| Prevent self-review | Enabled for production if possible |
| Environment secrets | Scoped per product |

## Secret Model

If all products still deploy to the same EC2 host, the same host/user/key values can be repeated into each environment.  
Do not rely on repository-wide shared secrets long-term.

### Shared deployment transport secrets per environment

| Secret | Meaning |
| --- | --- |
| `EC2_HOST` | Target deployment host |
| `EC2_SSH_PORT` | SSH port, usually `22` |
| `EC2_USER` | SSH user |
| `EC2_SSH_KEY` | Private deploy key |

### Product runtime secrets to manage outside GitHub

These are not consumed directly by GitHub Actions today, but each product must still own them separately in its runtime environment.

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

- [ ] Create all five production environments
- [ ] Copy deploy transport secrets into each environment
- [ ] Decide approvers per product
- [ ] Enable deployment branch restriction to `main`
- [ ] Run label sync once
- [ ] Confirm PR labeler has permission to write labels
- [ ] Start using app-specific release tags
- [ ] Apply branch protection with the exact required GitHub check names
