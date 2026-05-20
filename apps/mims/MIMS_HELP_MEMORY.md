# MIMS Help Memory File
*Sprint 21 — In-App Help System*
*Created: 2026-04-24 | Owner: Bala (PMO/AI) | Last updated by: Varun (CTO)*

---

## Purpose

This file is the **canonical index of all help articles** in MIMS. When new articles need to be added in future sprints, consult this file to:
1. Find the correct `feature_key` and `feature_group` to use
2. Follow the established 4-block article structure
3. Ensure audience targeting is consistent with existing articles
4. Run the bulk-import endpoint to upsert new content

---

## Article Structure (4-Block Standard)

Every help article MUST follow this HTML structure:

```html
<h4>What is this?</h4>
<p>Brief explanation of what the feature/section is.</p>

<h4>When to use it</h4>
<p>Context — when the user would encounter or need this feature.</p>

<h4>How to do it</h4>
<ol>
  <li>Step one</li>
  <li>Step two</li>
</ol>

<h4>What happens next?</h4>
<p>Outcome — what the system does after the user takes the action.</p>
```

---

## Audience Values

| Value | Who it targets |
|-------|----------------|
| `all` | Every logged-in user (use for orientation articles) |
| `agent` | Case processing agents only |
| `cm_admin` | Content Management admins |
| `admin` | Org admins |
| `platform_admin` | Platform admins only |

Multiple values can be combined: `["agent", "cm_admin"]`

---

## Feature Key Convention

Pattern: `{module}.{sub-feature}` (dot-separated, lowercase, underscores for spaces)

| feature_key | feature_group | Description |
|-------------|---------------|-------------|
| `general` | *(null)* | Platform orientation, navigation, general |
| `cases` | `cases` | Cases module overview, statuses |
| `cases.create` | `cases` | New case creation form |
| `cases.detail` | `cases` | Case detail page |
| `cases.contacts` | `cases` | Case contacts tab |
| `cases.mi` | `cases` | Medical information tab |
| `cases.ae` | `cases` | Adverse events tab |
| `cases.pc` | `cases` | Product complaints tab |
| `cases.workflow` | `cases` | Assignments, escalation, closure |
| `cm.folders` | `cm` | Content Management folders |
| `cm.documents` | `cm` | Documents — upload, versioning, bulk actions |
| `cm.modules` | `cm` | Reusable content modules |
| `cm.templates` | `cm` | Response / Transmission / Correspondence templates |
| `cm.merge_reports` | `cm` | Merge report generation from case data |
| `cm.faqs` | `cm` | FAQs — create, approve, expire |
| `cm.reviews` | `cm` | Periodic content review cycles |
| `browse` | `browse` | Browse Content module — agents viewing approved content |
| `reports` | `reports` | Reports & analytics |
| `inbox` | `inbox` | Notification inbox |
| `admin.picklists` | `admin` | Dropdown values configuration |
| `admin.field_setup` | `admin` | Custom fields on case forms |
| `admin.workflow` | `admin` | Workflow stages and transition rules |
| `admin.product_dictionary` | `admin` | Product and brand list |
| `admin.security_groups` | `admin` | Role-based access control |
| `admin.case_numbering` | `admin` | Auto case number format |
| `admin.organisations` | `admin` | Organisation and site management |
| `admin.content_intelligence` | `admin` | AI content analysis tools |
| `admin.policy_graph` | `admin` | Policy relationship visualisation |

---

## Current Article Index (Sprint 21 Seed — v1)

| # | Title | feature_key | Audience | Sort |
|---|-------|-------------|----------|------|
| 1 | Welcome to MIMS | `general` | all | 1 |
| 2 | Navigating the Platform | `general` | all | 2 |
| 3 | Cases Overview | `cases` | agent, cm_admin, admin, platform_admin | 10 |
| 4 | Case Statuses Explained | `cases` | agent, cm_admin, admin | 11 |
| 5 | Creating a New Case | `cases.create` | agent, admin | 12 |
| 6 | Case Detail Page Guide | `cases.detail` | agent, cm_admin, admin | 13 |
| 7 | Managing Case Contacts | `cases.contacts` | agent, admin | 14 |
| 8 | Medical Information (MI) Section | `cases.mi` | agent, admin | 15 |
| 9 | Adverse Event (AE) Reporting | `cases.ae` | agent, admin | 16 |
| 10 | Product Complaint (PC) Reporting | `cases.pc` | agent, admin | 17 |
| 11 | Case Workflow & Assignments | `cases.workflow` | agent, admin | 18 |
| 12 | Content Folders | `cm.folders` | cm_admin, admin, platform_admin | 20 |
| 13 | Managing Documents | `cm.documents` | cm_admin, admin, platform_admin | 21 |
| 14 | Document Versioning & Checkout | `cm.documents` | cm_admin, admin | 22 |
| 15 | Bulk Document Actions | `cm.documents` | cm_admin, admin | 23 |
| 16 | Content Modules | `cm.modules` | cm_admin, admin | 30 |
| 17 | Response Templates | `cm.templates` | cm_admin, admin | 40 |
| 18 | Template Merge Fields Reference | `cm.templates` | cm_admin, admin | 41 |
| 19 | Merge Reports | `cm.merge_reports` | cm_admin, admin, agent | 50 |
| 20 | FAQs Management | `cm.faqs` | cm_admin, admin | 60 |
| 21 | FAQ Approval Workflow | `cm.faqs` | cm_admin, admin | 61 |
| 22 | Content Reviews | `cm.reviews` | cm_admin, admin | 70 |
| 23 | Browse Content | `browse` | agent, cm_admin, admin | 80 |
| 24 | Previewing Documents & Modules | `browse` | agent, cm_admin, admin | 81 |
| 25 | Reports & Analytics | `reports` | agent, cm_admin, admin, platform_admin | 90 |
| 26 | Inbox & Notifications | `inbox` | all | 95 |
| 27 | Managing Picklists | `admin.picklists` | admin, platform_admin | 100 |
| 28 | Field Setup & Custom Fields | `admin.field_setup` | admin, platform_admin | 101 |
| 29 | Workflow Activities | `admin.workflow` | admin, platform_admin | 102 |
| 30 | Product Dictionary | `admin.product_dictionary` | admin, platform_admin | 103 |
| 31 | Security Groups & Permissions | `admin.security_groups` | admin, platform_admin | 104 |
| 32 | Case Numbering Configuration | `admin.case_numbering` | admin, platform_admin | 105 |
| 33 | Organisation Management | `admin.organisations` | platform_admin | 110 |
| 34 | Content Intelligence — Overview | `admin.content_intelligence` | admin, platform_admin | 120 |
| 35 | Evidence Chain Analysis | `admin.content_intelligence` | admin, platform_admin | 121 |
| 36 | Policy Graph | `admin.policy_graph` | admin, platform_admin | 130 |

---

## How to Import Articles

Send the seed file to the bulk-import endpoint:

```bash
curl -X POST https://<host>/api/admin/help/bulk-import \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d @help-seed/help_articles_seed.json
```

Expected response:
```json
{ "message": "Bulk import complete.", "inserted": 36, "updated": 0, "skipped": 0, "errors": [] }
```

---

## How to Add New Articles (Future Sprints)

1. **Identify the feature_key** from the table above, or define a new one following the naming convention.
2. **Write the article** using the 4-block HTML structure.
3. **Set audience** — be specific; don't use `all` unless genuinely applicable to every role.
4. **Choose sort_order** — higher numbers appear lower in the list; use gaps of 10 between related articles.
5. **Add to seed JSON** or POST directly to `/api/admin/help`.
6. **Update this file** — add the article to the index table and, if a new feature_key, to the feature key table.
7. **Mark reviewed** — after Bhavya QA verifies the article against live UI, call `PATCH /api/admin/help/:id/reviewed`.

---

## Stale Article Policy

Articles are flagged as stale when `last_reviewed_at` is NULL or older than **90 days**.

- View stale articles: **Platform Admin → Help Content → Needs Attention** tab
- Or via API: `GET /api/admin/help/stale`
- Each article should be reviewed and marked via `PATCH /api/admin/help/:id/reviewed` at least quarterly.

---

## Technical Notes

- **Cache**: Public help endpoints cache for 10 minutes (in-memory Map). Cache busts automatically on any admin write.
- **Search**: MySQL FULLTEXT index on `(title, content_html, summary)` — searches use BOOLEAN MODE.
- **Fallback chain**: Contextual fetch tries exact key → parent key → feature_group → `general`.
- **view_count**: Incremented fire-and-forget on every `GET /api/help` hit — used to track article popularity.
- **Org-specific articles**: Set `org_id` on an article to show it only to that organisation's users (takes priority over global articles with the same key).

---

*Next update: after Sprint 22 features are added. Assign to Bhavya for QA verification of all articles.*
