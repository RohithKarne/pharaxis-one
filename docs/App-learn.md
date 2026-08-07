# App Learn — MIMS Technical Learning Handoff

> **Owner:** Rohith Karne (CEO)
> **Prepared by:** Bala Kaviti (COO) at Rohith's request
> **Purpose:** Session handoff document. Captures the MIMS technical learning plan, what has been completed, how Varun (CTO) is teaching it, and what comes next. Read this first when continuing in a new session.
> **Last updated:** 2026-05-20

---

## 1. How To Use This Document (for the next session)

Rohith is learning the MIMS application end-to-end, taught by **Varun (CTO persona)**. This file is the bridge between chat sessions so no context is lost.

When resuming:
1. Read this whole file.
2. Pick up at the **"Next Up"** section (Section 7).
3. Keep Varun's **teaching style** (Section 3) — Rohith has explicitly confirmed the style he wants.
4. The team personas and protocols still apply (see the team SOPs in `docs/`).

---

## 2. The Big Picture — 6-Topic Learning Plan

Rohith is learning MIMS across six topics. We are deep inside **Topic B**.

| Topic | Area | Status |
|---|---|---|
| A | Database deep dive (schema, migrations, multi-tenant data model) | Not started |
| **B** | **Auth + 2FA deep dive** | **In progress — nearly complete** |
| C | Case form architecture (dynamic form engine, the heart of MIMS) | Not started |
| D | Content Management | Not started |
| E | Services walkthrough | Not started |
| F | Frontend modules | Not started |

---

## 3. Teaching Style (CONFIRMED by Rohith — keep this)

Rohith confirmed on 2026-05-18 the style he wants. This is now a standing feedback rule.

- **Concept-first, why-first.** Lead with the concept and the problem it solves. Code is *supporting evidence*, not the main act.
- **NOT line-by-line code walkthroughs.** Part 1 style was "very much liked." Part 2 was flagged as "too much code-level explanation." Default to conceptual.
- **Real examples are wanted** — e.g. live JWT decode, real bcrypt hash output, real DB schema. These make concepts tangible without being code-heavy.
- Show file paths and short snippets only when they make a concept concrete.
- If Rohith wants deeper code depth, he asks. Otherwise stay conceptual.
- Each part ends with a **"What You Now Understand"** recap and a teaser for the next part.

---

## 4. Topic B — Auth + 2FA Deep Dive: Full Roadmap & Status

| # | Part | Status |
|---|---|---|
| 1 | Foundations — JWT, bcrypt, JWT structure | ✅ Done |
| 1B | SSO Foundation — OIDC, login modes, Google/Microsoft | ✅ Done |
| 1.D | Part 1 Deep Dive — live JWT decode, real bcrypt hash, `users` table | ✅ Done |
| 2 | Login Flow End to End | ✅ Done |
| 3 | Every API Call After Login | ✅ Done |
| 4 | Password Reset (First Login) | ✅ Done |
| 5 | Forgot Password Flow | ✅ Done |
| 6 | Session Timeout | ✅ Done |
| 7 | 2FA Architecture | ✅ Done |
| 8 | 2FA Login Flow | ✅ Done |
| 9 | Trusted Device "Remember Me" | ⏭️ SKIPPED (Rohith already knows) |
| 10 | Reset 2FA + Unlock | ⏭️ SKIPPED (Rohith already knows) |
| 11 | Audit Trail (21 CFR Part 11) | ✅ Done |
| 12 | The Gotchas | ✅ Done |

**Topic B is effectively COMPLETE.** Parts 9 and 10 were deliberately skipped at Rohith's request.

---

## 5. What Was Taught — Part-by-Part Summary

This is the substance, so the document doubles as a study reference.

### Part 1 + 1.D — Foundations (JWT & bcrypt)
- **bcrypt**: passwords never stored in plain text. Salted, deliberately slow. Hash format `$2b$10$[22-char salt][31-char digest]`. Cost factor is exponential (cost 10 ≈ 70ms, cost 12 ≈ 315ms verify). Same password → different hashes (salt). Superadmin bootstrap uses cost 12; normal users cost 10.
- **JWT**: 3 parts — header.payload.signature, dot-separated, Base64. Payload is **signed, not encrypted** (anyone can read it — never put secrets in it). Tampering the payload breaks the signature → `invalid signature`. Wrong secret → rejected.
- **MIMS JWT payload**: `{ userId, email, role, orgId, siteId, passwordResetRequired, iat, exp }`. Default expiry **8h**.
- **`users` table** (migration `001_core_auth.js`): key columns — `password` (bcrypt, VARCHAR(255)), `role`, `is_active`, `password_reset_required`, `failed_login_attempts`, `locked_until`, `org_id` (legacy/deprecated — real multi-org is via `user_org_access`). Unique key on `email`.

### Part 1B — SSO Foundation
- SSO = log in with existing Microsoft/Google identity (OIDC on top of OAuth2). Required by enterprise pharma clients.
- **Login modes** (per org, `organisations.login_mode`): `local_only`, `sso_only`, `local_and_sso`.
- **Two SSO tables**: `access_sso_provider_configs` (per-org provider config — client_id, **encrypted** client_secret, allowed_domains, tenant_id) and `user_external_identities` (links MIMS user to external `sub` claim).
- Client secrets encrypted with **AES-256-GCM**, masked in UI.
- SSO authenticates but does **NOT** auto-provision users — superadmin must pre-create them.
- M365 document authoring piggybacks on the same SSO identity layer.

### Part 2 — Login Flow End to End
- LoginPage → backend gates (password verify, active check, lockout check, reset-required check, org resolution, 2FA check) → issue JWT → store in localStorage + httpOnly cookie.
- Failed-login counter and lockout logic live on the `users` table.

### Part 3 — Every API Call After Login
- **Three pillars**: identity (`authenticate` middleware) → authorisation (`requireOrg`, `requireRole`) → data isolation (the SQL pattern).
- **Redis session cache** (60s TTL) in front of MySQL session lookup to absorb the burst of parallel calls per page load. Cache miss falls through to MySQL transparently. JWT signature re-verified even on cache hit.
- **Org isolation pattern** (THE most important habit): every org-scoped query adds `AND org_id = ?` for non-superadmin. Added at the **application layer**, not the DB. Superadmin (orgId null) bypasses it.
- `req.user` is the universal currency, set once by middleware, trusted everywhere.
- **401 → global auto-logout** handled centrally in `httpFetch`; `/api/auth/*` URLs excluded.
- Token travels two channels: Authorization header (primary) + httpOnly cookie (XSS-safe fallback).

### Part 4 — Password Reset (First Login)
- Driven by one flag: `users.password_reset_required`.
- Set when superadmin creates a user OR force-resets. On next login, a **10-min reset token** (scoped to one endpoint) is issued instead of a full session.
- **"Two locks on one door"**: JWT flag + DB flag both required → prevents replay after successful reset.
- **Password history**: `user_password_history` keeps last 5 hashes; reuse blocked via bcrypt-compare against each (only at reset time). The "5" is configurable in `system_config` (`password_history_count`).
- After reset → "please log in again" (no auto-login — keeps audit clean).
- One helper `updatePasswordWithHistory` serves new-user, force-reset, and voluntary change.

### Part 5 — Forgot Password Flow
- Self-service when no admin and no password. Identity proof = control of the email.
- **3 steps**: `send-code` → `verify-code` → `reset`. Split for UX, rate-limiting, and audit clarity.
- 6-digit OTP, hashed in storage, short expiry, attempt-counter cap.
- **Nonce pattern** (`users.password_reset_nonce`): second lock preventing token replay even within JWT expiry window.
- **DB-time gotcha** (real QA defect): expiries must be generated with `DATE_ADD(NOW(), INTERVAL ? MINUTE)` — never JS `new Date()`. JS clock vs DB clock drift caused intermittent expiry bugs in production.
- Superadmin is **excluded** from forgot-password (too high-value an account).

### Part 6 — Session Timeout
- **Idle timeout** (inactivity) vs **absolute JWT expiry** (wall-clock) — two timers, two threats. Whichever fires first wins.
- Idle timeout is **per-org**: `organisations.session_timeout_minutes` (default 30). Flows DB → login response → AuthContext → `useIdleTimer` hook.
- **Superadmin** uses a separate `system_config.superadmin_session_timeout_minutes` (default 60) — platform-level, not org-bound.
- `useIdleTimer`: listens to 6 activity events, sets warning + logout timers, resets on activity. Pure client-side.
- **Freeze-during-warning**: once the warning modal shows, mouse movement does NOT reset — only the explicit "Stay Logged In" button does (forces a conscious choice).
- Auth **cookie maxAge = session timeout** — a backstop layer below the frontend timer and below the 8h JWT.
- Timeout does a **real** server-side logout (DB row + Redis cleared), not just a redirect.

### Part 7 — 2FA Architecture
- "Something you know" (password) + "something you have" (phone/email).
- Two methods: **Email OTP** (simple, network-dependent) and **TOTP** (authenticator app, stronger, no network at login — shared secret + time, codes every 30s).
- Per-org config on `organisations`: `two_factor_enabled`, `two_factor_methods`, `two_factor_remember_days`. All-or-nothing per org.
- **Superadmin does NOT get 2FA** (recovery problem + different threat model — protected differently: IP allowlist, shorter timeout, verbose audit).
- **Four tables**: `user_2fa_settings` (user state), `user_2fa_challenges` (in-flight tickets), `user_2fa_backup_codes` (break-glass), `user_2fa_trusted_devices` (remember-me).
- TOTP secret stored **encrypted** (AES-256-GCM, same as SSO secrets).
- Backup codes = one-time, hashed, shown once at enrollment.
- Challenge/trusted-device tables get reaped daily (operational state, not history).

### Part 8 — 2FA Login Flow
- Login becomes **two stages**: password (Stage 1) → second factor (Stage 2). The real session token is **withheld** until both pass.
- **Challenge token**: 10-min `twoFactorPending` JWT, can only call `/2fa/verify`, carries full login context.
- **Stage 1 decision tree**: locked (423) → trusted device (bypass) → enrolled (mode `verify`) → not enrolled (mode `setup_optional`, enrollment-on-first-login).
- **3 verify paths**: backup code, email OTP, TOTP. Setup-mode success also enrolls the user + generates one-time backup codes returned in the response.
- **3-strike lockout**: wrong codes increment `failed_attempts`; 3 → `is_locked`, response shifts 401 → 423. Success clears the counter.
- Stage 2 success rejoins normal login (issue real token, cookie, `login_success` audit).

### Part 11 — Audit Trail (21 CFR Part 11)
- 21 CFR Part 11 = FDA rule making electronic records equivalent to signed paper. Requires a secure, time-stamped, tamper-proof audit trail.
- **ALCOA**: Attributable, Legible, Contemporaneous, Original, Accurate.
- **Two trails**: `login_audit` (auth events) and `audit_logs` (data changes — with `before_value`, `after_value`, `change_reason`).
- `login_audit` **snapshots** `user_name` + `role` into the row (not just `user_id`) so later user changes can't rewrite history.
- **Append-only**: no app path UPDATEs/DELETEs audit content (one exception: `logout_time` stamp). Reinforced by DB grants in production.
- Surfaced two ways: user's own recent activity (`/api/auth/sessions`) and superadmin full console (`/audit`, superadmin-only).
- **Big idea**: authentication is what makes the audit trail *credible* — everything in Parts 1–10 exists so the `user_id` on a row provably identifies a real person.

### Part 12 — The Gotchas
- **`req.user.userId`, not `.id`** — `.id` is `undefined` and fails silently.
- **Superadmin `type="text"` username** — email-type input rejects the non-email `superadmin` username; the `allowUsername` flag fixes it. Superadmin is the exception to every rule.
- **Switch-org reissues the token** + `window.location.reload()` (org context lives in the JWT; session-spanning claims must be carried forward).
- **DB time, not JS time** for expiries (`DATE_ADD(NOW(), ...)`).
- **JWT_SECRET**: random per-restart in dev (causes "random logouts" — set a fixed dev secret); hard-required ≥32 chars in prod; rotating it = global logout.
- **2FA state is per-(user, org)** — filter on both keys.
- **Two token lanes**: real sessions (master key) vs flow tokens (single-use door key) — never mix; a 200 from `/login` with `twoFactorRequired` is NOT a login.
- **3 unifying truths**: (1) JWT is immutable authority, (2) superadmin breaks every assumption, (3) multi-tenancy is everywhere including auth state.

---

## 6. Side Feature Built During Learning — JWT Expiry Warning (Pattern 1)

While learning Part 6, Rohith asked whether the JWT expiry could be dropped and whether users get a warning. This turned into a real feature discussion + build.

- **Decisions Rohith made**: 12-hour absolute session cap; 5-minute warning before expiry; proceed with build.
- **What was built** (warning modal at exp−5min + `/api/auth/refresh-session` endpoint): `originalIat` claim to anchor the 12h cap, `issueSessionToken` helper, window guard (refresh only within 15 min of expiry), 12h cap (403 `session_cap_reached`), `useSessionExpiry` hook, `SessionTimeoutModal` expiry mode, `applyRefreshedToken` + cross-tab sync.
- **Status**: Implementation + static verification (build, lint, guard-logic boundary tests, live endpoint auth check) passed. **Browser verification per SOP Section 15 was NOT completed.** **Rohith took the feature over ("I will take care from here") and reverted the changes** to return to the clean baseline for continued learning. The feature is therefore NOT in the codebase currently.
- If revisited: it's a clean ~3.5-day sprint candidate (backend endpoint + frontend hook/modal + cross-tab + QA).

---

## 7. Next Up

**Topic B (Auth + 2FA) is complete.** Rohith should choose the next topic:

- **Topic A — Database deep dive** (schema as a whole, migrations, multi-tenant data model) — natural next step; many auth concepts referenced the DB.
- **Topic C — Case form architecture** (the heart of MIMS — dynamic form engine, how cases are structured).
- **Topic D — Content Management**
- **Topic E — Services walkthrough**
- **Topic F — Frontend modules**
- Or revisit skipped Parts 9 (Trusted Device) / 10 (Reset 2FA + Unlock) if ever wanted.

**Recommendation:** Topic A or Topic C next.

---

## 8. Key File Pointers (MIMS)

| Area | Path |
|---|---|
| Auth controller | `apps/mims/backend/controllers/authController.js` |
| Auth routes | `apps/mims/backend/routes/auth.js` |
| Auth middleware | `apps/mims/backend/middleware/auth.js` |
| JWT secret loader | `apps/mims/backend/utils/jwtSecret.js` |
| SSO service | `apps/mims/backend/services/ssoService.js` |
| 2FA service | `apps/mims/backend/services/twoFactorService.js` |
| Core auth migration (users, sessions, audit, etc.) | `apps/mims/backend/database/migrations/001_core_auth.js` |
| 2FA + password history migration | `apps/mims/backend/database/migrations/008_multitenancy.js` |
| SSO migrations | `apps/mims/backend/database/migrations/021_*.js`, `024_*.js` |
| Frontend auth context | `apps/mims/frontend/src/shared/context/AuthContext.jsx` |
| Frontend fetch wrapper | `apps/mims/frontend/src/shared/api/httpFetch.js` |
| Idle timer hook | `apps/mims/frontend/src/shared/hooks/useIdleTimer.js` |
| Session timeout modal | `apps/mims/frontend/src/shared/components/SessionTimeoutModal.jsx` |
| Login page | `apps/mims/frontend/src/shared/pages/LoginPage.jsx` |

---

## 9. Team & Persona Note (for the new session)

- Claude AI operates as **Bala Kaviti** (Chief Operating Officer). Teaching is delivered by the **Varun Karne (CTO)** persona.
- 11-person team (updated 2026-07-10). Reporting to Rohith Karne (CEO & Co-Founder): Bala Kaviti (COO), Varun Karne (CTO & Co-Founder), Saad Rahman (CPO), Vasu Ranabothu (Chief Compliance Officer), Mark Antony (Chief AI Officer), Sowmya (Chief Medical Officer). Reporting to Varun: Bhavya Bobba (Engineering Manager), Kiranmai Avuluri (Director of QA), Anirudh (Solution Architect). Reporting to Kiranmai: Krishnapriya (Lead Test Engineer).
- **Bhavya is Engineering Manager only** — QA now belongs to Kiranmai Avuluri.
- **Katrina** (Senior Director, Client Excellence) is an external client, not an employee. Never in internal approval gates.
- Portfolio is **5 products**: CP Portal, MIMS, Pharaxis Vault, QMS, AI-Agent. Safety, IEG, and Publications were eliminated 2026-07-10. Build priority: CP Portal + MIMS first, Vault + QMS next.
- Live communication, targeted communication (only the addressed person responds), and the gate workflow all apply per `docs/TEAM_OPERATING_SOP.md` (§39 for live communication).
- Dev tooling: use Claude Code Edit/Write directly for all code. Git push is DISABLED. No feature is "Done" until browser-verified.
</content>
