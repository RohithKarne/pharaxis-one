'use strict';

async function addColumn(conn, table, ddl) {
  try { await conn.execute(`ALTER TABLE ${table} ADD COLUMN ${ddl}`); } catch (_) {}
}

async function addIndex(conn, table, ddl) {
  try { await conn.execute(`ALTER TABLE ${table} ADD ${ddl}`); } catch (_) {}
}

module.exports = {
  async up(conn) {
    await addColumn(conn, 'products', 'family_id INT NULL AFTER org_id');
    await addColumn(conn, 'products', 'mah VARCHAR(255) NULL AFTER trade_name');
    await addColumn(conn, 'products', 'dosage VARCHAR(255) NULL AFTER family_id');
    await addColumn(conn, 'products', 'atc_code VARCHAR(100) NULL AFTER dosage');
    await addColumn(conn, 'products', 'authorization_country VARCHAR(100) NULL AFTER atc_code');
    await addColumn(conn, 'products', 'updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at');
    await addIndex(conn, 'products', 'INDEX idx_products_family (family_id)');
    await addIndex(conn, 'products', 'INDEX idx_products_auth_country (authorization_country)');

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS product_groups (
        id          INT NOT NULL AUTO_INCREMENT,
        org_id      INT NULL,
        name        VARCHAR(255) NOT NULL,
        group_type  VARCHAR(50) NOT NULL,
        description TEXT NULL,
        is_active   TINYINT(1) NOT NULL DEFAULT 1,
        created_by  INT NULL,
        updated_by  INT NULL,
        created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_product_groups_org_type_name (org_id, group_type, name),
        KEY idx_product_groups_org_type (org_id, group_type, is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS product_group_members (
        id          INT NOT NULL AUTO_INCREMENT,
        group_id    INT NOT NULL,
        member_type VARCHAR(50) NOT NULL,
        member_id   INT NOT NULL,
        created_by  INT NULL,
        created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_product_group_member (group_id, member_type, member_id),
        KEY idx_product_group_members_group (group_id),
        KEY idx_product_group_members_member (member_type, member_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS product_group_assignments (
        id          INT NOT NULL AUTO_INCREMENT,
        group_id    INT NOT NULL,
        target_type VARCHAR(80) NOT NULL,
        target_id   INT NULL,
        metadata    JSON NULL,
        created_by  INT NULL,
        created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_product_group_assignment (group_id, target_type, target_id),
        KEY idx_product_group_assignments_group (group_id),
        KEY idx_product_group_assignments_target (target_type, target_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await addColumn(conn, 'case_ae_transmissions', 'product_group_id INT NULL AFTER case_id');
    await addColumn(conn, 'case_ae_transmissions', 'product_group_snapshot JSON NULL AFTER product_group_id');
    await addIndex(conn, 'case_ae_transmissions', 'INDEX idx_ae_trans_product_group (product_group_id)');

    await addColumn(conn, 'case_pc_transmissions', 'product_group_id INT NULL AFTER case_id');
    await addColumn(conn, 'case_pc_transmissions', 'product_group_snapshot JSON NULL AFTER product_group_id');
    await addIndex(conn, 'case_pc_transmissions', 'INDEX idx_pc_trans_product_group (product_group_id)');
  }
};
