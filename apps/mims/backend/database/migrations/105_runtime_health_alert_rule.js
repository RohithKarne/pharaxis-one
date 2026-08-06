'use strict';
// Migration 105 — alert rule for the runtime-health-watch cron (PAUD-3 item 3)
//
// emitPlatformAdminAlert() is a no-op unless a matching rule exists AND is
// active. Migration 009 seeds its eight default rules with is_active = 0, so
// the alerting subsystem ships dormant.
//
// This rule is seeded ACTIVE — deliberately, and it is the only one. The
// acceptance criterion for this item is that a failing health check reaches
// someone without anybody opening a screen; an inactive rule fails that by
// doing nothing quietly, which is the exact defect being fixed. The 60-minute
// cooldown stops the 5-minute cron from generating an alert storm.
//
// RECIPIENTS ARE NOT SEEDED HERE, DELIBERATELY. recipient_emails is per-
// environment operational config and is set through the platform-admin alert
// rules screen (backend/routes/platformAdmin.js:945). A personal address does
// not belong in a committed migration.
//
// The consequence, which is worth knowing: with no recipient email AND no
// active platform_admin user, this rule writes an alert event and reaches
// nobody. Set a recipient on every environment where you want to be told.

async function up(conn) {
  await conn.execute(
    `INSERT INTO platform_admin_alert_rules
      (name, event_type, severity, channels, recipient_emails,
       threshold_value, window_minutes, cooldown_minutes, is_active)
     VALUES ('Runtime Health Degraded', 'runtime_health_degraded', 'high',
             'email,in_app', '', 1, 5, 60, 1)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name), severity = VALUES(severity), channels = VALUES(channels),
       threshold_value = VALUES(threshold_value), window_minutes = VALUES(window_minutes),
       cooldown_minutes = VALUES(cooldown_minutes)`
  );
}

module.exports = { up };
