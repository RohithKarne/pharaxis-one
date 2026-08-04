'use strict';

/**
 * portal-ae-screening-holdout.js — INDEPENDENT holdout set for CP Portal AE screening (PD-2)
 *
 * WHY THIS EXISTS
 *   The first set (`portal-ae-screening-eval.js`) was written by the same person
 *   who then wrote the vocabulary fix to make it pass. That is overfitting by
 *   construction and it measures nothing about real traffic. This set is the
 *   correction.
 *
 * THE DISCIPLINE — this is the part that makes the number worth anything
 *   1. Cases written from CLINICAL SCENARIOS, not from the lexicon. No case was
 *      authored by looking at which words score what.
 *   2. No text reused from the first set.
 *   3. It is a HOLDOUT. It is run ONCE. The lexicon is NOT tuned against these
 *      results. If it fails, the failure is the measurement — the fix is a
 *      separate, deliberate decision, not a retro-fit until it goes green.
 *
 * HONEST LIMITATION
 *   Genuine blindness was not achievable here: the same author has seen the
 *   earlier probe. What is achievable — and what was done — is deriving the cases
 *   from how people actually describe medical harm rather than from the matching
 *   rules, and refusing to iterate after the run. A fully independent set needs a
 *   different author and, better, real portal traffic. Stated, not implied.
 *
 * Run: node apps/cp-portal/backend/tests/eval/portal-ae-screening-holdout.js
 */

const { portalFlagRule, PORTAL_AE_FLOOR } = require('./portal-ae-rule');

const H = [];
const add = (category, type, expectFlag, form, note) =>
  H.push({ id: H.length + 1, category, type, expectFlag, form, note });

// ═══ ae_in_non_ae — an adverse event described inside a non-AE submission ═══
// Written as the scenarios a portal actually receives. Mixed registers: HCP,
// patient, carer, non-native English, typos, indirect description.

// -- Clinician register --------------------------------------------------
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'Sixty-eight year old female, three weeks into therapy, presented with jaundice and deranged LFTs. Withdrawing the drug. What is the recommended re-challenge protocol?' }, 'hepatotoxicity, clinical register');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'We observed profound neutropenia on day 14 bloods. Patient is now on prophylactic antibiotics. Advice on monitoring frequency?' }, 'haematological toxicity');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'Patient presented to clinic with bilateral lower limb oedema and shortness of breath after four weeks. Is dose reduction indicated?' }, 'cardiac-type presentation');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'QT prolongation noted on ECG following initiation. We have stopped the drug. Any published guidance on concomitant use with macrolides?' }, 'ECG finding');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'Two patients on this therapy have now developed Stevens-Johnson syndrome. What is your position on class effect?' }, 'named severe cutaneous reaction');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'Acute kidney injury developed following the second cycle, creatinine doubled. Requesting renal dosing guidance.' }, 'AKI');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'The patient became profoundly hypotensive within an hour of administration and required fluid resuscitation. Query on infusion rate.' }, 'hypotension requiring intervention');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'Suspected drug-induced lupus. ANA positive, symptoms resolved on withdrawal. Do you hold data on incidence?' }, 'immunological, resolved on withdrawal');

// -- Patient and carer register ------------------------------------------
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'Since starting these tablets my mum has been so drowsy she cannot get out of bed. Is that expected and should she keep taking them?' }, 'functional impairment, lay');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'I have been throwing up every morning since the doctor changed my dose. Can I take it at night instead?' }, 'lay description of vomiting');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'My husband has been having really bad chest pain since he started this. We are worried. What should we do?' }, 'chest pain, lay');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'my skin has gone yellow and my wee is dark since taking these. is that the tablets' }, 'jaundice in lay terms, no punctuation');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'My daughter has come out in a terrible itchy red patch all over her back and her lips have gone puffy. Please advise urgently.' }, 'allergic presentation, lay wording');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'I keep falling over since I started this medicine. Ive hurt my wrist twice now. Is there an alternative?' }, 'falls with injury, typo');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'Ever since the new prescription my father does not recognise us and talks to people who are not there. Could the tablets cause this?' }, 'confusion/hallucination, lay');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'I have lost about 9 kilos in six weeks and I have no appetite at all since starting. Is this a known thing?' }, 'weight loss, quantified');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'my little boy went floppy and grey after his dose and we panicked and drove him to the childrens hospital' }, 'paediatric emergency, lay, no keyword');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'I had to be put on a drip in hospital because I got so dehydrated from the diarrhoea. Do I restart the medicine?' }, 'hospital treatment, lay');

// -- Non-native English phrasing -----------------------------------------
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'After taking medicine my body is full itching and face is swelling too much. Please tell what to do. Doctor is not available.' }, 'non-native phrasing, allergic');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'Patient is having very much loose motion and vomiting from three days after start of tablet. Kindly guide.' }, 'non-native phrasing, GI');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'My mother she is not able to breathe properly after taking and we take her to hospital emergency. Now she is admitted.' }, 'non-native phrasing, admission');

// -- Indirect / consequence-only description ------------------------------
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'We had to stop the treatment early because of what it did to her stomach lining — she was bleeding. What are the alternatives in this class?' }, 'GI bleed described indirectly');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'The patient is no longer with us. The family have asked whether the medication contributed. How do I obtain the safety data?' }, 'HARD: death implied, never stated');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'He spent four days on a ventilator and is now recovering at home. Would you consider this reportable?' }, 'HARD: ventilator, no lexicon term');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'She needed a blood transfusion afterwards. Is that documented anywhere in your literature?' }, 'HARD: transfusion, no lexicon term');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'The surgery had to be cancelled because of what happened after the first dose. Requesting the SmPC.' }, 'HARD: consequence only, no symptom named');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'We called 999 and the paramedics took over. Query about restarting.' }, 'HARD: UK emergency number, no lexicon term');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'My son was sectioned after a marked change in his mood which began the week he started this. Is psychiatric disturbance listed?' }, 'HARD: psychiatric, UK term');

// -- Other submission types ----------------------------------------------
add('ae_in_non_ae', 'product_complaint', true, { description: 'Two tablets in the strip were a different colour. My mother took one before we noticed and spent the night vomiting.' }, 'PC + AE, lay');
add('ae_in_non_ae', 'product_complaint', true, { description: 'The autoinjector fired early and delivered into the wrong site. The area is now hot, swollen and spreading. GP has started antibiotics.' }, 'device + injection site reaction');
add('ae_in_non_ae', 'product_complaint', true, { description: 'Suspected counterfeit packaging. Patient took the contents and was admitted overnight for observation.' }, 'PC + admission');
add('ae_in_non_ae', 'other_inquiry', true, { message: 'I wanted to say the pharmacist was very helpful. Separately my wife had a very bad reaction to the medicine and ended up in hospital for two nights.' }, 'AE inside positive feedback');
add('ae_in_non_ae', 'other_inquiry', true, { message: 'Enquiring about your patient assistance scheme. Background is my treatment was stopped after I had a fit.' }, 'HARD: "a fit" — UK lay term for seizure');
add('ae_in_non_ae', 'other_inquiry', true, { message: 'Can someone call me back. My daughter was very unwell after her dose and I do not know who to tell.' }, 'HARD: "very unwell", explicit not-knowing-who-to-tell');

// -- Short submissions -----------------------------------------------------
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'Bad reaction, ended up in hospital. Now what?' }, 'very short, 44 chars');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'Rash everywhere. Stop taking?' }, 'HARD: very short, single symptom');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'Passed out twice. Dose query.' }, 'HARD: very short, lay syncope');

// -- Multiple free-text fields ---------------------------------------------
add('ae_in_non_ae', 'medical_inquiry', true, { question_summary: 'Dosing in renal impairment', inquiry_details: 'Context: the patient was admitted to the renal unit with acute kidney injury shortly after starting therapy.' }, 'AE in the second of two text fields');
add('ae_in_non_ae', 'medical_inquiry', true, { question: 'Storage query.', details: 'Note that my patient suffered anaphylaxis on first exposure and carries an adrenaline pen now.' }, 'AE in secondary details field');

// ═══ genuine_ae — correctly filed, must NOT flag ═══════════════════════════
add('genuine_ae', 'adverse_event', false, { event_description: 'Widespread urticaria and facial angioedema within thirty minutes of the first dose. Treated with IM adrenaline in the emergency department.', seriousness: 'Life-threatening' }, 'correct AE filing, severe');
add('genuine_ae', 'adverse_event', false, { event_description: 'Gradual onset of peripheral neuropathy over eight weeks. Ongoing.', outcome: 'Not recovered' }, 'correct AE filing, non-serious, no strong keywords');
add('genuine_ae', 'adverse_event', false, { event_description: 'Patient became confused and disoriented on day three. Resolved on discontinuation.' }, 'correct AE filing, neuropsychiatric');
add('genuine_ae', 'adverse_event', false, { event_description: 'Elevated liver enzymes detected on routine bloods, asymptomatic.' }, 'correct AE filing, lab-only');
add('genuine_ae', 'adverse_event', false, { event_description: 'Fatal outcome. Patient deteriorated over 48 hours following administration.', outcome: 'Fatal' }, 'correct AE filing, fatal');
add('genuine_ae', 'adverse_event', false, { event_description: 'Injection site induration approximately 4cm, no systemic features.' }, 'correct AE filing, local reaction only');

// ═══ clean — no adverse event, must NOT flag ══════════════════════════════

// -- Straightforward information requests ---------------------------------
add('clean', 'medical_inquiry', false, { question: 'What is the bioavailability of the oral formulation compared with the intravenous route?' }, 'pharmacokinetics');
add('clean', 'medical_inquiry', false, { question: 'Please confirm whether the tablets can be crushed for administration via a nasogastric tube.' }, 'administration query');
add('clean', 'medical_inquiry', false, { question: 'Is there a gluten-free formulation available for coeliac patients?' }, 'formulation query');
add('clean', 'medical_inquiry', false, { question: 'What is the licensed indication in the UK and does it differ from the EU label?' }, 'regulatory query');
add('clean', 'medical_inquiry', false, { question: 'Requesting the full prescribing information and any available health economic data.' }, 'document request');
add('clean', 'medical_inquiry', false, { question: 'How long can the reconstituted solution be kept at room temperature before it must be discarded?' }, 'stability query');
add('clean', 'medical_inquiry', false, { question: 'Do you have a patient information leaflet in Welsh and in Polish?' }, 'translation request');
add('clean', 'medical_inquiry', false, { question: 'What monitoring is recommended at baseline before initiating therapy?' }, 'monitoring query');
add('clean', 'medical_inquiry', false, { question: 'Is there an interaction with grapefruit juice or St John\'s Wort?' }, 'interaction query');
add('clean', 'medical_inquiry', false, { question: 'Can this be prescribed in primary care or is it hospital-only?' }, 'supply setting');
add('clean', 'medical_inquiry', false, { question: 'What is the recommended duration of therapy for the licensed indication?' }, 'duration query');
add('clean', 'medical_inquiry', false, { question: 'Is a dose adjustment required in patients over 75 with normal renal function?' }, 'elderly dosing');
add('clean', 'medical_inquiry', false, { question: 'Please send details of your compassionate use programme and the eligibility criteria.' }, 'access programme');
add('clean', 'medical_inquiry', false, { question: 'What excipients are present and is the product suitable for a patient with a peanut allergy?' }, 'HARD NEGATIVE: allergy mentioned, no event');
add('clean', 'medical_inquiry', false, { question: 'Is the product contraindicated in patients with a history of epilepsy?' }, 'HARD NEGATIVE: history, contraindication query');
add('clean', 'medical_inquiry', false, { question: 'If a patient were to develop a severe reaction, what is your recommended management pathway?' }, 'HARD NEGATIVE: hypothetical, conditional');
add('clean', 'medical_inquiry', false, { question: 'The published trial reported nausea in 12% of participants. Do you have the breakdown by dose?' }, 'HARD NEGATIVE: trial data reference');
add('clean', 'medical_inquiry', false, { question: 'A colleague asked me whether hospitalisation rates differ between the two formulations. Is that published?' }, 'HARD NEGATIVE: hospitalisation as a statistic');
add('clean', 'medical_inquiry', false, { question: 'Our pharmacy team is preparing a formulary submission and needs the adverse event profile from the pivotal trial.' }, 'HARD NEGATIVE: requesting AE data, no event');
add('clean', 'medical_inquiry', false, { question: 'What proportion of patients discontinued due to side effects in the extension study?' }, 'HARD NEGATIVE: discontinuation statistic');

// -- Product complaints without harm ---------------------------------------
add('clean', 'product_complaint', false, { description: 'The child-resistant cap does not close properly on this batch. Reporting for quality purposes only.' }, 'clean PC, packaging');
add('clean', 'product_complaint', false, { description: 'Carton states 28 tablets, blister contains 27. Nobody has taken any.' }, 'clean PC, count discrepancy');
add('clean', 'product_complaint', false, { description: 'Print on the foil is smudged and the expiry date is illegible.' }, 'clean PC, labelling');
add('clean', 'product_complaint', false, { description: 'Delivery arrived above the stated cold chain temperature. Stock quarantined, not dispensed.' }, 'clean PC, cold chain');
add('clean', 'product_complaint', false, { description: 'The pump dispenser jams after about ten actuations. Product itself appears normal.' }, 'clean PC, device');

// -- Other inquiries --------------------------------------------------------
add('clean', 'other_inquiry', false, { message: 'Requesting a copy of your modern slavery statement for our procurement file.' }, 'clean other, procurement');
add('clean', 'other_inquiry', false, { message: 'Who is the medical science liaison covering the North West region?' }, 'clean other, contact request');
add('clean', 'other_inquiry', false, { message: 'Please remove me from your mailing list.' }, 'clean other, unsubscribe');
add('clean', 'other_inquiry', false, { message: 'We would like to invite a speaker to our regional educational meeting in November.' }, 'clean other, engagement');
add('clean', 'other_inquiry', false, { message: 'The portal timed me out three times while I was completing a form. Please fix.' }, 'clean other, usability complaint');

// ═══ hedge — explicitly negated, must NOT flag ════════════════════════════
add('hedge', 'medical_inquiry', false, { question: 'To be clear there was no adverse event of any kind. My question is purely about the storage temperature.' }, 'explicit negation');
add('hedge', 'medical_inquiry', false, { question: 'The patient denies any side effect whatsoever. Asking only about the titration interval.' }, 'denies any side effect');
add('hedge', 'medical_inquiry', false, { question: 'The rash was confirmed unrelated to the medication by dermatology — contact allergy to a plaster. Dosing question follows.' }, 'attributed elsewhere, unrelated to the medication');
add('hedge', 'medical_inquiry', false, { question: 'Her nausea is probably not related to the drug as it predates the prescription. Query on the maximum dose.' }, 'probably not related, temporal argument');

// ═══ noise / edge — must NOT flag ═════════════════════════════════════════
add('noise', 'medical_inquiry', false, { question: 'testing 123' }, 'test submission');
add('noise', 'medical_inquiry', false, { question: '.' }, 'single punctuation');
add('noise', 'other_inquiry', false, { message: 'qwertyuiop' }, 'keyboard mash');
add('noise', 'medical_inquiry', false, { question: '   ' }, 'whitespace only');
add('noise', 'other_inquiry', false, {}, 'no free-text field');
add('noise', 'medical_inquiry', false, { question: 'Hi' }, 'greeting only');
add('noise', 'product_complaint', false, { suspect_product: 'Atorvastatin', patient_age: '70' }, 'structured fields only, no narrative');

// ═══ Run — ONCE. No tuning against these results. ═════════════════════════

const results = H.map((item) => {
  const r = portalFlagRule(item.type, item.form);
  return { ...item, got: r.flag, aeScore: r.aeScore, hedged: r.hedged, correct: r.flag === item.expectFlag };
});

const by = (cat) => results.filter((r) => r.category === cat);
const gate = by('ae_in_non_ae');
const misses = gate.filter((r) => !r.got);
const mustNot = results.filter((r) => !r.expectFlag);
const fps = mustNot.filter((r) => r.got);

const pct = (n) => `${(n * 100).toFixed(1)}%`;

console.log('CP Portal — AE Screening HOLDOUT (PD-2)');
console.log(`${H.length} cases | floor ${PORTAL_AE_FLOOR} | run once, no tuning against these results\n`);

console.log('Category      | Cases | Correct | Wrong');
for (const cat of ['ae_in_non_ae', 'genuine_ae', 'clean', 'hedge', 'noise']) {
  const rows = by(cat);
  const ok = rows.filter((r) => r.correct).length;
  console.log(`${cat.padEnd(13)} | ${String(rows.length).padStart(5)} | ${String(ok).padStart(7)} | ${String(rows.length - ok).padStart(5)}`);
}

console.log(`\n--- MISSES on AE-inside-non-AE: ${misses.length}/${gate.length} (${pct(misses.length / gate.length)}) ---`);
for (const m of misses) console.log(`  MISS #${String(m.id).padStart(3)} [${m.type}] score=${m.aeScore}${m.hedged ? ' HEDGED' : ''} — ${m.note}`);

console.log(`\n--- FALSE POSITIVES: ${fps.length}/${mustNot.length} (${pct(fps.length / mustNot.length)}) ---`);
for (const f of fps) console.log(`  FP   #${String(f.id).padStart(3)} [${f.category}] score=${f.aeScore} — ${f.note}`);

console.log(`\nGATE (0 misses required): ${misses.length === 0 ? 'PASS' : 'FAIL'}`);
process.exit(misses.length === 0 ? 0 : 1);
