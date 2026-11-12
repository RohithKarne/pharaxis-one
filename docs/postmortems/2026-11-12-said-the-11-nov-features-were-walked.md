# Postmortem — we said the 11th Nov work was walked on screen; much of it could not run — 12th Nov 2026

Written under RULES.md › When we get it wrong. Blameless: this names mechanisms, not people.

## What we said

In `docs/TASKS.md`, both merged to `main` on 11th Nov 2026 (#816, #817):

> Table 1 core fixes, row 4: "Reorder MIMS forced password reset sequence: 2FA verified before password reset … ✅"

> Seven strategic enhancements, row 10: "Screen walk passing and failing verification report & sign-offs … ✅" (Tim, Varun, Saad, John)

`docs/PROGRESS.md` and `docs/CHANGELOG.md` describe all seven enhancements as delivered.

## What was true

Found on 12th Nov 2026 while upgrading the toolchain, on a sealed copy of the dev data:

1. **CP Portal could not start.** Two routes from #817 loaded `utils/ssrf`, which does not exist.
2. **Field insights never saved.** The route used the database module wrongly (`pool.execute is not a function`) and answered "captured" with a made-up ID. The dev database holds 0 insights. The route also had no sign-in, and its list returned every client's insights to anyone.
3. **Reporter clarification links failed at every step.** The link pointed at MIMS, not CP Portal; the page crashed outside a client portal; MIMS read a column that does not exist (`cases.product_name`); the answer wrote a column that does not exist (`case_comments.org_id`) and a NULL audit user.
4. **A forced password reset was skipped** for every user with two-step sign-in. The user lookup never read `password_reset_required`, and the sign-in page only routed a reset from the password step.
5. **Fresh databases could not be built.** CP Portal migration 0064 was not folded into the baseline; MIMS migration 191 named `organizations` instead of `organisations`. Both suites that build a fresh database failed, so CI was red; the MIMS security scan was also red (token in a URL query).

## How long it stood

One day. Nobody outside the team relied on it; the products are local only.

## Why the check did not catch it

**The "screen walk" was not a walk of these features on a freshly started app.** A syntax check and a frontend build pass on code that cannot start, because neither loads every module or calls the database. Both pull requests were merged with CI red: #817 with Unit Tests (both apps) and Security Scan failing, #816 with Quality Gate, Security Scan and Unit Tests failing (`gh pr checks 816`, `gh pr checks 817`, read 12th Nov 2026). RULES.md › Getting a change to main says never merge red.

## Systemic fix

- Every defect above is fixed on `feat/toolchain-upgrade-node26`, each in its own commit, and walked on screen with a failing path.
- Before a feature is marked walked, the app is restarted from the branch and every new route is called at least once on screen (proposed as a lesson; RULES.md changes only on Rohith's word).
- A check that resolves every relative `require` in both backends was used on this branch; adding it to CI is proposed.
- No Jira ticket (no Jira for this work).
