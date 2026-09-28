'use strict';

/**
 * Fields the AE and PC panels draw themselves (AETabPanel / PCTabPanel), tied to
 * the field_setup row the admin configures in Customize Forms.
 *
 * - migration 109 gives each row its core_key, so formConfig.core carries the
 *   admin's label / required / hidden for it and the "additional fields" block
 *   stops drawing it a second time;
 * - the AE/PC save routes check required against `key` (what the panel sends).
 *
 * `field` is the field_setup name; where the panel's label differs, the panel
 * maps it (AETabPanel/PCTabPanel FIELD_ALIASES). Panel fields with no field_setup
 * row are not listed — admins cannot configure them yet.
 */

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const ROWS = [
  // scope, tab,             section,                      field,                      key
  ['ae', 'general',          'AE — General',               'AE Status',                'ae_status'],
  ['ae', 'general',          'AE — General',               'Date of Awareness',        'date_of_awareness'],
  ['ae', 'general',          'AE — General',               'Report Type',              'report_type'],
  ['ae', 'general',          'AE — General',               'Regulatory Reportability', 'regulatory_reportability'],
  ['ae', 'general',          'AE — General',               'Date of Report',           'date_of_report'],
  ['ae', 'general',          'AE — General',               'Reporter Awareness Date',  'reporter_awareness_date'],
  ['ae', 'patient-info',     'AE — Patient Information',   'Patient Initials',         'patient_initials'],
  ['ae', 'patient-info',     'AE — Patient Information',   'Date of Birth',            'date_of_birth'],
  ['ae', 'patient-info',     'AE — Patient Information',   'Age',                      'age'],
  ['ae', 'patient-info',     'AE — Patient Information',   'Age Unit',                 'age_unit'],
  ['ae', 'patient-info',     'AE — Patient Information',   'Gender',                   'sex'],
  ['ae', 'patient-info',     'AE — Patient Information',   'Weight (kg)',              'weight_kg'],
  ['ae', 'patient-info',     'AE — Patient Information',   'Height (cm)',              'height_cm'],
  ['ae', 'patient-info',     'AE — Patient Information',   'Race / Ethnicity',         'ethnicity'],
  ['ae', 'patient-info',     'AE — Patient Information',   'Last Menstrual Period',    'last_menstrual_date'],
  ['ae', 'patient-info',     'AE — Patient Information',   'Pregnant',                 'pregnant'],
  ['ae', 'patient-info',     'AE — Patient Information',   'Patient Country',          'patient_country'],
  ['pc', 'general',          'PC — General',               'Complaint Description',    'complaint_description'],
  ['pc', 'general',          'PC — General',               'PC Status',                'pc_status'],
  ['pc', 'general',          'PC — General',               'PC Category',              'pc_category'],
  ['pc', 'general',          'PC — General',               'PC Classification',        'pc_classification'],
  ['pc', 'general',          'PC — General',               'Date of Complaint',        'date_of_complaint'],
  ['pc', 'general',          'PC — General',               'Date Received',            'date_received'],
  ['pc', 'general',          'PC — General',               'Severity',                 'severity'],
  ['pc', 'general',          'PC — General',               'Root Cause',               'root_cause'],
  ['pc', 'patient-info',     'PC — Patient Information',   'Patient Name',             'patient_name'],
  ['pc', 'patient-info',     'PC — Patient Information',   'Date of Birth',            'date_of_birth'],
  ['pc', 'patient-info',     'PC — Patient Information',   'Gender',                   'sex'],
  ['pc', 'patient-info',     'PC — Patient Information',   'Injury Experienced',       'injury_experienced'],
  ['pc', 'product-info',     'PC — Product Information',   'Product Name',             'product_name'],
  ['pc', 'product-info',     'PC — Product Information',   'Product Type',             'product_type'],
  ['pc', 'product-info',     'PC — Product Information',   'Product Category',         'product_category'],
  ['pc', 'product-info',     'PC — Product Information',   'Batch / Lot Number',       'lot_number'],
  ['pc', 'product-info',     'PC — Product Information',   'Expiry Date',              'expiry_date'],
  ['pc', 'product-info',     'PC — Product Information',   'Manufacturing Date',       'manufacturing_date'],
  ['pc', 'product-info',     'PC — Product Information',   'Pack Size',                'pack_size'],
  ['pc', 'product-info',     'PC — Product Information',   'Storage Conditions',       'storage_conditions'],
  ['pc', 'return-retrieval', 'PC — Return & Retrieval',    'Return Requested',         'return_requested', 'bool'],
  ['pc', 'return-retrieval', 'PC — Return & Retrieval',    'Return Date',              'return_date'],
  ['pc', 'return-retrieval', 'PC — Return & Retrieval',    'Return Address',           'return_address'],
  ['pc', 'return-retrieval', 'PC — Return & Retrieval',    'Retrieval Method',         'retrieval_method'],
  ['pc', 'return-retrieval', 'PC — Return & Retrieval',    'Return Notes',             'notes_return'],
  ['pc', 'replacement',      'PC — Replacement',           'Replacement Approved',     'replacement_approved', 'bool'],
  ['pc', 'replacement',      'PC — Replacement',           'Replacement Ship Date',    'replacement_date'],
  ['pc', 'replacement',      'PC — Replacement',           'Replacement Quantity',     'quantity'],
  ['pc', 'replacement',      'PC — Replacement',           'Replacement Notes',        'notes_replacement'],
  ['pc', 'refund-credit',    'PC — Refund & Credit',       'Refund Approved',          'refund_approved', 'bool'],
  ['pc', 'refund-credit',    'PC — Refund & Credit',       'Refund Amount',            'refund_amount'],
  ['pc', 'refund-credit',    'PC — Refund & Credit',       'Credit Note Number',       'credit_note_number'],
  ['pc', 'refund-credit',    'PC — Refund & Credit',       'Refund Notes',             'notes_refund'],
];

// A tick-box ('bool') takes the admin's label and hidden setting but is never
// required — unticked is a valid answer, not a missing one.
const PANEL_CORE_FIELDS = ROWS.map(([scope, tab, section, field, key, type = 'value']) => ({
  scope, tab, section, field, key, type,
  coreKey: `${scope}_${slug(tab)}_${slug(field)}`.slice(0, 64),
}));

module.exports = { PANEL_CORE_FIELDS };
