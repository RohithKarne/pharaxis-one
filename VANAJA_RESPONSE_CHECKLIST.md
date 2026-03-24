# Vanaja's Design Decisions Response Checklist

**From:** Rohith (CPO)
**To:** Vanaja (PM)
**Date:** 2026-03-23
**Deadline:** 2026-03-24 EOD

---

## WHAT YOU NEED TO DO

Review the **Design Decisions Form** at:
📄 `/Users/rohithkarne/MIMS-CP Portal/DESIGN_DECISIONS_FOR_VANAJA.md`

**For each of the 20 questions:**
1. ✅ **Select the recommended option** (A, B, C, D, or E)
2. ✅ **OR provide a custom answer** if none of the options fit
3. ✅ **Ask for clarification** if the question is unclear

---

## QUICK SUMMARY OF QUESTIONS

### SECTION 1: INTEGRATION (4 questions)
- [ ] Q1: How track CM document usage in Admin Console?
- [ ] Q2: Who gets notified when document published?
- [ ] Q3: Show CM dependencies in Admin Console?
- [ ] Q4: Use job queue or cron for email retry?

### SECTION 2: DATABASE (4 questions)
- [ ] Q5: File upload + rich text simultaneously in document?
- [ ] Q6: FAQ auto-publish at check-in or manual?
- [ ] Q7: Can version skip states in lifecycle?
- [ ] Q8: Single or multiple security groups per user?

### SECTION 3: API/BACKEND (3 questions)
- [ ] Q9: Merge field validation at upload or transmission?
- [ ] Q10: Workflow circular dependency check sync or async?
- [ ] Q11: What triggers sensitive change approval?

### SECTION 4: AUTHORIZATION (5 questions)
- [ ] Q12: Can hard-delete folders with docs?
- [ ] Q13: Can author edit doc while under review?
- [ ] Q14: What happens when user access expires?
- [ ] Q15: Is "reason for change" mandatory or optional?
- [ ] Q16: How export multi-line text to PDF/Excel?

### SECTION 5: PERFORMANCE (2 questions)
- [ ] Q17: Pre-calculate or query dependency mapping?
- [ ] Q18: Email alerts once or daily?

### SECTION 6: SCOPE (2 questions)
- [ ] Q19: Config templates single-org or shared?
- [ ] Q20: Single login session or separate for CM + Admin?

---

## PRIORITY: Answer These FIRST (Blocking Issues)

🔴 **These 8 questions MUST be answered before Rajeev starts coding:**

1. **Q5** — Document content model (file + text together, or separate?)
2. **Q6** — FAQ auto-publish behavior (immediately or manual publish step?)
3. **Q7** — Version state transitions (strict path or can skip?)
4. **Q8** — User security groups (one per user or multiple?)
5. **Q12** — Folder deletion (hard-delete forbidden, soft-delete only, or conditional?)
6. **Q13** — Doc editing during review (blocked or allowed?)
7. **Q14** — User access expiry (soft disable, hard disable, or just block new logins?)
8. **Q15** — Audit reason field (mandatory or optional?)

---

## HOW TO RESPOND

**Option 1 (Easy):** Reply in this format:

```
Q1: Option B
Q2: Option D (different messages per role)
Q3: Option A (include CM dependencies)
Q4: Option B (cron job)
... etc
```

**Option 2 (Detailed):** Edit the full form at:
📄 `/Users/rohithkarne/MIMS-CP Portal/DESIGN_DECISIONS_FOR_VANAJA.md`
Mark your selections with ✅ checkboxes and add notes.

**Option 3 (Discussion):** Schedule a 30-min call with Rajeev to walk through together and document decisions.

---

## WHAT HAPPENS NEXT

Once you respond:
1. ✅ Rajeev reviews your answers
2. ✅ 60-minute design review (you, Rajeev, Rohith)
3. ✅ Create **Design Decisions Log** (official reference)
4. ✅ 🚀 Development kicks off 2026-03-25 AM

---

## NEED CLARIFICATION?

If any question is unclear, reply with:
> "Q5: Unclear — please rephrase"

Rajeev will provide more context.

---

**Please respond by EOD 2026-03-24.**

📧 Reply to Rohith + CC Rajeev with your answers.

Thanks! —Rajeev

