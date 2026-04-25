'use strict';

/**
 * caseAE.js — Adverse Event Component API (Version Controlled)
 * F-17: AE component with 8 tabs per version (Bhavya)
 *
 * VERSION LOCKING PATTERN (Rajeev review):
 *   POST /cases/:id/ae/versions → locks the current latest version, creates next version.
 *   All 8 tab tables reference version_id. Previous versions are read-only (is_locked = 1).
 *
 * ICH E2B R3 COMPLIANCE (Rajeev review):
 *   Seriousness criteria stored as 7 separate TINYINT columns in case_ae_events,
 *   NOT as JSON — required for structured E2B R3 export in Phase 3 integration.
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
    `SELECT c.org_id FROM case_ae_versions v JOIN cases c ON v.case_id = c.id WHERE v.id = ?`,
    [versionId]
  );
  if (!row) return false;
  if (req.user.role === 'superadmin') return true;
  return Number(row.org_id) === Number(req.user.orgId);
}

async function getAeChildOwnership(tableName, childId) {
  const [[row]] = await pool.execute(
    `SELECT child.id, child.version_id, c.org_id
     FROM ${tableName} child
     JOIN case_ae_versions v ON v.id = child.version_id
     JOIN cases c ON c.id = v.case_id
     WHERE child.id = ?`,
    [childId]
  );
  return row || null;
}

async function ensureAeChildAccess(tableName, childId, req, { requireUnlocked = false } = {}) {
  const row = await getAeChildOwnership(tableName, childId);
  if (!row) {
    const err = new Error('Record not found');
    err.status = 404;
    throw err;
  }
  if (req.user.role !== 'superadmin' && Number(row.org_id) !== Number(req.user.orgId)) {
    const err = new Error('Access denied');
    err.status = 403;
    throw err;
  }
  if (requireUnlocked) {
    await guardLocked(row.version_id);
  }
  return row;
}

// ─── VERSION MANAGEMENT ───────────────────────────────────────────────────────

// GET /api/cases/:id/ae/versions — list all versions for a case
router.get('/cases/:id/ae/versions', authenticate, async (req, res) => {
  try {
    if (!await verifyCaseOrg(req.params.id, req)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const [rows] = await pool.execute(
      `SELECT v.*, u.name AS created_by_name
       FROM case_ae_versions v
       LEFT JOIN users u ON v.created_by = u.id
       WHERE v.case_id = ?
       ORDER BY v.version_number ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET AE versions error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cases/:id/ae/versions — create new version (locks current latest)
router.post('/cases/:id/ae/versions', authenticate, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    if (!await verifyCaseOrg(req.params.id, req)) {
      conn.release();
      return res.status(403).json({ error: 'Access denied' });
    }
    await conn.beginTransaction();

    // Lock + get the current latest version
    const [existing] = await conn.execute(
      'SELECT * FROM case_ae_versions WHERE case_id = ? ORDER BY version_number DESC LIMIT 1 FOR UPDATE',
      [req.params.id]
    );
    const nextNum = existing.length > 0 ? existing[0].version_number + 1 : 1;

    // Lock the previous version if it exists and isn't already locked
    if (existing.length > 0 && !existing[0].is_locked) {
      await conn.execute(
        'UPDATE case_ae_versions SET is_locked = 1, locked_at = NOW() WHERE id = ?',
        [existing[0].id]
      );
    }

    // Create the new version
    const [result] = await conn.execute(
      'INSERT INTO case_ae_versions (case_id, version_number, created_by) VALUES (?, ?, ?)',
      [req.params.id, nextNum, req.user.userId]
    );

    await conn.commit();

    const [[newVersion]] = await pool.execute(
      'SELECT * FROM case_ae_versions WHERE id = ?', [result.insertId]
    );
    res.status(201).json(newVersion);
  } catch (err) {
    await conn.rollback();
    console.error('POST AE version error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// PUT /api/cases/ae/versions/:versionId/status — update version status
router.put('/cases/ae/versions/:versionId/status', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'status required' });
    await pool.execute(
      'UPDATE case_ae_versions SET status = ? WHERE id = ? AND is_locked = 0',
      [status, req.params.versionId]
    );
    const [[v]] = await pool.execute(
      'SELECT * FROM case_ae_versions WHERE id = ?', [req.params.versionId]
    );
    res.json(v);
  } catch (err) {
    console.error('PUT AE version status error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── TAB: GENERAL ─────────────────────────────────────────────────────────────

router.get('/cases/ae/versions/:versionId/general', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) return res.status(403).json({ error: 'Access denied' });
    const [[row]] = await pool.execute(
      'SELECT * FROM case_ae_general WHERE version_id = ?', [req.params.versionId]
    );
    res.json(row || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/cases/ae/versions/:versionId/general', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) return res.status(403).json({ error: 'Access denied' });
    await guardLocked(req.params.versionId);
    const { report_type, date_of_onset, date_of_report, reporter_awareness_date, additional_info } = req.body;
    await pool.execute(
      `INSERT INTO case_ae_general (version_id, report_type, date_of_onset, date_of_report, reporter_awareness_date, additional_info)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        report_type = VALUES(report_type), date_of_onset = VALUES(date_of_onset),
        date_of_report = VALUES(date_of_report), reporter_awareness_date = VALUES(reporter_awareness_date),
        additional_info = VALUES(additional_info)`,
      [req.params.versionId, report_type || null, date_of_onset || null,
       date_of_report || null, reporter_awareness_date || null, additional_info || null]
    );
    const [[row]] = await pool.execute(
      'SELECT * FROM case_ae_general WHERE version_id = ?', [req.params.versionId]
    );
    res.json(row);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// ─── TAB: EVENTS (ICH E2B R3 seriousness as boolean columns) ─────────────────

router.get('/cases/ae/versions/:versionId/events', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) return res.status(403).json({ error: 'Access denied' });
    const [rows] = await pool.execute(
      'SELECT * FROM case_ae_events WHERE version_id = ? ORDER BY id ASC',
      [req.params.versionId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cases/ae/versions/:versionId/events', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) return res.status(403).json({ error: 'Access denied' });
    await guardLocked(req.params.versionId);
    const {
      event_description, outcome, start_date, end_date,
      is_serious = 0, is_death = 0, is_life_threatening = 0,
      is_hospitalization = 0, is_disability = 0,
      is_congenital_anomaly = 0, is_other_medically_important = 0
    } = req.body;
    const [result] = await pool.execute(
      `INSERT INTO case_ae_events
        (version_id, event_description, outcome, start_date, end_date,
         is_serious, is_death, is_life_threatening, is_hospitalization,
         is_disability, is_congenital_anomaly, is_other_medically_important)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.versionId, event_description || null, outcome || null,
       start_date || null, end_date || null,
       is_serious ? 1 : 0, is_death ? 1 : 0, is_life_threatening ? 1 : 0,
       is_hospitalization ? 1 : 0, is_disability ? 1 : 0,
       is_congenital_anomaly ? 1 : 0, is_other_medically_important ? 1 : 0]
    );
    const [[row]] = await pool.execute(
      'SELECT * FROM case_ae_events WHERE id = ?', [result.insertId]
    );
    res.status(201).json(row);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

router.put('/cases/ae/events/:eventId', authenticate, async (req, res) => {
  try {
    await ensureAeChildAccess('case_ae_events', req.params.eventId, req, { requireUnlocked: true });
    const {
      event_description, outcome, start_date, end_date,
      is_serious, is_death, is_life_threatening, is_hospitalization,
      is_disability, is_congenital_anomaly, is_other_medically_important
    } = req.body;
    await pool.execute(
      `UPDATE case_ae_events SET
        event_description          = COALESCE(?, event_description),
        outcome                    = COALESCE(?, outcome),
        start_date                 = COALESCE(?, start_date),
        end_date                   = COALESCE(?, end_date),
        is_serious                 = COALESCE(?, is_serious),
        is_death                   = COALESCE(?, is_death),
        is_life_threatening        = COALESCE(?, is_life_threatening),
        is_hospitalization         = COALESCE(?, is_hospitalization),
        is_disability              = COALESCE(?, is_disability),
        is_congenital_anomaly      = COALESCE(?, is_congenital_anomaly),
        is_other_medically_important = COALESCE(?, is_other_medically_important)
       WHERE id = ?`,
      [
        event_description ?? null, outcome ?? null,
        start_date ?? null, end_date ?? null,
        is_serious ?? null, is_death ?? null, is_life_threatening ?? null,
        is_hospitalization ?? null, is_disability ?? null,
        is_congenital_anomaly ?? null, is_other_medically_important ?? null,
        req.params.eventId
      ]
    );
    const [[updated]] = await pool.execute('SELECT * FROM case_ae_events WHERE id = ?', [req.params.eventId]);
    res.json(updated);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

router.delete('/cases/ae/events/:eventId', authenticate, async (req, res) => {
  try {
    await ensureAeChildAccess('case_ae_events', req.params.eventId, req, { requireUnlocked: true });
    await pool.execute('DELETE FROM case_ae_events WHERE id = ?', [req.params.eventId]);
    res.json({ success: true });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// ─── TAB: PATIENT INFO ────────────────────────────────────────────────────────

router.get('/cases/ae/versions/:versionId/patient-info', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) return res.status(403).json({ error: 'Access denied' });
    const [[row]] = await pool.execute(
      'SELECT * FROM case_ae_patient_info WHERE version_id = ?', [req.params.versionId]
    );
    res.json(row || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/cases/ae/versions/:versionId/patient-info', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) return res.status(403).json({ error: 'Access denied' });
    await guardLocked(req.params.versionId);
    const { age, age_unit, sex, weight_kg, height_cm, ethnicity, pregnant, last_menstrual_date, additional_info } = req.body;
    await pool.execute(
      `INSERT INTO case_ae_patient_info
        (version_id, age, age_unit, sex, weight_kg, height_cm, ethnicity, pregnant, last_menstrual_date, additional_info)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        age = VALUES(age), age_unit = VALUES(age_unit), sex = VALUES(sex),
        weight_kg = VALUES(weight_kg), height_cm = VALUES(height_cm),
        ethnicity = VALUES(ethnicity), pregnant = VALUES(pregnant),
        last_menstrual_date = VALUES(last_menstrual_date), additional_info = VALUES(additional_info)`,
      [req.params.versionId, age || null, age_unit || null, sex || null,
       weight_kg || null, height_cm || null, ethnicity || null,
       pregnant ?? null, last_menstrual_date || null, additional_info || null]
    );
    const [[row]] = await pool.execute(
      'SELECT * FROM case_ae_patient_info WHERE version_id = ?', [req.params.versionId]
    );
    res.json(row);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// ─── TAB: LAB RESULTS ─────────────────────────────────────────────────────────

router.get('/cases/ae/versions/:versionId/lab-results', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) return res.status(403).json({ error: 'Access denied' });
    const [rows] = await pool.execute(
      'SELECT * FROM case_ae_lab_results WHERE version_id = ? ORDER BY id ASC',
      [req.params.versionId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cases/ae/versions/:versionId/lab-results', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) return res.status(403).json({ error: 'Access denied' });
    await guardLocked(req.params.versionId);
    const { test_name, result, unit, normal_range, test_date } = req.body;
    const [ins] = await pool.execute(
      'INSERT INTO case_ae_lab_results (version_id, test_name, result, unit, normal_range, test_date) VALUES (?, ?, ?, ?, ?, ?)',
      [req.params.versionId, test_name || null, result || null, unit || null, normal_range || null, test_date || null]
    );
    const [[row]] = await pool.execute('SELECT * FROM case_ae_lab_results WHERE id = ?', [ins.insertId]);
    res.status(201).json(row);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

router.delete('/cases/ae/lab-results/:labId', authenticate, async (req, res) => {
  try {
    await ensureAeChildAccess('case_ae_lab_results', req.params.labId, req, { requireUnlocked: true });
    await pool.execute('DELETE FROM case_ae_lab_results WHERE id = ?', [req.params.labId]);
    res.json({ success: true });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// ─── TAB: LAB NOTES ───────────────────────────────────────────────────────────

router.get('/cases/ae/versions/:versionId/lab-notes', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) return res.status(403).json({ error: 'Access denied' });
    const [[row]] = await pool.execute(
      'SELECT * FROM case_ae_lab_notes WHERE version_id = ?', [req.params.versionId]
    );
    res.json(row || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/cases/ae/versions/:versionId/lab-notes', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) return res.status(403).json({ error: 'Access denied' });
    await guardLocked(req.params.versionId);
    const { notes } = req.body;
    await pool.execute(
      `INSERT INTO case_ae_lab_notes (version_id, notes) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE notes = VALUES(notes)`,
      [req.params.versionId, notes || null]
    );
    const [[row]] = await pool.execute(
      'SELECT * FROM case_ae_lab_notes WHERE version_id = ?', [req.params.versionId]
    );
    res.json(row);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// ─── TAB: MEDICAL HISTORY ─────────────────────────────────────────────────────

router.get('/cases/ae/versions/:versionId/medical-history', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) return res.status(403).json({ error: 'Access denied' });
    const [rows] = await pool.execute(
      'SELECT * FROM case_ae_medical_history WHERE version_id = ? ORDER BY id ASC',
      [req.params.versionId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cases/ae/versions/:versionId/medical-history', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) return res.status(403).json({ error: 'Access denied' });
    await guardLocked(req.params.versionId);
    const { condition_name, start_date, end_date, is_ongoing = 0, notes } = req.body;
    const [ins] = await pool.execute(
      'INSERT INTO case_ae_medical_history (version_id, condition_name, start_date, end_date, is_ongoing, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [req.params.versionId, condition_name || null, start_date || null, end_date || null, is_ongoing ? 1 : 0, notes || null]
    );
    const [[row]] = await pool.execute('SELECT * FROM case_ae_medical_history WHERE id = ?', [ins.insertId]);
    res.status(201).json(row);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

router.delete('/cases/ae/medical-history/:mhId', authenticate, async (req, res) => {
  try {
    await ensureAeChildAccess('case_ae_medical_history', req.params.mhId, req, { requireUnlocked: true });
    await pool.execute('DELETE FROM case_ae_medical_history WHERE id = ?', [req.params.mhId]);
    res.json({ success: true });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// ─── TAB: MEDICAL NOTES ───────────────────────────────────────────────────────

router.get('/cases/ae/versions/:versionId/medical-notes', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) return res.status(403).json({ error: 'Access denied' });
    const [[row]] = await pool.execute(
      'SELECT * FROM case_ae_medical_notes WHERE version_id = ?', [req.params.versionId]
    );
    res.json(row || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/cases/ae/versions/:versionId/medical-notes', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) return res.status(403).json({ error: 'Access denied' });
    await guardLocked(req.params.versionId);
    const { notes } = req.body;
    await pool.execute(
      `INSERT INTO case_ae_medical_notes (version_id, notes) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE notes = VALUES(notes)`,
      [req.params.versionId, notes || null]
    );
    const [[row]] = await pool.execute(
      'SELECT * FROM case_ae_medical_notes WHERE version_id = ?', [req.params.versionId]
    );
    res.json(row);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// ─── TAB: PRODUCT INFO + CONCOMITANT MEDS ────────────────────────────────────

router.get('/cases/ae/versions/:versionId/product-info', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) return res.status(403).json({ error: 'Access denied' });
    const [rows] = await pool.execute(
      `SELECT pi.*, p.trade_name AS product_trade_name
       FROM case_ae_product_info pi
       LEFT JOIN products p ON pi.product_id = p.id
       WHERE pi.version_id = ?
       ORDER BY pi.is_suspect DESC, pi.id ASC`,
      [req.params.versionId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cases/ae/versions/:versionId/product-info', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) return res.status(403).json({ error: 'Access denied' });
    await guardLocked(req.params.versionId);
    const {
      product_id, product_name, dose, dose_unit, route_of_admin,
      frequency, start_date, end_date, indication,
      is_suspect = 1, is_concomitant = 0
    } = req.body;
    const [ins] = await pool.execute(
      `INSERT INTO case_ae_product_info
        (version_id, product_id, product_name, dose, dose_unit, route_of_admin,
         frequency, start_date, end_date, indication, is_suspect, is_concomitant)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.versionId, product_id || null, product_name || null,
       dose || null, dose_unit || null, route_of_admin || null,
       frequency || null, start_date || null, end_date || null, indication || null,
       is_suspect ? 1 : 0, is_concomitant ? 1 : 0]
    );
    const [[row]] = await pool.execute(
      'SELECT * FROM case_ae_product_info WHERE id = ?', [ins.insertId]
    );
    res.status(201).json(row);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

router.delete('/cases/ae/product-info/:piId', authenticate, async (req, res) => {
  try {
    await ensureAeChildAccess('case_ae_product_info', req.params.piId, req, { requireUnlocked: true });
    await pool.execute('DELETE FROM case_ae_product_info WHERE id = ?', [req.params.piId]);
    res.json({ success: true });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// ─── AE FLEX FIELDS ──────────────────────────────────────────────────────────

router.get('/cases/ae/versions/:versionId/ae-flex-fields', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) return res.status(403).json({ error: 'Access denied' });
    const [[row]] = await pool.execute(
      'SELECT * FROM case_ae_flex_fields WHERE version_id = ?',
      [req.params.versionId]
    );
    res.json(row || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/cases/ae/versions/:versionId/ae-flex-fields', authenticate, async (req, res) => {
  try {
    if (!await verifyVersionOrg(req.params.versionId, req)) return res.status(403).json({ error: 'Access denied' });
    await guardLocked(req.params.versionId);
    const { ae_flex_1, ae_flex_2, ae_flex_3 } = req.body;
    await pool.execute(
      `INSERT INTO case_ae_flex_fields (version_id, ae_flex_1, ae_flex_2, ae_flex_3)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE ae_flex_1 = VALUES(ae_flex_1), ae_flex_2 = VALUES(ae_flex_2), ae_flex_3 = VALUES(ae_flex_3)`,
      [req.params.versionId, ae_flex_1 || null, ae_flex_2 || null, ae_flex_3 || null]
    );
    const [[row]] = await pool.execute(
      'SELECT * FROM case_ae_flex_fields WHERE version_id = ?',
      [req.params.versionId]
    );
    res.json(row);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// ─── GUARD HELPER — reject writes to locked versions ─────────────────────────

async function guardLocked(versionId) {
  const [[v]] = await pool.execute(
    'SELECT is_locked FROM case_ae_versions WHERE id = ?', [versionId]
  );
  if (!v) {
    const err = new Error('AE version not found'); err.status = 404; throw err;
  }
  if (v.is_locked) {
    const err = new Error('This AE version is locked and cannot be edited');
    err.status = 403; throw err;
  }
}

module.exports = router;
