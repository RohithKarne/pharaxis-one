'use strict';

/**
 * email-case-import-eval.js — AI evaluation harness (MIMS-33, Gate 2 precondition)
 *
 * Deterministic, reproducible evaluation of emailCaseClassifierService against
 * a generated labeled set of 220 emails across MI / AE / PC / junk / ambiguous
 * / missing-data categories, including the named failure modes: forwarded-
 * thread confusion, conflicting body content, and AE under-classification.
 *
 * Governance gate (Mark Antony, locked decision #2):
 *   - Precision on AUTO-CREATED cases ≥ 99% (out of 100 auto-created cases,
 *     at most 1 has the wrong type).
 *   - Zero possible-AE emails auto-filed as non-AE (asymmetric rule).
 *   - Zero junk emails auto-created.
 *   Recall may be lower — uncertain emails fall to human review by design.
 *
 * Run: node tests/eval/email-case-import-eval.js
 * Same seed → same set → same numbers (reproducibility requirement).
 */

const { classifyEmail } = require('../../services/emailCaseClassifierService');

const THRESHOLD = Number(process.env.ECI_EVAL_THRESHOLD || 0.85); // deployment default

// Seeded PRNG — reproducibility is a hard requirement for the eval evidence.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260723);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const FIELD_DEFS = [
  { field_key: 'reporter_name', label: 'Reporter Name', aliases: 'Name,Your Name', is_required: 1, is_active: 1, target_entity: 'reporter', target_field: 'first_name' },
  { field_key: 'product_name', label: 'Product', aliases: 'Medication,Drug Name', is_required: 1, is_active: 1, target_entity: 'case', target_field: 'description' },
];

const PRODUCTS = ['Cardizem', 'Lipitor', 'Metformin XR', 'Amoxicillin', 'Zestril', 'Plavix', 'Symbicort', 'Humira', 'Eliquis', 'Ozempic'];
const NAMES = ['Jane Miller', 'Raj Patel', 'Maria Garcia', 'Chen Wei', 'Aisha Khan', 'Tom Becker', 'Lucia Rossi', 'Sam Okafor'];

function structured(name, product) {
  return `Reporter Name: ${name}\nProduct: ${product}\n\n`;
}

// ── Template banks ──────────────────────────────────────────────────────────

const AE_BODIES = [
  (p) => `I experienced a severe allergic reaction after taking ${p}. My face started swelling and I developed hives within an hour.`,
  (p) => `My father was hospitalized two days after starting ${p}. The doctors say it was an adverse reaction to the medication.`,
  (p) => `I want to report a side effect. After taking ${p} I had constant nausea, vomiting and dizziness for three days.`,
  (p) => `This is an adverse event report. The patient developed a serious rash and difficulty breathing after the second dose of ${p}.`,
  (p) => `My wife fainted and was taken to the emergency room after taking ${p} with her evening meal. Please record this reaction.`,
  (p) => `Reporting an adverse reaction: severe headaches and heart palpitations since starting ${p} last week.`,
  (p) => `The patient had a seizure that we believe is related to ${p}. This adverse event needs to be reported to your safety team.`,
  (p) => `After the dose was increased, my mother experienced life-threatening breathing problems and was hospitalized overnight. ${p} is the suspected cause.`,
];

const PC_BODIES = [
  (p) => `I am filing a product complaint about ${p}. The bottle arrived with a broken seal and the packaging was visibly damaged.`,
  (p) => `The ${p} blister pack I received has missing tablets — only 8 of 10 cavities were filled. This is a quality issue.`,
  (p) => `My ${p} inhaler is defective. It leaks propellant every time I try to use it and the counter does not move.`,
  (p) => `There is a labeling error on my ${p} carton — the printed strength does not match the tablets inside. Product complaint.`,
  (p) => `The ${p} solution appears contaminated. There are visible foreign particles floating in the vial. Please investigate this defect.`,
  (p) => `The tablets in this ${p} bottle are discolored and smell strange, nothing like my previous refills. Quality problem with this batch.`,
  (p) => `Complaint: the ${p} packaging was tampered with — the induction seal was already peeled back when the pharmacy handed it to me.`,
];

const MI_BODIES = [
  (p) => `I have a question about ${p}. Should I take it before or after food, and how long before it starts working?`,
  (p) => `Can you send me the prescribing information for ${p}? My pharmacist could not find the latest package insert.`,
  (p) => `What are the storage requirements for ${p}? Does it need to be refrigerated after opening?`,
  (p) => `Is there a known interaction between ${p} and ibuprofen? I take both and want to confirm this is safe.`,
  (p) => `Could you tell me the inactive ingredients in ${p}? I need to check the excipients for a lactose intolerance.`,
  (p) => `Is ${p} available in a lower strength? My doctor asked me to find out what doses are manufactured.`,
  (p) => `How much does ${p} cost without insurance, and is there a patient assistance program available?`,
  (p) => `Can ${p} be taken during pregnancy? My doctor asked me to request the official information from the manufacturer.`,
];

const JUNK_BODIES = [
  () => `Congratulations you are a winner! Click here to claim your prize before the offer expires. Unsubscribe at any time.`,
  () => `Limited time offer — 80% discount on our newsletter subscription. Buy now and act now! Unsubscribe below.`,
  () => `I am an investment manager with a crypto opportunity that guarantees returns. Bitcoin doubles in 30 days.`,
  () => `Out of office: I will be away until Monday with limited access to email. Automatic reply.`,
  () => `Mail delivery failure — your message could not be delivered. This is an automatically generated delivery status notification.`,
];

// Ambiguous: real case-type signal mixed across types or hidden inside another
// intent — the set where the model SHOULD abstain (needs review), including the
// named failure modes.
const AMBIGUOUS_BODIES = [
  (p) => `How do I store ${p}? Also, my husband felt dizziness and fainted after taking it last week — is that normal?`, // hidden AE in MI (under-classification trap)
  (p) => `Question about the ${p} packaging — also my daughter got a rash this week, though it might be the new detergent.`, // weak AE + weak PC
  (p) => `FW: FW: my colleague forwarded this — someone mentioned a reaction to ${p} but I mainly need the price list.`, // forwarded-thread confusion
  (p) => `The ${p} bottle was damaged in shipping. Separately, I felt a bit nauseous yesterday, probably unrelated.`, // PC + weak AE conflict
  (p) => `Attached report says "no adverse event" but the body of this email is about a reaction my aunt had to ${p}.`, // conflicting content
];

// Missing-data: genuine case emails WITHOUT the required structured fields.
const MISSING_BODIES = [
  () => `I had a severe allergic reaction and rash after taking my medication. This is an adverse event I want to report.`,
  () => `My tablets arrived with damaged packaging and a broken seal. I want to file a product complaint.`,
  () => `I have questions about my medication dosage and how to take it correctly. Please contact me.`,
];

// ── Build the labeled set (220 emails) ──────────────────────────────────────

const dataset = [];
function add(category, expected, subject, body) {
  dataset.push({ id: dataset.length + 1, category, expected, subject, body });
}

for (let i = 0; i < 60; i += 1) {
  const p = pick(PRODUCTS); const n = pick(NAMES);
  add('AE', 'auto_AE', `Adverse event report — ${p}`, structured(n, p) + pick(AE_BODIES)(p));
}
for (let i = 0; i < 45; i += 1) {
  const p = pick(PRODUCTS); const n = pick(NAMES);
  add('PC', 'auto_PC', `Product complaint — ${p}`, structured(n, p) + pick(PC_BODIES)(p));
}
for (let i = 0; i < 60; i += 1) {
  const p = pick(PRODUCTS); const n = pick(NAMES);
  add('MI', 'auto_MI', `Question about ${p}`, structured(n, p) + pick(MI_BODIES)(p));
}
for (let i = 0; i < 25; i += 1) {
  add('junk', 'junk', pick(['You are a winner!', 'Special offer inside', 'Delivery notification', 'Out of office']), pick(JUNK_BODIES)());
}
for (let i = 0; i < 15; i += 1) {
  const p = pick(PRODUCTS); const n = pick(NAMES);
  add('ambiguous', 'review', `About ${p}`, structured(n, p) + pick(AMBIGUOUS_BODIES)(p));
}
for (let i = 0; i < 15; i += 1) {
  add('missing_data', 'review', 'Regarding my medication', pick(MISSING_BODIES)());
}

// ── Run ─────────────────────────────────────────────────────────────────────

function decide(verdict) {
  // Mirror of the engine's gating logic (emailCaseImportService.processInquiry).
  if (verdict.isJunk) return 'junk';
  if (verdict.possibleAe) return 'review';
  if (verdict.confidence < THRESHOLD) return 'review';
  if (verdict.missingRequired.length) return 'review';
  return `auto_${verdict.caseType}`;
}

const results = [];
for (const item of dataset) {
  const verdict = classifyEmail({ subject: item.subject, body: item.body, fieldDefs: FIELD_DEFS });
  results.push({ ...item, verdict, decision: decide(verdict) });
}

// ── Score ───────────────────────────────────────────────────────────────────

const autoCreated = results.filter((r) => r.decision.startsWith('auto_'));
const correctAuto = autoCreated.filter((r) => r.decision === r.expected);
const precision = autoCreated.length ? correctAuto.length / autoCreated.length : 1;

const perType = {};
for (const t of ['AE', 'PC', 'MI']) {
  const autoOfType = autoCreated.filter((r) => r.decision === `auto_${t}`);
  const correctOfType = autoOfType.filter((r) => r.expected === `auto_${t}`);
  const totalOfType = results.filter((r) => r.expected === `auto_${t}`);
  const recalled = totalOfType.filter((r) => r.decision === `auto_${t}`);
  perType[t] = {
    precision: autoOfType.length ? (correctOfType.length / autoOfType.length) : null,
    recall: totalOfType.length ? (recalled.length / totalOfType.length) : null,
    auto_created: autoOfType.length,
    labeled: totalOfType.length,
  };
}

// Safety invariants.
const aeMissed = results.filter((r) => r.category === 'AE' && r.decision.startsWith('auto_') && r.decision !== 'auto_AE');
const ambiguousAutoAsNonAe = results.filter((r) => r.category === 'ambiguous' && r.decision.startsWith('auto_') && r.verdict.evidence.ae.score >= 3 && r.decision !== 'auto_AE');
const junkAuto = results.filter((r) => r.category === 'junk' && r.decision.startsWith('auto_'));
const reviewShare = results.filter((r) => r.decision === 'review').length / results.length;

// ── Report ──────────────────────────────────────────────────────────────────

const fmt = (x) => (x == null ? '  n/a' : (x * 100).toFixed(1).padStart(5) + '%');
console.log('Email Case Import — Classifier Evaluation (MIMS-33)');
console.log(`Dataset: ${dataset.length} labeled emails | threshold: ${THRESHOLD} | seed: 20260723 (reproducible)\n`);
console.log('Type | Precision | Recall | Auto-created | Labeled');
for (const t of ['AE', 'PC', 'MI']) {
  const s = perType[t];
  console.log(`${t.padEnd(4)} | ${fmt(s.precision)}    | ${fmt(s.recall)} | ${String(s.auto_created).padStart(12)} | ${s.labeled}`);
}
console.log(`\nOverall auto-create precision: ${(precision * 100).toFixed(2)}% (${correctAuto.length}/${autoCreated.length})`);
console.log(`Share routed to human review: ${(reviewShare * 100).toFixed(1)}%`);
console.log(`AE emails auto-filed as non-AE (must be 0): ${aeMissed.length}`);
console.log(`Moderate-AE ambiguous auto-filed as non-AE (must be 0): ${ambiguousAutoAsNonAe.length}`);
console.log(`Junk auto-created (must be 0): ${junkAuto.length}`);

const failures = results.filter((r) => r.decision.startsWith('auto_') && r.decision !== r.expected);
if (failures.length) {
  console.log('\nMisclassified auto-creations:');
  for (const f of failures) {
    console.log(`  #${f.id} [${f.category}] expected=${f.expected} got=${f.decision} conf=${f.verdict.confidence} subj="${f.subject}"`);
  }
}

const gatePass = precision >= 0.99 && aeMissed.length === 0 && ambiguousAutoAsNonAe.length === 0 && junkAuto.length === 0;
console.log(`\nGOVERNANCE GATE (precision ≥ 99% + safety invariants): ${gatePass ? 'PASS' : 'FAIL'}`);
process.exit(gatePass ? 0 : 1);
