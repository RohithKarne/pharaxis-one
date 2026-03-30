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

const CASE_SORT_MAP = Object.freeze({
  created_at: 'c.created_at',
  updated_at: 'c.updated_at',
  case_number: 'c.case_number',
  date_received: 'c.date_received',
  communication_count: 'communication_count',
  last_comm_at: 'comm.last_comm_at',
});

function toDateOnlyOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  const year = dt.getUTCFullYear();
  const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isValidDateOnly(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseIntSafe(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// ─── ORG ISOLATION HELPER ────────────────────────────────────────────────────

// Verify a case belongs to the requesting user's org. Returns the case row or null.
async function verifyCaseOrg(caseId, req) {
  const [[c]] = await pool.execute('SELECT org_id FROM cases WHERE id = ?', [caseId]);
  if (!c) return null;
  if (req.user.role === 'superadmin') return c;
  if (Number(c.org_id) !== Number(req.user.orgId)) return null;
  return c;
}

// ─── LIST CASES ──────────────────────────────────────────────────────────────

// GET /api/cases — list cases with filters
router.get('/cases', authenticate, requireOrg, async (req, res) => {
  try {
    const {
      type, status_id, owner_id, deleted, search,
      has_correspondence, corr_from, corr_to, corr_box, corr_party,
      sort_by, sort_dir, include_meta,
    } = req.query;
    const limit  = clamp(parseIntSafe(req.query.limit, 50), 1, 500);
    const offset = Math.max(0, parseIntSafe(req.query.offset, 0));

    if (corr_from && !isValidDateOnly(corr_from)) {
      return res.status(400).json({ error: 'corr_from must be YYYY-MM-DD.' });
    }
    if (corr_to && !isValidDateOnly(corr_to)) {
      return res.status(400).json({ error: 'corr_to must be YYYY-MM-DD.' });
    }
    if (corr_box && !['inbox', 'sent'].includes(corr_box)) {
      return res.status(400).json({ error: "corr_box must be 'inbox' or 'sent'." });
    }
    if (has_correspondence && !['yes', 'no', 'true', 'false'].includes(String(has_correspondence))) {
      return res.status(400).json({ error: "has_correspondence must be one of: yes, no, true, false." });
    }
    const sortBy = CASE_SORT_MAP[sort_by] || CASE_SORT_MAP.created_at;
    const sortDir = String(sort_dir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    let query = `
      SELECT c.*,
        o.name  AS org_name,
        s.name  AS site_name,
        ws.name AS status_name,
        u.name  AS owner_name,
        COALESCE(comm.communication_count, 0) AS communication_count,
        comm.last_comm_at,
        CASE
          WHEN comm.last_comm_source IS NULL THEN NULL
          WHEN LOWER(comm.last_comm_source) LIKE '%reply%'
            OR LOWER(comm.last_comm_source) LIKE '%forward%'
            OR LOWER(comm.last_comm_source) LIKE '%sent%'
            OR LOWER(comm.last_comm_source) LIKE '%transmission%'
          THEN 'sent'
          ELSE 'inbox'
        END AS last_comm_box
      FROM cases c
      LEFT JOIN organisations  o  ON c.org_id        = o.id
      LEFT JOIN sites          s  ON c.site_id        = s.id
      LEFT JOIN workflow_states ws ON c.status_id     = ws.id
      LEFT JOIN users           u  ON c.case_owner_id = u.id
      LEFT JOIN (
        SELECT i.case_id,
          COUNT(*) AS communication_count,
          (
            SELECT i2.received_at
            FROM inquiries i2
            WHERE i2.case_id = i.case_id
            ORDER BY i2.received_at DESC, i2.id DESC
            LIMIT 1
          ) AS last_comm_at,
          (
            SELECT i2.source_tag
            FROM inquiries i2
            WHERE i2.case_id = i.case_id
            ORDER BY i2.received_at DESC, i2.id DESC
            LIMIT 1
          ) AS last_comm_source
        FROM inquiries i
        WHERE i.case_id IS NOT NULL
        GROUP BY i.case_id
      ) comm ON comm.case_id = c.id
      WHERE c.is_deleted = ${deleted === 'true' ? 1 : 0}
    `;
    let countQuery = `
      SELECT COUNT(*) AS total
      FROM cases c
      LEFT JOIN (
        SELECT i.case_id,
          COUNT(*) AS communication_count,
          (
            SELECT i2.received_at
            FROM inquiries i2
            WHERE i2.case_id = i.case_id
            ORDER BY i2.received_at DESC, i2.id DESC
            LIMIT 1
          ) AS last_comm_at,
          (
            SELECT i2.source_tag
            FROM inquiries i2
            WHERE i2.case_id = i.case_id
            ORDER BY i2.received_at DESC, i2.id DESC
            LIMIT 1
          ) AS last_comm_source
        FROM inquiries i
        WHERE i.case_id IS NOT NULL
        GROUP BY i.case_id
      ) comm ON comm.case_id = c.id
      WHERE c.is_deleted = ${deleted === 'true' ? 1 : 0}
    `;
    const params = [];
    const countParams = [];
    // Org isolation — always scope to req.user.orgId (superadmin has no orgId, sees all)
    if (req.user.orgId) {
      query += ' AND c.org_id = ?'; params.push(req.user.orgId);
      countQuery += ' AND c.org_id = ?'; countParams.push(req.user.orgId);
    }
    if (type)      {
      query += ' AND c.case_type = ?'; params.push(type);
      countQuery += ' AND c.case_type = ?'; countParams.push(type);
    }
    if (status_id) {
      query += ' AND c.status_id = ?'; params.push(status_id);
      countQuery += ' AND c.status_id = ?'; countParams.push(status_id);
    }
    if (owner_id)  {
      query += ' AND c.case_owner_id = ?'; params.push(owner_id);
      countQuery += ' AND c.case_owner_id = ?'; countParams.push(owner_id);
    }
    if (search)    {
      query += ' AND (c.case_number LIKE ? OR c.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
      countQuery += ' AND (c.case_number LIKE ? OR c.description LIKE ?)';
      countParams.push(`%${search}%`, `%${search}%`);
    }
    if (has_correspondence === 'yes' || has_correspondence === 'true') {
      query += ' AND COALESCE(comm.communication_count, 0) > 0';
      countQuery += ' AND COALESCE(comm.communication_count, 0) > 0';
    }
    if (has_correspondence === 'no' || has_correspondence === 'false') {
      query += ' AND COALESCE(comm.communication_count, 0) = 0';
      countQuery += ' AND COALESCE(comm.communication_count, 0) = 0';
    }
    if (corr_from) {
      query += ' AND DATE(comm.last_comm_at) >= ?';
      params.push(corr_from);
      countQuery += ' AND DATE(comm.last_comm_at) >= ?';
      countParams.push(corr_from);
    }
    if (corr_to) {
      query += ' AND DATE(comm.last_comm_at) <= ?';
      params.push(corr_to);
      countQuery += ' AND DATE(comm.last_comm_at) <= ?';
      countParams.push(corr_to);
    }
    if (corr_box === 'inbox' || corr_box === 'sent') {
      query += `
        AND (
          CASE
            WHEN comm.last_comm_source IS NULL THEN NULL
            WHEN LOWER(comm.last_comm_source) LIKE '%reply%'
              OR LOWER(comm.last_comm_source) LIKE '%forward%'
              OR LOWER(comm.last_comm_source) LIKE '%sent%'
              OR LOWER(comm.last_comm_source) LIKE '%transmission%'
            THEN 'sent'
            ELSE 'inbox'
          END
        ) = ?
      `;
      params.push(corr_box);
      countQuery += `
        AND (
          CASE
            WHEN comm.last_comm_source IS NULL THEN NULL
            WHEN LOWER(comm.last_comm_source) LIKE '%reply%'
              OR LOWER(comm.last_comm_source) LIKE '%forward%'
              OR LOWER(comm.last_comm_source) LIKE '%sent%'
              OR LOWER(comm.last_comm_source) LIKE '%transmission%'
            THEN 'sent'
            ELSE 'inbox'
          END
        ) = ?
      `;
      countParams.push(corr_box);
    }
    if (corr_party) {
      query += ' AND EXISTS (SELECT 1 FROM inquiries iq WHERE iq.case_id = c.id AND (iq.sender LIKE ? OR iq.recipient LIKE ?))';
      params.push(`%${corr_party}%`, `%${corr_party}%`);
      countQuery += ' AND EXISTS (SELECT 1 FROM inquiries iq WHERE iq.case_id = c.id AND (iq.sender LIKE ? OR iq.recipient LIKE ?))';
      countParams.push(`%${corr_party}%`, `%${corr_party}%`);
    }
    query += ` ORDER BY ${sortBy} ${sortDir}, c.id DESC LIMIT ${limit} OFFSET ${offset}`;

    const [rows] = await pool.execute(query, params);
    if (String(include_meta) === 'true') {
      const [[{ total }]] = await pool.execute(countQuery, countParams);
      return res.json({ rows, total, limit, offset });
    }
    return res.json(rows);
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
    const params = [req.user.userId];
    let orgClause = '';
    if (req.user.role !== 'superadmin') {
      orgClause = ' AND c.org_id = ?';
      params.push(req.user.orgId);
    }
    const [rows] = await pool.execute(
      `SELECT c.*, o.name AS org_name, s.name AS site_name, ws.name AS status_name
       FROM cases c
       LEFT JOIN organisations   o  ON c.org_id    = o.id
       LEFT JOIN sites           s  ON c.site_id   = s.id
       LEFT JOIN workflow_states ws ON c.status_id = ws.id
       WHERE c.case_owner_id = ? AND c.is_deleted = 0${orgClause}
       ORDER BY c.updated_at DESC LIMIT ${limit} OFFSET ${offset}`,
      params
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
    const params = [];
    let orgClause = '';
    if (req.user.role !== 'superadmin') {
      orgClause = ' AND c.org_id = ?';
      params.push(req.user.orgId);
    }
    const [rows] = await pool.execute(
      `SELECT c.*, o.name AS org_name, s.name AS site_name, ws.name AS status_name
       FROM cases c
       LEFT JOIN organisations   o  ON c.org_id    = o.id
       LEFT JOIN sites           s  ON c.site_id   = s.id
       LEFT JOIN workflow_states ws ON c.status_id = ws.id
       WHERE c.case_owner_id IS NULL AND c.is_deleted = 0${orgClause}
       ORDER BY c.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      params
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
    if (req.user.role !== 'superadmin' && Number(c.org_id) !== Number(req.user.orgId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
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
    // org_id is always sourced from JWT — never from request body
    const org_id = req.user.orgId;
    if (!org_id || !site_id || !case_type) {
      return res.status(400).json({ error: 'org_id, site_id, case_type are required' });
    }
    if (!['MI', 'AE', 'PC'].includes(case_type)) {
      return res.status(400).json({ error: 'case_type must be MI, AE, or PC' });
    }
    const dateReceived = toDateOnlyOrNull(date_received);
    if (date_received && !dateReceived) {
      return res.status(400).json({ error: 'date_received must be a valid date.' });
    }
    const [result] = await pool.execute(
      `INSERT INTO cases (org_id, site_id, case_type, intake_channel, date_received, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [org_id, site_id, case_type, intake_channel, dateReceived, req.user.userId]
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
    // Org isolation check
    if (req.user.role !== 'superadmin' && Number(c.org_id) !== Number(req.user.orgId)) {
      await conn.rollback();
      return res.status(403).json({ error: 'Access denied' });
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

    // If no config exists at all, create a default per-case-type config row.
    // This prevents repeated "MI-00001" when config is absent.
    if (!cfg) {
      await conn.execute(
        `INSERT INTO case_number_config (org_id, case_type, prefix, \`separator\`, include_year, include_month, seq_length, current_seq)
         VALUES (?, ?, ?, '-', 0, 0, 5, 0)
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
        [c.org_id, c.case_type, c.case_type]
      );
      [[cfg]] = await conn.execute(
        'SELECT * FROM case_number_config WHERE org_id = ? AND case_type = ? FOR UPDATE',
        [c.org_id, c.case_type]
      );
    }

    // Generate next unique number for this org (guards against manual counter resets).
    let seq      = (cfg.current_seq || 0) + 1;
    const sepChar  = cfg.separator || '-';
    const seqLen   = cfg.seq_length || 5;
    const prefix   = cfg.prefix || c.case_type;
    let caseNumber = null;
    for (let attempts = 0; attempts < 10000; attempts += 1) {
      const padded = String(seq).padStart(seqLen, '0');
      const parts = [prefix];
      if (cfg.include_year)  parts.push(new Date().getFullYear());
      if (cfg.include_month) parts.push(String(new Date().getMonth() + 1).padStart(2, '0'));
      parts.push(padded);
      const candidate = parts.join(sepChar);

      const [[dup]] = await conn.execute(
        'SELECT id FROM cases WHERE org_id = ? AND case_number = ? LIMIT 1 FOR UPDATE',
        [c.org_id, candidate]
      );
      if (!dup) {
        caseNumber = candidate;
        break;
      }
      seq += 1;
    }
    if (!caseNumber) {
      throw new Error('Unable to generate unique case number.');
    }

    // Atomically update sequence counter + assign number
    await conn.execute(
      'UPDATE case_number_config SET current_seq = ? WHERE id = ?',
      [seq, cfg.id]
    );
    await conn.execute(
      'UPDATE cases SET case_number = ? WHERE id = ?',
      [caseNumber, req.params.id]
    );

    await conn.commit();
    res.json({ case_number: caseNumber });
  } catch (err) {
    await conn.rollback();
    console.error('assign-number error:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Case number conflict detected. Please retry assign number.' });
    }
    return res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ─── UPDATE CASE — F-15 Case Information Section ─────────────────────────────

// PUT /api/cases/:id — update case info fields (also handles auto-save)
router.put('/cases/:id', authenticate, async (req, res) => {
  try {
    const owned = await verifyCaseOrg(req.params.id, req);
    if (!owned) return res.status(403).json({ error: 'Access denied' });

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
    const owned = await verifyCaseOrg(req.params.id, req);
    if (!owned) return res.status(403).json({ error: 'Access denied' });

    await pool.execute('UPDATE cases SET is_deleted = 1 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /cases/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
