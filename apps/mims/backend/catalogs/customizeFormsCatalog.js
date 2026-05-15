'use strict';

/**
 * customizeFormsCatalog.js — Master catalog for MIMS Admin > System > Setup > Customize Forms
 *
 * Defines all sections + fields shown on the Customize Forms screen, grouped by category.
 * The `key` field MUST remain stable forever — renaming a key orphans existing admin settings.
 *
 * Categories:
 *   - shared : Contact / Requestor + Case Information (visible on every case type)
 *   - ae     : Adverse Event
 *   - mi     : Medical Information
 *   - pc     : Product Complaint
 *
 * Each item has:
 *   - key                : stable ID — DO NOT RENAME
 *   - label              : display label (friendly)
 *   - type               : 'section' | 'field'
 *   - db_section         : maps to field_setup.section_name / case_form_definition.section_name (null for pure placeholders)
 *   - db_field           : maps to field_setup.field_name (fields only)
 *   - case_type          : 'AE' | 'MI' | 'PC' | 'ALL' (shared)
 *   - supports_required  : only true for individual input fields
 *   - is_placeholder     : true if no underlying case form wiring exists yet
 *
 * Placeholder items still get persisted to `field_setup` under the section
 * '__customize_placeholder__' so admin settings survive until the real
 * feature is built and the data can be migrated.
 */

const PLACEHOLDER_SECTION = '__customize_placeholder__';

// Pull in the case-form gap audit extensions so every newly seeded field
// also shows up in Customize Forms as a toggleable item.
const { EXTRA_FIELDS, EXTRA_SECTIONS: EXTRA_SECTION_NAMES } = require('./caseFormExtensions');

function safeKey(prefix, section, name) {
  const slug = `${section} ${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return `${prefix}_${slug}`;
}

// Field types where "Required" makes semantic sense (input-type fields).
const REQUIRED_CAPABLE_TYPES = new Set(['text','textarea','number','date','datetime','dropdown','multiselect','checkbox','email','phone','currency','lookup']);

function caseTypeForSection(sectionName) {
  if (sectionName.startsWith('AE — ')) return 'AE';
  if (sectionName.startsWith('MI — ')) return 'MI';
  if (sectionName.startsWith('PC — ')) return 'PC';
  return 'ALL';
}

function categoryForSection(sectionName) {
  if (sectionName.startsWith('AE — ')) return 'ae';
  if (sectionName.startsWith('MI — ')) return 'mi';
  if (sectionName.startsWith('PC — ')) return 'pc';
  return 'shared';
}

function buildExtraSectionEntries() {
  const out = { shared: [], ae: [], mi: [], pc: [] };
  const seen = new Set();
  for (const sectionName of [
    ...(EXTRA_SECTION_NAMES.ALL || []),
    ...(EXTRA_SECTION_NAMES.AE || []),
    ...(EXTRA_SECTION_NAMES.MI || []),
    ...(EXTRA_SECTION_NAMES.PC || []),
  ]) {
    const cat = categoryForSection(sectionName);
    const ct  = caseTypeForSection(sectionName);
    const key = safeKey('sec', cat, sectionName);
    if (seen.has(key)) continue;
    seen.add(key);
    out[cat].push({
      key, label: sectionName, type: 'section',
      db_section: sectionName, case_type: ct,
      is_placeholder: false,
    });
  }
  return out;
}

function buildExtraFieldEntries() {
  const out = { shared: [], ae: [], mi: [], pc: [] };
  const seen = new Set();
  for (const [section, name, type] of EXTRA_FIELDS) {
    const cat = categoryForSection(section);
    const ct  = caseTypeForSection(section);
    const key = safeKey('fld', section, name);
    if (seen.has(key)) continue;
    seen.add(key);
    out[cat].push({
      key, label: name, type: 'field',
      db_section: section, db_field: name, case_type: ct,
      supports_required: REQUIRED_CAPABLE_TYPES.has(type),
      is_placeholder: false,
    });
  }
  return out;
}

const EXTRA_SECTION_ENTRIES = buildExtraSectionEntries();
const EXTRA_FIELD_ENTRIES   = buildExtraFieldEntries();

// ─────────────────────────────────────────────────────────────────────────────
// SHARED — Contact / Requestor + Case Information
// ─────────────────────────────────────────────────────────────────────────────
const SHARED = {
  category: 'shared',
  label: 'Shared (Cross-Case)',
  sections: [
    { key: 'sec_contact_requestor', label: 'Contact / Requestor', type: 'section', db_section: 'Contact / Requestor', case_type: 'ALL', is_placeholder: false },
    { key: 'sec_case_information',  label: 'Case Information',    type: 'section', db_section: 'Case Information',    case_type: 'ALL', is_placeholder: false },
  ],
  fields: [
    // Contact / Requestor
    { key: 'fld_contact_type',         label: 'Contact Type',         type: 'field', db_section: 'Contact / Requestor', db_field: 'Contact Type',         case_type: 'ALL', supports_required: true, is_placeholder: false },
    { key: 'fld_contact_country',      label: 'Country',              type: 'field', db_section: 'Contact / Requestor', db_field: 'Country',              case_type: 'ALL', supports_required: true, is_placeholder: false },
    { key: 'fld_country_of_reporter',  label: 'Country of Reporter',  type: 'field', db_section: 'Contact / Requestor', db_field: 'Country of Reporter',  case_type: 'ALL', supports_required: true, is_placeholder: false },
    { key: 'fld_consent_status',       label: 'Consent Status',       type: 'field', db_section: 'Contact / Requestor', db_field: 'Consent Status',       case_type: 'ALL', supports_required: true, is_placeholder: false },
    { key: 'fld_first_name',           label: 'First Name',           type: 'field', db_section: 'Contact / Requestor', db_field: 'First Name',           case_type: 'ALL', supports_required: true, is_placeholder: false },
    { key: 'fld_last_name',            label: 'Last Name',            type: 'field', db_section: 'Contact / Requestor', db_field: 'Last Name',            case_type: 'ALL', supports_required: true, is_placeholder: false },
    { key: 'fld_email',                label: 'Email',                type: 'field', db_section: 'Contact / Requestor', db_field: 'Email',                case_type: 'ALL', supports_required: true, is_placeholder: false },
    { key: 'fld_phone',                label: 'Phone',                type: 'field', db_section: 'Contact / Requestor', db_field: 'Phone',                case_type: 'ALL', supports_required: true, is_placeholder: false },
    { key: 'fld_dnumd',                label: 'Do Not Use My Data (DNUMD)', type: 'field', db_section: 'Contact / Requestor', db_field: 'DNUMD', case_type: 'ALL', supports_required: true, is_placeholder: false },

    // Case Information
    { key: 'fld_case_number',          label: 'Case Number',          type: 'field', db_section: 'Case Information', db_field: 'Case Number',           case_type: 'ALL', supports_required: true, is_placeholder: false },
    { key: 'fld_case_type',            label: 'Case Type',            type: 'field', db_section: 'Case Information', db_field: 'Case Type',             case_type: 'ALL', supports_required: true, is_placeholder: false },
    { key: 'fld_case_owner',           label: 'Case Owner',           type: 'field', db_section: 'Case Information', db_field: 'Case Owner',            case_type: 'ALL', supports_required: true, is_placeholder: false },
    { key: 'fld_case_status',          label: 'Case Status',          type: 'field', db_section: 'Case Information', db_field: 'Case Status',           case_type: 'ALL', supports_required: true, is_placeholder: false },
    { key: 'fld_priority',             label: 'Priority',             type: 'field', db_section: 'Case Information', db_field: 'Priority',              case_type: 'ALL', supports_required: true, is_placeholder: false },
    { key: 'fld_date_received',        label: 'Date Received',        type: 'field', db_section: 'Case Information', db_field: 'Date Received',         case_type: 'ALL', supports_required: true, is_placeholder: false },
    { key: 'fld_due_date',             label: 'Due Date',             type: 'field', db_section: 'Case Information', db_field: 'Due Date',              case_type: 'ALL', supports_required: true, is_placeholder: false },
    { key: 'fld_intake_channel',       label: 'Intake Channel',       type: 'field', db_section: 'Case Information', db_field: 'Intake Channel',        case_type: 'ALL', supports_required: true, is_placeholder: false },
    { key: 'fld_description',          label: 'Description',          type: 'field', db_section: 'Case Information', db_field: 'Description',           case_type: 'ALL', supports_required: true, is_placeholder: false },
    { key: 'fld_internal_notes',       label: 'Internal Notes',       type: 'field', db_section: 'Case Information', db_field: 'Internal Notes',        case_type: 'ALL', supports_required: true, is_placeholder: false },
    { key: 'fld_reg_ref_number',       label: 'Regulatory Reference Number', type: 'field', db_section: 'Case Information', db_field: 'Regulatory Reference Number', case_type: 'ALL', supports_required: true, is_placeholder: false },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// AE — Adverse Event
// ─────────────────────────────────────────────────────────────────────────────
const AE = {
  category: 'ae',
  label: 'Adverse Event',
  sections: [
    // Real sections
    { key: 'sec_ae_general',       label: 'AE — General',                 type: 'section', db_section: 'AE — General',                 case_type: 'AE', is_placeholder: false },
    { key: 'sec_ae_events',        label: 'AE — Events & Seriousness',    type: 'section', db_section: 'AE — Events & Seriousness',    case_type: 'AE', is_placeholder: false },
    { key: 'sec_ae_patient_info',  label: 'AE — Patient Information',     type: 'section', db_section: 'AE — Patient Information',     case_type: 'AE', is_placeholder: false },
    { key: 'sec_ae_lab_results',   label: 'AE — Lab Results',             type: 'section', db_section: 'AE — Lab Results',             case_type: 'AE', is_placeholder: false },
    { key: 'sec_ae_lab_notes',     label: 'AE — Lab Notes',               type: 'section', db_section: 'AE — Lab Notes',               case_type: 'AE', is_placeholder: false },
    { key: 'sec_ae_med_history',   label: 'AE — Medical History',         type: 'section', db_section: 'AE — Medical History',         case_type: 'AE', is_placeholder: false },
    { key: 'sec_ae_med_notes',     label: 'AE — Medical Notes',           type: 'section', db_section: 'AE — Medical Notes',           case_type: 'AE', is_placeholder: false },
    { key: 'sec_ae_product_info',  label: 'AE — Product Information',     type: 'section', db_section: 'AE — Product Information',     case_type: 'AE', is_placeholder: false },
    // Placeholders (Rohith's wishlist)
    { key: 'sec_ph_allergy_data',         label: 'Section allergy data',                       type: 'section', db_section: null, case_type: 'AE', is_placeholder: true },
    { key: 'sec_ph_death_data',           label: 'Section death data',                         type: 'section', db_section: null, case_type: 'AE', is_placeholder: true },
    { key: 'sec_ph_death_data_grid',      label: 'Section death data grid',                    type: 'section', db_section: null, case_type: 'AE', is_placeholder: true },
    { key: 'sec_ph_hospitalization',      label: 'Section hospitalization',                    type: 'section', db_section: null, case_type: 'AE', is_placeholder: true },
    { key: 'sec_ph_meds',                 label: 'Section meds',                               type: 'section', db_section: null, case_type: 'AE', is_placeholder: true },
    { key: 'sec_ph_reaction_product_labeling', label: 'Reaction Events Product Labeling Sections', type: 'section', db_section: null, case_type: 'AE', is_placeholder: true },
    { key: 'sec_ph_tab_client_custom',    label: 'Tab Client Custom Data',                     type: 'section', db_section: null, case_type: 'AE', is_placeholder: true },
    { key: 'sec_ph_tab_device',           label: 'Tab Device',                                 type: 'section', db_section: null, case_type: 'AE', is_placeholder: true },
    { key: 'sec_ph_tab_narrative',        label: 'Tab Narrative',                              type: 'section', db_section: null, case_type: 'AE', is_placeholder: true },
    { key: 'sec_ph_tab_report_source',    label: 'Tab Report Source (Reactions Events)',       type: 'section', db_section: null, case_type: 'AE', is_placeholder: true },
  ],
  fields: [
    // AE — General
    { key: 'fld_ae_version',           label: 'AE Version',              type: 'field', db_section: 'AE — General', db_field: 'AE Version',              case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_ae_status',            label: 'AE Status',               type: 'field', db_section: 'AE — General', db_field: 'AE Status',               case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_date_of_awareness',    label: 'Date of Awareness',       type: 'field', db_section: 'AE — General', db_field: 'Date of Awareness',       case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_report_type',          label: 'Report Type',             type: 'field', db_section: 'AE — General', db_field: 'Report Type',             case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_regulatory_report',    label: 'Regulatory Reportability',type: 'field', db_section: 'AE — General', db_field: 'Regulatory Reportability',case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_date_of_report',       label: 'Date of Report',          type: 'field', db_section: 'AE — General', db_field: 'Date of Report',          case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_reporter_aware_date',  label: 'Reporter Awareness Date', type: 'field', db_section: 'AE — General', db_field: 'Reporter Awareness Date', case_type: 'AE', supports_required: true, is_placeholder: false },

    // AE — Events & Seriousness
    { key: 'fld_event_description',    label: 'Event Description',                          type: 'field', db_section: 'AE — Events & Seriousness', db_field: 'Event Description',  case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_meddra_term',          label: 'MedDRA Term — Adverse reaction code',        type: 'field', db_section: 'AE — Events & Seriousness', db_field: 'MedDRA Term',        case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_onset_date',           label: 'Onset Date (Event start date)',              type: 'field', db_section: 'AE — Events & Seriousness', db_field: 'Onset Date',         case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_end_date',             label: 'End Date (Event end date)',                  type: 'field', db_section: 'AE — Events & Seriousness', db_field: 'End Date',           case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_outcome',              label: 'Outcome',                                    type: 'field', db_section: 'AE — Events & Seriousness', db_field: 'Outcome',            case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_reported_causality',   label: 'Reported Causality',                         type: 'field', db_section: 'AE — Events & Seriousness', db_field: 'Reported Causality', case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_frequency',            label: 'Frequency',                                  type: 'field', db_section: 'AE — Events & Seriousness', db_field: 'Frequency',          case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_seriousness',          label: 'Seriousness',                                type: 'field', db_section: 'AE — Events & Seriousness', db_field: 'Seriousness',        case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_serious_death',        label: 'Serious — Death',                            type: 'field', db_section: 'AE — Events & Seriousness', db_field: 'Serious — Death',    case_type: 'AE', supports_required: false, is_placeholder: false },
    { key: 'fld_serious_life',         label: 'Serious — Life Threatening',                 type: 'field', db_section: 'AE — Events & Seriousness', db_field: 'Serious — Life Threatening', case_type: 'AE', supports_required: false, is_placeholder: false },
    { key: 'fld_serious_hosp',         label: 'Serious — Hospitalisation',                  type: 'field', db_section: 'AE — Events & Seriousness', db_field: 'Serious — Hospitalisation',  case_type: 'AE', supports_required: false, is_placeholder: false },
    { key: 'fld_serious_disability',   label: 'Serious — Disability',                       type: 'field', db_section: 'AE — Events & Seriousness', db_field: 'Serious — Disability', case_type: 'AE', supports_required: false, is_placeholder: false },
    { key: 'fld_serious_congenital',   label: 'Serious — Congenital Anomaly',               type: 'field', db_section: 'AE — Events & Seriousness', db_field: 'Serious — Congenital Anomaly', case_type: 'AE', supports_required: false, is_placeholder: false },
    { key: 'fld_serious_other',        label: 'Serious — Other Medically Important Event',  type: 'field', db_section: 'AE — Events & Seriousness', db_field: 'Serious — Other Medically Important', case_type: 'AE', supports_required: false, is_placeholder: false },
    { key: 'fld_causality_assessment', label: 'Causality Assessment — Drug-event relationship', type: 'field', db_section: 'AE — Events & Seriousness', db_field: 'Causality Assessment', case_type: 'AE', supports_required: true, is_placeholder: false },

    // AE — Patient Information
    { key: 'fld_patient_initials',     label: 'Patient Initials',  type: 'field', db_section: 'AE — Patient Information', db_field: 'Patient Initials', case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_dob',                  label: 'Date of Birth',     type: 'field', db_section: 'AE — Patient Information', db_field: 'Date of Birth',    case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_age',                  label: 'Age',               type: 'field', db_section: 'AE — Patient Information', db_field: 'Age',              case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_age_unit',             label: 'Age Unit',          type: 'field', db_section: 'AE — Patient Information', db_field: 'Age Unit',         case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_gender',               label: 'Gender',            type: 'field', db_section: 'AE — Patient Information', db_field: 'Gender',           case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_weight',               label: 'Weight (kg)',       type: 'field', db_section: 'AE — Patient Information', db_field: 'Weight (kg)',      case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_height',               label: 'Height (cm)',       type: 'field', db_section: 'AE — Patient Information', db_field: 'Height (cm)',      case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_pregnant',             label: 'Pregnant',          type: 'field', db_section: 'AE — Patient Information', db_field: 'Pregnant',         case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_patient_country',      label: 'Patient Country',   type: 'field', db_section: 'AE — Patient Information', db_field: 'Patient Country',  case_type: 'AE', supports_required: true, is_placeholder: false },

    // AE — Lab Results
    { key: 'fld_lab_name',             label: 'Lab Name',          type: 'field', db_section: 'AE — Lab Results', db_field: 'Lab Name',     case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_test_date',            label: 'Test Date',         type: 'field', db_section: 'AE — Lab Results', db_field: 'Test Date',    case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_test_name',            label: 'Test Name',         type: 'field', db_section: 'AE — Lab Results', db_field: 'Test Name',    case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_result_value',         label: 'Result Value',      type: 'field', db_section: 'AE — Lab Results', db_field: 'Result Value', case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_normal_range',         label: 'Normal Range',      type: 'field', db_section: 'AE — Lab Results', db_field: 'Normal Range', case_type: 'AE', supports_required: true, is_placeholder: false },

    // AE — Lab Notes / Medical / Notes
    { key: 'fld_lab_notes',            label: 'Lab Notes',         type: 'field', db_section: 'AE — Lab Notes',     db_field: 'Lab Notes',         case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_medical_history',      label: 'Medical History',   type: 'field', db_section: 'AE — Medical History', db_field: 'Medical History', case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_relevant_history',     label: 'Relevant History',  type: 'field', db_section: 'AE — Medical History', db_field: 'Relevant History', case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_medical_notes',        label: 'Medical Notes',     type: 'field', db_section: 'AE — Medical Notes', db_field: 'Medical Notes',     case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_narrative',            label: 'Narrative',         type: 'field', db_section: 'AE — Medical Notes', db_field: 'Narrative',         case_type: 'AE', supports_required: true, is_placeholder: false },

    // AE — Product Information
    { key: 'fld_product_name',         label: 'Product Name',          type: 'field', db_section: 'AE — Product Information', db_field: 'Product Name',          case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_product_type',         label: 'Product Type',          type: 'field', db_section: 'AE — Product Information', db_field: 'Product Type',          case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_product_category',     label: 'Product Category',      type: 'field', db_section: 'AE — Product Information', db_field: 'Product Category',      case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_batch_lot',            label: 'Batch / Lot Number',    type: 'field', db_section: 'AE — Product Information', db_field: 'Batch / Lot Number',    case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_dose',                 label: 'Dose',                  type: 'field', db_section: 'AE — Product Information', db_field: 'Dose',                  case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_dose_unit',            label: 'Dose Unit',             type: 'field', db_section: 'AE — Product Information', db_field: 'Dose Unit',             case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_admin_route',          label: 'Administration Route',  type: 'field', db_section: 'AE — Product Information', db_field: 'Administration Route',  case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_start_date',           label: 'Start Date',            type: 'field', db_section: 'AE — Product Information', db_field: 'Start Date',            case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_stop_date',            label: 'Stop Date',             type: 'field', db_section: 'AE — Product Information', db_field: 'Stop Date',             case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_indication',           label: 'Indication',            type: 'field', db_section: 'AE — Product Information', db_field: 'Indication',            case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_action_taken',         label: 'Action Taken',          type: 'field', db_section: 'AE — Product Information', db_field: 'Action Taken',          case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_concomitant_meds',     label: 'Concomitant Medications', type: 'field', db_section: 'AE — Product Information', db_field: 'Concomitant Medications', case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_is_suspect',           label: 'Is Suspect',            type: 'field', db_section: 'AE — Product Information', db_field: 'Is Suspect',            case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_is_concomitant',       label: 'Is Concomitant',        type: 'field', db_section: 'AE — Product Information', db_field: 'Is Concomitant',        case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_dechallenge',          label: 'Dechallenge — Was drug stopped?',    type: 'field', db_section: 'AE — Product Information', db_field: 'Dechallenge', case_type: 'AE', supports_required: true, is_placeholder: false },
    { key: 'fld_rechallenge',          label: 'Rechallenge — Was drug restarted?',  type: 'field', db_section: 'AE — Product Information', db_field: 'Rechallenge', case_type: 'AE', supports_required: true, is_placeholder: false },

    // Placeholder fields (Rohith's wishlist)
    { key: 'fld_ph_already_submitted', label: 'Already submitted',  type: 'field', db_section: null, db_field: null, case_type: 'AE', supports_required: true,  is_placeholder: true },
    { key: 'fld_ph_reactions',         label: 'Reactions',          type: 'field', db_section: null, db_field: null, case_type: 'AE', supports_required: false, is_placeholder: true },
    { key: 'fld_ph_events',            label: 'Events',             type: 'field', db_section: null, db_field: null, case_type: 'AE', supports_required: false, is_placeholder: true },
    { key: 'fld_ph_products',          label: 'Products',           type: 'field', db_section: null, db_field: null, case_type: 'AE', supports_required: false, is_placeholder: true },
    { key: 'fld_ph_test_data',         label: 'Test Data',          type: 'field', db_section: null, db_field: null, case_type: 'AE', supports_required: false, is_placeholder: true },
    { key: 'fld_ph_tests',             label: 'Tests',              type: 'field', db_section: null, db_field: null, case_type: 'AE', supports_required: false, is_placeholder: true },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// MI — Medical Information
// ─────────────────────────────────────────────────────────────────────────────
const MI = {
  category: 'mi',
  label: 'Medical Information',
  sections: [
    { key: 'sec_mi_category',  label: 'MI — Category & Product', type: 'section', db_section: 'MI — Category & Product', case_type: 'MI', is_placeholder: false },
    { key: 'sec_mi_question',  label: 'MI — Question Details',   type: 'section', db_section: 'MI — Question Details',   case_type: 'MI', is_placeholder: false },
    { key: 'sec_mi_response',  label: 'MI — Response',           type: 'section', db_section: 'MI — Response',           case_type: 'MI', is_placeholder: false },
    // Placeholders
    { key: 'sec_mi_ph_lit_search',  label: 'Section literature search',  type: 'section', db_section: null, case_type: 'MI', is_placeholder: true },
    { key: 'sec_mi_ph_reg_query',   label: 'Section regulatory query',   type: 'section', db_section: null, case_type: 'MI', is_placeholder: true },
    { key: 'sec_mi_ph_resp_tmpl',   label: 'Section response template',  type: 'section', db_section: null, case_type: 'MI', is_placeholder: true },
    { key: 'sec_mi_ph_quality',     label: 'Section quality check',      type: 'section', db_section: null, case_type: 'MI', is_placeholder: true },
    { key: 'sec_mi_ph_tab_approval',label: 'Tab Approval History',       type: 'section', db_section: null, case_type: 'MI', is_placeholder: true },
    { key: 'sec_mi_ph_tab_draft',   label: 'Tab Response Draft',         type: 'section', db_section: null, case_type: 'MI', is_placeholder: true },
  ],
  fields: [
    // MI — Category & Product
    { key: 'fld_mi_category',         label: 'MI Category',     type: 'field', db_section: 'MI — Category & Product', db_field: 'MI Category',     case_type: 'MI', supports_required: true, is_placeholder: false },
    { key: 'fld_mi_subcategory',      label: 'MI Subcategory',  type: 'field', db_section: 'MI — Category & Product', db_field: 'MI Subcategory',  case_type: 'MI', supports_required: true, is_placeholder: false },
    { key: 'fld_mi_product',          label: 'Product',         type: 'field', db_section: 'MI — Category & Product', db_field: 'Product',         case_type: 'MI', supports_required: true, is_placeholder: false },
    // MI — Question Details
    { key: 'fld_mi_question_summary', label: 'Question Summary',   type: 'field', db_section: 'MI — Question Details', db_field: 'Question Summary',   case_type: 'MI', supports_required: true, is_placeholder: false },
    { key: 'fld_mi_detailed_question',label: 'Detailed Question',  type: 'field', db_section: 'MI — Question Details', db_field: 'Detailed Question',  case_type: 'MI', supports_required: true, is_placeholder: false },
    // MI — Response
    { key: 'fld_mi_resp_required_by', label: 'Response Required By', type: 'field', db_section: 'MI — Response', db_field: 'Response Required By', case_type: 'MI', supports_required: true, is_placeholder: false },
    { key: 'fld_mi_resp_provided',    label: 'Response Provided',    type: 'field', db_section: 'MI — Response', db_field: 'Response Provided',    case_type: 'MI', supports_required: true, is_placeholder: false },
    { key: 'fld_mi_resp_date',        label: 'Response Date',        type: 'field', db_section: 'MI — Response', db_field: 'Response Date',        case_type: 'MI', supports_required: true, is_placeholder: false },
    { key: 'fld_mi_resp_channel',     label: 'Response Channel',     type: 'field', db_section: 'MI — Response', db_field: 'Response Channel',     case_type: 'MI', supports_required: true, is_placeholder: false },
    { key: 'fld_mi_status',           label: 'MI Status',            type: 'field', db_section: 'MI — Response', db_field: 'MI Status',            case_type: 'MI', supports_required: true, is_placeholder: false },
    { key: 'fld_mi_lit_reference',    label: 'Literature Reference', type: 'field', db_section: 'MI — Response', db_field: 'Literature Reference', case_type: 'MI', supports_required: true, is_placeholder: false },
    // Placeholders
    { key: 'fld_mi_ph_resp_deadline', label: 'Response deadline',    type: 'field', db_section: null, db_field: null, case_type: 'MI', supports_required: true,  is_placeholder: true },
    { key: 'fld_mi_ph_source_citation', label: 'Source citation',    type: 'field', db_section: null, db_field: null, case_type: 'MI', supports_required: true,  is_placeholder: true },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// PC — Product Complaint
// ─────────────────────────────────────────────────────────────────────────────
const PC = {
  category: 'pc',
  label: 'Product Complaint',
  sections: [
    { key: 'sec_pc_general',          label: 'PC — General',                type: 'section', db_section: 'PC — General',             case_type: 'PC', is_placeholder: false },
    { key: 'sec_pc_patient_info',     label: 'PC — Patient Information',    type: 'section', db_section: 'PC — Patient Information', case_type: 'PC', is_placeholder: false },
    { key: 'sec_pc_product_info',     label: 'PC — Product Information',    type: 'section', db_section: 'PC — Product Information', case_type: 'PC', is_placeholder: false },
    { key: 'sec_pc_return',           label: 'PC — Return & Retrieval',     type: 'section', db_section: 'PC — Return & Retrieval',  case_type: 'PC', is_placeholder: false },
    { key: 'sec_pc_replacement',      label: 'PC — Replacement',            type: 'section', db_section: 'PC — Replacement',         case_type: 'PC', is_placeholder: false },
    { key: 'sec_pc_refund',           label: 'PC — Refund & Credit',        type: 'section', db_section: 'PC — Refund & Credit',     case_type: 'PC', is_placeholder: false },
    // Placeholders
    { key: 'sec_pc_ph_investigation', label: 'Section investigation findings', type: 'section', db_section: null, case_type: 'PC', is_placeholder: true },
    { key: 'sec_pc_ph_capa',          label: 'Section CAPA actions',           type: 'section', db_section: null, case_type: 'PC', is_placeholder: true },
    { key: 'sec_pc_ph_root_cause',    label: 'Section root cause analysis',    type: 'section', db_section: null, case_type: 'PC', is_placeholder: true },
    { key: 'sec_pc_ph_reg_notif',     label: 'Section regulatory notification',type: 'section', db_section: null, case_type: 'PC', is_placeholder: true },
    { key: 'sec_pc_ph_tab_sample',    label: 'Tab Sample Information',         type: 'section', db_section: null, case_type: 'PC', is_placeholder: true },
    { key: 'sec_pc_ph_tab_supplier',  label: 'Tab Supplier Information',       type: 'section', db_section: null, case_type: 'PC', is_placeholder: true },
  ],
  fields: [
    // PC — General
    { key: 'fld_pc_version',         label: 'PC Version',            type: 'field', db_section: 'PC — General', db_field: 'PC Version',            case_type: 'PC', supports_required: true, is_placeholder: false },
    { key: 'fld_pc_status',          label: 'PC Status',             type: 'field', db_section: 'PC — General', db_field: 'PC Status',             case_type: 'PC', supports_required: true, is_placeholder: false },
    { key: 'fld_pc_category',        label: 'PC Category',           type: 'field', db_section: 'PC — General', db_field: 'PC Category',           case_type: 'PC', supports_required: true, is_placeholder: false },
    { key: 'fld_pc_classification',  label: 'PC Classification',     type: 'field', db_section: 'PC — General', db_field: 'PC Classification',     case_type: 'PC', supports_required: true, is_placeholder: false },
    { key: 'fld_pc_complaint_desc',  label: 'Complaint Description', type: 'field', db_section: 'PC — General', db_field: 'Complaint Description', case_type: 'PC', supports_required: true, is_placeholder: false },
    { key: 'fld_pc_date_complaint',  label: 'Date of Complaint',     type: 'field', db_section: 'PC — General', db_field: 'Date of Complaint',     case_type: 'PC', supports_required: true, is_placeholder: false },
    { key: 'fld_pc_severity',        label: 'Severity',              type: 'field', db_section: 'PC — General', db_field: 'Severity',              case_type: 'PC', supports_required: true, is_placeholder: false },
    { key: 'fld_pc_root_cause',      label: 'Root Cause',            type: 'field', db_section: 'PC — General', db_field: 'Root Cause',            case_type: 'PC', supports_required: true, is_placeholder: false },
    { key: 'fld_pc_date_received',   label: 'Date Received',         type: 'field', db_section: 'PC — General', db_field: 'Date Received',         case_type: 'PC', supports_required: true, is_placeholder: false },
    // PC — Patient
    { key: 'fld_pc_patient_name',    label: 'Patient Name',     type: 'field', db_section: 'PC — Patient Information', db_field: 'Patient Name',       case_type: 'PC', supports_required: true, is_placeholder: false },
    { key: 'fld_pc_patient_dob',     label: 'Date of Birth',    type: 'field', db_section: 'PC — Patient Information', db_field: 'Date of Birth',      case_type: 'PC', supports_required: true, is_placeholder: false },
    { key: 'fld_pc_patient_gender',  label: 'Gender',           type: 'field', db_section: 'PC — Patient Information', db_field: 'Gender',             case_type: 'PC', supports_required: true, is_placeholder: false },
    { key: 'fld_pc_injury',          label: 'Injury Experienced', type: 'field', db_section: 'PC — Patient Information', db_field: 'Injury Experienced', case_type: 'PC', supports_required: true, is_placeholder: false },
    // PC — Product
    { key: 'fld_pc_prod_name',       label: 'Product Name',        type: 'field', db_section: 'PC — Product Information', db_field: 'Product Name',       case_type: 'PC', supports_required: true, is_placeholder: false },
    { key: 'fld_pc_prod_type',       label: 'Product Type',        type: 'field', db_section: 'PC — Product Information', db_field: 'Product Type',       case_type: 'PC', supports_required: true, is_placeholder: false },
    { key: 'fld_pc_prod_category',   label: 'Product Category',    type: 'field', db_section: 'PC — Product Information', db_field: 'Product Category',   case_type: 'PC', supports_required: true, is_placeholder: false },
    { key: 'fld_pc_batch',           label: 'Batch / Lot Number',  type: 'field', db_section: 'PC — Product Information', db_field: 'Batch / Lot Number', case_type: 'PC', supports_required: true, is_placeholder: false },
    { key: 'fld_pc_expiry',          label: 'Expiry Date',         type: 'field', db_section: 'PC — Product Information', db_field: 'Expiry Date',        case_type: 'PC', supports_required: true, is_placeholder: false },
    { key: 'fld_pc_mfg_date',        label: 'Manufacturing Date',  type: 'field', db_section: 'PC — Product Information', db_field: 'Manufacturing Date', case_type: 'PC', supports_required: true, is_placeholder: false },
    { key: 'fld_pc_pack_size',       label: 'Pack Size',           type: 'field', db_section: 'PC — Product Information', db_field: 'Pack Size',          case_type: 'PC', supports_required: true, is_placeholder: false },
    { key: 'fld_pc_storage',         label: 'Storage Conditions',  type: 'field', db_section: 'PC — Product Information', db_field: 'Storage Conditions', case_type: 'PC', supports_required: true, is_placeholder: false },
    { key: 'fld_pc_qty_available',   label: 'Quantity Available for Investigation', type: 'field', db_section: 'PC — Product Information', db_field: 'Quantity Available for Investigation', case_type: 'PC', supports_required: true, is_placeholder: false },
    // PC — Return & Retrieval
    { key: 'fld_pc_return_req',      label: 'Return Requested',  type: 'field', db_section: 'PC — Return & Retrieval', db_field: 'Return Requested',  case_type: 'PC', supports_required: true, is_placeholder: false },
    { key: 'fld_pc_return_date',     label: 'Return Date',       type: 'field', db_section: 'PC — Return & Retrieval', db_field: 'Return Date',       case_type: 'PC', supports_required: true, is_placeholder: false },
    { key: 'fld_pc_return_address',  label: 'Return Address',    type: 'field', db_section: 'PC — Return & Retrieval', db_field: 'Return Address',    case_type: 'PC', supports_required: true, is_placeholder: false },
    { key: 'fld_pc_retrieval_method',label: 'Retrieval Method',  type: 'field', db_section: 'PC — Return & Retrieval', db_field: 'Retrieval Method',  case_type: 'PC', supports_required: true, is_placeholder: false },
    { key: 'fld_pc_return_notes',    label: 'Return Notes',      type: 'field', db_section: 'PC — Return & Retrieval', db_field: 'Return Notes',      case_type: 'PC', supports_required: true, is_placeholder: false },
    // PC — Replacement
    { key: 'fld_pc_repl_approved',   label: 'Replacement Approved',  type: 'field', db_section: 'PC — Replacement', db_field: 'Replacement Approved',  case_type: 'PC', supports_required: true, is_placeholder: false },
    { key: 'fld_pc_repl_qty',        label: 'Replacement Quantity',  type: 'field', db_section: 'PC — Replacement', db_field: 'Replacement Quantity',  case_type: 'PC', supports_required: true, is_placeholder: false },
    { key: 'fld_pc_repl_ship_date',  label: 'Replacement Ship Date', type: 'field', db_section: 'PC — Replacement', db_field: 'Replacement Ship Date', case_type: 'PC', supports_required: true, is_placeholder: false },
    { key: 'fld_pc_repl_notes',      label: 'Replacement Notes',     type: 'field', db_section: 'PC — Replacement', db_field: 'Replacement Notes',     case_type: 'PC', supports_required: true, is_placeholder: false },
    // PC — Refund & Credit
    { key: 'fld_pc_refund_approved', label: 'Refund Approved',   type: 'field', db_section: 'PC — Refund & Credit', db_field: 'Refund Approved',   case_type: 'PC', supports_required: true, is_placeholder: false },
    { key: 'fld_pc_refund_amount',   label: 'Refund Amount',     type: 'field', db_section: 'PC — Refund & Credit', db_field: 'Refund Amount',     case_type: 'PC', supports_required: true, is_placeholder: false },
    { key: 'fld_pc_credit_note',     label: 'Credit Note Number',type: 'field', db_section: 'PC — Refund & Credit', db_field: 'Credit Note Number',case_type: 'PC', supports_required: true, is_placeholder: false },
    { key: 'fld_pc_refund_notes',    label: 'Refund Notes',      type: 'field', db_section: 'PC — Refund & Credit', db_field: 'Refund Notes',      case_type: 'PC', supports_required: true, is_placeholder: false },
    // Placeholders
    { key: 'fld_pc_ph_capa_ref',     label: 'CAPA reference number', type: 'field', db_section: null, db_field: null, case_type: 'PC', supports_required: true, is_placeholder: true },
    { key: 'fld_pc_ph_inv_lead',     label: 'Investigation lead',    type: 'field', db_section: null, db_field: null, case_type: 'PC', supports_required: true, is_placeholder: true },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────

// Fold the gap-audit extensions into the catalog so every newly seeded field
// shows up as a toggleable item in Customize Forms.
for (const cat of ['shared', 'ae', 'mi', 'pc']) {
  const base = ({ shared: SHARED, ae: AE, mi: MI, pc: PC })[cat];
  base.sections = [...base.sections, ...EXTRA_SECTION_ENTRIES[cat]];
  base.fields   = [...base.fields,   ...EXTRA_FIELD_ENTRIES[cat]];
}

const CATALOG = { shared: SHARED, ae: AE, mi: MI, pc: PC };

const CATEGORIES_LIST = [
  { key: 'shared', label: 'Shared (Cross-Case)' },
  { key: 'ae',     label: 'Adverse Event' },
  { key: 'mi',     label: 'Medical Information' },
  { key: 'pc',     label: 'Product Complaint' },
];

module.exports = {
  CATALOG,
  CATEGORIES_LIST,
  PLACEHOLDER_SECTION,
  getCategory: (key) => CATALOG[key] || null,
};
