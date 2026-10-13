'use strict';

/**
 * e2bFieldTags.js — which case form fields reach the E2B file MIMS writes.
 *
 * Read from the code, not from the standard: a field is tagged when the ICSR
 * builder seeds its value (routes/admin/icsr.js, POST /icsr) and the generator
 * writes it (services/pv/e2bGenerator.js). The tag is the generator's element.
 * Shown as the E2B badge on Case Form Fields (case form clean-up PR 5), so an
 * admin sees which fields feed a regulatory report before hiding one.
 *
 * Not tagged, on purpose: Dechallenge (stored on the ICSR drug but the
 * generator does not write it), lab results and medical history (the builder
 * does not seed them from the AE tab), Verbatim Reaction (the builder seeds the
 * reaction from MedDRA Term or Event Description).
 */

const TAGS = {
  'Case Information::Latest Information Date': 'receiptdate',
  'Case Information::Description': 'narrativeincludeclinical',
  'AE — Events & Seriousness::Event Description': 'reactionprimarysourcereaction',
  'AE — Events & Seriousness::MedDRA Term': 'reactionprimarysourcereaction',
  'AE — Events & Seriousness::Onset Date': 'reactionstartdate',
  'AE — Events & Seriousness::End Date': 'reactionenddate',
  'AE — Events & Seriousness::Outcome': 'reactionoutcome',
  'AE — Events & Seriousness::Serious — Death': 'seriousnessdeath',
  'AE — Events & Seriousness::Serious — Life Threatening': 'seriousnesslifethreatening',
  'AE — Events & Seriousness::Serious — Hospitalisation': 'seriousnesshospitalization',
  'AE — Events & Seriousness::Serious — Disability': 'seriousnessdisabling',
  'AE — Events & Seriousness::Serious — Congenital Anomaly': 'seriousnesscongenitalanomali',
  'AE — Events & Seriousness::Serious — Other Medically Important': 'seriousnessother',
  'AE — Product Information::Product Name': 'medicinalproduct',
  'AE — Product Information::Role': 'drugcharacterization',
  'AE — Product Information::Batch / Lot Number': 'drugbatchnumb',
  'AE — Product Information::Dose': 'drugstructuredosagenumb',
  'AE — Product Information::Dose Unit': 'drugstructuredosageunit',
  'AE — Product Information::Route of Administration': 'drugadministrationroute',
  'AE — Product Information::Indication': 'drugindication',
  'AE — Product Information::Start Date': 'drugstartdate',
  'AE — Product Information::Stop Date': 'drugenddate',
  'AE — Product Information::Action Taken': 'actiondrug',
  'AE — Patient Information::Patient Initials': 'patientinitial',
  'AE — Patient Information::Date of Birth': 'patientbirthdate',
  'AE — Patient Information::Gender': 'patientsex',
};

function e2bTag(sectionName, fieldName) {
  return TAGS[`${sectionName}::${fieldName}`] || null;
}

module.exports = { e2bTag };
