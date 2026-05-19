'use strict';

const pool = require('../database/db');

async function assess({ orgId, caseId }) {
  const [[caseRow]] = await pool.execute('SELECT * FROM cases WHERE id = ? AND org_id = ? LIMIT 1', [caseId, orgId]);
  if (!caseRow) return null;
  const [[reporter]] = await pool.execute(
    `SELECT id, email, phone FROM case_contacts WHERE case_id = ? AND LOWER(contact_role) = 'reporter' AND (email IS NOT NULL OR phone IS NOT NULL) ORDER BY is_primary DESC, id ASC LIMIT 1`,
    [caseId]
  );
  const [[patient]] = await pool.execute(
    `SELECT id FROM case_contacts WHERE case_id = ? AND LOWER(contact_role) = 'patient' ORDER BY is_primary DESC, id ASC LIMIT 1`,
    [caseId]
  );
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

  const elements = [
    { key: 'reporter', satisfied: !!reporter, source: reporter ? `case_contacts.id=${reporter.id}` : null, reason: reporter ? 'Reporter has email or phone.' : 'Reporter with email or phone is missing.' },
    { key: 'patient', satisfied: !!patient, source: patient ? `case_contacts.id=${patient.id}` : null, reason: patient ? 'Identifiable patient contact exists.' : 'Patient contact is missing.' },
    { key: 'product', satisfied: !!product, source: product ? `product.id=${product.id}` : null, reason: product ? 'Suspect product/drug is captured.' : 'Suspect product is missing.' },
    { key: 'event', satisfied: !!event, source: event ? `case_ae_events.id=${event.id}` : null, reason: event ? 'Adverse event description exists.' : 'Adverse event description is missing.' },
  ];
  const score = elements.filter(e => e.satisfied).length;
  return { score, elements, blocking_for_submission: score < 4 };
}

module.exports = { assess };
