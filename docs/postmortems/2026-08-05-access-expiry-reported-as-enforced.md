# Postmortem — we reported a security control as enforced when it was mounted on nothing — 5th Aug 2026

Written under SOP §37.1. Blameless: this names mechanisms, not people.

## What we said

[PAUD-2](https://rohithkarne.atlassian.net/browse/PAUD-2), item 12, published 3rd Aug 2026,
verdict **PARTIAL**:

> "Time-boxed access exists and is enforced on every request, but it is set one user
> at a time — no bulk revoke."

Published in a Jira ticket assigned to the CEO, in a project whose stated purpose is
answering what a client-side team would ask us.

## What was true

`requireAccessNotExpired` was defined and exported at
`apps/mims/backend/middleware/auth.js:215-235` and **mounted on zero routes**.

The only place access expiry was honoured was a single query in
`apps/mims/backend/routes/inbox.js:51`. Every other MIMS API call ignored it entirely.

An outsourcer whose contract ended a month earlier could call every endpoint.

The correct verdict was **NO**, and the severity was higher than the ticket implied:
this was not a missing convenience, it was an unenforced access control.

## How long it stood

**Two days**, 3rd to 5th Aug 2026. Corrected only because Rohith asked for the
current status of the ticket and the claims were re-checked against the code.

Nobody acted on it in that window, so the exposure was to our own understanding
rather than to a client. Had the ticket been used to answer a security
questionnaire — which is precisely what the PAUD project exists to rehearse — we
would have made a false written statement about an access control.

## Why the check did not catch it

**The routine looked for the definition and stopped.**

Searching for `requireAccessNotExpired` returns the function, its export, and its
correct-looking implementation. Every signal a code-reading process collects said
the control existed. The one query that would have falsified it — *where is this
called?* — was never run, because nothing in the routine's method required it.

Three contributing mechanisms:

1. **A positive claim was cheaper to make than a negative one.** The routine's
   rules demand evidence for a NO ("name what you searched for and where") and
   accept a file path as sufficient for a YES. The burden was backwards: a YES
   asserts a capability works and deserves the *higher* bar.
2. **Reading code cannot establish reachability.** Grep finds definitions. Only
   call-site analysis or execution finds whether anything invokes them. The
   routine had no running instance and no rule acknowledging that limit.
3. **The ticket's own honesty markers hid the gap.** Every PAUD ticket carries
   "Not verified — UI and functional behaviour were not exercised." That line was
   present and true, and it made an unverified positive claim look appropriately
   caveated when it was in fact wrong on the code alone.

## Systemic fix

**Shipped 6th Aug 2026** into the Product Audit routine prompt
(`trig_015RUwGVkCepLQmmp8g6GYUS`), as **Step 4a**:

> Finding a function, a table, a route, a middleware or an export is NOT sufficient
> evidence for a YES. For every candidate YES: locate the definition, then grep for
> where it is CALLED, MOUNTED or QUERIED. If that finds nothing, the verdict is NO —
> not PARTIAL. **A YES cites TWO locations: where it is defined, AND where it is used.**

The failure is written into the prompt as the rule's stated reason, with the file
path and the two days it stood. A rule carrying its own scar survives editing;
a tidy principle gets trimmed by the next person tightening the prompt.

**Also shipped:** Step 4b, converting exhausted question slots into re-verification
of prior YES verdicts, so a wrong verdict has a mechanism that finds it rather than
depending on someone asking.

**Tracked as:** [MIMS-67](https://rohithkarne.atlassian.net/browse/MIMS-67) carries the
remaining half of the original question (bulk revoke). The enforcement defect itself
was fixed the same day at `apps/mims/backend/middleware/auth.js:112` and verified
live — one token, open-ended grant 200 → expiry set to yesterday **403
ORG_ACCESS_EXPIRED** → grant extended 200.

## The generalisable lesson

**Positive claims fail unsafe.** "We cannot do X" is self-correcting — someone
demonstrates X and the claim dies. "We can do X" becomes an answer to a client,
and nothing tests it until the client does.

Any process that reports capability should hold a YES to a higher evidentiary
standard than a NO. Ours had it the other way round.
