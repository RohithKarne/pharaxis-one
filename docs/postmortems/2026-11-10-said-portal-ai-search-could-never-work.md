# Postmortem — we told the CEO the portal's AI search "can never work" — 10th Nov 2026

Written under RULES.md › When we get it wrong. Blameless: this names mechanisms, not people.

## What we said

In the detailed review list to Rohith on 10th Nov 2026, in chat, under cloud leftovers:

> "Document 'AI search': calls the AI Agent app, which was deleted on 9 September. Can never work."

The suggestion was to remove the option from the portal. Rohith approved it.

## What was true

That was fixed in September (CPPM-57). The search asks whatever service is named in a
setting, and when the setting is empty the Documents page does not offer AI search at all.
Nothing is broken and no doctor sees an option that cannot run.

## How long it stood

A few hours, in one chat message. Rohith approved a removal on a false premise. Nothing was
removed: the code was read before any change, and the removal was dropped.

## Why the check did not catch it

**A setting's name was read as proof of what it points at.** The setting is still called after
the deleted AI Agent, and the audit listed every setting the code reads without opening the
code that reads it. The comment three lines above the setting says exactly what it does.
Same pattern as L-016 and L-022.

## Systemic fix

None needed in the product. The review point is withdrawn. No ticket filed (no Jira).
Lesson added to RULES.md › Lessons.
