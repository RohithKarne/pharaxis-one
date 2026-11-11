# Postmortem — we told the CEO two things about the dev data that were not so — 11th Nov 2026

Written under RULES.md › When we get it wrong. Blameless: this names mechanisms, not people.

## What we said

In the closing report to Rohith on 10th Nov 2026, in chat, under "Still open":

> "Real company name in the dev data. Two browser suites, two scripts and two evidence
> pictures depend on it. Renaming means changing the shared dev database."

and, further down:

> "the Policy Graph help topic and the empty reply templates table remain."

Rohith answered "complete all still open items in one go".

## What was true

1. **The dev data had already been renamed where those files look.** Organisation 1 and
   portal client 4 are Calder Therapeutics. The two browser suites did not depend on the
   name: they named a portal user that no longer exists, and one had also failed since
   server-side sessions on 12th Oct. Separately, the name is still in about 3.9 million
   values across more than 50 columns of the MIMS dev database, among them sign-in emails
   and audit logs. That is a different and far larger job than "a rename".
2. **The reply templates table is not empty in dev.** It holds two rows.

## How long it stood

One day, in one chat message. Rohith approved work on a wrong picture. Nothing was changed
in the dev databases: both were counted, read-only, before any change.

## Why the check did not catch it

**The statements were about the dev data, and the dev data was not read.** "Depends on the
dev data" came from reading the test files. "Empty" came from the throwaway test database.
Neither is the dev database.

## Systemic fix

- The two browser suites now run on a user the test seed creates, and pass.
- The table is kept; the migration that drops unused tables only ever dropped empty ones.
- The dev-data scrub is put to Rohith as its own decision, with the counts.
- Lesson L-024 added to RULES.md › Lessons. No ticket filed (no Jira).
