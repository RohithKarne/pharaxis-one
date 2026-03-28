'use strict';

/**
 * admin/caseNumbering.js — Case Number Configuration API (F-01)
 * Per-org, per-case-type number format config with live preview.
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');

async function audit(userId, userName, action, entity, entityId, details) {
  try {
    await pool.execute(
      'INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, userName, action, entity, entityId, JSON.stringify(details)]
    );
  } catch (_) {}
}

// Build a preview string from a config object
function buildPreview(cfg, seq = 1) {
  const parts = [];
  if (cfg.prefix) parts.push(cfg.prefix);
  const now = new Date();
  if (cfg.include_year)  parts.push(String(now.getFullYear()));
  if (cfg.include_month) parts.push(String(now.getMonth() + 1).padStart(2, '0'));
  const seqStr = String(seq).padStart(cfg.seq_length || 5, '0');
  parts.push(seqStr);
  return parts.join(cfg.separator === 'none' ? '' : (cfg.separator || '-'));
}

// GET /api/admin/case-number-config — list all configs (global + per org)
router.get('/case-number-config', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT c.*, o.name AS org_name
      FROM case_number_config c
      LEFT JOIN organisations o ON o.id = c.org_id
      ORDER BY c.org_id IS NULL DESC, o.name, c.case_type
    `);
    const configs = rows.map(r => ({ ...r, preview: buildPreview(r, r.current_seq + 1) }));
    res.json({ configs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/case-number-config/preview — preview without saving
router.get('/case-number-config/preview', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  const { prefix = 'CASE', separator = '-', include_year = '1', include_month = '0', seq_length = '5' } = req.query;
  const cfg = {
    prefix,
    separator,
    include_year:  parseInt(include_year, 10),
    include_month: parseInt(include_month, 10),
    seq_length:    parseInt(seq_length, 10),
  };
  res.json({ preview: buildPreview(cfg, 1) });
});

// POST /api/admin/case-number-config — upsert a config
router.post('/case-number-config', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { org_id = null, case_type = 'ALL', prefix, separator, include_year, include_month, seq_length } = req.body;
    if (!prefix) return res.status(400).json({ error: 'Prefix is required.' });

    // Check if locked (cases already exist for this org/type)
    const [[existing]] = await pool.execute(
      'SELECT id, is_locked FROM case_number_config WHERE org_id <=> ? AND case_type = ?',
      [org_id, case_type]
    );
    if (existing?.is_locked) {
      return res.status(409).json({ error: 'This configuration is locked. Cases already exist using this format.' });
    }

    // MySQL UNIQUE KEY treats NULL as distinct — use explicit check + insert/update
    if (existing) {
      await pool.execute(
        'UPDATE case_number_config SET prefix = ?, `separator` = ?, include_year = ?, include_month = ?, seq_length = ?, updated_at = NOW() WHERE id = ?',
        [prefix, separator || '-', include_year ? 1 : 0, include_month ? 1 : 0, parseInt(seq_length, 10) || 5, existing.id]
      );
    } else {
      await pool.execute(
        'INSERT INTO case_number_config (org_id, case_type, prefix, `separator`, include_year, include_month, seq_length) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [org_id, case_type, prefix, separator || '-', include_year ? 1 : 0, include_month ? 1 : 0, parseInt(seq_length, 10) || 5]
      );
    }

    const [[saved]] = await pool.execute(
      'SELECT * FROM case_number_config WHERE org_id <=> ? AND case_type = ?',
      [org_id, case_type]
    );

    await audit(req.user.id, req.user.name, 'UPSERT', 'case_number_config', saved.id, { case_type, prefix });
    res.json({ config: { ...saved, preview: buildPreview(saved, saved.current_seq + 1) } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/case-number-config/:id — remove config (only if not locked)
router.delete('/case-number-config/:id', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const [[row]] = await pool.execute('SELECT * FROM case_number_config WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Not found.' });
    if (row.is_locked) return res.status(409).json({ error: 'Cannot delete a locked configuration.' });
    await pool.execute('DELETE FROM case_number_config WHERE id = ?', [req.params.id]);
    await audit(req.user.id, req.user.name, 'DELETE', 'case_number_config', req.params.id, {});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
