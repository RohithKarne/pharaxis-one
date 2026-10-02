# Postmortem — we told the CEO four Vault queries were dead code to delete, and they are a live connector — 28th Sep 2026

Written under SOP §37.1 (the "Vault claim" in the 27–30 Sep walk). Blameless: this names mechanisms, not people.
Rebuilt on 2 Oct 2026 from the walk session's own record, because the walk log no longer exists.

## What we said

In the plan for fixing the broken database queries found by the walk (T16), the engineering
view put this row to Rohith: "Vault integration — 4 — **Dead code.** Vault was removed on 9 Sep,
so delete rather than fix." The two-day estimate and the 6 October date that followed were
partly built on it.

## What was true

The four queries belong to the live Veeva Vault document connector, which has its own admin
screen and a background poller. The Vault that was removed on 9 Sep was a different thing: our
own document product of the same name. One of the four was not even a database query; it was
Veeva's own query language, sent to Veeva. Nothing was deleted.

## How long it stood

From the evening of 28 Sep (16:19 UTC) to the next morning (03:40 UTC), about 11 hours. It
shaped the T16 plan and estimate, which Rohith had seen. It was caught while working through
T16, when a search was run before calling another file dead.

## Why the check did not catch it

The queries were called dead because of their name. "Vault" matched the product removed on
9 Sep, and the one check that answers "is this used", a search for every place that loads
or calls the code, was not run before saying so.

## Systemic fix

[MIPM-111](https://rohithkarne.atlassian.net/browse/MIPM-111) proposes SOP wording that code
is called dead only after searching for every place that mounts, imports or calls it, and
quoting that search. It needs Rohith's yes. The same session adopted the habit on the spot:
the next "dead" verdict, on the cases controller, began with that search.

---

**References**

- The claim: the walk session's T16 table, chat, 28 Sep 2026, 16:19 UTC.
- The correction: the walk session's chat, 29 Sep 2026, 03:40 UTC ("I told you the four 'Vault'
  queries were dead code … That was wrong").
- The live connector: `apps/mims/backend/routes/integrations/vaultAdmin.js` (admin screen
  routes) and `apps/mims/backend/services/vaultPoller.js` (poller). Batch 5 changed both
  (MIPM-97, time limit on outside calls).
- Governing rule: SOP §37.1. Same class as L-014 and L-015 in `docs/lessons.md`.
