# Pharaxis Safety — Sprint 2 Focused UAT Report
Date: 2026-04-10
Mode: Browser-facing flow checklist (executed via UAT automation mapped to UI actions)
Command: `npm run test:uat:sprint2:focused`
Result: Passed

## Checklist Results

| ID | Area | Browser-Facing Step | Status | Evidence |
|---|---|---|---|---|
| UAT-01 | Access | Login as Super Admin from Login screen | Passed | Token issued for `safety.superadmin@pharaxis.one` |
| UAT-02 | Setup | Create CRO org, client, and product from Admin screens | Passed | `org=s2-uat-org-1775828541555`, `client=S2U-541555`, `product=S2UP-41555` |
| UAT-03 | Case Intake | Save intake draft from Case Management intake card | Passed | `draftKey=uat-draft-1775828541555` |
| UAT-04 | Case Intake | Run duplicate precheck from intake form | Passed | `duplicateCount=0` |
| UAT-05 | Case Intake | Submit new case from intake form with attachments | Passed | `case=S2U-2026-00014` |
| UAT-06 | Cases Grid | Update intake and add follow-up attachment from row action | Passed | `attachments=2` |
| UAT-07 | Cases Grid | Assign Medical Reviewer from reviewer dropdown action | Passed | `reviewerUserId=62` |
| UAT-08 | Cases Grid | Run triage, status transition, and exception flow | Passed | Final `status=in_review` |
| UAT-09 | Regulatory | Use regulatory clock edit and pause/resume actions | Passed | `clockStatus=running` |
| UAT-10 | Dashboard | Load summary and run regulatory alert evaluation | Passed | `totalCases=1`, `alerts=0` |
| UAT-11 | Dashboard Filters | Save and apply dashboard filter from controls | Passed | `savedFilterId=3`, `rows=1` |
| UAT-12 | Deep View | Validate workflow, duplicates, audit, and SLA panels | Passed | `workflow=5`, `audit=11` |
| UAT-13 | Narrative | Generate, edit, and approve narrative | Passed | `narratives=1` |
| UAT-14 | Listedness | Submit listedness/expectedness assessment | Passed | `assessmentId=2` |
| UAT-15 | Case Audit | View org audit feed and export CSV | Passed | `auditRows=15` |
| UAT-16 | Cleanup | Delete intake draft from draft list action | Passed | `draftDeleted=uat-draft-1775828541555` |

## Summary

| Metric | Value |
|---|---|
| Total steps | 16 |
| Passed | 16 |
| Failed | 0 |
| Blocked | 0 |

