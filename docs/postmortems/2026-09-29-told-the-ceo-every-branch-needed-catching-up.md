# Postmortem — we told the CEO every open branch needed catching up with main, and none did — 29th Sep 2026

Written under SOP §37.1. Blameless: this names mechanisms, not people.

## What we said

In the CP Portal pending-work table on 29th Sep 2026, the product view told Rohith:

> "Main moved on today. It now has the two-folder root and the team changes … Every branch
> above needs catching up with main before its pull request."

Engineering added that the catch-up "will mostly clash on the SOP and CLAUDE.md", and "when
to catch the branches up with main" was put to Rohith as one of his decisions.

## What was true

Every branch in that table — the batch landing, CPPM-39, CPPM-40, CPPM-41 and the "Done
means merged to main" rule — already contained main's latest commit, `f65af61` (#667). Asked
directly (`git branch --contains f65af61`), git lists all five. Nothing needed catching up.

It stood for about an hour and was caught before anyone acted on it, while planning the
pull requests for CPPM-29, 39, 40 and 41. It cost one wrong decision put to Rohith.

## Why the check did not catch it

**The claim was inferred, not asked.** Two things pointed the wrong way and neither was the
direct question:

- A "commits not in main" list was taken against the local copy of main, which was out of
  date — the refresh that followed wrote only `FETCH_HEAD`, not `origin/main`. And because
  main takes work as squash merges (#660), work already in main still shows as "not in main"
  when compared commit by commit.
- Main's recent history showed new merges (#665 to #667), and it was assumed the branches
  predated them.

The same shape as L-014 and L-015, a third time in a week: an outcome stated as fact from
nearby evidence, instead of from the one check that answers it.

## Systemic fix

**[CPPM-45](https://rohithkarne.atlassian.net/browse/CPPM-45):** a read-only script under
`docs/scripts/` that refreshes main properly and says, per branch, whether it contains main,
how much it would change, and whether its work is already in main by content. Every status
or pending list quotes its output, and SOP §39.8/§39.9 say so. Until it exists: before
saying a branch is behind or ahead of main, run `git branch --contains <main's commit>` and
quote it.

No lessons entry is added here: another session's unmerged branch already holds the next
number (L-016), and taking it would collide. The rule above stands in its place.

---

**References**

- The claim: CP Portal pending-work table, chat, 29th Sep 2026, and the "catch-up" decision
  put to Rohith in the same reply.
- The check that answers it: `git branch --contains f65af61` lists
  `feat/CPPM-batch-land`, `feat/CPPM-39-virus-scanner`, `fix/CPPM-29-anonymous-consent-retention`,
  `fix/CPPM-40-sign-out-ends-session`, `fix/CPPM-41-remove-fake-referral`, `docs/done-means-in-main`.
- Squash merge that makes commit comparisons misleading: `fd6de2a` (#660).
- Governing rules: SOP §37.1, §38.1; lessons L-014 and L-015 in `docs/lessons.md`.
