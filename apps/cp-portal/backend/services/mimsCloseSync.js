/**
 * mimsCloseSync — B1 close-sync poller.
 *
 * Pull model (CP → MIMS): for each client with an active integration, look up its
 * already-synced submissions and ask MIMS for each linked case's current status.
 * When the MIMS case is Closed, auto-close the CP inquiry and write an attributable
 * audit entry (A1). Reuses the same SSRF-guarded, bearer-authenticated channel the
 * outbound sync uses, so no new attack surface.
 */
const { pool } = require('../database/db');
const { getAuthHeaders } = require('./mimsAuth');
const { safeFetch } = require('../utils/networkGuard');
const { systemAudit } = require('../utils/audit');

const BATCH = 100;

// MIMS "Closed" workflow state (also matches "Closed - …" variants). Reopened /
// other states are intentionally not treated as closed.
function isClosedStatus(name) {
  return typeof name === 'string' && /^closed/i.test(name.trim());
}

// NEW-D: auth headers come from mimsAuth (handles static bearer/apikey AND the
// hourly-expiring OAuth tokens that used to silently kill this poller).
async function buildHeaders(integ) {
  const headers = { 'Content-Type': 'application/json', ...(await getAuthHeaders(integ)) };
  if (integ.extra_headers) { try { Object.assign(headers, JSON.parse(integ.extra_headers)); } catch (_) {} }
  return headers;
}

// Poll every active integration once. Returns the number of inquiries auto-closed.
async function pollOnce() {
  const [integrations] = await pool.execute('SELECT * FROM cp_integration_config WHERE is_active = 1');
  let closedCount = 0;

  for (const integ of integrations) {
    // synced + linked to a MIMS case + not yet closed
    // LIMIT is interpolated from our own integer constant (not user input) — mysql2
    // prepared statements reject a bound LIMIT parameter, matching the rest of the codebase.
    const [subs] = await pool.execute(
      `SELECT id, external_ref FROM cp_submissions
        WHERE client_id = ? AND status = 'synced' AND external_ref IS NOT NULL
        ORDER BY id ASC LIMIT ${BATCH}`,
      [integ.client_id]
    );
    if (!subs.length) continue;

    let headers;
    try { headers = await buildHeaders(integ); } catch (_) { continue; } // bad creds → skip this tick
    for (const s of subs) {
      try {
        const url = new URL(`/api/v1/cases/${encodeURIComponent(s.external_ref)}`, integ.api_base_url).toString();
        const r = await safeFetch(url, { method: 'GET', headers }); // SSRF-guarded
        if (!r.ok) continue; // 404/5xx → leave as-is, retry next tick
        const data = await r.json().catch(() => ({}));
        if (!isClosedStatus(data.status)) continue;

        // Guard the write on status='synced' so a concurrent change can't be clobbered.
        const [upd] = await pool.execute(
          `UPDATE cp_submissions SET status='closed', updated_at=NOW() WHERE id=? AND status='synced'`,
          [s.id]
        );
        if (upd.affectedRows > 0) {
          closedCount++;
          // A1: attributable auto-close — who (system), what (source MIMS case), when (implicit).
          systemAudit('MIMS integration', integ.client_id, 'CLOSED_AUTO', 'submission', s.id, {
            mims_case_id: s.external_ref, source: 'mims-close-sync',
          });
        }
      } catch (_) { /* per-item non-fatal — next tick retries */ }
    }
  }
  return closedCount;
}

module.exports = { pollOnce, isClosedStatus };
