# Pharaxis QMS Sprint 1 — Gate 1 Preparation Log
> Date: 2026-04-09
> Prepared by: Bala + Varun + Bhavya + Vanaja + Vinay + Karthik + Shivani
> Status: PRE-GATE 1 (Planning and design only. No development started.)

---

## 1. Direction Locked by Rohith

| Topic | Decision |
|---|---|
| Development start rule | Do not start development without Rohith approval |
| Build order priority | Login services first, then platform-first execution |
| Auth in Sprint 1 | JWT + Keycloak both active in Sprint 1 |
| Tenancy security | PostgreSQL Row Level Security enforced at DB layer |
| Audit evidence model | Hash-chain evidence (record-to-record linking) required |
| Binder performance target | Target bundle size: 50 records (optimize later if needed) |
| Environment target | Local-first for now; cloud choice deferred to production planning |
| Frontend stack interpretation | Vue + Tailwind + Shadcn-compatible Vue component approach |
| UI quality expectation | Stylish, client-attractive visual quality required |
| Superadmin scope | Org control, user control, billing control/reporting, no payment collection in app |
| Controlled documents UX rule | Preview allowed with controlled watermark, download blocked, print blocked |
| UAT ownership (Sprint 1) | Internal Pharaxis team only |
| QA test depth | All critical compliance and negative-path behaviors must be covered |
| Shivani test data prep | Wait until ER model v1 is finalized |

---

## 2. Platform Baseline Decisions for Design

1. Multi-tenant model remains mandatory with `org_id` on every table.
2. RLS is mandatory at database layer for tenant isolation defense-in-depth.
3. Tamper-evident audit trail must use hash-chain continuity per org stream.
4. Login architecture must support both custom JWT and Keycloak flows in Sprint 1.
5. Superadmin controls are in Sprint 1 scope for operations and governance.

---

## 3. Gate 1 Pre-Condition Checklist (SOP-Aligned)

| Item | Owner | Status |
|---|---|---|
| Acceptance criteria finalized per Sprint 1 module | Vanaja + Vinay | In progress |
| ER model v1 across platform + 5 modules + superadmin | Bhavya | In progress |
| QA test plan drafted before development | Karthik + Shivani | Pending ER v1 |
| Codex prompts prepared per implementation task | Bhavya | Pending ER v1 |
| P1/P2/P3 prioritization validation | Varun + Bhavya | Pending |
| Formal Gate 1 approval request raised | Bala + Varun | Pending |

---

## 4. Immediate Next Actions (No Coding Yet)

1. Bhavya drafts ER model v1 including RLS policy surface and audit hash-chain entities.
2. Vanaja and Vinay publish final acceptance criteria with updated controlled-copy behavior.
3. Karthik drafts QA compliance matrix and internal-UAT criteria based on finalized ER and AC.
4. Bhavya prepares Codex prompt pack task-by-task for Sprint 1 execution.
5. Bala and Varun submit Gate 1 request to Rohith only after all above are complete.

---

## 5. Execution Guardrail

- This document authorizes planning and design preparation only.
- No coding, no implementation, and no feature development starts until Rohith provides explicit Gate 1 approval.
