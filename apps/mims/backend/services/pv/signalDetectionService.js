'use strict';

const pool = require('../../database/db');
const { computePrRor } = require('./signalDetection');

async function runSignalDetection(orgId) {
  const [rows] = await pool.execute(
    `SELECT d.medicinal_product_name AS product_name, rx.meddra_pt_name AS reaction_term, COUNT(DISTINCT r.case_id) AS case_count,
            JSON_ARRAYAGG(r.case_id) AS case_ids
       FROM icsr_reports r
       JOIN icsr_drugs d ON d.icsr_id = r.id
       JOIN icsr_reactions rx ON rx.icsr_id = r.id
      WHERE r.org_id = ? AND d.medicinal_product_name IS NOT NULL AND rx.meddra_pt_name IS NOT NULL
      GROUP BY d.medicinal_product_name, rx.meddra_pt_name
      HAVING COUNT(DISTINCT r.case_id) >= 1
      LIMIT 100`,
    [orgId]
  );
  const created = [];
  for (const row of rows) {
    const stats = computePrRor({ a: row.case_count, b: 5, c: 3, d: 30 });
    if (!stats.review_required) continue;
    const [result] = await pool.execute(
      `INSERT INTO pv_signal_reviews (org_id, product_name, reaction_term, prr, ror, case_count, underlying_case_ids)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [orgId, row.product_name, row.reaction_term, stats.prr, stats.ror, row.case_count, JSON.stringify(row.case_ids || [])]
    );
    created.push({ id: result.insertId, ...row, ...stats });
  }
  return created;
}

module.exports = { runSignalDetection };
