# Safety Memory SOP
> **Purpose:** Single source of truth for the Pharaxis Safety application. Intended for any developer, QA engineer, or team member who needs to onboard or resume work without requiring verbal explanation.
> **Scope:** Safety app only. Other apps documented separately in their own SOP files.
> **Update Protocol:** This file is only updated when Rohith explicitly confirms. Rohith says "Bala, update the Safety Memory SOP — [what changed]" and Bala updates it. No one else modifies this file. Each update adds a version note below.

---

## Version History

| Date | Updated By | What Changed |
|------|-----------|--------------|
| 2026-04-06 | Bala | Initial creation — skeleton. Safety app not started. Placeholder for future development. |

---

## 1. What Is Pharaxis Safety

**Pharaxis Safety — Pharmacovigilance & Safety Management System**
A Pharaxis One application for managing adverse events, safety signals, and pharmacovigilance workflows. Argus-equivalent for mid-size life sciences and pharma companies.

**Status:** Skeleton — not started. Build sequence: last (after Vault and QMS).

**Planned industries:** Life sciences, pharma, healthcare.

**Relationship to other apps:** Will consume content from Pharaxis Vault via Content Channels API. Will integrate with MIMS for case data (AE, PC cases).

---

## 2. Full Tech Stack

> To be defined when development starts. Expected: same stack as Pharaxis Vault (Node.js, Express, React, Vite, MySQL).

---

## 3. How to Start the App

> To be completed once app scaffold is built.

---

## 4. System Architecture

> To be defined at sprint planning.

---

## 5. Team Structure

> Full org chart in `docs/TEAM_OPERATING_SOP.md`. Restructured 2026-04-14 — 5-member team. See team.md for full names and roles.

---

## 6. Frontend Route Map

> To be completed once development starts.

---

## 7. Backend API Map

> To be completed once development starts.

---

## 8. Admin Console Sections

> To be defined at sprint planning.

---

## 9. Database Tables Reference

| Detail | Value |
|--------|-------|
| Database name | `pharaxis_safety_dev` (future) |
| Multi-tenancy | `org_id` on every table — no exceptions |

> Tables to be defined at sprint planning.

---

## 9b. Services and Scripts Reference

> To be completed as services are built.

---

## 10. Sprint History

| Sprint | Status | Key Deliverables |
|--------|--------|-----------------|
| — | NOT STARTED | Awaiting Pharaxis Vault + QMS completion |

---

## 11. Current Sprint

**Status: NOT STARTED**
Safety development begins after QMS is complete. Build sequence: Vault → QMS → Safety.

---

## 12. Known Issues and Technical Debt

> None — app not started.

---

## 13. Critical Technical Rules (Must Know)

| Rule | Detail |
|------|--------|
| **org_id everywhere** | Every table must have org_id. No exceptions. |
| **Codex mandatory** | ALL code via codex:codex-rescue. Never Claude Code Edit/Write on app code. |
| **No hard deletes** | Status flags only. |

---

## 14. Process Reference

> Full gate flow and protocols in:
> - `memory/protocols.md`
> - `memory/feedback.md`
> - `TEAM_OPERATING_SOP.md`

---

## 15. How to Update This File

Only Bala updates this file, on Rohith's explicit instruction.

Format: Rohith says → "Bala, update the Safety Memory SOP — [what changed]"
