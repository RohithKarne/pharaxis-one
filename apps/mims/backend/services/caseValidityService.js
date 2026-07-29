'use strict';

const pool = require('../database/db');

async function assess({ orgId, caseId }) {
  const [[caseRow]] = await pool.execute('SELECT * FROM cases WHERE id = ? AND org_id = ? LIMIT 1', [caseId, orgId]);
  if (!caseRow) return null;
  const [[reporter]] = await pool.execute(
    `SELECT id, email, phone FROM case_contacts WHERE case_id = ? AND LOWER(contact_role) = 'reporter' AND (email IS NOT NULL OR phone IS NOT NULL) ORDER BY is_primary DESC, id ASC LIMIT 1`,
    [caseId]
  );
  // Patient identity is stored in three different places depending on how the
  // case was created: a patient contact, the AE version's patient record, or the
  // flat case_patient row. Checking only case_contacts made the validity gate
  // fail cases that DO have an identifiable patient — a false block, which is
  // worse than no gate because it trains people to ignore it.
  const [[patient]] = await pool.execute(
    `SELECT id FROM case_contacts WHERE case_id = ? AND LOWER(contact_role) = 'patient' ORDER BY is_primary DESC, id ASC LIMIT 1`,
    [caseId]
  );
  let patientRow = patient || null;
  if (!patientRow) {
    const [[aePatient]] = await pool.execute(
      `SELECT p.id FROM case_ae_versions v JOIN case_ae_patient_info p ON p.version_id = v.id
        WHERE v.case_id = ? AND (p.patient_initials IS NOT NULL OR p.age IS NOT NULL OR p.sex IS NOT NULL)
        ORDER BY v.version_number DESC LIMIT 1`,
      [caseId]
    ).catch(() => [[null]]);
    patientRow = aePatient || null;
  }
  if (!patientRow) {
    const [[flatPatient]] = await pool.execute(
      `SELECT id FROM case_patient WHERE case_id = ? AND (initials IS NOT NULL OR age IS NOT NULL OR gender IS NOT NULL)
        ORDER BY id DESC LIMIT 1`,
      [caseId]
    ).catch(() => [[null]]);
    patientRow = flatPatient || null;
  }
  const [[event]] = await pool.execute(
    `SELECT e.id, e.event_description
       FROM case_ae_versions v JOIN case_ae_events e ON e.version_id = v.id
      WHERE v.case_id = ? AND e.event_description IS NOT NULL AND e.event_description <> ''
      ORDER BY v.version_number DESC, e.id ASC LIMIT 1`,
    [caseId]
  );
  const [[product]] = await pool.execute(
    `SELECT id, drug_name_verbatim AS product_name FROM case_drugs WHERE case_id = ? AND role IN ('suspect','co_suspect') ORDER BY id ASC LIMIT 1`,
    [caseId]
  ).catch(async () => {
    const [[fallback]] = await pool.execute(
      `SELECT p.id, p.product_name FROM case_ae_versions v JOIN case_ae_product_info p ON p.version_id = v.id WHERE v.case_id = ? AND p.product_name IS NOT NULL AND p.product_name <> '' ORDER BY v.version_number DESC, p.id ASC LIMIT 1`,
      [caseId]
    );
    return [[fallback]];
  });

  // Same reasoning as the patient lookup: the suspect drug can arrive on the
  // flat AE intake row rather than case_drugs or the AE version's product info.
  let productRow = product || null;
  if (!productRow) {
    const [[intakeDrug]] = await pool.execute(
      `SELECT id, suspect_drug_name AS product_name FROM case_ae_intake
        WHERE case_id = ? AND suspect_drug_name IS NOT NULL AND suspect_drug_name <> ''
        ORDER BY id DESC LIMIT 1`,
      [caseId]
    ).catch(() => [[null]]);
    productRow = intakeDrug || null;
  }

  // Third instance of the same pattern: a case created through the quick intake
  // path stores the reaction on case_ae_intake, not on an AE version. Requiring
  // the version record made complete cases read as invalid.
  let eventRow = event || null;
  if (!eventRow) {
    const [[intakeEvent]] = await pool.execute(
      `SELECT id, reaction_description AS event_description FROM case_ae_intake
        WHERE case_id = ? AND reaction_description IS NOT NULL AND reaction_description <> ''
        ORDER BY id DESC LIMIT 1`,
      [caseId]
    ).catch(() => [[null]]);
    eventRow = intakeEvent || null;
  }

  const elements = [
    { key: 'reporter', satisfied: !!reporter, source: reporter ? `case_contacts.id=${reporter.id}` : null, reason: reporter ? 'Reporter has email or phone.' : 'Reporter with email or phone is missing.' },
    { key: 'patient', satisfied: !!patientRow, source: patientRow ? `patient.id=${patientRow.id}` : null, reason: patientRow ? 'Identifiable patient exists.' : 'Identifiable patient is missing.' },
    { key: 'product', satisfied: !!productRow, source: productRow ? `product.id=${productRow.id}` : null, reason: productRow ? 'Suspect product/drug is captured.' : 'Suspect product is missing.' },
    { key: 'event', satisfied: !!eventRow, source: eventRow ? `event.id=${eventRow.id}` : null, reason: eventRow ? 'Adverse event description exists.' : 'Adverse event description is missing.' },
  ];
  const score = elements.filter(e => e.satisfied).length;
  return { score, elements, blocking_for_submission: score < 4 };
}

module.exports = { assess };
