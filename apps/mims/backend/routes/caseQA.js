'use strict';

/**
 * caseQA.js — AI QA Engine Routes (Sprint 15)
 *
 * POST /api/cases/:id/qa-evaluate     — real-time QA evaluation on a case
 * POST /api/cases/:id/qa-override     — log user override of QA flags
 * GET  /api/cases/:id/qa-history      — fetch stored QA evaluations for a case
 * GET  /api/admin/qa/overrides        — manager override dashboard data
 * POST /api/admin/qa/reports          — initiate retrospective QA batch job
 * GET  /api/admin/qa/reports          — list retrospective QA reports
 * GET  /api/admin/qa/reports/:reportId — fetch report detail
 * GET  /api/admin/qa/rules            — list org QA rules
 * PUT  /api/admin/qa/rules/:ruleId    — update org QA rule
 * POST /api/admin/qa/rules/reset      — reset org rules to knowledge base defaults
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../database/db');
const { authenticate, requireRole, requireOrg } = require('../middleware/auth');
const { evaluateCase, storeQaResponse, storeOverride, ensureOrgRules } = require('../services/qaRulesEngine');
const { validate, schemas } = require('../middleware/validate');

function normalizeDateOnly(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

// ─── POST /api/cases/:id/qa-evaluate ─────────────────────────────────────────
// Real-time QA evaluation. Builds case payload, runs engine, stores result.
router.post('/cases/:id/qa-evaluate', authenticate, requireOrg, async (req, res) => {
  const caseId = parseInt(req.params.id, 10);
  const orgId  = req.user.orgId;

  try {
    // Fetch core case data
    const [[caseRow]] = await pool.execute(
      `SELECT c.id, c.case_number, c.case_type, c.org_id, c.status_id,
              c.case_owner_id, c.date_received, c.description, c.created_at,
              c.priority, c.intake_channel
         FROM cases c
        WHERE c.id = ? AND c.org_id = ? AND c.is_deleted = 0`,
      [caseId, orgId]
    );

    if (!caseRow) return res.status(404).json({ error: 'Case not found.' });

    // Build enriched payload for rules engine
    const payload = { ...caseRow };

    // Enrich AE-specific fields
    if (caseRow.case_type === 'AE') {
      const [[aeGen]] = await pool.execute(
        `SELECT ag.report_type, ag.additional_info, ag.date_of_onset, ag.date_of_report
           FROM case_ae_versions aev
           JOIN case_ae_general ag ON ag.version_id = aev.id
          WHERE aev.case_id = ?
          ORDER BY aev.id DESC LIMIT 1`,
        [caseId]
      );
      if (aeGen) {
        payload.reporter_type = aeGen.report_type || null;
        payload.additional_info = aeGen.additional_info || null;
        payload.date_of_onset = aeGen.date_of_onset || null;
        payload.date_of_report = aeGen.date_of_report || null;
      }

      const [[aeEvt]] = await pool.execute(
        `SELECT e.is_serious,
                e.outcome,
                e.event_description AS ae_description,
                CONCAT_WS(', ',
                  IF(e.is_death = 1, 'Death', NULL),
                  IF(e.is_life_threatening = 1, 'Life Threatening', NULL),
                  IF(e.is_hospitalization = 1, 'Hospitalization', NULL),
                  IF(e.is_disability = 1, 'Disability', NULL),
                  IF(e.is_congenital_anomaly = 1, 'Congenital Anomaly', NULL),
                  IF(e.is_other_medically_important = 1, 'Other Medically Important', NULL)
                ) AS seriousness_criteria,
                NULL AS suspect_drug,
                NULL AS suspect_drug_dose,
                NULL AS date_of_death
           FROM case_ae_events e
           JOIN case_ae_versions av ON av.id = e.version_id
          WHERE av.case_id = ?
          ORDER BY av.id DESC LIMIT 1`,
        [caseId]
      );
      if (aeEvt) Object.assign(payload, aeEvt);

      const [[aePatient]] = await pool.execute(
        `SELECT p.age AS patient_age, NULL AS patient_age_group, p.sex AS patient_gender
           FROM case_ae_patient_info p
           JOIN case_ae_versions av ON av.id = p.version_id
          WHERE av.case_id = ?
          ORDER BY av.id DESC LIMIT 1`,
        [caseId]
      );
      if (aePatient) Object.assign(payload, aePatient);
    }

    // Enrich MI-specific fields
    if (caseRow.case_type === 'MI') {
      const [[miRow]] = await pool.execute(
        `SELECT m.response_text, m.response_channel, m.response_status, m.response_date,
                m.follow_up_required, m.author_name
           FROM case_mi_responses m
          WHERE m.case_id = ?
          ORDER BY m.id DESC LIMIT 1`,
        [caseId]
      );
      if (miRow) {
        payload.response_text = miRow.response_text || null;
        payload.response_channel = miRow.response_channel || null;
        payload.response_status = miRow.response_status || null;
        payload.response_date = miRow.response_date || null;
        payload.follow_up_required = miRow.follow_up_required;
        payload.reporter_name = miRow.author_name || null;
        payload.response_provided = miRow.response_text || null;
      }
    }

    // Enrich PC-specific fields
    if (caseRow.case_type === 'PC') {
      const [[pcGen]] = await pool.execute(
        `SELECT g.complaint_description, g.pc_category, g.pc_status, g.severity
           FROM case_pc_versions pv
           JOIN case_pc_general g ON g.version_id = pv.id
          WHERE pv.case_id = ?
          ORDER BY pv.id DESC LIMIT 1`,
        [caseId]
      );
      if (pcGen) Object.assign(payload, pcGen);
    }

    // Run rules engine
    const result = await evaluateCase(payload, orgId);

    // Store result
    const responseId = await storeQaResponse({
      caseId,
      orgId,
      evaluationType: 'realtime',
      triggeredBy: req.user.userId,
      inputSnapshot: payload,
      result,
    });

    return res.json({
      response_id:    responseId,
      flags:          result.flags,
      flags_count:    result.flags_count,
      critical_count: result.critical_count,
      warning_count:  result.warning_count,
      quality_score:  result.quality_score,
    });

  } catch (err) {
    console.error('[QA Evaluate]', err.message);
    return res.status(500).json({ error: 'QA evaluation failed.' });
  }
});

// ─── POST /api/cases/:id/qa-override ─────────────────────────────────────────
// User overrides QA flags and submits with optional reason.
// Critical override without reason triggers manager alert.
router.post('/cases/:id/qa-override', authenticate, requireOrg, validate(schemas.qaOverride), async (req, res) => {
  const caseId = parseInt(req.params.id, 10);
  const { response_id, override_reason, has_critical_flags } = req.body;

  try {
    await storeOverride({
      responseId:     response_id,
      overrideBy:     req.user.userId,
      overrideReason: override_reason || null,
    });

    // If critical flag overridden without reason — write manager alert notification
    if (has_critical_flags && !override_reason) {
      const [[caseRow]] = await pool.execute(
        'SELECT case_number, case_owner_id, org_id FROM cases WHERE id = ?',
        [caseId]
      );
      if (caseRow) {
        // Find manager-level users for this org
        const [managers] = await pool.execute(
          `SELECT id FROM users WHERE org_id = ? AND role IN ('admin','superadmin') AND is_active = 1`,
          [caseRow.org_id]
        );
        for (const mgr of managers) {
          await pool.execute(
            `INSERT INTO notifications
               (user_id, category, title, message, is_read)
             VALUES (?, 'qa_override_alert', 'QA Override Alert', ?, 0)`,
            [
              mgr.id,
              `Case ${caseRow.case_number || caseId} — critical QA flag overridden without documented reason by user ${req.user.email}.`,
            ]
          );
        }
      }
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[QA Override]', err.message);
    return res.status(500).json({ error: 'Override logging failed.' });
  }
});

// ─── GET /api/cases/:id/qa-history ───────────────────────────────────────────
// Returns stored QA evaluations for a case (latest 10).
router.get('/cases/:id/qa-history', authenticate, requireOrg, async (req, res) => {
  const caseId = parseInt(req.params.id, 10);
  const orgId  = req.user.orgId;
  try {
    const [rows] = await pool.execute(
      `SELECT id, evaluation_type, triggered_at, flags_count, critical_count,
              warning_count, quality_score, override_by, override_reason, override_at
         FROM ai_qa_responses
        WHERE case_id = ? AND org_id = ?
        ORDER BY triggered_at DESC
        LIMIT 10`,
      [caseId, orgId]
    );
    return res.json({ history: rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch QA history.' });
  }
});

// ─── GET /api/admin/qa/overrides ─────────────────────────────────────────────
// Manager override dashboard — all overrides for org, filterable by user/date/severity.
router.get('/admin/qa/overrides', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  const orgId = req.user.orgId;
  const { user_id, from_date, to_date, page = 1, limit = 50 } = req.query;

  const conditions = ['r.org_id = ?'];
  const params = [orgId];

  conditions.push('r.override_by IS NOT NULL');

  if (user_id) { conditions.push('r.override_by = ?'); params.push(parseInt(user_id, 10)); }
  if (from_date) { conditions.push('r.override_at >= ?'); params.push(from_date); }
  if (to_date)   { conditions.push('r.override_at <= ?'); params.push(to_date + ' 23:59:59'); }

  const pageNumber = Math.max(1, parseInt(page, 10) || 1);
  const limitNumber = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
  const offset = (pageNumber - 1) * limitNumber;

  try {
    const [rows] = await pool.execute(
      `SELECT r.id, r.case_id, c.case_number, c.case_type,
              r.critical_count, r.warning_count, r.quality_score,
              r.override_by, u.name as override_by_name, u.email as override_by_email,
              r.override_reason, r.override_at, r.triggered_at,
              r.output_response
         FROM ai_qa_responses r
         JOIN cases c ON c.id = r.case_id
         LEFT JOIN users u ON u.id = r.override_by
        WHERE ${conditions.join(' AND ')}
        ORDER BY r.override_at DESC
        LIMIT ${limitNumber} OFFSET ${offset}`,
      params
    );

    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) as total FROM ai_qa_responses r
        WHERE ${conditions.join(' AND ')}`,
      params
    );
    return res.json({ overrides: rows, total, page: pageNumber, limit: limitNumber });
  } catch (err) {
    console.error('[QA Overrides]', err.message);
    return res.status(500).json({ error: 'Failed to fetch override data.' });
  }
});

// ─── POST /api/admin/qa/reports ──────────────────────────────────────────────
// Admin initiates retrospective QA batch job.
router.post('/admin/qa/reports', authenticate, requireRole('admin', 'platform_admin'), requireOrg, validate(schemas.createQaReport), async (req, res) => {
  const orgId = req.user.orgId;
  const { report_name, date_range_start, date_range_end, case_type_filter } = req.body;

  try {
    const [ins] = await pool.execute(
      `INSERT INTO qa_reports
         (org_id, created_by, report_name, date_range_start, date_range_end,
          case_type_filter, status)
       VALUES (?, ?, ?, ?, ?, ?, 'queued')`,
      [orgId, req.user.userId, report_name,
       normalizeDateOnly(date_range_start), normalizeDateOnly(date_range_end), case_type_filter || null]
    );
    const reportId = ins.insertId;

    // Run batch async — don't block response
    setImmediate(() => runRetrospectiveBatch(reportId, orgId).catch(err =>
      console.error('[QA Batch] Report', reportId, 'failed:', err.message)
    ));

    return res.status(201).json({ report_id: reportId, status: 'queued' });
  } catch (err) {
    console.error('[QA Reports POST]', err.message);
    return res.status(500).json({ error: 'Failed to create report.' });
  }
});

// ─── GET /api/admin/qa/reports ───────────────────────────────────────────────
router.get('/admin/qa/reports', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  const orgId = req.user.orgId;
  try {
    const [rows] = await pool.execute(
      `SELECT r.id, r.report_name, r.date_range_start, r.date_range_end,
              r.case_type_filter, r.case_count, r.flagged_count, r.avg_quality_score,
              r.status, r.started_at, r.completed_at, r.created_at,
              u.name as created_by_name
         FROM qa_reports r
         LEFT JOIN users u ON u.id = r.created_by
        WHERE r.org_id = ?
        ORDER BY r.created_at DESC
        LIMIT 50`,
      [orgId]
    );
    return res.json({ reports: rows });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch reports.' });
  }
});

// ─── GET /api/admin/qa/reports/:reportId ─────────────────────────────────────
router.get('/admin/qa/reports/:reportId', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  const reportId = parseInt(req.params.reportId, 10);
  const orgId    = req.user.orgId;
  try {
    const [[report]] = await pool.execute(
      'SELECT * FROM qa_reports WHERE id = ? AND org_id = ?',
      [reportId, orgId]
    );
    if (!report) return res.status(404).json({ error: 'Report not found.' });

    const [items] = await pool.execute(
      `SELECT qi.id, qi.case_id, c.case_number, c.case_type, c.date_received,
              qi.quality_score, qi.flags_count, qi.critical_count, qi.warning_count,
              qi.flags_json
         FROM qa_report_items qi
         JOIN cases c ON c.id = qi.case_id
        WHERE qi.report_id = ?
        ORDER BY qi.quality_score ASC`,
      [reportId]
    );

    return res.json({ report, items });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch report detail.' });
  }
});

// ─── GET /api/admin/qa/rules ─────────────────────────────────────────────────
router.get('/admin/qa/rules', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  const orgId = req.user.orgId;
  try {
    await ensureOrgRules(orgId);
    const [rules] = await pool.execute(
      `SELECT id, rule_key, rule_name, rule_type, case_types, target_field,
              condition_json, severity, is_active, created_at, updated_at
         FROM org_qa_rules
        WHERE org_id = ?
        ORDER BY severity DESC, rule_type, id`,
      [orgId]
    );
    return res.json({ rules });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch rules.' });
  }
});

// ─── PUT /api/admin/qa/rules/:ruleId ─────────────────────────────────────────
router.put('/admin/qa/rules/:ruleId', authenticate, requireRole('admin', 'platform_admin'), requireOrg, validate(schemas.updateQaRule), async (req, res) => {
  const ruleId = parseInt(req.params.ruleId, 10);
  const orgId  = req.user.orgId;
  const { is_active, severity, condition_json } = req.body;

  try {
    const [[rule]] = await pool.execute(
      'SELECT id FROM org_qa_rules WHERE id = ? AND org_id = ?',
      [ruleId, orgId]
    );
    if (!rule) return res.status(404).json({ error: 'Rule not found.' });

    const updates = [];
    const params  = [];

    if (is_active !== undefined) { updates.push('is_active = ?');    params.push(is_active ? 1 : 0); }
    if (severity)                { updates.push('severity = ?');     params.push(severity); }
    if (condition_json)          { updates.push('condition_json = ?'); params.push(JSON.stringify(condition_json)); }

    if (!updates.length) return res.status(400).json({ error: 'No fields to update.' });

    params.push(ruleId, orgId);
    await pool.execute(
      `UPDATE org_qa_rules SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ? AND org_id = ?`,
      params
    );

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update rule.' });
  }
});

// ─── POST /api/admin/qa/rules/reset ──────────────────────────────────────────
// Wipe org rules and re-seed from knowledge base defaults.
router.post('/admin/qa/rules/reset', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  const orgId = req.user.orgId;
  try {
    await pool.execute('DELETE FROM org_qa_rules WHERE org_id = ?', [orgId]);
    await ensureOrgRules(orgId);
    return res.json({ ok: true, message: 'Rules reset to defaults.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reset rules.' });
  }
});

// ─── Retrospective batch job ──────────────────────────────────────────────────
async function runRetrospectiveBatch(reportId, orgId) {
  await pool.execute(
    `UPDATE qa_reports SET status = 'processing', started_at = NOW() WHERE id = ?`,
    [reportId]
  );

  try {
    const [[report]] = await pool.execute('SELECT * FROM qa_reports WHERE id = ?', [reportId]);

    const conditions = ['c.org_id = ?', 'c.is_deleted = 0'];
    const params = [orgId];

    if (report.date_range_start) { conditions.push('c.date_received >= ?'); params.push(report.date_range_start); }
    if (report.date_range_end)   { conditions.push('c.date_received <= ?'); params.push(report.date_range_end); }
    if (report.case_type_filter) { conditions.push('c.case_type = ?'); params.push(report.case_type_filter); }

    const [cases] = await pool.execute(
      `SELECT id, case_number, case_type, date_received, description, created_at,
              case_owner_id, status_id
         FROM cases c
        WHERE ${conditions.join(' AND ')}
        ORDER BY c.id ASC`,
      params
    );

    let flaggedCount = 0;
    let totalScore   = 0;

    for (const c of cases) {
      // Check if recent real-time QA response exists (within 24h) — reuse it
      const [[existing]] = await pool.execute(
        `SELECT id, flags_count, critical_count, warning_count, quality_score, output_response
           FROM ai_qa_responses
          WHERE case_id = ? AND evaluation_type = 'realtime'
            AND triggered_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
          ORDER BY triggered_at DESC LIMIT 1`,
        [c.id]
      );

      let qaResponseId, score, flagsCount, critCount, warnCount, flagsJson;

      if (existing) {
        qaResponseId = existing.id;
        score        = existing.quality_score;
        flagsCount   = existing.flags_count;
        critCount    = existing.critical_count;
        warnCount    = existing.warning_count;
        flagsJson    = existing.output_response;
      } else {
        // Run fresh evaluation
        const result = await evaluateCase(c, orgId);
        qaResponseId = await storeQaResponse({
          caseId:         c.id,
          orgId,
          evaluationType: 'retrospective',
          triggeredBy:    null,
          inputSnapshot:  c,
          result,
        });
        score      = result.quality_score;
        flagsCount = result.flags_count;
        critCount  = result.critical_count;
        warnCount  = result.warning_count;
        flagsJson  = { flags: result.flags };
      }

      await pool.execute(
        `INSERT INTO qa_report_items
           (report_id, case_id, ai_qa_response_id, quality_score,
            flags_count, critical_count, warning_count, flags_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [reportId, c.id, qaResponseId, score, flagsCount, critCount, warnCount, JSON.stringify(flagsJson)]
      );

      if (flagsCount > 0) flaggedCount++;
      totalScore += score;
    }

    const avgScore = cases.length > 0 ? (totalScore / cases.length).toFixed(2) : null;

    await pool.execute(
      `UPDATE qa_reports
          SET status = 'complete', completed_at = NOW(),
              case_count = ?, flagged_count = ?, avg_quality_score = ?
        WHERE id = ?`,
      [cases.length, flaggedCount, avgScore, reportId]
    );

  } catch (err) {
    await pool.execute(
      `UPDATE qa_reports SET status = 'failed', error_message = ? WHERE id = ?`,
      [err.message, reportId]
    );
    throw err;
  }
}

module.exports = router;
