'use strict';

/**
 * workflowSla.js — Sprint 2 #11 surface for SLA tracking.
 *
 *   GET    /api/cases/:caseId/sla                 — current state timing + status
 *   GET    /api/cases/:caseId/sla/history         — chronology of state visits
 *   POST   /api/cases/:caseId/sla/enter           body { state }  (manual override)
 *
 *   GET    /api/admin/sla                         — list all SLA configs
 *   POST   /api/admin/sla                         body { id?, org_id?, case_type, state, sla_hours, warning_threshold_pct?, escalation_role?, escalation_user_id?, is_active? }
 *   DELETE /api/admin/sla/:id                     — soft delete (is_active=0)
 *
 *   POST   /api/admin/sla/scan                    — manual breach sweep
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const sla = require('../../services/workflowSlaService');

const ADMIN = ['admin', 'superadmin'];

router.get('/cases/:caseId/sla', authenticate, async (req, res) => {
  try {
    res.json({ timing: await sla.getCaseTiming({ orgId: req.user.orgId, caseId: Number(req.params.caseId) }) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/cases/:caseId/sla/history', authenticate, async (req, res) => {
  try {
    res.json({ timings: await sla.listCaseTimings({ orgId: req.user.orgId, caseId: Number(req.params.caseId) }) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cases/:caseId/sla/enter', authenticate, async (req, res) => {
  try {
    const { state, case_type } = req.body || {};
    if (!state) return res.status(400).json({ error: 'state required' });
    const out = await sla.enterState({
      orgId:    req.user.orgId,
      caseId:   Number(req.params.caseId),
      state,
      caseType: case_type || null,
      userId:   req.user.userId,
    });
    res.json({ ok: true, ...out });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/admin/sla', authenticate, requireRole(...ADMIN), async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM workflow_state_sla ORDER BY org_id IS NULL DESC, case_type, state`
    );
    res.json({ rules: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/sla', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const {
      id, org_id = null, case_type, state, sla_hours,
      warning_threshold_pct = 75, escalation_role = null, escalation_user_id = null,
      is_active = 1,
    } = req.body || {};
    if (!case_type || !state || !sla_hours) {
      return res.status(400).json({ error: 'case_type + state + sla_hours required' });
    }
    if (id) {
      await pool.execute(
        `UPDATE workflow_state_sla
            SET sla_hours = ?, warning_threshold_pct = ?, escalation_role = ?,
                escalation_user_id = ?, is_active = ?, updated_at = NOW()
          WHERE id = ?`,
        [sla_hours, warning_threshold_pct, escalation_role, escalation_user_id, is_active ? 1 : 0, id]
      );
    } else {
      await pool.execute(
        `INSERT INTO workflow_state_sla
           (org_id, case_type, state, sla_hours, warning_threshold_pct, escalation_role, escalation_user_id, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           sla_hours = VALUES(sla_hours),
           warning_threshold_pct = VALUES(warning_threshold_pct),
           escalation_role = VALUES(escalation_role),
           escalation_user_id = VALUES(escalation_user_id),
           is_active = VALUES(is_active),
           updated_at = NOW()`,
        [org_id, case_type, state, sla_hours, warning_threshold_pct, escalation_role, escalation_user_id, is_active ? 1 : 0]
      );
    }
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/admin/sla/:id', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    await pool.execute(`UPDATE workflow_state_sla SET is_active = 0 WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/sla/scan', authenticate, requireRole(...ADMIN), async (_req, res) => {
  try {
    const out = await sla.scanForBreaches();
    res.json({ ok: true, ...out });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
