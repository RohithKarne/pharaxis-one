'use strict';

/**
 * casePC.js — Product Complaint Component API (Version Controlled)
 * F-18: PC component with 6 tabs per version (Vivek)
 *
 * Reuses the same version-locking pattern established in caseAE.js (Bhavya).
 * "Copy from PC" on new version: copies complaint_description field from V(n) to V(n+1) only.
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../database/db');
const { authenticate } = require('../middleware/auth');

// ─── ORG ISOLATION HELPERS ───────────────────────────────────────────────────

async function verifyCaseOrg(caseId, req) {
  const [[c]] = await pool.execute('SELECT org_id FROM cases WHERE id = ?', [caseId]);
  if (!c) return false;
  if (req.user.role === 'superadmin') return true;
  return Number(c.org_id) === Number(req.user.orgId);
}

async function verifyVersionOrg(versionId, req) {
  const [[row]] = await pool.execute(
    `SELECT c.org_id FROM case_pc_versions v JOIN cases c ON v.case_id = c.id WHERE v.id = ?`,
    [versionId]
  );
  if (!row) return false;
  if (req.user.role === 'superadmin') return true;
  return Number(row.org_id) === Number(req.user.orgId);
}

// ─── VERSION MANAGEMENT ───────────────────────────────────────────────────────

// GET /api/cases/:id/pc/versions
router.get('/cases/:id/pc/versions', authenticate, async (req, res) => {
  try {
    if (!await verifyCaseOrg(req.params.id, req)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const [rows] = await pool.execute(
      `SELECT v.*, u.name AS created_by_name
       FROM case_pc_versions v
       LEFT JOIN users u ON v.created_by = u.id
       WHERE v.case_id = ?
       ORDER BY v.version_number ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET PC versions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cases/:id/pc/versions — create new version, lock previous, copy description
router.post('/cases/:id/pc/versions', authenticate, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    if (!await verifyCaseOrg(req.params.id, req)) {
      conn.release();
      return res.status(403).json({ error: 'Access denied' });
    }
    await conn.beginTransaction();

    const [existing] = await conn.execute(
      'SELECT * FROM case_pc_versions WHERE case_id = ? ORDER BY version_number DESC LIMIT 1 FOR UPDATE',
      [req.params.id]
    );
    const latest = existing[0] || null;
    const latestStatus = String(latest?.status || '').trim().toLowerCase();
    if (latest && latestStatus !== 'closed') {
      await conn.rollback();
      return res.status(409).json({ error: 'Close the current PC version before creating a new version.' });
    }
    const nextNum = latest ? latest.version_number + 1 : 1;

    // Lock previous version
    if (latest && !latest.is_locked) {
      await conn.execute(
        'UPDATE case_pc_versions SET is_locked = 1, locked_at = NOW() WHERE id = ?',
        [latest.id]
      );
    }

    // Create new version
    const [result] = await conn.execute(
      'INSERT INTO case_pc_versions (case_id, version_number, created_by) VALUES (?, ?, ?)',
      [req.params.id, nextNum, req.user.userId]
    );

    // "Copy from PC" — copy complaint_description from previous version's general tab only
    if (latest) {
      const [[prevGeneral]] = await conn.execute(
        'SELECT complaint_description FROM case_pc_general WHERE version_id = ?',
        [latest.id]
      );
      if (prevGeneral && prevGeneral.complaint_description) {
        await conn.execute(
          'INSERT INTO case_pc_general (version_id, complaint_description) VALUES (?, ?)',
          [result.insertId, prevGeneral.complaint_description]
        );
      }
    }

    await conn.commit();

    const [[newVersion]] = await pool.execute(
      'SELECT * FROM case_pc_versions WHERE id = ?', [result.insertId]
    );
    res.status(201).json(newVersion);
  } catch (err) {
    await conn.rollback();
    console.error('POST PC version error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// PUT /api/cases/pc/versions/:versionId/status
router.put('/cases/pc/versions/:versionId/status', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'status required' });
    await pool.execute(
      'UPDATE case_pc_versions SET status = ? WHERE id = ? AND is_locked = 0',
      [status, req.params.versionId]
    );
    const [[v]] = await pool.execute(
      'SELECT * FROM case_pc_versions WHERE id = ?', [req.params.versionId]
    );
    res.json(v);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── TAB: GENERAL ─────────────────────────────────────────────────────────────

router.get('/cases/pc/versions/:versionId/general', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) return res.status(403).json({ error: 'Access denied' });
    const [[row]] = await pool.execute(
      'SELECT * FROM case_pc_general WHERE version_id = ?', [req.params.versionId]
    );
    res.json(row || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/cases/pc/versions/:versionId/general', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) return res.status(403).json({ error: 'Access denied' });
    await guardLocked(req.params.versionId);
    const { complaint_description, pc_status, pc_category, pc_classification, date_of_complaint, date_received, severity, additional_info } = req.body;
    await pool.execute(
      `INSERT INTO case_pc_general
        (version_id, complaint_description, pc_status, pc_category, pc_classification, date_of_complaint, date_received, severity, additional_info)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        complaint_description = VALUES(complaint_description),
        pc_status = VALUES(pc_status),
        pc_category = VALUES(pc_category),
        pc_classification = VALUES(pc_classification),
        date_of_complaint = VALUES(date_of_complaint),
        date_received = VALUES(date_received),
        severity = VALUES(severity),
        additional_info = VALUES(additional_info)`,
      [req.params.versionId, complaint_description || null, pc_status || null,
       pc_category || null, pc_classification || null,
       date_of_complaint || null, date_received || null, severity || null, additional_info || null]
    );
    const [[row]] = await pool.execute(
      'SELECT * FROM case_pc_general WHERE version_id = ?', [req.params.versionId]
    );
    res.json(row);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// ─── TAB: PATIENT INFO ────────────────────────────────────────────────────────

router.get('/cases/pc/versions/:versionId/patient-info', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) return res.status(403).json({ error: 'Access denied' });
    const [[row]] = await pool.execute(
      'SELECT * FROM case_pc_patient_info WHERE version_id = ?', [req.params.versionId]
    );
    res.json(row || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/cases/pc/versions/:versionId/patient-info', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) return res.status(403).json({ error: 'Access denied' });
    await guardLocked(req.params.versionId);
    const { age, age_unit, sex, weight_kg, therapy_start_date, therapy_end_date, indication, injury_experienced, additional_info } = req.body;
    await pool.execute(
      `INSERT INTO case_pc_patient_info
        (version_id, age, age_unit, sex, weight_kg, therapy_start_date, therapy_end_date, indication, injury_experienced, additional_info)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        age = VALUES(age), age_unit = VALUES(age_unit), sex = VALUES(sex),
        weight_kg = VALUES(weight_kg), therapy_start_date = VALUES(therapy_start_date),
        therapy_end_date = VALUES(therapy_end_date), indication = VALUES(indication),
        injury_experienced = VALUES(injury_experienced),
        additional_info = VALUES(additional_info)`,
      [req.params.versionId, age || null, age_unit || null, sex || null,
       weight_kg || null, therapy_start_date || null, therapy_end_date || null,
       indication || null, injury_experienced || null, additional_info || null]
    );
    const [[row]] = await pool.execute(
      'SELECT * FROM case_pc_patient_info WHERE version_id = ?', [req.params.versionId]
    );
    res.json(row);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// ─── TAB: PRODUCT INFO ────────────────────────────────────────────────────────

router.get('/cases/pc/versions/:versionId/product-info', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) return res.status(403).json({ error: 'Access denied' });
    const [[row]] = await pool.execute(
      `SELECT pi.*, p.trade_name AS product_trade_name
       FROM case_pc_product_info pi
       LEFT JOIN products p ON pi.product_id = p.id
       WHERE pi.version_id = ?`,
      [req.params.versionId]
    );
    res.json(row || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/cases/pc/versions/:versionId/product-info', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) return res.status(403).json({ error: 'Access denied' });
    await guardLocked(req.params.versionId);
    const { product_id, product_name, lot_number, expiry_date, quantity_available, storage_conditions, additional_info } = req.body;
    await pool.execute(
      `INSERT INTO case_pc_product_info
        (version_id, product_id, product_name, lot_number, expiry_date, quantity_available, storage_conditions, additional_info)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        product_id = VALUES(product_id), product_name = VALUES(product_name),
        lot_number = VALUES(lot_number), expiry_date = VALUES(expiry_date),
        quantity_available = VALUES(quantity_available),
        storage_conditions = VALUES(storage_conditions), additional_info = VALUES(additional_info)`,
      [req.params.versionId, product_id || null, product_name || null,
       lot_number || null, expiry_date || null,
       quantity_available ? 1 : 0, storage_conditions || null, additional_info || null]
    );
    const [[row]] = await pool.execute(
      'SELECT * FROM case_pc_product_info WHERE version_id = ?', [req.params.versionId]
    );
    res.json(row);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// ─── TAB: RETURN / RETRIEVAL ──────────────────────────────────────────────────

router.get('/cases/pc/versions/:versionId/return-retrieval', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) return res.status(403).json({ error: 'Access denied' });
    const [[row]] = await pool.execute(
      'SELECT * FROM case_pc_return_retrieval WHERE version_id = ?', [req.params.versionId]
    );
    res.json(row || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/cases/pc/versions/:versionId/return-retrieval', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) return res.status(403).json({ error: 'Access denied' });
    await guardLocked(req.params.versionId);
    const { return_requested, return_date, return_method, retrieval_requested, retrieval_date, retrieval_method, tracking_number, notes } = req.body;
    await pool.execute(
      `INSERT INTO case_pc_return_retrieval
        (version_id, return_requested, return_date, return_method, retrieval_requested, retrieval_date, retrieval_method, tracking_number, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        return_requested = VALUES(return_requested), return_date = VALUES(return_date),
        return_method = VALUES(return_method), retrieval_requested = VALUES(retrieval_requested),
        retrieval_date = VALUES(retrieval_date), retrieval_method = VALUES(retrieval_method),
        tracking_number = VALUES(tracking_number), notes = VALUES(notes)`,
      [req.params.versionId,
       return_requested ? 1 : 0, return_date || null, return_method || null,
       retrieval_requested ? 1 : 0, retrieval_date || null, retrieval_method || null,
       tracking_number || null, notes || null]
    );
    const [[row]] = await pool.execute(
      'SELECT * FROM case_pc_return_retrieval WHERE version_id = ?', [req.params.versionId]
    );
    res.json(row);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// ─── TAB: REPLACEMENT ─────────────────────────────────────────────────────────

router.get('/cases/pc/versions/:versionId/replacement', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) return res.status(403).json({ error: 'Access denied' });
    const [[row]] = await pool.execute(
      'SELECT * FROM case_pc_replacement WHERE version_id = ?', [req.params.versionId]
    );
    res.json(row || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/cases/pc/versions/:versionId/replacement', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) return res.status(403).json({ error: 'Access denied' });
    await guardLocked(req.params.versionId);
    const { replacement_requested, replacement_approved, replacement_date, replacement_product, quantity, notes } = req.body;
    await pool.execute(
      `INSERT INTO case_pc_replacement
        (version_id, replacement_requested, replacement_approved, replacement_date, replacement_product, quantity, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        replacement_requested = VALUES(replacement_requested),
        replacement_approved = VALUES(replacement_approved),
        replacement_date = VALUES(replacement_date),
        replacement_product = VALUES(replacement_product),
        quantity = VALUES(quantity), notes = VALUES(notes)`,
      [req.params.versionId,
       replacement_requested ? 1 : 0, replacement_approved ? 1 : 0,
       replacement_date || null, replacement_product || null,
       quantity || null, notes || null]
    );
    const [[row]] = await pool.execute(
      'SELECT * FROM case_pc_replacement WHERE version_id = ?', [req.params.versionId]
    );
    res.json(row);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// ─── TAB: REFUND / CREDIT ─────────────────────────────────────────────────────

router.get('/cases/pc/versions/:versionId/refund-credit', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) return res.status(403).json({ error: 'Access denied' });
    const [[row]] = await pool.execute(
      'SELECT * FROM case_pc_refund_credit WHERE version_id = ?', [req.params.versionId]
    );
    res.json(row || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/cases/pc/versions/:versionId/refund-credit', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) return res.status(403).json({ error: 'Access denied' });
    await guardLocked(req.params.versionId);
    const { refund_requested, refund_approved, refund_amount, credit_requested, credit_approved, credit_amount, notes } = req.body;
    await pool.execute(
      `INSERT INTO case_pc_refund_credit
        (version_id, refund_requested, refund_approved, refund_amount, credit_requested, credit_approved, credit_amount, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        refund_requested = VALUES(refund_requested), refund_approved = VALUES(refund_approved),
        refund_amount = VALUES(refund_amount), credit_requested = VALUES(credit_requested),
        credit_approved = VALUES(credit_approved), credit_amount = VALUES(credit_amount),
        notes = VALUES(notes)`,
      [req.params.versionId,
       refund_requested ? 1 : 0, refund_approved ? 1 : 0, refund_amount || null,
       credit_requested ? 1 : 0, credit_approved ? 1 : 0, credit_amount || null,
       notes || null]
    );
    const [[row]] = await pool.execute(
      'SELECT * FROM case_pc_refund_credit WHERE version_id = ?', [req.params.versionId]
    );
    res.json(row);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// ─── TAB: PC FLEX FIELDS ──────────────────────────────────────────────────────

router.get('/cases/pc/versions/:versionId/pc-flex-fields', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) return res.status(403).json({ error: 'Access denied' });
    const [[row]] = await pool.execute(
      'SELECT * FROM case_pc_flex_fields WHERE version_id = ?', [req.params.versionId]
    );
    res.json(row || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/cases/pc/versions/:versionId/pc-flex-fields', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) return res.status(403).json({ error: 'Access denied' });
    await guardLocked(req.params.versionId);
    const { pc_flex_1, pc_flex_2, pc_flex_3 } = req.body;
    await pool.execute(
      `INSERT INTO case_pc_flex_fields (version_id, pc_flex_1, pc_flex_2, pc_flex_3)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        pc_flex_1 = VALUES(pc_flex_1),
        pc_flex_2 = VALUES(pc_flex_2),
        pc_flex_3 = VALUES(pc_flex_3)`,
      [req.params.versionId, pc_flex_1 || null, pc_flex_2 || null, pc_flex_3 || null]
    );
    const [[row]] = await pool.execute(
      'SELECT * FROM case_pc_flex_fields WHERE version_id = ?', [req.params.versionId]
    );
    res.json(row);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// ─── GUARD HELPER ─────────────────────────────────────────────────────────────

async function guardLocked(versionId) {
  const [[v]] = await pool.execute(
    'SELECT is_locked FROM case_pc_versions WHERE id = ?', [versionId]
  );
  if (!v) {
    const err = new Error('PC version not found'); err.status = 404; throw err;
  }
  if (v.is_locked) {
    const err = new Error('This PC version is locked and cannot be edited');
    err.status = 403; throw err;
  }
}

module.exports = router;
