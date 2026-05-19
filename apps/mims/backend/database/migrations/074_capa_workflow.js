'use strict';
// Migration 074 — Sprint 2 #20: CAPA (Corrective and Preventive Action) workflow.
//
// ISO 13485 + FDA 21 CFR 820.100 require CAPA records that trace investigation
// → root cause → corrective action → preventive action → effectiveness check.
//
// Lifecycle:
//   open → root_cause_identified → action_proposed → action_approved
//        → action_implemented → effectiveness_check → closed (or terminated)

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS capa_records (
      id                BIGINT NOT NULL AUTO_INCREMENT,
      org_id            INT NOT NULL,
      capa_number       VARCHAR(40) NOT NULL,            -- e.g. 'CAPA-2026-001'
      title             VARCHAR(255) NOT NULL,
      source_type       ENUM('product_complaint','adverse_event','audit','internal_review','customer_feedback') NOT NULL,
      source_case_id    BIGINT NULL,                    -- FK to cases (typically PC)
      source_field_action_id BIGINT NULL,               -- FK to field_action_records
      severity          ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium',
      status            ENUM('open','root_cause_identified','action_proposed','action_approved',
                            'action_implemented','effectiveness_check','closed','terminated')
                            NOT NULL DEFAULT 'open',
      problem_statement TEXT NULL,
      root_cause        TEXT NULL,
      root_cause_method ENUM('5_whys','fishbone','fmea','fault_tree','other') NULL,
      corrective_action TEXT NULL,
      preventive_action TEXT NULL,
      target_completion_date DATE NULL,
      actual_completion_date DATE NULL,
      effectiveness_check_due DATE NULL,
      effectiveness_outcome ENUM('effective','partially_effective','not_effective','pending') NULL,
      effectiveness_notes TEXT NULL,
      assigned_to       INT NULL,
      opened_by         INT NULL,
      opened_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      closed_by         INT NULL,
      closed_at         DATETIME NULL,
      created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_capa_number (org_id, capa_number),
      KEY idx_capa_status (status),
      KEY idx_capa_source_case (source_case_id),
      KEY idx_capa_assignee (assigned_to, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS capa_actions (
      id            BIGINT NOT NULL AUTO_INCREMENT,
      capa_id       BIGINT NOT NULL,
      action_type   ENUM('corrective','preventive','interim') NOT NULL,
      description   TEXT NOT NULL,
      assigned_to   INT NULL,
      target_date   DATE NULL,
      completed_at  DATETIME NULL,
      completed_by  INT NULL,
      verification_notes TEXT NULL,
      sort_order    INT NOT NULL DEFAULT 0,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_ca_capa (capa_id, sort_order),
      FOREIGN KEY (capa_id) REFERENCES capa_records(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // CAPA event log (status changes + free notes)
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS capa_events (
      id            BIGINT NOT NULL AUTO_INCREMENT,
      capa_id       BIGINT NOT NULL,
      event_type    ENUM('status_change','action_added','action_completed','note','effectiveness_logged') NOT NULL,
      from_status   VARCHAR(40) NULL,
      to_status     VARCHAR(40) NULL,
      note          TEXT NULL,
      created_by    INT NULL,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_ce_capa (capa_id, created_at),
      FOREIGN KEY (capa_id) REFERENCES capa_records(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function down(conn) {
  try { await conn.execute(`DROP TABLE IF EXISTS capa_events`);  } catch (_) {}
  try { await conn.execute(`DROP TABLE IF EXISTS capa_actions`); } catch (_) {}
  try { await conn.execute(`DROP TABLE IF EXISTS capa_records`); } catch (_) {}
}

module.exports = { up, down };
