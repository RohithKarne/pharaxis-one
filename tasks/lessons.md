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
