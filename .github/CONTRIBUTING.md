# Contributing Guide

## Branching

- Base branch: `main`. **`main` is protected — you cannot push to it directly.**
- Branch naming: `<type>/<TICKET>-<short-topic>` — e.g. `feat/CPAP-4-trial-listing`.
  Types: `feat`, `fix`, `chore`, `docs`, `test`.
- The ticket key is what links Jira to the diff. Without it nothing connects a
  merged change back to the discussion that authorised it.

Full process, including who owns each step: `docs/TEAM_OPERATING_SOP.md` §38.

## Development Setup

1. Install dependencies for the app(s) you are changing.
2. Copy relevant `.env.example` files to `.env`.
3. Ensure MySQL is running with required local databases.
4. Run the app and verify core health endpoints.

## Pull Request Expectations

- Keep PR scope focused and reviewable.
- Include clear summary of what changed and why.
- Add testing notes (what was run, what passed).
- Update docs when behavior, setup, or architecture changes.

## Commit Quality

- Prefer clear, descriptive commit messages.
- Avoid committing generated runtime artifacts.
- Do not commit secrets, keys, or local backup files.

## Code and Architecture Alignment

Before opening PRs:

- verify conventions already used by the target app
- avoid cross-app coupling unless explicitly required
- keep database changes explicit and documented

## CI and Dependencies

- Ensure GitHub Actions CI passes.
- Review Dependabot updates and resolve vulnerable dependencies quickly.
