'use strict';

// The four things that make a side-effect report a valid case (EMA GVP Module VI,
// 21 CFR 314.80): an identifiable patient, an identifiable reporter, a suspect
// product and a reaction. A report missing any of them is still KEPT and sent on;
// the missing ones are named so the safety team follows up (S1, Rohith 2026-11-12).
// It replaces a check that refused such reports, so their information was lost.

const has = (v) => v != null && String(v).trim() !== '';

const LABELS = {
  patient: 'patient (initials, age or sex)',
  reporter: 'reporter (name or email)',
  product: 'suspect product',
  reaction: 'side effect description',
};

// Keys in the order the criteria are named. `submitter` is the stored submission
// row (submitter_name, submitter_email, user_id) when there is one.
function missingAeCriteria(form = {}, submitter = {}) {
  const f = form || {};
  const name = [f.first_name, f.last_name].filter(has).join(' ')
    || f.reporter_name || f.full_name || f.name;
  const present = {
    patient: [f.patient_initials, f.patient_age, f.patient_sex, f.age, f.gender, f.initials].some(has),
    reporter: [submitter.submitter_name, submitter.submitter_email, submitter.user_id, name,
      f.email, f.reporter_email, f.contact_email].some(has),
    product: [f.product_name, f.suspect_product, f.drug_name, f.product].some(has),
    reaction: [f.event_description, f.description, f.reaction_description, f.event_details, f.details].some(has),
  };
  return Object.keys(LABELS).filter((k) => !present[k]);
}

module.exports = { missingAeCriteria, AE_CRITERIA_LABELS: LABELS };
