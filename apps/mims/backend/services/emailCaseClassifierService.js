'use strict';

/**
 * emailCaseClassifierService.js — Email Case Import classifier (MIMS-32)
 *
 * Deterministic, confidence-scored extraction + classification for inbound
 * case-intake email. Extends the `deterministic-local` pattern from
 * ai/classifier.js — no external model call sits in the regulated intake path,
 * so every verdict is reproducible and auditable against the eval set (MIMS-33).
 *
 * Governance rules baked in (Epic MIMS-29 locked decisions):
 *  - Confidence-gated: the caller only auto-creates above the org threshold.
 *  - Asymmetric AE rule: moderate AE signal on a non-AE verdict forces human
 *    review flagged "possible AE" — the classifier never downgrades a possible
 *    adverse event to MI/PC (Mark Antony, decision #2).
 *  - Multi-issue email → primary type by regulation priority (AE > PC > MI)
 *    + secondary tag (decision #7).
 *  - Never emits seriousness/causality values — hints only (Sowmya, #20).
 *  - Junk is classified but never dropped (decision #16).
 */

// ── Signal lexicons ─────────────────────────────────────────────────────────
// Weights reflect specificity: highly case-type-specific phrases score higher
// than generic words. Tuned against the eval set in tests/eval (MIMS-33).

const AE_SIGNALS = [
  [/\badverse\s+(event|reaction|effect)\b/, 4],
  [/\bside\s+effects?\b/, 3],
  [/\ballergic\s+reaction\b/, 4],
  [/\bhospitali[sz](ed|ation)\b/, 4],
  [/\b(died|death|fatal|passed\s+away)\b/, 4],
  [/\blife[\s-]threatening\b/, 4],
  [/\b(seizure|anaphylaxis|overdose)\b/, 4],
  [/\bbirth\s+defect|congenital\b/, 4],
  [/\b(rash|hives|swelling|nausea|vomiting|dizz(y|iness)|headaches?|palpitations?|fainted?|fainting)\b/, 2],
  [/\bafter\s+(taking|using|starting)\b/, 2],
  [/\b(reaction|symptoms?)\b/, 1],
  [/\bemergency\s+(room|department)|\bER\b/, 3],
  [/\bdisab(led|ility)\b/, 3],
];

const PC_SIGNALS = [
  [/\b(product\s+)?complaint\b/, 4],
  [/\bdefect(ive)?\b/, 4],
  [/\b(broken|cracked|shattered|damaged)\b/, 3],
  [/\bleak(ing|ed)?\b/, 3],
  [/\bpackag(e|ing)\b/, 3],
  [/\btamper(ed|ing)?\b/, 4],
  [/\bcontaminat(ed|ion)\b/, 4],
  [/\bforeign\s+(particle|object|material)\b/, 4],
  [/\bdiscolou?r(ed|ation)\b/, 3],
  [/\b(missing|wrong)\s+(tablets?|pills?|capsules?|dose|quantity)\b/, 4],
  [/\blabel(ling|ing)?\s+(error|issue|wrong|incorrect)\b/, 4],
  [/\bquality\s+(issue|problem|concern)\b/, 3],
  [/\bexpir(ed|y)\s+(date|product)\b/, 2],
  [/\b(smell|odou?r|taste)s?\s+(strange|odd|off|wrong|unusual)\b/, 3],
];

const MI_SIGNALS = [
  [/\b(question|inquiry|enquiry|information)\b/, 2],
  [/\b(dosage|dose|dosing)\b.*\b(question|how|what|correct|right)\b/, 3],
  [/\bhow\s+(do|should|to|long|often|much)\b/, 2],
  [/\b(drug|medicine|medication)?\s*interactions?\b/, 3],
  [/\b(store|storage|refrigerat)/, 2],
  [/\bavailab(le|ility)\b/, 2],
  [/\b(ingredients?|excipients?|composition)\b/, 3],
  [/\bprescribing\s+information\b/, 3],
  [/\b(indication|contraindication)s?\b/, 3],
  [/\b(pregnan(t|cy)|breastfeed(ing)?)\b.*\b(safe|use|take|can)\b/, 3],
  [/\b(can|could|may)\s+i\s+(take|use|combine)\b/, 3],
  [/\b(insurance|coverage|price|cost|copay)\b/, 2],
  [/\bpackage\s+insert|leaflet\b/, 2],
];

const JUNK_SIGNALS = [
  [/\bunsubscribe\b/, 3],
  [/\b(newsletter|promotion(al)?|discount|sale|offer\s+expires|limited\s+time)\b/, 2],
  [/\b(lottery|winner|prize|congratulations\s+you)\b/, 4],
  [/\bout\s+of\s+office\b/, 4],
  [/\b(auto[\s-]?reply|automatic\s+reply)\b/, 3],
  [/\b(mailer[\s-]daemon|delivery\s+(status|failure)|undeliverable)\b/, 4],
  [/\b(click\s+here|act\s+now|buy\s+now)\b/, 3],
  [/\b(crypto|bitcoin|forex|investment\s+opportunity)\b/, 3],
];

// Hints ONLY — these never populate assessment fields (Sowmya, decision #20).
const SERIOUS_HINT_SIGNALS = [
  [/\b(died|death|fatal|passed\s+away)\b/, 'death mentioned'],
  [/\blife[\s-]threatening\b/, 'life-threatening mentioned'],
  [/\bhospitali[sz](ed|ation)\b/, 'hospitalization mentioned'],
  [/\bemergency\s+(room|department)|\bER\b/, 'emergency care mentioned'],
  [/\bdisab(led|ility)\b/, 'disability mentioned'],
  [/\bbirth\s+defect|congenital\b/, 'congenital anomaly mentioned'],
];

// Moderate AE signal floor: at/above this raw AE score, a non-AE verdict is
// forced to human review as "possible AE" (asymmetric rule). Deliberately low.
const AE_SIGNAL_FLOOR = 3;
// A second type whose raw score reaches this floor becomes the secondary tag.
const SECONDARY_FLOOR = 4;
// Regulation priority for primary-type resolution (decision #7).
const REGULATION_PRIORITY = ['AE', 'PC', 'MI'];

function scoreSignals(text, signals) {
  let score = 0;
  const matched = [];
  for (const [re, weight] of signals) {
    if (re.test(text)) {
      score += weight;
      matched.push(re.source.slice(0, 60));
    }
  }
  return { score, matched };
}

function normalizeText(subject, body) {
  return `${String(subject || '')}\n${String(body || '')}`.toLowerCase().slice(0, 50000);
}

// ── Field extraction ────────────────────────────────────────────────────────

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract "Label: value" style fields from the email body for each org-defined
 * intake field definition. Matches the label, its aliases, and the field_key
 * (underscores as spaces), case-insensitively, at line starts.
 */
function extractFields(rawText, fieldDefs) {
  const text = String(rawText || '');
  const extracted = {};
  for (const def of fieldDefs || []) {
    const names = [def.label, def.field_key ? String(def.field_key).replace(/_/g, ' ') : null]
      .concat(String(def.aliases || '').split(',').map((a) => a.trim()))
      .filter(Boolean);
    let value = null;
    for (const name of names) {
      const re = new RegExp(`^[\\s>*-]*${escapeRegex(name)}\\s*[:\\-–—]\\s*(.+)$`, 'im');
      const m = text.match(re);
      if (m && m[1] && m[1].trim()) {
        value = m[1].trim().slice(0, 500);
        break;
      }
    }
    if (value != null) extracted[def.field_key] = value;
  }
  return extracted;
}

// ── Confidence model ────────────────────────────────────────────────────────
//
// Confidence = share of the winning type's score over all type scores, damped
// by: short bodies (little evidence), near-ties (ambiguity), and boosted by
// structured field presence (sender followed the intake template).

function computeConfidence({ topScore, totalScore, secondScore, bodyLength, extractedCount, requiredCount }) {
  if (topScore <= 0) return 0;
  let confidence = topScore / (totalScore + 2); // +2 smoothing: one weak match never reaches the gate

  // Near-tie between the top two types → genuinely ambiguous, damp hard.
  if (secondScore > 0 && topScore - secondScore <= 1) confidence *= 0.7;

  // Very short bodies carry little evidence.
  if (bodyLength < 80) confidence *= 0.7;
  else if (bodyLength < 200) confidence *= 0.9;

  // Structured intake fields present → the sender used the template; strong
  // signal the email is a genuine, well-formed report.
  if (requiredCount > 0) {
    const fieldRatio = Math.min(1, extractedCount / requiredCount);
    confidence = confidence * 0.7 + fieldRatio * 0.3;
  }

  return Math.max(0, Math.min(1, Number(confidence.toFixed(3))));
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * classifyEmail({ subject, body, fieldDefs }) →
 * {
 *   caseType, secondaryCaseType, confidence,
 *   isJunk, aeSignal, possibleAe,
 *   seriousHints: [..],            // display hints only — never field values
 *   extracted: { field_key: value },
 *   missingRequired: [field_key],
 *   evidence: { ae, pc, mi, junk } // raw scores for audit/eval transparency
 * }
 */
function classifyEmail({ subject = '', body = '', fieldDefs = [] } = {}) {
  const text = normalizeText(subject, body);
  const rawText = `${subject || ''}\n${body || ''}`;

  const ae = scoreSignals(text, AE_SIGNALS);
  const pc = scoreSignals(text, PC_SIGNALS);
  const mi = scoreSignals(text, MI_SIGNALS);
  const junk = scoreSignals(text, JUNK_SIGNALS);

  const extracted = extractFields(rawText, fieldDefs);
  const requiredDefs = (fieldDefs || []).filter((d) => d.is_required && d.is_active !== 0);
  const missingRequired = requiredDefs
    .filter((d) => !(d.field_key in extracted))
    .map((d) => d.field_key);

  // Junk verdict: junk signal dominates all case-type signal. Junk is never
  // auto-cased AND never dropped — the caller leaves it in the Inbox.
  const maxCaseScore = Math.max(ae.score, pc.score, mi.score);
  const isJunk = junk.score >= 4 && junk.score > maxCaseScore;

  // Types with any signal, ranked by raw score.
  const ranked = [
    { type: 'AE', score: ae.score },
    { type: 'PC', score: pc.score },
    { type: 'MI', score: mi.score },
  ].sort((a, b) => b.score - a.score);

  // Primary type: among types with meaningful signal, the most regulated wins
  // (decision #7). A type qualifies for primary contention if its score is
  // within striking distance of the top score.
  const contenders = ranked.filter((r) => r.score > 0 && r.score >= ranked[0].score - 1);
  let caseType = 'MI'; // default: an email with no signals is a plain inquiry
  if (contenders.length > 0) {
    caseType = REGULATION_PRIORITY.find((t) => contenders.some((c) => c.type === t)) || ranked[0].type;
  }

  // Secondary tag: strongest OTHER type at/above the secondary floor.
  const secondary = ranked.find((r) => r.type !== caseType && r.score >= SECONDARY_FLOOR);
  const secondaryCaseType = secondary ? secondary.type : null;

  const topScore = ranked.find((r) => r.type === caseType)?.score || 0;
  const secondScore = ranked.filter((r) => r.type !== caseType).reduce((m, r) => Math.max(m, r.score), 0);
  const totalScore = ae.score + pc.score + mi.score;

  const confidence = isJunk ? 0 : computeConfidence({
    topScore,
    totalScore,
    secondScore,
    bodyLength: String(body || '').length,
    extractedCount: requiredDefs.filter((d) => d.field_key in extracted).length,
    requiredCount: requiredDefs.length,
  });

  // Asymmetric AE rule (decision #2): moderate AE signal on a non-AE verdict
  // forces human review. The classifier itself never "resolves" the ambiguity.
  const aeSignal = ae.score >= AE_SIGNAL_FLOOR;
  const possibleAe = aeSignal && caseType !== 'AE';

  const seriousHints = SERIOUS_HINT_SIGNALS
    .filter(([re]) => re.test(text))
    .map(([, hint]) => hint);

  return {
    caseType,
    secondaryCaseType,
    confidence,
    isJunk,
    aeSignal,
    possibleAe,
    seriousHints,
    extracted,
    missingRequired,
    evidence: {
      ae: { score: ae.score, matched: ae.matched },
      pc: { score: pc.score, matched: pc.matched },
      mi: { score: mi.score, matched: mi.matched },
      junk: { score: junk.score, matched: junk.matched },
    },
    model: 'deterministic-local/eci-v1',
  };
}

module.exports = {
  classifyEmail,
  extractFields,
  AE_SIGNAL_FLOOR,
  SECONDARY_FLOOR,
};
