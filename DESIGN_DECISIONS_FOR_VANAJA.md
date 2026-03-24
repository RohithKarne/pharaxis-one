# Design Decisions Review — For Vanaja (PM)

**Date:** 2026-03-23
**From:** Rajeev (Technical Lead)
**To:** Vanaja (Product Manager)
**Status:** Awaiting Responses

---

## INSTRUCTIONS

Please review each question below and provide your answer or feedback. For each question:
- **Select the recommended option** OR
- **Write a custom answer** OR
- **Ask for clarification** if the question is unclear

Your answers will be documented in the **Design Decisions Log** and become part of the official technical specification for development.

---

## SECTION 1: INTEGRATION QUESTIONS

### **Q1. [CM ↔ Admin Console] How should CM document usage be tracked and reported?**

**Context:** Content Management publishes documents that agents use in cases. Admin Console has an Analytics section. Should admins be able to see which cases used which documents?

**Options:**
- [ ] **Option A:** Only high-level stats in Admin Console (total documents published, publish frequency by month)
- [ ] **Option B:** Full drill-down available — "Which cases used Document X", "List all cases using Product Y docs"
- [ ] **Option C:** Defer entirely to V2 — no usage tracking in V1

**Your Answer:**

---

### **Q2. [Notification Flow] When Content Management publishes a new document, who gets notified?**

**Context:** Publishing triggers notifications. But the recipient list is undefined. Should this be broadcast to all users, or targeted?

**Options:**
- [ ] **Option A:** All active users in the system (broadcast notification)
- [ ] **Option B:** Only case agents and field users (those who actually use documents in case responses)
- [ ] **Option C:** Only users configured in the document's "Alert Recipients" field
- [ ] **Option D:** Per-role notifications (different message for admins vs agents vs portal users)
- [ ] **Option E:** Custom — *please specify:*

**Your Answer:**

---

### **Q3. [Dependency Tracking] Should Admin Console "Dependency Mapping" show CM dependencies?**

**Context:** When an admin tries to delete a picklist, should they see "Warning: This picklist is used by 5 FAQs in Content Management"?

**Options:**
- [ ] **Option A:** Yes, include CM dependencies (comprehensive, best UX, more database queries)
- [ ] **Option B:** No, only track case/workflow dependencies (simpler, faster, Admin Console scope)
- [ ] **Option C:** Optional feature flag — admins can enable/disable CM tracking

**Your Answer:**

---

### **Q4. [Email Retry Infrastructure] For Admin Console's email retry (3 retries × 5 minutes), which infrastructure?**

**Context:** Failed notification emails must retry 3 times at 5-minute intervals. The implementation approach affects architecture.

**Options:**
- [ ] **Option A:** Background job queue (Bull, BullMQ, RabbitMQ) — enterprise standard, scales to thousands of emails
- [ ] **Option B:** Cron job polling retry_log table every 5 minutes — simpler, adequate for V1 volume
- [ ] **Option C:** Either approach is acceptable — Rajeev can choose based on team preference

**Your Answer:**

---

## SECTION 2: DATABASE/SCHEMA QUESTIONS

### **Q5. [Document Content] Can a document have BOTH file upload AND rich-text content simultaneously?**

**Context:** Document creation offers two methods: (1) Upload file (PDF/DOC/DOCX), or (2) Author with rich text editor. Can both be used in one document?

**Options:**
- [ ] **Option A:** Mutually exclusive — a document is EITHER file-based OR rich-text-based (one method per doc)
- [ ] **Option B:** Both can coexist — file for main document, rich-text for cover letter text (separate fields)
- [ ] **Option C:** Rich text is only for editing/preview; the final published version must always be file-based

**Your Answer:**

---

### **Q6. [FAQ Auto-Publish] When "Approval Required = unchecked", what happens at Check-In?**

**Context:** FAQ creation has "Approval Required" checkbox. If unchecked, the FRD says it "goes directly to Published". But what does this mean technically?

**Options:**
- [ ] **Option A:** Truly auto-published — status immediately becomes "Published" on Check-In (no additional steps)
- [ ] **Option B:** Moves to "Pending Publish" state — still requires publisher to click Publish button (for audit trail)
- [ ] **Option C:** Workflow is configurable per FAQ — some auto-publish, some require manual publish

**Your Answer:**

---

### **Q7. [Version Status Transitions] Can a Document version skip states in the lifecycle?**

**Context:** Lifecycle is: Draft → Pending → Under Review → Approved → Published → Archived. Can this sequence be bypassed?

**Options:**
- [ ] **Option A:** Strict enforcement — must follow exact path, no shortcuts allowed
- [ ] **Option B:** Admins can force-publish Draft directly (for urgent/time-sensitive content)
- [ ] **Option C:** Flexible per-version — each version independently chooses its workflow path
- [ ] **Option D:** Skip Review/Approval for certain document types (e.g., Internal Documents don't need review)

**Your Answer:**

---

### **Q8. [User Security Groups] Can a user belong to multiple security groups?**

**Context:** User Configuration shows "User Security Group" as a dropdown field. But can exceptions be added via multiple group memberships?

**Options:**
- [ ] **Option A:** Single security group per user — dropd own select one group only
- [ ] **Option B:** Multiple groups per user — permissions are UNION of all groups (additive)
- [ ] **Option C:** Primary group + optional secondary groups — primary is default, secondaries add specific exceptions

**Your Answer:**

---

## SECTION 3: API/BACKEND QUESTIONS

### **Q9. [Merge Report Validation] When should merge field validation happen?**

**Context:** Merge Reports are DOC/DOCX files with merge fields that pull case data (e.g., {{case_id}}, {{patient_name}}). When should we validate these field names?

**Options:**
- [ ] **Option A:** At upload time — validate immediately; fail with error if merge fields don't match case schema
- [ ] **Option B:** At transmission time only — validate when case data is available and about to be merged
- [ ] **Option C:** Optional validation — warn user at upload but allow anyway (ignore unknown fields)
- [ ] **Option D:** Two-phase validation — basic syntax check at upload, full validation at transmission

**Your Answer:**

---

### **Q10. [Workflow Validation Performance] Should circular dependency detection run synchronously or asynchronously?**

**Context:** Workflow setup must "Prevent circular dependencies" (e.g., State A → State B → State A). For workflows with hundreds of rules, validation could be slow.

**Options:**
- [ ] **Option A:** Synchronous at save-time — user waits for validation result (simple, potentially slow for large workflows)
- [ ] **Option B:** Asynchronous with separate button — admin saves, then optionally runs "Check Workflow Validity" job
- [ ] **Option C:** Smart caching — only re-validate rules affected by current change, not entire graph
- [ ] **Option D:** Always async with background validation — user sees "validation pending" status until complete

**Your Answer:**

---

### **Q11. [Sensitive Change Approvals] What triggers approval for user permission updates?**

**Context:** Sensitive Change Approvals are optional (line 529-534). But what counts as "sensitive"? Should bulk operations require approval too?

**Options:**
- [ ] **Option A:** Individual changes only — single user edit requires approval if changing sensitive fields (access_expiry, security_group)
- [ ] **Option B:** Both individual and bulk — bulk activation also requires approval
- [ ] **Option C:** Configurable per operation — admins define which bulk operations require approval (e.g., "bulk add to security group" = requires approval, "bulk deactivate" = does not)
- [ ] **Option D:** Defer to V2 — don't implement approvals in V1, just log all changes in audit trail

**Your Answer:**

---

## SECTION 4: AUTHORIZATION/COMPLIANCE QUESTIONS

### **Q12. [Folder Deletion] Can CM admins hard-delete folders containing documents?**

**Context:** Folder Management rules say "Folders cannot be deleted if they contain documents — must be inactivated." But the delete action appears in the UI.

**Options:**
- [ ] **Option A:** Soft-delete only — "Delete" button marks folder inactive (existing documents retained)
- [ ] **Option B:** Hard-delete forbidden entirely — show error "Folder contains documents, cannot delete"
- [ ] **Option C:** Hard-delete allowed ONLY if documents are first moved to another folder or force-archived
- [ ] **Option D:** Two buttons: "Archive Folder" (soft delete) and "Delete" (hard delete, blocked if docs exist)

**Your Answer:**

---

### **Q13. [Document Editing During Review] Can author edit document while Under Review?**

**Context:** FRD says "A document in Under Review cannot be edited by the author until review is closed." But what about when reviewers request changes?

**Options:**
- [ ] **Option A:** Fully blocked — author cannot touch document until review is closed (current behavior)
- [ ] **Option B:** Author can edit if Review Owner approves a "revision" request (new state: "Pending Revision")
- [ ] **Option C:** Author can edit in background (creates new draft version) but published version stays frozen
- [ ] **Option D:** Always allow author to edit, but new edits break the ongoing review (review must restart)

**Your Answer:**

---

### **Q14. [User Access Expiry] When expiry date passes, what happens?**

**Context:** User Configuration has "Access Expiry Date" (optional date field). When the date reaches, what exactly happens?

**Options:**
- [ ] **Option A:** Account marked inactive in database (soft disable) — existing sessions remain active until logout
- [ ] **Option B:** Active sessions forcibly logged out + new logins rejected (hard disable)
- [ ] **Option C:** Only prevent new logins — existing sessions persist until manual logout
- [ ] **Option D:** Configurable per admin — set policy in Admin Console settings

**Your Answer:**

---

### **Q15. [Audit Reason Field] Should "Reason for Change" be mandatory or optional?**

**Context:** Every admin configuration change will have a "Reason for Change" field for compliance. Should admins be forced to fill it?

**Options:**
- [ ] **Option A:** Mandatory for ALL changes — Save button disabled if reason field is empty
- [ ] **Option B:** Optional — user can save without providing reason
- [ ] **Option C:** Mandatory ONLY for sensitive changes (user permission updates, security group edits); optional for others (picklist updates)
- [ ] **Option D:** Configurable per change type — each operation defines if reason is required

**Your Answer:**

---

### **Q16. [Audit Export Format] How should multi-line text be exported?**

**Context:** "Reason for Change" field can contain multi-line free text (e.g., "Updated per client request on 2026-03-23. Discussed with Vanaja in sprint planning."). How should this appear in PDF/Excel export?

**Options:**
- [ ] **Option A:** Plain text in cells — text wraps within Excel/PDF cell (standard approach)
- [ ] **Option B:** Separate "Audit Details" sheet — main sheet lists changes, detail sheet has full text
- [ ] **Option C:** Truncate to 100 chars in main export; provide separate detailed report with full text
- [ ] **Option D:** Always export as Excel (not PDF) to better handle multi-line cells

**Your Answer:**

---

## SECTION 5: PERFORMANCE/SCALABILITY QUESTIONS

### **Q17. [Dependency Mapping Speed] For large databases, should we pre-calculate or query on-demand?**

**Context:** Dependency Mapping shows "Which cases used Product X". For organizations with millions of cases, this could be a slow query.

**Options:**
- [ ] **Option A:** Pre-calculate nightly (cron at 2am UTC) — fast UI, data stale by up to 24 hours
- [ ] **Option B:** Query on-demand with Redis caching (1-hour TTL) — fresher data, potential 5-10 second UI lag on first query
- [ ] **Option C:** Estimated counts via sampling — show "~50,000 cases use this product" (approximation, much faster)
- [ ] **Option D:** Don't optimize in V1 — accept potential slowness, optimize in V2 if it becomes a bottleneck

**Your Answer:**

---

### **Q18. [Email Alert Frequency] For expiry alerts, how often should they be sent?**

**Context:** Document expiry alerts can be configured for "30 days before". Should this be one-time or recurring?

**Options:**
- [ ] **Option A:** One-time alert on exactly day-30 (single email, simple)
- [ ] **Option B:** Daily reminders from day-30 onwards until expiry (escalating frequency, better visibility)
- [ ] **Option C:** Configurable per alert — admins choose "once" vs "daily"
- [ ] **Option D:** Weekly reminders (middle ground) — alert on day-30, then weekly until expiry

**Your Answer:**

---

## SECTION 6: FEATURE SCOPE QUESTIONS

### **Q19. [Configuration Templates] Should templates be organization-scoped or shared?**

**Context:** Admin Console includes "Configuration Templates" (save/clone/version workflows). In a multi-tenant context, should templates be shareable?

**Options:**
- [ ] **Option A:** Single-organization only — each org's templates are isolated (safest, default)
- [ ] **Option B:** Can be marked "public" to share across organizations (if multi-tenant enabled later)
- [ ] **Option C:** Not implemented in V1 — mark as V2 feature, build infrastructure for V2 sharing

**Your Answer:**

---

### **Q20. [CM & Admin Auth Sessions] Should they share a single login session or separate?**

**Context:** Content Management and Admin Console both use HTTP-only cookies for authentication. Should they share the same session or be independent?

**Options:**
- [ ] **Option A:** Single unified session — one login covers both modules, logout of one = logout of both
- [ ] **Option B:** Separate sessions — different cookie names, independent login flows (more complex)
- [ ] **Option C:** Shared cookie, different privilege scopes — same user_id, but different role checks per module

**Your Answer:**

---

## SUMMARY & NEXT STEPS

**Total Questions:** 20
**Sections:** 6 (Integration, Database, API/Backend, Authorization, Performance, Scope)

**Please respond with:**
1. ✅ Selected option (or custom answer) for each question
2. ❓ Any clarifications needed on the questions themselves
3. 📝 Any additional context or constraints we should consider

**Timeline:**
- Target response: **2026-03-24** (by end of day)
- Design review with Rajeev: **2026-03-24 or 2026-03-25**
- Development start: **2026-03-25**

---

**Need Clarification?** Reply below for any question that is unclear. —Rajeev

