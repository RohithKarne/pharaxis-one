'use strict';

/**
 * miPromoReview.js — Sprint 2 #16 surface for off-label + promotional review.
 *
 *   GET /api/mi/tabs/:tabId/classification          — current flags
 *   PUT /api/mi/tabs/:tabId/classification          body { is_off_label, is_solicited, off_label_indication }
 *   POST /api/mi/tabs/:tabId/promo-review/request   body { assigned_to }
 *   POST /api/mi/tabs/:tabId/promo-review/decide    body { decision: 'approved'|'rejected', notes }
 *   GET  /api/mi/promo-reviews/pending              — admin queue
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');

const PROMO_REVIEWER = ['admin', 'platform_admin', 'medical_director', 'compliance_officer'];

router.get('/mi/tabs/:tabId/classification', authenticate, async (req, res) => {
  try {
    const [[r]] = await pool.execute(
      `SELECT t.id, t.is_off_label, t.is_solicited, t.off_label_indication,
              t.promo_review_status, t.promo_review_assigned_to,
              t.promo_review_requested_at, t.promo_review_decided_at,
              t.promo_review_decided_by, t.promo_review_notes,
              c.org_id
         FROM case_mi t
         JOIN cases c ON c.id = t.case_id
        WHERE t.id = ? AND c.org_id = ?`,
      [req.params.tabId, req.user.orgId]
    );
    if (!r) return res.status(404).json({ error: 'Not found' });
    res.json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/mi/tabs/:tabId/classification', authenticate, async (req, res) => {
  try {
    const { is_off_label, is_solicited, off_label_indication } = req.body || {};
    await pool.execute(
      `UPDATE case_mi t
         JOIN cases c ON c.id = t.case_id
          SET t.is_off_label = COALESCE(?, t.is_off_label),
              t.is_solicited = COALESCE(?, t.is_solicited),
              t.off_label_indication = COALESCE(?, t.off_label_indication)
        WHERE t.id = ? AND c.org_id = ?`,
      [
        is_off_label == null ? null : (is_off_label ? 1 : 0),
        is_solicited == null ? null : (is_solicited ? 1 : 0),
        off_label_indication ?? null,
        req.params.tabId, req.user.orgId,
      ]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/mi/tabs/:tabId/promo-review/request', authenticate, async (req, res) => {
  try {
    const { assigned_to } = req.body || {};
    await pool.execute(
      `UPDATE case_mi t
         JOIN cases c ON c.id = t.case_id
          SET t.promo_review_status = 'pending',
              t.promo_review_assigned_to = ?,
              t.promo_review_requested_at = NOW()
        WHERE t.id = ? AND c.org_id = ?`,
      [assigned_to || null, req.params.tabId, req.user.orgId]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/mi/tabs/:tabId/promo-review/decide', authenticate, requireRole(...PROMO_REVIEWER), async (req, res) => {
  try {
    const { decision, notes } = req.body || {};
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be approved or rejected' });
    }
    await pool.execute(
      `UPDATE case_mi t
         JOIN cases c ON c.id = t.case_id
          SET t.promo_review_status = ?,
              t.promo_review_decided_at = NOW(),
              t.promo_review_decided_by = ?,
              t.promo_review_notes = ?
        WHERE t.id = ? AND c.org_id = ?`,
      [decision, req.user.userId, notes || null, req.params.tabId, req.user.orgId]
    );
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/mi/promo-reviews/pending', authenticate, requireRole(...PROMO_REVIEWER), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT t.id AS mi_tab_id, t.case_id, t.is_off_label, t.off_label_indication,
              t.promo_review_requested_at, t.promo_review_assigned_to,
              u.name AS assigned_to_name, c.case_number
         FROM case_mi t
         JOIN cases c ON c.id = t.case_id
         LEFT JOIN users u ON u.id = t.promo_review_assigned_to
        WHERE c.org_id = ? AND t.promo_review_status = 'pending'
        ORDER BY t.promo_review_requested_at ASC
        LIMIT 200`,
      [req.user.orgId]
    );
    res.json({ pending: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
