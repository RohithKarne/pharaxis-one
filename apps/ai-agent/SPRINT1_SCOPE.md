# AI-Agent — Sprint 1 Scope
> Prepared by: Bala (Director of Project Management) + Vinay (Product Owner)
> Technical review: Varun (Senior Director of Software Systems) + Bhavya (Senior Solution Architect)
> Approved by: Rohith (CPO)
> Date: 2026-04-09
> Status: CLOSED ✅ — Final Sign-off by Rohith (CPO) 2026-04-09
> QA: 31/31 tests passed — 0 failures

---

## Sprint Goal

AI-Agent service is live as a standalone Pharaxis core service.
Org admin can configure their own AI provider API key.
CP Portal semantic document search is powered by AI end-to-end.
- Pharaxis Superadmin can view platform-wide AI usage across all orgs.

---

## Sprint Duration

**3 weeks** — accounts for development, Varun code review, Gate 2, and QA execution.

---

## Item List

| # | Item | Effort | Dependencies |
|---|------|--------|-------------|
| 1 | AI-Agent service scaffolding | 1 day | None |
| 2 | Database schema — 3 tables | 1 day | Item 1 |
| 3 | Admin panel — API key config and provider selection | 3 days | Item 2 |
| 4 | Provider adapter layer — OpenAI, Claude, Gemini | 3 days | Item 2 |
| 5 | Core query endpoint — POST /api/v1/agent/query | 3 days | Items 2, 4 |
| 6 | CP Portal integration — semantic document search | 4 days | Items 3, 5 |
| 7 | Phase 2 optimisation stubs | 0.5 days | Item 1 |
| 8 | Superadmin portal — dashboard, orgs, usage pages | 2 days | Items 2, 3, 5 |

**Total effort: 17.5 days**

---

## Critical Path

Items 1 → 2 → 4 → 5 → 6

Item 3 (admin panel) runs in parallel with Items 4 and 5 once Item 2 is done.
Item 7 can be done at any point after Item 1.
Item 6 cannot start until Items 4 and 5 are complete and tested.
Item 3 must be complete before Item 6 can be tested end-to-end with a real key.

---

## Item Detail

---

### Item 1 — AI-Agent Service Scaffolding

**What:** Create the standalone AI-Agent service in the monorepo with its own server, routing, and database connection. Zero dependency on any other Pharaxis app.

**Files to create:**
- `apps/ai-agent/package.json`
- `apps/ai-agent/backend/server.js` — Express server on port 6000
- `apps/ai-agent/backend/database/db.js` — DB connection to `pharaxis_ai_agent_dev`
- `apps/ai-agent/frontend/package.json`
- `apps/ai-agent/frontend/vite.config.js` — Vite on port 5175, proxies to 6000
- `apps/ai-agent/frontend/index.html`
- `apps/ai-agent/frontend/src/main.jsx`
- `apps/ai-agent/frontend/src/App.jsx`

**Acceptance Criteria:**
- Service starts independently on port 6000
- `GET /api/v1/agent/health` returns `{ status: 'ok', app: 'pharaxis-ai-agent', version: 'v1', time: ... }`
- No import from any other Pharaxis app codebase
- Database connection established — starts without crash even if no org key is configured
- DB connection failure returns structured error, not unhandled exception

**Technical notes:**
- DB name: `pharaxis_ai_agent_dev`
- All routes versioned under `/api/v1/`
- Must be deployable independently

---

### Item 2 — Database Schema

**What:** Create the three database tables for AI-Agent.

**Tables to create:**

`ai_agent_org_config`
```sql
id INT AUTO_INCREMENT PRIMARY KEY
org_id INT NOT NULL — UNIQUE (one active row per org)
provider ENUM('openai','claude','gemini') NOT NULL
api_key_encrypted TEXT NOT NULL — AES-256, never plain text
is_active TINYINT(1) DEFAULT 0
created_at, updated_at DATETIME
```

`ai_agent_usage_log`
```sql
id INT AUTO_INCREMENT PRIMARY KEY
org_id INT NOT NULL
app_source ENUM('cp_portal','mims','vault','qms','safety','external') NOT NULL — enum constrained at DB level
query_type VARCHAR(100) NOT NULL
tokens_in INT, tokens_out INT
provider ENUM('openai','claude','gemini') NOT NULL
response_latency_ms INT
status ENUM('success','failed','timeout')
created_at DATETIME
```

`ai_agent_prompt_templates` — schema only, no data in Sprint 1
```sql
id INT AUTO_INCREMENT PRIMARY KEY
app_source ENUM — same as usage_log
query_type VARCHAR(100)
template_body TEXT
version INT DEFAULT 1
is_active TINYINT(1) DEFAULT 1
created_at DATETIME
```

**Acceptance Criteria:**
- All 3 tables created via `initializeDatabase()` on server start
- `app_source` is ENUM at DB level — rejects invalid values at DB, not just application level
- AES-256 encryption verified — no plain text key visible in any column
- Duplicate org config INSERT updates existing row (ON DUPLICATE KEY UPDATE)
- `is_active` defaults to 0 — must be explicitly enabled

---

### Item 3 — Admin Panel — API Key Configuration and Provider Selection

**What:** New page in CP Portal admin: Settings → AI Configuration. Org admin enters their provider API key, selects provider, enables/disables AI.

**Backend routes (in `apps/ai-agent/backend/routes/admin/`):**
- `GET /api/v1/agent/admin/keys` — returns current config (key masked as ••••••••)
- `POST /api/v1/agent/admin/keys` — validates key against provider, then saves encrypted
- `DELETE /api/v1/agent/admin/keys` — removes key config
- `PATCH /api/v1/agent/admin/provider/toggle` — sets is_active true/false

**Frontend (CP Portal admin section, new page):**
- Route: Settings → AI Configuration
- Provider dropdown: OpenAI / Claude / Gemini
- API key input — masked field, never shown in full after initial save
- Save button — triggers validation then save
- Enable/Disable toggle — visible, shows current state
- Clear success and error messages

**Acceptance Criteria:**
- Only org admin role can access this page
- Key is validated against provider on save — invalid keys are rejected, not stored
- If provider API is down at time of save — show retry message, do not mark key as invalid
- Key stored AES-256 encrypted — confirmed
- Masked display only after save (••••••••)
- Disabling AI (is_active = false) immediately stops query routing for that org
- Admin can delete key — queries return graceful "AI not configured" message after deletion

**Security constraints (mandatory):**
- Decrypted key must never appear in any log or response
- `keyResolver.js` middleware handles decryption in memory only

---

### Item 4 — Provider Adapter Layer

**What:** Three provider adapters plus a factory. Every app calls the same internal interface regardless of which provider the client uses.

**Files:**
- `apps/ai-agent/backend/adapters/index.js` — factory, selects adapter by provider name
- `apps/ai-agent/backend/adapters/openaiAdapter.js` — OpenAI implementation (model: gpt-4o)
- `apps/ai-agent/backend/adapters/claudeAdapter.js` — Anthropic Claude implementation (model: claude-sonnet-4-6)
- `apps/ai-agent/backend/adapters/geminiAdapter.js` — Google Gemini implementation (model: gemini-1.5-pro)

**Standard response shape (all three must return this):**
```json
{
  "answer": "string",
  "sources": [],
  "confidence": null,
  "tokens_used": { "in": 0, "out": 0 },
  "provider": "openai|claude|gemini"
}
```

**Acceptance Criteria:**
- All three adapters return identical response structure
- Provider errors (rate limit, invalid key, timeout) return structured error — not raw provider error to caller
- Empty response from provider returns structured empty result, not null
- Network timeout returns timeout error with retry hint
- Unsupported provider name in factory returns clear error
- No app ever calls a provider directly — all calls go through adapter

---

### Item 5 — Core Query Endpoint

**What:** The main query endpoint. Validates the request, resolves and decrypts the org API key, builds the prompt, routes to the adapter, logs usage, returns formatted response.

**File:** `apps/ai-agent/backend/routes/agent.js`
**Route:** `POST /api/v1/agent/query`

**Request shape:**
```json
{
  "org_id": "integer",
  "app_source": "cp_portal|mims|vault|qms|safety|external",
  "query_type": "document_search|faq_draft|content_expiry_suggestion",
  "payload": {
    "query": "string",
    "context": {}
  }
}
```

**Response shape:**
```json
{
  "status": "success",
  "provider_used": "openai|claude|gemini",
  "result": {
    "answer": "string",
    "sources": [],
    "confidence": null
  },
  "tokens_used": { "in": 0, "out": 0 }
}
```

**Supporting files:**
- `core/promptBuilder.js` — builds prompt string from query_type and payload. Supported: document_search, faq_draft, content_expiry_suggestion
- `core/responseFormatter.js` — normalises adapter result to standard shape
- `core/requestRouter.js` — coordinates promptBuilder → adapter → responseFormatter
- `middleware/keyResolver.js` — decrypts org key in memory, attaches to req.agentKey and req.agentProvider

**Acceptance Criteria:**
- All four required fields validated — 400 with field-level error if missing
- org_id with no active config → `AI not configured for this organisation`
- is_active = false → `AI features are currently disabled for this organisation`
- Request times out after 30 seconds — returns 504 with retry message
- Usage logged on every call including failed ones (tokens_used = 0 on failure)
- Decrypted key never in any log entry — enforced in keyResolver middleware
- Provider call failure returns structured error — provider detail not exposed to caller

**Security constraints:**
- `keyResolver.js` decrypts in memory only
- Decrypted key not passed through to any logging middleware

---

### Item 6 — CP Portal Integration — Semantic Document Search

**What:** CP Portal documents page gains an AI search mode. User queries in natural language. AI-Agent returns ranked document results with relevance score and summary. Falls back to standard search if AI is unavailable.

**Frontend changes (CP Portal):**
- Documents page: add AI search toggle above search bar
- When AI active: query sent to AI-Agent via `agentClient.js`
- Results display: document title, relevance score, short AI-generated reason for match
- Results labelled "AI-assisted results" — not presented as definitive
- User can switch back to standard search at any time
- If AI not configured or disabled for org: toggle is hidden, standard search only

**Backend changes (CP Portal):**
- New route or handler to proxy AI-Agent query from CP Portal backend
- Maps AI-Agent result document titles to CP Portal document records for linking

**Acceptance Criteria:**
- AI search returns ranked list with relevance score and source document link
- Zero results → "No relevant documents found" — not blank screen
- AI service unavailable → fall back to standard search, show notice to user
- Document in results that is expired → flag with expiry warning on result card
- Standard search remains fully functional at all times regardless of AI state
- Results are advisory — user must open and review document themselves
- AI search results always show traceable source document — no answer without source

---

### Item 7 — Phase 2 Optimisation Stubs

**What:** Create stub files with defined interfaces for Phase 2 optimisation. Interfaces defined now so Phase 2 has a clear home and no restructuring is needed.

**Files:**
- `apps/ai-agent/backend/optimisation/cache.js` — response cache stub (get, set, invalidate)
- `apps/ai-agent/backend/optimisation/chunker.js` — document chunking stub (chunk, estimateTokens)
- `apps/ai-agent/backend/optimisation/templateStore.js` — prompt template registry stub (getTemplate, saveTemplate)

**Acceptance Criteria:**
- All three stub files importable without errors
- Interfaces match expected signatures so Phase 2 can implement without changing callers
- No Phase 2 functionality built in Sprint 1 — stubs only

---

### Item 8 — Superadmin Portal

**What:** Standalone frontend portal for Pharaxis platform-wide AI oversight. Dark sidebar design, three pages: Dashboard (stats + recent activity), Orgs (per-org config + enable/disable toggle), Usage (full usage log with filters).

**Files:**
- `apps/ai-agent/frontend/src/components/SuperadminLayout/index.jsx` — dark sidebar (240px, #0f172a), topbar, Pharaxis purple active state
- `apps/ai-agent/frontend/src/pages/DashboardPage/index.jsx` — 6 stat cards, usage by app table, usage by provider bar, recent activity
- `apps/ai-agent/frontend/src/pages/OrgsPage/index.jsx` — org list, provider badges, enable/disable toggle
- `apps/ai-agent/frontend/src/pages/UsagePage/index.jsx` — filters, summary cards, paginated log table
- `apps/ai-agent/backend/routes/admin/superadmin.js` — GET /dashboard, GET /orgs, PATCH /orgs/:orgId/toggle

**Acceptance Criteria:**
- Dashboard shows live stats from DB: orgs configured, active orgs, queries today, all-time queries, tokens today, all-time tokens
- Orgs page shows per-org config with toggle to enable/disable any org
- Usage page shows full usage log with org, provider, app source, status columns
- UI is professional SaaS quality — dark sidebar, stat cards, proper typography

---

## Technical Impact Summary

| Impact Area | Detail |
|-------------|--------|
| New service | `apps/ai-agent/` — fully standalone, zero coupling to existing apps |
| New DB | `pharaxis_ai_agent_dev` — 3 new tables, migration on server start |
| CP Portal | New admin settings page + new AI search mode on documents page |
| Existing apps | Zero changes to MIMS, Vault, QMS, Safety in Sprint 1 |
| Port | Backend: 6000 | Frontend: 5175 |

## Auth Architecture

| Path | Auth Method | Used By |
|------|-------------|---------|
| `/api/v1/agent/admin/*` | JWT (`JWT_SECRET`) — AI-Agent admin users | AI-Agent admin panel |
| `/api/v1/agent/internal/*` | Static internal token (`AI_AGENT_INTERNAL_TOKEN`) + `X-Org-Id` header | CP Portal backend proxy |
| `/api/admin/clients/:clientId/ai-config/*` | CP Portal admin JWT (`CP_ADMIN_JWT_SECRET`) | CP Portal admin frontend |

**CP Portal AI Config flow:**
CP Portal admin frontend → CP Portal backend proxy (validates cp_admin_token) → AI-Agent internal routes (validates AI_AGENT_INTERNAL_TOKEN). Frontend never calls AI-Agent directly.

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Provider API differences causing adapter complexity | Three adapters scoped and reviewed by Bhavya — openai, claude, gemini SDKs all have clear docs |
| CP Portal standard search must not degrade | Standard search path tested independently — AI is an overlay, not a replacement |
| AES-256 encryption must be right first time | Bhavya to include exact encryption library (Node crypto), key format, and IV handling in Codex prompt |
| Cross-org key isolation | keyResolver validates org_id match on every request — no cross-org key access possible |

---

## Start Command (once npm install complete)

```bash
# Backend
cd apps/ai-agent && npm install && npm run dev   # port 6000

# Frontend
cd apps/ai-agent/frontend && npm install && npm run dev   # port 5175

# Requires MySQL running — DB: pharaxis_ai_agent_dev
# Requires AI_AGENT_ENCRYPTION_KEY set in .env (32-byte hex — 64 hex chars)
```

---

## Environment Variables Required

```
PORT=6000
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=devuser
MYSQL_PASSWORD=devpass
MYSQL_DATABASE=pharaxis_ai_agent_dev
JWT_SECRET=<shared with other apps>
AI_AGENT_ENCRYPTION_KEY=<64 hex chars — 32 bytes for AES-256>
AI_AGENT_INTERNAL_TOKEN=<static service token for CP Portal → AI-Agent calls>
```

---

*Sprint 1 development complete. Gate 2 approved. Pending QA execution by Karthik + Shivani before Final Sign-off.*
*Gate 2 required before QA starts — raised by Bala + Varun after engineering verification.*
