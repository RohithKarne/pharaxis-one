'use strict';

const pool = require('../../database/db');
const { computePrRor } = require('./signalDetection');

/**
 * Automatic PRR/ROR signal detection — DISABLED (MIMS-46, Option B).
 *
 * Decided by Rohith 2026-07-30 on Sowmya's recommendation.
 *
 * The problem: the disproportionality calculation ran with the comparator cells
 * hardcoded — `computePrRor({ a: row.case_count, b: 5, c: 3, d: 30 })`. With
 * b=5, c=3, d=30 fixed, that reduces to
 *
 *     ror = (a * 30) / (5 * 3) = 2a          threshold: ror >= 2
 *
 * so any pair with at least one case flagged `review_required`. Combined with
 * `HAVING COUNT(DISTINCT r.case_id) >= 1`, the module opened a review row for
 * EVERY product/reaction pair it found. Measured: case_count 1 → ror 2,
 * 10 → ror 20, 50 → ror 100. Always true.
 *
 * That is not a noisy signal, it is a constant. A flag that fires on everything
 * is worse than no flag, because reviewers learn to trust it and it means
 * nothing. GVP signal-detection methodology depends on real background
 * reporting rates, and MIMS has no such dataset.
 *
 * Detection stays off until a real comparator source is wired in (MIMS-46
 * Option A). This is a deliberate hard gate, not a config toggle — there is no
 * environment variable that turns it back on, because re-enabling it requires
 * the comparator data, not a flag.
 *
 * ── For whoever implements Option A ───────────────────────────────────────
 * Three defects in the original implementation must be fixed at the same time.
 * They are recorded here rather than silently dropped with the code:
 *   1. `LIMIT 100` truncated the candidate set with no logging, so the number of
 *      pairs assessed was capped arbitrarily and invisibly.
 *   2. The INSERT had no uniqueness or dedupe guard, so every run appended
 *      duplicate review rows for pairs already flagged.
 *   3. `enterprise-platform-services.test.js` asserted `review_required === true`
 *      for {a:10,b:5,c:3,d:30} — it pinned the arithmetic, not any methodology,
 *      so it was never evidence the calculation was correct.
 */

const DISABLED_REASON =
  'Automatic PRR/ROR signal detection is disabled. The disproportionality ' +
  'calculation has no real background-reporting-rate comparator, so its output ' +
  'is not a valid pharmacovigilance signal (MIMS-46).';

/**
 * Returns a structured disabled result and writes nothing.
 *
 * Deliberately does not throw: callers audit and surface the reason. Throwing
 * would read as a fault, and this is an intentional product state.
 */
async function runSignalDetection(_orgId) {
  return {
    enabled: false,
    reason: DISABLED_REASON,
    statistically_validated: false,
    created: [],
  };
}

/**
 * The candidate query, preserved for Option A. Not called while detection is
 * disabled — exported so re-enabling starts from what existed rather than a
 * reconstruction. `limit` is clamped rather than interpolated raw.
 */
async function findCandidatePairs(orgId, limit = 100) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 1000);
  const [rows] = await pool.execute(
    `SELECT d.medicinal_product_name AS product_name, rx.meddra_pt_name AS reaction_term,
            COUNT(DISTINCT r.case_id) AS case_count, JSON_ARRAYAGG(r.case_id) AS case_ids
       FROM icsr_reports r
       JOIN icsr_drugs d ON d.icsr_id = r.id
       JOIN icsr_reactions rx ON rx.icsr_id = r.id
      WHERE r.org_id = ? AND d.medicinal_product_name IS NOT NULL AND rx.meddra_pt_name IS NOT NULL
      GROUP BY d.medicinal_product_name, rx.meddra_pt_name
      HAVING COUNT(DISTINCT r.case_id) >= 1
      LIMIT ${lim}`,
    [orgId]
  );
  return rows;
}

module.exports = {
  runSignalDetection,
  findCandidatePairs,
  computePrRor,
  DISABLED_REASON,
  SIGNAL_DETECTION_ENABLED: false,
};
