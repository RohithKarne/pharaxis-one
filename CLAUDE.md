# CLAUDE.md — Pharaxis One

Read this before writing code in this repository.

**Precedence.** `docs/TEAM_OPERATING_SOP.md` is the source of truth for process and governance. Where a rule appears in both files, **the SOP wins**. This file exists so the coding agent reads the same rules the team works to; it does not restate the SOP, it points at it.

---

## Hard constraints — these are not style preferences

1. **Pushing is enabled, and it is not blanket authorisation.** Rohith re-enabled `git push` on 2026-07-27, ending the Sprint 3 restriction, so CI runs the tests instead of someone remembering to. **Confirm with Rohith before pushing anything of substance**, and never push to `main` without saying what is going and what has not been checked. → SOP §31
2. **Nothing is "Done" until browser-verified.** Data in the database and a 200 from the API are **not** evidence. Open the real screen. → SOP §26 *Functional Verification Standard*
3. **Pharaxis One has no customers.** Never describe any company as a customer, user, or reference.
4. **Evidence or nothing.** Cite a real file path and line range, or a public URL. Do not invent a client request, a user complaint, or a defect you have not located.

---

## The ten rules

**I. Read before you write.** Read the files you are about to touch — read, not skim. Copy the patterns that already exist. Check the imports to see what the project actually depends on, so you do not reach for `axios` where everything is `fetch`. When you cannot find a pattern, ask instead of guessing.

**II. Think before you code.** State your assumptions — "add authentication" is five different things, so name the one you picked — and name the tradeoffs. If something is genuinely confusing, stop and ask rather than filling the gap with plausible-looking code. That is exactly the code that passes a casual review and fails when it matters.

**III. Simplicity.** Write the minimum code that solves the problem in front of you, not the minimum that could solve every future version of it. Resist premature abstraction. Skip error handling for errors that cannot occur. Hardcode until there is a real reason to configure. **The test:** if the only reason something is abstracted is "in case we need to," you have over-built it.

**IV. Surgical changes.** Your diff should be as small as the task allows. Do not touch what you were not asked to touch. Match the existing style. Do not reformat — a formatter pass buries the three lines that matter inside three hundred that do not. **The test:** can you justify every changed line by the task? If a line is there because "while I was in there," revert it.

**V. Verification.** When fixing a bug, **write the failing test first, watch it fail, then fix it.** That is the only proof you fixed the cause and not the symptom. Test behaviour that can actually break, not that a constructor sets a field. If something is hard to test, that is information about the design, not permission to skip it. → SOP §26, §29

> An unrun test in the repository is worse than no test. It reads as evidence to an auditor and is not.

**VI. Goal-driven execution.** Every task needs a success criterion **before** code is written. "Add validation" becomes "reject a missing or malformed email, return 400 with a clear message, and test both cases." For anything multi-step, state the plan first so Rohith can catch a wrong approach before you spend an hour building it. → SOP §26 *Pre-Development Feature Lock*

**VII. Debugging.** When something breaks, investigate — do not guess. Read the whole error and the stack trace. **Reproduce the problem before you change anything.** Change one thing at a time. Do not paper over an unexpected null with a null check; find out why it is null, or the bug just moves somewhere quieter.

**VIII. Dependencies.** Every dependency is permanent code you do not control. Before adding one, ask whether the project or the standard library already does it — `crypto.randomUUID()` over a `uuid` package. When you do add one, say why, so the choice is visible rather than smuggled into the manifest.

> **Pharaxis addition (Vasu, compliance):** in a regulated app — MIMS, CP Portal, Vault, QMS — a new dependency needs a named reason in the commit message. This is a supply-chain control, not a style note.

**IX. Communication.** Say what you did and why, not just a block of code. Flag concerns even when you did exactly what was asked. Be precise about uncertainty: **"I am not sure this library supports streaming"** tells the reader what to verify; **"I think this should work"** does not. → SOP §28 *Communication Brevity Standard*

**X. Common failure modes.** Four patterns recur often enough to name:

| Pattern | What it looks like |
|---|---|
| **Kitchen Sink** | restructuring half the codebase while you are at it |
| **Wrong Abstraction** | abstracting before you have copy-pasted twice |
| **Optimistic Path** | the happy path handled, the 500 ignored |
| **Runaway Refactor** | a fix that cascades across files |

Catch yourself in any of these and the right move is to **stop, not push through**.

---

## Development tooling

Claude Code is the only development tool. Write and edit code directly with Edit/Write. → `memory/feedback.md`

## Where the rest lives

| Need | File |
|---|---|
| Gates, approvals, roles, escalation | `docs/TEAM_OPERATING_SOP.md` |
| How the team talks in-channel | `docs/live-communication-use-and-format.md` |
| Per-app detail | `apps/<app>/*_MEMORY_SOP.md` |

---

*Adopted 2026-07-31 on Rohith's instruction. Rules I–X adapted from field notes on LLM-assisted programming circulated as CLAUDE.md; the hard constraints, the SOP cross-references, and the compliance addition to VIII are ours.*
