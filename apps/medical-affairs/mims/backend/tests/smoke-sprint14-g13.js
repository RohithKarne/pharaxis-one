'use strict';

/**
 * smoke-sprint14-g13.js
 * Sprint 14 G13 checks:
 * 1) API version contract endpoints
 * 2) /api/v1 response headers
 * 3) /api/v1 route parity for reports and admin log aggregation
 */

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function req(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }

  return {
    ok: res.ok,
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    data,
  };
}

async function loginWithCandidates() {
  const candidates = [
    {
      email: process.env.SMOKE_ADMIN_EMAIL || 'vanaja_admin@reviewco.com',
      password: process.env.SMOKE_ADMIN_PASSWORD || 'Test@1234',
      label: 'org-admin',
    },
    {
      email: 'superadmin',
      password: 'Manager@123',
      label: 'superadmin-short',
    },
    {
      email: 'superadmin@mims.io',
      password: 'SuperAdmin@123',
      label: 'superadmin-email',
    },
  ];

  const errors = [];
  for (const candidate of candidates) {
    const login = await req('/api/auth/login', {
      method: 'POST',
      body: { email: candidate.email, password: candidate.password },
    });

    if (!login.ok) {
      errors.push({ label: candidate.label, status: login.status, body: login.data });
      continue;
    }

    if (login.data?.token) {
      return { token: login.data.token, auth: candidate.label };
    }

    if (login.data?.challengeToken) {
      const skip = await req('/api/auth/2fa/skip-setup', {
        method: 'POST',
        body: { challengeToken: login.data.challengeToken },
      });
      if (skip.ok && skip.data?.token) {
        return { token: skip.data.token, auth: `${candidate.label}+2fa-skip` };
      }
      errors.push({ label: `${candidate.label}+2fa`, status: skip.status, body: skip.data });
      continue;
    }

    errors.push({ label: candidate.label, status: login.status, body: login.data });
  }

  throw new Error(`No admin login candidate worked: ${JSON.stringify(errors)}`);
}

async function main() {
  const out = { ok: false, base: BASE, checks: {} };

  const rootVersion = await req('/api/version');
  assert(rootVersion.ok, `GET /api/version failed (${rootVersion.status})`);
  assert(rootVersion.data?.latest_version === 'v1', 'Expected /api/version latest_version to be v1');
  out.checks.api_version = {
    status: rootVersion.status,
    latest_version: rootVersion.data?.latest_version,
    contract_date: rootVersion.data?.contract_date,
  };

  const v1Health = await req('/api/v1/health');
  assert(v1Health.ok, `GET /api/v1/health failed (${v1Health.status})`);
  assert(v1Health.data?.version === 'v1', 'Expected /api/v1/health version to be v1');
  assert(v1Health.headers['x-api-version'] === '1', 'Expected x-api-version=1 on /api/v1/*');
  out.checks.v1_health = {
    status: v1Health.status,
    x_api_version: v1Health.headers['x-api-version'] || null,
  };

  const v1Version = await req('/api/v1/version');
  assert(v1Version.ok, `GET /api/v1/version failed (${v1Version.status})`);
  assert(v1Version.headers['x-api-version'] === '1', 'Expected x-api-version=1 on /api/v1/version');
  assert(v1Version.data?.requested_version === 'v1', 'Expected requested_version=v1 on /api/v1/version');
  out.checks.v1_version = {
    status: v1Version.status,
    requested_version: v1Version.data?.requested_version,
    supported_versions: v1Version.data?.supported_versions,
  };

  const { token, auth } = await loginWithCandidates();
  out.checks.auth = { ok: true, method: auth };

  const v1SystemHealth = await req('/api/v1/reports/system-health', { token });
  assert(v1SystemHealth.ok, `GET /api/v1/reports/system-health failed (${v1SystemHealth.status})`);
  assert(v1SystemHealth.headers['x-api-version'] === '1', 'Expected x-api-version=1 on v1 reports endpoint');
  out.checks.v1_reports = {
    status: v1SystemHealth.status,
    has_data: !!v1SystemHealth.data,
  };

  const v1LogAgg = await req('/api/v1/admin/service-logs/aggregation?trend_days=7', { token });
  assert(v1LogAgg.ok, `GET /api/v1/admin/service-logs/aggregation failed (${v1LogAgg.status})`);
  assert(typeof v1LogAgg.data?.summary?.total === 'number', 'Expected summary.total in v1 service log aggregation');
  assert(v1LogAgg.headers['x-api-version'] === '1', 'Expected x-api-version=1 on v1 admin aggregation endpoint');
  out.checks.v1_log_aggregation = {
    status: v1LogAgg.status,
    total: v1LogAgg.data.summary.total,
    failure_rate_percent: v1LogAgg.data.summary.failure_rate_percent,
  };

  out.ok = true;
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, base: BASE, error: err.message }, null, 2));
  process.exit(1);
});
