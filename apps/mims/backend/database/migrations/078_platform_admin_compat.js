'use strict';

async function up(conn) {
  const moduleKeys = ['platform_admin_console', 'superadmin_console'];

  await conn.execute(
    `INSERT IGNORE INTO role_permissions (role, module, can_access)
     SELECT role, 'platform_admin_console', can_access
     FROM role_permissions
     WHERE module = 'superadmin_console'`
  );

  await conn.execute(
    `INSERT IGNORE INTO user_module_permissions (user_id, module, can_access)
     SELECT user_id, 'platform_admin_console', can_access
     FROM user_module_permissions
     WHERE module = 'superadmin_console'`
  );

  await conn.execute(
    `INSERT INTO system_config (config_key, config_value)
     SELECT 'platform_admin_session_timeout_minutes', config_value
     FROM system_config
     WHERE config_key = 'superadmin_session_timeout_minutes'
       AND NOT EXISTS (
         SELECT 1 FROM system_config WHERE config_key = 'platform_admin_session_timeout_minutes'
       )`
  ).catch(() => {});

  for (const key of moduleKeys) {
    await conn.execute(
      `INSERT IGNORE INTO role_permissions (role, module, can_access) VALUES ('superadmin', ?, 1)`,
      [key]
    );
  }
}

async function down(_conn) {}

module.exports = { up, down };
