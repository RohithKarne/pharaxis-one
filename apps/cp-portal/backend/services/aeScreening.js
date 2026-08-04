'use strict';

/**
 * services/aeScreening.js — adverse-event screening on portal submissions (PD-2)
 *
 * Today the submitter's choice of tile is the only thing deciding whether a
 * report is treated as a safety report. Someone describing a hospitalisation
 * under "Medical Information Request" travels onward as an inquiry and nobody
 * looks for the adverse event. This asks them directly.
 *
 * WHY ASKING, NOT INFERRING
 *   Reusing the MIMS email classifier was measured against 86 portal-shaped
 *   submissions and missed 82% — "jaundice and deranged LFTs", "my little boy
 *   went floppy and grey", "we called 999" all score zero. A keyword lexicon
 *   cannot screen unbounded human description of harm. Full numbers in PD-2.
 *   Known limitation of asking instead: a reporter who does not recognise what
 *   they experienced as harm answers No. The help text is the mitigation.
 *
 * SYSTEM-MANAGED, DELIBERATELY
 *   These fields are injected server-side and a client cannot remove, hide or
 *   rename them through the form builder. A screening control a client can
 *   switch off is not a control. Injection happens in exactly one place — the
 *   forms endpoint — so there is no second path that bypasses it.
 */

const AE_SCREEN_KEY        = 'ae_screen_answer';
const AE_SCREEN_DETAIL_KEY = 'ae_screen_detail';
const AE_SCREEN_VALUES     = ['Yes', 'No'];

// Not screened: an adverse_event submission is already an AE report.
const UNSCREENED_FORM_TYPES = ['adverse_event'];

/**
 * The wording is Sowmya's and is a clinical decision, not copy.
 *  - "became unwell" not "side effect": a side effect presumes attribution the
 *    reporter is not qualified to make, and an unsure reporter answers No.
 *  - "anyone" not "you": the reporter is frequently not the patient.
 *  - "after using" not "caused by": temporal, never causal.
 *  - The help text is what converts a hesitant No into a Yes. Do not trim it.
 */
const AE_SCREEN_FIELDS = [
  {
    id: 'ae-screen-answer', field_key: AE_SCREEN_KEY,
    label: 'Did anyone become unwell, or have an unexpected medical problem, after using the product?',
    field_type: 'radio', options: AE_SCREEN_VALUES.join('\n'), placeholder: null,
    help_text: 'This includes anything you did not expect — however minor, and whether or not you think the product caused it.',
    is_required: 1, display_order: 9999, system_managed: 1,
  },
  {
    id: 'ae-screen-detail', field_key: AE_SCREEN_DETAIL_KEY,
    label: 'Please tell us what happened', field_type: 'textarea', options: null,
    placeholder: 'In your own words. Anything you can tell us helps.',
    // Optional deliberately. A mandatory narrative is a barrier — a reporter who
    // cannot articulate it will change their answer to No to get past the form.
    // A "Yes" with no detail is still a valuable flag.
    help_text: 'Optional.', is_required: 0, display_order: 10000, system_managed: 1,
    show_when: { field: AE_SCREEN_KEY, equals: 'Yes' },
  },
];

function isScreenedType(formType) {
  return !UNSCREENED_FORM_TYPES.includes(formType);
}

/**
 * Append the screening fields to a client's configured fields.
 * Any client field colliding with a system key is dropped — the system wins.
 */
function withAeScreening(fields, formType) {
  if (!isScreenedType(formType)) return fields;
  const cleaned = (fields || []).filter(
    (f) => f.field_key !== AE_SCREEN_KEY && f.field_key !== AE_SCREEN_DETAIL_KEY
  );
  return [...cleaned, ...AE_SCREEN_FIELDS];
}

/**
 * Validate the submitted answer. Returns an error string, or null when valid.
 * Answering is mandatory on every screened form type.
 */
function validateAnswer(formType, formData) {
  if (!isScreenedType(formType)) return null;
  const answer = formData ? formData[AE_SCREEN_KEY] : undefined;
  if (answer === undefined || answer === null || String(answer).trim() === '') {
    return 'Please answer whether anyone became unwell after using the product.';
  }
  if (!AE_SCREEN_VALUES.includes(String(answer).trim())) {
    return 'Please answer Yes or No.';
  }
  return null;
}

/** True when this submission must raise a safety review task. */
function isFlagged(formType, formData) {
  return isScreenedType(formType) && String(formData?.[AE_SCREEN_KEY] || '').trim() === 'Yes';
}

module.exports = {
  AE_SCREEN_KEY,
  AE_SCREEN_DETAIL_KEY,
  AE_SCREEN_VALUES,
  AE_SCREEN_FIELDS,
  isScreenedType,
  withAeScreening,
  validateAnswer,
  isFlagged,
};
