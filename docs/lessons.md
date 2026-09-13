# Lessons Learned — MIMS-CP Portal

> Updated after every correction. Read at the start of each session.
> Format: **What went wrong → Why → Rule to prevent it**

---

## L-001 — Field name mismatches between backend and frontend (2026-03-20)
**What:** Analytics dashboard showed empty tables. Backend returned `subs_by_type`, `top_docs`, `subs_trend` but frontend expected `submission_types`, `top_documents`, `submissions_trend`.
**Why:** Backend and frontend were built in separate passes without a shared contract.
**Rule:** Before building both sides of a feature, write the API response shape first and reference it in both the route and the page component. Cross-check field names before marking done.

---

## L-002 — Declared import never used (2026-03-20)
**What:** `notifyPortalUsers` was imported in `documents.js` but the call was never wired in. `publish_at` was destructured from `req.body` but never added to the fields array.
**Why:** Code was written in steps; the second half (the actual usage) was forgotten.
**Rule:** After adding any import or destructuring, immediately write the usage. Never leave a declared variable without a call site. Run a lint/unused-variable check mentally before marking done.

---

## L-003 — Wrong column name in SQL query (2026-03-20)
**What:** Used `sa.is_active = 1` but `cp_safety_alerts` uses `status TEXT` not `is_active INTEGER`. Used `cp_compliance` but correct table is `cp_compliance_config`.
**Why:** Assumed column names without reading the schema first.
**Rule:** Always read `db.js` schema migrations before writing any SQL query against a table you haven't touched recently. Never guess column names.

---

## L-004 — Safety alerts missing notification trigger (2026-03-20)
**What:** News and documents triggered `notifyPortalUsers()` on publish, but safety alerts did not — even though the spec said all three content types should notify.
**Why:** Safety route was not updated when the notification system was built.
**Rule:** When adding a cross-cutting behaviour (notifications, audit, access control) — grep for all similar routes and apply consistently. Don't assume one file covers all cases.

---

## L-005 — Integration routes missing requireClientAccess (2026-03-20)
**What:** `integration.js` had `authenticateAdmin` but not `requireClientAccess` on write routes. An admin from Client A could have configured integrations for Client B.
**Why:** The middleware was added to other admin routes but integration.js was overlooked.
**Rule:** Every admin route scoped to a `/:clientId` parameter must have both `authenticateAdmin` AND `requireClientAccess`. Check this on every new route file.

---

## L-006 — Orphaned saved items not filtered (2026-03-20)
**What:** When referenced news/documents were deleted, saved items returned `detail: null` causing blank entries in the UI.
**Why:** The enrichment query returned all items including those with missing references.
**Rule:** Any enrichment JOIN or lookup that may return null should explicitly filter out null-detail records before returning to the client. Never return null-detail records to the UI.

---

## L-007 — UI change interpreted incorrectly (2026-03-21)
**What:** Implemented a layout change that didn’t match the user’s intended diagram style.
**Why:** I proceeded without locking the exact UI target with concrete confirmation.
**Rule:** For UI layout changes, restate the target in concrete terms (option + visual description) and wait for explicit confirmation before implementing.

---

## L-008 — Persona ownership: the addressed person speaks (2026-07-08)
**What:** When Varun asked Saad (CPO) to prepare a document, the reply closed in a way that let the CTO voice front the product work instead of Saad owning the response.
**Why:** Defaulted to a coordinator/CTO framing rather than staying fully in the addressed persona.
**Rule:** When a team member is addressed by name, that person is the responsible speaker and answers in first person within their own lane. Do not let Varun (or any other role) front, frame, or speak over the addressed persona. Saad owns product; Bhavya owns eng/QA; Bala owns PMO/process; Varun owns engineering coordination — each speaks only for their own area.

---

## L-009 — DB/API "verification" that never opened the user's screen (2026-07-11)
**What:** The CP Portal → MIMS integration was called "done and verified" across multiple waves. Verification only checked that rows landed in the MIMS database and that API endpoints returned data. When Rohith actually opened a MIMS case, the reporter, AE/PC details, and attachments were **not visible** — the case screen reads `case_contacts` + the versioned `case_ae_*`/`case_pc_*` tables + a feature-flagged attachments panel, while the integration wrote the flat intake tables (`case_reporter`, `case_ae_intake`, `case_pc_intake`). Data was present but rendered nowhere. The defect reached the CEO.
**Why:** DB/API evidence was allowed to stand in for functional verification. No one opened the receiving app's UI as a real user. "It's in the database" was treated as "the user can see it."
**Rule:** **Never call anything done on DB/API evidence alone.** Verify functionally in the actual UI a user opens, like a human — for the changed flow and one negative path. For an integration, verify the data is visible and usable in the RECEIVING app's UI (which may read different tables/versions or be gated by a feature flag), not just written to its database. Codified as Team Operating SOP §26 (Functional Verification Standard), Definition of Done (§22), and the live-communication Core Rules. When verifying a two-app integration, trace what the consuming screen actually reads BEFORE writing, and confirm it renders AFTER.

---

## L-010 — Fixed one instance of a bug class, missed its sibling (2026-07-15)
**What:** The mysql2 JSON-column double-parse bug (`JSON.parse` on an already-parsed array) was fixed in `apiKeyAuth.js` during e2e, but the identical pattern in `tokenIssuer.js` (`JSON.parse(client.scopes)`) was left in place — it 500'd the `/oauth/token` endpoint the moment we needed it. This is a direct repeat of the L-004 failure mode.
**Why:** The fix was applied where the symptom appeared instead of grepping for the pattern.
**Rule:** The moment a bug is identified as a *pattern* (not a one-off), grep the whole codebase for that pattern and fix every instance in the same change. `grep -rn "JSON.parse(.*scopes"` took 2 seconds and would have prevented a broken prod-path months later.

---

## L-011 — Verification credentials/config must be created the way the server reads them (2026-07-15)
**What:** Two self-inflicted failures during NEW-D provisioning: (1) an encryption script ran without loading `.env`, so secrets were encrypted with the dev-fallback key while the server decrypts with the real `CP_SECRET_ENCRYPTION_KEY` — silent auth failure; (2) a JWT was minted for MIMS while the server used a random per-process secret (no `JWT_SECRET` in .env), so no externally minted token could ever validate.
**Why:** Scripts assumed the server's runtime environment instead of confirming it (which env file, which key resolution path).
**Rule:** Before minting/encrypting anything a server must accept, read the server's own resolution code (key/env loading) and replicate it exactly — then verify round-trip (encrypt→decrypt, sign→verify) before relying on it. Also: MIMS dev now has a fixed `JWT_SECRET` in `apps/mims/.env` so sessions survive nodemon restarts.

---

## L-012 — A whole subsystem can be inert because its provider was never mounted (2026-07-15)
**What:** Enabling `cf.theme6_documents` in the DB changed nothing on the MIMS case screen. Root cause: `FeatureFlagsProvider` was never mounted in any app — `useFeatureFlag()` read the empty default context, so EVERY tenant feature flag rendered as OFF app-wide since the flag system was built. The backend, admin UI, and DB all "worked"; the consuming side was never wired.
**Why:** The flag system was verified at the API/DB level only — nobody flipped a flag and looked at the screen (same failure class as L-009).
**Rule:** When building a provider/consumer pair (context, event bus, config system), verification = flip a value and see the CONSUMER change in the UI. Also found the same day via browser verification: an infinite `/api/auth/me` + `security-groups` fetch loop in AuthContext (effect depended on a user object rebuilt by every response) that burned rate limits and caused the recurring "Too many authentication requests" lockouts — fixed by depending on stable identities (`token`, `user?.id`), plus `skipSuccessfulRequests` on the auth backstop limiter.

---

## L-010 — Refresh governing SOPs before preparing a product plan (2026-07-14)
**What:** Rohith asked for the Vault roadmap plan, then directed the team to read the current live-communication, operating, and workflow documents before preparing it.
**Why:** A product plan can become stale or breach the current operating model when it is drafted from prior context rather than the active project SOPs.
**Rule:** Before drafting a non-trivial Pharaxis product plan or implementation scope, refresh the current governing SOPs and reflect their latest roles, approval gates, task-scope requirements, and functional verification standard in the output.
