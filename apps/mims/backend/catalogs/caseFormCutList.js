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

  // ── Contacts: four classifications of one person become Role + Qualification ──
  // The contact form draws these itself and shows a field that has no setting,
  // so for a new organisation they are seeded hidden, not left out. Contact Type
  // also feeds data-retention rules and Reporter Type the PV hand-off: where
  // they hold values they stay shown until Rohith decides.
  ...['Contact Type', 'Reporter Type', 'Country of Reporter', 'Source']
    .map(field => ({ section: 'Contact / Requestor', field, panel: true })),

  // ── MI ──
  ...['Question Source', 'Question Channel', 'Urgency Level']
    .map(field => ({ section: 'MI — Category & Product', field })),
  { section: 'MI — Response', field: 'Response Date', panel: true },
  ...['Country-specific PI Reference', 'PI Version Used', 'Reference Documents Used', 'Response Template Used',
    'Approval Status', 'Reviewer Name', 'Reviewer Date', 'Approver Name', 'Approver Date',
    'HCP Wants Written Response', 'Translation Required', 'Target Language']
    .map(field => ({ section: 'MI — Response', field })),
  ...['Follow-up Channel', 'Follow-up Completed', 'Follow-up Completed Date', 'HCP Satisfaction Score',
    'HCP Feedback Notes', 'Closed-Loop Confirmation']
    .map(field => ({ section: 'MI — Follow-up & Outcome', field })),

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
];

// MI Follow-up Due Date shows only when Follow-up Required is ticked.
const FOLLOW_UP_RULE = {
  case_type: 'MI', section_name: 'MI — Follow-up & Outcome', field_name: 'Follow-up Due Date', rule_type: 'visibility',
  condition_json: { or: [{ field: 'Follow-up Required', op: '=', value: 'true' }, { field: 'Follow-up Required', op: '=', value: '1' }] },
  action_json: { action: 'show' },
};

const cutKey = (section, field) => `${section}::${String(field).trim().toLowerCase()}`;
const CUT_FIELD_KEYS = new Set(CUT_FIELDS.map(f => cutKey(f.section, f.field)));
const CUT_SECTION_NAMES = new Set(CUT_SECTIONS.map(s => s.section));

module.exports = { CUT_FIELDS, CUT_SECTIONS, NEW_FIELDS, FOLLOW_UP_RULE, cutKey, CUT_FIELD_KEYS, CUT_SECTION_NAMES };
