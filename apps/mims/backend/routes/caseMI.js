'use strict';

/**
 * caseMI.js — MI (Medical Information) Component API
 * F-16: Multiple MI tabs per case, each with category/product/question/response fields (Vivek)
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../database/db');
const { authenticate } = require('../middleware/auth');
const { summarizeResolvedProductGroups } = require('../services/productGroupService');
const { hasGlobalAdminScope } = require('../utils/adminScope');

// ─── ORG ISOLATION HELPERS ───────────────────────────────────────────────────

async function verifyCaseOrg(caseId, req) {
  const [[c]] = await pool.execute('SELECT org_id FROM cases WHERE id = ?', [caseId]);
  if (!c) return false;
  if (hasGlobalAdminScope(req.user)) return true;
  return Number(c.org_id) === Number(req.user.orgId);
}

// Verify an MI tab belongs to requesting user's org via its parent case
async function verifyMiOrg(miId, req) {
  const [[row]] = await pool.execute(
    `SELECT c.org_id FROM case_mi m JOIN cases c ON m.case_id = c.id WHERE m.id = ?`,
    [miId]
  );
  if (!row) return false;
  if (hasGlobalAdminScope(req.user)) return true;
  return Number(row.org_id) === Number(req.user.orgId);
}

// GET /api/cases/:id/mi — list all MI tabs for a case
router.get('/cases/:id/mi', authenticate, async (req, res) => {
  try {
    if (!await verifyCaseOrg(req.params.id, req)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const [rows] = await pool.execute(
      `SELECT m.*, p.trade_name AS product_name
       FROM case_mi m
       LEFT JOIN products p ON m.product_id = p.id
       WHERE m.case_id = ?
       ORDER BY m.tab_index ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET case MI error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cases/:id/mi — add a new MI tab to a case
router.post('/cases/:id/mi', authenticate, async (req, res) => {
  try {
    if (!await verifyCaseOrg(req.params.id, req, 'case.update')) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const {
      mi_category, subcategory, product_id,
      question_summary, detailed_question,
      response_required_by, response_provided, response_date,
      response_channel, status = 'Open'
    } = req.body;

    // Auto-assign next tab index
    const [[{ maxTab }]] = await pool.execute(
      'SELECT COALESCE(MAX(tab_index), 0) AS maxTab FROM case_mi WHERE case_id = ?',
      [req.params.id]
    );
    const tabIndex = maxTab + 1;

    const [result] = await pool.execute(
      `INSERT INTO case_mi
        (case_id, tab_index, mi_category, subcategory, product_id,
         question_summary, detailed_question, response_required_by,
         response_provided, response_date, response_channel, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.params.id, tabIndex,
        mi_category || null, subcategory || null, product_id || null,
        question_summary || null, detailed_question || null,
        response_required_by || null, response_provided || null,
        response_date || null, response_channel || null, status
      ]
    );

    const [[row]] = await pool.execute(
      'SELECT * FROM case_mi WHERE id = ?', [result.insertId]
    );
    res.status(201).json(row);
  } catch (err) {
    console.error('POST case MI error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/cases/mi/:miId — update an MI tab
router.put('/cases/mi/:miId', authenticate, async (req, res) => {
  try {
    if (!await verifyMiOrg(req.params.miId, req)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const {
      mi_category, subcategory, product_id,
      question_summary, detailed_question,
      response_required_by, response_provided, response_date,
      response_channel, status
    } = req.body;

    await pool.execute(
      `UPDATE case_mi SET
        mi_category          = COALESCE(?, mi_category),
        subcategory          = COALESCE(?, subcategory),
        product_id           = COALESCE(?, product_id),
        question_summary     = COALESCE(?, question_summary),
        detailed_question    = COALESCE(?, detailed_question),
        response_required_by = COALESCE(?, response_required_by),
        response_provided    = COALESCE(?, response_provided),
        response_date        = COALESCE(?, response_date),
        response_channel     = COALESCE(?, response_channel),
        status               = COALESCE(?, status)
       WHERE id = ?`,
      [
        mi_category          || null,
        subcategory          || null,
        product_id           || null,
        question_summary     || null,
        detailed_question    || null,
        response_required_by || null,
        response_provided    || null,
        response_date        || null,
        response_channel     || null,
        status               || null,
        req.params.miId
      ]
    );

    const [[row]] = await pool.execute(
      'SELECT * FROM case_mi WHERE id = ?', [req.params.miId]
    );
    res.json(row);
  } catch (err) {
    console.error('PUT case MI error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/cases/mi/:miId — remove an MI tab
router.delete('/cases/mi/:miId', authenticate, async (req, res) => {
  try {
    if (!await verifyMiOrg(req.params.miId, req)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    await pool.execute('DELETE FROM case_mi WHERE id = ?', [req.params.miId]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE case MI error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cases/mi/products — org products list for MI form product selector
router.get('/cases/mi/products', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      hasGlobalAdminScope(req.user)
        ? `SELECT p.id, p.trade_name, p.mah, p.org_id, p.family_id, p.dosage, p.atc_code, p.authorization_country, pf.name AS family_name
             FROM products p
             LEFT JOIN product_families pf ON pf.id = p.family_id
            WHERE p.is_active = 1
            ORDER BY p.trade_name`
        : `SELECT p.id, p.trade_name, p.mah, p.org_id, p.family_id, p.dosage, p.atc_code, p.authorization_country, pf.name AS family_name
             FROM products p
             LEFT JOIN product_families pf ON pf.id = p.family_id
            WHERE p.org_id = ? AND p.is_active = 1
            ORDER BY p.trade_name`,
      hasGlobalAdminScope(req.user) ? [] : [req.user.orgId]
    );
    const enriched = [];
    for (const row of rows) {
      enriched.push({
        ...row,
        product_groups: await summarizeResolvedProductGroups({
          orgId: req.user.orgId || row.org_id || null,
          productId: row.id,
          country: row.authorization_country || null,
        }),
      });
    }
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
