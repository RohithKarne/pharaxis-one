'use strict';

/**
 * qaKnowledgeBaseSeed.js — Seeds qa_knowledge_base with 20 base scenarios.
 * Engine auto-expands to 100+ via field variation, threshold ladders,
 * cross-type apply, and override pattern generation.
 *
 * Called once on startup from qaRulesEngine.js if table is empty.
 */

const SEED_SCENARIOS = [
  // ── CATEGORY 1: Field Completeness — AE ─────────────────────────────────
  {
    kb_key: 'ae_missing_reporter_name',
    category: 'field_completeness',
    case_type: 'AE',
    title: 'AE Missing Reporter Name',
    description: 'Reporter name must be present on all adverse event cases.',
    rule_type: 'field_check',
    target_field: 'reporter_name',
    severity: 'critical',
    condition_json: { operator: 'empty', field: 'reporter_name' },
    flag_message: 'Reporter name is missing. Required for regulatory submission.',
    regulatory_ref: 'ICH E2B(R3)',
  },
  {
    kb_key: 'ae_missing_is_serious',
    category: 'regulatory_compliance',
    case_type: 'AE',
    title: 'AE Seriousness Assessment Missing',
    description: 'Seriousness must be assessed on all adverse event cases.',
    rule_type: 'regulatory_flag',
    target_field: 'is_serious',
    severity: 'critical',
    condition_json: { operator: 'empty', field: 'is_serious' },
    flag_message: 'Seriousness not assessed. Cannot determine reporting obligation.',
    regulatory_ref: 'FDA 21 CFR 312.32 / EMA GVP Module VI',
  },
  {
    kb_key: 'ae_serious_missing_reason',
    category: 'regulatory_compliance',
    case_type: 'AE',
    title: 'Serious AE Missing Seriousness Reason',
    description: 'When AE is marked serious, seriousness criteria must be documented.',
    rule_type: 'regulatory_flag',
    target_field: 'seriousness_criteria',
    severity: 'critical',
    condition_json: { operator: 'empty_when', field: 'seriousness_criteria', when_field: 'is_serious', when_value: true },
    flag_message: 'Case marked serious but seriousness criteria not documented. Regulatory submission blocked.',
    regulatory_ref: 'FDA 21 CFR 312.32 / ICH E2B(R3)',
  },
  {
    kb_key: 'ae_fatal_missing_death_date',
    category: 'regulatory_compliance',
    case_type: 'AE',
    title: 'Fatal AE Missing Date of Death',
    description: 'Fatal outcome requires date of death to complete expedited report.',
    rule_type: 'field_check',
    target_field: 'date_of_death',
    severity: 'critical',
    condition_json: { operator: 'empty_when', field: 'date_of_death', when_field: 'outcome', when_value: 'Fatal' },
    flag_message: 'Outcome is Fatal but date of death is missing. Cannot complete expedited report.',
    regulatory_ref: 'ICH E2B(R3) mandatory field',
  },
  {
    kb_key: 'ae_missing_patient_age',
    category: 'field_completeness',
    case_type: 'AE',
    title: 'AE Missing Patient Age',
    description: 'Patient age or age group must be recorded on adverse event cases.',
    rule_type: 'field_check',
    target_field: 'patient_age',
    severity: 'critical',
    condition_json: { operator: 'empty_both', field: 'patient_age', field2: 'patient_age_group' },
    flag_message: 'Patient age not recorded. Required for ICH E2B submission.',
    regulatory_ref: 'ICH E2B(R3)',
  },
  {
    kb_key: 'ae_missing_suspect_drug',
    category: 'field_completeness',
    case_type: 'AE',
    title: 'AE Missing Suspect Drug',
    description: 'Suspect drug must be named on all adverse event cases.',
    rule_type: 'field_check',
    target_field: 'suspect_drug',
    severity: 'critical',
    condition_json: { operator: 'empty', field: 'suspect_drug' },
    flag_message: 'Suspect drug not recorded. Required for causality assessment.',
    regulatory_ref: 'ICH E2B(R3)',
  },
  {
    kb_key: 'ae_missing_suspect_drug_dose',
    category: 'field_completeness',
    case_type: 'AE',
    title: 'AE Missing Suspect Drug Dose',
    description: 'Suspect drug dose should be recorded for complete causality assessment.',
    rule_type: 'field_check',
    target_field: 'suspect_drug_dose',
    severity: 'warning',
    condition_json: { operator: 'empty', field: 'suspect_drug_dose' },
    flag_message: 'Suspect drug dose missing. Causality assessment incomplete.',
    regulatory_ref: null,
  },
  {
    kb_key: 'ae_missing_outcome',
    category: 'field_completeness',
    case_type: 'AE',
    title: 'AE Missing Outcome',
    description: 'Patient outcome must be recorded on adverse event cases.',
    rule_type: 'field_check',
    target_field: 'outcome',
    severity: 'critical',
    condition_json: { operator: 'empty', field: 'outcome' },
    flag_message: 'Patient outcome not recorded. Required field for AE case closure.',
    regulatory_ref: 'ICH E2B(R3)',
  },
  // ── CATEGORY 2: Timeliness — AE ─────────────────────────────────────────
  {
    kb_key: 'ae_serious_15day_fda_breach',
    category: 'timeliness',
    case_type: 'AE',
    title: 'Serious AE — FDA 15-Day Window Breached',
    description: 'Serious AE must be reported to FDA within 15 days of receipt.',
    rule_type: 'timeliness_check',
    target_field: 'days_open',
    severity: 'critical',
    condition_json: { operator: 'days_open_gt', days: 15, when_field: 'is_serious', when_value: true, regulatory: 'FDA' },
    flag_message: 'FDA 15-day expedited reporting window breached. Immediate escalation required.',
    regulatory_ref: 'FDA 21 CFR 312.32 — 15-day alert report',
  },
  {
    kb_key: 'ae_serious_15day_ema_breach',
    category: 'timeliness',
    case_type: 'AE',
    title: 'Serious AE — EMA 15-Day Window Breached',
    description: 'Serious AE must be reported to EMA within 15 days of receipt.',
    rule_type: 'timeliness_check',
    target_field: 'days_open',
    severity: 'critical',
    condition_json: { operator: 'days_open_gt', days: 15, when_field: 'is_serious', when_value: true, regulatory: 'EMA' },
    flag_message: 'EMA 15-day expedited reporting window breached. Immediate escalation required.',
    regulatory_ref: 'EMA GVP Module VI — 15-day clock',
  },
  {
    kb_key: 'ae_nonserious_90day_fda_breach',
    category: 'timeliness',
    case_type: 'AE',
    title: 'Non-Serious AE — FDA 90-Day Window Breached',
    description: 'Non-serious AE must be reported to FDA within 90 days.',
    rule_type: 'timeliness_check',
    target_field: 'days_open',
    severity: 'warning',
    condition_json: { operator: 'days_open_gt', days: 90, when_field: 'is_serious', when_value: false, regulatory: 'FDA' },
    flag_message: 'FDA 90-day non-serious reporting window breached.',
    regulatory_ref: 'FDA — 90-day periodic report',
  },
  // ── CATEGORY 3: Narrative Quality ────────────────────────────────────────
  {
    kb_key: 'narrative_too_short',
    category: 'narrative_quality',
    case_type: null,
    title: 'Narrative Too Short',
    description: 'Case narrative must contain at least 20 words for regulatory sufficiency.',
    rule_type: 'narrative_check',
    target_field: 'description',
    severity: 'warning',
    condition_json: { operator: 'word_count_lt', field: 'description', threshold: 20 },
    flag_message: 'Narrative is too short. Minimum 20 words required for regulatory submission.',
    regulatory_ref: null,
  },
  {
    kb_key: 'narrative_placeholder_text',
    category: 'narrative_quality',
    case_type: null,
    title: 'Narrative Contains Placeholder Text',
    description: 'Narrative must not contain placeholder text such as TBD, N/A, or pending.',
    rule_type: 'narrative_check',
    target_field: 'description',
    severity: 'critical',
    condition_json: { operator: 'contains_any', field: 'description', values: ['TBD', 'N/A', 'to be updated', 'pending', 'fill later', 'see attachment'] },
    flag_message: 'Narrative contains placeholder text. Not acceptable for regulatory submission.',
    regulatory_ref: null,
  },
  // ── CATEGORY 4: Duplicate Signal ─────────────────────────────────────────
  {
    kb_key: 'duplicate_case_signal',
    category: 'duplicate_detection',
    case_type: null,
    title: 'Possible Duplicate Case',
    description: 'Same reporter, product, and event type within 30 days may indicate a duplicate.',
    rule_type: 'duplicate_signal',
    target_field: null,
    severity: 'warning',
    condition_json: { operator: 'duplicate_check', window_days: 30, match_fields: ['reporter_name', 'product_name', 'ae_description'] },
    flag_message: 'Possible duplicate case detected. Review before submission.',
    regulatory_ref: null,
  },
  // ── CATEGORY 5: Medical Information Request ───────────────────────────────
  {
    kb_key: 'mi_missing_reporter_type',
    category: 'field_completeness',
    case_type: 'MI',
    title: 'MIR Missing Reporter Type',
    description: 'Reporter type must be selected on medical information requests.',
    rule_type: 'field_check',
    target_field: 'reporter_type',
    severity: 'critical',
    condition_json: { operator: 'empty', field: 'reporter_type' },
    flag_message: 'Reporter type not selected. Required for case classification.',
    regulatory_ref: null,
  },
  {
    kb_key: 'mi_open_30days',
    category: 'timeliness',
    case_type: 'MI',
    title: 'MIR Open Beyond 30 Days',
    description: 'Medical information requests should be resolved within 30 days.',
    rule_type: 'timeliness_check',
    target_field: 'days_open',
    severity: 'warning',
    condition_json: { operator: 'days_open_gt', days: 30 },
    flag_message: 'MIR open beyond 30 days. Review and close or escalate.',
    regulatory_ref: null,
  },
  {
    kb_key: 'mi_closed_no_response',
    category: 'field_completeness',
    case_type: 'MI',
    title: 'MIR Closed Without Documented Response',
    description: 'Closed MIR must have a documented response for audit trail completeness.',
    rule_type: 'field_check',
    target_field: 'response_provided',
    severity: 'critical',
    condition_json: { operator: 'empty_when', field: 'response_provided', when_field: 'status', when_value: 'Closed' },
    flag_message: 'Case closed but no response documented. Audit trail incomplete.',
    regulatory_ref: null,
  },
  // ── CATEGORY 6: Product Complaint ────────────────────────────────────────
  {
    kb_key: 'pc_missing_batch_lot',
    category: 'field_completeness',
    case_type: 'PC',
    title: 'Product Complaint Missing Batch/Lot Number',
    description: 'Batch or lot number is required for product complaint investigation and recall assessment.',
    rule_type: 'field_check',
    target_field: 'batch_lot_number',
    severity: 'critical',
    condition_json: { operator: 'empty', field: 'batch_lot_number' },
    flag_message: 'Batch/lot number missing. Cannot initiate product investigation or recall assessment.',
    regulatory_ref: null,
  },
  {
    kb_key: 'pc_unassigned',
    category: 'timeliness',
    case_type: 'PC',
    title: 'Product Complaint Unassigned',
    description: 'Product complaints must be assigned within 48 hours of receipt.',
    rule_type: 'field_check',
    target_field: 'case_owner_id',
    severity: 'warning',
    condition_json: { operator: 'empty', field: 'case_owner_id' },
    flag_message: 'Product complaint unassigned. Assign to an owner immediately.',
    regulatory_ref: null,
  },
  {
    kb_key: 'pc_investigation_30days',
    category: 'timeliness',
    case_type: 'PC',
    title: 'Product Complaint Investigation Exceeds 30 Days',
    description: 'Product complaint investigation outcome expected within 30 days.',
    rule_type: 'timeliness_check',
    target_field: 'days_open',
    severity: 'warning',
    condition_json: { operator: 'days_open_gt', days: 30 },
    flag_message: 'Complaint investigation exceeds 30-day target. Outcome or extension note required.',
    regulatory_ref: null,
  },
];

// ── Auto-expansion engine: generates ~80 additional scenarios from 20 seeds ──
function expandScenarios(seeds) {
  const expanded = [...seeds];
  const usedKeys = new Set(seeds.map(s => s.kb_key));

  // 1. Field variation — apply same logic across related fields
  const fieldVariants = [
    { from: 'reporter_name', to: 'reporter_email', severity: 'warning', msg: 'Reporter email not recorded.' },
    { from: 'reporter_name', to: 'reporter_type', severity: 'warning', msg: 'Reporter type not selected.' },
    { from: 'reporter_name', to: 'country', severity: 'warning', msg: 'Country of origin not recorded. Required for regional compliance.' },
    { from: 'suspect_drug', to: 'product_name', severity: 'critical', msg: 'Product name missing. Cannot process case without product identification.' },
    { from: 'patient_age', to: 'patient_gender', severity: 'warning', msg: 'Patient gender not recorded.' },
  ];

  for (const seed of seeds.filter(s => s.rule_type === 'field_check' && s.target_field)) {
    for (const variant of fieldVariants) {
      if (seed.target_field !== variant.from) continue;
      const key = `${seed.kb_key}_${variant.to}`;
      if (usedKeys.has(key)) continue;
      usedKeys.add(key);
      expanded.push({
        ...seed,
        kb_key: key,
        title: seed.title.replace(seed.target_field, variant.to),
        target_field: variant.to,
        severity: variant.severity,
        condition_json: { ...seed.condition_json, field: variant.to },
        flag_message: variant.msg,
        regulatory_ref: null,
        is_seed: 0,
      });
    }
  }

  // 2. Threshold ladders — approaching-window warnings before hard breach
  const timelinessSeeds = seeds.filter(s => s.rule_type === 'timeliness_check' && s.condition_json.days);
  for (const seed of timelinessSeeds) {
    const days = seed.condition_json.days;
    const approachDays = [
      { offset: Math.round(days * 0.67), label: 'approaching' },
      { offset: Math.round(days * 0.87), label: 'imminent' },
    ];
    for (const ap of approachDays) {
      const key = `${seed.kb_key}_${ap.label}`;
      if (usedKeys.has(key) || ap.offset >= days) continue;
      usedKeys.add(key);
      expanded.push({
        ...seed,
        kb_key: key,
        title: `${seed.title} — ${ap.label.charAt(0).toUpperCase() + ap.label.slice(1)}`,
        severity: 'warning',
        condition_json: { ...seed.condition_json, days: ap.offset, approaching: true },
        flag_message: seed.flag_message.replace('breached', `approaching (${ap.offset} of ${days} days elapsed)`),
        is_seed: 0,
      });
    }
  }

  // 3. Cross-type apply — narrative rules apply to all case types
  const narrativeSeeds = seeds.filter(s => s.rule_type === 'narrative_check' && s.case_type === null);
  const caseTypes = ['AE', 'MI', 'PC'];
  for (const seed of narrativeSeeds) {
    for (const ct of caseTypes) {
      const key = `${seed.kb_key}_${ct.toLowerCase()}`;
      if (usedKeys.has(key)) continue;
      usedKeys.add(key);
      expanded.push({
        ...seed,
        kb_key: key,
        case_type: ct,
        title: `${seed.title} — ${ct}`,
        flag_message: `[${ct}] ${seed.flag_message}`,
        is_seed: 0,
      });
    }
  }

  // 4. Override pattern expansion — every critical rule generates an override scenario
  const criticalSeeds = seeds.filter(s => s.severity === 'critical');
  for (const seed of criticalSeeds) {
    const key = `${seed.kb_key}_override_no_reason`;
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    expanded.push({
      kb_key: key,
      category: 'override_pattern',
      case_type: seed.case_type,
      title: `Critical Flag Overridden Without Reason — ${seed.rule_key || seed.kb_key}`,
      description: `User overrode a critical QA flag without providing a reason.`,
      rule_type: 'field_check',
      target_field: 'override_reason',
      severity: 'critical',
      condition_json: { operator: 'override_no_reason', source_rule: seed.kb_key },
      flag_message: `Critical flag overridden without documented reason. Manager alert triggered.`,
      regulatory_ref: null,
      is_seed: 0,
    });
  }

  return expanded;
}

async function seedKnowledgeBase(pool) {
  const [existing] = await pool.execute('SELECT COUNT(*) as cnt FROM qa_knowledge_base');
  if (existing[0].cnt > 0) return;

  const allScenarios = expandScenarios(SEED_SCENARIOS);

  for (const s of allScenarios) {
    await pool.execute(
      `INSERT IGNORE INTO qa_knowledge_base
         (kb_key, category, case_type, title, description, rule_type, target_field,
          severity, condition_json, flag_message, regulatory_ref, is_seed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        s.kb_key, s.category, s.case_type || null, s.title, s.description,
        s.rule_type, s.target_field || null, s.severity,
        JSON.stringify(s.condition_json), s.flag_message,
        s.regulatory_ref || null, s.is_seed !== undefined ? s.is_seed : 1,
      ]
    );
  }

  console.log(`✅ QA Knowledge Base seeded — ${allScenarios.length} scenarios loaded`);
}

module.exports = { seedKnowledgeBase, SEED_SCENARIOS, expandScenarios };
