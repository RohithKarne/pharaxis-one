'use strict';

const { spawn } = require('child_process');
const path = require('path');
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function login(baseUrl, email = 'superadmin', password = '__SET_SMOKE_TEST_PASSWORD__') {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok || !data.token) {
    throw new Error(`Login failed: ${JSON.stringify(data)}`);
  }
  return data.token;
}

async function ensureSecondSuperadmin() {
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'devuser',
    password: process.env.MYSQL_PASSWORD || '__SET_MYSQL_PASSWORD__',
    database: process.env.MYSQL_DATABASE || 'pharaxis_mims_dev',
  });
  try {
    const email = 'superadmin.qa2';
    const [[existing]] = await pool.execute('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (!existing) {
      const hash = await bcrypt.hash('__SET_SMOKE_TEST_PASSWORD__', 10);
      await pool.execute(
        `INSERT INTO users (name, email, password, role, is_active)
         VALUES (?, ?, ?, 'superadmin', 1)`,
        ['Superadmin QA2', email, hash]
      );
    }
    return { email, password: '__SET_SMOKE_TEST_PASSWORD__' };
  } finally {
    await pool.end();
  }
}

async function requestJson(baseUrl, token, method, route, body) {
  const res = await fetch(`${baseUrl}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { res, data };
}

async function runSmoke(baseUrl) {
  const token = await login(baseUrl, 'superadmin', '__SET_SMOKE_TEST_PASSWORD__');
  const secondAdmin = await ensureSecondSuperadmin();
  const tokenL2 = await login(baseUrl, secondAdmin.email, secondAdmin.password);

  const retry = await requestJson(baseUrl, token, 'POST', '/api/admin/process-logs/ops/request', {
    action_type: 'retry',
    route_method: 'POST',
    route_path_pattern: '/api/admin/picklists',
    entity_type: 'flow',
    entity_id: '1',
    reason: 'Smoke test retry operation for process explorer ops.',
    request_payload: { smoke: true },
    confirmation_text: 'CONFIRM SAFE OPS',
  });
  if (retry.res.status !== 201) {
    throw new Error(`Retry create failed: ${retry.res.status} ${JSON.stringify(retry.data)}`);
  }

  const rollback = await requestJson(baseUrl, token, 'POST', '/api/admin/process-logs/ops/request', {
    action_type: 'rollback',
    route_method: 'POST',
    route_path_pattern: '/api/admin/picklists',
    entity_type: 'flow',
    entity_id: 'smoke-test-rb',
    reason: 'Smoke test rollback operation for process explorer ops approvals.',
    request_payload: {
      rollback_sql: 'UPDATE picklists SET updated_at = NOW() WHERE id = :id',
      rollback_params: { id: 1 },
    },
    confirmation_text: 'CONFIRM SAFE OPS',
  });
  if (rollback.res.status !== 201 || rollback.data.status !== 'pending_approval_l1') {
    throw new Error(`Rollback create failed: ${rollback.res.status} ${JSON.stringify(rollback.data)}`);
  }

  const approveL1 = await requestJson(baseUrl, token, 'POST', `/api/admin/process-logs/ops/requests/${rollback.data.request_id}/approve`, {
    confirmation_text: 'CONFIRM SAFE OPS',
  });
  if (approveL1.res.status !== 200 || approveL1.data.status !== 'pending_approval_l2') {
    throw new Error(`Rollback L1 approve failed: ${approveL1.res.status} ${JSON.stringify(approveL1.data)}`);
  }

  const approveL2 = await requestJson(baseUrl, tokenL2, 'POST', `/api/admin/process-logs/ops/requests/${rollback.data.request_id}/approve`, {
    confirmation_text: 'CONFIRM SAFE OPS',
  });
  if (approveL2.res.status !== 200 || approveL2.data.status !== 'executed') {
    throw new Error(`Rollback L2 approve failed: ${approveL2.res.status} ${JSON.stringify(approveL2.data)}`);
  }

  const metrics = await requestJson(baseUrl, token, 'GET', '/api/admin/process-logs/ops/metrics');
  if (metrics.res.status !== 200) {
    throw new Error(`Metrics failed: ${metrics.res.status} ${JSON.stringify(metrics.data)}`);
  }

  const snapshots = await requestJson(baseUrl, token, 'GET', `/api/admin/process-logs/ops/requests/${retry.data.request_id}/snapshots`);
  if (snapshots.res.status !== 200) {
    throw new Error(`Snapshots failed: ${snapshots.res.status} ${JSON.stringify(snapshots.data)}`);
  }
  if (!Array.isArray(snapshots.data.snapshots) || snapshots.data.snapshots.length === 0) {
    throw new Error(`Snapshots empty for request ${retry.data.request_id}`);
  }

  const graph = await requestJson(baseUrl, token, 'GET', '/api/admin/process-logs/sql/graph');
  if (graph.res.status !== 200) {
    throw new Error(`SQL graph failed: ${graph.res.status} ${JSON.stringify(graph.data)}`);
  }

  console.log('[Smoke][ProcessExplorerOps] Passed');
}

async function main() {
  const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:3144';
  const shouldStartServer = !process.env.BASE_URL;
  let server = null;

  try {
    if (shouldStartServer) {
      const serverPath = path.join(__dirname, '..', 'server.js');
      server = spawn(process.execPath, [serverPath], {
        env: { ...process.env, PORT: '3144' },
        stdio: 'ignore',
      });
      await wait(2500);
    }

    await runSmoke(baseUrl);
  } finally {
    if (server) {
      server.kill('SIGTERM');
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
