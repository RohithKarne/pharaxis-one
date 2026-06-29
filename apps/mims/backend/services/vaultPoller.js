'use strict';

const pool = require('../database/db');
const { getVaultSession, runVQL } = require('./vaultService');

// WP3: per-org in-flight guard. The HTTP poll trigger can fire concurrently; two
// overlapping runs for the same org would duplicate/interleave expiry writes and
// race the watermark. (Single main-process scope — a DB lock would be needed if the
// trigger ever runs in multiple processes.)
const _pollingOrgs = new Set();

async function pollVaultForOrg(orgId) {
  if (_pollingOrgs.has(orgId)) {
    return { skipped: true, reason: 'Poll already in progress for this org' };
  }
  _pollingOrgs.add(orgId);
  try {
    const [rows] = await pool.query(
      'SELECT id, last_poll_at, poll_interval_hours FROM org_vault_config WHERE org_id = ? AND enabled = 1 LIMIT 1',
      [orgId]
    );

    if (!rows || rows.length === 0) {
      return { skipped: true, reason: 'Vault not configured or disabled' };
    }

    const config = rows[0];
    const lastPollAt = config.last_poll_at
      ? config.last_poll_at.toISOString().replace('T', ' ').substring(0, 19)
      : '2000-01-01 00:00:00';

    try {
      // WP3: capture the watermark BEFORE the VQL call. Setting last_poll_at = NOW()
      // after the query dropped any document modified during the VQL/processing window.
      const pollStartedAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const session = await getVaultSession(orgId);
      const vql =
        "SELECT id, name__v, status__v, version_modified_date__v FROM documents WHERE status__v IN ('expired__v','archived__v','withdrawn__v','superseded__v') AND version_modified_date__v >= '" +
        lastPollAt +
        "'";

      const data = await runVQL(session, vql);

      if (data && data.length > 0) {
        for (const doc of data) {
          await pool.query(
            'UPDATE cm_documents SET expiry_date = CURDATE(), vault_source_status = ? WHERE vault_source_id = ? AND org_id = ? AND (expiry_date IS NULL OR expiry_date > CURDATE())',
            [doc.status__v, doc.id, orgId]
          );
        }
      }

      await pool.query('UPDATE org_vault_config SET last_poll_at = ? WHERE org_id = ?', [pollStartedAt, orgId]);

      return { processed: data ? data.length : 0, org_id: orgId };
    } catch (err) {
      const message = err && err.message ? err.message : '';
      if (
        message.includes('ENOTFOUND') ||
        message.includes('ECONNREFUSED') ||
        message.includes('failed, reason:') ||
        message.includes('Vault not configured') ||
        message.includes('Vault auth failed')
      ) {
        return { processed: 0, org_id: orgId, warning: message };
      }
      throw err;
    }
  } catch (err) {
    return { error: err.message, org_id: orgId };
  } finally {
    _pollingOrgs.delete(orgId);
  }
}

module.exports = { pollVaultForOrg };
