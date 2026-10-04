'use strict';

const pool = require('../database/db');
const { EXTRA_FIELDS, EXTRA_SECTIONS, EXTRA_PICKLIST_GROUPS } = require('../catalogs/caseFormExtensions');

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
  ['Contact / Requestor', 'Country of Reporter', 'dropdown', 0, 'country', null, 14],
  ['Contact / Requestor', 'Qualification', 'dropdown', 0, 'qualification', null, 15],
  ['Contact / Requestor', 'Preferred Contact Method', 'dropdown', 0, 'preferred_contact_method', null, 16],
  ['Contact / Requestor', 'Language Preference', 'dropdown', 0, 'language', null, 17],

  // Case Information
  ['Case Information', 'Case Number', 'text', 1, null, null, 1],
  ['Case Information', 'Date Received', 'date', 1, null, null, 2],
  ['Case Information', 'Date of Intake', 'date', 0, null, null, 3],
  ['Case Information', 'Case Type', 'dropdown', 0, 'case_type', null, 4],
  ['Case Information', 'Case Status', 'dropdown', 1, 'case_status', null, 5],
  ['Case Information', 'Case Owner', 'lookup', 0, null, 'user', 6],
  ['Case Information', 'Organisation', 'lookup', 1, null, 'org', 7],
  ['Case Information', 'Intake Channel', 'dropdown', 0, 'intake_channel', null, 9],
  ['Case Information', 'Priority', 'dropdown', 0, 'priority', null, 10],
  ['Case Information', 'Description', 'textarea', 0, null, null, 11],
  ['Case Information', 'Internal Notes', 'textarea', 0, null, null, 12],
  ['Case Information', 'Due Date', 'date', 0, null, null, 13],
  ['Case Information', 'Regulatory Reference Number', 'text', 0, null, null, 14],
  ['Case Information', 'Created By', 'lookup', 0, null, 'user', 15],

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
  ['MI — Response', 'MI Status', 'dropdown', 0, 'mi_status', null, 5],
  ['MI — Response', 'Literature Reference', 'textarea', 0, null, null, 6],

  // AE — General
  ['AE — General', 'AE Version', 'text', 0, null, null, 1],
  ['AE — General', 'AE Status', 'dropdown', 1, 'ae_status', null, 2],
  ['AE — General', 'Date of Awareness', 'date', 0, null, null, 3],
  ['AE — General', 'Report Type', 'dropdown', 0, 'ae_report_type', null, 4],
  ['AE — General', 'Regulatory Reportability', 'dropdown', 0, 'regulatory_reportability', null, 5],
  ['AE — General', 'Date of Report', 'date', 0, null, null, 6],
  ['AE — General', 'Reporter Awareness Date', 'date', 0, null, null, 7],

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
  ['AE — Events & Seriousness', 'Causality Assessment', 'dropdown', 0, 'causality_assessment', null, 14],
  ['AE — Events & Seriousness', 'End Date', 'date', 0, null, null, 15],

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
  ['AE — Product Information', 'Is Suspect', 'dropdown', 0, 'yes_no', null, 13],
  ['AE — Product Information', 'Is Concomitant', 'dropdown', 0, 'yes_no', null, 14],
  ['AE — Product Information', 'Dechallenge', 'dropdown', 0, 'dechallenge', null, 15],
  ['AE — Product Information', 'Rechallenge', 'dropdown', 0, 'rechallenge', null, 16],

  // PC — General
  ['PC — General', 'PC Version', 'text', 0, null, null, 1],
  ['PC — General', 'PC Status', 'dropdown', 1, 'pc_status', null, 2],
  ['PC — General', 'PC Category', 'dropdown', 1, 'pc_category', null, 3],
  ['PC — General', 'PC Classification', 'dropdown', 0, 'pc_classification', null, 4],
  ['PC — General', 'Complaint Description', 'textarea', 1, null, null, 5],
  ['PC — General', 'Date of Complaint', 'date', 0, null, null, 6],
  ['PC — General', 'Severity', 'dropdown', 0, 'pc_severity', null, 7],
  ['PC — General', 'Root Cause', 'textarea', 0, null, null, 8],
  ['PC — General', 'Date Received', 'date', 0, null, null, 9],

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
  ['PC — Product Information', 'Storage Conditions', 'textarea', 0, null, null, 8],
  ['PC — Product Information', 'Quantity Available for Investigation', 'dropdown', 0, 'yes_no', null, 9],

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
  { category: 'Case', field: 'case_status', values: ['Draft', 'Open', 'In Review', 'Pending Information', 'Closed', 'Reopened', 'Submitted', 'Acknowledged', 'Amendment Submitted', 'Withdrawn', 'Investigating', 'Analysed', 'Escalated'] },
  { category: 'Case', field: 'case_type', values: ['MI', 'AE', 'PC'] },
  { category: 'Case', field: 'priority', values: ['Urgent', 'High', 'Normal', 'Low'] }, // "urgent" is what the app filters and counts (M-80)
  { category: 'Case', field: 'intake_channel', values: ['Manual', 'Email', 'Phone', 'Web Form', 'Healthcare Provider', 'Patient', 'Internal', 'EMIR', 'CRM', 'Portal', 'Other'] },

  { category: 'Reporter', field: 'contact_type', values: ['Healthcare Professional', 'Patient', 'Consumer', 'Pharmacist', 'Company Rep', 'Distributor', 'Regulatory Authority', 'Lawyer', 'Other'] },
  { category: 'Reporter', field: 'reporter_type', values: ['Healthcare Professional', 'Patient', 'Consumer', 'Pharmacist', 'Regulatory Authority', 'Other'] },
  { category: 'Reporter', field: 'prefix', values: ['Mr', 'Ms', 'Mrs', 'Dr', 'Prof', 'Other'] },
  { category: 'Reporter', field: 'source', values: ['Spontaneous', 'Literature', 'Clinical Trial', 'Post-Marketing Study', 'Regulatory Authority', 'Other'] },
  { category: 'Reporter', field: 'consent_status', values: ['Obtained', 'Pending', 'Not Required', 'Withdrawn'] },
  { category: 'Reporter', field: 'qualification', values: ['MD', 'PharmD', 'Nurse', 'Pharmacist', 'Consumer', 'Other'] },
  { category: 'Reporter', field: 'preferred_contact_method', values: ['Email', 'Phone', 'Letter', 'Portal'] },
  { category: 'Reporter', field: 'language', values: ['English', 'French', 'German', 'Spanish', 'Italian', 'Portuguese', 'Other'] },

  { category: 'Medical Inquiry', field: 'mi_category', values: ['Pharmacology', 'Efficacy', 'Safety', 'Dosage', 'Pregnancy/Lactation', 'Drug Interactions', 'Adverse Event Question', 'Regulatory', 'Formulation', 'Off-Label', 'Compassionate Use', 'Clinical Trial', 'Other'] },
  { category: 'Medical Inquiry', field: 'mi_subcategory', values: ['General Query', 'Dosing', 'Safety', 'Efficacy', 'Storage', 'Interactions', 'Drug-Drug Interaction', 'Pregnancy - First Trimester', 'Pregnancy - Second Trimester', 'Pregnancy - Third Trimester', 'Other'] },
  { category: 'Medical Inquiry', field: 'mi_status', values: ['Open', 'In Progress', 'Pending Information', 'Answered', 'Closed', 'Follow-up Required'] },
  { category: 'Medical Inquiry', field: 'response_channel', values: ['Email', 'Phone Call', 'Written Letter', 'In-Person Meeting', 'Video Conference', 'Portal', 'Fax'] },

  { category: 'Adverse Event', field: 'ae_status', values: ['Open', 'Under Review', 'Closed', 'Submitted', 'Acknowledged', 'Amendment Submitted', 'Withdrawn'] },
  { category: 'Adverse Event', field: 'ae_report_type', values: ['Initial', 'Follow-up', 'Amendment', 'Expedited', 'Spontaneous', 'Literature', 'Clinical Trial', 'Solicited'] },
  { category: 'Adverse Event', field: 'ae_outcome', values: ['Recovered', 'Recovering', 'Not Recovered', 'Fatal', 'Unknown', 'Recovered with Sequelae'] },
  { category: 'Adverse Event', field: 'reported_causality', values: ['Related', 'Possibly Related', 'Unrelated', 'Unknown'] },
  { category: 'Adverse Event', field: 'causality_assessment', values: ['Certain', 'Probable', 'Possible', 'Unlikely', 'Unrelated', 'Unknown'] },
  { category: 'Adverse Event', field: 'frequency', values: ['Single Occurrence', 'Multiple Occurrences', 'Continuous', 'Intermittent'] },
  { category: 'Adverse Event', field: 'seriousness', values: ['Death', 'Life Threatening', 'Hospitalisation', 'Disability', 'Congenital Anomaly', 'Other Medically Important'] },
  { category: 'Adverse Event', field: 'regulatory_reportability', values: ['Reportable', 'Non-Reportable', 'Under Assessment'] },
  { category: 'Adverse Event', field: 'dechallenge', values: ['Yes — Event Abated', 'No — Event Did Not Abate', 'Unknown', 'Not Applicable'] },
  { category: 'Adverse Event', field: 'rechallenge', values: ['Yes — Event Recurred', 'No — Event Did Not Recur', 'Unknown', 'Not Done'] },

  { category: 'Patient', field: 'gender', values: ['Male', 'Female', 'Other', 'Unknown'] },
  { category: 'Patient', field: 'age_unit', values: ['Years', 'Months', 'Weeks', 'Days'] },
  { category: 'Patient', field: 'yes_no', values: ['Yes', 'No'] },

  { category: 'Product', field: 'route_of_admin', values: ['Oral', 'Intravenous (IV)', 'Intramuscular (IM)', 'Subcutaneous (SC)', 'Transdermal', 'Inhaled', 'Topical', 'Rectal', 'Ophthalmic', 'Nasal', 'Vaginal', 'Other'] },
  { category: 'Product', field: 'dose_unit', values: ['mg', 'mcg', 'g', 'mL', 'IU', 'mmol', '%', 'Other'] },
  { category: 'Product', field: 'action_taken', values: ['Dose Reduced', 'Drug Withdrawn', 'Dose Not Changed', 'Drug Interrupted', 'Unknown', 'Not Applicable'] },
  { category: 'Product', field: 'product_type', values: ['Prescription', 'Over the Counter', 'Biological', 'Medical Device', 'Combination Product'] },
  { category: 'Product', field: 'product_category', values: ['Brand', 'Generic', 'Biosimilar', 'Investigational'] },
  // Dosing frequency has its own name: the event Frequency box reads the
  // 'frequency' list, and two lists with one name were merged into it (M-111).
  { category: 'Product', field: 'dosing_frequency', values: ['Once Daily (QD)', 'Twice Daily (BID)', 'Three Times Daily (TID)', 'Four Times Daily (QID)', 'Every 6 Hours (Q6H)', 'Every 8 Hours (Q8H)', 'Every 12 Hours (Q12H)', 'Once Weekly', 'Once Monthly', 'As Needed (PRN)', 'Continuous', 'Per Protocol', 'Other'] },

  { category: 'Product Complaint', field: 'pc_status', values: ['Open', 'Investigating', 'Analysed', 'Closed', 'Reopened', 'Escalated'] },
  { category: 'Product Complaint', field: 'pc_category', values: ['Quality Defect', 'Contamination', 'Packaging Damage', 'Efficacy Complaint', 'Safety Concern', 'Regulatory Issue', 'Labeling Error', 'Delivery Issue', 'Other'] },
  { category: 'Product Complaint', field: 'pc_classification', values: ['Critical', 'Major', 'Minor', 'Unclassified'] },
  { category: 'Product Complaint', field: 'pc_severity', values: ['Critical', 'Major', 'Minor'] },
  { category: 'Product Complaint', field: 'retrieval_method', values: ['Courier', 'Mail', 'Pickup', 'Returned at Pharmacy', 'Field Force Recovery', 'Destruction on Site', 'Other'] },

  { category: 'MedDRA', field: 'meddra_term', values: ['Nausea', 'Vomiting', 'Headache', 'Dizziness', 'Rash', 'Fatigue', 'Dyspnoea', 'Chest Pain', 'Palpitations', 'Other'] },
];

const CASE_FORM_SECTIONS = {
  MI: ['Contact / Requestor', 'Case Information', 'MI — Category & Product', 'MI — Question Details', 'MI — Response'],
  AE: ['Contact / Requestor', 'Case Information', 'AE — General', 'AE — Events & Seriousness', 'AE — Patient Information', 'AE — Lab Results', 'AE — Lab Notes', 'AE — Medical History', 'AE — Medical Notes', 'AE — Product Information'],
  PC: ['Contact / Requestor', 'Case Information', 'PC — General', 'PC — Patient Information', 'PC — Product Information', 'PC — Return & Retrieval', 'PC — Replacement', 'PC — Refund & Credit'],
};

async function seedFieldSetup(conn, orgId, _userId) {
  const allRows = [...FIELD_SETUP_ROWS, ...EXTRA_FIELDS];
  for (const row of allRows) {
    await conn.execute(
      // MIPM-194: Contact / Requestor fields belong to the Contacts step (the
      // contact card on step 1). Untagged, they were drawn on every other step as
      // an empty duplicate form whose required stars nothing enforced.
      `INSERT IGNORE INTO field_setup
        (section_name, field_name, field_type, is_required, is_hidden, is_disabled, picklist_type, lookup_target, sort_order, org_id, display_tab)
       VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?)`,
      [row[0], row[1], row[2], row[3], row[4], row[5], row[6], orgId, row[0] === 'Contact / Requestor' ? 'contacts' : null]
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
  const allGroups = [...PICKLIST_GROUPS, ...EXTRA_PICKLIST_GROUPS];
  for (const group of allGroups) {
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
  // Build a merged map: { AE: [...], MI: [...], PC: [...] } where each
  // case type gets its base sections PLUS the cross-cutting (ALL) sections
  // PLUS any case-type-specific extras from EXTRA_SECTIONS.
  const sharedExtras = EXTRA_SECTIONS.ALL || [];
  const merged = {};
  for (const [caseType, sections] of Object.entries(CASE_FORM_SECTIONS)) {
    merged[caseType] = [
      ...sections,
      ...sharedExtras,
      ...(EXTRA_SECTIONS[caseType] || []),
    ];
  }

  for (const [caseType, sections] of Object.entries(merged)) {
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

async function seedCustomizeFormsPlaceholders(conn, orgId) {
  // Seed placeholder items from the Customize Forms catalog so all tenants
  // (existing + new) have the placeholder records available to toggle in the
  // MIMS Admin > System > Setup > Customize Forms screen.
  let catalogModule;
  try {
    catalogModule = require('../catalogs/customizeFormsCatalog');
  } catch (_) { return; }

  const { CATALOG, PLACEHOLDER_SECTION } = catalogModule;
  for (const category of Object.values(CATALOG)) {
    const placeholders = [...category.sections, ...category.fields].filter(it => it.is_placeholder);
    for (const ph of placeholders) {
      await conn.execute(
        `INSERT IGNORE INTO field_setup
          (section_name, field_name, field_type, is_required, is_hidden, is_disabled, picklist_type, lookup_target, sort_order, org_id)
         VALUES (?, ?, 'placeholder', 0, 0, 0, NULL, NULL, 0, ?)`,
        [PLACEHOLDER_SECTION, ph.key, orgId]
      );
    }
  }
}

// MIPM-66: a new organisation's fields take the platform field marks (core_key)
// and hidden defaults from the platform rows, as migration 124 does for existing
// organisations. Without it the case form drew Priority, Description and the other
// platform fields twice for every organisation created after migration 102.
async function applyPlatformCoreKeys(conn, orgId) {
  await conn.execute(
    `UPDATE field_setup f
       JOIN field_setup d
         ON d.org_id IS NULL
        AND d.section_name = f.section_name
        AND LOWER(TRIM(d.field_name)) = LOWER(TRIM(f.field_name))
        SET f.core_key  = d.core_key,
            f.is_hidden = GREATEST(COALESCE(f.is_hidden, 0), COALESCE(d.is_hidden, 0))
      WHERE f.org_id = ?
        AND (f.core_key IS NULL OR f.core_key = '')
        AND d.core_key IS NOT NULL AND d.core_key <> ''`,
    [orgId]
  );
}

// Content documents are classified from mi_categories, which nothing seeded, so
// New Document's MI Category list was empty in every new org. Start it with the
// same names as the case form's MI Category picklist (MIPM-201).
async function seedMiCategories(conn, orgId, userId) {
  const [[{ n }]] = await conn.execute('SELECT COUNT(*) AS n FROM mi_categories WHERE org_id = ?', [orgId]);
  if (n > 0) return;
  const names = PICKLIST_GROUPS.find(g => g.field === 'mi_category').values;
  for (const [i, name] of names.entries()) {
    await conn.execute(
      'INSERT INTO mi_categories (org_id, name, sort_order, created_by) VALUES (?, ?, ?, ?)',
      [orgId, name, i + 1, userId || null]
    );
  }
}

async function seedNewOrgWithConnection(conn, orgId, userId) {
  await seedFieldSetup(conn, orgId, userId);
  await applyPlatformCoreKeys(conn, orgId);
  await seedPicklists(conn, orgId, userId);
  await seedMiCategories(conn, orgId, userId);
  await seedCaseFormDefinition(conn, orgId, userId);
  await seedCustomizeFormsPlaceholders(conn, orgId);
}

async function seedNewOrg(orgId, userId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await seedNewOrgWithConnection(conn, orgId, userId);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

module.exports = { seedNewOrg, seedNewOrgWithConnection };
