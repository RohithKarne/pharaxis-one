'use strict';

async function tableExists(conn, tableName) {
  const [rows] = await conn.execute(
    `SELECT 1
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = ?
      LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
}

async function configExists(conn, configKey) {
  const [rows] = await conn.execute(
    'SELECT 1 FROM system_config WHERE config_key = ? LIMIT 1',
    [configKey]
  );
  return rows.length > 0;
}

async function up(conn) {
  await conn.execute(
    `UPDATE users
        SET role = 'platform_admin'
      WHERE role = 'superadmin'`
  ).catch(() => {});

  await conn.execute(
    `UPDATE role_permissions
        SET role = 'platform_admin'
      WHERE role = 'superadmin'`
  ).catch(() => {});

  await conn.execute(
    `UPDATE role_permissions
        SET module = 'platform_admin_console'
      WHERE module = 'superadmin_console'`
  ).catch(() => {});

  await conn.execute(
    `DELETE rp1
       FROM role_permissions rp1
       JOIN role_permissions rp2
         ON rp1.role = rp2.role
        AND rp1.module = rp2.module
        AND rp1.id > rp2.id`
  ).catch(() => {});

  await conn.execute(
    `UPDATE user_module_permissions
        SET module = 'platform_admin_console'
      WHERE module = 'superadmin_console'`
  ).catch(() => {});

  await conn.execute(
    `DELETE ump1
       FROM user_module_permissions ump1
       JOIN user_module_permissions ump2
         ON ump1.user_id = ump2.user_id
        AND ump1.module = ump2.module
        AND ump1.id > ump2.id`
  ).catch(() => {});

  if (await configExists(conn, 'superadmin_session_timeout_minutes')) {
    await conn.execute(
      `INSERT INTO system_config (config_key, config_value)
       SELECT 'platform_admin_session_timeout_minutes', config_value
         FROM system_config
        WHERE config_key = 'superadmin_session_timeout_minutes'
          AND NOT EXISTS (
            SELECT 1
              FROM system_config
             WHERE config_key = 'platform_admin_session_timeout_minutes'
          )`
    ).catch(() => {});

    await conn.execute(
      `DELETE FROM system_config
        WHERE config_key = 'superadmin_session_timeout_minutes'`
    ).catch(() => {});
  }

  if (await tableExists(conn, 'superadmin_alert_rules') && !(await tableExists(conn, 'platform_admin_alert_rules'))) {
    await conn.execute('RENAME TABLE superadmin_alert_rules TO platform_admin_alert_rules').catch(() => {});
  }
  if (await tableExists(conn, 'superadmin_alert_events') && !(await tableExists(conn, 'platform_admin_alert_events'))) {
    await conn.execute('RENAME TABLE superadmin_alert_events TO platform_admin_alert_events').catch(() => {});
  }
}

async function down(_conn) {}

module.exports = { up, down };
