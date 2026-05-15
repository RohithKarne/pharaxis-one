'use strict';

const express = require('express');
const pool = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { generateE2BXml } = require('../../services/pv/e2bGenerator');
const { validateE2BXml } = require('../../services/pv/e2bValidator');
const { transition } = require('../../services/pv/icsrLifecycle');
const { searchMedDra } = require('../../services/pv/meddraService');
const { searchWhoDrug } = require('../../services/pv/whodrugService');

const router = express.Router();
const adminOnly = [authenticate, requireRole('admin', 'superadmin')];

function orgScope(req, alias = 'r') {
  return req.user.role === 'superadmin' ? { sql: '1=1', params: [] } : { sql: `${alias}.org_id = ?`, params: [req.user.orgId] };
}

async function audit(req, action, entity, entityId, details) {
  await pool.execute(
    `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [req.user?.userId || null, req.user?.email || 'system', action, entity, entityId || null, JSON.stringify(details || {})]
  ).catch(() => {});
}

function safeJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

async function loadIcsr(id, req) {
  const scope = orgScope(req, 'r');
  const [[report]] = await pool.execute(`SELECT r.* FROM icsr_reports r WHERE r.id = ? AND ${scope.sql} LIMIT 1`, [id, ...scope.params]);
  if (!report) return null;
  const [drugs] = await pool.execute('SELECT * FROM icsr_drugs WHERE icsr_id = ? ORDER BY id ASC', [id]);
  const [reactions] = await pool.execute('SELECT * FROM icsr_reactions WHERE icsr_id = ? ORDER BY id ASC', [id]);
  const [tests] = await pool.execute('SELECT * FROM icsr_test_results WHERE icsr_id = ? ORDER BY id ASC', [id]);
  const [history] = await pool.execute('SELECT * FROM icsr_medical_history WHERE icsr_id = ? ORDER BY id ASC', [id]);
  report.seriousness_classification = safeJson(report.seriousness_classification, {});
  report.causality_per_drug = safeJson(report.causality_per_drug, {});
  return { report, drugs, reactions, tests, history };
}

async function replaceChildren(icsrId, body = {}) {
  for (const table of ['icsr_drugs', 'icsr_reactions', 'icsr_test_results', 'icsr_medical_history']) {
    await pool.execute(`DELETE FROM ${table} WHERE icsr_id = ?`, [icsrId]);
  }
  for (const d of body.drugs || []) {
    await pool.execute(
      `INSERT INTO icsr_drugs (icsr_id, drug_role, active_substance, medicinal_product_name, batch_no, dose_amount, dose_unit, dose_form, route_of_admin, indication, indication_meddra, start_date, end_date, action_taken, dechallenge, rechallenge, reaction_recurred)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [icsrId, d.drug_role || 'suspect', d.active_substance || null, d.medicinal_product_name || null, d.batch_no || null, d.dose_amount || null, d.dose_unit || null, d.dose_form || null, d.route_of_admin || null, d.indication || null, d.indication_meddra || null, d.start_date || null, d.end_date || null, d.action_taken || null, d.dechallenge || null, d.rechallenge || null, d.reaction_recurred || null]
    );
  }
  for (const r of body.reactions || []) {
    await pool.execute(
      `INSERT INTO icsr_reactions (icsr_id, meddra_pt, meddra_pt_name, meddra_llt, meddra_soc, onset_date, end_date, outcome, intensity, term_highlighted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [icsrId, r.meddra_pt || null, r.meddra_pt_name || null, r.meddra_llt || null, r.meddra_soc || null, r.onset_date || null, r.end_date || null, r.outcome || null, r.intensity || null, r.term_highlighted || 'n']
    );
  }
  for (const t of body.tests || []) {
    await pool.execute(
      `INSERT INTO icsr_test_results (icsr_id, test_name, test_date, result_text, result_unstructured, test_normal_low, test_normal_high)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [icsrId, t.test_name || null, t.test_date || null, t.result_text || null, t.result_unstructured || null, t.test_normal_low || null, t.test_normal_high || null]
    );
  }
  for (const h of body.history || body.medical_history || []) {
    await pool.execute(
      `INSERT INTO icsr_medical_history (icsr_id, structure, start_date, end_date, comments, meddra_code)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [icsrId, h.structure || 'disease', h.start_date || null, h.end_date || null, h.comments || null, h.meddra_code || null]
    );
  }
}

router.get('/icsr/meddra-search', ...adminOnly, async (req, res) => {
  try { res.json({ results: await searchMedDra(req.query.q || '', req.query.limit || 20) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/icsr/whodrug-search', ...adminOnly, async (req, res) => {
  try { res.json({ results: await searchWhoDrug(req.query.q || '', req.query.limit || 20) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/icsr', ...adminOnly, async (req, res) => {
  try {
    const caseId = Number(req.body.case_id);
    if (!caseId) return res.status(400).json({ error: 'case_id is required.' });
    const scope = req.user.role === 'superadmin' ? { sql: '1=1', params: [] } : { sql: 'org_id = ?', params: [req.user.orgId] };
    const [[caseRow]] = await pool.execute(`SELECT * FROM cases WHERE id = ? AND ${scope.sql} LIMIT 1`, [caseId, ...scope.params]);
    if (!caseRow) return res.status(404).json({ error: 'AE case not found.' });
    const orgId = caseRow.org_id || req.user.orgId;
    const [result] = await pool.execute(
      `INSERT INTO icsr_reports (org_id, case_id, receiver_id, receive_date, primary_source_country, report_type, seriousness_classification, narrative, status, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
      [orgId, caseId, req.body.receiver_id || 'FDA', caseRow.created_at || null, req.body.primary_source_country || 'US', req.body.report_type || 'spontaneous', JSON.stringify({ hospitalization: false, death: false }), caseRow.description || caseRow.subject || '', req.user.userId, req.user.userId]
    );
    const year = new Date().getFullYear();
    const senderId = `ORG${orgId}-${year}-${String(result.insertId).padStart(6, '0')}`;
    await pool.execute('UPDATE icsr_reports SET sender_safety_report_id = ? WHERE id = ?', [senderId, result.insertId]);
    await audit(req, 'CREATE', 'icsr_report', result.insertId, { case_id: caseId, sender_safety_report_id: senderId });
    res.status(201).json({ id: result.insertId, sender_safety_report_id: senderId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/icsr', ...adminOnly, async (req, res) => {
  try {
    const scope = orgScope(req, 'r');
    const params = [...scope.params];
    let where = scope.sql;
    if (req.query.status) { where += ' AND r.status = ?'; params.push(req.query.status); }
    if (req.query.from) { where += ' AND r.created_at >= ?'; params.push(req.query.from); }
    if (req.query.to) { where += ' AND r.created_at <= ?'; params.push(`${req.query.to} 23:59:59`); }
    const [rows] = await pool.execute(`SELECT r.*, c.case_number FROM icsr_reports r LEFT JOIN cases c ON c.id = r.case_id WHERE ${where} ORDER BY r.updated_at DESC LIMIT 200`, params);
    res.json({ rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/icsr/:id', ...adminOnly, async (req, res) => {
  try {
    const data = await loadIcsr(req.params.id, req);
    if (!data) return res.status(404).json({ error: 'ICSR not found.' });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/icsr/:id', ...adminOnly, async (req, res) => {
  try {
    const data = await loadIcsr(req.params.id, req);
    if (!data) return res.status(404).json({ error: 'ICSR not found.' });
    if (data.report.status !== 'draft') return res.status(409).json({ error: 'Only draft ICSRs can be updated.' });
    const r = req.body.report || req.body;
    await pool.execute(
      `UPDATE icsr_reports SET receiver_id=?, receive_date=?, primary_source_country=?, report_type=?, seriousness_classification=?, causality_per_drug=?, narrative=?, updated_by=? WHERE id=?`,
      [r.receiver_id || data.report.receiver_id, r.receive_date || data.report.receive_date, r.primary_source_country || data.report.primary_source_country, r.report_type || data.report.report_type, JSON.stringify(r.seriousness_classification || data.report.seriousness_classification || {}), JSON.stringify(r.causality_per_drug || data.report.causality_per_drug || {}), r.narrative ?? data.report.narrative, req.user.userId, req.params.id]
    );
    await replaceChildren(req.params.id, req.body);
    await audit(req, 'UPDATE', 'icsr_report', req.params.id, { fields: Object.keys(req.body || {}) });
    res.json(await loadIcsr(req.params.id, req));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/icsr/:id/xml', ...adminOnly, async (req, res) => {
  try {
    const data = await loadIcsr(req.params.id, req);
    if (!data) return res.status(404).json({ error: 'ICSR not found.' });
    res.type('application/xml').send(generateE2BXml(data));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/icsr/:id/validate', ...adminOnly, async (req, res) => {
  try {
    const data = await loadIcsr(req.params.id, req);
    if (!data) return res.status(404).json({ error: 'ICSR not found.' });
    const xml = generateE2BXml(data);
    const errors = validateE2BXml(xml);
    await audit(req, 'VALIDATE', 'icsr_report', req.params.id, { errors: errors.length });
    res.json({ valid: errors.length === 0, errors });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/icsr/:id/lock', ...adminOnly, async (req, res) => {
  try {
    const data = await loadIcsr(req.params.id, req);
    if (!data) return res.status(404).json({ error: 'ICSR not found.' });
    const errors = validateE2BXml(generateE2BXml(data));
    if (errors.length) return res.status(422).json({ valid: false, errors });
    transition(data.report, 'validated');
    await pool.execute('UPDATE icsr_reports SET status="validated", locked=1, locked_at=CURRENT_TIMESTAMP WHERE id=?', [req.params.id]);
    await audit(req, 'LOCK', 'icsr_report', req.params.id, { status: 'validated' });
    res.json({ status: 'validated' });
  } catch (err) { res.status(err.code === 'INVALID_TRANSITION' ? 409 : 500).json({ error: err.message }); }
});

router.post('/icsr/:id/submit', ...adminOnly, async (req, res) => {
  try {
    const data = await loadIcsr(req.params.id, req);
    if (!data) return res.status(404).json({ error: 'ICSR not found.' });
    if (data.report.status !== 'validated') return res.status(409).json({ error: 'ICSR must be validated before submission.' });
    const xml = generateE2BXml(data);
    const gatewayName = String(req.body.gateway || data.report.receiver_id || 'mock').toLowerCase();
    const gateway = require(`../../services/pv/gateways/${['fda','ema','pmda','mhra'].includes(gatewayName) ? gatewayName : 'mock'}`);
    const result = await gateway.submit(xml, req.body.config || {});
    await pool.execute('UPDATE icsr_reports SET status="submitted", submission_count=submission_count+1, last_submitted_at=CURRENT_TIMESTAMP WHERE id=?', [req.params.id]);
    await pool.execute(
      `INSERT INTO transmission_audit_trail (case_id, user_id, user_name, target_system, payload_summary, status, response_code)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.report.case_id, req.user.userId, req.user.email, `ICSR-${data.report.receiver_id}`, xml.slice(0, 1000), result.status || 'submitted', result.gateway_id || null]
    );
    await audit(req, 'SUBMIT', 'icsr_report', req.params.id, { gateway: gatewayName, gateway_id: result.gateway_id });
    res.json({ status: 'submitted', gateway: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/icsr/:id/follow-up', ...adminOnly, async (req, res) => {
  try {
    const data = await loadIcsr(req.params.id, req);
    if (!data) return res.status(404).json({ error: 'ICSR not found.' });
    await pool.execute('UPDATE icsr_reports SET status="superseded" WHERE id=?', [req.params.id]);
    const [result] = await pool.execute(
      `INSERT INTO icsr_reports (org_id, case_id, receiver_id, receive_date, primary_source_country, report_type, seriousness_classification, causality_per_drug, narrative, status, parent_report_id, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
      [data.report.org_id, data.report.case_id, data.report.receiver_id, data.report.receive_date, data.report.primary_source_country, data.report.report_type, JSON.stringify(data.report.seriousness_classification || {}), JSON.stringify(data.report.causality_per_drug || {}), data.report.narrative, req.params.id, req.user.userId, req.user.userId]
    );
    await pool.execute('UPDATE icsr_reports SET sender_safety_report_id=? WHERE id=?', [`${data.report.sender_safety_report_id || 'ICSR'}-FU${result.insertId}`, result.insertId]);
    await audit(req, 'FOLLOW_UP', 'icsr_report', result.insertId, { parent_report_id: Number(req.params.id) });
    res.status(201).json({ id: result.insertId, parent_report_id: Number(req.params.id) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/icsr/:id/timeline', ...adminOnly, async (req, res) => {
  try {
    const [auditRows] = await pool.execute(`SELECT * FROM audit_logs WHERE entity = 'icsr_report' AND entity_id = ? ORDER BY created_at ASC`, [req.params.id]);
    const [acks] = await pool.execute('SELECT * FROM icsr_e2b_acknowledgements WHERE icsr_id = ? ORDER BY ack_received_at ASC', [req.params.id]);
    res.json({ timeline: [...auditRows.map(r => ({ type: 'audit', ...r })), ...acks.map(r => ({ type: 'ack', ...r }))].sort((a, b) => new Date(a.created_at || a.ack_received_at) - new Date(b.created_at || b.ack_received_at)) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
