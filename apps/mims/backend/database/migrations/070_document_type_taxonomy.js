'use strict';
// Migration 070 — Sprint 2 #15: Source-document type taxonomy.
// Replaces the old free-text "document type" notion with a controlled list
// so attachments, MI documents, and PC investigation reports can all be
// classified consistently. PV inspectors expect this taxonomy when they ask
// "show me your source documents".
//
// Design: 2-level taxonomy (category > type), org-scoped or global,
// retire-without-delete pattern so existing tags remain readable when an
// admin disables a type.

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS document_type_categories (
      id           INT NOT NULL AUTO_INCREMENT,
      org_id       INT NULL,                       -- NULL = global / shared
      code         VARCHAR(40) NOT NULL,
      label        VARCHAR(120) NOT NULL,
      description  VARCHAR(500) NULL,
      sort_order   INT NOT NULL DEFAULT 0,
      is_active    TINYINT(1) NOT NULL DEFAULT 1,
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_dtc_code (org_id, code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS document_types (
      id             INT NOT NULL AUTO_INCREMENT,
      org_id         INT NULL,
      category_id    INT NOT NULL,
      code           VARCHAR(60) NOT NULL,
      label          VARCHAR(160) NOT NULL,
      description    VARCHAR(500) NULL,
      retention_days INT NULL,                     -- optional default retention
      requires_pii_redaction TINYINT(1) NOT NULL DEFAULT 0,
      sort_order     INT NOT NULL DEFAULT 0,
      is_active      TINYINT(1) NOT NULL DEFAULT 1,
      created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_dt_code (org_id, code),
      KEY idx_dt_category (category_id, is_active),
      FOREIGN KEY (category_id) REFERENCES document_type_categories(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Seed global taxonomy aligned with ICH E2B(R3) source-document conventions
  const categories = [
    ['reporter_source',   'Reporter Source',         'Documents originating from the case reporter.'],
    ['clinical_source',   'Clinical Source',         'Hospital / clinic records that substantiate the case.'],
    ['lab_source',        'Laboratory Source',       'Lab reports, test results, imaging.'],
    ['regulatory',        'Regulatory Documents',    'E2B XML, ACK files, regulator correspondence.'],
    ['internal_qc',       'Internal QC / QA',        'Internal review notes, QC checklists, SOPs.'],
    ['legal',             'Legal / Compliance',      'Legal notices, consent forms, redaction logs.'],
    ['product_complaint', 'Product Complaint',       'PC investigation reports, lot history, CAPA outputs.'],
    ['medical_inquiry',   'Medical Inquiry',         'MI source documents, SRL versions, scientific references.'],
  ];
  for (const [code, label, desc] of categories) {
    await conn.execute(
      `INSERT IGNORE INTO document_type_categories (org_id, code, label, description, sort_order)
       VALUES (NULL, ?, ?, ?, 0)`,
      [code, label, desc]
    );
  }

  // Pull category ids for the FK below
  const [catRows] = await conn.execute(`SELECT id, code FROM document_type_categories WHERE org_id IS NULL`);
  const cat = Object.fromEntries(catRows.map(r => [r.code, r.id]));

  const types = [
    // Reporter source
    ['reporter_source',   'reporter_email',          'Reporter Email',         null, 0, 0],
    ['reporter_source',   'reporter_letter',         'Reporter Letter',        null, 0, 0],
    ['reporter_source',   'reporter_phone_note',     'Phone Call Note',        null, 0, 0],
    ['reporter_source',   'web_form_submission',     'Web Form Submission',    null, 0, 0],
    // Clinical
    ['clinical_source',   'hcp_letter',              'HCP Letter / Report',    null, 0, 0],
    ['clinical_source',   'hospital_discharge',      'Hospital Discharge Summary', null, 0, 0],
    ['clinical_source',   'death_certificate',       'Death Certificate',      null, 1, 0],
    ['clinical_source',   'autopsy_report',          'Autopsy Report',         null, 1, 0],
    // Lab
    ['lab_source',        'lab_report',              'Laboratory Report',      null, 1, 0],
    ['lab_source',        'imaging_report',          'Imaging / Radiology',    null, 1, 0],
    ['lab_source',        'biopsy_report',           'Biopsy / Pathology',     null, 1, 0],
    // Regulatory
    ['regulatory',        'e2b_xml',                 'E2B(R3) XML',            null, 0, 0],
    ['regulatory',        'ack1_xml',                'ACK1 (Transport)',       null, 0, 0],
    ['regulatory',        'ack2_xml',                'ACK2 (Schema)',          null, 0, 0],
    ['regulatory',        'ack3_xml',                'ACK3 (Business)',        null, 0, 0],
    ['regulatory',        'regulator_correspondence','Regulator Correspondence', null, 0, 0],
    // Internal QC
    ['internal_qc',       'qc_checklist',            'QC Checklist',           null, 0, 0],
    ['internal_qc',       'pv_review_note',          'PV Review Note',         null, 0, 0],
    ['internal_qc',       'meeting_minutes',         'Meeting Minutes',        null, 0, 0],
    // Legal
    ['legal',             'consent_form',            'Reporter Consent Form',  null, 1, 0],
    ['legal',             'redaction_log',           'PII Redaction Log',      null, 0, 0],
    ['legal',             'legal_hold_notice',       'Legal Hold Notice',      null, 0, 0],
    // PC
    ['product_complaint', 'investigation_report',    'PC Investigation Report', null, 0, 0],
    ['product_complaint', 'lot_history',             'Lot History',            null, 0, 0],
    ['product_complaint', 'capa_output',             'CAPA Output',            null, 0, 0],
    ['product_complaint', 'return_logistics',        'Return / Retrieval Doc', null, 0, 0],
    // MI
    ['medical_inquiry',   'srl_version',             'Standard Response Letter', null, 0, 0],
    ['medical_inquiry',   'scientific_reference',    'Scientific Reference',   null, 0, 0],
    ['medical_inquiry',   'response_letter',         'MI Response Letter',     null, 0, 0],
  ];
  for (const [catCode, code, label, desc, redact, sort] of types) {
    const catId = cat[catCode];
    if (!catId) continue;
    await conn.execute(
      `INSERT IGNORE INTO document_types
         (org_id, category_id, code, label, description, requires_pii_redaction, sort_order)
       VALUES (NULL, ?, ?, ?, ?, ?, ?)`,
      [catId, code, label, desc, redact, sort]
    );
  }
}

async function down(conn) {
  try { await conn.execute(`DROP TABLE IF EXISTS document_types`); } catch (_) {}
  try { await conn.execute(`DROP TABLE IF EXISTS document_type_categories`); } catch (_) {}
}

module.exports = { up, down };
