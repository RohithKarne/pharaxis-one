# Postmortem — three things stated as fact during the MIMS walk that were not true — 3rd Oct 2026

Written under SOP §37.1. Blameless: this names mechanisms, not people.

## What we said

During the MIMS end-to-end walk (epic MIPM-131) on 3rd Oct 2026, the team told Rohith in chat:

1. "A wrong 2FA code shows no error message."
2. "The product family is not saved."
3. "Confirmed: Ravi, a reviewer with no edit right, can add AE events and notes."

## What was true

1. The error message did show. The browser script read the wrong part of the page.
2. The script never chose a family, so there was nothing to save.
3. Ravi does have the right to update cases. The group template leaves it out, but every reviewer
   gets it from the role defaults in the permission catalog, and a group cannot remove a default.

Each was corrected in chat, within minutes of being said, before any code changed.

## Why it was said

**The script's output was read as the screen's behaviour.** In 1 and 2 the script's own
selector or missing step produced the result; in 3 the group template was read, but the
second source of rights (role defaults) was not. The same pattern as L-014 to L-016: a
sentence stated as fact one step short of the evidence.

## What it cost

Three false sentences to Rohith, each retracted. No code was changed on the strength of them.
Number 3 also surfaced a real design question, now MIPM-192.

## The rule that would have prevented it

**Before reporting what a screen does, look at the screenshot, not only the script's text
output. Before saying someone lacks a right, check every source of rights (group, role
defaults, personal grants).** Until then the sentence starts with "I expect".

## Ticket

MIPM-192: a security group can only add rights, never remove them (decision for Rohith).

## Addendum — 4th Oct 2026: a fourth one

**Said:** "Saving a product family with an empty name gives no message" (in the list of open items given to Rohith).

**True:** the browser does say "Please fill out this field". It is the browser's own bubble, which never appears in the page's text, and the script read only the page's text. Checking it properly found a real defect next to it — a name of only spaces was saved — now MIPM-199.

**Same mechanism, same rule:** the script's text output was read as the screen. Before saying a screen shows no message, look at the screenshot and at the field's own validation message.
