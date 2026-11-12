# Postmortem — we told the CEO a case showed another case's email, a possible privacy problem, and it did not — 29th Sep 2026

Written under SOP §37.1 (M-63 in the 27–30 Sep walk). Blameless: this names mechanisms, not people.
Rebuilt on 2 Oct 2026 from the walk session's own record, because the walk log no longer exists.

## What we said

In a status update, the product view told Rohith: "A walk MI case shows an email thread that
belongs to a different case (M-63). That could be a privacy problem, and I'd like it looked at
next." The Founder's view then made it the top priority: "Look into M-63 before anything else."

## What was true

The email belonged to the case it was on. The walk agent had created case MI-289396 from that
email on 28 Sep (finding M-18), which linked them. The case's email pane shows only emails linked
to that exact case, so nothing crossed between cases. The subject mentioned "CP-000040" only
because the email was someone's reply to a CP Portal message, and MIMS has no case with that
number.

## How long it stood

About three minutes, from 06:15 to 06:18 UTC. It reordered the work: the next task became this
investigation. No data was changed and nothing was built on it.

## Why the check did not catch it

The link between the email and the case was read from the subject line, not from the stored
link. The one check that answers "which case does this email belong to" is the email's case
link and the case's creation record. Both were read three minutes later, and they settled it.

## Systemic fix

[MIPM-111](https://rohithkarne.atlassian.net/browse/MIPM-111) proposes SOP wording that a link
between records is stated from the stored link, never from text such as a subject line. It
needs Rohith's yes. A real gap noted in the same investigation, a CP Portal reply landing in
the MIMS inbox with no link back to its request, is tracked as M-22.

---

**References**

- The claim: the walk session's chat, 29 Sep 2026, 06:15 UTC; the Founder's reply in the same
  update.
- The correction: the walk session's chat, 29 Sep 2026, 06:18 UTC ("M-63 is closed as not a
  defect").
- The stored link: the `audit_logs` entry `LINK_CASE` for inquiry 523693, 28 Sep 2026 04:50 UTC,
  linking it to case 483047 (MI-289396). The case and the link were removed from the dev
  database on 2 Oct 2026 as walk data (MIPM-85); the audit entry remains.
- Governing rule: SOP §37.1. Same class as L-014 and L-015 in `docs/lessons.md`.
