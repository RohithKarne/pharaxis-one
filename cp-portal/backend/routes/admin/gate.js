/**
 * Admin Gate — /api/admin/gate
 * Manage user-type gate config, user types, and feature access matrix per client
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
const { authenticateAdmin } = require('../../middleware/auth');
const { audit } = require('../../utils/audit');

// GET /api/admin/gate/:clientId — full gate config + user types + feature access matrix
router.get('/:clientId', authenticateAdmin, (req, res) => {
  const { clientId } = req.params;

  const config    = db.prepare('SELECT * FROM cp_gate_config WHERE client_id = ?').get(clientId);
  const userTypes = db.prepare('SELECT * FROM cp_gate_user_types WHERE client_id = ? ORDER BY display_order ASC').all(clientId);
  const features  = db.prepare('SELECT feature_key, display_name FROM cp_features WHERE client_id = ? AND is_enabled = 1 ORDER BY display_order ASC').all(clientId);
  const access    = db.prepare('SELECT feature_key, type_key, is_allowed FROM cp_feature_access WHERE client_id = ?').all(clientId);

  // Build access map: { feature_key: { type_key: is_allowed } }
  const accessMap = {};
  for (const row of access) {
    if (!accessMap[row.feature_key]) accessMap[row.feature_key] = {};
    accessMap[row.feature_key][row.type_key] = !!row.is_allowed;
  }

  res.json({ config: config || {}, userTypes, features, accessMap });
});

// PATCH /api/admin/gate/:clientId — update gate appearance config
router.patch('/:clientId', authenticateAdmin, (req, res) => {
  const { clientId } = req.params;
  const ALLOWED = ['is_enabled', 'gate_title', 'gate_subtitle', 'disclaimer_text', 'require_disclaimer'];
  const updates = [], params = [];
  for (const k of ALLOWED) {
    if (req.body[k] !== undefined) { updates.push(`${k} = ?`); params.push(req.body[k]); }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update.' });
  updates.push(`updated_at = datetime('now')`);
  params.push(clientId);

  const existing = db.prepare('SELECT id FROM cp_gate_config WHERE client_id = ?').get(clientId);
  if (existing) {
    db.prepare(`UPDATE cp_gate_config SET ${updates.join(', ')} WHERE client_id = ?`).run(...params);
  } else {
    db.prepare(`INSERT INTO cp_gate_config (client_id, ${ALLOWED.filter(k => req.body[k] !== undefined).join(', ')}) VALUES (?, ${ALLOWED.filter(k => req.body[k] !== undefined).map(() => '?').join(', ')})`).run(clientId, ...params.slice(0, -1));
  }
  audit(req.admin, clientId, 'UPDATE', 'gate', clientId, { fields: Object.keys(req.body) });
  res.json({ message: 'Gate config updated.' });
});

// GET /api/admin/gate/:clientId/user-types — list user types
router.get('/:clientId/user-types', authenticateAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM cp_gate_user_types WHERE client_id = ? ORDER BY display_order ASC').all(req.params.clientId);
  res.json({ userTypes: rows });
});

// PATCH /api/admin/gate/:clientId/user-types/:typeId — update a user type
router.patch('/:clientId/user-types/:typeId', authenticateAdmin, (req, res) => {
  const { clientId, typeId } = req.params;
  const ALLOWED = ['label', 'description', 'icon', 'display_order', 'is_enabled'];
  const updates = [], params = [];
  for (const k of ALLOWED) {
    if (req.body[k] !== undefined) { updates.push(`${k} = ?`); params.push(req.body[k]); }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update.' });
  params.push(typeId, clientId);
  db.prepare(`UPDATE cp_gate_user_types SET ${updates.join(', ')} WHERE id = ? AND client_id = ?`).run(...params);
  audit(req.admin, clientId, 'UPDATE', 'gate', typeId, { entity: 'user_type', fields: Object.keys(req.body) });
  res.json({ message: 'User type updated.' });
});

// PATCH /api/admin/gate/:clientId/access — bulk update feature access matrix
// Body: { updates: [{ feature_key, type_key, is_allowed }] }
router.patch('/:clientId/access', authenticateAdmin, (req, res) => {
  const { clientId } = req.params;
  const { updates } = req.body;
  if (!Array.isArray(updates) || updates.length === 0) return res.status(400).json({ error: 'updates array required.' });

  const upsert = db.prepare(`
    INSERT INTO cp_feature_access (client_id, feature_key, type_key, is_allowed)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(client_id, feature_key, type_key) DO UPDATE SET is_allowed = excluded.is_allowed
  `);
  const txn = db.transaction(() => {
    for (const u of updates) upsert.run(clientId, u.feature_key, u.type_key, u.is_allowed ? 1 : 0);
  });
  txn();
  audit(req.admin, clientId, 'UPDATE', 'gate', null, { entity: 'access_matrix', count: updates.length });
  res.json({ message: `${updates.length} access rules updated.` });
});

module.exports = router;
