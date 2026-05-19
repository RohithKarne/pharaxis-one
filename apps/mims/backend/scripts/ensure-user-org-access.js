'use strict';

const path = require('path');

try {
  process.loadEnvFile(process.env.MIMS_ENV_FILE || path.join(__dirname, '..', '.env'));
} catch (_) {
  // Best-effort only.
}

const pool = require('../database/db');

const [, , emailArg, orgIdArg, siteIdArg, roleArg, modulesArg] = process.argv;

if (!emailArg) {
  process.stderr.write('Usage: node backend/scripts/ensure-user-org-access.js <email> [orgId] [siteId] [roleAtOrg] [module1,module2,...]\n');
  process.exit(1);
}

(async () => {
  const email = String(emailArg).trim().toLowerCase();
  const roleAtOrg = String(roleArg || 'admin').trim() || 'admin';
  const modules = String(modulesArg || 'admin_console,content_mgmt,data_visualization,mims_core,reports')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const [[user]] = await pool.execute(
    'SELECT id, email, role, is_active FROM users WHERE LOWER(email) = ? LIMIT 1',
    [email]
  );
  if (!user) throw new Error(`User not found for email: ${email}`);

  const targetOrgId = Number(orgIdArg || 0);
  let orgId = Number.isFinite(targetOrgId) && targetOrgId > 0 ? targetOrgId : null;
  if (!orgId) {
    const [[firstOrg]] = await pool.execute(
      'SELECT id FROM organisations WHERE is_active = 1 ORDER BY id ASC LIMIT 1'
    );
    orgId = Number(firstOrg?.id || 0);
  }
  if (!orgId) throw new Error('No active organisation available.');

  const targetSiteId = Number(siteIdArg || 0);
  let siteId = Number.isFinite(targetSiteId) && targetSiteId > 0 ? targetSiteId : null;
  if (!siteId) {
    const [[site]] = await pool.execute(
      'SELECT id FROM sites WHERE org_id = ? ORDER BY id ASC LIMIT 1',
      [orgId]
    ).catch(() => [[null]]);
    siteId = Number(site?.id || 0) || null;
  }

  await pool.execute(
    `INSERT INTO user_org_access
       (user_id, org_id, primary_site_id, role_at_org, site_permission, is_active, access_reason, approved_by, approved_at)
     VALUES (?, ?, ?, ?, 'full', 1, 'Access repair script', ?, NOW())
     ON DUPLICATE KEY UPDATE
       primary_site_id = VALUES(primary_site_id),
       role_at_org = VALUES(role_at_org),
       site_permission = 'full',
       is_active = 1,
       access_reason = VALUES(access_reason),
       approved_by = VALUES(approved_by),
       approved_at = NOW()`,
    [user.id, orgId, siteId, roleAtOrg, user.id]
  );

  for (const moduleKey of modules) {
    await pool.execute(
      `INSERT INTO user_module_permissions (user_id, module, can_access)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE can_access = 1`,
      [user.id, moduleKey]
    );
  }

  const [moduleRows] = await pool.execute(
    'SELECT module FROM user_module_permissions WHERE user_id = ? AND can_access = 1 ORDER BY module ASC',
    [user.id]
  );

  process.stdout.write(
    `${JSON.stringify({
      email: user.email,
      user_id: user.id,
      org_id: orgId,
      site_id: siteId,
      role_at_org: roleAtOrg,
      modules: moduleRows.map((row) => row.module),
    }, null, 2)}\n`
  );
})();
