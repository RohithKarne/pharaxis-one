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

**Built the same day.** `docs/scripts/branch-status.sh` answers the question directly, by
simulating in memory whether merging each branch would change anything in main. SOP §39.9
now says status claims are quoted from their source. Its limit is stated in the script:
where main has since changed the same lines, it answers *unclear*, not yes or no.

## Second case, same evening — "the Jira connector needs re-authorising"

**What we said:** after Jira calls failed for about an hour with "This connector can't be
used with the current credential. Reconnecting won't help.", Rohith was told the Atlassian
connection "needs re-authorising in your claude.ai connector settings".

**What was true:** the connector's own status showed it connected, and it answered as
Rohith. It recovered without anyone signing in again. Caught when Rohith asked why Jira
wasn't working and the status was checked for the first time.

**Why:** the meaning of an error was taken from its wording, and the one check that answers
it (the connector's status) was not run.

## Third case, same evening — "four Done tickets were never checked on screen"

**What we said:** in three status tables, Rohith was told that CPPM-7, 8, 17 and 18 "were
checked against the server but never on the real screen", and a screen walk of all four was
suggested before the 12 Oct viewing.

**What was true:** each ticket's own Jira closing note records an on-screen check by Rohith
on 22 Sep, for example CPPM-18's walk from chat to the Safety Queue to MIMS case 483039.
Caught while adding "in main" notes to those tickets, which meant reading them.

**Why:** the claim was built from the tickets' commit messages, which describe the server
checks only, instead of from the ticket record, which is where screen checks are written.

**Fix for both:** the same CPPM-45 rule, extended in SOP §39.9. What an error means comes
from the tool's status. Whether something was checked on screen comes from the ticket's own
closing note.

---

**References**

- The claim: CP Portal pending-work table, chat, 29th Sep 2026, and the "catch-up" decision
  put to Rohith in the same reply.
- The check that answers it: `git branch --contains f65af61` lists
  `feat/CPPM-batch-land`, `feat/CPPM-39-virus-scanner`, `fix/CPPM-29-anonymous-consent-retention`,
  `fix/CPPM-40-sign-out-ends-session`, `fix/CPPM-41-remove-fake-referral`, `docs/done-means-in-main`.
- Squash merge that makes commit comparisons misleading: `fd6de2a` (#660).
- The script: `docs/scripts/branch-status.sh`; its first run on 29 Sep showed CPPM-40, 41,
  42, 43 and 46 as in main, and CPPM-47 (not merged yet) as 2 files still to change.
- Second case: connector status "Atlassian Rovo — connected", checked 29 Sep; Jira worked
  again with no change on Rohith's side.
- Third case: the closing notes on CPPM-7 and CPPM-8 ("On screen: confirmed by Rohith"),
  CPPM-17 ("On screen (Rohith)") and CPPM-18 ("On screen (Rohith, 22 Sep)").
- Governing rules: SOP §37.1, §38.1, §39.9; lessons L-014 and L-015 in `docs/lessons.md`.
