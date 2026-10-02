'use strict';

const { signIn } = require('../utils/signInClient');

// Separation of duties (author ≠ approver) refuses a check that approves its own content.
// A second, throwaway admin in the regression user's organisation approves instead; the
// caller removes it with cleanup(). Its password is the electronic-signature password.
async function createIndependentApprover(makeRequest, authorToken) {
  const pool = require('../database/db');
  const bcrypt = require('bcrypt');
  const me = await makeRequest('GET', '/api/auth/me', null, authorToken);
  const orgId = Number(me.body?.orgId || me.body?.user?.orgId || 0);
  const email = `${uniqueName('regression-approver').toLowerCase()}@example.com`;
  const password = ['TempApprover', '123'].join('@');
  const hash = await bcrypt.hash(password, 10);
  const [ins] = await pool.execute(
    `INSERT INTO users (name, email, password, role, org_id, is_active, email_verified)
     VALUES ('Regression Approver', ?, ?, 'admin', ?, 1, 1)`,
    [email, hash, orgId || null]
  );
  const userId = Number(ins.insertId || 0);
  if (orgId) {
    await pool.execute('INSERT INTO user_org_access (user_id, org_id, is_active) VALUES (?, ?, 1)', [userId, orgId]);
  }
  await pool.execute("INSERT INTO user_module_permissions (user_id, module, can_access) VALUES (?, 'content_mgmt', 1)", [userId]);
  const login = await loginForToken(makeRequest, email, password);
  const cleanup = async () => {
    for (const sql of [
      'DELETE FROM user_2fa_backup_codes WHERE user_id = ?',
      'DELETE FROM user_2fa_challenges WHERE user_id = ?',
      'DELETE FROM user_2fa_settings WHERE user_id = ?',
      'DELETE FROM user_module_permissions WHERE user_id = ?',
      'DELETE FROM user_org_access WHERE user_id = ?',
      'DELETE FROM sessions WHERE user_id = ?',
      'UPDATE users SET is_active = 0 WHERE id = ?',
    ]) await pool.execute(sql, [userId]).catch(() => {});
  };
  return { userId, token: login.token, password, status: login.status, cleanup };
}

// MIPM-82: the regression checks' own sign-ins (temporary users they create). The session is
// cookie-only and the org may require 2FA, so a new account sets up an authenticator the way a
// person would. Returns { status, token, body } as the old per-file loginForToken did.
async function loginForToken(makeRequest, email, password) {
  const post = async (path, body) => {
    const res = await makeRequest('POST', path, body, null);
    return { status: res.status, body: res.body, setCookie: res.headers?.['set-cookie'] };
  };
  const result = await signIn(post, { email, password, enrollTotpIfRequired: true });
  return { status: result.token ? 200 : result.status, token: result.token, body: { step: result.step, error: result.error } };
}

function uniqueName(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

async function getFirstCase(makeRequest, token) {
  const res = await makeRequest('GET', '/api/cases?limit=1&include_meta=true', null, token);
  const rows = Array.isArray(res.body?.rows)
    ? res.body.rows
    : Array.isArray(res.body)
      ? res.body
      : [];
  return rows[0] || null;
}

async function getFirstInquiry(makeRequest, token) {
  const res = await makeRequest('GET', '/api/inbox', null, token);
  const inquiries = Array.isArray(res.body?.inquiries) ? res.body.inquiries : [];
  return inquiries[0] || null;
}

async function getFirstUser(makeRequest, token) {
  const res = await makeRequest('GET', '/api/admin/users', null, token);
  const users = Array.isArray(res.body?.users) ? res.body.users : [];
  return users[0] || null;
}

async function getFirstFolder(makeRequest, token) {
  const res = await makeRequest('GET', '/api/cm/folders', null, token);
  const folders = Array.isArray(res.body?.folders) ? res.body.folders : [];
  return folders[0] || null;
}

async function getFirstSecurityGroup(makeRequest, token) {
  const res = await makeRequest('GET', '/api/admin/security-groups', null, token);
  const groups = Array.isArray(res.body?.groups) ? res.body.groups : [];
  return groups[0] || null;
}

module.exports = {
  loginForToken,
  createIndependentApprover,
  getFirstFolder,
  getFirstSecurityGroup,
  uniqueName,
  getFirstCase,
  getFirstInquiry,
  getFirstUser,
};
