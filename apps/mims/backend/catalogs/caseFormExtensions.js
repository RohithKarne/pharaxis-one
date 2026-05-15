'use strict';

/**
 * caseFormExtensions.js — All extra fields, sections, and picklist groups added to
 * the case form following Saad's gap audit (Contact / Case Info / MI / AE / PC /
 * cross-cutting). Seeded into every existing tenant via the backfill script and
 * every new tenant via seedService.seedNewOrg().
 *
 * Row shape (matches seedService FIELD_SETUP_ROWS):
 *   [section_name, field_name, field_type, is_required, picklist_type, lookup_target, sort_order]
 */

// ─────────────────────────────────────────────────────────────────────────────
// EXTRA FIELDS — appended to FIELD_SETUP_ROWS at seed time
// ─────────────────────────────────────────────────────────────────────────────

const EXTRA_FIELDS = [
  // ── Contact / Requestor (+18 fields) ──
  ['Contact / Requestor', 'Middle Name',                'text',     0, null, null, 30],
  ['Contact / Requestor', 'Suffix',                     'text',     0, null, null, 31],
  ['Contact / Requestor', 'Address Line 1',             'text',     0, null, null, 32],
  ['Contact / Requestor', 'Address Line 2',             'text',     0, null, null, 33],
  ['Contact / Requestor', 'City',                       'text',     0, null, null, 34],
  ['Contact / Requestor', 'State / Province',           'text',     0, null, null, 35],
  ['Contact / Requestor', 'Postal Code',                'text',     0, null, null, 36],
  ['Contact / Requestor', 'Mobile Phone',               'text',     0, null, null, 37],
  ['Contact / Requestor', 'Fax Number',                 'text',     0, null, null, 38],
  ['Contact / Requestor', 'Alternate Email',            'text',     0, null, null, 39],
  ['Contact / Requestor', 'NPI Number',                 'text',     0, null, null, 40],
  ['Contact / Requestor', 'DEA Number',                 'text',     0, null, null, 41],
  ['Contact / Requestor', 'State Medical License',      'text',     0, null, null, 42],
  ['Contact / Requestor', 'License State',              'text',     0, null, null, 43],
  ['Contact / Requestor', 'HCP Master Record ID',       'text',     0, null, null, 44],
  ['Contact / Requestor', 'Department within Institution', 'text',  0, null, null, 45],
  ['Contact / Requestor', 'Job Title',                  'text',     0, null, null, 46],
  ['Contact / Requestor', 'Time Zone',                  'text',     0, null, null, 47],
  ['Contact / Requestor', 'Best Time to Contact',       'text',     0, null, null, 48],
  ['Contact / Requestor', 'Reporter Anonymous',         'checkbox', 0, null, null, 49],
  ['Contact / Requestor', 'Reporter Relationship to Patient', 'dropdown', 0, 'relationship_to_patient', null, 50],
  ['Contact / Requestor', 'Date of First Contact',      'date',     0, null, null, 51],
  ['Contact / Requestor', 'Linked Reporter',            'lookup',   0, null, 'contact', 52],

  // ── Reporter Documentation (sub-section under Contact) ──
  ['Reporter Documentation', 'Original Source Document Reference', 'text',     0, null, null, 1],
  ['Reporter Documentation', 'Reporter Signature on File',         'checkbox', 0, null, null, 2],
  ['Reporter Documentation', 'Consent Form Attached',              'checkbox', 0, null, null, 3],
  ['Reporter Documentation', 'Source Documentation Notes',         'textarea', 0, null, null, 4],

  // ── Case Information (+12 fields) ──
  ['Case Information', 'Case Subtype',                  'dropdown', 0, 'case_subtype',    null, 20],
  ['Case Information', 'Parent Case ID',                'lookup',   0, null,              'case', 21],
  ['Case Information', 'Worldwide Unique Case ID',      'text',     0, null,              null, 22],
  ['Case Information', 'External CRM ID',               'text',     0, null,              null, 23],
  ['Case Information', 'External EMR ID',               'text',     0, null,              null, 24],
  ['Case Information', 'Sales Rep / Territory',         'text',     0, null,              null, 25],
  ['Case Information', 'Origin Country',                'dropdown', 0, 'country',         null, 26],
  ['Case Information', 'Tags / Labels',                 'multiselect', 0, 'case_tags',    null, 27],
  ['Case Information', 'Watchers',                      'multiselect', 0, null,           'user', 28],
  ['Case Information', 'Co-owners',                     'multiselect', 0, null,           'user', 29],
  ['Case Information', 'Case Resolution Type',          'dropdown', 0, 'case_resolution', null, 30],
  ['Case Information', 'Case Closed Date',              'date',     0, null,              null, 31],
  ['Case Information', 'Closed Reason',                 'textarea', 0, null,              null, 32],

  // ── MI — extra fields on existing sections ──
  ['MI — Category & Product', 'Question Source',        'dropdown', 0, 'question_source',  null, 10],
  ['MI — Category & Product', 'Question Channel',       'dropdown', 0, 'question_channel', null, 11],
  ['MI — Category & Product', 'Urgency Level',          'dropdown', 0, 'urgency_level',    null, 12],
  ['MI — Category & Product', 'Patient-specific',       'checkbox', 0, null,               null, 13],
  ['MI — Category & Product', 'Off-Label Discussion',   'checkbox', 0, null,               null, 14],

  ['MI — Response', 'Country-specific PI Reference',    'text',     0, null,                null, 10],
  ['MI — Response', 'PI Version Used',                  'text',     0, null,                null, 11],
  ['MI — Response', 'Reference Documents Used',         'textarea', 0, null,                null, 12],
  ['MI — Response', 'Response Template Used',           'text',     0, null,                null, 13],
  ['MI — Response', 'Approval Status',                  'dropdown', 0, 'mi_approval_status',null, 14],
  ['MI — Response', 'Reviewer Name',                    'lookup',   0, null,                'user', 15],
  ['MI — Response', 'Reviewer Date',                    'date',     0, null,                null, 16],
  ['MI — Response', 'Approver Name',                    'lookup',   0, null,                'user', 17],
  ['MI — Response', 'Approver Date',                    'date',     0, null,                null, 18],
  ['MI — Response', 'HCP Wants Written Response',       'checkbox', 0, null,                null, 19],
  ['MI — Response', 'Translation Required',             'checkbox', 0, null,                null, 20],
  ['MI — Response', 'Target Language',                  'dropdown', 0, 'target_language',   null, 21],

  // ── MI — Follow-up & Outcome (new section) ──
  ['MI — Follow-up & Outcome', 'Follow-up Required',     'checkbox', 0, null,                  null, 1],
  ['MI — Follow-up & Outcome', 'Follow-up Due Date',     'date',     0, null,                  null, 2],
  ['MI — Follow-up & Outcome', 'Follow-up Channel',      'dropdown', 0, 'follow_up_channel',   null, 3],
  ['MI — Follow-up & Outcome', 'Follow-up Completed',    'checkbox', 0, null,                  null, 4],
  ['MI — Follow-up & Outcome', 'Follow-up Completed Date','date',    0, null,                  null, 5],
  ['MI — Follow-up & Outcome', 'HCP Satisfaction Score', 'number',   0, null,                  null, 6],
  ['MI — Follow-up & Outcome', 'HCP Feedback Notes',     'textarea', 0, null,                  null, 7],
  ['MI — Follow-up & Outcome', 'Closed-Loop Confirmation','checkbox',0, null,                  null, 8],

  // ── AE — General (+5) ──
  ['AE — General', 'Worldwide Unique Case ID',          'text',     0, null,              null, 10],
  ['AE — General', 'Initial Received Date',             'date',     0, null,              null, 11],
  ['AE — General', 'Report Source',                     'dropdown', 0, 'report_source',   null, 12],
  ['AE — General', 'Trial ID / Protocol Number',        'text',     0, null,              null, 13],
  ['AE — General', 'Sponsor Number',                    'text',     0, null,              null, 14],

  // ── AE — Events & Seriousness (+11) ──
  ['AE — Events & Seriousness', 'Verbatim Reaction',     'textarea', 0, null,             null, 20],
  ['AE — Events & Seriousness', 'MedDRA SOC',            'dropdown', 0, 'meddra_soc',     null, 21],
  ['AE — Events & Seriousness', 'MedDRA HLT',            'text',     0, null,             null, 22],
  ['AE — Events & Seriousness', 'MedDRA Version',        'text',     0, null,             null, 23],
  ['AE — Events & Seriousness', 'Number of Events',      'number',   0, null,             null, 24],
  ['AE — Events & Seriousness', 'Death Date',            'date',     0, null,             null, 25],
  ['AE — Events & Seriousness', 'Cause of Death',        'text',     0, null,             null, 26],
  ['AE — Events & Seriousness', 'Autopsy Performed',     'dropdown', 0, 'autopsy',        null, 27],
  ['AE — Events & Seriousness', 'Hospitalization Start Date', 'date', 0, null,            null, 28],
  ['AE — Events & Seriousness', 'Hospitalization End Date',   'date', 0, null,            null, 29],
  ['AE — Events & Seriousness', 'Admission Reason',      'text',     0, null,             null, 30],

  // ── AE — Patient Information (+13) ──
  ['AE — Patient Information', 'Patient ID',             'text',     0, null,              null, 10],
  ['AE — Patient Information', 'Patient First Initial',  'text',     0, null,              null, 11],
  ['AE — Patient Information', 'Patient Middle Initial', 'text',     0, null,              null, 12],
  ['AE — Patient Information', 'Patient Last Initial',   'text',     0, null,              null, 13],
  ['AE — Patient Information', 'Race / Ethnicity',       'dropdown', 0, 'race_ethnicity',  null, 14],
  ['AE — Patient Information', 'Pregnancy Trimester',    'dropdown', 0, 'pregnancy_trimester', null, 15],
  ['AE — Patient Information', 'Last Menstrual Period',  'date',     0, null,              null, 16],
  ['AE — Patient Information', 'Expected Delivery Date', 'date',     0, null,              null, 17],
  ['AE — Patient Information', 'Gestational Age at Onset', 'number', 0, null,              null, 18],
  ['AE — Patient Information', 'Birth Weight',           'number',   0, null,              null, 19],
  ['AE — Patient Information', 'Smoking Status',         'dropdown', 0, 'smoking_status',  null, 20],
  ['AE — Patient Information', 'Alcohol Use',            'dropdown', 0, 'alcohol_use',     null, 21],
  ['AE — Patient Information', 'Occupation',             'text',     0, null,              null, 22],
  ['AE — Patient Information', 'BMI',                    'number',   0, null,              null, 23],

  // ── AE — Product Information (+8) ──
  ['AE — Product Information', 'Brand Name',             'text',     0, null,              null, 20],
  ['AE — Product Information', 'Dosage Form',            'dropdown', 0, 'dosage_form',     null, 21],
  ['AE — Product Information', 'Strength',               'text',     0, null,              null, 22],
  ['AE — Product Information', 'NDC / GTIN Code',        'text',     0, null,              null, 23],
  ['AE — Product Information', 'Marketing Authorization Holder', 'text', 0, null,          null, 24],
  ['AE — Product Information', 'Suspect Drug Rank',      'dropdown', 0, 'suspect_drug_rank', null, 25],
  ['AE — Product Information', 'Time to Onset',          'text',     0, null,              null, 26],
  ['AE — Product Information', 'Cumulative Dose',        'text',     0, null,              null, 27],

  // ── AE — Causality Assessment (new section, per-drug) ──
  ['AE — Causality Assessment', 'Drug ID',                'text',     0, null,                 null, 1],
  ['AE — Causality Assessment', 'Causality Method',       'dropdown', 0, 'causality_method',    null, 2],
  ['AE — Causality Assessment', 'Causality Term',         'dropdown', 0, 'causality_term',      null, 3],
  ['AE — Causality Assessment', 'Causality Reason',       'textarea', 0, null,                  null, 4],
  ['AE — Causality Assessment', 'Assessed By',            'lookup',   0, null,                  'user', 5],
  ['AE — Causality Assessment', 'Assessment Date',        'date',     0, null,                  null, 6],

  // ── AE — Concomitant Medications (new multi-row section) ──
  ['AE — Concomitant Medications', 'Drug Name',          'text',     0, null,              null, 1],
  ['AE — Concomitant Medications', 'Active Substance',   'text',     0, null,              null, 2],
  ['AE — Concomitant Medications', 'Dose',               'text',     0, null,              null, 3],
  ['AE — Concomitant Medications', 'Frequency',          'text',     0, null,              null, 4],
  ['AE — Concomitant Medications', 'Start Date',         'date',     0, null,              null, 5],
  ['AE — Concomitant Medications', 'End Date',           'date',     0, null,              null, 6],
  ['AE — Concomitant Medications', 'Indication',         'text',     0, null,              null, 7],
  ['AE — Concomitant Medications', 'Was Suspect',        'checkbox', 0, null,              null, 8],

  // ── AE — Treatment of Event (new section) ──
  ['AE — Treatment of Event', 'Treatment Given',         'dropdown', 0, 'yes_no_unknown',  null, 1],
  ['AE — Treatment of Event', 'Treatment Description',   'textarea', 0, null,              null, 2],
  ['AE — Treatment of Event', 'Treatment Start',         'date',     0, null,              null, 3],
  ['AE — Treatment of Event', 'Treatment End',           'date',     0, null,              null, 4],
  ['AE — Treatment of Event', 'Hospitalization Required','checkbox', 0, null,              null, 5],
  ['AE — Treatment of Event', 'Outcome of Treatment',    'dropdown', 0, 'treatment_outcome', null, 6],

  // ── AE — Regulatory Reporting (new section) ──
  ['AE — Regulatory Reporting', 'Reportable To',         'multiselect', 0, 'reportable_to', null, 1],
  ['AE — Regulatory Reporting', 'Day-15 Reporting Required', 'checkbox', 0, null,         null, 2],
  ['AE — Regulatory Reporting', 'Day-7 Reporting Required',  'checkbox', 0, null,         null, 3],
  ['AE — Regulatory Reporting', 'Submitted to FDA Date',  'date',    0, null,            null, 4],
  ['AE — Regulatory Reporting', 'FDA Ack ID',             'text',    0, null,            null, 5],
  ['AE — Regulatory Reporting', 'Submitted to EMA Date',  'date',    0, null,            null, 6],
  ['AE — Regulatory Reporting', 'EMA Ack ID',             'text',    0, null,            null, 7],
  ['AE — Regulatory Reporting', 'Submitted to PMDA Date', 'date',    0, null,            null, 8],
  ['AE — Regulatory Reporting', 'PMDA Ack ID',            'text',    0, null,            null, 9],
  ['AE — Regulatory Reporting', 'Reporting Status',       'dropdown', 0, 'reporting_status', null, 10],
  ['AE — Regulatory Reporting', 'Initial Submission Date','date',    0, null,            null, 11],
  ['AE — Regulatory Reporting', 'Last Follow-up Submission Date', 'date', 0, null,       null, 12],

  // ── PC — General (+6) ──
  ['PC — General', 'Complaint Source',                  'dropdown', 0, 'complaint_source',  null, 10],
  ['PC — General', 'Initial Reporter',                  'text',     0, null,                null, 11],
  ['PC — General', 'Visual Defect Type',                'dropdown', 0, 'visual_defect_type',null, 12],
  ['PC — General', 'Sample Available',                  'dropdown', 0, 'yes_no_unknown',    null, 13],
  ['PC — General', 'Investigation Required',            'checkbox', 0, null,                null, 14],
  ['PC — General', 'Trend / Cluster Flag',              'checkbox', 0, null,                null, 15],

  // ── PC — Product Information (+7) ──
  ['PC — Product Information', 'Manufacturing Site',     'text',     0, null,             null, 10],
  ['PC — Product Information', 'Distribution Lot Information', 'text', 0, null,           null, 11],
  ['PC — Product Information', 'Date Dispensed to Patient', 'date',  0, null,             null, 12],
  ['PC — Product Information', 'Distribution Channel',  'dropdown', 0, 'distribution_channel', null, 13],
  ['PC — Product Information', 'Country of Sale',       'dropdown', 0, 'country',         null, 14],
  ['PC — Product Information', 'Storage Conditions as Reported', 'text', 0, null,         null, 15],
  ['PC — Product Information', 'Transport Conditions',  'text',     0, null,              null, 16],

  // ── PC — Investigation & CAPA (new section) ──
  ['PC — Investigation & CAPA', 'Investigation Status',  'dropdown', 0, 'investigation_status', null, 1],
  ['PC — Investigation & CAPA', 'Investigator Assigned', 'lookup',   0, null,                  'user', 2],
  ['PC — Investigation & CAPA', 'Estimated Completion Date', 'date', 0, null,                  null, 3],
  ['PC — Investigation & CAPA', 'Actual Completion Date',   'date',  0, null,                  null, 4],
  ['PC — Investigation & CAPA', 'Root Cause Analysis',    'textarea', 0, null,                 null, 5],
  ['PC — Investigation & CAPA', 'Investigation Findings', 'textarea', 0, null,                 null, 6],
  ['PC — Investigation & CAPA', 'CAPA Required',          'checkbox', 0, null,                 null, 7],
  ['PC — Investigation & CAPA', 'CAPA Reference Number',  'text',     0, null,                 null, 8],
  ['PC — Investigation & CAPA', 'CAPA Owner',             'lookup',   0, null,                 'user', 9],
  ['PC — Investigation & CAPA', 'CAPA Due Date',          'date',     0, null,                 null, 10],
  ['PC — Investigation & CAPA', 'Field Action Required',  'dropdown', 0, 'field_action_required', null, 11],
  ['PC — Investigation & CAPA', 'Field Action Type',      'dropdown', 0, 'field_action_type',  null, 12],
  ['PC — Investigation & CAPA', 'Regulatory Notification Required', 'dropdown', 0, 'regulatory_notification', null, 13],
  ['PC — Investigation & CAPA', 'Reportability Determination', 'dropdown', 0, 'reportability_determination', null, 14],
  ['PC — Investigation & CAPA', 'Reportability Justification', 'textarea', 0, null,           null, 15],

  // ── Cross-cutting: Linked Records (per case type — common across AE / MI / PC) ──
  ['Linked Records', 'Parent Case',                     'lookup',     0, null, 'case', 1],
  ['Linked Records', 'Linked Reporter Master ID',       'text',       0, null, null, 2],
  ['Linked Records', 'Linked Patient Master ID',        'text',       0, null, null, 3],
  ['Linked Records', 'External System IDs',             'textarea',   0, null, null, 4],

  // ── Cross-cutting: Communications Log (multi-row) ──
  ['Communications Log', 'Communication Date',          'date',      0, null,             null, 1],
  ['Communications Log', 'Direction',                   'dropdown',  0, 'comm_direction', null, 2],
  ['Communications Log', 'Channel',                     'dropdown',  0, 'comm_channel',   null, 3],
  ['Communications Log', 'From',                        'text',      0, null,             null, 4],
  ['Communications Log', 'To',                          'text',      0, null,             null, 5],
  ['Communications Log', 'Subject',                     'text',      0, null,             null, 6],
  ['Communications Log', 'Summary',                     'textarea',  0, null,             null, 7],

  // ── Cross-cutting: Quality Assurance ──
  ['Quality Assurance', 'QA Status',                    'dropdown', 0, 'qa_status', null, 1],
  ['Quality Assurance', 'QA Reviewer',                  'lookup',   0, null,         'user', 2],
  ['Quality Assurance', 'QA Review Date',               'date',     0, null,         null, 3],
  ['Quality Assurance', 'QA Findings / Defects',        'textarea', 0, null,         null, 4],
  ['Quality Assurance', 'QA Sign-off',                  'text',     0, null,         null, 5],
  ['Quality Assurance', 'Quality Score',                'number',   0, null,         null, 6],
];

// ─────────────────────────────────────────────────────────────────────────────
// EXTRA SECTIONS — appended to CASE_FORM_SECTIONS so case_form_definition has rows
// ─────────────────────────────────────────────────────────────────────────────

const EXTRA_SECTIONS = {
  ALL: ['Reporter Documentation', 'Linked Records', 'Communications Log', 'Quality Assurance'],
  MI:  ['MI — Follow-up & Outcome'],
  AE:  ['AE — Causality Assessment', 'AE — Concomitant Medications', 'AE — Treatment of Event', 'AE — Regulatory Reporting'],
  PC:  ['PC — Investigation & CAPA'],
};

// ─────────────────────────────────────────────────────────────────────────────
// EXTRA PICKLIST GROUPS — appended to PICKLIST_GROUPS at seed time
// ─────────────────────────────────────────────────────────────────────────────

const EXTRA_PICKLIST_GROUPS = [
  { category: 'Reporter', field: 'relationship_to_patient', values: ['Self', 'Family Member', 'Healthcare Professional', 'Pharmacist', 'Lawyer', 'Other'] },

  { category: 'Case', field: 'case_subtype',     values: ['Initial', 'Follow-up', 'Amendment', 'Withdrawn'] },
  { category: 'Case', field: 'case_resolution',  values: ['Resolved', 'Withdrawn', 'Duplicate', 'Cancelled', 'Transferred', 'Not Reportable'] },
  { category: 'Case', field: 'case_tags',        values: ['Demo', 'Training', 'Q4 Audit', 'High Priority', 'Internal Test'] },

  { category: 'Medical Inquiry', field: 'question_source',     values: ['Drug Information Service', 'Customer Service', 'Field Sales', 'Medical Affairs', 'Other'] },
  { category: 'Medical Inquiry', field: 'question_channel',    values: ['Email', 'Phone', 'Portal', 'Chat', 'Letter', 'Fax'] },
  { category: 'Medical Inquiry', field: 'urgency_level',       values: ['Critical', 'High', 'Normal', 'Low'] },
  { category: 'Medical Inquiry', field: 'mi_approval_status',  values: ['Draft', 'In Review', 'Approved', 'Rejected', 'Sent'] },
  { category: 'Medical Inquiry', field: 'target_language',     values: ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Japanese', 'Chinese', 'Other'] },
  { category: 'Medical Inquiry', field: 'follow_up_channel',   values: ['Email', 'Phone', 'Letter', 'Portal'] },

  { category: 'Adverse Event', field: 'report_source',  values: ['Spontaneous', 'Solicited', 'Clinical Trial', 'Post-Marketing Study', 'Literature', 'Other'] },
  { category: 'Adverse Event', field: 'meddra_soc',     values: [
    'Blood and lymphatic system disorders', 'Cardiac disorders', 'Endocrine disorders',
    'Eye disorders', 'Gastrointestinal disorders', 'General disorders and administration site conditions',
    'Hepatobiliary disorders', 'Immune system disorders', 'Infections and infestations',
    'Investigations', 'Metabolism and nutrition disorders', 'Musculoskeletal and connective tissue disorders',
    'Neoplasms benign, malignant and unspecified', 'Nervous system disorders', 'Psychiatric disorders',
    'Renal and urinary disorders', 'Reproductive system and breast disorders', 'Respiratory disorders',
    'Skin and subcutaneous tissue disorders', 'Vascular disorders', 'Other',
  ]},
  { category: 'Adverse Event', field: 'autopsy',            values: ['Yes', 'No', 'Unknown'] },
  { category: 'Adverse Event', field: 'race_ethnicity',     values: ['White / Caucasian', 'Black / African American', 'Asian', 'Hispanic / Latino', 'Native American', 'Pacific Islander', 'Other', 'Unknown', 'Prefer not to say'] },
  { category: 'Adverse Event', field: 'pregnancy_trimester',values: ['First Trimester', 'Second Trimester', 'Third Trimester', 'Unknown'] },
  { category: 'Adverse Event', field: 'smoking_status',     values: ['Never Smoker', 'Former Smoker', 'Current Smoker', 'Unknown'] },
  { category: 'Adverse Event', field: 'alcohol_use',        values: ['None', 'Occasional', 'Regular', 'Heavy', 'Unknown'] },
  { category: 'Adverse Event', field: 'suspect_drug_rank',  values: ['Primary Suspect', 'Secondary Suspect', 'Concomitant', 'Interacting', 'Past'] },
  { category: 'Adverse Event', field: 'causality_method',   values: ['WHO-UMC', 'Naranjo', 'French', 'Other'] },
  { category: 'Adverse Event', field: 'causality_term',     values: ['Certain', 'Probable', 'Possible', 'Unlikely', 'Conditional', 'Unassessable'] },
  { category: 'Adverse Event', field: 'treatment_outcome',  values: ['Resolved', 'Improved', 'Unchanged', 'Worsened', 'Unknown'] },
  { category: 'Adverse Event', field: 'reportable_to',      values: ['FDA', 'EMA', 'PMDA', 'MHRA', 'Health Canada', 'TGA', 'Other'] },
  { category: 'Adverse Event', field: 'reporting_status',   values: ['Pending', 'Submitted', 'Acknowledged', 'Rejected', 'Withdrawn'] },

  { category: 'Product', field: 'dosage_form',         values: ['Tablet', 'Capsule', 'Injection', 'Cream', 'Ointment', 'Patch', 'Inhaler', 'Solution', 'Suspension', 'Suppository', 'Spray', 'Drops', 'Other'] },

  { category: 'Product Complaint', field: 'complaint_source',    values: ['Verbal', 'Written', 'Online Portal', 'Email', 'Lab', 'Field Sales', 'Other'] },
  { category: 'Product Complaint', field: 'visual_defect_type',  values: ['Visual', 'Functional', 'Packaging', 'Labeling', 'Instructions', 'Contamination', 'Other'] },
  { category: 'Product Complaint', field: 'distribution_channel',values: ['Pharmacy', 'Online', 'Hospital', 'Clinic', 'Mail Order', 'Other'] },
  { category: 'Product Complaint', field: 'investigation_status',values: ['Not Started', 'In Progress', 'On Hold', 'Complete', 'Closed'] },
  { category: 'Product Complaint', field: 'field_action_required', values: ['None', 'Recall', 'Correction', 'Investigation Only', 'Field Safety Notice'] },
  { category: 'Product Complaint', field: 'field_action_type',  values: ['Class I', 'Class II', 'Class III', 'Not Classified'] },
  { category: 'Product Complaint', field: 'regulatory_notification', values: ['FDA MDR', 'EU MIR', 'MHRA', 'PMDA', 'Health Canada', 'None Required'] },
  { category: 'Product Complaint', field: 'reportability_determination', values: ['2-day', '30-day', 'Annual', 'Not Reportable'] },

  { category: 'Cross-Case', field: 'yes_no_unknown',  values: ['Yes', 'No', 'Unknown'] },
  { category: 'Cross-Case', field: 'comm_direction',  values: ['Inbound', 'Outbound'] },
  { category: 'Cross-Case', field: 'comm_channel',    values: ['Email', 'Phone', 'Letter', 'Fax', 'In-Person', 'Portal', 'Chat'] },
  { category: 'Cross-Case', field: 'qa_status',       values: ['Not Reviewed', 'Under Review', 'Approved', 'Returned for Rework'] },
];

module.exports = { EXTRA_FIELDS, EXTRA_SECTIONS, EXTRA_PICKLIST_GROUPS };
