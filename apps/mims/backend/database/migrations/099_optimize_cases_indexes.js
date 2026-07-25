'use strict';

/**
 * Migration 099 — Optimize Cases & Audit Trail Indexes
 * 
 * Adds composite database indexes to optimize high-volume listing queries on `cases`
 * and fast historical timeline lookups on `case_audit_trail`.
 */

async function up(conn) {
  try {
    await conn.execute(
      `ALTER TABLE cases ADD KEY idx_cases_org_status_deleted_created (org_id, is_deleted, status, created_at)`
    );
  } catch (_) {}

  try {
    await conn.execute(
      `ALTER TABLE case_audit_trail ADD KEY idx_audit_case_created (case_id, created_at)`
    );
  } catch (_) {}
}

async function down(conn) {
  try {
    await conn.execute(`ALTER TABLE cases DROP INDEX idx_cases_org_status_deleted_created`);
  } catch (_) {}
  try {
    await conn.execute(`ALTER TABLE case_audit_trail DROP INDEX idx_audit_case_created`);
  } catch (_) {}
}

module.exports = { up, down };
