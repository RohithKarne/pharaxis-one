# Pharaxis QMS Sprint 1 — ER Model v1 (Draft)
> Date: 2026-04-09
> Owner: Bhavya
> Status: Draft for Gate 1 preparation (no implementation started)

---

## 1. Design Rules

1. Every business table carries `org_id`.
2. All tenant-scoped tables are protected by PostgreSQL RLS.
3. No hard delete on compliance records (`is_deleted` or status-based retirement).
4. UTC timestamps for all compliance and signature events.
5. Audit trail uses hash-chain continuity per org.

---

## 2. Shared Platform Entities

| Table | Purpose |
|---|---|
| `qms_orgs` | Tenant master |
| `qms_users` | User identity per org |
| `qms_roles` | Role definitions |
| `qms_user_roles` | User to role mapping |
| `qms_permissions` | Permission catalog |
| `qms_role_permissions` | Role to permission mapping |
| `qms_auth_accounts` | JWT/Keycloak identity linkage |
| `qms_e_signatures` | CFR Part 11 / Annex 11 signature records |
| `qms_audit_events` | Immutable append-only audit events with hash-chain |
| `qms_notifications` | In-app notification queue |
| `qms_email_notifications` | Email delivery status and retry metadata |
| `qms_file_objects` | Azure blob object metadata (URI, checksum, mime type) |

---

## 3. Superadmin and Billing-Control Entities (No Payment Collection)

| Table | Purpose |
|---|---|
| `sa_org_profiles` | Extended org profile and lifecycle status |
| `sa_org_feature_flags` | Module enablement per org (feature-flag model) |
| `sa_org_billing_controls` | Billing plan, limits, billing status control |
| `sa_org_billing_reports` | Billing snapshots and report metadata |
| `sa_user_admin_actions` | Superadmin actions for org/user governance |

---

## 4. Module 1 — Document Control (DC)

| Table | Purpose |
|---|---|
| `dc_documents` | Document master record |
| `dc_document_versions` | Version history |
| `dc_document_workflows` | Workflow config by doc type |
| `dc_document_workflow_steps` | Ordered steps (review/approve) |
| `dc_document_reviews` | Review/approval activity records |
| `dc_document_periodic_reviews` | Periodic review schedule and due tracking |
| `dc_document_acknowledgements` | Read-and-understood records |
| `dc_document_access_policies` | Role-based access rules |
| `dc_document_exports` | Audit binder inclusion/export history |

---

## 5. Module 2 — CAPA (CA)

| Table | Purpose |
|---|---|
| `ca_capa_records` | CAPA master |
| `ca_capa_sources` | Source linkage (deviation/audit/manual) |
| `ca_root_cause_5why` | 5-Why structured entries |
| `ca_root_cause_fishbone` | Fishbone categories and causes |
| `ca_action_plans` | CAPA action plan master |
| `ca_action_items` | Individual CAPA actions |
| `ca_effectiveness_checks` | Effectiveness verification records |
| `ca_escalations` | Overdue escalation logs |
| `ca_capa_metrics_daily` | Dashboard aggregates |

---

## 6. Module 3 — Deviation (DV)

| Table | Purpose |
|---|---|
| `dv_deviation_records` | Deviation master |
| `dv_containment_actions` | Immediate action capture |
| `dv_investigations` | Investigation ownership/findings |
| `dv_regulatory_assessments` | Reportability decision log |
| `dv_deviation_capa_links` | Bidirectional link to CAPA |
| `dv_deviation_metrics_daily` | Trending aggregates |

---

## 7. Module 4 — Audit Management (AU)

| Table | Purpose |
|---|---|
| `au_audits` | Audit master |
| `au_audit_assignments` | Lead/co-auditor assignments |
| `au_pre_audit_checklists` | Checklist definition and completion |
| `au_findings` | Finding records |
| `au_finding_capa_links` | CAPA links per finding |
| `au_auditee_responses` | Auditee responses and action proposals |
| `au_audit_reports` | Generated audit report metadata |
| `au_binder_jobs` | One-click binder job status and performance tracking |
| `au_binder_items` | Included records per binder job |

---

## 8. Module 5 — Validation Services (VS)

| Table | Purpose |
|---|---|
| `vs_system_inventory` | Client system inventory |
| `vs_validation_plans` | IQ/OQ/PQ/UAT planning |
| `vs_protocol_templates` | Protocol templates |
| `vs_protocol_instances` | Template instances per system |
| `vs_test_scripts` | Script headers |
| `vs_test_script_steps` | Script steps with pass/fail/N/A |
| `vs_validation_deviations` | Validation deviations from failed steps |
| `vs_validation_summary_reports` | Generated VSR metadata |
| `vs_revalidation_flags` | Change-triggered re-validation markers |
| `vs_periodic_reviews` | Validation periodic review schedule |
| `vs_validation_metrics_daily` | Dashboard aggregates |

---

## 9. Key Cross-Module Relationships

1. `dv_deviation_records` can create or link to `ca_capa_records`.
2. `au_findings` can create or link to `ca_capa_records`.
3. `au_binder_jobs` compiles records from DC, CA, DV, AU, and VS entities.
4. `qms_e_signatures` links to workflow actions across DC/CA/DV/AU/VS by `entity_table` + `entity_id`.
5. `qms_audit_events` captures all major create/update/state/signature actions from every module.

---

## 10. Core Compliance Columns (Applied Broadly)

- `id` (UUID PK)
- `org_id` (UUID FK -> `qms_orgs.id`)
- `status` (TEXT/ENUM)
- `created_by`, `updated_by` (UUID FK -> `qms_users.id`)
- `created_at`, `updated_at` (TIMESTAMPTZ, UTC)
- `is_deleted` (BOOLEAN default false) where required

---

## 11. RLS Policy Pattern (Template)

Each tenant table follows the same pattern:

```sql
USING (org_id = current_setting('app.current_org_id', true)::uuid)
WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid)
```

`app.current_org_id` is set per request after auth resolution (JWT/Keycloak).

---

## 12. Hash-Chain Audit Model (Template)

`qms_audit_events` maintains:
- `prev_hash` = previous event hash for same `org_id`
- `curr_hash` = SHA-256 hash over event payload + previous hash

This provides tamper evidence for sequence integrity.

---

## 13. Gate 1 Output Dependencies

1. Vinay acceptance criteria final text mapped to table-level rules.
2. Karthik QA matrix mapped to module entities and negative-path checks.
3. Implementation task pack generated from this ER baseline after review.
