/**
 * Admin Compliance — /api/admin/compliance
 * F-02: Jurisdiction config, banner config, consent audit log per client
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const { audit } = require('../../utils/audit');

router.use('/:clientId', authenticateAdmin, requireClientAccess);

// GET /api/admin/compliance/:clientId — get compliance config
router.get('/:clientId', authenticateAdmin, async (req, res) => {
  try {
    const { clientId } = req.params;
    let [[row]] = await pool.execute('SELECT * FROM cp_compliance_config WHERE client_id = ?', [clientId]);
    if (!row) {
      // Auto-create default config if missing
      await pool.execute(`INSERT INTO cp_compliance_config (client_id) VALUES (?)`, [clientId]);
      [[row]] = await pool.execute('SELECT * FROM cp_compliance_config WHERE client_id = ?', [clientId]);
    }
    res.json({ compliance: row });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PATCH /api/admin/compliance/:clientId — update jurisdiction + banner config
router.patch('/:clientId', authenticateAdmin, async (req, res) => {
  try {
    const { clientId } = req.params;
    const { jurisdictions, banner_config, version, require_reconsent } = req.body;

    const [[existing]] = await pool.execute('SELECT id FROM cp_compliance_config WHERE client_id = ?', [clientId]);
    if (!existing) {
      await pool.execute(`INSERT INTO cp_compliance_config (client_id) VALUES (?)`, [clientId]);
    }

    const fields = [];
    const values = [];

    if (jurisdictions !== undefined) {
      fields.push('jurisdictions_json = ?');
      values.push(JSON.stringify(jurisdictions));
    }
    if (banner_config !== undefined) {
      fields.push('banner_config_json = ?');
      values.push(JSON.stringify(banner_config));
    }
    if (version !== undefined) {
      fields.push('version = ?');
      values.push(version);
    }
    if (require_reconsent !== undefined) {
      fields.push('require_reconsent = ?');
      values.push(require_reconsent ? 1 : 0);
    }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update.' });

    fields.push('updated_at = NOW()');
    values.push(clientId);

    await pool.execute(`UPDATE cp_compliance_config SET ${fields.join(', ')} WHERE client_id = ?`, values);

    const [[updated]] = await pool.execute('SELECT * FROM cp_compliance_config WHERE client_id = ?', [clientId]);
    await audit(req.admin, clientId, 'UPDATE', 'compliance', clientId, { jurisdictions, version });
    res.json({ compliance: updated });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/compliance/:clientId/trigger-reconsent — bump version to invalidate all existing consents
router.post('/:clientId/trigger-reconsent', authenticateAdmin, async (req, res) => {
  try {
    const { clientId } = req.params

    let [[row]] = await pool.execute('SELECT * FROM cp_compliance_config WHERE client_id = ?', [clientId])
    if (!row) {
      await pool.execute(`INSERT INTO cp_compliance_config (client_id) VALUES (?)`, [clientId])
      ;[[row]] = await pool.execute('SELECT * FROM cp_compliance_config WHERE client_id = ?', [clientId])
    }

    // Bump the patch version: 1.0 → 1.1, 1.9 → 1.10, 2 → 2.1
    const current = (row.version || '1.0').replace(/^v/i, '')
    const parts   = current.split('.')
    parts[parts.length - 1] = String(Number(parts[parts.length - 1]) + 1)
    const newVersion = parts.join('.')

    await pool.execute(`UPDATE cp_compliance_config SET version=?, require_reconsent=1, updated_at=NOW() WHERE client_id=?`,
      [newVersion, clientId])

    await audit(req.admin, clientId, 'TRIGGER_RECONSENT', 'compliance', clientId, { old_version: current, new_version: newVersion })
    res.json({ ok: true, new_version: newVersion, message: `Re-acceptance triggered. All portal users will be prompted to re-consent (version ${newVersion}).` })
  } catch (err) {
    res.status(500).json({ error: 'Server error.' })
  }
})

// GET /api/admin/compliance/:clientId/consent-records — audit log (paginated)
router.get('/:clientId/consent-records', authenticateAdmin, async (req, res) => {
  try {
    const { clientId } = req.params;
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const [[{ cnt: total }]] = await pool.execute('SELECT COUNT(*) as cnt FROM cp_consent_records WHERE client_id = ?', [clientId]);
    const [records] = await pool.execute(`
      SELECT cr.*, u.email as user_email, u.first_name, u.last_name
      FROM cp_consent_records cr
      LEFT JOIN cp_portal_users u ON u.id = cr.user_id
      WHERE cr.client_id = ?
      ORDER BY cr.consented_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `, [clientId]);

    res.json({ records, total, page, limit });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
