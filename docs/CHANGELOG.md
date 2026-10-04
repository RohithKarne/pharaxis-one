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

### MIMS — end-to-end walk fixes (MIPM-132 to MIPM-221, branch `claude/jolly-euler-fm0j12`)

**Revalidation impact:** Full — *proposed by engineering and confirmed by Saad Rahman (compliance owner), 2026-10-04; Rohith approved the same day, with Varun's after-the-fact read of the idle sign-out, module approval and signature, hand-off sign-off, group-rights and FAQ check-in changes.*
**Why:** audit trail, electronic signatures, access rules and record locks changed for AE / PC cases and content.

**Revalidate:** AE and PC case capture and closure, PV / Quality hand-offs, MI response sending,
content review, approval and publication (documents, FAQs, modules), sign-in sessions.

- Case records: AE and PC versions lock when closed; closed cases refuse changes and new hand-offs; AE rows can be edited in place; follow-up AE versions start as a copy — MIPM-160 to 170, 207 to 209
- Audit trail: every AE, PC, drug and hand-off change is recorded field by field; MI response signatures appear on the case timeline — MIPM-169, 171
- E-signatures: accepting or closing a PV / Quality hand-off needs the approve right, password and reason; module approval and publication now need password and reason — MIPM-163, 164, 220
- Access: content changes follow Content Management rights; drafts are hidden from people without Content Management; MI categories, hand-off assignees and review mode are limited to the right people — MIPM-175, 184, 202, 203, 210, 212
- Content lifecycle: review closes when every reviewer decides; authors cannot approve their own module; approved or published module text cannot change without going back to Draft; agents can read published FAQs — MIPM-174 to 183, 216, 219
- Sessions: the idle timeout is enforced by the server, not only the browser; sessions are stored by fingerprint — MIPM-172, 211
- Records added by migration: 151 to 158 (version locks, session fingerprint and last use, reviewer content access, template evidence status, contact field step, MI categories, content-usage backfill)
- Follow-up (no Jira, epic MIPM-131): FAQ check-in always goes to Pending (the no-approval option could never publish); module version moves on change and publication; archived modules open read-only; AE event edits no longer fail on empty coded fields; a security group created through the API now grants the rights it lists; reviewers and agents no longer see buttons or filters they cannot use
- Migrations 159 (link earlier AE products to the dictionary, open versions only) and 160 (remove logo files no organisation uses)
- Rohith's decisions of 4 Oct 2026 (epic MIPM-131): a security group shows the rights built into its members' role as locked — a group only adds rights (MIPM-192); sequential review — reviewers decide one after another in a chosen order, each told when it is their turn, a rejection closes the review at once (MIPM-204, migration 162); with Drug Roles on, an AE case shows Drugs and hides Product Info unless it already holds rows; Pharaxis support staff open a client's cases only while that client's admin has granted time-boxed support access, each grant, revocation and case opened being recorded (migration 161, new screen System › Security › Support Access); the unreachable admin Sites panel is deleted

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

### CP Portal end-to-end walk (4 Oct 2026, branch `claude/gallant-rubin-43pd3g`, no Jira per Rohith)

**Revalidation impact of this batch:** Partial — *proposed by Saad Rahman (compliance owner); Rohith to confirm.*
**Why:** sign-in behaviour and the audit-trail export changed; no record structure or calculation changed. The export now contains every matching record where it held one page, which is a correction of the evidence an auditor receives, not a change to what is recorded.
**Revalidate:** admin sign-in (Superadmin mode), portal sign-in and the specialty prompt; client activation; the audit-trail export.

- Area 1, sign-in: the admin sign-in page's Superadmin mode now ends the session it refuses. Before, "Superadmin access required" was shown while the client admin was already signed in on the next page load — `frontend/src/admin/pages/LoginPage.jsx`
- Area 1, sign-in: a doctor whose specialty is already saved is no longer asked to choose it again at every sign-in; sign-in, email verification and gate confirmation now return the saved specialty — `backend/routes/portal/auth.js`
- Area 2, Clients: a blank or spaces-only company name is refused on create and edit; the client code must be lowercase letters, digits and single hyphens — `backend/routes/admin/clients.js`
- Area 2, Clients: a deactivated client stays on the list, marked Inactive, with an Activate button; the dashboard's inactive count is real — `backend/services/clientService.js`
- Area 2, Clients: Deactivate asks first, naming the client and saying the portal goes offline at once — `frontend/src/admin/pages/ClientsPage.jsx`
- Area 2, Clients: deactivating, reactivating or renaming a client reaches its portal immediately instead of after the 20-second settings cache — `backend/routes/admin/clients.js`
- Area 2, Clients: new Edit button to change a client's name, description and contact; the code stays locked because it is the portal's address — `frontend/src/admin/pages/ClientsPage.jsx`
- Area 2, Audit trail: the CSV export carries every record that matches the filters, not only the page on screen; the Entity and Action filters list what was actually recorded and match regardless of case — `backend/routes/admin/audit.js`, `frontend/src/admin/pages/AuditTrailPage.jsx`
- Area 2, access: a client's own staff opening another client's address are sent to their own client instead of seeing empty screens — `frontend/src/App.jsx`

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
- The confirmations report lists a letter's doctors 50 at a time; counts and CSV still cover all — CPPM-143
- Admins can read any outbox email as it would be sent; emails carrying a sign-in or reset link are never shown, and each read is audited — CPPM-144
- A doctor's My Activity lists the safety letters they confirmed, with the time, and those still waiting — CPPM-145
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
- On a phone or small tablet: wide tables scroll inside themselves, the Overview and dashboard stack, and the top bar names the client in full — CPPM-146–149

### Platform
- Database migrations 0039–0043, folded into the baseline and checked by the fresh-install test (`backend/tests/fresh-provision.js`)
- `GET /api/health` returns a `build` block; `version` is kept for existing consumers — `backend/server.js`
- Each page loads on demand, so the portal sign-in no longer downloads the admin console (#704)

**Not in this release's evidence:** there are no automated end-to-end tests (SOP §29 is retired). Each change was checked by a person on the real screen, as recorded in its pull request and Jira ticket.
