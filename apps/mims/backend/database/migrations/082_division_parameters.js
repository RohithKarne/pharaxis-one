'use strict';

/**
 * Migration 082 — Division Parameters (P1 Backbone)
 *
 * Division == tenant/org. This table holds the rich per-division configuration
 * surfaced by System > Division Parameters. P1 populates the General tab fields
 * (division box, tailoring options, and the 17 change-control rule flags — STORED
 * in P1; enforcement ships in the following gate, P1-E).
 *
 * 1:1 with `organisations` (org_id is PK + FK). The "Inactive" toggle in the
 * General tab maps to the existing `organisations.is_active`, not a column here.
 * User assignment (Users tab) rides the existing `user_org_access` table.
 */

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS division_parameters (
      org_id                 INT          NOT NULL,
      config_status          ENUM('draft','active') NOT NULL DEFAULT 'draft',

      -- ── Division box ──
      division_code          VARCHAR(50),
      description            TEXT,
      address                VARCHAR(255),
      city                   VARCHAR(120),
      state_region           VARCHAR(120),
      postal_code            VARCHAR(30),
      country                VARCHAR(2),
      email                  VARCHAR(255),
      division_group         VARCHAR(120),

      -- ── Tailoring options ──
      country_default        VARCHAR(2),
      personal_info_visibility ENUM('visible','hidden') NOT NULL DEFAULT 'visible',
      date_format            VARCHAR(30)  NOT NULL DEFAULT 'YYYY-MM-DD',
      default_case_priority  VARCHAR(30),

      -- ── Change control / logging rules (17 flags — STORED in P1) ──
      cc_reason_delete_record        TINYINT(1) NOT NULL DEFAULT 0,
      cc_reason_change_case          TINYINT(1) NOT NULL DEFAULT 0,
      cc_reason_refer_case           TINYINT(1) NOT NULL DEFAULT 0,
      cc_password_close_case         TINYINT(1) NOT NULL DEFAULT 0,
      cc_reason_reopen_case          TINYINT(1) NOT NULL DEFAULT 0,
      cc_password_close_ae           TINYINT(1) NOT NULL DEFAULT 0,
      cc_password_close_pc           TINYINT(1) NOT NULL DEFAULT 0,
      cc_reason_change_letter        TINYINT(1) NOT NULL DEFAULT 0,
      cc_reason_reopen_letter        TINYINT(1) NOT NULL DEFAULT 0,
      cc_reason_reopen_pc            TINYINT(1) NOT NULL DEFAULT 0,
      cc_reason_reopen_ae            TINYINT(1) NOT NULL DEFAULT 0,
      cc_reason_change_ae            TINYINT(1) NOT NULL DEFAULT 0,
      cc_reason_delete_ae            TINYINT(1) NOT NULL DEFAULT 0,
      cc_reason_change_pc            TINYINT(1) NOT NULL DEFAULT 0,
      cc_reason_change_date_received TINYINT(1) NOT NULL DEFAULT 0,
      cc_reason_change_first_response TINYINT(1) NOT NULL DEFAULT 0,
      cc_reason_escalation           TINYINT(1) NOT NULL DEFAULT 0,

      needs_review           TINYINT(1)   NOT NULL DEFAULT 0,
      created_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (org_id),
      CONSTRAINT fk_division_parameters_org FOREIGN KEY (org_id)
        REFERENCES organisations(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Backfill one row per existing organisation. Existing live tenants are marked
  // active + needs_review=1 ("review recommended"); code defaults to a slug of name.
  await conn.execute(`
    INSERT IGNORE INTO division_parameters (org_id, config_status, division_code, needs_review)
    SELECT o.id, 'active', CONCAT('DIV', LPAD(o.id, 4, '0')), 1
      FROM organisations o
     WHERE NOT EXISTS (SELECT 1 FROM division_parameters dp WHERE dp.org_id = o.id)
  `).catch(() => {});
}

async function down(conn) {
  try { await conn.execute(`DROP TABLE IF EXISTS division_parameters`); } catch (_) {}
}

module.exports = { up, down };
