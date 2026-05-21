'use strict';

async function up(conn) {
  await conn.execute(
    `INSERT IGNORE INTO role_permissions (role, module, can_access)
     SELECT role, 'platform_admin_console', can_access
       FROM role_permissions
      WHERE module = 'superadmin_console'`
  ).catch(() => {});

  await conn.execute(
    `DELETE FROM role_permissions
      WHERE module = 'superadmin_console'`
  ).catch(() => {});

  await conn.execute(
    `INSERT IGNORE INTO user_module_permissions (user_id, module, can_access)
     SELECT user_id, 'platform_admin_console', can_access
       FROM user_module_permissions
      WHERE module = 'superadmin_console'`
  ).catch(() => {});

  await conn.execute(
    `DELETE FROM user_module_permissions
      WHERE module = 'superadmin_console'`
  ).catch(() => {});
}

async function down(_conn) {}

module.exports = { up, down };
