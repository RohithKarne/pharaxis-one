# Postmortem — we told the CEO the Clone Organisation route never existed, and it did — 10th Nov 2026

Written under RULES.md › When we get it wrong. Blameless: this names mechanisms, not people.

## What we said

In the full audit report to Rohith on 10th Nov 2026, in chat:

> "'+ Clone Organisation' button: removed, because the server side never existed and it always failed."

The button and its form were removed in the audit commit on that basis.

## What was true

The server has had a working clone route since July, with the other organisation routes. The
screen called a different address, under the platform routes, where nothing answers. The
button did always fail; the cause was a wrong address on the screen, not a missing feature.

## How long it stood

About half a day, in one report and one unpushed local commit. Rohith was asked to decide
"build or remove" on a false premise. Nothing reached `main`.

It was caught during the rebase onto `main`, when a search for the address across the whole
application found the route's own comment.

## Why the check did not catch it

**The search for the route looked only in the file the screen's address pointed to.** That file
had no clone route, and a history search for the exact address string found none either,
because the route is declared as a short path inside a file mounted elsewhere. The audit's own
table of every server route listed it; the table was not consulted before the sentence was
written. Same pattern as L-016: a claim stated as fact one step short of the evidence.

## Systemic fix

The button is restored and now calls the address that exists. Seen on the real screen on a
throwaway database: an empty form shows "Organisation name is required."; a filled form
creates the copy and it appears in the list. No ticket filed (no Jira).

Lesson added to RULES.md › Lessons.
