'use strict';

/**
 * AE/PC handoff endpoints — the Transmission screen's backend.
 *
 * The handoff lives on its own screen, after the case is saved (locked with
 * Rohith 2026-07-28). These routes serve that screen: what the payload will
 * look like, whether the case is allowed to leave, where it can go, and what
 * has already been sent.
 */

const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { authenticate, requireCapability } = require('../middleware/auth');
const { hasGlobalAdminScope } = require('../utils/adminScope');
const handoff = require('../services/caseHandoffService');
const { generateE2BXml } = require('../services/pv/e2bGenerator');
const { validateE2BXml } = require('../services/pv/e2bValidator');
const { sha256 } = require('../services/eSignManifestService');
const { writeCaseAudit } = require('../services/caseHelpers');

// Same org gate as caseValidity: a case id alone must never be enough to read
// or transmit another tenant's case.
async function orgForCase(caseId, req) {
  const [[row]] = await pool.execute(
    'SELECT org_id, case_type FROM cases WHERE id = ? AND is_deleted = 0 LIMIT 1',
    [caseId]
  );
  if (!row) return null;
  if (!hasGlobalAdminScope(req.user) && Number(row.org_id) !== Number(req.user.orgId)) return null;
  return row;
}

router.get('/cases/:caseId/handoff', authenticate, async (req, res) => {
  try {
    const owner = await orgForCase(req.params.caseId, req);
    if (!owner) return res.status(404).json({ error: 'Case not found.' });

    const caseId = Number(req.params.caseId);
    const orgId = owner.org_id;

    const [built, readiness, targets, history] = await Promise.all([
      handoff.buildPayload({ orgId, caseId }),
      handoff.assessReadiness({ orgId, caseId, caseType: owner.case_type }),
      handoff.listTargets({ orgId, caseType: owner.case_type }),
      handoff.listTransmissions({ caseId }),
    ]);

    if (!built) return res.status(404).json({ error: 'Case not found.' });
    const deadline = await handoff.handoffDeadline({
      orgId, caseId, caseType: owner.case_type, awarenessDate: built.payload?.case?.awareness_date, history,
    });

    res.json({
      case_type: owner.case_type,
      eligible: ['AE', 'PC'].includes(owner.case_type),
      payload_version: handoff.PAYLOAD_VERSION,
      readiness,
      deadline,
      payload: built.payload,
      targets: targets.map(t => ({ id: t.id, type: t.integration_type, endpoint: t.endpoint_url })),
      history,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sending to the safety system needs Create transmission (access review).
router.post('/cases/:caseId/handoff/transmit', authenticate, requireCapability('transmission.create'), async (req, res) => {
  try {
    const owner = await orgForCase(req.params.caseId, req);
    if (!owner) return res.status(404).json({ error: 'Case not found.' });

    const result = await handoff.transmit({
      orgId: owner.org_id,
      caseId: Number(req.params.caseId),
      userId: req.user.userId || req.user.id || null,
      userName: req.user.name || req.user.email || 'System',
      targetSystem: req.body?.target_system,
    });

    return res.status(result.status).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── FEATURE 2: AUTOMATED SAFETY TRANSMISSION GATEWAY (E2B-R3 OPTION A) ──────

async function buildIcsrFromCase(caseId, orgId) {
  const [[c]] = await pool.execute('SELECT * FROM cases WHERE id = ?', [caseId]);
  if (!c) return null;

  // Contacts
  const [contacts] = await pool.execute('SELECT * FROM case_contacts WHERE case_id = ? ORDER BY is_primary DESC', [caseId]).catch(() => [[]]);
  const reporter = contacts.find(co => String(co.contact_role || '').toLowerCase() === 'reporter') || contacts[0] || {};
  const patientContact = contacts.find(co => String(co.contact_role || '').toLowerCase() === 'patient') || {};

  // AE version data
  const [[versionPatient]] = await pool.execute(
    `SELECT p.* FROM case_ae_patient_info p JOIN case_ae_versions v ON v.id = p.version_id
      WHERE v.case_id = ? ORDER BY v.version_number DESC, p.id DESC LIMIT 1`, [caseId]).catch(() => [[null]]);
  const [[intakePatient]] = await pool.execute('SELECT * FROM case_patient WHERE case_id = ? ORDER BY id DESC LIMIT 1', [caseId]).catch(() => [[null]]);

  // Events / Reactions
  const [events] = await pool.execute(
    `SELECT e.* FROM case_ae_events e JOIN case_ae_versions v ON v.id = e.version_id
      WHERE v.case_id = ? ORDER BY v.version_number DESC, e.id ASC`, [caseId]).catch(() => [[]]);

  // Products / Drugs
  const [caseDrugs] = await pool.execute('SELECT * FROM case_drugs WHERE case_id = ? ORDER BY id ASC', [caseId]).catch(() => [[]]);
  const [aeProducts] = await pool.execute(
    `SELECT p.* FROM case_ae_products p JOIN case_ae_versions v ON v.id = p.version_id
      WHERE v.case_id = ? ORDER BY v.version_number DESC, p.id ASC`, [caseId]).catch(() => [[]]);

  const drugs = caseDrugs.length
    ? caseDrugs.map(d => ({
        drug_role: d.role || 'suspect',
        medicinal_product_name: d.drug_name_verbatim || d.trade_name || 'Suspect Product',
        active_substance: d.active_substance || '',
        dose_amount: d.dose_amount || '',
        dose_unit: d.dose_unit || '',
        route_of_admin: d.route_of_administration || '',
        batch_no: d.lot_number || '',
        start_date: d.start_date || null,
        end_date: d.end_date || null,
      }))
    : aeProducts.length
      ? aeProducts.map(p => ({
          drug_role: p.product_role || 'suspect',
          medicinal_product_name: p.product_name || 'Suspect Product',
          active_substance: p.active_substance || '',
          dose_amount: p.dose_amount || '',
          dose_unit: p.dose_unit || '',
          batch_no: p.batch_number || '',
          start_date: p.start_date || null,
          end_date: p.end_date || null,
        }))
      : [{
          drug_role: 'suspect',
          medicinal_product_name: c.product_name || 'Suspect Product',
          active_substance: '',
        }];

  const reactions = events.length
    ? events.map(e => ({
        reaction_verbatim: e.event_verbatim || e.event_description || 'Adverse reaction',
        meddra_pt: e.meddra_pt_code || '',
        meddra_pt_name: e.meddra_pt_name || e.event_verbatim || 'Adverse reaction',
        onset_date: e.onset_date || c.awareness_date || null,
        outcome: e.outcome || '',
      }))
    : [{
        reaction_verbatim: c.adverse_event_description || c.title || 'Adverse reaction',
        meddra_pt_name: c.adverse_event_description || 'Adverse reaction',
        onset_date: c.awareness_date || null,
      }];

  const patient = versionPatient
    ? {
        initials: versionPatient.patient_initials || '',
        dob: versionPatient.date_of_birth || null,
        sex: versionPatient.sex || '',
        age: versionPatient.age || '',
        age_unit: versionPatient.age_unit || '',
      }
    : intakePatient
      ? {
          initials: intakePatient.initials || '',
          sex: intakePatient.gender || '',
          age: intakePatient.age || '',
          age_unit: intakePatient.age_unit || '',
        }
      : {
          initials: [patientContact.first_name?.[0], patientContact.last_name?.[0]].filter(Boolean).join('') || 'UNK',
          sex: patientContact.gender || 'unknown',
        };

  const report = {
    sender_safety_report_id: c.case_number || `AE-${caseId}`,
    safety_report_version: '1',
    received_date: c.received_date || c.created_at,
    receipt_date: c.created_at,
    seriousness: c.is_serious ? '1' : '2',
    org_id: orgId,
    case_id: caseId,
    patient_sex: patient.sex,
    patient_initials: patient.initials,
  };

  return {
    report,
    patient,
    reporter: {
      given_name: reporter.first_name || 'Reporter',
      family_name: reporter.last_name || '',
      email: reporter.email || '',
      country: reporter.country || 'US',
    },
    drugs,
    reactions,
    tests: [],
    history: [],
  };
}

// Validate case data against ICH E2B(R3) schema
router.get('/cases/:caseId/e2b/validate', authenticate, async (req, res) => {
  try {
    const owner = await orgForCase(req.params.caseId, req);
    if (!owner) return res.status(404).json({ error: 'Case not found.' });

    const icsrData = await buildIcsrFromCase(Number(req.params.caseId), owner.org_id);
    if (!icsrData) return res.status(404).json({ error: 'Could not assemble ICSR data.' });

    const xml = generateE2BXml(icsrData);
    const errors = validateE2BXml(xml);

    // Also check the four core pharmacovigilance factors
    const fourFactors = {
      patient: !!(icsrData.patient?.initials || icsrData.patient?.dob || icsrData.patient?.sex),
      reporter: !!(icsrData.reporter?.given_name || icsrData.reporter?.email),
      suspect_drug: icsrData.drugs.length > 0 && !!icsrData.drugs[0].medicinal_product_name,
      reaction: icsrData.reactions.length > 0 && !!icsrData.reactions[0].reaction_verbatim,
    };

    if (!fourFactors.patient) errors.push({ path: '/patient', reason: 'Patient identifier or demographics missing' });
    if (!fourFactors.reporter) errors.push({ path: '/primarysource', reason: 'Reporter details missing' });
    if (!fourFactors.suspect_drug) errors.push({ path: '/drug', reason: 'Suspect drug missing' });
    if (!fourFactors.reaction) errors.push({ path: '/reaction', reason: 'Adverse reaction description missing' });

    res.json({
      case_id: Number(req.params.caseId),
      valid: errors.length === 0,
      four_factors: fourFactors,
      errors,
      xml_preview: xml,
      summary: {
        report_id: icsrData.report.sender_safety_report_id,
        drugs_count: icsrData.drugs.length,
        reactions_count: icsrData.reactions.length,
        patient_initials: icsrData.patient?.initials || 'Not provided',
        reporter: `${icsrData.reporter?.given_name || ''} ${icsrData.reporter?.family_name || ''}`.trim(),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download cryptographically sealed E2B(R3) XML package
router.get('/cases/:caseId/e2b/export', authenticate, async (req, res) => {
  try {
    const owner = await orgForCase(req.params.caseId, req);
    if (!owner) return res.status(404).json({ error: 'Case not found.' });

    const icsrData = await buildIcsrFromCase(Number(req.params.caseId), owner.org_id);
    if (!icsrData) return res.status(404).json({ error: 'Could not assemble ICSR data.' });

    const xml = generateE2BXml(icsrData);
    const errors = validateE2BXml(xml);

    if (errors.length > 0) {
      return res.status(422).json({
        error: 'E2B(R3) schema validation failed. Please correct missing mandatory fields before exporting.',
        errors,
      });
    }

    const xmlHash = sha256(xml);

    // Audit trail logging
    try {
      await writeCaseAudit(
        Number(req.params.caseId),
        req.user.userId || null,
        req.user.email || 'System',
        'E2B_R3_EXPORTED',
        'e2b_transmission',
        null,
        `Exported E2B(R3) XML package. SHA-256: ${xmlHash}`
      );
    } catch (_) {}

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${icsrData.report.sender_safety_report_id || `case-${req.params.caseId}`}-e2b-r3.xml"`);
    res.setHeader('X-E2B-Checksum', xmlHash);
    return res.send(xml);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
