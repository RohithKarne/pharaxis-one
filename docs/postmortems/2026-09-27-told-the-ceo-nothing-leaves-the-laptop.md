# Postmortem — we told the CEO "nothing leaves the laptop" during the walk, and a reset code did — 27th Sep 2026

Written under SOP §37.1 (G-1 in the 27–30 Sep walk). Blameless: this names mechanisms, not people.
Rebuilt on 2 Oct 2026 from the walk session's own record, because the walk log no longer exists.

## What we said

At the start of the 360 walk, in chat, the engineering view told Rohith that mail had been
pointed at a local catcher and "nothing leaves the laptop".

## What was true

MIMS keeps mail settings in three places, and two had been redirected: the CP Portal mail
account and the MIMS organisation mailbox. The third, the MIMS platform account that sends
sign-in and password-reset codes, still pointed at a real Gmail account. A "forgot password"
test on the walk agent sent one reset code out through Gmail to an address ending in `.test`,
which cannot be delivered, so no person received it. One bounce notice was expected in that
Gmail inbox. Whether it arrived was not checked, and cannot be from here.

## How long it stood

About 40 minutes. The walk carried on during that time; nobody made a decision on it. It was
corrected in chat as soon as the third setting was found, and redirected then.

## Why the check did not catch it

The redirect went to the places where mail was known to be configured. Nothing listed every
place mail can be sent from, so the one not looked for was not seen.

## Systemic fix

**[MIPM-110](https://rohithkarne.atlassian.net/browse/MIPM-110):** a read-only preflight that
lists every outbound mail setting in the database a walk will use, and refuses to start if any
still points at a real server. It needs Rohith's yes because it adds a step to every walk.
Until then, walks run on a copy of the database (as batch 5 did), never on the dev database.

---

**References**

- The claim and its correction: the walk session's chat, 27 Sep 2026; correction posted at
  13:05 UTC ("I told you something untrue").
- The three settings: `system_config` keys `smtp_host`, `smtp_port`, `smtp_encryption`
  (platform account); `email_accounts` row 1 (organisation mailbox); `cp_email_config` row 1
  (CP Portal). All three were put back to Gmail on 2 Oct 2026 under MIPM-85.
- Governing rule: SOP §37.1. Same class as L-014 and L-015 in `docs/lessons.md`.
