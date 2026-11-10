'use strict';

/**
 * Migration 189 — drops twenty tables no running code reads or writes
 * (full audit, Rohith's decision of 2026-11-10).
 *
 * WHY
 * They belong to features that were never built past their table (the reports
 * roadmap, the policy graph), were removed (the phone app, support access, Process Explorer
 * requests) or were replaced. Each widens what a validation has to cover.
 *
 * A table is dropped only where it holds no rows. One that holds anything is
 * left in place and named in the audit log, for a person to decide.
 */

const TABLES = [
  'access_sso_configs',
  'admin_impact_preview_log',
  'api_sdk_downloads',
  'cm_document_activity_log',
  'email_retry_log',
  'mobile_push_devices',
  'org_support_access',
  'policy_decision_logs',
  'policy_edges',
  'policy_nodes',
  'process_explorer_ops_requests',
  'report_access_requests',
  'report_anomaly_flags',
  'report_dashboard_shares',
  'report_dashboard_templates',
  'report_delivery_rules',
  'report_role_default_dashboards',
  'report_usage_events',
  'report_user_preferences',
  'user_report_presets',
];

async function up(conn) {
  const dropped = [];
  const kept = [];
  for (const table of TABLES) {
    const [found] = await conn.execute('SHOW TABLES LIKE ?', [table]);
    if (!found.length) continue;
    const [[{ n }]] = await conn.execute(`SELECT COUNT(*) AS n FROM ${table}`);
    if (Number(n) > 0) { kept.push(`${table} (${n} rows)`); continue; }
    await conn.execute(`DROP TABLE ${table}`);
    dropped.push(table);
  }
  await conn.execute(
    `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details)
     VALUES (NULL, 'migration 189', 'DELETE', 'unused_tables', NULL, ?)`,
    [JSON.stringify({ dropped, kept })]
  ).catch((err) => console.warn('[189] audit note not written:', err.message));
}

async function down(_conn) {}

module.exports = { up, down };
