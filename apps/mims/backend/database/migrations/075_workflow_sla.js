'use strict';
// Migration 075 — Sprint 2 #11: Workflow SLA timer per state.
//
// Each workflow state has an SLA expressed in business hours (configurable per
// case type per tenant). A case in that state accrues elapsed time; when the
// elapsed exceeds the SLA, the case is "breached" and escalates via the
// existing alerts system.
//
// Two tables:
//   - workflow_state_sla: configuration (tenant × case_type × state → sla_hours)
//   - case_state_timings: per-case ledger of when state was entered, exited,
//     elapsed, and breach status.

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS workflow_state_sla (
      id                 INT NOT NULL AUTO_INCREMENT,
      org_id             INT NULL,                       -- NULL = global default
      case_type          VARCHAR(10) NOT NULL,           -- 'AE' | 'MI' | 'PC' | 'ALL'
      state              VARCHAR(60) NOT NULL,           -- the workflow state name
      sla_hours          INT NOT NULL,                   -- business hours
      warning_threshold_pct TINYINT UNSIGNED NOT NULL DEFAULT 75,
      escalation_role    VARCHAR(40) NULL,               -- e.g. 'supervisor', 'qppv'
      escalation_user_id INT NULL,                       -- override: escalate to a specific user
      is_active          TINYINT(1) NOT NULL DEFAULT 1,
      created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_wsla (org_id, case_type, state),
      KEY idx_wsla_state (state)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_state_timings (
      id                 BIGINT NOT NULL AUTO_INCREMENT,
      org_id             INT NOT NULL,
      case_id            BIGINT NOT NULL,
      state              VARCHAR(60) NOT NULL,
      entered_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      exited_at          DATETIME NULL,                  -- NULL = still in this state
      elapsed_seconds    BIGINT NULL,
      sla_hours_snapshot INT NULL,                       -- SLA hrs that applied at entry
      breached_at        DATETIME NULL,
      warning_fired_at   DATETIME NULL,
      escalated_at       DATETIME NULL,
      moved_by           INT NULL,
      PRIMARY KEY (id),
      KEY idx_cst_case (case_id, entered_at),
      KEY idx_cst_open (case_id, exited_at),
      KEY idx_cst_breach (breached_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Seed reasonable defaults aligned with E2B 15-day clock
  const seed = [
    ['AE', 'draft',       72,  80, null],
    ['AE', 'triaged',     48,  80, 'pv_lead'],
    ['AE', 'under_review',120, 75, 'pv_scientist'],
    ['AE', 'qc',          72,  75, 'qa'],
    ['AE', 'approved',    24,  90, 'qppv'],
    ['AE', 'transmitted', 24,  90, null],
    ['MI', 'draft',       48,  75, null],
    ['MI', 'in_review',   72,  75, 'mi_lead'],
    ['MI', 'sent',        24,  90, null],
    ['PC', 'draft',       48,  75, null],
    ['PC', 'investigating', 240, 70, 'qa'],
    ['PC', 'capa_open',   720,  70, 'qa_lead'],
    ['PC', 'closed',      24,  90, null],
  ];
  for (const [case_type, state, hours, warn, role] of seed) {
    await conn.execute(
      `INSERT IGNORE INTO workflow_state_sla
         (org_id, case_type, state, sla_hours, warning_threshold_pct, escalation_role)
       VALUES (NULL, ?, ?, ?, ?, ?)`,
      [case_type, state, hours, warn, role]
    );
  }
}

async function down(conn) {
  try { await conn.execute(`DROP TABLE IF EXISTS case_state_timings`); }   catch (_) {}
  try { await conn.execute(`DROP TABLE IF EXISTS workflow_state_sla`); }    catch (_) {}
}

module.exports = { up, down };
