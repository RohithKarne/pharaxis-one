'use strict';

async function up(conn) {
  await conn.execute(
    `INSERT IGNORE INTO role_permissions (role, module, can_access)
     VALUES ('platform_admin', 'platform_admin_console', 1)`
  );
}

async function down(_conn) {}

module.exports = { up, down };
