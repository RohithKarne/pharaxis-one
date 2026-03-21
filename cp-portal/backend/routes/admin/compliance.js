/**
 * Admin Compliance — /api/admin/compliance
 * F-02: Jurisdiction config, banner config, consent audit log per client
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
const { authenticateAdmin } = require('../../middleware/auth');
const { audit } = require('../../utils/audit');

// GET /api/admin/compliance/:clientId — get compliance config
router.get('/:clientId', authenticateAdmin, (req, res) => {
  const { clientId } = req.params;
  let row = db.prepare('SELECT * FROM cp_compliance_config WHERE client_id = ?').get(clientId);
  if (!row) {
    // Auto-create default config if missing
    db.prepare(`INSERT INTO cp_compliance_config (client_id) VALUES (?)`).run(clientId);
    row = db.prepare('SELECT * FROM cp_compliance_config WHERE client_id = ?').get(clientId);
  }
  res.json({ compliance: row });
});

// PATCH /api/admin/compliance/:clientId — update jurisdiction + banner config
router.patch('/:clientId', authenticateAdmin, (req, res) => {
  const { clientId } = req.params;
  const { jurisdictions, banner_config, version, require_reconsent } = req.body;

  const existing = db.prepare('SELECT id FROM cp_compliance_config WHERE client_id = ?').get(clientId);
  if (!existing) {
    db.prepare(`INSERT INTO cp_compliance_config (client_id) VALUES (?)`).run(clientId);
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

  fields.push("updated_at = datetime('now')");
  values.push(clientId);

  db.prepare(`UPDATE cp_compliance_config SET ${fields.join(', ')} WHERE client_id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM cp_compliance_config WHERE client_id = ?').get(clientId);
  audit(req.admin, clientId, 'UPDATE', 'compliance', clientId, { jurisdictions, version });
  res.json({ compliance: updated });
});

// POST /api/admin/compliance/:clientId/trigger-reconsent — bump version to invalidate all existing consents
router.post('/:clientId/trigger-reconsent', authenticateAdmin, (req, res) => {
  const { clientId } = req.params

  let row = db.prepare('SELECT * FROM cp_compliance_config WHERE client_id = ?').get(clientId)
  if (!row) {
    db.prepare(`INSERT INTO cp_compliance_config (client_id) VALUES (?)`).run(clientId)
    row = db.prepare('SELECT * FROM cp_compliance_config WHERE client_id = ?').get(clientId)
  }

  // Bump the patch version: 1.0 → 1.1, 1.9 → 1.10, 2 → 2.1
  const current = (row.version || '1.0').replace(/^v/i, '')
  const parts   = current.split('.')
  parts[parts.length - 1] = String(Number(parts[parts.length - 1]) + 1)
  const newVersion = parts.join('.')

  db.prepare(`UPDATE cp_compliance_config SET version=?, require_reconsent=1, updated_at=datetime('now') WHERE client_id=?`)
    .run(newVersion, clientId)

  audit(req.admin, clientId, 'TRIGGER_RECONSENT', 'compliance', clientId, { old_version: current, new_version: newVersion })
  res.json({ ok: true, new_version: newVersion, message: `Re-acceptance triggered. All portal users will be prompted to re-consent (version ${newVersion}).` })
})

// GET /api/admin/compliance/:clientId/consent-records — audit log (paginated)
router.get('/:clientId/consent-records', authenticateAdmin, (req, res) => {
  const { clientId } = req.params;
  const page  = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const offset = (page - 1) * limit;

  const total = db.prepare('SELECT COUNT(*) as cnt FROM cp_consent_records WHERE client_id = ?').get(clientId).cnt;
  const records = db.prepare(`
    SELECT cr.*, u.email as user_email, u.first_name, u.last_name
    FROM cp_consent_records cr
    LEFT JOIN cp_portal_users u ON u.id = cr.user_id
    WHERE cr.client_id = ?
    ORDER BY cr.consented_at DESC
    LIMIT ? OFFSET ?
  `).all(clientId, limit, offset);

  res.json({ records, total, page, limit });
});

module.exports = router;
