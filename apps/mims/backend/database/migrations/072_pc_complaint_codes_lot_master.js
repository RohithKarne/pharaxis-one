'use strict';
// Migration 072 — Sprint 2 #19: PC complaint codes (FDA-aligned) + lot master.
//
// Standardizes PC classification with the FDA Code 21 PFC-style code families:
//   - Manufacturer Defect Code   (defect categorization at manufacturing level)
//   - Component Defect Code      (which component / sub-assembly)
//   - Application / Use Code     (how the user was using the product when fault appeared)
// Each family is a controlled list; PC records reference codes by id.
//
// Lot master replaces the free-text `lot_number` field on PC records with a
// proper Lot table joined to Product. Enables "is this lot subject to a recall?"
// checks and lot-level signal detection.

async function up(conn) {
  // ── Complaint code families ────────────────────────────────────────────────
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS complaint_code_families (
      id          INT NOT NULL AUTO_INCREMENT,
      code_family ENUM('manufacturer_defect','component_defect','application_use') NOT NULL,
      label       VARCHAR(160) NOT NULL,
      description VARCHAR(500) NULL,
      sort_order  INT NOT NULL DEFAULT 0,
      is_active   TINYINT(1) NOT NULL DEFAULT 1,
      PRIMARY KEY (id),
      UNIQUE KEY uq_family_label (code_family, label)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS complaint_codes (
      id          INT NOT NULL AUTO_INCREMENT,
      org_id      INT NULL,                       -- NULL = global
      family_id   INT NOT NULL,
      code        VARCHAR(20) NOT NULL,           -- e.g. 'A100', 'B205'
      label       VARCHAR(255) NOT NULL,
      description VARCHAR(500) NULL,
      sort_order  INT NOT NULL DEFAULT 0,
      is_active   TINYINT(1) NOT NULL DEFAULT 1,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_cc_code (org_id, family_id, code),
      KEY idx_cc_family (family_id, is_active),
      FOREIGN KEY (family_id) REFERENCES complaint_code_families(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Seed the three families
  await conn.execute(
    `INSERT IGNORE INTO complaint_code_families (code_family, label, description, sort_order)
     VALUES
       ('manufacturer_defect', 'Manufacturer Defect',
        'Why the manufacturer or supplier is implicated in the defect.', 1),
       ('component_defect',    'Component / Sub-assembly Defect',
        'Which component, sub-assembly, or material exhibited the defect.', 2),
       ('application_use',     'Application / Use Code',
        'How the user was using the product when the fault appeared.', 3)`
  );

  // Pull family ids
  const [familyRows] = await conn.execute(`SELECT id, code_family FROM complaint_code_families`);
  const fam = Object.fromEntries(familyRows.map(r => [r.code_family, r.id]));

  // Seed common codes (representative subset; tenant admins extend)
  const codes = [
    // Manufacturer defect
    ['manufacturer_defect', 'MD-100', 'Material out of spec',                 'Raw material did not meet QA spec.'],
    ['manufacturer_defect', 'MD-101', 'Process deviation',                    'Manufacturing process step deviated from validated SOP.'],
    ['manufacturer_defect', 'MD-102', 'Equipment calibration drift',          'Production equipment outside calibration tolerance.'],
    ['manufacturer_defect', 'MD-103', 'Labelling error',                      'Label artwork, content, or placement defect.'],
    ['manufacturer_defect', 'MD-104', 'Packaging integrity failure',          'Primary/secondary packaging compromised at line.'],
    ['manufacturer_defect', 'MD-105', 'Software / firmware defect',           'Embedded software bug in device.'],
    // Component defect
    ['component_defect',    'CD-200', 'Container closure',                    'Cap, seal, or closure failed.'],
    ['component_defect',    'CD-201', 'Actuator / dose counter',              'Inhaler actuator or dose counter malfunction.'],
    ['component_defect',    'CD-202', 'Needle / cartridge',                   'Auto-injector needle or cartridge defect.'],
    ['component_defect',    'CD-203', 'Sensor failure',                       'Embedded sensor returning bad data.'],
    ['component_defect',    'CD-204', 'Battery',                              'Battery depleted or leaking.'],
    ['component_defect',    'CD-205', 'Excipient discoloration',              'Color change in formulation.'],
    // Application / use
    ['application_use',     'AU-300', 'User error — wrong dose',              'Reporter administered wrong dose.'],
    ['application_use',     'AU-301', 'User error — wrong route',             'Reporter used incorrect route of administration.'],
    ['application_use',     'AU-302', 'Stored outside conditions',            'Product stored outside labeled conditions.'],
    ['application_use',     'AU-303', 'Used past expiry',                     'Reporter used product after expiry date.'],
    ['application_use',     'AU-304', 'Counterfeit suspected',                'Reporter suspects counterfeit product.'],
    ['application_use',     'AU-305', 'Off-label use',                        'Product used for unapproved indication.'],
  ];
  for (const [family, code, label, desc] of codes) {
    const fid = fam[family];
    if (!fid) continue;
    await conn.execute(
      `INSERT IGNORE INTO complaint_codes (org_id, family_id, code, label, description, sort_order)
       VALUES (NULL, ?, ?, ?, ?, 0)`,
      [fid, code, label, desc]
    );
  }

  // ── Lot master ─────────────────────────────────────────────────────────────
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS lot_master (
      id              BIGINT NOT NULL AUTO_INCREMENT,
      org_id          INT NOT NULL,
      product_id      BIGINT NOT NULL,
      lot_number      VARCHAR(80) NOT NULL,
      manufacture_date DATE NULL,
      expiry_date     DATE NULL,
      manufacturer_site VARCHAR(120) NULL,
      quantity_produced INT NULL,
      status          ENUM('active','suspended','recalled','expired','exhausted') NOT NULL DEFAULT 'active',
      recalled_at     DATETIME NULL,
      recall_id       BIGINT NULL,                  -- FK to field_action_records (#28)
      notes           TEXT NULL,
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_lot (org_id, product_id, lot_number),
      KEY idx_lot_status (status),
      KEY idx_lot_expiry (expiry_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ── Wire complaint codes + lot reference onto PC versions ──────────────────
  // PC sub-tabs are versioned; we add columns to case_pc_versions to capture
  // the chosen codes + lot id at version-snapshot time.
  const pcCols = [
    `ALTER TABLE case_pc_versions ADD COLUMN manufacturer_defect_code_id INT NULL`,
    `ALTER TABLE case_pc_versions ADD COLUMN component_defect_code_id    INT NULL`,
    `ALTER TABLE case_pc_versions ADD COLUMN application_use_code_id     INT NULL`,
    `ALTER TABLE case_pc_versions ADD COLUMN lot_master_id               BIGINT NULL`,
  ];
  for (const sql of pcCols) { try { await conn.execute(sql); } catch (_) {} }
}

async function down(conn) {
  for (const col of [
    'manufacturer_defect_code_id','component_defect_code_id','application_use_code_id','lot_master_id',
  ]) {
    try { await conn.execute(`ALTER TABLE case_pc_versions DROP COLUMN ${col}`); } catch (_) {}
  }
  try { await conn.execute(`DROP TABLE IF EXISTS lot_master`); } catch (_) {}
  try { await conn.execute(`DROP TABLE IF EXISTS complaint_codes`); } catch (_) {}
  try { await conn.execute(`DROP TABLE IF EXISTS complaint_code_families`); } catch (_) {}
}

module.exports = { up, down };
