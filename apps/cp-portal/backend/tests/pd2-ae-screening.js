/**
 * PD-2 regression — adverse-event screening on portal submissions.
 *
 * Every non-AE portal form asks whether anyone became unwell. A "Yes" raises a
 * safety review task that cannot be closed without a recorded outcome.
 *
 * THE TEST THAT MATTERS IS T1.4. A client configures its own form fields; if a
 * client config can suppress the screening question, this is a safety control
 * with an off switch. Everything else here is hygiene by comparison.
 *
 * No network and no database — these assert the pure screening logic and the
 * field-injection invariant, which is where the control actually lives.
 *
 * Run: node tests/pd2-ae-screening.js
 */
const assert = require('assert');

const {
  AE_SCREEN_KEY, AE_SCREEN_DETAIL_KEY, AE_SCREEN_FIELDS,
  isScreenedType, withAeScreening, validateAnswer, isFlagged,
} = require('../services/aeScreening');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (err) { failures++; console.error(`✗ ${name}\n   ${err.message}`); }
}

const SCREENED = ['medical_inquiry', 'product_complaint', 'other_inquiry'];
const CLIENT_FIELDS = [
  { field_key: 'reporter_name', label: 'Your name', is_required: 1 },
  { field_key: 'question',      label: 'Your question', is_required: 1 },
];
const keys = (fields) => fields.map((f) => f.field_key);

// ── T1.1 / T1.2 — which forms carry the question ───────────────────────────

check('T1.1 the question is present on every non-AE form', () => {
  for (const t of SCREENED) {
    const out = keys(withAeScreening(CLIENT_FIELDS, t));
    assert.ok(out.includes(AE_SCREEN_KEY), `${t} is missing ${AE_SCREEN_KEY}`);
    assert.ok(out.includes(AE_SCREEN_DETAIL_KEY), `${t} is missing ${AE_SCREEN_DETAIL_KEY}`);
  }
});

check('T1.2 the question is absent on the adverse_event form', () => {
  const out = keys(withAeScreening(CLIENT_FIELDS, 'adverse_event'));
  assert.ok(!out.includes(AE_SCREEN_KEY), 'adverse_event should not be screened — it is already an AE report');
  assert.strictEqual(isScreenedType('adverse_event'), false);
});

check('client fields are preserved and the question is appended last', () => {
  const out = keys(withAeScreening(CLIENT_FIELDS, 'medical_inquiry'));
  assert.deepStrictEqual(out, ['reporter_name', 'question', AE_SCREEN_KEY, AE_SCREEN_DETAIL_KEY]);
});

// ── T1.3 / T1.5 — answering is mandatory ───────────────────────────────────

check('T1.3 a submission with no answer is rejected', () => {
  for (const t of SCREENED) {
    assert.ok(validateAnswer(t, { question: 'What is the dose?' }), `${t} accepted a missing answer`);
  }
});

check('T1.3 an empty or whitespace answer is rejected', () => {
  assert.ok(validateAnswer('medical_inquiry', { [AE_SCREEN_KEY]: '' }));
  assert.ok(validateAnswer('medical_inquiry', { [AE_SCREEN_KEY]: '   ' }));
});

check('T1.3 a value outside Yes/No is rejected — no smuggling a third state', () => {
  for (const bad of ['Maybe', 'yes please', 'true', '1', 'Y']) {
    assert.ok(validateAnswer('medical_inquiry', { [AE_SCREEN_KEY]: bad }), `accepted "${bad}"`);
  }
});

check('T1.3 Yes and No are both accepted', () => {
  assert.strictEqual(validateAnswer('medical_inquiry', { [AE_SCREEN_KEY]: 'Yes' }), null);
  assert.strictEqual(validateAnswer('medical_inquiry', { [AE_SCREEN_KEY]: 'No' }), null);
});

check('an adverse_event submission is not asked to answer', () => {
  assert.strictEqual(validateAnswer('adverse_event', {}), null);
});

check('T1.5 the detail box is optional — a Yes with no detail still submits', () => {
  assert.strictEqual(validateAnswer('medical_inquiry', { [AE_SCREEN_KEY]: 'Yes' }), null);
  assert.strictEqual(isFlagged('medical_inquiry', { [AE_SCREEN_KEY]: 'Yes' }), true,
    'a Yes with no narrative must still raise the flag');
  const detail = AE_SCREEN_FIELDS.find((f) => f.field_key === AE_SCREEN_DETAIL_KEY);
  assert.strictEqual(detail.is_required, 0, 'a mandatory narrative is a barrier — reporters answer No to get past it');
});

// ── T1.4 — THE ONE THAT MATTERS ────────────────────────────────────────────

check('T1.4 a client CANNOT remove the screening question', () => {
  // A client form config that simply does not include it.
  const out = keys(withAeScreening([{ field_key: 'question' }], 'medical_inquiry'));
  assert.ok(out.includes(AE_SCREEN_KEY), 'the question must be injected regardless of client config');
});

check('T1.4 a client CANNOT override the question by redefining the key', () => {
  const hostile = [
    { field_key: 'question' },
    { field_key: AE_SCREEN_KEY, label: 'Do you like our portal?', is_required: 0, field_type: 'text' },
  ];
  const out = withAeScreening(hostile, 'medical_inquiry');
  const matches = out.filter((f) => f.field_key === AE_SCREEN_KEY);
  assert.strictEqual(matches.length, 1, 'a colliding client field must be replaced, not duplicated');
  assert.strictEqual(matches[0].is_required, 1, 'the system field must stay mandatory');
  assert.strictEqual(matches[0].field_type, 'radio');
  assert.ok(matches[0].label.startsWith('Did anyone become unwell'), 'the client label must not win');
});

check('T1.4 a client CANNOT override the detail field either', () => {
  const hostile = [{ field_key: AE_SCREEN_DETAIL_KEY, label: 'hijacked', is_required: 1 }];
  const out = withAeScreening(hostile, 'medical_inquiry');
  const matches = out.filter((f) => f.field_key === AE_SCREEN_DETAIL_KEY);
  assert.strictEqual(matches.length, 1);
  assert.strictEqual(matches[0].is_required, 0);
});

check('T1.4 the question stays mandatory and stays a radio', () => {
  const q = AE_SCREEN_FIELDS.find((f) => f.field_key === AE_SCREEN_KEY);
  assert.strictEqual(q.is_required, 1);
  assert.strictEqual(q.field_type, 'radio', 'a dropdown hides both answers behind a click (Sowmya)');
  assert.deepStrictEqual(String(q.options).split('\n'), ['Yes', 'No']);
  assert.strictEqual(q.system_managed, 1);
});

check('the help text is present — it is the mitigation, not decoration', () => {
  const q = AE_SCREEN_FIELDS.find((f) => f.field_key === AE_SCREEN_KEY);
  assert.ok(q.help_text && q.help_text.length > 40,
    'the help text is what converts a hesitant No into a Yes; losing it silently costs most of the yield');
  assert.ok(/however minor/i.test(q.help_text));
  assert.ok(/whether or not you think the product caused it/i.test(q.help_text));
});

check('the wording never asks the reporter to judge causality', () => {
  const q = AE_SCREEN_FIELDS.find((f) => f.field_key === AE_SCREEN_KEY);
  assert.ok(!/side effect/i.test(q.label), '"side effect" presumes attribution the reporter cannot make');
  assert.ok(!/adverse event/i.test(q.label), 'regulatory jargon — most reporters do not know the term');
  assert.ok(/after using/i.test(q.label), 'the framing must be temporal, not causal');
});

// ── T1.6 — one task, and only when it is warranted ─────────────────────────

check('T1.6 only a Yes raises the flag', () => {
  for (const t of SCREENED) {
    assert.strictEqual(isFlagged(t, { [AE_SCREEN_KEY]: 'Yes' }), true, `${t} did not flag on Yes`);
    assert.strictEqual(isFlagged(t, { [AE_SCREEN_KEY]: 'No' }), false, `${t} flagged on No`);
    assert.strictEqual(isFlagged(t, {}), false, `${t} flagged with no answer`);
  }
});

check('T1.6 an adverse_event submission never raises a flag — it is already an AE', () => {
  assert.strictEqual(isFlagged('adverse_event', { [AE_SCREEN_KEY]: 'Yes' }), false);
});

// ── T1.13 — the flag never changes what the visitor filed ──────────────────

check('T1.13 screening does not touch the submission type', () => {
  // The rule reads the type; nothing in this module can write one. Asserted
  // structurally: no exported function returns or mutates a form type.
  const flaggedForm = { [AE_SCREEN_KEY]: 'Yes', question: 'dose?' };
  const before = JSON.stringify(flaggedForm);
  isFlagged('medical_inquiry', flaggedForm);
  validateAnswer('medical_inquiry', flaggedForm);
  assert.strictEqual(JSON.stringify(flaggedForm), before, 'screening must not mutate the submission');
});

// ── Phase 1 boundary — the flag does NOT travel to MIMS yet ────────────────

check('T1.11 phase 1 does not put the flag in the MIMS payload (MIMS-64)', () => {
  const submitSrc = require('fs').readFileSync(require('path').join(__dirname, '../routes/portal/submit.js'), 'utf8');
  const builder = submitSrc.slice(submitSrc.indexOf('function buildMimsPayload'));
  assert.ok(!builder.includes(AE_SCREEN_KEY) && !builder.includes('possible_ae'),
    'buildMimsPayload must not reference the flag until MIMS-64 gives it somewhere to land. ' +
    'A flag written into a field MIMS ignores reads as delivered and is not.');
});

// ── Report ─────────────────────────────────────────────────────────────────

console.log(failures === 0
  ? '\nPD-2 AE screening: all checks passed.'
  : `\nPD-2 AE screening: ${failures} FAILED.`);
process.exit(failures === 0 ? 0 : 1);
