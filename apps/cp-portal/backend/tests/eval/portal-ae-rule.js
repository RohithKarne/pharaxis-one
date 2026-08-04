'use strict';

/**
 * portal-ae-rule.js — the candidate CP Portal AE flag rule (PD-2)
 *
 * Extracted so the tuning set and the holdout set exercise the SAME rule rather
 * than two copies that drift. This module is the specification the eventual
 * implementation must satisfy — when the feature is built, the implementation
 * should be imported here and this candidate deleted, so the eval sets test
 * shipped code.
 *
 * WHY THE MIMS `possibleAe` FIELD CANNOT BE REUSED
 *   emailCaseClassifierService.js:280 defines it as `aeSignal && caseType !== 'AE'`,
 *   where caseType is the CLASSIFIER'S OWN verdict. MIMS uses that verdict as the
 *   case type, so it is a valid self-check there. CP Portal does not override the
 *   visitor's chosen type, so the comparison must be against the SUBMITTED type.
 *   Measured miss rate reusing it as-is: 95.7%.
 *
 * WHAT IS AND IS NOT VENDORED
 *   The classifier is vendored unchanged and pinned (`deterministic-local/eci-v1`)
 *   so the drift test against MIMS stays meaningful. Everything in THIS file is a
 *   portal-side layer above it, versioned separately. Do not push portal
 *   vocabulary down into the vendored module.
 */

const CLASSIFIER_PATH = process.env.PORTAL_ECI_PATH
  || '../../../../mims/backend/services/emailCaseClassifierService';
const { classifyEmail, AE_SIGNAL_FLOOR } = require(CLASSIFIER_PATH);

// Portal AE floor. MIMS uses 3, tuned for email. Portal text is shorter and a
// real event often carries fewer matching phrases. Overridable so the trade-off
// can be measured rather than asserted.
const PORTAL_AE_FLOOR = Number(process.env.PORTAL_AE_FLOOR || AE_SIGNAL_FLOOR);

// Portal hedges. NOTE the difference from MIMS: MIMS uses a bare
// /\b(un|not\s+)related\b/, which in portal text also matches "Unrelated note:" —
// someone flagging a change of subject. That suppressed a genuine hospitalisation
// scoring 6. The portal pattern requires the negation to attach to the product.
const HEDGE_SIGNALS = [
  /\bno\s+adverse\s+event\b/,
  /\b(un|not\s+)related\s+to\s+(the\s+|any\s+)?(medication|drug|product|treatment|tablet|dose|vaccine)/,
  /\bdenies?\s+(any\s+)?(reaction|side\s+effect|symptom)/,
  /\bmight\s+be\s+the\b/,
  /\bprobably\s+(un|not\s+)?related\b/,
];

// Portal AE vocabulary supplement — terms the MIMS lexicon does not know because
// it was tuned against clinician email, not portal text typed by patients and
// relatives. UK emergency-care terms and lay descriptions of harm.
const PORTAL_AE_SUPPLEMENT = [
  [/\bambulance\b/, 3],
  [/\ba\s*&\s*e\b|\baccident\s+and\s+emergency\b/, 3],
  [/\bintensive\s+care\b|\bicu\b|\bhigh\s+dependency\b/, 4],
  [/\bstopped\s+breathing\b|\b(not|wasn'?t)\s+breathing\b/, 4],
  [/\bunresponsive\b|\bblacked?\s+out\b/, 4],
  [/\bcollapsed?\b/, 3],
  [/\bblue[\s-]lighted\b|\brushed\s+to\s+(the\s+)?hospital\b/, 3],
  [/\badmi(tted|ssion)\s+(to\s+)?(the\s+)?(hospital|ward|unit|icu)\b/, 4],
  [/\bblotch(es|y)\b|\bcame\s+out\s+in\b/, 2],
];

// Free-text keys the portal stores. From the alias list in
// routes/portal/submit.js (buildMimsPayload) and the default AE template in
// routes/portal/content.js.
const TEXT_KEYS = [
  'question', 'inquiry_details', 'question_details', 'question_summary',
  'message', 'description', 'details', 'event_description', 'complaint_details',
];

function submissionText(form) {
  return Object.entries(form || {})
    .filter(([k]) => TEXT_KEYS.includes(k))
    .map(([, v]) => String(v))
    .join('\n');
}

function supplementScore(text) {
  return PORTAL_AE_SUPPLEMENT.reduce((s, [re, w]) => (re.test(text) ? s + w : s), 0);
}

/**
 * portalFlagRule(submittedType, form) →
 *   { flag, aeScore, hedged, verdict }
 *
 * `flag` true means: raise an AE review task for the client safety team.
 * It never changes the submission type — the visitor's choice stands (Sowmya).
 */
function portalFlagRule(submittedType, form) {
  const text = submissionText(form);
  const lower = text.toLowerCase();
  const verdict = classifyEmail({ subject: '', body: text, fieldDefs: [] });
  const hedged = HEDGE_SIGNALS.some((re) => re.test(lower));
  const aeScore = verdict.evidence.ae.score + supplementScore(lower);
  return {
    flag: aeScore >= PORTAL_AE_FLOOR && submittedType !== 'adverse_event' && !hedged,
    aeScore,
    hedged,
    verdict,
  };
}

module.exports = {
  portalFlagRule,
  submissionText,
  classifyEmail,
  PORTAL_AE_FLOOR,
  AE_SIGNAL_FLOOR,
};
