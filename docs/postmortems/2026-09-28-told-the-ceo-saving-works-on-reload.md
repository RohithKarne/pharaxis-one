# Postmortem — we told the CEO a case's details saved because they came back on reload, and they had not saved — 28th Sep 2026

Written under SOP §37.1 (C-1 in the 27–30 Sep walk). Blameless: this names mechanisms, not people.
Rebuilt on 2 Oct 2026 from the walk session's own record, because the walk log no longer exists.

## What we said

During the agent walk, in chat, the test view told Rohith: "Saving works: I reloaded the page
and every Step 2 field came back as entered." The agent-walk summary that followed listed
"Medical-question details save and survive a reload" under *Works*.

## What was true

Nothing had been saved. The medical-question record for that case was still empty. The
fields came back because the form keeps a draft in the browser and puts it back on reload.
The header "Save Case" button showed a green "Saved" without saving the MI fields; only the
separate "Save MI" button further down did. That second fault was logged as M-39 (silent data
loss).

## How long it stood

From about 10:25 to before 11:14 UTC that morning, under an hour. It was in one summary table
Rohith read. It was caught when the database was read for the next step. The walk then
corrected it in chat, and it is listed among the untrue statements in the 11:14 update.

## Why the check did not catch it

A reload was taken as proof of a save. On a form that restores its own draft, a reload shows
what the browser kept, not what the server stored. The one check that answers "did it save",
reading the stored record or opening the case in a fresh session, was not done first.

## Systemic fix

- **The product fault:** the header save now saves every changed section, or names the one
  that failed (M-39, landed in #688).
- **The checking habit:** [MIPM-111](https://rohithkarne.atlassian.net/browse/MIPM-111)
  proposes SOP wording that a save is confirmed from a fresh session or the stored record,
  never by a reload alone. It needs Rohith's yes.

---

**References**

- The claim: the walk session's chat, 28 Sep 2026, about 10:25 UTC; the 10:37 agent-walk
  summary; the 11:14 update listing it as untrue.
- What was true: walk finding C-1 ("values came from the sessionStorage draft, not the DB";
  the MI record was empty at 10:23:17) and finding M-39 (header "Saved" does not save MI/AE
  fields).
- The fix in main: the section-save hook in
  `apps/mims/frontend/src/modules/cases/components/CaseMITab.jsx`, `CaseAETab.jsx` and
  `CasePCTab.jsx` (`registerSectionSave`), merged in #688 (commit `7c911b31`).
- Governing rules: SOP §26 (functional verification) and §37.1.
