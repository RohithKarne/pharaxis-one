'use strict';
// Migration 073 — Sprint 2 #28: Field action / recall records.
//
// When a PC investigation reveals a systemic defect, the company files a
// "field action" — a regulator-notified market response. Classes per FDA 21 CFR 7:
//   I   — Reasonable probability of serious health consequences / death
//   II  — Temporary or medically reversible adverse health consequences
//   III — Not likely to cause adverse health consequences
//
// A field action has a lifecycle: drafted → submitted → acknowledged → in_progress
// → effectiveness_check → closed (or terminated).

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS field_action_records (
      id                BIGINT NOT NULL AUTO_INCREMENT,
      org_id            INT NOT NULL,
      action_number     VARCHAR(40) NOT NULL,            -- internal id, e.g. 'FA-2026-001'
      action_type       ENUM('recall','withdrawal','safety_notice','field_correction','stock_recovery') NOT NULL,
      classification    ENUM('class_i','class_ii','class_iii','not_classified') NOT NULL DEFAULT 'not_classified',
      product_id        BIGINT NULL,
      affected_lots_json JSON NULL,                       -- array of lot_master.id
      reason_summary    VARCHAR(500) NOT NULL,
      narrative         TEXT NULL,
      hazard_description TEXT NULL,
      depth             ENUM('consumer','retail','wholesale','manufacturer') NOT NULL DEFAULT 'consumer',
      status            ENUM('drafted','submitted','acknowledged','in_progress','effectiveness_check','closed','terminated')
                            NOT NULL DEFAULT 'drafted',
      regulator_codes_json JSON NULL,                     -- {fda:'F-1234-2026', ema:'EMA-25-0123', ...}
      initiated_by      INT NULL,
      initiated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      submitted_at      DATETIME NULL,
      closed_at         DATETIME NULL,
      effectiveness_check_due DATE NULL,
      effectiveness_outcome ENUM('effective','partially_effective','not_effective') NULL,
      created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_field_action (org_id, action_number),
      KEY idx_fa_status (status),
      KEY idx_fa_product (product_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Link PC cases that contributed to / are affected by a field action
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS field_action_cases (
      id             INT NOT NULL AUTO_INCREMENT,
      field_action_id BIGINT NOT NULL,
      case_id        BIGINT NOT NULL,
      relation       ENUM('triggered_by','affected','reference') NOT NULL DEFAULT 'affected',
      added_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_fac (field_action_id, case_id),
      FOREIGN KEY (field_action_id) REFERENCES field_action_records(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Status-change audit (separate from generic field_value_history because
  // field actions need their own regulator-visible chain)
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS field_action_events (
      id             BIGINT NOT NULL AUTO_INCREMENT,
      field_action_id BIGINT NOT NULL,
      event_type     ENUM('status_change','regulator_correspondence','batch_added','batch_removed','effectiveness_logged','note') NOT NULL,
      from_status    VARCHAR(40) NULL,
      to_status      VARCHAR(40) NULL,
      note           TEXT NULL,
      created_by     INT NULL,
      created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_fae_action (field_action_id, created_at),
      FOREIGN KEY (field_action_id) REFERENCES field_action_records(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function down(conn) {
  try { await conn.execute(`DROP TABLE IF EXISTS field_action_events`); } catch (_) {}
  try { await conn.execute(`DROP TABLE IF EXISTS field_action_cases`); } catch (_) {}
  try { await conn.execute(`DROP TABLE IF EXISTS field_action_records`); } catch (_) {}
}

module.exports = { up, down };
