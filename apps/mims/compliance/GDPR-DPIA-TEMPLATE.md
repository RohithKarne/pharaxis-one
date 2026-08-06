# GDPR DPIA — MIMS

> **Status: DRAFT — not an approved DPIA.**
> Owner: Vasu Ranabothu (CCO). Drafted 2026-08-05 on Rohith's instruction.
>
> **Read this before citing this document.** Until 2026-08-05 this file was six
> lines of headings with `TEMPLATE` in its name. It has been referenced as
> evidence that a data protection impact assessment exists — including in
> `PAUD-3` — and it does not constitute one. Section 2 below is the first
> processing activity assessed in any detail. Everything else remains an
> outline awaiting the same treatment.
>
> Do not present this to a client or an assessor as a completed DPIA.

## 1. Scope and outline

Purpose: medical information and pharmacovigilance case handling.
Data subjects: patients, reporters, HCPs, users.
Legal basis: pharmacovigilance obligation, public health, contract, consent where applicable.
Controls: RTBF workflow, data portability, consent records, DPPR templates, audit
export, data-region selection, and processor/subprocessor review.

**Not yet assessed in detail:** case data processing, the AI provider transfer
path, email ingestion, attachments and OCR, the CP Portal boundary.

---

## 2. Processing activity — API platform: HCP contact disclosure

> Added 2026-08-05 following the PAUD-3 item 9 change. This is the section
> Rohith asked for.

### What changed

`GET /api/v1/contacts` previously returned a hardcoded empty array. It now
returns records from the `contacts` table
(`apps/mims/backend/routes/apiPlatform.js:375`).

**An API surface that disclosed no personal data now discloses personal data.**
The data itself is not new — the route to it is.

### Personal data disclosed

| Field | Category |
|---|---|
| `first_name`, `last_name` | Identifying |
| `email`, `phone` | Contact |
| `institution`, `address` | Professional / location |
| `specialty` | Professional |

**Data subjects:** healthcare professionals and other contacts held by the
controller. Not patients.

**Deliberately excluded** by the implementation: `notes` (unbounded free text,
which could contain clinical or special-category data entered by a user) and
`do_not_update_master` (internal flag). This exclusion is a control and must
not be removed without reassessment.

### Controls in place

| Control | Where | Verified |
|---|---|---|
| Tenant scoping — a client sees only its own org | `apiPlatform.js:375` | **Yes** — probe record in a second org confirmed excluded, 2026-08-05 |
| Bearer token, non-expired, active client | `services/api-platform/apiKeyAuth.js` | Existing control |
| Scope required (`contacts:read`) | `services/api-platform/scopeGuard.js` | Existing control |
| Free-text and internal fields excluded | `apiPlatform.js:375` | Yes — response inspected |
| Rate limiting, call logging | `apiPlatform.js:93` | Existing control |
| Result cap (100 rows) | `apiPlatform.js:375` | Yes |

### The control that is currently doing the most work

`contacts:read` is **not** in `ALLOWED_API_SCOPES`
(`apps/mims/backend/routes/apiPlatform.js:13`). `POST /api/admin/api-clients`
rejects any request for it. **No client can obtain this scope through the
supported route today**, so there is no live disclosure.

This is load-bearing and it is accidental. It is a four-element array with no
comment explaining that editing it opens a personal-data disclosure route.
Two follow-ups below.

**Caveat:** the allow-list guards *client creation via the route*, not the data.
A client seeded directly into `api_clients` — as several already are — bypasses
it entirely. The scope check itself is sound; the grant path is what is
constrained.

### Risk assessment

| | |
|---|---|
| Likelihood of unauthorised disclosure **today** | **Low** — no grantable path |
| Likelihood **if `contacts:read` is added to the allow-list** | **Medium** — any tenant admin could then self-grant for their own org |
| Severity if disclosed | **Medium** — HCP professional contact data, not patient or special-category |
| Overall, current state | **Low** |
| Overall, if the scope is enabled without further control | **Medium** |

### Required before `contacts:read` is enabled

1. A decision on **who** may grant it — tenant admin, or platform admin only.
2. A comment on `ALLOWED_API_SCOPES` naming what each scope discloses.
3. Confirmation that HCP contact disclosure to an integrating system is covered
   by the controller's own notice and lawful basis. **This is the client's
   determination, not ours** — we are processor here.
4. Retention and RTBF: confirm an erasure request removes the record from this
   disclosure path.

### Open questions

- Is `/api/v1/contacts` intended to be reachable at all? It is currently
  implemented and unreachable. **Product decision, not compliance.**
- `/api/v1/content/documents` returns 501 by design and discloses nothing. When
  implemented it needs its own assessment before it returns data.

---

## 3. Review

| Date | By | Change |
|---|---|---|
| 2026-08-05 | Vasu Ranabothu (CCO) | Section 2 added. Draft status and stub history recorded. |

**Pending:** Rohith's approval. Sarvanan has not reviewed this draft.
