'use strict';

/**
 * services/formFields.js — the fields a portal form is made of (CPPM-7).
 *
 * One loader for both sides: the forms endpoint sends these to the page, and the
 * submit route checks required fields against exactly the same list. Two copies
 * of this logic would drift, and the server would then reject what the page
 * allowed, or accept what the page would have blocked.
 */

const { pool } = require('../database/db');
const { withAeScreening } = require('./aeScreening');

// CP-10: default structured Adverse Event form, used when a client hasn't configured
// one. Covers the pharmacovigilance minimum criteria (identifiable patient, reporter,
// suspect product, event) as required fields. Clients can override in the form builder.
// Select options are newline-separated to match the portal form renderer.
const DEFAULT_AE_FIELDS = [
  { field_key: 'patient_initials',  label: 'Patient initials or identifier', field_type: 'text',     options: null, placeholder: 'e.g. J.D.',   help_text: 'An identifiable patient is required to report an adverse event.', is_required: 1, display_order: 1 },
  { field_key: 'patient_age',       label: 'Patient age',                    field_type: 'text',     options: null, placeholder: 'Years',      help_text: '', is_required: 0, display_order: 2 },
  { field_key: 'patient_sex',       label: 'Patient sex',                    field_type: 'select',   options: 'Male\nFemale\nOther\nUnknown', placeholder: '', help_text: '', is_required: 0, display_order: 3 },
  { field_key: 'suspect_product',   label: 'Suspect product',                field_type: 'text',     options: null, placeholder: 'Product name', help_text: '', is_required: 1, display_order: 4 },
  { field_key: 'event_description', label: 'Describe the adverse event',     field_type: 'textarea', options: null, placeholder: 'What happened, and when?', help_text: '', is_required: 1, display_order: 5 },
  { field_key: 'seriousness',       label: 'Seriousness',                    field_type: 'select',   options: 'Death\nLife-threatening\nHospitalization\nDisability\nCongenital anomaly\nOther', placeholder: '', help_text: '', is_required: 1, display_order: 6 },
  { field_key: 'onset_date',        label: 'Event onset date',               field_type: 'text',     options: null, placeholder: 'YYYY-MM-DD', help_text: '', is_required: 0, display_order: 7 },
  { field_key: 'outcome',           label: 'Outcome',                        field_type: 'select',   options: 'Recovered\nRecovering\nNot recovered\nFatal\nUnknown', placeholder: '', help_text: '', is_required: 0, display_order: 8 },
  { field_key: 'reporter_type',     label: 'Reporter',                       field_type: 'select',   options: 'Healthcare professional\nPatient\nOther', placeholder: '', help_text: '', is_required: 1, display_order: 9 },
  { field_key: 'reporter_contact',  label: 'Reporter contact (email or phone)', field_type: 'text',  options: null, placeholder: 'For follow-up', help_text: '', is_required: 0, display_order: 10 },
].map((f, i) => ({ id: `ae-default-${i}`, ...f }));

async function loadFormFields(clientId, formType) {
  const [rows] = await pool.execute(
    'SELECT id, field_key, field_label AS label, field_type, field_options AS options, placeholder, help_text, is_required, display_order FROM cp_form_config WHERE client_id=? AND form_type=? AND is_active=1 ORDER BY display_order ASC',
    [clientId, formType]
  );
  // Fall back to the structured AE template when no AE form is configured.
  if (rows.length === 0 && formType === 'adverse_event') return { fields: DEFAULT_AE_FIELDS, defaultTemplate: true };
  // An unconfigured non-AE form has no usable form at all — the portal shows
  // "not configured" and nothing can be submitted. Injecting into it would
  // render a form consisting only of the screening question.
  if (rows.length === 0) return { fields: rows, defaultTemplate: false };
  return { fields: withAeScreening(rows, formType), defaultTemplate: false };
}

// Same rule as the page: only fields the person can see are checked (a
// show_when field hidden by another answer is not required), and a value that
// is missing, false or only spaces counts as empty.
function isVisible(field, values) {
  const cond = field.show_when;
  if (!cond || !cond.field) return true;
  return String(values[cond.field] ?? '') === String(cond.equals);
}

function missingRequired(fields, values) {
  return fields.filter(f => f.is_required && isVisible(f, values)).filter(f => {
    const v = values[f.field_key];
    return v === undefined || v === null || v === false || String(v).trim() === '';
  });
}

module.exports = { loadFormFields, missingRequired, DEFAULT_AE_FIELDS };
