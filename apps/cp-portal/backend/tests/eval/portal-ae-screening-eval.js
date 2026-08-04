'use strict';

/**
 * portal-ae-screening-eval.js — AE screening evaluation set for CP Portal (PD-2)
 *
 * Gate precondition for the portal adverse-event screening feature. Measures
 * whether the MIMS classifier, reused on PORTAL text, actually catches an
 * adverse event described inside a non-AE submission.
 *
 * WHY THIS SET EXISTS SEPARATELY FROM THE MIMS ONE
 *   MIMS's eval (apps/mims/backend/tests/eval/email-case-import-eval.js) is 220
 *   generated EMAILS. Portal submissions are short, structured, form-shaped, and
 *   have no subject line. Email numbers do not transfer. This set is portal text
 *   only, hand-written and hand-labelled.
 *
 * WHAT IS UNDER TEST
 *   Not the classifier alone — the classifier PLUS the portal flag rule. The rule
 *   is what ships, so the rule is what gets measured. `portalFlagRule` below is
 *   the candidate; once the feature is built it must be replaced by an import of
 *   the real implementation so this set tests shipped code, not a copy of it.
 *
 * THE GATE (Kiranmai)
 *   1. Zero misses in category `ae_in_non_ae` — an AE inside a non-AE submission
 *      MUST flag. This is the entire reason the feature exists.
 *   2. False-positive rate on clean submissions reported, and capped.
 *   3. Determinism: same input, same verdict, twice.
 *
 * Run: node apps/cp-portal/backend/tests/eval/portal-ae-screening-eval.js
 */

// The rule under test lives in its own module so this set and the holdout set
// exercise the SAME rule rather than two copies that drift.
const { portalFlagRule, submissionText, classifyEmail, AE_SIGNAL_FLOOR } = require('./portal-ae-rule');

const FP_CEILING = Number(process.env.PORTAL_AE_FP_CEILING || 0.10); // max false-positive rate on clean

// ── The labelled set ────────────────────────────────────────────────────────
//
// Categories:
//   ae_in_non_ae  AE described inside a non-AE submission — MUST flag (the gate)
//   genuine_ae    filed correctly as adverse_event — must NOT flag (already AE)
//   clean         no adverse event present — must NOT flag
//   hedge         explicitly negates an AE — must NOT flag
//   noise         empty / trivial / non-clinical — must NOT flag

const D = [];
const add = (category, type, expectFlag, form, note) =>
  D.push({ id: D.length + 1, category, type, expectFlag, form, note });

// ── ae_in_non_ae — the gate category ────────────────────────────────────────

add('ae_in_non_ae', 'medical_inquiry', true, { question: 'My patient developed a severe rash and was hospitalised two days after starting Atorvastatin. What dose should I use going forward?' }, 'classic: hospitalisation inside a dosing question');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'Patient had an allergic reaction after taking the first dose. Can you confirm the excipients list?' }, 'allergic reaction + ingredients question');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'What is the maximum daily dose? Asking because my patient had a seizure last night after doubling up.' }, 'AE at the end, question at the front');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'Following your dosing guidance my patient was admitted to the emergency department with anaphylaxis. Please advise.' }, 'emergency department + anaphylaxis');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'she got hives and swelling after taking it, is that normal, what should we do' }, 'lowercase, no punctuation, patient voice');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'Patient hospitalized (US spelling) following administration. Query on rechallenge.' }, 'US spelling variant');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'Could you send the prescribing information? Separately, one of my patients died three days after starting therapy and I want to understand the interaction profile.' }, 'death mentioned mid-body, long text');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'Quick question on storage. Also the patient reported dizziness and palpitations after taking it.' }, 'low-weight AE signals stacking');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'Is this safe in pregnancy? My patient took it in the first trimester and the baby has a congenital heart defect.' }, 'congenital anomaly');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'Patient experienced a life-threatening drop in blood pressure. What is the recommended titration schedule?' }, 'life-threatening');
add('ae_in_non_ae', 'product_complaint', true, { description: 'The blister pack was cracked and several tablets were damaged. My wife took one anyway and had a seizure that evening.' }, 'AE inside a product complaint');
add('ae_in_non_ae', 'product_complaint', true, { description: 'Bottle arrived leaking. Patient used it regardless and developed a severe rash requiring hospitalisation.' }, 'PC + AE, PC signal strong');
add('ae_in_non_ae', 'other_inquiry', true, { message: 'I wanted to ask about your patient support programme. Also my mother had an allergic reaction after taking the tablets and went to the emergency room.' }, 'AE in other_inquiry — never syncs today');
add('ae_in_non_ae', 'other_inquiry', true, { message: 'General feedback on the portal. Unrelated note: my father was hospitalised with vomiting after his second dose.' }, 'AE in other_inquiry, buried');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'Patient hospitalised after taking it. What dose now?' }, 'SHORT body (51 chars) — tests confidence damping does not suppress the flag');
add('ae_in_non_ae', 'medical_inquiry', true, { question_details: 'Reporting that the patient suffered an adverse reaction, specifically anaphylaxis, and asking about alternatives.' }, 'alternate field key question_details');
add('ae_in_non_ae', 'medical_inquiry', true, { message: 'my dad fainted after his morning dose and had to go to A&E. what do we do' }, 'fainted + patient voice, message key');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'Asking on behalf of a colleague — her patient developed disability following prolonged use. Dosing query attached.' }, 'disability');

// ── ae_in_non_ae — HARD: AE described WITHOUT lexicon trigger words ──────────
// These are the cases a keyword lexicon is structurally weak against. Included
// deliberately. If they miss, that is a measured limitation to put in the record,
// not a reason to quietly drop them from the set.

add('ae_in_non_ae', 'medical_inquiry', true, { question: 'After the second dose she stopped breathing and we had to call an ambulance. I need to know whether to continue.' }, 'HARD: no lexicon keyword — "stopped breathing", "ambulance"');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'My patient has been in intensive care since starting this. What is the washout period?' }, 'HARD: "intensive care" not in lexicon');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'He came out in blotches all over his chest the day after. Is a dose reduction appropriate?' }, 'HARD: "blotches" — lay term, not in lexicon');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'The patient collapsed at home following administration and was blue-lighted to hospital. Advice on rechallenge?' }, 'HARD: "collapsed", "blue-lighted" not in lexicon');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'Patient required admission to the ward for three nights after starting therapy. Query on renal dosing.' }, 'HARD: "admission to the ward" not "hospitalised"');

// ── genuine_ae — filed correctly, must NOT flag ─────────────────────────────

add('genuine_ae', 'adverse_event', false, { event_description: 'Patient developed anaphylaxis and was hospitalised after the second dose.', seriousness: 'Hospitalization' }, 'correct AE filing');
add('genuine_ae', 'adverse_event', false, { event_description: 'Severe rash and swelling within 24 hours. Patient recovered after discontinuation.' }, 'correct AE filing, moderate signals');
add('genuine_ae', 'adverse_event', false, { event_description: 'Patient died. Suspected drug-related.' }, 'correct AE filing, fatal, very short');
add('genuine_ae', 'adverse_event', false, { event_description: 'Reporting an adverse event: seizure following overdose.' }, 'correct AE filing, explicit');

// ── clean — no AE, must NOT flag ───────────────────────────────────────────

add('clean', 'medical_inquiry', false, { question: 'What is the recommended starting dose of Atorvastatin for a 65 year old with moderate renal impairment? Could you send the prescribing information leaflet?' }, 'textbook clean MI');
add('clean', 'medical_inquiry', false, { question: 'Can I combine this medication with warfarin? What are the known drug interactions and contraindications for pregnant patients?' }, 'clinical vocabulary, no event');
add('clean', 'medical_inquiry', false, { question: 'What is the shelf life once opened, and does it need refrigeration?' }, 'storage question');
add('clean', 'medical_inquiry', false, { question: 'Is there a paediatric formulation available in the UK, and what is the cost to the NHS?' }, 'availability + cost');
add('clean', 'medical_inquiry', false, { question: 'Could you confirm the excipients? I have a patient with a lactose intolerance.' }, 'intolerance mentioned but no event occurred');
add('clean', 'medical_inquiry', false, { question: 'How often should liver function be monitored during treatment?' }, 'monitoring question');
add('clean', 'medical_inquiry', false, { question: 'Please send the summary of product characteristics and the package insert.' }, 'document request');
add('clean', 'medical_inquiry', false, { question: 'What is the mechanism of action and how does it compare to the alternatives in this class?' }, 'mechanism question');
add('clean', 'medical_inquiry', false, { question: 'Do you have data on use in patients over 80? Looking for the elderly subgroup analysis.' }, 'evidence request');
add('clean', 'medical_inquiry', false, { question: 'Can you confirm whether this product is still available or has been discontinued in Ireland?' }, 'supply question');
add('clean', 'product_complaint', false, { description: 'The box arrived crushed and the outer packaging was torn. Tablets themselves look intact but I want to report the packaging quality.' }, 'clean PC — packaging only');
add('clean', 'product_complaint', false, { description: 'Label on the carton has the wrong batch number printed. No patient involved.' }, 'clean PC — labelling error');
add('clean', 'product_complaint', false, { description: 'The tablets have an unusual smell compared to the previous batch. Not taken by anyone.' }, 'clean PC — explicitly not taken');
add('clean', 'other_inquiry', false, { message: 'Your website contact page is hard to find on mobile. Please improve it.' }, 'clean other — website feedback');
add('clean', 'other_inquiry', false, { message: 'Requesting a copy of your privacy policy and details of your data retention period.' }, 'clean other — DSAR-adjacent');
add('clean', 'other_inquiry', false, { message: 'Could someone from medical affairs contact me about a speaking engagement?' }, 'clean other — commercial');
add('clean', 'medical_inquiry', false, { question: 'A colleague mentioned that some patients in the literature reported rashes with this class of drug. Is there published incidence data I can reference?' }, 'HARD NEGATIVE: third-party literature mention, not a report');
add('clean', 'medical_inquiry', false, { question: 'Patient has a past medical history of seizures unrelated to any medication. Is this product contraindicated?' }, 'HARD NEGATIVE: medical history, not an AE from the product');

// ── hedge — explicitly negates, must NOT flag ──────────────────────────────

add('hedge', 'medical_inquiry', false, { question: 'Just to confirm, there was no adverse event. I only want to know the storage temperature for the refrigerated vials.' }, 'explicit negation');
add('hedge', 'medical_inquiry', false, { question: 'Patient denies any reaction. Query is about the titration schedule only.' }, 'denies any reaction');
add('hedge', 'medical_inquiry', false, { question: 'The rash was probably unrelated to the medication — dermatology confirmed contact dermatitis. Dosing question below.' }, 'hedged and attributed elsewhere');

// ── noise — trivial / empty, must NOT flag ─────────────────────────────────

add('noise', 'medical_inquiry', false, { question: 'test please' }, 'two-word test submission');
add('noise', 'medical_inquiry', false, { question: '?' }, 'single character');
add('noise', 'medical_inquiry', false, { question: 'hello' }, 'single word');
add('noise', 'other_inquiry', false, { message: 'asdfgh' }, 'keyboard mash');
add('noise', 'medical_inquiry', false, {}, 'EDGE: no free-text field at all');
add('noise', 'medical_inquiry', false, { patient_age: '65', suspect_product: 'Atorvastatin' }, 'EDGE: only non-text fields populated');

// ── Run ────────────────────────────────────────────────────────────────────

const results = D.map((item) => {
  const r = portalFlagRule(item.type, item.form);
  return { ...item, got: r.flag, aeScore: r.aeScore, hedged: r.hedged, correct: r.flag === item.expectFlag };
});

// Baseline for comparison: MIMS `possibleAe` reused as-is, which is what PD-2
// originally proposed. Kept in the report so the decision stays evidenced.
const baseline = D.map((item) => {
  const v = classifyEmail({ subject: '', body: submissionText(item.form), fieldDefs: [] });
  return { ...item, got: v.possibleAe, correct: v.possibleAe === item.expectFlag };
});

// ── Score ──────────────────────────────────────────────────────────────────

const by = (rows, cat) => rows.filter((r) => r.category === cat);
const gateRows = by(results, 'ae_in_non_ae');
const misses = gateRows.filter((r) => !r.got);
const missRate = misses.length / gateRows.length;

const mustNotFlag = results.filter((r) => !r.expectFlag);
const falsePositives = mustNotFlag.filter((r) => r.got);
const fpRate = falsePositives.length / mustNotFlag.length;

const baseMisses = by(baseline, 'ae_in_non_ae').filter((r) => !r.got);

// Determinism — the same submission must produce the same verdict.
const probe = D.find((d) => d.category === 'ae_in_non_ae');
const det = JSON.stringify(portalFlagRule(probe.type, probe.form).verdict)
         === JSON.stringify(portalFlagRule(probe.type, probe.form).verdict);

// ── Report ─────────────────────────────────────────────────────────────────

const pct = (n) => `${(n * 100).toFixed(1)}%`;
console.log('CP Portal — Adverse-Event Screening Evaluation (PD-2)');
console.log(`Dataset: ${D.length} hand-labelled portal submissions | AE_SIGNAL_FLOOR=${AE_SIGNAL_FLOOR}\n`);

console.log('Category      | Cases | Correct | Wrong');
for (const cat of ['ae_in_non_ae', 'genuine_ae', 'clean', 'hedge', 'noise']) {
  const rows = by(results, cat);
  const ok = rows.filter((r) => r.correct).length;
  console.log(`${cat.padEnd(13)} | ${String(rows.length).padStart(5)} | ${String(ok).padStart(7)} | ${String(rows.length - ok).padStart(5)}`);
}

console.log(`\n--- GATE 1: misses on AE-inside-non-AE (must be 0) ---`);
console.log(`Missed: ${misses.length}/${gateRows.length}  (miss rate ${pct(missRate)})`);
for (const m of misses) console.log(`  MISS #${m.id} [${m.type}] aeScore=${m.aeScore} — ${m.note}`);

console.log(`\n--- GATE 2: false positives on submissions that must not flag ---`);
console.log(`False positives: ${falsePositives.length}/${mustNotFlag.length}  (rate ${pct(fpRate)}, ceiling ${pct(FP_CEILING)})`);
for (const f of falsePositives) console.log(`  FP   #${f.id} [${f.category}] aeScore=${f.aeScore} — ${f.note}`);

console.log(`\n--- GATE 3: determinism --- ${det ? 'PASS (identical verdict on repeat)' : 'FAIL (verdict diverged)'}`);

console.log(`\n--- BASELINE: MIMS possibleAe reused as-is (what PD-2 originally proposed) ---`);
console.log(`Missed: ${baseMisses.length}/${gateRows.length}  (miss rate ${pct(baseMisses.length / gateRows.length)})`);

const pass = misses.length === 0 && fpRate <= FP_CEILING && det;
console.log(`\nGATE: ${pass ? 'PASS' : 'FAIL'}`);
process.exit(pass ? 0 : 1);
