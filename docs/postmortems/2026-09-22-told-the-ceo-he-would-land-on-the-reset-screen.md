# Postmortem — we told the CEO he would land on the set-new-password screen, and he did not — 22nd Sep 2026

Written under SOP §37.1. Blameless: this names mechanisms, not people.

## What we said

In chat on 22nd Sep 2026, after a temporary password had been written straight into the
development database with the reset-required flag set, Rohith was told:

> "MIMS should take you straight to a 'set a new password' screen. Pick your own there
> and you're back in."

The same message noted, correctly, that the author had not signed in — the persona is not
permitted to enter passwords. But that note stood apart from the sentence above, and the
sentence itself was written as what would happen, not as what was expected to happen.

Published to the CEO, who is MIMS user number one and the only platform admin, at the end
of a day in which he had already been unable to get into the product.

## What was true

He did not land on the set-new-password screen. He was bounced back to the login page
every time, with nothing on screen to say why.

The reason: when a user whose password must be reset signs in, MIMS issues a token and a
cookie but never records the session. Every other sign-in path records it. The
authentication middleware treats a token with no recorded session as revoked and tells the
app to log out, and the app's expiry handler sends the user to the login page. So the
reset screen's very first request was rejected, and the user was returned to where he
started.

This was not specific to Rohith. Every user forced to change their password — which
includes every newly created user, since each starts on a temporary password with the flag
set — could not complete a first sign-in. How long that has been so is unknown. The rule
that stops platform admins using the ordinary forgot-password route dates from May 2026;
the missing session record is older and has no located origin.

The first half of the day's diagnosis was sound. The forgot-password screen tells a
platform admin that a code has been sent, and by design no code is ever created for a
platform admin — the message is deliberately identical for everyone so the screen cannot
be used to discover which accounts exist. That was reproduced on the real login screen
before anything was changed. The claim that went wrong came after the diagnosis, about
the workaround, and it was never exercised.

## Why it was said

**The author could not walk the path, and filled the gap with the expected outcome
written as fact.** The reset-required branch was read in the code and looked complete: it
issues a token, sets a cookie, returns the flag the front end checks. Reading it gave
every signal that it worked. The one thing reading cannot show — that the next request
would be rejected — needed a sign-in, and the persona is barred from signing in.

Three mechanisms compounded that:

1. **The caveat and the claim were in different sentences.** "I have not signed in" was
   said; "MIMS should take you straight to…" was also said. A reader acting on the message
   takes the confident sentence and discounts the caveat, because the caveat is not attached
   to anything specific. It reads as modesty rather than as a limit on the claim.
2. **There is no automated test to catch a broken sign-in path any more.** §29 was retired
   on 20th Sep. A regression in a sign-in branch is now found only when a person tries it.
   The one person who tried it was the CEO.
3. **The fix for the real problem was verified in the same way as the claim.** A one-line
   change — record the session on the reset path — was committed with a message that
   explains why it is needed, and it too has not been seen on a screen. Rohith got in on
   23rd Sep only because the flag was cleared for him in the database, which bypasses the
   path the fix is on. §26 says a change is not verified until exercised through the real
   UI. The change is not verified.

## What it cost

Rohith spent parts of two days unable to use MIMS. Two direct writes to the development
database were needed to get him in — the first set the temporary password, the second
cleared the reset flag so the broken path was avoided altogether — and neither is in the
product's own audit trail; they are recorded in chat. The first write, made on the
strength of the claim, produced a second failed evening for the CEO instead of a working
sign-in. A defect that affects every new user's first sign-in was found by the founder
rather than by us. And the fix that addresses it is committed but unproven.

## The rule that would have prevented it

**When you cannot exercise a path yourself, say what you expect and that you have not seen
it — never describe an unverified outcome in the future tense as fact.** The sentence that
states what was not checked sits next to the claim it limits, in the same breath, not in a
separate paragraph where it can be read past.

The message should have read: "I expect MIMS to take you to a set-new-password screen. I
have not seen that screen myself — I cannot sign in — so if it bounces you to login, tell
me and I will look at the reset path." That version costs one clause, and it would have
turned the second failed evening into a five-minute diagnosis with the failure already
named.

The general form: a claim about behaviour carries its evidence, or it carries the words
"not seen". There is no third option, and reading the code is not seeing the screen.

## Ticket

**Owed — key to be added.** Jira was not connected in the session in which this was
found, so no MIMS key could be filed. §37.1 says a postmortem with no filed fix is an
essay; this one is an essay until the key is here. The ticket must carry two items:

- **(a) Verify the reset-screen path on a fresh user.** Create a user through the admin
  screen, sign in with the temporary password on the real login page, confirm the
  set-new-password screen appears, set a password, confirm the user lands in the app.
  Then the negative path: a user with no recorded session is still sent to login. Only
  then is the one-line fix done.
- **(b) A second platform admin, or a recovery route, so that a platform admin is never
  locked out by design.** The forgot-password exclusion is correct as an anti-enumeration
  control, but with a single platform admin it means the only account that can repair
  access has no way to repair its own. Varun frames the options; Rohith decides.

---

**References**

- Forgot-password no-op for platform admins:
  `apps/mims/backend/controllers/authController.js` lines 1993–2035 (exclusion at 2010).
  Exclusion introduced in commit 8e81748 (2026-05-20).
- Reset-required sign-in path that issues a token without recording the session:
  `apps/mims/backend/controllers/authController.js` lines 1420–1434.
  Session recorder defined at line 157; called on every other sign-in path at lines 653,
  1234, 1447, 1767, 1815, 1917.
- Middleware rejecting a token with no session row as `SESSION_REVOKED` with
  `should_logout: true`: `apps/mims/backend/middleware/auth.js` lines 57–79.
- App expiry handler that sends the user to `/login`:
  `apps/mims/frontend/src/modules/max/App.jsx` lines 163–167.
- New users created with a temporary password and the reset flag set:
  `apps/mims/backend/routes/admin/users.js` lines 298–307.
- The one-line fix (`await trackSessionToken(user.id, resetToken)`): commit ab3b2c8 on
  branch `fix/inbox-server-search`. Not screen-verified.
- Governing rules: SOP §26 (Functional Verification Standard), §37.1, §40.6; lesson L-014
  in `docs/lessons.md`.
