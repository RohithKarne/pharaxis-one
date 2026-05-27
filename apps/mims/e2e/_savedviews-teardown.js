/**
 * _savedviews-teardown.js — removes the throwaway test user and all its data.
 * Run with: node --env-file=.env e2e/_savedviews-teardown.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const pool = require('../backend/database/db');

const EMAIL = 'e2e_savedviews@pharaxis.test';
const SESSION_FILE = path.join(__dirname, '.savedviews-session.json');

async function main() {
  if (pool.initPromise) { try { await pool.initPromise; } catch (_) {} }
  const [rows] = await pool.execute('SELECT id FROM users WHERE email = ?', [EMAIL]);
  for (const r of rows) {
    await pool.execute('DELETE FROM user_preferences WHERE user_id = ?', [r.id]).catch(() => {});
    await pool.execute('DELETE FROM sessions WHERE user_id = ?', [r.id]).catch(() => {});
    await pool.execute('DELETE FROM user_org_access WHERE user_id = ?', [r.id]).catch(() => {});
  }
  await pool.execute('DELETE FROM users WHERE email = ?', [EMAIL]).catch(() => {});
  if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
  console.log('TEARDOWN_OK removed=' + rows.length);
}

main().then(() => process.exit(0)).catch(err => { console.error('TEARDOWN_FAIL', err.message); process.exit(1); });
