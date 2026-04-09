'use strict';

const pool = require('../database/db');

const FIELD_SETUP_ROWS = [
  // Contact / Requestor
  ['Contact / Requestor', 'Prefix', 'dropdown', 0, 'prefix', null, 1],
  ['Contact / Requestor', 'First Name', 'text', 1, null, null, 2],
  ['Contact / Requestor', 'Last Name', 'text', 1, null, null, 3],
  ['Contact / Requestor', 'Contact Type', 'dropdown', 1, 'contact_type', null, 4],
  ['Contact / Requestor', 'Reporter Type', 'dropdown', 0, 'reporter_type', null, 5],
  ['Contact / Requestor', 'Source', 'dropdown', 0, 'source', null, 6],
  ['Contact / Requestor', 'Consent Status', 'dropdown', 0, 'consent_status', null, 7],
  ['Contact / Requestor', 'Email', 'text', 0, null, null, 8],
  ['Contact / Requestor', 'Phone', 'text', 0, null, null, 9],
  ['Contact / Requestor', 'Specialty', 'text', 0, null, null, 10],
  ['Contact / Requestor', 'Institution', 'text', 0, null, null, 11],
  ['Contact / Requestor', 'Country', 'dropdown', 0, 'country', null, 12],
  ['Contact / Requestor', 'Do Not Update Master Data', 'checkbox', 0, null, null, 13],

  // Case Information
  ['Case Information', 'Case Number', 'text', 1, null, null, 1],
  ['Case Information', 'Date Received', 'date', 1, null, null, 2],
  ['Case Information', 'Date of Intake', 'date', 0, null, null, 3],
  ['Case Information', 'Case Type', 'dropdown', 1, 'case_type', null, 4],
  ['Case Information', 'Case Status', 'dropdown', 1, 'case_status', null, 5],
  ['Case Information', 'Case Owner', 'lookup', 0, null, 'user', 6],
  ['Case Information', 'Organisation', 'lookup', 1, null, 'org', 7],
  ['Case Information', 'Site', 'lookup', 0, null, 'site', 8],
  ['Case Information', 'Intake Channel', 'dropdown', 0, 'intake_channel', null, 9],
  ['Case Information', 'Priority', 'dropdown', 0, 'priority', null, 10],
  ['Case Information', 'Description', 'textarea', 0, null, null, 11],
  ['Case Information', 'Internal Notes', 'textarea', 0, null, null, 12],

  // MI — Category & Product
  ['MI — Category & Product', 'MI Category', 'dropdown', 1, 'mi_category', null, 1],
  ['MI — Category & Product', 'MI Subcategory', 'dropdown', 0, 'mi_subcategory', null, 2],
  ['MI — Category & Product', 'Product', 'lookup', 0, null, 'product', 3],

  // MI — Question Details
  ['MI — Question Details', 'Question Summary', 'text', 1, null, null, 1],
  ['MI — Question Details', 'Detailed Question', 'textarea', 0, null, null, 2],

  // MI — Response
  ['MI — Response', 'Response Required By', 'date', 0, null, null, 1],
  ['MI — Response', 'Response Provided', 'textarea', 0, null, null, 2],
  ['MI — Response', 'Response Date', 'date', 0, null, null, 3],
  ['MI — Response', 'Response Channel', 'dropdown', 0, 'response_channel', null, 4],

  // AE — General
  ['AE — General', 'AE Version', 'text', 0, null, null, 1],
  ['AE — General', 'AE Status', 'dropdown', 1, 'ae_status', null, 2],
  ['AE — General', 'Date of Awareness', 'date', 0, null, null, 3],
  ['AE — General', 'Report Type', 'dropdown', 0, 'ae_report_type', null, 4],
  ['AE — General', 'Regulatory Reportability', 'dropdown', 0, 'regulatory_reportability', null, 5],

  // AE — Events & Seriousness
  ['AE — Events & Seriousness', 'Event Description', 'textarea', 0, null, null, 1],
  ['AE — Events & Seriousness', 'MedDRA Term', 'dropdown', 0, 'meddra_term', null, 2],
  ['AE — Events & Seriousness', 'Onset Date', 'date', 0, null, null, 3],
  ['AE — Events & Seriousness', 'Outcome', 'dropdown', 0, 'ae_outcome', null, 4],
  ['AE — Events & Seriousness', 'Reported Causality', 'dropdown', 0, 'reported_causality', null, 5],
  ['AE — Events & Seriousness', 'Frequency', 'dropdown', 0, 'frequency', null, 6],
  ['AE — Events & Seriousness', 'Seriousness', 'multiselect', 0, 'seriousness', null, 7],
  ['AE — Events & Seriousness', 'Serious — Death', 'checkbox', 0, null, null, 8],
  ['AE — Events & Seriousness', 'Serious — Life Threatening', 'checkbox', 0, null, null, 9],
  ['AE — Events & Seriousness', 'Serious — Hospitalisation', 'checkbox', 0, null, null, 10],
  ['AE — Events & Seriousness', 'Serious — Disability', 'checkbox', 0, null, null, 11],
  ['AE — Events & Seriousness', 'Serious — Congenital Anomaly', 'checkbox', 0, null, null, 12],
  ['AE — Events & Seriousness', 'Serious — Other Medically Important', 'checkbox', 0, null, null, 13],

  // AE — Patient Information
  ['AE — Patient Information', 'Patient Initials', 'text', 0, null, null, 1],
  ['AE — Patient Information', 'Date of Birth', 'date', 0, null, null, 2],
  ['AE — Patient Information', 'Age', 'number', 0, null, null, 3],
  ['AE — Patient Information', 'Age Unit', 'dropdown', 0, 'age_unit', null, 4],
  ['AE — Patient Information', 'Gender', 'dropdown', 0, 'gender', null, 5],
  ['AE — Patient Information', 'Weight (kg)', 'number', 0, null, null, 6],
  ['AE — Patient Information', 'Height (cm)', 'number', 0, null, null, 7],
  ['AE — Patient Information', 'Pregnant', 'dropdown', 0, 'yes_no', null, 8],
  ['AE — Patient Information', 'Patient Country', 'dropdown', 0, 'country', null, 9],

  // AE — Lab Results
  ['AE — Lab Results', 'Lab Name', 'text', 0, null, null, 1],
  ['AE — Lab Results', 'Test Date', 'date', 0, null, null, 2],
  ['AE — Lab Results', 'Test Name', 'text', 0, null, null, 3],
  ['AE — Lab Results', 'Result Value', 'text', 0, null, null, 4],
  ['AE — Lab Results', 'Normal Range', 'text', 0, null, null, 5],

  // AE — Lab Notes
  ['AE — Lab Notes', 'Lab Notes', 'textarea', 0, null, null, 1],

  // AE — Medical History
  ['AE — Medical History', 'Medical History', 'textarea', 0, null, null, 1],
  ['AE — Medical History', 'Relevant History', 'textarea', 0, null, null, 2],

  // AE — Medical Notes
  ['AE — Medical Notes', 'Medical Notes', 'textarea', 0, null, null, 1],
  ['AE — Medical Notes', 'Narrative', 'textarea', 0, null, null, 2],

  // AE — Product Information
  ['AE — Product Information', 'Product Name', 'lookup', 0, null, 'product', 1],
  ['AE — Product Information', 'Product Type', 'dropdown', 0, 'product_type', null, 2],
  ['AE — Product Information', 'Product Category', 'dropdown', 0, 'product_category', null, 3],
  ['AE — Product Information', 'Batch / Lot Number', 'text', 0, null, null, 4],
  ['AE — Product Information', 'Dose', 'text', 0, null, null, 5],
  ['AE — Product Information', 'Dose Unit', 'dropdown', 0, 'dose_unit', null, 6],
  ['AE — Product Information', 'Administration Route', 'dropdown', 0, 'route_of_admin', null, 7],
  ['AE — Product Information', 'Start Date', 'date', 0, null, null, 8],
  ['AE — Product Information', 'Stop Date', 'date', 0, null, null, 9],
  ['AE — Product Information', 'Indication', 'text', 0, null, null, 10],
  ['AE — Product Information', 'Action Taken', 'dropdown', 0, 'action_taken', null, 11],
  ['AE — Product Information', 'Concomitant Medications', 'textarea', 0, null, null, 12],

  // PC — General
  ['PC — General', 'PC Version', 'text', 0, null, null, 1],
  ['PC — General', 'PC Status', 'dropdown', 1, 'pc_status', null, 2],
  ['PC — General', 'PC Category', 'dropdown', 1, 'pc_category', null, 3],
  ['PC — General', 'PC Classification', 'dropdown', 0, 'pc_classification', null, 4],
  ['PC — General', 'Complaint Description', 'textarea', 1, null, null, 5],
  ['PC — General', 'Date of Complaint', 'date', 0, null, null, 6],

  // PC — Patient Information
  ['PC — Patient Information', 'Patient Name', 'text', 0, null, null, 1],
  ['PC — Patient Information', 'Date of Birth', 'date', 0, null, null, 2],
  ['PC — Patient Information', 'Gender', 'dropdown', 0, 'gender', null, 3],
  ['PC — Patient Information', 'Injury Experienced', 'dropdown', 0, 'yes_no', null, 4],

  // PC — Product Information
  ['PC — Product Information', 'Product Name', 'lookup', 0, null, 'product', 1],
  ['PC — Product Information', 'Product Type', 'dropdown', 0, 'product_type', null, 2],
  ['PC — Product Information', 'Product Category', 'dropdown', 0, 'product_category', null, 3],
  ['PC — Product Information', 'Batch / Lot Number', 'text', 0, null, null, 4],
  ['PC — Product Information', 'Expiry Date', 'date', 0, null, null, 5],
  ['PC — Product Information', 'Manufacturing Date', 'date', 0, null, null, 6],
  ['PC — Product Information', 'Pack Size', 'text', 0, null, null, 7],

  // PC — Return & Retrieval
  ['PC — Return & Retrieval', 'Return Requested', 'dropdown', 0, 'yes_no', null, 1],
  ['PC — Return & Retrieval', 'Return Date', 'date', 0, null, null, 2],
  ['PC — Return & Retrieval', 'Return Address', 'textarea', 0, null, null, 3],
  ['PC — Return & Retrieval', 'Retrieval Method', 'dropdown', 0, 'retrieval_method', null, 4],
  ['PC — Return & Retrieval', 'Return Notes', 'textarea', 0, null, null, 5],

  // PC — Replacement
  ['PC — Replacement', 'Replacement Approved', 'dropdown', 0, 'yes_no', null, 1],
  ['PC — Replacement', 'Replacement Quantity', 'number', 0, null, null, 2],
  ['PC — Replacement', 'Replacement Ship Date', 'date', 0, null, null, 3],
  ['PC — Replacement', 'Replacement Notes', 'textarea', 0, null, null, 4],

  // PC — Refund & Credit
  ['PC — Refund & Credit', 'Refund Approved', 'dropdown', 0, 'yes_no', null, 1],
  ['PC — Refund & Credit', 'Refund Amount', 'number', 0, null, null, 2],
  ['PC — Refund & Credit', 'Credit Note Number', 'text', 0, null, null, 3],
  ['PC — Refund & Credit', 'Refund Notes', 'textarea', 0, null, null, 4],
];

const PICKLIST_GROUPS = [
  { category: 'Case', field: 'case_status', values: ['New', 'In Progress', 'On Hold', 'Closed', 'Cancelled'] },
  { category: 'Case', field: 'case_type', values: ['MI', 'AE', 'PC'] },
  { category: 'Case', field: 'priority', values: ['Critical', 'High', 'Medium', 'Low'] },
  { category: 'Case', field: 'intake_channel', values: ['Manual', 'Email', 'EMIR', 'CRM', 'Portal'] },

  { category: 'Reporter', field: 'contact_type', values: ['Healthcare Professional', 'Consumer', 'Pharmacist', 'Lawyer', 'Regulatory Authority', 'Other'] },
  { category: 'Reporter', field: 'reporter_type', values: ['Healthcare Professional', 'Consumer', 'Pharmacist', 'Regulatory Authority', 'Other'] },
  { category: 'Reporter', field: 'prefix', values: ['Mr', 'Ms', 'Mrs', 'Dr', 'Prof', 'Other'] },
  { category: 'Reporter', field: 'source', values: ['Spontaneous', 'Literature', 'Clinical Trial', 'Post-Marketing Study', 'Regulatory Authority'] },
  { category: 'Reporter', field: 'consent_status', values: ['Obtained', 'Pending', 'Not Required', 'Withdrawn'] },

  { category: 'Medical Inquiry', field: 'mi_category', values: ['Medical Information', 'Off-Label', 'Compassionate Use', 'Clinical Trial', 'Other'] },
  { category: 'Medical Inquiry', field: 'mi_subcategory', values: ['General Query', 'Dosing', 'Safety', 'Efficacy', 'Storage', 'Interactions'] },
  { category: 'Medical Inquiry', field: 'response_channel', values: ['Email', 'Phone', 'Letter', 'Fax'] },

  { category: 'Adverse Event', field: 'ae_status', values: ['Open', 'Under Review', 'Closed', 'Submitted'] },
  { category: 'Adverse Event', field: 'ae_report_type', values: ['Spontaneous', 'Literature', 'Clinical Trial', 'Solicited'] },
  { category: 'Adverse Event', field: 'ae_outcome', values: ['Recovered', 'Recovering', 'Not Recovered', 'Fatal', 'Unknown'] },
  { category: 'Adverse Event', field: 'reported_causality', values: ['Related', 'Possibly Related', 'Unrelated', 'Unknown'] },
  { category: 'Adverse Event', field: 'frequency', values: ['Single Occurrence', 'Multiple Occurrences', 'Continuous', 'Intermittent'] },
  { category: 'Adverse Event', field: 'seriousness', values: ['Death', 'Life Threatening', 'Hospitalisation', 'Disability', 'Congenital Anomaly', 'Other Medically Important'] },
  { category: 'Adverse Event', field: 'regulatory_reportability', values: ['Reportable', 'Non-Reportable', 'Under Assessment'] },

  { category: 'Patient', field: 'gender', values: ['Male', 'Female', 'Other', 'Unknown'] },
  { category: 'Patient', field: 'age_unit', values: ['Years', 'Months', 'Weeks', 'Days'] },
  { category: 'Patient', field: 'yes_no', values: ['Yes', 'No'] },

  { category: 'Product', field: 'route_of_admin', values: ['Oral', 'Intravenous', 'Subcutaneous', 'Intramuscular', 'Topical', 'Inhaled', 'Transdermal', 'Other'] },
  { category: 'Product', field: 'dose_unit', values: ['mg', 'mcg', 'g', 'mL', 'IU', '%'] },
  { category: 'Product', field: 'action_taken', values: ['Dose Reduced', 'Drug Withdrawn', 'Dose Not Changed', 'Unknown'] },
  { category: 'Product', field: 'product_type', values: ['Prescription', 'Over the Counter', 'Biological', 'Medical Device', 'Combination Product'] },
  { category: 'Product', field: 'product_category', values: ['Brand', 'Generic', 'Biosimilar', 'Investigational'] },

  { category: 'Product Complaint', field: 'pc_status', values: ['Open', 'Under Review', 'Closed'] },
  { category: 'Product Complaint', field: 'pc_category', values: ['Quality', 'Packaging', 'Labelling', 'Efficacy', 'Other'] },
  { category: 'Product Complaint', field: 'pc_classification', values: ['Critical', 'Major', 'Minor', 'Unclassified'] },
  { category: 'Product Complaint', field: 'retrieval_method', values: ['Mail', 'Courier', 'Field Rep', 'Destruction on Site'] },

  { category: 'MedDRA', field: 'meddra_term', values: ['Nausea', 'Vomiting', 'Headache', 'Dizziness', 'Rash', 'Fatigue', 'Dyspnoea', 'Chest Pain', 'Palpitations', 'Other'] },
];

const CASE_FORM_SECTIONS = {
  MI: ['Contact / Requestor', 'Case Information', 'MI — Category & Product', 'MI — Question Details', 'MI — Response'],
  AE: ['Contact / Requestor', 'Case Information', 'AE — General', 'AE — Events & Seriousness', 'AE — Patient Information', 'AE — Lab Results', 'AE — Lab Notes', 'AE — Medical History', 'AE — Medical Notes', 'AE — Product Information'],
  PC: ['Contact / Requestor', 'Case Information', 'PC — General', 'PC — Patient Information', 'PC — Product Information', 'PC — Return & Retrieval', 'PC — Replacement', 'PC — Refund & Credit'],
};

async function seedFieldSetup(conn, orgId, _userId) {
  for (const row of FIELD_SETUP_ROWS) {
    await conn.execute(
      `INSERT IGNORE INTO field_setup
        (section_name, field_name, field_type, is_required, is_hidden, is_disabled, picklist_type, lookup_target, sort_order, org_id)
       VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`,
      [row[0], row[1], row[2], row[3], row[4], row[5], row[6], orgId]
    );
  }
}

async function getOrCreateCategoryId(conn, orgId, categoryName, userId) {
  await conn.execute(
    `INSERT IGNORE INTO picklist_categories (org_id, name, is_active, sort_order, created_by)
     VALUES (?, ?, 1, 0, ?)`,
    [orgId, categoryName, userId]
  );

  const [[category]] = await conn.execute(
    'SELECT id FROM picklist_categories WHERE org_id = ? AND name = ? LIMIT 1',
    [orgId, categoryName]
  );

  return category ? category.id : null;
}

async function getOrCreateFieldId(conn, orgId, categoryId, fieldName, userId) {
  await conn.execute(
    `INSERT IGNORE INTO picklist_fields (org_id, category_id, name, legacy_field_type, is_active, sort_order, created_by)
     VALUES (?, ?, ?, ?, 1, 0, ?)`,
    [orgId, categoryId, fieldName, fieldName, userId]
  );

  const [[field]] = await conn.execute(
    'SELECT id FROM picklist_fields WHERE org_id = ? AND category_id = ? AND name = ? LIMIT 1',
    [orgId, categoryId, fieldName]
  );

  return field ? field.id : null;
}

async function seedPicklists(conn, orgId, userId) {
  for (const group of PICKLIST_GROUPS) {
    const categoryId = await getOrCreateCategoryId(conn, orgId, group.category, userId);
    if (!categoryId) continue;

    const fieldId = await getOrCreateFieldId(conn, orgId, categoryId, group.field, userId);
    if (!fieldId) continue;

    for (const value of group.values) {
      await conn.execute(
        `INSERT IGNORE INTO picklists
          (name, category, field_type, field_id, value, status, created_by, org_id)
         VALUES (?, ?, ?, ?, ?, 'Active', ?, ?)`,
        [value, group.category, group.field, fieldId, value, userId, orgId]
      );
    }
  }
}

async function seedCaseFormDefinition(conn, orgId, _userId) {
  for (const [caseType, sections] of Object.entries(CASE_FORM_SECTIONS)) {
    for (const sectionName of sections) {
      await conn.execute(
        `INSERT IGNORE INTO case_form_definition
          (org_id, case_type, section_name, is_visible, field_overrides)
         VALUES (?, ?, ?, 1, NULL)`,
        [orgId, caseType, sectionName]
      );
    }
  }
}

async function seedNewOrg(orgId, userId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await seedFieldSetup(conn, orgId, userId);
    await seedPicklists(conn, orgId, userId);
    await seedCaseFormDefinition(conn, orgId, userId);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

module.exports = { seedNewOrg };
