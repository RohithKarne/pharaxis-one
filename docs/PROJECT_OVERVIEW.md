# Project Overview

## Mission

Pharaxis-One groups medical-affairs and platform products into a single operational monorepo so teams can ship faster with shared standards, CI visibility, and consistent architecture practices.

## Product Domains

### 1) Medical Affairs
- **MIMS**: Core system for inquiry/case lifecycle, admin workflows, process telemetry, and operational reporting.
- **CP Portal**: Client/public interaction layer for submissions, documents, and content delivery.

### 2) Platform Services
- **AI-Agent**: Provider-integrated AI service layer (OpenAI/Claude/Gemini adapters) with usage/config administration.
- **Vault**: Document/content vault foundations with authentication and superadmin controls.

### 3) Quality & Safety
- **QMS**: Sprint 1 baseline delivered (auth/superadmin, document control, CAPA, deviations, audits, validation, platform shared services).
- **Safety**: Sprint 1 and Sprint 2 delivered (admin/config foundations + case management, regulatory workflows, narratives, listedness/expectedness).

## Current State Snapshot

| Area | Status |
|---|---|
| MIMS | Active and extensive implementation |
| CP Portal | Implemented and maintained |
| AI-Agent | Implemented and evolving |
| Vault | Implemented foundational modules |
| QMS | Sprint 1 completed and active in repo |
| Safety | Sprint 1 + Sprint 2 completed and active in repo |

## Technical Baseline

- Backend stack: Node.js + Express
- Frontend stack: React + Vite (MIMS/CP Portal/AI-Agent/Vault/Safety), Vue + Vite + Tailwind (QMS)
- Database: MySQL + PostgreSQL (service-specific DB per app)
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
4. Use `.github/workflows/ci.yml` to understand CI quality gates.
