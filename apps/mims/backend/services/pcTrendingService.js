'use strict';

/**
 * pcTrendingService.js — Sprint 2 #29: PC trending + signal detection.
 *
 * Read-only analytics over the existing PC tables (case_pc_versions + lot_master
 * from #19 + complaint_codes from #19 + field_action_records from #28).
 *
 * Definitions:
 *   - "Trend" = a count of PC cases sharing (product, complaint_code) over a
 *     window, normalized by a baseline.
 *   - "Signal" = a trend exceeding a configurable threshold (default: 5 cases
 *     in 30 days on the same product+complaint_code+lot, where the prior 60-day
 *     baseline was <2).
 *
 * No new tables — uses live SQL. Tenant admins tune the threshold via
 * pc_signal_settings (sites can have stricter thresholds for high-risk products).
 */

const pool = require('../database/db');

const DEFAULT_WINDOW_DAYS   = 30;
const DEFAULT_BASELINE_DAYS = 60;
const DEFAULT_MIN_CASES     = 5;
const DEFAULT_BASELINE_MAX  = 2;

/**
 * trends({orgId, windowDays?, productId?})
 *   → ranked list of (product, complaint_code, lot?) groups with case_count
 *     in window vs baseline. Used by the dashboard widget.
 */
async function trends({ orgId, windowDays = DEFAULT_WINDOW_DAYS, baselineDays = DEFAULT_BASELINE_DAYS, productId = null }) {
  const params = [orgId, windowDays, orgId, baselineDays, windowDays];
  let extraJoinFilter = '';
  if (productId) { extraJoinFilter = ' AND pi.product_id = ?'; params.push(Number(productId)); }

  // Best-effort: tolerate older schemas where some columns may be missing
  let rows = [];
  try {
    const [r] = await pool.execute(
      `
      WITH window_cases AS (
        SELECT cv.case_id, pi.product_id, cv.lot_master_id,
               cv.manufacturer_defect_code_id, cv.component_defect_code_id,
               cv.application_use_code_id, c.created_at
          FROM case_pc_versions cv
          LEFT JOIN case_pc_product_info pi ON pi.version_id = cv.id
          JOIN cases c ON c.id = cv.case_id
         WHERE c.org_id = ?
           AND c.created_at >= NOW() - INTERVAL ? DAY
           ${extraJoinFilter}
      ),
      grouped AS (
        SELECT product_id,
               COALESCE(manufacturer_defect_code_id, component_defect_code_id, application_use_code_id) AS complaint_code_id,
               lot_master_id,
               COUNT(*) AS case_count
          FROM window_cases
         WHERE COALESCE(manufacturer_defect_code_id, component_defect_code_id, application_use_code_id) IS NOT NULL
         GROUP BY product_id, complaint_code_id, lot_master_id
      ),
      baseline AS (
        SELECT pi.product_id,
               COALESCE(cv.manufacturer_defect_code_id, cv.component_defect_code_id, cv.application_use_code_id) AS complaint_code_id,
               cv.lot_master_id,
               COUNT(*) AS baseline_count
          FROM case_pc_versions cv
          LEFT JOIN case_pc_product_info pi ON pi.version_id = cv.id
          JOIN cases c ON c.id = cv.case_id
         WHERE c.org_id = ?
           AND c.created_at >= NOW() - INTERVAL ? DAY
           AND c.created_at <  NOW() - INTERVAL ? DAY
         GROUP BY product_id, complaint_code_id, lot_master_id
      )
      SELECT g.product_id, g.complaint_code_id, g.lot_master_id,
             g.case_count, COALESCE(b.baseline_count, 0) AS baseline_count,
             cc.code AS complaint_code, cc.label AS complaint_label,
             lm.lot_number,
             p.trade_name AS product_name
        FROM grouped g
        LEFT JOIN baseline      b  ON b.product_id = g.product_id
                                  AND IFNULL(b.complaint_code_id,0) = IFNULL(g.complaint_code_id,0)
                                  AND IFNULL(b.lot_master_id,0)    = IFNULL(g.lot_master_id,0)
        LEFT JOIN complaint_codes cc ON cc.id = g.complaint_code_id
        LEFT JOIN lot_master      lm ON lm.id = g.lot_master_id
        LEFT JOIN products         p ON p.id  = g.product_id
       ORDER BY g.case_count DESC, baseline_count ASC
       LIMIT 50
      `,
      params
    );
    rows = r;
  } catch (err) {
    // CTE WITH support requires MySQL 8.0.1+. Older deploys: fall back to simpler query.
    // eslint-disable-next-line no-console
    console.warn('[pcTrendingService] CTE query failed, falling back:', err.message);
    rows = await _trendsFallback({ orgId, windowDays, productId });
  }
  return rows.map(r => ({
    product_id: r.product_id,
    product_name: r.product_name || null,
    complaint_code_id: r.complaint_code_id,
    complaint_code: r.complaint_code || null,
    complaint_label: r.complaint_label || null,
    lot_master_id: r.lot_master_id,
    lot_number: r.lot_number || null,
    case_count_window: r.case_count,
    baseline_count: r.baseline_count || 0,
    window_days: windowDays,
    baseline_days: baselineDays,
  }));
}

async function _trendsFallback({ orgId, windowDays, productId }) {
  const params = [orgId, windowDays];
  let pf = '';
  if (productId) { pf = ' AND pi.product_id = ?'; params.push(Number(productId)); }
  const [rows] = await pool.execute(
    `SELECT pi.product_id,
            p.trade_name AS product_name,
            COALESCE(cv.manufacturer_defect_code_id, cv.component_defect_code_id, cv.application_use_code_id) AS complaint_code_id,
            cv.lot_master_id,
            COUNT(*) AS case_count
       FROM case_pc_versions cv
       LEFT JOIN case_pc_product_info pi ON pi.version_id = cv.id
       LEFT JOIN products p ON p.id = pi.product_id
       JOIN cases c ON c.id = cv.case_id
      WHERE c.org_id = ?
        AND c.created_at >= NOW() - INTERVAL ? DAY
        ${pf}
      GROUP BY pi.product_id, p.trade_name, complaint_code_id, cv.lot_master_id
      ORDER BY case_count DESC LIMIT 50`,
    params
  );
  return rows.map(r => ({ ...r, baseline_count: 0 }));
}

/**
 * detectSignals — flags trends that meet the threshold (configurable).
 * Returns the trends array filtered + annotated with severity.
 */
async function detectSignals({ orgId, threshold = {} }) {
  const minCases    = threshold.minCases    ?? DEFAULT_MIN_CASES;
  const baselineMax = threshold.baselineMax ?? DEFAULT_BASELINE_MAX;
  const all = await trends({ orgId });
  return all
    .filter(t => t.case_count_window >= minCases && t.baseline_count <= baselineMax)
    .map(t => ({
      ...t,
      signal: true,
      severity: t.case_count_window >= minCases * 2 ? 'high' : 'medium',
      threshold: { minCases, baselineMax },
    }));
}

/**
 * lotHistory — chronology of cases linked to a given lot.
 * Powers the "Is this lot subject to a recall?" check.
 */
async function lotHistory({ orgId, lotId }) {
  const [[lot]] = await pool.execute(
    `SELECT * FROM lot_master WHERE id = ? AND org_id = ?`, [lotId, orgId]
  );
  if (!lot) return null;
  const [cases] = await pool.execute(
    `SELECT c.id, c.case_number, c.created_at, c.case_type,
            COALESCE(cc.code, '') AS complaint_code
       FROM case_pc_versions cv
       JOIN cases c ON c.id = cv.case_id
       LEFT JOIN complaint_codes cc
         ON cc.id = COALESCE(cv.manufacturer_defect_code_id,
                             cv.component_defect_code_id,
                             cv.application_use_code_id)
      WHERE c.org_id = ? AND cv.lot_master_id = ?
      ORDER BY c.created_at DESC LIMIT 200`,
    [orgId, lotId]
  );
  const [actions] = await pool.execute(
    `SELECT fa.id, fa.action_number, fa.action_type, fa.classification,
            fa.status, fa.initiated_at, fa.closed_at
       FROM field_action_records fa
      WHERE fa.org_id = ?
        AND JSON_CONTAINS(COALESCE(fa.affected_lots_json, JSON_ARRAY()),
              JSON_QUOTE(?), '$')`,
    [orgId, String(lotId)]
  ).catch(() => [[]]);
  return { lot, cases, field_actions: actions };
}

module.exports = {
  trends, detectSignals, lotHistory,
  DEFAULT_WINDOW_DAYS, DEFAULT_BASELINE_DAYS,
  DEFAULT_MIN_CASES, DEFAULT_BASELINE_MAX,
};
