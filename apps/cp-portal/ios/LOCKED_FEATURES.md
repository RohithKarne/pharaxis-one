# CP Portal iOS — Locked Feature Log

> Maintained by Bala (COO) per Team Operating SOP §26.
> A feature is only carried forward once Rohith confirms it and it is marked **Locked** here.
> Discussion alone does not imply commitment. Nothing in "Proposed" may be built.

---

## Decision log

| Date | Decision | Decided by |
|------|----------|-----------|
| 2026-07-23 | iOS app targets CP Portal; native SwiftUI; operated entirely from the existing web admin — no separate iOS admin | Rohith |
| 2026-07-23 | Project lives at `apps/cp-portal/ios`; deployment target held at iOS 26.5; SwiftData template removed | Rohith |
| 2026-07-23 | Tier 1 confirmed as the first build scope | Rohith |
| 2026-07-23 | Pre-Tier-1 spike parked, then re-entered through Tier 1 under Gate 1 | Rohith |
| 2026-07-23 | Seeded QA portal credential approved as a workaround for the missing provisioning path | Rohith |
| 2026-07-23 | Gate 1 approved by CEO directive; §25 pre-conditions compressed (see Outstanding) | Rohith |
| 2026-07-23 | Push notifications **IN** scope — net-new APNs work, not a port | Rohith |
| 2026-07-23 | UI localisation **withdrawn** — web portal is English-only in practice (`language` pinned to `en`) | Saad |
| 2026-07-23 | Specialty personalization prompt **IN** — small, and personalization is inert without it | Saad |

---

## Tier 1 — Locked and built

Engineering-verified in the simulator. **Not "done"** under §22 until Gate 2, QA execution, and Kiranmai's sign-off.

| # | Feature | Business logic | Status |
|---|---------|----------------|--------|
| 1 | Consent gate (versioned) | Reads `version` / `require_reconsent` from config; blocks entry ahead of sign-in; records all four categories | Locked · Built |
| 2 | Sign in / sign out | `cp_portal_users` via httpOnly cookie; backend's own error text surfaced | Locked · Built |
| 3 | HCP gate / user-type confirm | One-time confirmation; drives the config `accessMap` | Locked · Built |
| 4 | Home | Config-driven: client name, safety banner, tagline, quick links | Locked · Built |
| 5 | Document library | Filtered server-side by `user_type` | Locked · Built |
| 6 | News | List + detail | Locked · Built |
| 7 | Search | Unified across enabled content types | Locked · Built |
| 8 | Specialty personalization | Post-login, skippable | Locked · Not built |

---

## Tier 2 — built 2026-07-23 on Rohith's "develop, test, final output in one go" directive

Submit (dynamic forms, MI/PC/Other) · Find MSL + booking · Profile + password change ·
Safety alerts · Drug info · Therapeutic areas + follows · Events · Resources · Saved items ·
My submissions + CSV export · My activity · Preferences · FAQ · Chatbox · Feedback ·
Specialty prompt · Document viewer (QuickLook) · Search route mapper · Browse hub shell

**Verified end-to-end in simulator:** submission CP-000082 (medical inquiry) submitted from
the app, stored clean (`user_type: "HCP"` single value — no web AE-style value-capture bug),
auto-synced to MIMS as case 482666, and visible in My Submissions with a Synced badge.

**Not buildable locally, needs external infrastructure:**
- Push notifications — APNs credentials + backend sender (design locked: real titles for
  news/documents/safety, generic payload + on-device enrichment for user-specific)
- Password reset via Universal Links (option A) — needs Associated Domains + AASA file on a
  real domain; untestable on localhost

**Deferred outright:** SSO (Novartis is `login_mode = local_only`).

**Parity close-out — built and verified 2026-07-25.** Web/iOS parity is now complete apart from
the externally-blocked items above:
- **Notification centre** — list with type badges, unread dots, mark-one / mark-all, and
  deep-links to news / documents / safety. Closes the incoherence of having shipped Preferences
  for notifications the app could not display. It is also the surface push will open into.
- **Contact** — routing guidance plus a message submitting as `other_inquiry`
  (verified: CP-000085, attributed to the signed-in user). Contact email/phone deliberately
  omitted; see backlog #6.
- **View-count pings** — on news and safety detail, so iOS readers now count toward the client's
  admin analytics ("top safety alerts by views"). Verified live: 86 → 87.
  Found while verifying: a plain `.task` ping is cancelled when the reader navigates back, so it
  often never landed. Now `.onAppear` + `Task.detached` — analytics must not inherit view
  cancellation.

**Adverse event reporting — UNBLOCKED and built 2026-07-25.** Both preconditions resolved with
evidence before any code was written:

- **Sowmya's value-capture defect — root-caused and closed.** The old web form rendered a
  JSON-array option list as one `<option>`, so the whole array was submitted as the answer
  (records 46 on 4 Jul, 72 on 12 Jul). The current web code parses JSON arrays and documents
  the failure mode in-line; fix committed a3eb1d9 on 14 Jul. Record 78 (14 Jul) already stored a
  single value. Proven structurally impossible via iOS: CP-000083 stored `complaint_type =
  "Quality Issue"` from an identical JSON-array select, and CP-000084 stored `reporter_type =
  "HCP"` and `outcome = "Recovered"` — the exact two fields that previously broke.
- **Vasu's sync-loss question — answered by live demonstration.** An accepted AE cannot be lost.
  The submission is INSERTed before sync is attempted; `mimsRetry` polls every 60s, re-drives
  `failed_sync` with exponential backoff and rescues stale `pending_sync` after 10 min; retry is
  safe because MIMS creation is idempotent on the CP reference; every attempt is audited as
  `SYNC_RETRY`. Observed for real: CP-000084 hit `failed_sync` ("fetch failed" — MIMS was down),
  survived with its reference intact, retried automatically, and reached MIMS as case 482668 on
  attempt 3 once MIMS returned.
- **Minimum criteria (ICH E2D):** reporter, product and event are config-required and hard-
  enforced. Patient identifiability is prompted via `AEReportRules` but deliberately does NOT
  block — refusing a valid safety report over a missing age suppresses the report entirely.

Verified end-to-end per §26: iPhone → CP backend → retry → MIMS **AE Workspace** (version #1,
status Open, narrative intact, ready for "Transmit to PV").

---

## Outstanding

**Gate 1 pre-conditions never produced (§25)** — compressed by CEO directive, still owed:
- [ ] Saad — user stories and acceptance criteria for Tier 1 features 1–7
- [ ] Kiranmai — test plan
- [ ] Bhavya — task scopes

**Gate 2 / QA for Tier 1 + Tier 2:**
- [ ] Gate 2 approval
- [x] Krishnapriya — independent functional pass executed 2026-07-23. Evidence: submission
      CP-000083 (product_complaint, second form type) with 4.1 MB photo attachment — validated
      server-side (magic bytes), on disk, synced to MIMS case 482667 with byte-identical
      attachment. Negative paths: empty-submit validation, AE correctly absent from Submit.
      19/19 unit tests green. Findings: FN-1 autocorrect on product/lot text fields (minor, open).
- [x] Kiranmai — QA sign-off **granted**. The one carried exception (§26 receiving-app UI
      check) was CLOSED 2026-07-24: Rohith approved seeding a MIMS QA user
      (qa.test@novartis-demo.com, admin, Novartis org, module perms mirrored from user 338);
      Krishnapriya signed into the MIMS UI, opened case CP-000083 (Attachments tab shows
      photo-1.jpg · 3.9 MB) and case CP-000082. Screenshots captured. No exceptions remain.
- [x] **Gate 2 APPROVED by Rohith 2026-07-24.** Tier 1 + Tier 2 build is DONE under §22.

**Decisions recorded 2026-07-24 — all DONE 2026-07-25:**
- Deployment target: **iOS 17.0** ✅ applied. Swift enforces API availability at compile
  time, so a clean build at target 17.0 is proof no newer API is used unguarded.
- Bundle IDs ✅ renamed: `com.pharaxis.cp-portal` (+ `.tests`, `.uitests`)
- FN-1 + parity remainders (AI search, news pagination, HTML rendering): **locked into next build**
- Next milestone locked: ship-ability + portal-user provisioning, then push + Universal Links
- Apple Developer Program: start on FREE account for Rohith's own iPhone (no TestFlight, no
  push, no Universal Links, 7-day re-sign); $99 membership deferred until milestone 2 starts
- Staging domain: none available currently — Universal Links parked until one exists

**Known engineering gaps (disclosed, not hidden):**
- Draft auto-save on submit forms not yet implemented (web saves drafts to localStorage)
- News pagination/category filter/server-side search still Tier 1 flat load
- Document AI search not yet added
- Attachment upload built but not exercised end-to-end in the simulator walk

**Open questions:**
- Offline document caching — reopens Vasu's data-at-rest assessment
- Whether to design the form renderer for AE now, even if AE does not ship

---

## CP Portal backlog — surfaced by this work, not iOS-specific

| # | Item | Raised by |
|---|------|-----------|
| 1 | AE value-capture defect — dropdowns stored the whole option list; one such case already synced to MIMS | Sowmya |
| 2 | Portal-user provisioning — no `INSERT INTO cp_portal_users` anywhere; admin cannot create the users the portal tells people to ask them for | Bhavya |
| 3 | Consent attribution — `/consent/check` and `POST /consent` read the JWT only from a Bearer header, but login issues an httpOnly cookie; every record since 2026-03-24 is anonymous | Vasu |
| 4 | Consent version mismatch — web records `1.1`, config and iOS use `v1.1`; re-consent cannot match reliably | Vasu |
| 5 | Request-body casing is inconsistent across portal endpoints (`client_code` vs `clientCode`, mixed within `/saved`) | Bhavya |
| 6 | `GET /portal/config/:code` returns only `{name, code}` for the client, so `contact_email` / `contact_phone` never reach any client. The **web** Contact page therefore always renders "Contact information not available" in both slots — a live web defect, not iOS-specific | Bhavya |
