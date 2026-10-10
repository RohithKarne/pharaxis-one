# CP Portal to MIMS bridge — go-live runbook

> **Status, 10 October 2026: local only.** Both apps run on one developer machine, and no hosting has been chosen (SOP §38.12). This page is what has to be true the day the bridge runs anywhere else. Until then, follow it on a fresh local install to prove it still works.

The bridge sends reports from CP Portal into MIMS. **The portal always starts the exchange; MIMS never calls the portal.** So MIMS needs to be reachable from the portal, and nothing needs to reach the portal from MIMS.

## 1. Before you start

- Both apps on the same version of `main`.
- A backup of both databases, taken and restored once to prove it works (see the backup runbook).
- The portal's public address and MIMS's address decided, both on HTTPS.
- A person in MIMS with MIMS Admin rights, and a portal administrator.

## 2. Settings

Set these on each server, outside the repository. Never commit a filled-in settings file.

**MIMS**

| Setting | Value | Why |
| --- | --- | --- |
| `ENABLE_API_PLATFORM` | `bridge` | Turns on only what the portal uses: the sign-in token, the cases routes and the API connections screen. `true` would turn on the whole public interface, including parts parked over security findings. Leave it unset and the bridge is off. |
| `MIMS_FRONTEND_BASE_URL`, `MIMS_BACKEND_BASE_URL` | MIMS's real addresses | Links in MIMS emails and alerts. |

**CP Portal**

| Setting | Value | Why |
| --- | --- | --- |
| `CP_FRONTEND_BASE_URL` | The portal's real address, for example `https://portal.example.com` | Every link the portal sends: "Open in portal" on a MIMS case, the visitor's private link in the confirmation email, alert emails. **If it is not set, all of these point at `http://localhost:5174`.** |
| `CP_SECRET_ENCRYPTION_KEY` | 64 hex characters, generated once and kept | Encrypts the MIMS client secret, the cached MIMS token and visitors' private links. The portal refuses to start encrypting in production without it. **Changing it later makes every stored secret and every visitor link unreadable**: the MIMS secret must be entered again, and visitors' question emails stop carrying their link (the links themselves still open). |
| `CP_INTERNAL_INTEGRATION_HOSTS` | MIMS's host name, only if MIMS is on a private network | The portal refuses to call private addresses unless the exact host is named here. |
| `CP_SCHEDULER` | Leave unset, or `external` | Unset: the portal runs its own timers (send retries every minute, MIMS changes every 5 minutes, comparison every hour). `external`: a scheduler must call the four `/api/internal/cron/…` addresses instead. |
| `CP_CRON_SECRET` | A long random value, only with `CP_SCHEDULER=external` | The scheduler sends it with each call. |
| `MIMS_CLOSE_SYNC_INTERVAL_MS`, `MIMS_RETRY_INTERVAL_MS`, `MIMS_RECONCILE_INTERVAL_MS` | Leave at the defaults | How often the portal reads MIMS's changes, retries failed sends, and compares lists. |

## 3. Secrets

1. In MIMS: **MIMS Admin → API connections → New connection.** Name it after the portal. Give it `cases:read` and `cases:write`, nothing else. Copy the client ID and secret; the secret is shown once.
2. In the portal: **Admin → client → Integration.** Auth type OAuth, API base URL = MIMS's backend address, client ID and secret from step 1, MIMS case URL base = MIMS's case address ending `/mims/cases/`. Save.
3. The secret never goes in email, chat, a ticket or the repository. It is stored encrypted on the portal.

**Changing the secret.** In MIMS, **New secret** on the connection. The old secret keeps working for 7 days, so enter the new one in the portal's Integration page within that week, then run Test Connection. After 7 days the old secret gets 401.

## 4. Migrations, in this order

Both apps run their own migrations when they start, and each is safe to run twice. Start **MIMS first**, then the portal: the portal's first contact checks MIMS's bridge version.

| Order | App | Migration | What it adds |
| --- | --- | --- | --- |
| 1 | MIMS | 164 | The fingerprint of each report received (receipt) |
| 2 | MIMS | 165 | The previous secret, for the 7-day changeover |
| 3 | MIMS | 166 | Where a case came from, whether the reporter can answer, duplicate flag, questions to the reporter |
| 4 | CP Portal | 0044 | MIMS's receipt on each request |
| 5 | CP Portal | 0045 | Comparison runs with MIMS |
| 6 | CP Portal | 0046 | Serious flag, due date, taken-on time, questions from MIMS |
| 7 | CP Portal | 0048 | Visitors' private links |

After starting, check each app's log says the migrations applied, and nothing failed. On the portal, `cp_schema_migrations` lists them; on MIMS, `schema_migrations`.

## 5. First-start checks

Do these in order. Stop at the first one that fails.

1. **Test Connection** on the portal's Integration page. Expect: sign-in works, MIMS reports bridge version 2 or later, and one trial report per form is accepted and thrown away. Any question listed as "arrives only in the case comment" is a mapping to look at, not a failure.
2. **One real report, end to end.** As a visitor, send an enquiry on the portal with your own work email. Expect: the confirmation email arrives with a private link; the request shows "✓ Receipt" on the portal's requests list; the case appears in MIMS with "From <portal>: CP-…" and "Open in portal" opens that request.
3. **A question.** On that MIMS case, ask the reporter a question. Within 5 minutes, expect an email with the same private link; open it, answer, and see the answer arrive as a comment on the case.
4. **A side effect marked serious.** Expect the critical alert in MIMS with its due date, and "Serious · due to authorities" on the portal's list. Close the test cases afterwards.
5. **Sync Health** on the portal. Expect a comparison run listed within the hour, with nothing missing.
6. **One path that should fail.** Change one character of the private link and open it. Expect "This link is not valid or has expired."

Write down what you saw for each, with the date, in the release record.

## 6. Watching it

- **Sync Health** on the portal: the last comparisons, failures and the monthly CSV.
- **Alerts** on the portal go to the integration team when a report keeps failing, MIMS deletes a case, a question cannot be shown, or more than 20 reports are missing at once (nothing is re-sent then; a person decides).
- In MIMS, serious side effects raise a critical alert that must be acknowledged.

## 7. Rolling back

- **Stop the bridge, keep both apps.** In the portal, switch the integration off on the Integration page. Reports stay on the portal, marked as not sent; when it is switched back on, the retry job sends them. Nothing is lost.
- **Stop MIMS accepting.** Unset `ENABLE_API_PLATFORM` and restart MIMS. The portal retries with growing gaps, then alerts. Same recovery as above.
- **Undo a release.** Put back the previous version of the code. The migrations above only add columns and tables, so the older code runs on the newer database; do not drop them. Restoring a database backup instead loses every report since the backup: run a comparison (Sync Health) afterwards, which finds and re-sends what MIMS lost, unless more than 20 are missing, in which case it alerts and a person decides.
- **A leaked secret.** In MIMS, press **New secret** twice. Only one old secret is kept, so the second press ends the leaked one at once. Enter the second new secret on the portal straight away and run Test Connection.

---

**References**

- Bridge-only mode: `apps/mims/backend/server.js` (the `ENABLE_API_PLATFORM` block); setting described in `apps/mims/.env.example`
- Portal timers and cron addresses: `apps/cp-portal/backend/server.js` (`/api/internal/cron/…`, the `CP_SCHEDULER` block)
- Private-address guard: `apps/cp-portal/backend/utils/networkGuard.js` (`CP_INTERNAL_INTEGRATION_HOSTS`)
- Encryption key: `apps/cp-portal/backend/utils/secretCrypto.js`
- Links built from `CP_FRONTEND_BASE_URL`: `apps/cp-portal/backend/routes/portal/submit.js`, `apps/cp-portal/backend/services/visitorLink.js`
- Migrations: `apps/mims/backend/database/migrations/164_*` to `166_*`, `apps/mims/backend/database/migrations/MIGRATION_BLOCKS.md`; `apps/cp-portal/backend/database/migrations/0044_*`, `0045_*`, `0046_*`, `0048_*`
- What each feature does and how it was proved: `docs/validation/CP_MIMS_BRIDGE_VALIDATION.md`
- Local-only status: `docs/TEAM_OPERATING_SOP.md` §38.12
