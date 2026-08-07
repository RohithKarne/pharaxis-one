/**
 * Admin Gate — /api/admin/gate
 * Manage user-type gate config, user types, and feature access matrix per client
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const { audit } = require('../../utils/audit');
const log = require('../../utils/logger');

router.use('/:clientId', authenticateAdmin, requireClientAccess);

// GET /api/admin/gate/:clientId — full gate config + user types + feature access matrix
router.get('/:clientId', authenticateAdmin, async (req, res) => {
  try {
    const { clientId } = req.params;

    const [[config]]  = await pool.execute('SELECT * FROM cp_gate_config WHERE client_id = ?', [clientId]);
    const [userTypes] = await pool.execute('SELECT * FROM cp_gate_user_types WHERE client_id = ? ORDER BY display_order ASC', [clientId]);
    const [features]  = await pool.execute('SELECT feature_key, display_name FROM cp_features WHERE client_id = ? AND is_enabled = 1 ORDER BY display_order ASC', [clientId]);
    const [access]    = await pool.execute('SELECT feature_key, type_key, is_allowed FROM cp_feature_access WHERE client_id = ?', [clientId]);

    // Build access map: { feature_key: { type_key: is_allowed } }
    const accessMap = {};
    for (const row of access) {
      if (!accessMap[row.feature_key]) accessMap[row.feature_key] = {};
      accessMap[row.feature_key][row.type_key] = !!row.is_allowed;
    }

    res.json({ config: config || {}, userTypes, features, accessMap });
  } catch (err) {
    log.error('admin.gate.error', { err, route: 'GET /:clientId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// PATCH /api/admin/gate/:clientId — update gate appearance config
router.patch('/:clientId', authenticateAdmin, async (req, res) => {
  try {
    const { clientId } = req.params;
    const ALLOWED = ['is_enabled', 'gate_title', 'gate_subtitle', 'disclaimer_text', 'require_disclaimer'];
    const updates = [], params = [];
    for (const k of ALLOWED) {
      if (req.body[k] !== undefined) { updates.push(`${k} = ?`); params.push(req.body[k]); }
    }
    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update.' });
    updates.push(`updated_at = NOW()`);
    params.push(clientId);

    const [[existing]] = await pool.execute('SELECT id FROM cp_gate_config WHERE client_id = ?', [clientId]);
    if (existing) {
      await pool.execute(`UPDATE cp_gate_config SET ${updates.join(', ')} WHERE client_id = ?`, params);
    } else {
      const setKeys = ALLOWED.filter(k => req.body[k] !== undefined);
      const insertParams = [clientId, ...params.slice(0, -1)];
      await pool.execute(
        `INSERT INTO cp_gate_config (client_id, ${setKeys.join(', ')}) VALUES (?, ${setKeys.map(() => '?').join(', ')})`,
        insertParams
      );
    }
    await audit(req.admin, clientId, 'UPDATE', 'gate', clientId, { fields: Object.keys(req.body) });
    res.json({ message: 'Gate config updated.' });
  } catch (err) {
    log.error('admin.gate.error', { err, route: 'PATCH /:clientId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/gate/:clientId/user-types — list user types
router.get('/:clientId/user-types', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM cp_gate_user_types WHERE client_id = ? ORDER BY display_order ASC', [req.params.clientId]);
    res.json({ userTypes: rows });
  } catch (err) {
    log.error('admin.gate.error', { err, route: 'GET /:clientId/user-types', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// PATCH /api/admin/gate/:clientId/user-types/:typeId — update a user type
router.patch('/:clientId/user-types/:typeId', authenticateAdmin, async (req, res) => {
  try {
    const { clientId, typeId } = req.params;
    const ALLOWED = ['label', 'description', 'icon', 'display_order', 'is_enabled'];
    const updates = [], params = [];
    for (const k of ALLOWED) {
      if (req.body[k] !== undefined) { updates.push(`${k} = ?`); params.push(req.body[k]); }
    }
    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update.' });
    params.push(typeId, clientId);
    await pool.execute(`UPDATE cp_gate_user_types SET ${updates.join(', ')} WHERE id = ? AND client_id = ?`, params);
    await audit(req.admin, clientId, 'UPDATE', 'gate', typeId, { entity: 'user_type', fields: Object.keys(req.body) });
    res.json({ message: 'User type updated.' });
  } catch (err) {
    log.error('admin.gate.error', { err, route: 'PATCH /:clientId/user-types/:typeId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// PATCH /api/admin/gate/:clientId/access — bulk update feature access matrix
// Body: { updates: [{ feature_key, type_key, is_allowed }] }
router.patch('/:clientId/access', authenticateAdmin, async (req, res) => {
  try {
    const { clientId } = req.params;
    const { updates } = req.body;
    if (!Array.isArray(updates) || updates.length === 0) return res.status(400).json({ error: 'updates array required.' });

    const conn = await pool.getConnection();
    await conn.beginTransaction();
    try {
      for (const u of updates) {
        await conn.execute(
          `INSERT INTO cp_feature_access (client_id, feature_key, type_key, is_allowed)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE is_allowed = VALUES(is_allowed)`,
          [clientId, u.feature_key, u.type_key, u.is_allowed ? 1 : 0]
        );
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    await audit(req.admin, clientId, 'UPDATE', 'gate', null, { entity: 'access_matrix', count: updates.length });
    res.json({ message: `${updates.length} access rules updated.` });
  } catch (err) {
    log.error('admin.gate.error', { err, route: 'PATCH /:clientId/access', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
