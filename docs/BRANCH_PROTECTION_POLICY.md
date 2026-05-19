# Branch Protection Policy

Effective date: 2026-05-19  
Owner: Engineering

## Purpose

`main` stays as the single integration branch, but each product must now prove its own quality gates before merge.

## Recommended Rule For `main`

Enable branch protection for `main` with:

- pull request required before merge
- direct push disabled except for emergency admin use
- at least 1 approving review
- dismiss stale approvals on new commits
- require status checks to pass
- require branch to be up to date before merge if team can tolerate it
- restrict force pushes
- restrict deletions

## Required Checks

Set these checks as required when the workflows appear in GitHub:

| Product | Required checks |
| --- | --- |
| `mims` | `Frontend Build`, `Backend Syntax`, `Security Scan` from `MIMS CI` |
| `qms` | `Frontend Build`, `Backend Syntax`, `Quality Gate`, `Security Scan` from `QMS CI` |
| `vault` | `Frontend Build`, `Backend Syntax`, `Quality Gate`, `Security Scan` from `Vault CI` |
| `cp-portal` | `Frontend Build`, `Backend Syntax`, `Quality Gate`, `Security Scan` from `CP Portal CI` |
| `ai-agent` | `Frontend Build`, `Backend Syntax`, `Quality Gate`, `Security Scan` from `AI-Agent CI` |

## Practical Merge Rule

- If a PR touches one product, that product CI must pass.
- If a PR touches multiple products, all affected product CI workflows must pass.
- If a PR touches `.github/**`, reviewers should expect CI/deploy/release impact.

## Hotfix Rule

For urgent production fixes:

1. PR should still be used if timing allows.
2. If an emergency direct push happens, it must be followed by:
   - incident note
   - root cause
   - follow-up PR or commit cleanup if needed

## Release Rule

Merging to `main` is not the same as releasing a product.

Releases should use app-specific tags:

- `mims-v...`
- `qms-v...`
- `vault-v...`
- `cp-portal-v...`
- `ai-agent-v...`
