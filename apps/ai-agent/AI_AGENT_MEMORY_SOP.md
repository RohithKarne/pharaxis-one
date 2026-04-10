# AI-Agent — Memory SOP
> Owner: Rohith (CPO)
> Created: 2026-04-09
> Status: Sprint 1 — In Planning

---

## App Identity

- **App name:** Pharaxis AI-Agent
- **Type:** Core Pharaxis Platform Service — standalone, not under any vertical
- **Folder:** `apps/ai-agent/`
- **Backend port:** 6000
- **Frontend port:** 5175
- **DB:** `pharaxis_ai_agent_dev`

---

## Strategic Context

AI-Agent is a provider-agnostic AI service designed to power all Pharaxis suite applications.
Clients bring their own API key (BYOK) — Pharaxis bears zero token cost.
AI is an opt-in feature enabled at contract level.

**Phase roadmap:**
- Phase 1: Build — CP Portal integration, clean standalone architecture
- Phase 2: Optimise — token reduction, caching, chunking, prompt templates
- Phase 3: External licensing — sell AI-Agent service to external applications

---

## Architecture Principles (non-negotiable)

1. **Fully standalone** — no import dependency on MIMS, CP Portal, Vault, QMS, or Safety internals
2. **Provider-agnostic** — all apps call the same endpoint regardless of client's chosen provider
3. **BYOK** — client enters their own OpenAI / Claude / Gemini API key in admin config
4. **Phase 2 hooks designed in** — cache, chunker, templateStore stubs exist from Sprint 1
5. **Key security** — AES-256 encrypted at rest, decrypted in memory only, never in logs or responses

---

## Sprint History

### Sprint 1 — CLOSED ✅ (2026-04-09)
- Goal: Service scaffolding + DB schema + provider adapter layer + core query endpoint + CP Portal semantic document search + admin key config + superadmin portal
- Scope: `apps/ai-agent/SPRINT1_SCOPE.md`
- Effort: 17.5 days | Duration: 3 weeks
- Gate 1: Approved
- Gate 2: Approved
- QA: 31/31 tests passed (21 automated + 10 remaining suites) — 0 failures
- Bug caught in QA: CP Portal fetch bug fixed (Node 22 `fetch` → `http.request`)
- Final Sign-off: Approved by Rohith (CPO) — 2026-04-09
- First integration: CP Portal — semantic document search

---

## Key Files

| File | Purpose |
|------|---------|
| `apps/ai-agent/backend/server.js` | Entry point, port 6000 |
| `apps/ai-agent/backend/database/db.js` | Schema — 3 tables |
| `apps/ai-agent/backend/middleware/keyResolver.js` | AES-256 decrypt in memory |
| `apps/ai-agent/backend/adapters/index.js` | Provider adapter factory |
| `apps/ai-agent/backend/adapters/openaiAdapter.js` | OpenAI implementation |
| `apps/ai-agent/backend/adapters/claudeAdapter.js` | Claude implementation |
| `apps/ai-agent/backend/adapters/geminiAdapter.js` | Gemini implementation |
| `apps/ai-agent/backend/core/promptBuilder.js` | Prompt construction per query_type |
| `apps/ai-agent/backend/core/responseFormatter.js` | Standard response shape |
| `apps/ai-agent/backend/routes/agent.js` | POST /api/v1/agent/query |
| `apps/ai-agent/backend/routes/admin/apiKeys.js` | CRUD for org API key config |
| `apps/ai-agent/backend/optimisation/` | Phase 2 stubs — cache, chunker, templateStore |
| `apps/ai-agent/frontend/src/api/agentClient.js` | Shared client for suite apps |
| `apps/ai-agent/frontend/src/components/AgentWidget/` | Embeddable query widget |
| `apps/ai-agent/frontend/src/components/AdminPanel/` | Admin config UI |
| `apps/ai-agent/SPRINT1_SCOPE.md` | Full Sprint 1 scope |
| `apps/ai-agent/backend/middleware/internalAuth.js` | Internal service-to-service token auth |
| `apps/ai-agent/backend/routes/internal/aiConfig.js` | Internal routes for CP Portal proxy calls |
| `apps/ai-agent/backend/routes/admin/superadmin.js` | Platform-wide superadmin routes |
| `apps/ai-agent/frontend/src/components/SuperadminLayout/index.jsx` | Dark sidebar layout |
| `apps/ai-agent/frontend/src/pages/DashboardPage/index.jsx` | Superadmin dashboard |
| `apps/ai-agent/frontend/src/pages/OrgsPage/index.jsx` | Org management + enable/disable |
| `apps/ai-agent/frontend/src/pages/UsagePage/index.jsx` | Platform-wide usage log |
| `apps/medical-affairs/cp-portal/backend/routes/admin/aiProxy.js` | CP Portal → AI-Agent proxy |
| `apps/medical-affairs/cp-portal/frontend/src/admin/pages/AIConfigPage.jsx` | CP Portal AI config admin page |

---

## DB Tables

| Table | Purpose |
|-------|---------|
| `ai_agent_org_config` | Encrypted API key + provider per org. One row per org. |
| `ai_agent_usage_log` | Every query logged — tokens in/out, latency, status |
| `ai_agent_prompt_templates` | Phase 2 — prompt template registry (schema defined Sprint 1) |

---

## Supported Providers (Sprint 1)

| Provider | Adapter | Model |
|----------|---------|-------|
| OpenAI | `openaiAdapter.js` | gpt-4o |
| Claude | `claudeAdapter.js` | claude-sonnet-4-6 |
| Gemini | `geminiAdapter.js` | gemini-1.5-pro |

---

## Supported Query Types (Sprint 1)

| Query Type | Used By |
|-----------|---------|
| `document_search` | CP Portal — Sprint 1 |
| `faq_draft` | CP Portal — Sprint 2 |
| `content_expiry_suggestion` | CP Portal — Sprint 2 |

---

## App Integration Map

| App | Use Cases | Sprint |
|-----|-----------|--------|
| CP Portal | Semantic document search, FAQ auto-draft, content expiry suggestion | Sprint 1–2 |
| MIMS | Case triage, case narrative draft, document suggestion | Future |
| Vault | Semantic document search, regulatory reference lookup | Future |
| QMS | Pattern detection, audit checklist, CAPA suggestion | Future |
| Safety | Signal detection, ICSR narrative draft, literature scan | Future |
