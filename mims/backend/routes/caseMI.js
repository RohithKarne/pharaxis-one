'use strict';

/**
 * caseMI.js — MI (Medical Information) Component API
 * F-16: Multiple MI tabs per case, each with category/product/question/response fields (Vivek)
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../database/db');
const { authenticate } = require('../middleware/auth');

// GET /api/cases/:id/mi — list all MI tabs for a case
router.get('/cases/:id/mi', authenticate, async (req, res) => {
  try {
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
    await pool.execute('DELETE FROM case_mi WHERE id = ?', [req.params.miId]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE case MI error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
