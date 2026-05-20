'use strict';
// Migration 006 — Picklist hierarchy backfill, unique key restructure, FK, field_setup alters,
//                company_reps/contacts alters, Sprint 17 taxonomy governance

async function up(conn) {
  // picklists: category column + org_id
  for (const sql of [
    `ALTER TABLE picklists ADD COLUMN category VARCHAR(100) NOT NULL DEFAULT 'General' AFTER name`,
    `ALTER TABLE picklists ADD COLUMN org_id INT`,
    `ALTER TABLE picklists ADD COLUMN field_id INT AFTER field_type`,
    `ALTER TABLE picklists ADD KEY idx_picklists_field_id (field_id)`,
  ]) { try { await conn.execute(sql); } catch (_) {} }

  // Sprint 17 taxonomy governance columns
  for (const sql of [
    `ALTER TABLE picklists ADD COLUMN effective_from DATE NULL AFTER status`,
    `ALTER TABLE picklists ADD COLUMN effective_to DATE NULL AFTER effective_from`,
    `ALTER TABLE picklists ADD COLUMN governance_note VARCHAR(255) NULL AFTER effective_to`,
    `ALTER TABLE picklists ADD KEY idx_picklists_effective_window (field_id, status, effective_from, effective_to)`,
  ]) { try { await conn.execute(sql); } catch (_) {} }

  // Backfill picklist_categories from legacy rows
  await conn.execute(`
    INSERT INTO picklist_categories (org_id, name, is_active, sort_order)
    SELECT DISTINCT
      COALESCE(p.org_id, 0) AS org_id,
      COALESCE(NULLIF(TRIM(p.category), ''), 'General') AS name,
      1 AS is_active,
      0 AS sort_order
    FROM picklists p
    LEFT JOIN picklist_categories c
      ON c.org_id = COALESCE(p.org_id, 0)
     AND c.name = COALESCE(NULLIF(TRIM(p.category), ''), 'General')
    WHERE c.id IS NULL
  `);

  await conn.execute(`
    INSERT INTO picklist_fields (org_id, category_id, name, legacy_field_type, is_active, sort_order)
    SELECT DISTINCT
      COALESCE(p.org_id, 0) AS org_id,
      c.id AS category_id,
      COALESCE(NULLIF(TRIM(p.field_type), ''), 'General') AS name,
      COALESCE(NULLIF(TRIM(p.field_type), ''), 'General') AS legacy_field_type,
      1 AS is_active,
      0 AS sort_order
    FROM picklists p
    INNER JOIN picklist_categories c
      ON c.org_id = COALESCE(p.org_id, 0)
     AND c.name = COALESCE(NULLIF(TRIM(p.category), ''), 'General')
    LEFT JOIN picklist_fields f
      ON f.org_id = COALESCE(p.org_id, 0)
     AND f.category_id = c.id
     AND f.name = COALESCE(NULLIF(TRIM(p.field_type), ''), 'General')
    WHERE f.id IS NULL
  `);

  await conn.execute(`
    UPDATE picklists p
    INNER JOIN picklist_categories c
      ON c.org_id = COALESCE(p.org_id, 0)
     AND c.name = COALESCE(NULLIF(TRIM(p.category), ''), 'General')
    INNER JOIN picklist_fields f
      ON f.org_id = COALESCE(p.org_id, 0)
     AND f.category_id = c.id
     AND f.name = COALESCE(NULLIF(TRIM(p.field_type), ''), 'General')
    SET p.field_id = f.id
    WHERE p.field_id IS NULL
  `);

  try { await conn.execute(`ALTER TABLE picklists DROP INDEX uq_picklist_field_value`); } catch (_) {}
  try { await conn.execute(`ALTER TABLE picklists ADD UNIQUE KEY uq_picklists_field_id_value (field_id, value)`); } catch (_) {}
  try {
    await conn.execute(`
      ALTER TABLE picklists
      ADD CONSTRAINT fk_picklists_field_id
      FOREIGN KEY (field_id) REFERENCES picklist_fields(id) ON DELETE SET NULL
    `);
  } catch (_) {}

  // field_setup: Phase 1A additional columns
  for (const sql of [
    `ALTER TABLE field_setup ADD COLUMN help_text TEXT AFTER custom_label`,
    `ALTER TABLE field_setup ADD COLUMN lookup_target VARCHAR(100) AFTER picklist_type`,
    `ALTER TABLE field_setup ADD COLUMN do_not_update_master TINYINT(1) NOT NULL DEFAULT 0 AFTER lookup_target`,
    `ALTER TABLE field_setup ADD COLUMN max_length INT AFTER do_not_update_master`,
    `ALTER TABLE field_setup ADD COLUMN default_value VARCHAR(500) AFTER max_length`,
  ]) { try { await conn.execute(sql); } catch (_) {} }

  // field_setup: Sprint 17 masking columns
  for (const sql of [
    `ALTER TABLE field_setup ADD COLUMN is_sensitive TINYINT(1) NOT NULL DEFAULT 0 AFTER default_value`,
    `ALTER TABLE field_setup ADD COLUMN masking_pattern VARCHAR(30) NOT NULL DEFAULT 'partial' AFTER is_sensitive`,
    `ALTER TABLE field_setup ADD COLUMN unmask_roles VARCHAR(255) NOT NULL DEFAULT 'admin,platform_admin' AFTER masking_pattern`,
  ]) { try { await conn.execute(sql); } catch (_) {} }
  try { await conn.execute(`ALTER TABLE field_setup DROP INDEX uq_field_section_name`); } catch (_) {}
  try { await conn.execute(`ALTER TABLE field_setup ADD UNIQUE KEY uq_field_section_org (section_name, field_name, org_id)`); } catch (_) {}

  // company_reps: territory column
  try { await conn.execute(`ALTER TABLE company_reps ADD COLUMN territory VARCHAR(255) AFTER title`); } catch (_) {}

  // contacts: specialty, institution, address, do_not_update_master
  for (const sql of [
    `ALTER TABLE contacts ADD COLUMN specialty VARCHAR(255) AFTER type`,
    `ALTER TABLE contacts ADD COLUMN institution VARCHAR(255) AFTER specialty`,
    `ALTER TABLE contacts ADD COLUMN address TEXT AFTER notes`,
    `ALTER TABLE contacts ADD COLUMN do_not_update_master TINYINT(1) NOT NULL DEFAULT 0 AFTER address`,
  ]) { try { await conn.execute(sql); } catch (_) {} }
}

module.exports = { up };
