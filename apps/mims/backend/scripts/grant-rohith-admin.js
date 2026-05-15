#!/usr/bin/env node
/**
 * grant-rohith-admin.js
 *
 * One-time bootstrap to grant Rohith's user full admin + app access.
 * Safe to run multiple times — idempotent.
 *
 *   cd apps/mims/backend
 *   node scripts/grant-rohith-admin.js
 *
 * Override the email with first arg if needed:
 *   node scripts/grant-rohith-admin.js other_email@domain.com
 */

'use strict';

try { process.loadEnvFile(); } catch (_) {}

const pool = require('../database/db');

const TARGET_EMAIL = (process.argv[2] || 'rohithreddy480@gmail.com').toLowerCase();

const MODULES = [
  'mims_core', 'inbox', 'case_mgmt', 'case_query', 'utilities',
  'transmissions', 'browse_content', 'reports',
  'admin_console', 'content_mgmt', 'data_visualization', 'analytics',
];

(async () => {
  try {
    // 1. Look up the user
    const [[user]] = await pool.execute(
      'SELECT id, email, role, is_active FROM users WHERE LOWER(email) = ? LIMIT 1',
      [TARGET_EMAIL]
    );
    if (!user) {
      console.error(`❌ User not found: ${TARGET_EMAIL}`);
      console.error(`   Available admin candidates (top 10):`);
      const [rows] = await pool.execute(
        `SELECT id, email, role FROM users WHERE role IN ('admin','superadmin') OR email LIKE '%rohith%' ORDER BY id LIMIT 10`
      );
      console.table(rows);
      process.exit(1);
    }
    console.log(`✓ Found user #${user.id} <${user.email}> (current role: ${user.role}, is_active: ${user.is_active})`);

    // 2. Set role + activate + unblock
    await pool.execute(
      `UPDATE users
         SET role = 'admin',
             is_active = 1,
             is_disabled = COALESCE(is_disabled, 0),
             password_reset_required = 0
       WHERE id = ?`,
      [user.id]
    );
    console.log(`✓ Set role = admin, is_active = 1, password_reset_required = 0`);

    // 3. Grant all modules
    let granted = 0;
    for (const m of MODULES) {
      const [r] = await pool.execute(
        `INSERT INTO user_module_permissions (user_id, module, can_access)
         VALUES (?, ?, 1)
         ON DUPLICATE KEY UPDATE can_access = 1`,
        [user.id, m]
      );
      if (r.affectedRows > 0) granted++;
    }
    console.log(`✓ Granted ${MODULES.length} module permissions (${granted} rows touched)`);

    // 4. Show final state
    const [[final]] = await pool.execute(
      'SELECT id, email, role, is_active, COALESCE(is_disabled,0) AS is_disabled FROM users WHERE id = ?',
      [user.id]
    );
    const [perms] = await pool.execute(
      'SELECT module FROM user_module_permissions WHERE user_id = ? AND can_access = 1 ORDER BY module',
      [user.id]
    );
    console.log('\n── Final state ─────────────────────────');
    console.log(final);
    console.log('Modules:', perms.map(p => p.module).join(', '));
    console.log('────────────────────────────────────────');
    console.log('\n✅ Done. You can now log in and access /admin.\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Script failed:', err.message);
    process.exit(1);
  }
})();
