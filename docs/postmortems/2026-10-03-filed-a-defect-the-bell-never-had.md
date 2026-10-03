# Postmortem — we told the CEO no doctor had ever seen a notification, and they had — 3rd Oct 2026

Written under SOP §37.1. Blameless: this names mechanisms, not people.

## What we said

While building CPPM-115 (notifications) on 3rd Oct 2026, engineering told Rohith in chat:

> "The bell's server code asks for a field the sign-in never sets, so it errors every time.
> No doctor has ever seen a notification."

The same claim was filed as a defect, CPPM-118.

## What was true

The sign-in check copies the doctor's account number into that field before any request is
handled. The bell's list, "mark all read" and "mark one read" all work as designed. Nothing
was broken.

It was caught a few minutes later, before any code was changed, by reading the sign-in check
to confirm the scope of the "defect". The other files that read the same field had raised the
question of how so much could have been broken unnoticed.

## Why it was said

**A value was judged missing from the line that reads it, not from the place that sets it.**
The notification route reads the field; the token issued at sign-in does not carry it. That
looked conclusive. The one place in between, the sign-in check that runs on every request,
was not read before the sentence was written. This is the same pattern as L-014 and L-015: a
claim stated as fact one step short of the evidence.

## What it cost

One false sentence to Rohith, one Jira ticket filed and withdrawn, about five minutes. No code
was changed on the strength of it.

## The rule that would have prevented it

**Before calling something broken, follow the value back to the place that sets it.** If that
place has not been read, say "I expect this is broken; I have not checked where it is set".
Recorded as L-016 in `docs/lessons.md`.

## Ticket

**CPPM-120** (this postmortem). CPPM-118 is withdrawn with a comment saying why.
