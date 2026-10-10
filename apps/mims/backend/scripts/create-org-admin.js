#!/usr/bin/env node
'use strict';
/**
 * create-org-admin.js — make (or repair) an organisation's own administrator on a
 * local or staging MIMS, without mail. The account is the one that can grant
 * Pharaxis support access to the organisation's cases (System › Security ›
 * Support Access); a platform admin cannot grant it for them.
 *
 *   cd apps/mims/backend
 *   node scripts/create-org-admin.js <email> "<Full name>" "<Organisation name>"
 *
 * Prints a one-time password once, on the terminal only. MIMS asks for a new
 * password at the first sign-in (password_reset_required), so the printed one is
 * never the account's lasting password and is never stored in the clear.
 * Safe to run again: an existing account keeps its password and only has its
 * organisation access checked; add --new-password to issue a fresh one-time password.
 */

const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

try { process.loadEnvFile(process.env.MIMS_ENV_FILE || path.join(__dirname, '..', '..', '.env')); } catch (_) { /* best effort */ }

const pool = require('../database/db');

const args = process.argv.slice(2).filter(a => a !== '--new-password');
const newPassword = process.argv.includes('--new-password');
const [emailArg, nameArg, orgArg] = args;
if (!emailArg || !nameArg || !orgArg) {
  process.stderr.write('Usage: node scripts/create-org-admin.js <email> "<Full name>" "<Organisation name>" [--new-password]\n');
  process.exit(1);
}

(async () => {
  const email = String(emailArg).trim().toLowerCase();
  const name = String(nameArg).trim();
  const [[org]] = await pool.execute('SELECT id, name FROM organisations WHERE LOWER(name) = ? LIMIT 1', [String(orgArg).trim().toLowerCase()]);
  if (!org) {
    const [orgs] = await pool.execute('SELECT id, name FROM organisations ORDER BY name');
    throw new Error(`No organisation named "${orgArg}". Organisations here: ${orgs.map(o => o.name).join(', ') || 'none'}.`);
  }
  const [[site]] = await pool.execute('SELECT id, name FROM sites WHERE org_id = ? ORDER BY id LIMIT 1', [org.id]);
  if (!site) throw new Error(`${org.name} has no site yet; add one first (MIMS Admin › Organisations).`);

  let [[user]] = await pool.execute('SELECT id, email, role, is_active FROM users WHERE LOWER(email) = ? LIMIT 1', [email]);
  let oneTime = null;
  if (!user) {
    oneTime = crypto.randomBytes(12).toString('base64url');
    const hash = await bcrypt.hash(oneTime, 12);
    const initials = name.split(/\s+/).map(w => w[0] || '').join('').slice(0, 3).toUpperCase() || 'AD';
    // users.user_id is a separate unique short id; pick one that is free.
    const base = email.split('@')[0].slice(0, 45);
    let userId = base;
    for (let n = 2; ; n++) {
      const [[taken]] = await pool.execute('SELECT id FROM users WHERE user_id = ? LIMIT 1', [userId]);
      if (!taken) break;
      userId = `${base}${n}`;
    }
    const [r] = await pool.execute(
      `INSERT INTO users (user_id, name, email, password, role, initials, org_id, is_active, email_verified, email_verified_at,
                          password_reset_required, is_primary_ref, is_disabled, access_admin_site, case_admin)
       VALUES (?, ?, ?, ?, 'admin', ?, ?, 1, 1, NOW(), 1, 0, 0, 1, 1)`,
      [userId, name, email, hash, initials, org.id]);
    user = { id: r.insertId, email, role: 'admin', is_active: 1 };
    console.log(`Created ${email} as an administrator of ${org.name}.`);
  } else {
    await pool.execute(`UPDATE users SET role = 'admin', is_active = 1, is_disabled = 0, access_admin_site = 1, case_admin = 1, org_id = COALESCE(org_id, ?) WHERE id = ?`, [org.id, user.id]);
    console.log(`${email} already exists; made sure it is an active administrator.`);
    if (newPassword) {
      oneTime = crypto.randomBytes(12).toString('base64url');
      await pool.execute('UPDATE users SET password = ?, password_reset_required = 1, failed_login_attempts = 0, locked_until = NULL WHERE id = ?', [await bcrypt.hash(oneTime, 12), user.id]);
    }
  }

  // Same columns the platform admin's "assign to organisation" screen writes
  // (routes/platformAdmin.js), so this works on every copy's schema.
  await pool.execute(
    `INSERT INTO user_org_access (user_id, org_id, primary_site_id, role_at_org, site_permission)
     VALUES (?, ?, ?, 'admin', 'full')
     ON DUPLICATE KEY UPDATE primary_site_id = VALUES(primary_site_id),
       role_at_org = 'admin', site_permission = 'full', is_active = 1`,
    [user.id, org.id, site.id]);
  console.log(`${email} administers ${org.name} (site: ${site.name}).`);
  if (oneTime) {
    console.log('');
    console.log('One-time password (shown once, never stored in the clear): ' + oneTime);
    console.log('Sign in with it; MIMS asks for a new password straight away.');
  }
  console.log('');
  console.log('Next, as this account: MIMS Admin › System › Security › Support Access › grant, with a reason and a number of days.');
  await pool.end();
})().catch(async (err) => {
  console.error(err.message || err);
  try { await pool.end(); } catch (_) { /* ignore */ }
  process.exit(1);
});
