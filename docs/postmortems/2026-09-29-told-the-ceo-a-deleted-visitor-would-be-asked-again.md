# Postmortem — we told the CEO an anonymous visitor would be asked again, and they would not — 29th Sep 2026

Written under SOP §37.1. Blameless: this names mechanisms, not people.

## What we said

In the CPPM-29 overview on 28th Sep 2026, proposing how long CP Portal keeps an anonymous
visitor's cookie choice, the compliance view told Rohith:

> "12 months, after which the visitor is simply asked again … losing them only means those
> visitors see the cookie banner once more."

Rohith approved the 12-month period and the deletion of old records on that basis.

## What was true

A visitor who never signs in is not asked again when the server deletes their record. The
banner decides whether to appear from a flag in the visitor's own browser, and that flag
never expired. Deleting the server record would only have stopped the portal counting that
visitor in analytics — silently, while their browser still said they had chosen.

It was caught on 29th Sep, before anything was built, by reading the banner while tracing
where the clean-up's effect would show on screen.

## Why it was said

**The outcome was inferred from the server side and stated as fact about the screen.** The
retention decision was about the server record, and "no record means ask again" is how a
signed-in person's banner works — so it was assumed for everyone. Five lines of the banner
would have shown that anonymous visitors are handled differently. This is the same failure
as the 22nd Sep postmortem (L-014), one week later, and this time nothing blocked the check:
it needed no sign-in, only a read.

## What it cost

Little, because it was caught before building: one extra decision for Rohith and about an
hour of work. Had it shipped, the product would have carried a documented privacy control —
"after 12 months the visitor is asked again" — that did not do what it said, and we would
have told a client so.

## The rule that would have prevented it

**Before stating what a person will see after a data change, read the screen code that shows
it.** A claim about the screen rests on the screen, not on the table behind it. L-014 still
applies: if it has not been seen, say "I expect", not "it will".

## Ticket

**CPPM-29.** The correction was built inside the approved ticket on 29th Sep 2026: the
browser now remembers when the choice was made and asks again after 12 months. Verified in
the browser: 13 months → asked again, 11 months → not asked, an old flag with no date →
asked once more.

---

**References**

- The claim: CPPM-29 pre-build overview, chat, 28th Sep 2026; Rohith's approval the same day.
- Banner decides from the browser flag only for anonymous visitors:
  `apps/cp-portal/frontend/src/portal/components/ConsentBanner.jsx`, the "Anonymous user —
  only localStorage" branch (before this change).
- Server treats a missing record as no consent: `apps/cp-portal/backend/utils/consent.js`,
  `latestChoices` and `hasAnalyticsConsent`.
- The correction: branch `fix/CPPM-29-anonymous-consent-retention`, `rememberedConsent` in the
  same banner file.
- Governing rules: SOP §26, §37.1, §40.6; lessons L-014 and L-015 in `docs/lessons.md`.
