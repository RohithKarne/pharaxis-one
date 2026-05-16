'use strict';
// Migration 037 — Per-tenant Feature Flags (Wave 0 foundation).
// Every theme in the 10-theme case-form roadmap ships behind a flag so
// admins can roll it out per tenant. No theme is globally on by default.

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS feature_flags (
      id              INT NOT NULL AUTO_INCREMENT,
      flag_key        VARCHAR(80)  NOT NULL,
      label           VARCHAR(160) NOT NULL,
      description     TEXT         NULL,
      wave            VARCHAR(20)  NULL,     -- '0' / '1' ... '5' — for grouping in the admin UI
      theme           VARCHAR(80)  NULL,     -- e.g. 'Theme 3 — Validation'
      default_state   ENUM('off','on') NOT NULL DEFAULT 'off',
      is_strict_mode  TINYINT(1)   NOT NULL DEFAULT 0,  -- if 1, theme keeps both legacy + new code paths until QA-approved
      created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_feature_flag_key (flag_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS tenant_feature_flags (
      id          INT NOT NULL AUTO_INCREMENT,
      flag_id     INT NOT NULL,
      org_id      INT NOT NULL,
      enabled     TINYINT(1) NOT NULL DEFAULT 0,
      enabled_by  INT NULL,
      enabled_at  DATETIME NULL,
      notes       TEXT NULL,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_flag_tenant (flag_id, org_id),
      FOREIGN KEY (flag_id) REFERENCES feature_flags(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Seed flag catalogue — one row per theme. Default off.
  const seed = [
    ['cf.theme1_rich_fields',      'Theme 1 — Rich Field Types',         'Address, phone, currency, rich text, signature, image annotation, etc.', '3', 'Theme 1', 0],
    ['cf.theme2_smart_behaviors',  'Theme 2 — Smart Field Behaviors',    'Auto-calc, smart defaults, typeahead, field history popover.',          '2', 'Theme 2', 0],
    ['cf.theme3_inline_validation','Theme 3 — Inline Validation',        'Format hints, regex, range, duplicate detection, phase-aware required.','1', 'Theme 3', 1],
    ['cf.theme4_visual_polish',    'Theme 4 — Visual Polish',            'Completeness bar, sticky nav, Cmd+K palette, urgency banner.',          '1', 'Theme 4', 0],
    ['cf.theme5_realtime_collab',  'Theme 5 — Real-time Collaboration (trimmed)', 'Presence + @-mentions + watchers + field threads (no live cursors / locks).','4', 'Theme 5', 1],
    ['cf.theme6_documents',        'Theme 6 — Document & Attachment Power','Drag-drop upload, per-field attachments, OCR, PDF preview/annotate.', '3', 'Theme 6', 0],
    ['cf.theme7_multirow_grids',   'Theme 7 — Multi-row Grid Sections',  'Paste from spreadsheet, drag-drop rows, archive, templates.',           '2', 'Theme 7', 0],
    ['cf.theme8_smart_actions',    'Theme 8 — Case-level Smart Actions', 'Templates, bulk edit, clone, macros, recent + pinned cases.',           '4', 'Theme 8', 0],
    ['cf.theme9_compliance',       'Theme 9 — Compliance Hardening',     'Reason-for-change, locked fields, e-sign on transitions, masked reveal.','5', 'Theme 9', 1],
  ];
  for (const [key, label, desc, wave, theme, strict] of seed) {
    await conn.execute(
      `INSERT IGNORE INTO feature_flags (flag_key, label, description, wave, theme, default_state, is_strict_mode)
       VALUES (?, ?, ?, ?, ?, 'off', ?)`,
      [key, label, desc, wave, theme, strict]
    );
  }
}

async function down(conn) {
  try { await conn.execute(`DROP TABLE IF EXISTS tenant_feature_flags`); } catch (_) {}
  try { await conn.execute(`DROP TABLE IF EXISTS feature_flags`); } catch (_) {}
}

module.exports = { up, down };
