'use strict';

/**
 * caseHandoffService.js — AE/PC handoff to an external safety or quality system.
 *
 * Product boundary locked with Rohith 2026-07-28: MIMS is a medical information
 * and intake system, NOT a safety database. It captures the case, validates it,
 * and hands it off. MedDRA coding, company causality assessment, regulatory
 * reporting clocks and E2B(R3) generation all belong to the receiving system.
 *
 * Architecture rule (Anirudh): ONE canonical intake payload, fixed across every
 * target — Argus, Veeva Vault Safety, ArisGlobal, or anything else — because the
 * regulatory minimum data set is common to all of them. Only the field MAPPING
 * and the TRANSPORT vary per org, and those are configuration, not code. Adding
 * a new target must never mean editing this file.
 *
 * This deliberately does NOT emit E2B(R3): E2B mandates MedDRA-coded reaction
 * terms and there is no MSSO licence (Rohith, 2026-07-28). Reaction text travels
 * verbatim and the receiving system codes it.
 */

const pool = require('../database/db');
const { assess } = require('./caseValidityService');
const { fireIntegrationEvent } = require('./integrationEngine');

const PAYLOAD_VERSION = 'mims-canonical-intake/v1';

async function _rows(sql, params) {
  try { const [rows] = await pool.execute(sql, params); return rows; }
  catch (err) {
    // A source table that does not exist on an older schema is tolerable. A
    // column that does not exist is schema drift and must be visible — the case
    // timeline spent months silently empty because that distinction was missing.
    if (err.code !== 'ER_NO_SUCH_TABLE') {
      console.error(`caseHandoffService: query failed — ${err.code}: ${err.message}`);
    }
    return [];
  }
}

async function _one(sql, params) {
  const rows = await _rows(sql, params);
  return rows[0] || null;
}

/**
 * PC cases do not have an adverse event, so the ICH four-element test does not
 * apply. A product complaint needs a reporter we can go back to, an identifiable
 * product, and a description of what went wrong.
 */
async function _assessComplaintReadiness(caseId) {
  const reporter = await _one(
    `SELECT id FROM case_contacts
      WHERE case_id = ? AND LOWER(contact_role) = 'reporter'
        AND (email IS NOT NULL OR phone IS NOT NULL)
      ORDER BY is_primary DESC, id ASC LIMIT 1`,
    [caseId]
  );
  const intake = await _one(
    'SELECT product_name, complaint_description FROM case_pc_intake WHERE case_id = ? ORDER BY id DESC LIMIT 1',
    [caseId]
  );
  const general = await _one(
    `SELECT g.complaint_description
       FROM case_pc_versions v JOIN case_pc_general g ON g.version_id = v.id
      WHERE v.case_id = ? ORDER BY v.id DESC LIMIT 1`,
    [caseId]
  );

  const productName = intake?.product_name || null;
  const complaint = intake?.complaint_description || general?.complaint_description || null;

  const elements = [
    {
      key: 'reporter',
      satisfied: !!reporter,
      reason: reporter ? 'Reporter has email or phone.' : 'Reporter with email or phone is missing.',
    },
    {
      key: 'product',
      satisfied: !!productName,
      reason: productName ? 'Product is identified.' : 'Product name is missing.',
    },
    {
      key: 'complaint',
      satisfied: !!complaint,
      reason: complaint ? 'Complaint description exists.' : 'Complaint description is missing.',
    },
  ];
  const score = elements.filter(e => e.satisfied).length;
  return { score, required: elements.length, elements, blocking_for_submission: score < elements.length };
}

/**
 * Readiness for handoff. AE reuses caseValidityService so there is exactly one
 * implementation of the ICH validity test in the codebase.
 */
async function assessReadiness({ orgId, caseId, caseType }) {
  if (caseType === 'PC') return _assessComplaintReadiness(caseId);
  const validity = await assess({ orgId, caseId });
  if (!validity) return null;
  return { ...validity, required: 4 };
}

async function buildPayload({ orgId, caseId }) {
  const caseRow = await _one(
    `SELECT c.*, o.name AS org_name
       FROM cases c LEFT JOIN organisations o ON o.id = c.org_id
      WHERE c.id = ? AND c.org_id = ? AND c.is_deleted = 0 LIMIT 1`,
    [caseId, orgId]
  );
  if (!caseRow) return null;

  const reporter = await _one(
    `SELECT first_name, last_name, email, phone, qualification, reporter_type,
            COALESCE(country_of_reporter, country) AS country, institution
       FROM case_contacts
      WHERE case_id = ? AND LOWER(contact_role) = 'reporter'
      ORDER BY is_primary DESC, id ASC LIMIT 1`,
    [caseId]
  );

  // Patient identity can live on the AE version record or on the simpler
  // case_patient row, depending on how the case was created.
  const aePatient = await _one(
    `SELECT p.patient_initials, p.date_of_birth, p.age, p.age_unit, p.sex,
            p.weight_kg, p.height_cm, p.pregnant, p.patient_country
       FROM case_ae_versions v JOIN case_ae_patient_info p ON p.version_id = v.id
      WHERE v.case_id = ? ORDER BY v.version_number DESC LIMIT 1`,
    [caseId]
  );
  const simplePatient = await _one(
    'SELECT initials, age, age_unit, gender, weight_kg FROM case_patient WHERE case_id = ? ORDER BY id DESC LIMIT 1',
    [caseId]
  );

  const patient = aePatient
    ? {
        initials: aePatient.patient_initials, date_of_birth: aePatient.date_of_birth,
        age: aePatient.age, age_unit: aePatient.age_unit, sex: aePatient.sex,
        weight_kg: aePatient.weight_kg, height_cm: aePatient.height_cm,
        pregnant: aePatient.pregnant, country: aePatient.patient_country,
      }
    : simplePatient
      ? {
          initials: simplePatient.initials, age: simplePatient.age,
          age_unit: simplePatient.age_unit, sex: simplePatient.gender,
          weight_kg: simplePatient.weight_kg,
        }
      : null;

  // Drugs: the structured case_drugs table when present, otherwise the AE
  // version's product info, otherwise the flat intake row.
  let drugs = await _rows(
    `SELECT drug_name_verbatim AS name, role, dose_amount AS dose, dose_unit,
            route_of_administration AS route, indication, start_date, end_date,
            action_taken, drug_reaction_recurrence AS rechallenge, lot_number
       FROM case_drugs WHERE case_id = ? ORDER BY id ASC`,
    [caseId]
  );
  if (!drugs.length) {
    drugs = await _rows(
      `SELECT p.product_name AS name,
              CASE WHEN p.is_suspect = 1 THEN 'suspect' ELSE 'concomitant' END AS role,
              p.dose, p.dose_unit, p.route_of_admin AS route, p.indication,
              p.start_date, p.end_date, p.action_taken, p.rechallenge,
              p.batch_lot_number AS lot_number
         FROM case_ae_versions v JOIN case_ae_product_info p ON p.version_id = v.id
        WHERE v.case_id = ? ORDER BY v.version_number DESC, p.id ASC`,
      [caseId]
    );
  }

  const aeIntake = await _one(
    `SELECT suspect_drug_name, batch_lot_number, dose, route_of_admin,
            treatment_start_date, treatment_stop_date, reaction_description,
            reaction_onset_date, outcome, is_serious, is_death, is_life_threatening,
            is_hospitalization, is_prolonged_hospitalization, is_disability,
            is_congenital_anomaly, is_other_medically_important
       FROM case_ae_intake WHERE case_id = ? ORDER BY id DESC LIMIT 1`,
    [caseId]
  );

  if (!drugs.length && aeIntake?.suspect_drug_name) {
    drugs = [{
      name: aeIntake.suspect_drug_name, role: 'suspect', dose: aeIntake.dose,
      dose_unit: null, route: aeIntake.route_of_admin, indication: null,
      start_date: aeIntake.treatment_start_date, end_date: aeIntake.treatment_stop_date,
      action_taken: null, rechallenge: null, lot_number: aeIntake.batch_lot_number,
    }];
  }

  // Reaction terms travel VERBATIM. No MedDRA code is emitted — the receiving
  // safety system owns coding (no MSSO licence, locked 2026-07-28).
  let events = await _rows(
    `SELECT e.event_description AS description_verbatim, e.outcome,
            e.reported_causality, e.start_date AS onset_date, e.end_date,
            e.is_serious, e.is_death, e.is_life_threatening, e.is_hospitalization,
            e.is_disability, e.is_congenital_anomaly, e.is_other_medically_important
       FROM case_ae_versions v JOIN case_ae_events e ON e.version_id = v.id
      WHERE v.case_id = ? ORDER BY v.version_number DESC, e.id ASC`,
    [caseId]
  );
  if (!events.length && aeIntake?.reaction_description) {
    events = [{
      description_verbatim: aeIntake.reaction_description,
      outcome: aeIntake.outcome, reported_causality: null,
      onset_date: aeIntake.reaction_onset_date, end_date: null,
      is_serious: aeIntake.is_serious, is_death: aeIntake.is_death,
      is_life_threatening: aeIntake.is_life_threatening,
      is_hospitalization: aeIntake.is_hospitalization,
      is_disability: aeIntake.is_disability,
      is_congenital_anomaly: aeIntake.is_congenital_anomaly,
      is_other_medically_important: aeIntake.is_other_medically_important,
    }];
  }

  const pcIntake = await _one(
    `SELECT product_name, batch_lot_number, expiry_date, purchase_date,
            complaint_category, complaint_description, sample_available,
            sample_return_requested
       FROM case_pc_intake WHERE case_id = ? ORDER BY id DESC LIMIT 1`,
    [caseId]
  );

  const payload = {
    payload_version: PAYLOAD_VERSION,
    source: {
      system: 'MIMS',
      org_id: caseRow.org_id,
      org_name: caseRow.org_name || null,
      case_id: caseRow.id,
      case_number: caseRow.case_number,
    },
    case: {
      type: caseRow.case_type,
      secondary_type: caseRow.secondary_case_type || null,
      // Day 0 for the regulatory clock is the day MIMS became aware, NOT the day
      // the receiving system ingests this. It is non-delegable (GVP Module VI)
      // and must travel with the case.
      awareness_date: caseRow.awareness_date || caseRow.date_received || null,
      date_received: caseRow.date_received || null,
      intake_channel: caseRow.intake_channel || null,
      priority: caseRow.priority || null,
      narrative: caseRow.description || null,
    },
    reporter: reporter
      ? {
          name: [reporter.first_name, reporter.last_name].filter(Boolean).join(' ') || null,
          email: reporter.email, phone: reporter.phone,
          qualification: reporter.qualification, type: reporter.reporter_type,
          country: reporter.country, institution: reporter.institution,
        }
      : null,
    patient,
    drugs,
    events,
    complaint: pcIntake || null,
    coding: {
      // Stated explicitly so a receiving system never mistakes absence for an
      // omission: MIMS does not code, by design.
      meddra: null,
      whodrug: null,
      note: 'Verbatim only — coding is performed by the receiving safety system.',
    },
  };

  return { caseRow, payload };
}

/**
 * Hand the case off. Blocked unless the case is valid — a safety system that
 * ACCEPTS a malformed case is worse than one that rejects it, because the bad
 * record enters the system of record.
 */
async function transmit({ orgId, caseId, userId, userName, targetSystem }) {
  const built = await buildPayload({ orgId, caseId });
  if (!built) return { ok: false, status: 404, error: 'Case not found.' };

  const { caseRow, payload } = built;
  if (!['AE', 'PC'].includes(caseRow.case_type)) {
    return { ok: false, status: 400, error: 'Only AE and PC cases are handed off to an external system.' };
  }

  const readiness = await assessReadiness({ orgId, caseId, caseType: caseRow.case_type });
  if (!readiness || readiness.blocking_for_submission) {
    return {
      ok: false,
      status: 422,
      error: `Case is not valid for handoff (${readiness?.score ?? 0}/${readiness?.required ?? 4}). Complete the missing elements first.`,
      readiness,
    };
  }

  const target = String(targetSystem || '').trim() || 'external_safety_system';
  const eventType = caseRow.case_type === 'AE' ? 'case.ae.handoff' : 'case.pc.handoff';

  let status = 'SENT';
  let responseCode = 200;
  try {
    const results = await fireIntegrationEvent(orgId, eventType, payload);
    // fireIntegrationEvent returns [] when no integration subscribes to the
    // event. That is not a success — nothing left MIMS — and recording it as
    // SENT would be the exact "wrote a row, called it done" failure §26 exists
    // to prevent.
    if (!results.length) {
      status = 'NO_TARGET';
      responseCode = 0;
    } else if (!results.some(r => r.status === 'fulfilled' && r.value === true)) {
      status = 'FAILED';
      responseCode = 502;
    }
  } catch (err) {
    status = 'FAILED';
    responseCode = 500;
    console.error('caseHandoffService.transmit error:', err.message);
  }

  const summary = JSON.stringify({
    payload_version: PAYLOAD_VERSION,
    case_number: caseRow.case_number,
    case_type: caseRow.case_type,
    awareness_date: payload.case.awareness_date,
    drugs: payload.drugs.length,
    events: payload.events.length,
    validity: `${readiness.score}/${readiness.required}`,
  }).slice(0, 4000);

  await pool.execute(
    `INSERT INTO transmission_audit_trail
       (case_id, user_id, user_name, target_system, payload_summary, status, response_code, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [caseId, userId || null, userName || 'System', target, summary, status, responseCode]
  );

  await pool.execute(
    `INSERT INTO case_audit_trail (case_id, user_id, user_name, action_type, field_name, old_value, new_value, timestamp)
     VALUES (?, ?, ?, 'CASE_HANDOFF', 'transmission', NULL, ?, NOW())`,
    [caseId, userId || null, userName || 'System', `${target}: ${status}`]
  );

  if (status !== 'SENT') {
    return {
      ok: false,
      status: status === 'NO_TARGET' ? 409 : 502,
      error: status === 'NO_TARGET'
        ? 'No enabled integration subscribes to this handoff event. Configure a target before transmitting.'
        : 'The receiving system did not accept the handoff. The attempt is recorded in the audit trail.',
      transmission_status: status,
    };
  }

  return { ok: true, status: 200, transmission_status: status, target_system: target, readiness };
}

async function listTransmissions({ caseId }) {
  return _rows(
    `SELECT id, target_system, status, response_code, payload_summary, user_name, timestamp
       FROM transmission_audit_trail WHERE case_id = ? ORDER BY timestamp DESC LIMIT 50`,
    [caseId]
  );
}

/** Enabled integrations for the org, as candidate handoff targets. */
async function listTargets({ orgId }) {
  return _rows(
    'SELECT id, integration_type, endpoint_url, event_triggers FROM org_integrations WHERE org_id = ? AND enabled = 1',
    [orgId]
  );
}

module.exports = { buildPayload, assessReadiness, transmit, listTransmissions, listTargets, PAYLOAD_VERSION };
