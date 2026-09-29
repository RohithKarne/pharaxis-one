'use strict';

const pool = require('../database/db');

// The product a letter names for a case, whatever its type. Merge letters read
// only the MI tab's product, so {{product_name}} was blank on every AE and PC
// case (360 walk M-79). In order: MI product; AE product on the latest version
// (suspect first); AE intake suspect drug; PC product on the latest version;
// PC intake product. A catalogue product's trade name wins over typed text.
async function getCaseProductName(caseId) {
  const [[row]] = await pool.execute(
    `SELECT COALESCE(
       (SELECT p.trade_name FROM case_mi mi JOIN products p ON p.id = mi.product_id
         WHERE mi.case_id = c.id ORDER BY mi.id LIMIT 1),
       (SELECT NULLIF(COALESCE(p.trade_name, ae.product_name), '') FROM case_ae_product_info ae
          LEFT JOIN products p ON p.id = ae.product_id
         WHERE ae.version_id = (SELECT v.id FROM case_ae_versions v WHERE v.case_id = c.id
                                 ORDER BY v.version_number DESC, v.id DESC LIMIT 1)
         ORDER BY ae.is_suspect DESC, ae.id LIMIT 1),
       (SELECT NULLIF(ai.suspect_drug_name, '') FROM case_ae_intake ai WHERE ai.case_id = c.id LIMIT 1),
       (SELECT NULLIF(COALESCE(p.trade_name, pc.product_name), '') FROM case_pc_product_info pc
          LEFT JOIN products p ON p.id = pc.product_id
         WHERE pc.version_id = (SELECT v.id FROM case_pc_versions v WHERE v.case_id = c.id
                                 ORDER BY v.version_number DESC, v.id DESC LIMIT 1)
         ORDER BY pc.id LIMIT 1),
       (SELECT NULLIF(pi.product_name, '') FROM case_pc_intake pi WHERE pi.case_id = c.id LIMIT 1)
     ) AS product
       FROM cases c WHERE c.id = ? LIMIT 1`,
    [caseId]
  );
  return row?.product || '';
}

module.exports = { getCaseProductName };
