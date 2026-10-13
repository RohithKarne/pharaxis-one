'use strict';

/**
 * caseFormCutList.js — the case form clean-up cut list (PR 3), as Saad signed it
 * and Rohith ordered built on 13 Oct 2026.
 *
 * One list read by three places:
 *   - migration 174 hides these fields and switches these sections off in every
 *     existing organisation;
 *   - seedService leaves them out of a new organisation (PR 6);
 *   - the Case Form Fields screen marks them "removed in the clean-up".
 *
 * A cut is a hide, never a delete: stored values and their history stay in the
 * database and stay readable in the audit trail. A field whose own input holds a
 * value in an organisation is NOT hidden there — it waits for Rohith's word, with
 * its count on the Case Form Fields screen (the rule agreed for PR 3). A row
 * marked `decided` was already decided by Rohith and is hidden whatever it holds:
 * MedDRA coding and company causality belong to the receiving safety system
 * (migration 121, 29 Sep 2026); the old Concomitant flag is replaced by Role,
 * which shows the same stored value.
 *
 * `panel: true` marks a field a panel draws itself (it has a core key). For a
 * new organisation those are still seeded, hidden, because a panel field with no
 * row would fall back to being shown.
 */

const ALL = ['MI', 'AE', 'PC'];

const CUT_FIELDS = [
  // ── Case Information, every case type ──
  ...['Due Date', 'Created By', 'Case Subtype', 'Parent Case ID', 'Worldwide Unique Case ID',
    'External CRM ID', 'External EMR ID', 'Sales Rep / Territory', 'Watchers', 'Co-owners',
    'Case Resolution Type', 'Case Closed Date', 'Closed Reason']
    .map(field => ({ section: 'Case Information', field })),
  // Linked Records keeps Parent Case only.
  ...['Linked Reporter Master ID', 'Linked Patient Master ID', 'External System IDs']
    .map(field => ({ section: 'Linked Records', field })),

  // ── Contacts: four classifications of one person become Role + Reporter Type ──
  // The contact form draws these itself and shows a field that has no setting,
  // so for a new organisation they are seeded hidden, not left out.
  // Rohith, 13 Oct 2026, on Saad's call: Reporter Type stays (the New Case popup
  // asks it on every case and the PV hand-off sends it); Contact Type and
  // Qualification are hidden whatever they hold (migration 175). Country of
  // Reporter and Source are hidden where empty.
  { section: 'Contact / Requestor', field: 'Contact Type', panel: true, decided: true },
  { section: 'Contact / Requestor', field: 'Qualification', panel: true, decided: true },
  { section: 'Contact / Requestor', field: 'Country of Reporter', panel: true },
  { section: 'Contact / Requestor', field: 'Source', panel: true },

  // ── MI ──
  ...['Question Source', 'Question Channel', 'Urgency Level']
    .map(field => ({ section: 'MI — Category & Product', field })),
  { section: 'MI — Response', field: 'Response Date', panel: true, decided: true },
  ...['Country-specific PI Reference', 'PI Version Used', 'Reference Documents Used', 'Response Template Used',
    'Approval Status', 'Reviewer Name', 'Reviewer Date', 'Approver Name', 'Approver Date',
    'HCP Wants Written Response', 'Translation Required', 'Target Language']
    .map(field => ({ section: 'MI — Response', field })),
  ...['Follow-up Channel', 'Follow-up Completed', 'Follow-up Completed Date', 'HCP Satisfaction Score',
    'HCP Feedback Notes', 'Closed-Loop Confirmation']
    .map(field => ({ section: 'MI — Follow-up & Outcome', field })),

  // MI and PC review (Rohith, 13 Oct 2026, "go with all 6"): the answer lives in
  // the signed letter, so the MI's own answer box goes; the classification
  // block's off-label tick is the one that starts two signers; Patient-specific
  // had no rule behind it. Hidden whatever they hold (migration 176).
  { section: 'MI — Response', field: 'Response Provided', panel: true, decided: true },
  { section: 'MI — Category & Product', field: 'Off-Label Discussion', decided: true },
  { section: 'MI — Category & Product', field: 'Patient-specific', decided: true },

  // ── AE General: Date Received is Day 0, Latest Information Date is added ──
  { section: 'AE — General', field: 'AE Version' },
  { section: 'AE — General', field: 'Date of Awareness', panel: true },
  { section: 'AE — General', field: 'Reporter Awareness Date', panel: true },
  { section: 'AE — General', field: 'Date of Report', panel: true },
  { section: 'AE — General', field: 'Initial Received Date' },
  { section: 'AE — General', field: 'Report Source' },

  // ── AE Events: event facts live on the event row; coding is the safety system's ──
  { section: 'AE — Events & Seriousness', field: 'MedDRA Term', panel: true, decided: true },
  { section: 'AE — Events & Seriousness', field: 'Causality Assessment', panel: true, decided: true },
  { section: 'AE — Events & Seriousness', field: 'MedDRA SOC', decided: true },
  { section: 'AE — Events & Seriousness', field: 'MedDRA HLT', decided: true },
  { section: 'AE — Events & Seriousness', field: 'MedDRA Version', decided: true },
  { section: 'AE — Events & Seriousness', field: 'Seriousness', panel: true },
  ...['Number of Events', 'Death Date', 'Cause of Death', 'Autopsy Performed', 'Admission Reason']
    .map(field => ({ section: 'AE — Events & Seriousness', field })),

  // ── AE Patient: one initials field; pregnancy detail only when pregnant ──
  ...['Patient ID', 'Patient First Initial', 'Patient Middle Initial', 'Patient Last Initial',
    'Expected Delivery Date', 'Gestational Age at Onset', 'Birth Weight', 'Smoking Status',
    'Alcohol Use', 'Occupation', 'BMI']
    .map(field => ({ section: 'AE — Patient Information', field })),

  // ── AE Products: product facts live on the product row ──
  ...['Product Type', 'Product Category', 'Administration Route', 'Is Suspect', 'Is Concomitant',
    'Dechallenge', 'Rechallenge', 'Brand Name', 'Dosage Form', 'Strength', 'NDC / GTIN Code',
    'Marketing Authorization Holder', 'Suspect Drug Rank', 'Time to Onset', 'Cumulative Dose']
    .map(field => ({ section: 'AE — Product Information', field })),
  { section: 'AE — Product Information', field: 'Concomitant Medications', panel: true, decided: true },

  // ── AE Treatment keeps Given and Description ──
  ...['Treatment Start', 'Treatment End', 'Hospitalization Required', 'Outcome of Treatment']
    .map(field => ({ section: 'AE — Treatment of Event', field })),

  // ── PC ──
  // MI and PC review (Rohith, 13 Oct 2026, "go with all 6"; migration 177),
  // hidden whatever they hold:
  // - seriousness and type graded five ways: Category and Severity stay;
  // - sample available three times: the product's tick stays; complaint source
  //   repeats the case's intake channel; trending is Quality's;
  // - the patient is held as initials and age, not name and date of birth;
  // - Investigation & CAPA keeps what the complaint record needs (21 CFR
  //   211.198(b)(2)-(3)): investigation needed or why not and who decided, the
  //   findings, the CAPA reference, and reportability. The investigation itself
  //   runs in the client's quality system.
  { section: 'PC — General', field: 'PC Classification', panel: true, decided: true },
  ...['Visual Defect Type', 'Sample Available', 'Complaint Source', 'Trend / Cluster Flag']
    .map(field => ({ section: 'PC — General', field, decided: true })),
  { section: 'PC — Patient Information', field: 'Patient Name', panel: true, decided: true },
  { section: 'PC — Patient Information', field: 'Date of Birth', panel: true, decided: true },
  ...['Investigation Status', 'Investigator Assigned', 'Estimated Completion Date', 'Actual Completion Date',
    'Root Cause Analysis', 'CAPA Required', 'CAPA Owner', 'CAPA Due Date', 'Field Action Required',
    'Field Action Type', 'Regulatory Notification Required']
    .map(field => ({ section: 'PC — Investigation & CAPA', field, decided: true })),
  { section: 'PC — General', field: 'PC Version' },
  { section: 'PC — General', field: 'Date Received', panel: true },
  { section: 'PC — General', field: 'Root Cause', panel: true },
  { section: 'PC — General', field: 'Initial Reporter' },
  { section: 'PC — General', field: 'Investigation Required' },
  { section: 'PC — Product Information', field: 'Storage Conditions as Reported' },
  { section: 'PC — Product Information', field: 'Quantity Available for Investigation' },
];

// Whole sections switched off: each duplicates a module that is the real record
// (Communications workspace, the QA module, Transmissions) or was never read.
const CUT_SECTIONS = [
  ...ALL.flatMap(caseType => ['Reporter Documentation', 'Communications Log', 'Quality Assurance']
    .map(section => ({ caseType, section }))),
  { caseType: 'AE', section: 'AE — Concomitant Medications' },
  { caseType: 'AE', section: 'AE — Regulatory Reporting' },
];

// Fields the clean-up adds. Latest Information Date is the one regulatory date
// MIMS lacked (E2B C.1.5); Role replaces the Suspect and Concomitant ticks.
const NEW_FIELDS = [
  { section: 'Case Information', field: 'Latest Information Date', type: 'date', scope: 'shared', coreKey: 'latest_information_date', sortOrder: 3 },
  { section: 'AE — Product Information', field: 'Role', type: 'dropdown', scope: 'ae', coreKey: 'ae_product_info_role', sortOrder: 2 },
  // MI and PC review (migration 177). Panel fields carry their core key; the
  // three Investigation & CAPA fields are configured fields.
  { section: 'PC — General', field: 'Reply Date', type: 'date', scope: 'pc', coreKey: 'pc_general_reply_date', sortOrder: 20 },
  { section: 'PC — General', field: 'Reply to Complainant', type: 'textarea', scope: 'pc', coreKey: 'pc_general_reply_to_complainant', sortOrder: 21 },
  { section: 'PC — General', field: 'Suspected Counterfeit or Tampering', type: 'checkbox', scope: 'pc', coreKey: 'pc_general_suspected_counterfeit_or_tampering', sortOrder: 22 },
  { section: 'PC — General', field: 'Device Part Involved', type: 'checkbox', scope: 'pc', coreKey: 'pc_general_device_part_involved', sortOrder: 23 },
  { section: 'PC — General', field: 'Device Malfunction', type: 'dropdown', scope: 'pc', coreKey: 'pc_general_device_malfunction', sortOrder: 24 },
  { section: 'PC — Patient Information', field: 'Patient Initials', type: 'text', scope: 'pc', coreKey: 'pc_patient_info_patient_initials', sortOrder: 0 },
  { section: 'PC — Product Information', field: 'Strength', type: 'text', scope: 'pc', coreKey: 'pc_product_info_strength', sortOrder: 2 },
  { section: 'PC — Investigation & CAPA', field: 'Investigation Needed', type: 'dropdown', scope: 'pc', coreKey: null, picklist: 'yes_no_unknown', sortOrder: 0 },
  { section: 'PC — Investigation & CAPA', field: 'Reason Not Investigated', type: 'textarea', scope: 'pc', coreKey: null, sortOrder: 1 },
  { section: 'PC — Investigation & CAPA', field: 'Decided By', type: 'text', scope: 'pc', coreKey: null, sortOrder: 2 },
];

// MI Follow-up Due Date shows only when Follow-up Required is ticked.
const FOLLOW_UP_RULE = {
  case_type: 'MI', section_name: 'MI — Follow-up & Outcome', field_name: 'Follow-up Due Date', rule_type: 'visibility',
  condition_json: { or: [{ field: 'Follow-up Required', op: '=', value: 'true' }, { field: 'Follow-up Required', op: '=', value: '1' }] },
  action_json: { action: 'show' },
};

// The why-not answer and who decided show when no investigation is needed;
// the findings show when one is (21 CFR 211.198(b)(2)-(3)).
const showWhen = (field, value) => ({ or: [{ field, op: '=', value }] });
const FORM_RULES = [
  FOLLOW_UP_RULE,
  ...['Reason Not Investigated', 'Decided By'].map(field_name => ({
    case_type: 'PC', section_name: 'PC — Investigation & CAPA', field_name, rule_type: 'visibility',
    condition_json: showWhen('Investigation Needed', 'No'), action_json: { action: 'show' },
  })),
  { case_type: 'PC', section_name: 'PC — Investigation & CAPA', field_name: 'Investigation Findings', rule_type: 'visibility',
    condition_json: showWhen('Investigation Needed', 'Yes'), action_json: { action: 'show' } },
];

const cutKey = (section, field) => `${section}::${String(field).trim().toLowerCase()}`;
const CUT_FIELD_KEYS = new Set(CUT_FIELDS.map(f => cutKey(f.section, f.field)));
const CUT_SECTION_NAMES = new Set(CUT_SECTIONS.map(s => s.section));

module.exports = { CUT_FIELDS, CUT_SECTIONS, NEW_FIELDS, FOLLOW_UP_RULE, FORM_RULES, cutKey, CUT_FIELD_KEYS, CUT_SECTION_NAMES };
