'use strict';
// Migration 031 — Power-user picklist metadata, ordering, and immutable history.

async function up(conn) {
  try { await conn.execute(`ALTER TABLE picklists ADD COLUMN sort_order INT NOT NULL DEFAULT 0`); } catch (_) {}
  try { await conn.execute(`ALTER TABLE picklists ADD COLUMN external_codes JSON NULL`); } catch (_) {}
  try { await conn.execute(`ALTER TABLE picklists ADD COLUMN translations JSON NULL`); } catch (_) {}
  try { await conn.execute(`ALTER TABLE picklists ADD COLUMN parent_value_id INT NULL`); } catch (_) {}
  try { await conn.execute(`CREATE INDEX idx_picklists_parent ON picklists(parent_value_id)`); } catch (_) {}
  try { await conn.execute(`CREATE INDEX idx_picklists_sort ON picklists(org_id, category, field_type, sort_order, value)`); } catch (_) {}

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS picklist_value_versions (
      id INT NOT NULL AUTO_INCREMENT,
      picklist_id INT NOT NULL,
      value VARCHAR(255) NULL,
      status VARCHAR(20) NULL,
      department VARCHAR(100) NULL,
      description TEXT NULL,
      external_codes JSON NULL,
      translations JSON NULL,
      changed_by INT NULL,
      changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      change_type ENUM('created','updated','deactivated','reactivated','deleted') NOT NULL,
      PRIMARY KEY (id),
      KEY idx_picklist_value_versions_picklist (picklist_id, changed_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function down(conn) {
  try { await conn.execute('DROP TABLE IF EXISTS picklist_value_versions'); } catch (_) {}
  try { await conn.execute('DROP INDEX idx_picklists_sort ON picklists'); } catch (_) {}
  try { await conn.execute('DROP INDEX idx_picklists_parent ON picklists'); } catch (_) {}
  try { await conn.execute('ALTER TABLE picklists DROP COLUMN translations'); } catch (_) {}
  try { await conn.execute('ALTER TABLE picklists DROP COLUMN external_codes'); } catch (_) {}
  try { await conn.execute('ALTER TABLE picklists DROP COLUMN sort_order'); } catch (_) {}
}

module.exports = { up, down };
