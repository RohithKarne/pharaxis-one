# Postmortem — we told a reviewer CI was calling a missing script, and it was not — 7th Aug 2026

Written under SOP §37.1. Blameless: this names mechanisms, not people.

## What we said

Pull request [#543](https://github.com/RohithKarne/pharaxis-one/pull/543), in the section
headed *Notes for reviewer* — the section a reviewer is most likely to act on — stated:

> **1. `npm test` did not exist.** `ci-cp-portal.yml` sets `test_command: npm test`, and
> `_app-ci.yml` runs that job whenever `test_database` is set — which CP Portal sets.
> `package.json` had no `test` script, so that step has been calling a missing target.

The same claim was made to Rohith in session, twice, and was used to justify adding a
`test` script to `apps/cp-portal/backend/package.json`.

## What was true

`apps/cp-portal/package.json` line 13 has had a `test` script the whole time:

```json
"test": "npm run test:static",
"test:static": "cd backend && npm run test:static",
```

The `unit-tests` job in `_app-ci.yml` runs with `working-directory: ${{ inputs.app_root }}`
— `apps/cp-portal`, **not** `apps/cp-portal/backend`. The job log resolves the chain
plainly:

```
> cp-portal@1.0.0 test          → npm run test:static
> cp-portal@1.0.0 test:static   → cd backend && npm run test:static
> node tests/syntax-check.js
CP Portal backend syntax check passed for 97 file(s).
```

Nothing was missing and nothing was failing. Two further things were true and were not
said, both worse than the thing we got wrong:

1. **The `test` script added to `backend/package.json` was never reachable from CI.** The
   new regression test shipped in that PR did not run in CI at all.
2. **The job named `Unit Tests` runs no unit tests.** It runs the syntax check — the same
   command `Quality Gate` already runs, in a job that spends ~40s standing up a MySQL
   service it never connects to. A green `Unit Tests` check meant only that 97 files parse.

We then reported "all six checks pass" as evidence the change was sound. That green was
real and meaningless, and we presented it as meaningful.

A third fact surfaced only when the wiring was corrected and CI failed on
`Cannot find module 'mysql2/promise'`. The `unit-tests` job installs from `app_lockfile`
(`apps/cp-portal/package-lock.json`) and nothing else, so `backend/node_modules` never
exists in it. **The job was structurally incapable of running any backend test that
requires a dependency.** `test` pointing at `test:static` was not an oversight: the syntax
check is the only backend command that needs no dependencies, and so the only one that
could ever have passed there. The original "fix" — adding a `test` script in `backend/` —
would not have worked even had CI been calling it, which is the outcome the first claim
asserted was happening.

A fourth fact, and the same mistake a third time. The five suites chained into `test` were
described — in session and in the PR — as "five DB-free suites (all verified passing)". Two
of them, `cp63-data-subject` and `cp65-translation-gate`, require a **migrated schema**. They
passed locally because no MySQL runs on the development machine at all; in CI, where a
database exists but no migration step does, `cp63` failed on
`Table 'pharaxis_cp_portal_test.cp_portal_users' doesn't exist`. **An absent server and an
empty schema are different failures, and only one of them was ever observed.** "DB-free" was
inferred from a green local run, not from reading what the tests require.

## How long it stood

The false claim stood about 20 minutes — from the PR body being written to the CI log being
read. It was caught before any reviewer acted on it.

The **underlying** condition is older: `Unit Tests` has been a duplicate of the syntax check
for as long as `test` has pointed at `test:static`. That predates this work and was not
introduced by it. Nobody had read the job's log, because the check was green.

## Why the check did not catch it

Root cause is a **scope error in evidence-gathering, stated with unearned confidence.**

We ran `npm test` in `apps/cp-portal/backend`, saw `npm error Missing script: "test"`, and
generalised a directory-specific result into a claim about what CI does. The command output
was accurate. The inference — *therefore CI is calling a missing target* — was never checked
against the one artefact that could settle it: the workflow's `working-directory`, or the
job log itself.

Two habits that were applied rigorously elsewhere in the same change were not applied here:

- **For the 194-site code change**, we refused the transform's own bookkeeping and re-derived
  every site independently, then executed all 197 routes for real. Applied to the code.
- **For the CI claim**, we ran one command in one directory and wrote it into a PR as fact.
  Not applied to the claim *about* the code.

The asymmetry is the finding, and it repeated three times in one change — the missing script,
the uninstalled backend dependencies, the "DB-free" suites. Every instance has the same
shape: **a local observation generalised into a claim about CI, published without checking
the one artefact that could refute it.** Verification effort tracked *how mechanical the work
felt*, not *how load-bearing the statement was*. A one-line assertion in a PR body reaches a
reviewer with the same authority as a hundred lines of verified diff, and it carried none of
the same evidence.

There is a compounding factor worth naming. The PR body's own *What was NOT checked* section
said "the gate has not run in CI yet" — the uncertainty was correctly identified and written
down, and then, when CI went green, that written caveat was treated as discharged by the
green rather than by reading the log. **A green check was accepted as evidence for a claim
the check does not test.** This is the same shape as the 6th Aug postmortem: the summary was
read instead of the trace.

## Systemic fix

**Nothing was landed. The CI wiring was stripped from the PR on Rohith's instruction, and
that was the right call.**

Three successive attempts were made to make `Unit Tests` run the new regression — chain the
backend suites, then install backend dependencies, then drop the two suites needing a schema.
Each passed locally and failed in CI for a reason the previous attempt had not accounted for.
At that point the evidence was no longer about any individual patch: **a job that installs
the wrong lockfile, runs no migrations, and duplicates another gate needs structural repair,
not a third `package.json` edit smuggled into a logging fix.** Both `package.json` files are
back to their state on `main`.

What this leaves, stated plainly rather than presented as a fix:

- The regression test ships **unwired**. `node tests/admin-auth-error-logging.js` passes and
  fails correctly on demand — with the fix, exit 0; with the `log.error` line removed from
  `routes/admin/auth.js`, `✗ T1`, `✗ T2`, exit 1 — but **nothing runs it automatically.**
- CLAUDE.md rates an unrun test in the repository as worse than no test, because it reads as
  evidence to an auditor and is not. That judgement stands and is not being argued with here.
  It is recorded as a known, accepted debt under **CP-87**, rather than resolved by a
  fourth attempt at the thing that failed three times.

**Filed: [CP-87](https://rohithkarne.atlassian.net/browse/CP-87)** — *CP Portal's Unit Tests
job runs the syntax check, not tests — all five backend test files gate nothing.* §37.1
requires this postmortem to end in a ticket; that is the ticket. Suggested owner Anirudh
(§5, CI pipeline and its gates). Raised as a §26 candidate, not authorised work.

What CP-87 carries, and why it is one ticket rather than three:

- **The other four apps have the same shape.** MIMS, Vault, QMS and AI Agent each declare
  `test_command: npm test` against an `app_root` package, and each runs in a job that
  installs `app_lockfile` only. Whether any resolves to something that runs real tests is
  unverified — and is not being asserted here, since asserting exactly this without reading
  the job logs is what caused this postmortem. **Deliberately outside CP-87**, which is
  scoped to CP Portal and says so; a claim about four unread pipelines is what this document
  exists to warn against. Separate ticket owed, after someone reads those four job logs.
- **`unit-tests` runs no migrations.** It stands up MySQL, creates the database, grants
  privileges "for migrations and schema checks" — and never migrates. `cp63-data-subject`
  and `cp65-translation-gate` therefore cannot pass there. Two real tests in the repository
  gate nothing, and did so before this work started.
- **`unit-tests` installs the wrong lockfile.** `app_lockfile` only, so `backend/node_modules`
  never exists and no backend test with a dependency can run. `_app-ci.yml` already takes
  `backend_working_directory`; the install belongs there, not in a per-app test script, since
  a test command should not mutate `node_modules`. Touches five apps' CI, so it is its own PR.
- **These three defects compound.** Wrong lockfile, no migrations, and a `test` script
  pointing at the syntax check are not independent: each makes the next invisible. Fixing one
  in isolation is what produced three failed CI runs on #543. The follow-up should treat
  `unit-tests` as one broken job, not three small patches.
- **A duplicate gate should be visible as one.** `Unit Tests` passing identically to
  `Quality Gate` was indistinguishable from working for months. §37.2's question — "could
  this fail silently?" — has an established answer for skipped jobs (#533) but not for jobs
  that run the *wrong command successfully*.

## The generalisable lesson

**A claim about a system is evidence-bearing work, and it needs the same standard as the
code it describes.** We held a 194-site diff to independent re-derivation and live execution,
and let a load-bearing sentence about CI through on a single command run in the wrong
directory.

The specific trap: **`npm run <x>` resolves against the nearest `package.json`, and CI's
working directory is frequently not the one you are standing in.** "Missing script" is a
statement about a directory, never about a pipeline.

The general trap, which produced all three errors: **a local pass and a CI pass are different
claims.** The development machine differs from CI in what is installed, what is running, and
where commands execute — so a green local run is evidence about the laptop and nothing more.
Each time, the local result was true and the inference drawn from it was false.

The working habit, now standard alongside *read the trace, not the summary*: **before
asserting what CI does, read the job log, not the workflow file and not your shell.** The
workflow file says what was intended; the shell says what your directory does; only the log
says what ran.
