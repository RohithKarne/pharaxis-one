'use strict';

/**
 * Migration 159 — link earlier AE products to the product dictionary (MIPM-131
 * follow-up to MIPM-214).
 *
 * AE Product Info rows typed before the dictionary picker existed carry only a
 * name. Where that name matches one of the case organisation's products exactly
 * (ignoring case and outer spaces), the row is linked. Only rows on versions
 * still open are touched: a locked version is a closed record and stays as it was.
 */

async function up(conn) {
  await conn.execute(
    `UPDATE case_ae_product_info p
       JOIN case_ae_versions v ON v.id = p.version_id
       JOIN cases c ON c.id = v.case_id
       JOIN products d ON d.org_id = c.org_id AND LOWER(TRIM(d.trade_name)) = LOWER(TRIM(p.product_name))
        SET p.product_id = d.id
      WHERE p.product_id IS NULL
        AND COALESCE(v.is_locked, 0) = 0
        AND (SELECT COUNT(*) FROM products d2 WHERE d2.org_id = c.org_id AND LOWER(TRIM(d2.trade_name)) = LOWER(TRIM(p.product_name))) = 1`
  );
}

async function down(_conn) {}

module.exports = { up, down };
