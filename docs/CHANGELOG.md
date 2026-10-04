# Changelog — Pharaxis One

Every release gets an entry here. Each entry carries a **revalidation impact**
flag, because the question a regulated client asks about a release is not "what
changed" but "does this make us revalidate?"

> **This file answers PAUD-3 item 1.** Before it existed, neither MIMS nor CP
> Portal could tell a client what a release contained. See
> `docs/TEAM_OPERATING_SOP.md` §26 — nothing here is evidence of verification.

## How to read the impact flag

| Flag | Means | Client action |
|---|---|---|
| **None** | No change to a GxP-relevant function, record, calculation or control | No revalidation |
| **Partial** | A GxP-relevant function changed, but the scope is bounded and named | Revalidate the named area only |
| **Full** | A record structure, audit trail, e-signature, calculation or access control changed | Full revalidation of affected processes |

**Saad Rahman, as compliance owner, owns this classification** (Vasu Ranabothu, CCO,
until 2026-10-01). Engineering proposes it in the pull request; the flag is not final
until he confirms it.

## Format

```text
## <app> <version> — <date>
**Revalidation impact:** None | Partial | Full
**Why:** one line, in the client's language
- change (file or area)
```

---

## Unreleased

### MIMS

**Revalidation impact:** Partial — *revised by Vasu Ranabothu (CCO), 2026-08-05.
Engineering proposed None.*
**Why:** No case record, audit trail, calculation or access rule changed. But
`GET /api/v1/contacts` previously returned an empty array and now returns HCP
personal data — names, emails, phone numbers, institutions and addresses — to
any client holding a `contacts:read` token. An API surface that emitted no
personal data now emits personal data — a new processing route, assessed in
`apps/mims/compliance/GDPR-DPIA-TEMPLATE.md` §2.

**No live disclosure:** `contacts:read` is not in `ALLOWED_API_SCOPES`
(`backend/routes/apiPlatform.js:13`), so no client can obtain the scope through
the supported route. The endpoint is implemented and currently unreachable.

**Revalidate:** the API platform's data-protection assessment, and any client
integration consuming `/api/v1/content/documents` (behaviour changed 200 → 501).

- New `GET /api/v1/build-version` reporting the deployed build — `backend/server.js`
- `GET /api/health` now includes a `build` block, so deploy verification does not need an API token — `backend/server.js`
- `GET /api/v1/contacts` now returns real rows instead of an empty array — `backend/routes/apiPlatform.js`
- `GET /api/v1/content/documents` now returns `501 Not Implemented` instead of an empty `200` — `backend/routes/apiPlatform.js`
- New `runtime-health-watch` cron raising a platform-admin alert when runtime health degrades — `backend/services/runtimeHealthWatchService.js`
  - **Deployment note:** the alert rule ships with no recipient. Set one per environment on the platform-admin alert rules screen, or the rule records an event and reaches nobody.
- Optional TLS on the MySQL connection, off unless configured — `backend/database/db.js`

---

## Unreleased — CP Portal

**Not tagged.** On 4 Oct 2026 Rohith decided not to tag CP Portal releases for now, and
to remove the old `v1.0.0` tag. This entry records everything on `main` so the change
history and its revalidation flag exist when a release is tagged. It absorbs the earlier
"Unreleased — CP Portal" note (the health endpoint's `build` block).

**Revalidation impact:** Full. *Proposed by engineering (Varun Karne). Confirmed by
Saad Rahman, compliance owner, in the 3 Oct 2026 team session.*
**Why:** No CP Portal version has been validated under this change log, so there is
nothing earlier to compare against. It also changes access control (roles, lock-out, single sign-on), the audit
trail (what changed, from and to; exports recorded), and record structures (safety
confirmations, training attempts, consent proof, access requests). Each of these alone
is "Full" under the table above.
**Revalidate:** the whole application, as an initial validation. The areas below are
the ones a validation plan should name.

### Access control and sign-in
- A role may change only its own areas, and the admin menu shows each person only those screens — CPPM-60, CPPM-124
- Five wrong passwords lock a sign-in for 30 minutes, and admins can unlock it — CPPM-49 (#685)
- A portal set to "single sign-on only" refuses password sign-in, and single sign-on no longer creates accounts — CPPM-50, CPPM-51 (#684, #686)
- Sign Out ends the session on the server — CPPM-40 (#671)
- Doctors can request access, and admins approve or decline it from Inbox › Access Requests — CPPM-113, CPPM-128
- A client's own staff land on their client, and reviewers on their Inbox — CPPM-129, CPPM-133

### Audit trail and records
- An admin edit's audit entry records what changed, from and to — CPPM-43 (#676)
- Doctors confirm "I have read this" on high and critical safety letters, with who and when recorded — CPPM-114
- Reports › Safety Confirmations shows who confirmed each letter, with a CSV export that is itself audited — CPPM-127
- Doctors who have not confirmed a high or critical letter after 3 days get one reminder email, recorded per doctor and shown on the report — CPPM-137 (migration 0043)
- Training records a named person's attempts and issues real certificates; the fake "accredited" certificate is gone — CPPM-15, CPPM-48 (#687, #683)
- Consent proof, document approval, answers sent back to the doctor, and erasure that reaches MIMS — CPPM-4, 9–14, 29, 31, 39 (#670)

### Submissions and the MIMS bridge
- Portal submissions reach MIMS reliably, with alerts, close and reopen, one answer path, follow-ups and two-way erasure (#701, #702)
- The form checks dates, numbers and choices on the server; drafts are kept; doctors check their answers before sending — CPPM-84–95, CPPM-112 (#709)
- The safety team is told when someone reports becoming unwell, and high and critical alerts always notify — PD-2, CPPM-108

### Doctor portal
- "For you" on Home, matched by specialty, followed areas and area tags; an event page with Register and Add to calendar; notifications that open the exact item — CPPM-115–117, CPPM-122 (#709)
- Clinical Trials and Training show only when they have published content — CPPM-109

### Admin console
- Seven main screens with tabs, a "Go to…" quick search, and a dashboard "Waiting on you" panel — CPPM-123, CPPM-130, CPPM-131
- The dashboard shows each client's lowest safety-letter confirmation rate — CPPM-138
- The client Overview follows the 7-screen menu and shows only statuses taken from real data; Overview and dashboard share one readiness score (eight checks, no free points) — CPPM-135, CPPM-136
- The access-request alert points to Inbox › Access Requests; an alert resolved by hand no longer silences the next access request or connection failure — CPPM-139, CPPM-140
- The virus scanner starts with the portal, and admins see when it is down — CPPM-44 (#679)
- Classic look, and Katrina's six UI/UX priorities (#707, #708)
- Fixes: collapsed sidebar width, page titles, client names cut short on the dashboard — CPPM-125, CPPM-126, CPPM-134

### Platform
- Database migrations 0039–0043, folded into the baseline and checked by the fresh-install test (`backend/tests/fresh-provision.js`)
- `GET /api/health` returns a `build` block; `version` is kept for existing consumers — `backend/server.js`
- Each page loads on demand, so the portal sign-in no longer downloads the admin console (#704)

**Not in this release's evidence:** there are no automated end-to-end tests (SOP §29 is retired). Each change was checked by a person on the real screen, as recorded in its pull request and Jira ticket.
