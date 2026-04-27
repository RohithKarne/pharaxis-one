# Pharaxis Safety — Sprint 1 Scope Document
> Prepared by: Bala (Director of Project Management) + Vanaja (Director of Product Management)
> Reviewed by: Rohith (CPO)
> Date: 2026-04-09
> Status: GATE 1 APPROVED by Rohith (CPO) — 2026-04-09

---

> ⚠ IMPORTANT
> This document is prepared for external team handover.
> Development must NOT begin until Rohith gives explicit Gate 1 approval.
> All questions on this document must be directed to Bala.

---

## 1. Product Overview

**Product Name:** Pharaxis Safety
**Type:** Pharmacovigilance and Safety Management System
**Positioning:** Argus-equivalent for mid-size life sciences and pharma companies
**Suite:** Pharaxis One

---

## 2. Target Clients

| Client | Type | Model |
|--------|------|-------|
| Eversana | CRO (Channel Partner) | Uses Pharaxis Safety operationally. Manages safety for multiple pharma clients. Per-case pricing. |
| PrimeVigilance | CRO (Channel Partner) | Same as Eversana. |
| Sun Pharma | Direct Pharma | Direct licence. Uses platform for own safety operations. |
| Viatris | Direct Pharma | Direct licence. Uses platform for own safety operations. |

**Branding:** Pharaxis Safety is always the product name. CROs provide operational support — they do not white-label or rebrand.
**Pricing Model:** Per case processed.

---

## 3. Sprint Plan Overview

| Sprint | Scope | Stories | Status |
|--------|-------|---------|--------|
| Sprint 1 | Auth + Admin and Configuration | 28 | GATE 1 APPROVED — 2026-04-09 |
| Sprint 2 | Core Case Management | 31 | Planned — starts after Sprint 1 Gate 2 |

---

## 4. Sprint 1 — Detailed Scope

### Sprint 1 Goal
Deliver a fully accessible, configured system. Orgs set up. Users onboarded. Products loaded. Client hierarchy in place. No case processing in Sprint 1 — that is Sprint 2. Sprint 1 is the foundation everything else is built on.

---

### Area 1 — Authentication and Session Management
**Total Stories: 9**

#### 1.1 Login / Logout
- Email + password login
- JWT token generation on successful login
- Logout clears session and invalidates token
- **Acceptance Criteria:**
  - User cannot access any page without a valid login
  - Token expires after configured session timeout
  - Logout redirects to login screen immediately
- **Complexity:** Medium
- **Stories:** 2

#### 1.2 Role-Based Access Control (RBAC)
- Roles defined: Super Admin, CRO Admin, Safety Scientist, Medical Reviewer, Read Only
- Role assigned at user creation
- Role controls module visibility and action permissions
- **Acceptance Criteria:**
  - Each role sees only permitted modules and actions
  - No role escalation without explicit admin action
  - Role permissions enforced at API level, not just UI level
- **Complexity:** Medium
- **Stories:** 3

#### 1.3 Password Management
- Forgot password flow — email link
- Password reset via time-limited link
- First-login forced password reset
- **Acceptance Criteria:**
  - Reset link expires in 24 hours
  - Old password cannot be reused
  - First-login users are forced to set a new password before accessing the system
- **Complexity:** Low
- **Stories:** 2

#### 1.4 Session Management
- Configurable session timeout
- Concurrent session control
- Session activity log per user
- Admin ability to revoke active sessions
- **Acceptance Criteria:**
  - Inactive session terminates after configured period
  - Admin can view and revoke any active session
  - All session events logged with timestamp
- **Complexity:** Medium
- **Stories:** 2

---

### Area 2 — Admin and Configuration
**Total Stories: 19**

#### 2.1 Organisation Management
- Create organisation
- Org type field: CRO or pharma_direct
- Org-level settings
- Deactivate organisation
- **Acceptance Criteria:**
  - CRO org can have multiple pharma clients linked under it
  - Deactivated org: all users lose access immediately
  - Org type drives data isolation rules downstream
- **Complexity:** Medium
- **Stories:** 3

#### 2.2 Client Hierarchy (CRO Model)
- Link pharma client organisations under a parent CRO org
- client_id assigned to every pharma client
- Data isolation enforced at DB and API level
- **Acceptance Criteria:**
  - Pharma Client A cannot see Pharma Client B data even if both sit under the same CRO
  - Isolation enforced at database query level — not just UI filtering
  - CRO Admin can see all their clients. Client users see only their own data.
- **Complexity:** High
- **Stories:** 4
- **Pre-condition:** Client hierarchy DB schema must be confirmed by Rajeev and Varun before this is built. Schema: `organisations` table with `org_type`, `pharma_clients` table with `parent_org_id` reference. Every case carries both `org_id` (CRO) and `client_id` (pharma client).

#### 2.3 User Management
- Invite user via email
- Assign role at invite
- Assign user to org and/or client
- Deactivate user
- Full audit log of user actions
- **Acceptance Criteria:**
  - Deactivated user cannot login — access revoked immediately
  - All user management actions logged with actor, timestamp, and action detail
  - Invited user receives email with time-limited activation link
- **Complexity:** Medium
- **Stories:** 3

#### 2.4 Product and Study Configuration
- Add medicinal products
- Add indications per product
- Add study codes
- Link product to org/client
- **Acceptance Criteria:**
  - Case intake AE suspect product dropdown pulls from configured products only
  - Product must be linked to the correct org/client before it appears in intake
  - Study codes are optional but must be linkable to a product
- **Complexity:** Medium
- **Stories:** 3

#### 2.5 Case ID Configuration
- Define case numbering format per org
- Format: configurable prefix + year + auto-sequence (e.g. EVS-2026-00001)
- Auto-generation on case intake submission
- **Acceptance Criteria:**
  - Every case gets a unique ID on creation — instantly, no manual input
  - Format is org-configurable by CRO Admin or Super Admin
  - Case IDs are never reused, even if a case is deleted
- **Complexity:** Low
- **Stories:** 2

#### 2.6 System Configuration
- Email SMTP configuration
- Notification preferences
- Session timeout value (used by 1.4)
- Audit trail retention period
- **Acceptance Criteria:**
  - All configuration changes are logged
  - Email config is testable (send test email) before saving
  - Session timeout change takes effect on next login
- **Complexity:** Low-Medium
- **Stories:** 2

#### 2.7 Audit Trail — Admin Actions
- Every admin action logged: user create/edit/deactivate, org change, config change, role change
- Log captures: actor, action, timestamp, before value, after value
- **Acceptance Criteria:**
  - Audit log is read-only — cannot be edited or deleted by any user including Super Admin
  - All Area 2 actions appear in audit trail without exception
  - Audit trail is searchable and filterable by date, actor, and action type
- **Complexity:** Medium
- **Stories:** 2

---

## 5. Sprint 1 Story Count Summary

| Area | Stories |
|------|---------|
| Auth and Session Management | 9 |
| Admin and Configuration | 19 |
| **Sprint 1 Total** | **28** |

---

## 6. Data Architecture — Critical Rules

These rules are non-negotiable. Every table, every query must comply.

| Rule | Detail |
|------|--------|
| `org_id` on every table | No exceptions. Every record is org-scoped. |
| `client_id` on all case data | CRO sub-tenant isolation. Enforced at DB level. |
| No hard deletes | Orgs, users, products use active/inactive status flags only. |
| Audit trail mandatory | Every admin action logged. Read-only. Cannot be altered. |
| JWT auth | Token-based. Stored in localStorage as `pharaxis_safety_token`. |
| DB name | `pharaxis_safety_dev` |
| Multi-tenancy model | Single database, `org_id` + `client_id` isolation. No schema-per-org. |

---

## 7. Database — Organisation Hierarchy Model

```
organisations table
┌─────────────────────────────────────────┐
│ org_id │ org_name       │ org_type      │
│   1    │ Eversana       │ CRO           │
│   2    │ PrimeVigilance │ CRO           │
│   3    │ Sun Pharma     │ pharma_direct │
│   4    │ Viatris        │ pharma_direct │
└─────────────────────────────────────────┘

pharma_clients table
┌──────────────────────────────────────────────┐
│ client_id │ client_name     │ parent_org_id  │
│    101    │ [Pharma Client] │       1        │
└──────────────────────────────────────────────┘

RULE: pharma_direct orgs do not use pharma_clients table.
      CRO orgs always route through pharma_clients.
```

---

## 8. Role Permission Matrix

| Module | Super Admin | CRO Admin | Safety Scientist | Medical Reviewer | Read Only |
|--------|:-----------:|:---------:|:----------------:|:----------------:|:---------:|
| Org Management | ✅ | ✅ | ❌ | ❌ | ❌ |
| Client Hierarchy | ✅ | ✅ | ❌ | ❌ | ❌ |
| User Management | ✅ | ✅ | ❌ | ❌ | ❌ |
| Product Config | ✅ | ✅ | ❌ | ❌ | ❌ |
| Case ID Config | ✅ | ✅ | ❌ | ❌ | ❌ |
| System Config | ✅ | ❌ | ❌ | ❌ | ❌ |
| Audit Trail View | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## 9. Tech Stack — Sprint 1

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express |
| Frontend | React + Vite |
| Database | MySQL 8.x — `pharaxis_safety_dev` |
| Auth | JWT |
| Styling | Consistent with Pharaxis One design system |

---

## 10. Sprint 2 Preview (Not in Scope for This Handover)

Sprint 2 delivers Core Case Management. Listed here for context only — do not include in Sprint 1 build.

| Feature | Stories |
|---------|---------|
| Case Intake — Reporter, Patient, AE, Suspect Product | 10 |
| Case Triage — Seriousness, Causality, Priority | 4 |
| Case Processing Workflow — Status progression | 4 |
| Regulatory Clock Tracker — 15-day reporting window | 3 |
| Case Audit Trail | 3 |
| Basic Case Dashboard | 3 |
| **Sprint 2 Total** | **31** |

---

## 11. Open Items — Must Be Resolved Before Development Starts

| # | Item | Owner | Notes |
|---|------|-------|-------|
| 1 | Gate 1 approval | Rohith | Development cannot start without this |
| 2 | Client hierarchy DB schema finalised | Rajeev + Varun | Pre-condition for feature 2.2 |
| 3 | Regulatory clock schema design | Varun + Bhavya | Sprint 2 pre-condition — design can start in Sprint 1 |
| 4 | MedDRA commercial decision | Rohith | Deferred — required by Sprint 3 |
| 5 | Codex prompts per task (Bhavya) | Bhavya | Gate 1 pre-condition per tooling protocol |
| 6 | QA test plan for Sprint 1 (Karthik) | Karthik | Gate 1 pre-condition |

---

## 12. What is Explicitly Out of Scope for Sprint 1

- MedDRA dictionary integration (Sprint 3+)
- Narrative generation (Sprint 2)
- Duplicate detection (Sprint 2)
- Listedness / expectedness check (Sprint 2)
- Regulatory gateway integrations — FDA ESG, EMA, PMDA (Sprint 10+)
- Signal detection engine (Sprint 20+)
- Billing / case count tracking layer (Sprint 3+)
- Any external system integration (Argus, Veeva, IQVIA, HL7 FHIR)

---

## 13. Process Rules for the External Development Team

- All code must go through Codex CLI — no manual Claude Code edits on app code
- No feature is called done without browser verification
- Every status update must be visible in the project chat thread
- No silent fixes — all changes discussed and confirmed in chat
- Gate 1 approval required before development starts
- Gate 2 approval required before QA starts
- Final sign-off belongs to Rohith

---

*Document owner: Bala*
*Approved by: Rohith (CPO) — Gate 1 approved 2026-04-09*
*Do not modify this document without Bala's confirmation*
