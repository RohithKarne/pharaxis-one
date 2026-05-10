/**
 * Admin Features — /api/admin/features
 * Enable/disable/reorder portal sections per client
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const { audit } = require('../../utils/audit');

router.use('/:clientId', authenticateAdmin, requireClientAccess);

// GET /api/admin/features/:clientId
router.get('/:clientId', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM cp_features WHERE client_id = ? ORDER BY display_order ASC', [req.params.clientId]);
    res.json({ features: rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PATCH /api/admin/features/:clientId/:featureKey — toggle or rename
router.patch('/:clientId/:featureKey', authenticateAdmin, async (req, res) => {
  try {
    const { clientId, featureKey } = req.params;
    const { is_enabled, display_name, display_order, icon } = req.body;
    const updates = [], params = [];
    if (is_enabled !== undefined)    { updates.push('is_enabled = ?');    params.push(is_enabled ? 1 : 0); }
    if (display_name !== undefined)  { updates.push('display_name = ?');  params.push(display_name); }
    if (display_order !== undefined) { updates.push('display_order = ?'); params.push(display_order); }
    if (icon !== undefined)          { updates.push('icon = ?');           params.push(icon); }
    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update.' });
    params.push(clientId, featureKey);
    await pool.execute(`UPDATE cp_features SET ${updates.join(', ')} WHERE client_id = ? AND feature_key = ?`, params);
    await audit(req.admin, clientId, is_enabled !== undefined ? (is_enabled ? 'ENABLE' : 'DISABLE') : 'UPDATE', 'feature', featureKey, { feature_key: featureKey, ...req.body });
    res.json({ message: 'Feature updated.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/features/:clientId/reorder — bulk reorder
router.post('/:clientId/reorder', authenticateAdmin, async (req, res) => {
  try {
    const { order } = req.body; // [{ feature_key, display_order }]
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array.' });
    const conn = await pool.getConnection();
    await conn.beginTransaction();
    try {
      for (const o of order) {
        await conn.execute(
          'UPDATE cp_features SET display_order = ? WHERE client_id = ? AND feature_key = ?',
          [o.display_order, req.params.clientId, o.feature_key]
        );
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    await audit(req.admin, req.params.clientId, 'UPDATE', 'feature', null, { action: 'reorder' });
    res.json({ message: 'Order updated.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
