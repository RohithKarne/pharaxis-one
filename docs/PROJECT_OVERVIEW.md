# Project Overview

## Mission

Pharaxis-One groups medical-affairs and platform products into a single engineering monorepo while operating them as separate sellable products in production.

## Product Domains

### 1) Medical Affairs
- **MIMS**: Core system for inquiry/case lifecycle, admin workflows, process telemetry, and operational reporting.
- **CP Portal**: Client/public interaction layer for submissions, documents, and content delivery.

### 2) Platform Services
- **AI-Agent**: Provider-integrated AI service layer (OpenAI/Claude/Gemini adapters) with usage/config administration.
- **Vault**: Regulated content management platform — Veeva Vault challenger for life sciences and healthcare.

### 3) Quality Management
- **QMS**: Sprint 1 baseline delivered (auth/superadmin, document control, CAPA, deviations, audits, validation, platform shared services).

## Current State Snapshot

| App | Status |
|---|---|
| MIMS | Active — Sprint 21 complete |
| CP Portal | Stable — hotfix only |
| AI-Agent | Sprint 1 complete |
| Vault | Sprint 1 in progress — primary build focus |
| QMS | Sprint 1 complete |

## Technical Baseline

- Backend stack: Node.js + Express
- Frontend stack: React + Vite (MIMS / CP Portal / AI-Agent / Vault), Vue + Vite + Tailwind (QMS)
- Database: MySQL (MIMS, CP Portal, AI-Agent, Vault) + PostgreSQL (QMS)
- CI: GitHub Actions
- Dependency management: npm + Dependabot

## Team and Process Artifacts

- `docs/TEAM_OPERATING_SOP.md` defines cross-functional operating rules, gates, and responsibilities.
- `docs/live-communication-use-and-format.md` defines live collaboration communication behavior.
- Domain memory SOP docs capture app-specific context and continuity.

## How to Navigate This Repo

1. Start with root `README.md`.
2. Read `docs/ARCHITECTURE.md` and `docs/DB_DETAILS.md`.
3. Move to app-specific folders under `apps/`.
4. Use `.github/workflows/ci-*.yml`, `.github/workflows/deploy-*.yml`, and `.github/workflows/release-*.yml` to understand the per-product delivery model.
