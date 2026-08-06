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

**Vasu Ranabothu (CCO) owns this classification.** Engineering proposes it in the
pull request; the flag is not final until Compliance confirms it.

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

### CP Portal

**Revalidation impact:** None
**Why:** Health endpoint now reports the build it is actually running instead of
a hardcoded value. No functional change.

- `GET /api/health` returns a `build` block; `version` retained for existing consumers — `backend/server.js`
- Root `package.json` now carries a `name` and `version`
