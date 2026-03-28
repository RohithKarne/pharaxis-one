'use strict';

/**
 * cases.js — Case Management Core API
 * F-13: New case creation + case number generation (Bhavya)
 * F-15: Case information update + auto-save (Vivek)
 *
 * RAJEEV REVIEW POINT: assign-number endpoint uses DB transaction + FOR UPDATE
 * row-lock on case_number_config to guarantee sequence uniqueness under concurrency.
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../database/db');
const { authenticate, requireRole, requireOrg } = require('../middleware/auth');

// ─── LIST CASES ──────────────────────────────────────────────────────────────

// GET /api/cases — list cases with filters
router.get('/cases', authenticate, requireOrg, async (req, res) => {
  try {
    const { type, status_id, owner_id, deleted, search } = req.query;
    const limit  = parseInt(req.query.limit  || 50, 10);
    const offset = parseInt(req.query.offset || 0,  10);

    let query = `
      SELECT c.*,
        o.name  AS org_name,
        s.name  AS site_name,
        ws.name AS status_name,
        u.name  AS owner_name
      FROM cases c
      LEFT JOIN organisations  o  ON c.org_id        = o.id
      LEFT JOIN sites          s  ON c.site_id        = s.id
      LEFT JOIN workflow_states ws ON c.status_id     = ws.id
      LEFT JOIN users           u  ON c.case_owner_id = u.id
      WHERE c.is_deleted = ${deleted === 'true' ? 1 : 0}
    `;
    const params = [];
    // Org isolation — always scope to req.user.orgId (superadmin has no orgId, sees all)
    if (req.user.orgId) { query += ' AND c.org_id = ?'; params.push(req.user.orgId); }
    if (type)      { query += ' AND c.case_type = ?';              params.push(type); }
    if (status_id) { query += ' AND c.status_id = ?';              params.push(status_id); }
    if (owner_id)  { query += ' AND c.case_owner_id = ?';          params.push(owner_id); }
    if (search)    {
      query += ' AND (c.case_number LIKE ? OR c.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    query += ` ORDER BY c.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (err) {
    console.error('GET /cases error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cases/my — cases owned by the logged-in user
router.get('/cases/my', authenticate, async (req, res) => {
  try {
    const limit  = parseInt(req.query.limit  || 50, 10);
    const offset = parseInt(req.query.offset || 0,  10);
    const [rows] = await pool.execute(
      `SELECT c.*, o.name AS org_name, s.name AS site_name, ws.name AS status_name
       FROM cases c
       LEFT JOIN organisations   o  ON c.org_id    = o.id
       LEFT JOIN sites           s  ON c.site_id   = s.id
       LEFT JOIN workflow_states ws ON c.status_id = ws.id
       WHERE c.case_owner_id = ? AND c.is_deleted = 0
       ORDER BY c.updated_at DESC LIMIT ${limit} OFFSET ${offset}`,
      [req.user.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /cases/my error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cases/unassigned
router.get('/cases/unassigned', authenticate, async (req, res) => {
  try {
    const limit  = parseInt(req.query.limit  || 50, 10);
    const offset = parseInt(req.query.offset || 0,  10);
    const [rows] = await pool.execute(
      `SELECT c.*, o.name AS org_name, s.name AS site_name, ws.name AS status_name
       FROM cases c
       LEFT JOIN organisations   o  ON c.org_id    = o.id
       LEFT JOIN sites           s  ON c.site_id   = s.id
       LEFT JOIN workflow_states ws ON c.status_id = ws.id
       WHERE c.case_owner_id IS NULL AND c.is_deleted = 0
       ORDER BY c.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      []
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /cases/unassigned error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cases/:id — single case detail
router.get('/cases/:id', authenticate, async (req, res) => {
  try {
    const [[c]] = await pool.execute(
      `SELECT c.*,
        o.name  AS org_name,
        s.name  AS site_name,
        ws.name AS status_name,
        u.name  AS owner_name
       FROM cases c
       LEFT JOIN organisations   o  ON c.org_id        = o.id
       LEFT JOIN sites           s  ON c.site_id        = s.id
       LEFT JOIN workflow_states ws ON c.status_id      = ws.id
       LEFT JOIN users           u  ON c.case_owner_id  = u.id
       WHERE c.id = ?`,
      [req.params.id]
    );
    if (!c) return res.status(404).json({ error: 'Case not found' });
    res.json(c);
  } catch (err) {
    console.error('GET /cases/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── CREATE CASE (F-13) ───────────────────────────────────────────────────────

// POST /api/cases — create new case (case_number is NULL until assign-number is called)
router.post('/cases', authenticate, requireOrg, async (req, res) => {
  try {
    const { site_id, case_type, intake_channel = 'manual', date_received } = req.body;
    // org_id is always sourced from JWT — clients cannot spoof a different org
    const org_id = req.user.orgId || req.body.org_id;
    if (!org_id || !site_id || !case_type) {
      return res.status(400).json({ error: 'org_id, site_id, case_type are required' });
    }
    if (!['MI', 'AE', 'PC'].includes(case_type)) {
      return res.status(400).json({ error: 'case_type must be MI, AE, or PC' });
    }
    const [result] = await pool.execute(
      `INSERT INTO cases (org_id, site_id, case_type, intake_channel, date_received, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [org_id, site_id, case_type, intake_channel, date_received || null, req.user.userId]
    );
    const [[newCase]] = await pool.execute(
      `SELECT c.*, o.name AS org_name, s.name AS site_name
       FROM cases c
       LEFT JOIN organisations o ON c.org_id  = o.id
       LEFT JOIN sites         s ON c.site_id = s.id
       WHERE c.id = ?`,
      [result.insertId]
    );
    res.status(201).json(newCase);
  } catch (err) {
    console.error('POST /cases error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cases/:id/assign-number — generate + lock case number on first Save
// RAJEEV REVIEW: FOR UPDATE row-lock guarantees no two concurrent saves get the same sequence
router.post('/cases/:id/assign-number', authenticate, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Get the case and lock the config row simultaneously
    const [[c]] = await conn.execute(
      'SELECT * FROM cases WHERE id = ? FOR UPDATE',
      [req.params.id]
    );
    if (!c) {
      await conn.rollback();
      return res.status(404).json({ error: 'Case not found' });
    }
    // Already numbered — return idempotently
    if (c.case_number) {
      await conn.rollback();
      return res.json({ case_number: c.case_number });
    }

    // Lock the number config row for this org + case_type (or ALL fallback)
    let [[cfg]] = await conn.execute(
      'SELECT * FROM case_number_config WHERE org_id = ? AND case_type = ? FOR UPDATE',
      [c.org_id, c.case_type]
    );
    if (!cfg) {
      [[cfg]] = await conn.execute(
        'SELECT * FROM case_number_config WHERE org_id = ? AND case_type = ? FOR UPDATE',
        [c.org_id, 'ALL']
      );
    }

    // Build number from config (or sensible default)
    const seq      = ((cfg ? cfg.current_seq : 0) || 0) + 1;
    const sepChar  = cfg ? cfg.separator      : '-';
    const seqLen   = cfg ? cfg.seq_length     : 5;
    const prefix   = cfg ? cfg.prefix         : c.case_type;
    const padded   = String(seq).padStart(seqLen, '0');
    const parts    = [prefix];
    if (cfg && cfg.include_year)  parts.push(new Date().getFullYear());
    if (cfg && cfg.include_month) parts.push(String(new Date().getMonth() + 1).padStart(2, '0'));
    parts.push(padded);
    const caseNumber = parts.join(sepChar);

    // Atomically update sequence counter + assign number
    if (cfg) {
      await conn.execute(
        'UPDATE case_number_config SET current_seq = ? WHERE id = ?',
        [seq, cfg.id]
      );
    }
    await conn.execute(
      'UPDATE cases SET case_number = ? WHERE id = ?',
      [caseNumber, req.params.id]
    );

    await conn.commit();
    res.json({ case_number: caseNumber });
  } catch (err) {
    await conn.rollback();
    console.error('assign-number error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ─── UPDATE CASE — F-15 Case Information Section ─────────────────────────────

// PUT /api/cases/:id — update case info fields (also handles auto-save)
router.put('/cases/:id', authenticate, async (req, res) => {
  try {
    const {
      status_id, case_owner_id, priority, date_received,
      description, internal_notes, intake_channel
    } = req.body;

    await pool.execute(
      `UPDATE cases SET
        status_id      = COALESCE(?, status_id),
        case_owner_id  = COALESCE(?, case_owner_id),
        priority       = COALESCE(?, priority),
        date_received  = COALESCE(?, date_received),
        description    = COALESCE(?, description),
        internal_notes = COALESCE(?, internal_notes),
        intake_channel = COALESCE(?, intake_channel)
       WHERE id = ?`,
      [
        status_id      ?? null,
        case_owner_id  ?? null,
        priority       ?? null,
        date_received  ?? null,
        description    ?? null,
        internal_notes ?? null,
        intake_channel ?? null,
        req.params.id
      ]
    );
    const [[updated]] = await pool.execute(
      `SELECT c.*, o.name AS org_name, s.name AS site_name,
        ws.name AS status_name, u.name AS owner_name
       FROM cases c
       LEFT JOIN organisations   o  ON c.org_id        = o.id
       LEFT JOIN sites           s  ON c.site_id        = s.id
       LEFT JOIN workflow_states ws ON c.status_id      = ws.id
       LEFT JOIN users           u  ON c.case_owner_id  = u.id
       WHERE c.id = ?`,
      [req.params.id]
    );
    res.json(updated);
  } catch (err) {
    console.error('PUT /cases/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── SOFT DELETE ──────────────────────────────────────────────────────────────

// DELETE /api/cases/:id — soft delete (admin/superadmin only)
router.delete('/cases/:id', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    await pool.execute('UPDATE cases SET is_deleted = 1 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /cases/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
