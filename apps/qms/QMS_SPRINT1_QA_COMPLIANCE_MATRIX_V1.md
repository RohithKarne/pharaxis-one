# Pharaxis QMS Sprint 1 — QA Compliance Matrix v1
> Date: 2026-04-09
> Owners: Karthik + Shivani
> Scope: Gate 1 preparation artifact only (no development execution)

---

## 1. QA Principles Locked

1. UAT sign-off for Sprint 1 is internal Pharaxis only.
2. All critical paths require happy, negative, and regression coverage.
3. Compliance evidence must be captured per scenario.
4. Multi-tenant isolation must be proven with DB RLS-aware test cases.
5. Controlled document preview is allowed, but download and print are blocked.

---

## 2. Evidence Standards (Mandatory)

For each executed case, collect at least one:
- Browser screenshot
- API request/response snapshot
- DB query evidence (where relevant)
- Audit trail record reference
- E-signature record reference

Execution log fields:
- Test ID
- Environment
- Data seed used
- Steps
- Expected result
- Actual result
- Evidence link/path
- Pass/Fail

---

## 3. Platform Shared Services Test Matrix

| ID | Area | Scenario | Type | Expected Result |
|---|---|---|---|---|
| PLT-01 | Auth (JWT) | Valid user login with org context | Happy | JWT issued; user mapped to org; session active |
| PLT-02 | Auth (JWT) | Invalid password | Negative | 401; no session; audit event created |
| PLT-03 | Auth (Keycloak) | SSO login success | Happy | Valid Keycloak token accepted; local session created |
| PLT-04 | Auth (Keycloak) | Expired/invalid Keycloak token | Negative | 401/403; denied access; audit event created |
| PLT-05 | Tenant context | Cross-org data access attempt via API path tampering | Negative | Access denied; no foreign org rows returned |
| PLT-06 | RLS | Direct DB query without org setting | Negative | No tenant rows visible |
| PLT-07 | RLS | Query with correct `app.current_org_id` | Happy | Only same-org rows returned |
| PLT-08 | E-signature | Review/approve action requires signature | Happy | Action blocked until e-sign completed |
| PLT-09 | E-signature | Signature replay/duplicate attempt | Negative | Replay rejected; tamper-safe log recorded |
| PLT-10 | Audit hash-chain | Consecutive events create linked `prev_hash -> curr_hash` | Happy | Hash continuity intact |
| PLT-11 | Audit hash-chain | Event payload mutation simulation | Negative | Chain verification fails and is detectable |
| PLT-12 | Notification | Overdue escalation to manager | Happy | In-app + email notification generated |
| PLT-13 | PDF service | Standard report generation | Happy | Valid PDF generated and stored |

---

## 4. Superadmin and Billing-Control Matrix

| ID | Area | Scenario | Type | Expected Result |
|---|---|---|---|---|
| SA-01 | Org control | Create/update/deactivate org | Happy | Org status updates reflected immediately |
| SA-02 | User control | Create user, assign role, disable user | Happy | Access reflects role/status changes |
| SA-03 | Billing control | Update billing plan and usage limits | Happy | Plan/limit changes persisted and auditable |
| SA-04 | Billing reports | Generate org billing report | Happy | Report generated with correct totals |
| SA-05 | Billing security | Attempt payment action in app | Negative | Action blocked (out-of-scope in Sprint 1) |

---

## 5. Module Matrix — Document Control (DC)

| ID | Scenario | Type | Expected Result |
|---|---|---|---|
| DC-01 | Create document with required metadata | Happy | Saved with validation and version 1 |
| DC-02 | Missing required metadata | Negative | Validation error; no save |
| DC-03 | Lifecycle progression in order | Happy | Draft -> Review -> Approved -> Effective -> Retired only |
| DC-04 | Attempt to skip lifecycle state | Negative | Transition blocked |
| DC-05 | Review/approval requires e-signature | Happy | Transition only after e-sign |
| DC-06 | Version supersession on new effective version | Happy | Previous effective auto-retired |
| DC-07 | Periodic review alerts at 90/60/30/7 days | Happy | Alerts sent to owner + manager |
| DC-08 | Controlled copy preview | Happy | Preview allowed with controlled watermark |
| DC-09 | Controlled copy download attempt | Negative | Download blocked |
| DC-10 | Controlled copy print attempt | Negative | Print blocked |
| DC-11 | Search by title/type/department/status | Happy | Results < 2s for target dataset |
| DC-12 | Audit binder inclusion | Happy | Effective documents included in binder |

---

## 6. Module Matrix — CAPA (CA)

| ID | Scenario | Type | Expected Result |
|---|---|---|---|
| CA-01 | CAPA initiated from deviation/audit/manual | Happy | Source recorded correctly |
| CA-02 | CAPA classification missing | Negative | Submission blocked |
| CA-03 | 5-Why capture and save | Happy | Structured analysis persisted |
| CA-04 | Fishbone capture and save | Happy | Cause categories persisted |
| CA-05 | Action plan without action item | Negative | Submission blocked |
| CA-06 | Plan approval with e-sign | Happy | Required before implementation starts |
| CA-07 | Overdue action escalation | Happy | Manager escalation logged |
| CA-08 | Effectiveness fail outcome | Negative | CAPA closure blocked |
| CA-09 | Closure with dual e-signature | Happy | Owner + approver signatures required |
| CA-10 | CAPA binder inclusion with evidence | Happy | Included in binder payload |

---

## 7. Module Matrix — Deviation (DV)

| ID | Scenario | Type | Expected Result |
|---|---|---|---|
| DV-01 | Deviation capture with mandatory fields | Happy | Record created |
| DV-02 | Classification missing | Negative | Save blocked |
| DV-03 | Investigation assignment and due date | Happy | Investigator ownership visible |
| DV-04 | Root cause without findings | Negative | Closure blocked |
| DV-05 | Link deviation to existing CAPA | Happy | Bidirectional link visible |
| DV-06 | Create CAPA from deviation | Happy | CAPA source references deviation |
| DV-07 | Reportability assessment capture | Happy | Yes/No/Under Review with reason |
| DV-08 | Closure without e-sign | Negative | Closure blocked |
| DV-09 | Trending dashboard population | Happy | Metrics reflect seeded records |

---

## 8. Module Matrix — Audit Management (AU)

| ID | Scenario | Type | Expected Result |
|---|---|---|---|
| AU-01 | Create audit and schedule entry | Happy | Calendar reflects audit |
| AU-02 | Pre-audit checklist completion | Happy | Required completion recorded |
| AU-03 | Finding capture with severity | Happy | Finding persisted with metadata |
| AU-04 | Close audit with no findings and no confirmation | Negative | Closure blocked |
| AU-05 | Link finding to CAPA | Happy | CAPA linkage visible |
| AU-06 | Auditee response tracking | Happy | Response stored per finding |
| AU-07 | Audit report PDF generation | Happy | PDF generated with required sections |
| AU-08 | One-click binder generation (50 records) | Happy | Binder generated <= 60 seconds |
| AU-09 | Binder failure and retry path | Negative | Job marked failed with retry log |

---

## 9. Module Matrix — Validation Services (VS)

| ID | Scenario | Type | Expected Result |
|---|---|---|---|
| VS-01 | System inventory registration | Happy | System record stored with GAMP category |
| VS-02 | Risk level assignment and rule application | Happy | Required activities aligned by risk level |
| VS-03 | Validation plan approval with e-sign | Happy | Required before execution |
| VS-04 | Test step execution with Pass/Fail/N/A | Happy | Step outcomes and evidence saved |
| VS-05 | Failed step deviation capture | Happy | Validation deviation linked inline |
| VS-06 | VSR generation | Happy | Auto-generated PDF with plan+protocol+results |
| VS-07 | VSR approval with e-sign | Happy | Required for validation completion |
| VS-08 | Change-triggered re-validation flag | Happy | Flag behavior follows risk + change type |
| VS-09 | Periodic review alerts | Happy | 90/60/30/7 alerts generated |
| VS-10 | Validation binder inclusion | Happy | Full validation packet included in binder |

---

## 10. Non-Functional and Security Matrix

| ID | Area | Scenario | Expected Result |
|---|---|---|---|
| NFR-01 | Performance | Document search under expected load | <= 2 seconds |
| NFR-02 | Performance | Binder generation (50 records) | <= 60 seconds |
| NFR-03 | Security | JWT tampering | Rejected with 401/403 |
| NFR-04 | Security | Keycloak token audience mismatch | Rejected with 401/403 |
| NFR-05 | Security | SQL injection payload on filters | Sanitized; no injection effect |
| NFR-06 | Security | Unauthorized role action attempt | Blocked and audited |
| NFR-07 | Reliability | Retry transient notification/email failures | Retry policy executed and logged |

---

## 11. Gate 2 QA Exit Criteria (Draft)

1. All P1 happy-path scenarios passed.
2. All mandatory negative-path scenarios passed.
3. RLS cross-org leakage tests passed.
4. E-signature and hash-chain evidence tests passed.
5. Binder generation target met for 50-record test data.
6. No open Sev-1 or Sev-2 defects.
7. Evidence package complete and review-ready.

---

## 12. Internal UAT Scope (Sprint 1)

Participants:
- Product: Vanaja + Vinay
- Delivery: Bala
- Engineering: Varun + Bhavya + Vivek
- QA: Karthik + Shivani

UAT decision format:
- Scope covered
- Defects by severity
- Business impact
- Go/No-Go recommendation

