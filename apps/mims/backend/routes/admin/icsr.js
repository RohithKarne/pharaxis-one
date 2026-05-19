'use strict';

const express = require('express');
let bcrypt;
try {
  bcrypt = require('bcryptjs');
} catch (_) {
  bcrypt = require('bcrypt');
}
const pool = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { generateE2BXml } = require('../../services/pv/e2bGenerator');
const { validateE2BXml } = require('../../services/pv/e2bValidator');
const { transition } = require('../../services/pv/icsrLifecycle');
const { searchMedDra } = require('../../services/pv/meddraService');
const { searchWhoDrug } = require('../../services/pv/whodrugService');
const { parseAck } = require('../../services/pv/ackParser');
const { getGatewayConfig } = require('../../services/pv/gatewayConfig');
const { generatePeriodicReport } = require('../../services/pv/periodicReportService');
const { runSignalDetection } = require('../../services/pv/signalDetectionService');
const { createESignManifest } = require('../../services/eSignManifestService');
const { assess: assessCaseValidity } = require('../../services/caseValidityService');
const { redact: redactPii } = require('../../services/piiRedactionService');
const { createFollowup, createAmendment, createNullification } = require('../../services/icsrLifecycleService');

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

async function verifyElectronicSignature(req, action, entityId) {
  const password = String(req.body?.password || '');
  const reason = String(req.body?.reason || '').trim();
  if (!password || !reason) {
    const err = new Error('password and reason are required for electronic signature.');
    err.statusCode = 400;
    throw err;
  }
  const [[userWithHash]] = await pool.execute('SELECT password FROM users WHERE id = ? LIMIT 1', [req.user.userId]);
  const valid = userWithHash?.password ? await bcrypt.compare(password, userWithHash.password) : false;
  if (!valid) {
    const err = new Error('Incorrect password. Electronic signature rejected.');
    err.statusCode = 401;
    throw err;
  }
  await audit(req, 'ESIG', 'icsr_report', entityId, { action, reason, signed_by: req.user.email });
  return { reason, signed_by: req.user.email };
}

async function createSubmissionManifest(req, data, xml, signature) {
  if (!process.env.ESIGN_PRIVATE_KEY_PATH) {
    return { status: 'not_configured', message: 'ESIGN_PRIVATE_KEY_PATH is required for cryptographic manifests.' };
  }
  return createESignManifest({
    signer_user_id: req.user.userId,
    signer_email: req.user.email,
    intent_string: `ICSR submission ${data.report.sender_safety_report_id || data.report.id}: ${signature.reason}`,
    signed_object: {
      icsr_id: data.report.id,
      case_id: data.report.case_id,
      receiver_id: data.report.receiver_id,
      sender_safety_report_id: data.report.sender_safety_report_id,
      xml,
    },
  });
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
  const [caseDrugs] = await pool.execute('SELECT * FROM case_drugs WHERE case_id = ? ORDER BY id ASC', [report.case_id]).catch(() => [[]]);
  const [causality] = await pool.execute('SELECT * FROM case_causality WHERE case_id = ? ORDER BY id ASC', [report.case_id]).catch(() => [[]]);
  const [meddraCodes] = await pool.execute(
    `SELECT c.*, t.code, t.term, t.level AS term_level
       FROM case_meddra_codes c LEFT JOIN meddra_terms t ON t.id = c.approved_term_id
      WHERE c.case_id = ? ORDER BY c.id ASC`,
    [report.case_id]
  ).catch(() => [[]]);
  const [contacts] = await pool.execute('SELECT * FROM case_contacts WHERE case_id = ? ORDER BY is_primary DESC, id ASC', [report.case_id]).catch(() => [[]]);
  const reporter = contacts.find(c => String(c.contact_role || '').toLowerCase() === 'reporter') || null;
  const patientContact = contacts.find(c => String(c.contact_role || '').toLowerCase() === 'patient') || null;
  report.seriousness_classification = safeJson(report.seriousness_classification, {});
  report.causality_per_drug = safeJson(report.causality_per_drug, {});
  const normalizedDrugs = caseDrugs.length ? caseDrugs.map(d => ({ ...d, drug_role: d.role, medicinal_product_name: d.drug_name_verbatim, route_of_admin: d.route_of_administration, batch_no: d.lot_number })) : drugs;
  const codedReactions = reactions.map(r => {
    const code = meddraCodes.find(c => String(c.ae_event_id || '') === String(r.ae_event_id || r.id || '')) || meddraCodes.find(c => String(c.verbatim_text || '').toLowerCase() === String(r.meddra_pt_name || '').toLowerCase());
    return code ? { ...r, meddra_pt: code.code || r.meddra_pt, meddra_pt_name: code.term || r.meddra_pt_name } : r;
  });
  return {
    report,
    drugs: normalizedDrugs,
    reactions: codedReactions,
    tests,
    history,
    causality,
    reporter: reporter ? { given_name: reporter.first_name, family_name: reporter.last_name, email: reporter.email, phone: reporter.phone, address: reporter.address, country: reporter.country } : {},
    patient: patientContact ? { name: [patientContact.first_name, patientContact.last_name].filter(Boolean).join(' '), sex: patientContact.sex, dob: patientContact.date_of_birth } : {},
  };
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
    const [[ae]] = await pool.execute('SELECT * FROM case_ae_intake WHERE case_id = ? LIMIT 1', [caseId]).catch(async () => [[]]);
    if (ae) {
      await pool.execute(
        `UPDATE icsr_reports SET seriousness_classification=?, narrative=COALESCE(NULLIF(narrative, ''), ?) WHERE id=?`,
        [
          JSON.stringify({
            death: !!ae.is_death,
            lifeThreatening: !!ae.is_life_threatening,
            hospitalization: !!ae.is_hospitalization || !!ae.is_prolonged_hospitalization,
            disability: !!ae.is_disability,
            congenitalAnomaly: !!ae.is_congenital_anomaly,
            otherMI: !!ae.is_other_medically_important,
          }),
          ae.reaction_description || null,
          result.insertId,
        ]
      );
      if (ae.suspect_drug_name) {
        await pool.execute(
          `INSERT INTO icsr_drugs (icsr_id, drug_role, medicinal_product_name, batch_no, dose_amount, route_of_admin, start_date, end_date)
           VALUES (?, 'suspect', ?, ?, ?, ?, ?, ?)`,
          [result.insertId, ae.suspect_drug_name, ae.batch_lot_number || null, ae.dose || null, ae.route_of_admin || null, ae.treatment_start_date || null, ae.treatment_stop_date || null]
        );
      }
      if (ae.reaction_description || ae.outcome) {
        await pool.execute(
          `INSERT INTO icsr_reactions (icsr_id, meddra_pt_name, onset_date, outcome, term_highlighted)
           VALUES (?, ?, ?, ?, 'y')`,
          [result.insertId, ae.reaction_description || 'Reaction', ae.reaction_onset_date || null, ae.outcome || null]
        );
      }
    }
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
    if (req.query.from)   { where += ' AND r.created_at >= ?'; params.push(req.query.from); }
    if (req.query.to)     { where += ' AND r.created_at <= ?'; params.push(`${req.query.to} 23:59:59`); }
    // B9 — server-side filter by case_id so the case-form ICSR tab doesn't pull
    // the whole tenant's report list every time it mounts.
    if (req.query.case_id) {
      const cid = Number(req.query.case_id);
      if (Number.isFinite(cid)) { where += ' AND r.case_id = ?'; params.push(cid); }
    }
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

router.get('/icsr/:id/xml-preview-redacted', ...adminOnly, async (req, res) => {
  try {
    const data = await loadIcsr(req.params.id, req);
    if (!data) return res.status(404).json({ error: 'ICSR not found.' });
    const raw = generateE2BXml(data);
    const redactedData = await redactPii({ report: data, ha_code: data.report.receiver_id });
    const redacted = generateE2BXml(redactedData.report);
    await audit(req, 'PII_REDACTION_PREVIEW', 'icsr_report', req.params.id, { rule_ids: redactedData.applied_rule_ids });
    res.json({ raw, redacted, applied_rule_ids: redactedData.applied_rule_ids });
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
    const validity = await assessCaseValidity({ orgId: data.report.org_id, caseId: data.report.case_id });
    if (validity?.blocking_for_submission) {
      return res.status(422).json({ error: `Validity ${validity.score}/4 — fix missing ICH validity elements before ICSR submission.`, validity });
    }
    const signature = await verifyElectronicSignature(req, 'ICSR_SUBMIT', req.params.id);
    const redactedData = await redactPii({ report: data, ha_code: data.report.receiver_id });
    const xml = generateE2BXml(redactedData.report);
    const manifest = await createSubmissionManifest(req, data, xml, signature);
    const configured = await getGatewayConfig(data.report.org_id, data.report.receiver_id);
    const gatewayName = String(req.body.gateway || configured.mode || data.report.receiver_id || 'mock').toLowerCase();
    const gateway = require(`../../services/pv/gateways/${['fda','ema','pmda','mhra'].includes(gatewayName) ? gatewayName : 'mock'}`);
    const result = await gateway.submit(xml, { ...configured, ...(req.body.config || {}) });
    await pool.execute('UPDATE icsr_reports SET status="submitted", submission_count=submission_count+1, last_submitted_at=CURRENT_TIMESTAMP, gateway_message_id=? WHERE id=?', [result.gateway_id || null, req.params.id]);
    await pool.execute(
      `INSERT INTO transmission_audit_trail (case_id, user_id, user_name, target_system, payload_summary, status, response_code)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.report.case_id, req.user.userId, req.user.email, `ICSR-${data.report.receiver_id}`, xml.slice(0, 1000), result.status || 'submitted', result.gateway_id || null]
    );
    await audit(req, 'SUBMIT', 'icsr_report', req.params.id, { gateway: gatewayName, gateway_id: result.gateway_id, manifest_id: manifest.manifest_id || null, pii_redaction_rule_ids: redactedData.applied_rule_ids });
    res.json({ status: 'submitted', gateway: result, e_sign_manifest: manifest });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

router.post('/icsr/:id/acknowledgements', ...adminOnly, async (req, res) => {
  try {
    const data = await loadIcsr(req.params.id, req);
    if (!data) return res.status(404).json({ error: 'ICSR not found.' });
    const ackXml = req.body.ack_xml || '';
    const parsed = parseAck(ackXml);
    await pool.execute(
      `INSERT INTO icsr_e2b_acknowledgements (icsr_id, ack_xml, ack_status, ack_received_at, ack_validation_errors, gateway)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?)`,
      [req.params.id, ackXml, parsed.ack_status, JSON.stringify(parsed.errors || []), req.body.gateway || data.report.receiver_id]
    );
    await pool.execute(
      'UPDATE icsr_reports SET status=?, last_ack_at=CURRENT_TIMESTAMP, ack_error_summary=? WHERE id=?',
      [parsed.report_status, parsed.errors.join('; ').slice(0, 1000) || null, req.params.id]
    );
    await audit(req, 'ACK_PARSE', 'icsr_report', req.params.id, parsed);
    res.json(parsed);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/icsr/:id/ack/:level', ...adminOnly, async (req, res) => {
  try {
    const data = await loadIcsr(req.params.id, req);
    if (!data) return res.status(404).json({ error: 'ICSR not found.' });
    const requestedLevel = String(req.params.level || '').toUpperCase();
    if (!['ACK1', 'ACK2', 'ACK3'].includes(requestedLevel)) return res.status(400).json({ error: 'level must be ACK1, ACK2, or ACK3.' });
    const ackXml = req.body.ack_xml || '';
    const parsed = { ...parseAck(ackXml), level: requestedLevel };
    await pool.execute(
      `INSERT INTO icsr_acknowledgements (org_id, icsr_report_id, level, received_at, ack_status, ack_code, ack_xml, details_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.report.org_id, req.params.id, requestedLevel, req.body.received_at || new Date(), parsed.ack_status, parsed.ack_code || null, ackXml, JSON.stringify(parsed)]
    );
    if (requestedLevel === 'ACK3') {
      await pool.execute('UPDATE icsr_reports SET status=?, last_ack_at=CURRENT_TIMESTAMP, ack_error_summary=? WHERE id=?', [parsed.report_status, (parsed.errors || []).join('; ').slice(0, 1000) || null, req.params.id]);
    } else {
      await pool.execute('UPDATE icsr_reports SET last_ack_at=CURRENT_TIMESTAMP WHERE id=?', [req.params.id]);
    }
    await audit(req, `ACK_${requestedLevel}`, 'icsr_report', req.params.id, parsed);
    res.json(parsed);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/pv/periodic-reports/generate', ...adminOnly, async (req, res) => {
  try {
    const orgId = req.body.org_id || req.user.orgId;
    const result = await generatePeriodicReport({
      orgId,
      productName: req.body.product_name,
      reportType: req.body.report_type || 'PSUR',
      from: req.body.from,
      to: req.body.to,
      userId: req.user.userId,
    });
    await audit(req, 'GENERATE', 'pv_periodic_report', result.id, req.body);
    res.status(201).json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/pv/periodic-reports', ...adminOnly, async (req, res) => {
  try {
    const scope = orgScope(req, 'p');
    const [rows] = await pool.execute(`SELECT * FROM pv_periodic_reports p WHERE ${scope.sql} ORDER BY created_at DESC LIMIT 100`, scope.params);
    res.json({ rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/pv/signals/run', ...adminOnly, async (req, res) => {
  try {
    const created = await runSignalDetection(req.body.org_id || req.user.orgId);
    await audit(req, 'RUN', 'pv_signal_detection', null, { created: created.length });
    res.json({ created });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/pv/signals', ...adminOnly, async (req, res) => {
  try {
    const scope = orgScope(req, 's');
    const [rows] = await pool.execute(`SELECT * FROM pv_signal_reviews s WHERE ${scope.sql} ORDER BY created_at DESC LIMIT 100`, scope.params);
    res.json({ rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/icsr/:id/follow-up', ...adminOnly, async (req, res) => {
  try {
    const result = await createFollowup(req.params.id, req.user.userId);
    if (!result) return res.status(404).json({ error: 'ICSR not found.' });
    await audit(req, 'FOLLOW_UP', 'icsr_report', result.id, { parent_submission_id: Number(req.params.id) });
    res.status(201).json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/icsr/:id/amend', ...adminOnly, async (req, res) => {
  try {
    const result = await createAmendment(req.params.id, req.user.userId);
    if (!result) return res.status(404).json({ error: 'ICSR not found.' });
    await audit(req, 'AMENDMENT', 'icsr_report', result.id, { parent_submission_id: Number(req.params.id) });
    res.status(201).json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/icsr/:id/nullify', ...adminOnly, async (req, res) => {
  try {
    const signature = await verifyElectronicSignature(req, 'ICSR_NULLIFY', req.params.id);
    const result = await createNullification(req.params.id, req.body.reason || signature.reason, req.user.userId);
    if (!result) return res.status(404).json({ error: 'ICSR not found.' });
    await audit(req, 'NULLIFICATION', 'icsr_report', result.id, { parent_submission_id: Number(req.params.id), reason: req.body.reason || signature.reason });
    res.status(201).json(result);
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

router.get('/icsr/:id/timeline', ...adminOnly, async (req, res) => {
  try {
    const [auditRows] = await pool.execute(`SELECT * FROM audit_logs WHERE entity = 'icsr_report' AND entity_id = ? ORDER BY created_at ASC`, [req.params.id]);
    const [acks] = await pool.execute('SELECT * FROM icsr_e2b_acknowledgements WHERE icsr_id = ? ORDER BY ack_received_at ASC', [req.params.id]);
    res.json({ timeline: [...auditRows.map(r => ({ type: 'audit', ...r })), ...acks.map(r => ({ type: 'ack', ...r }))].sort((a, b) => new Date(a.created_at || a.ack_received_at) - new Date(b.created_at || b.ack_received_at)) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
