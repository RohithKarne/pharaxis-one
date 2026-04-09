'use strict';

/**
 * smoke-sprint14-g12.js
 * Sprint 14 / G12 smoke checks:
 * 1) Inbox endpoints respond (basic smoke)
 * 2) Reports endpoints respond (basic regression)
 * 3) Security-group deactivation is blocked when active members are assigned
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
  return { ok: res.ok, status: res.status, data };
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
    } else {
      errors.push({ label: candidate.label, status: login.status, body: login.data });
    }
  }

  throw new Error(`No admin login candidate worked: ${JSON.stringify(errors)}`);
}

async function main() {
  const summary = {
    ok: false,
    base: BASE,
    checks: {},
    cleanup: {},
  };

  const created = {
    groupId: null,
    userId: null,
  };

  try {
    const health = await req('/api/health');
    assert(health.ok, `Health check failed (${health.status})`);
    summary.checks.health = { status: health.status };

    const { token, auth } = await loginWithCandidates();
    summary.checks.auth = { ok: true, method: auth };

    const inbox = await req('/api/inbox', { token });
    assert(inbox.ok, `GET /api/inbox failed (${inbox.status})`);
    assert(Array.isArray(inbox.data?.inquiries), 'GET /api/inbox: inquiries is not an array');
    summary.checks.inbox = {
      status: inbox.status,
      total: Number(inbox.data?.total || 0),
    };

    const inboxUsers = await req('/api/inbox/users', { token });
    assert(inboxUsers.ok, `GET /api/inbox/users failed (${inboxUsers.status})`);
    assert(Array.isArray(inboxUsers.data?.users), 'GET /api/inbox/users: users is not an array');
    summary.checks.inbox_users = {
      status: inboxUsers.status,
      users: inboxUsers.data.users.length,
    };

    const reportVolume = await req('/api/reports/case-volume', { token });
    assert(reportVolume.ok, `GET /api/reports/case-volume failed (${reportVolume.status})`);
    assert(Array.isArray(reportVolume.data?.data), 'case-volume payload missing data array');

    const reportStatus = await req('/api/reports/case-status', { token });
    assert(reportStatus.ok, `GET /api/reports/case-status failed (${reportStatus.status})`);

    const reportHealth = await req('/api/reports/system-health', { token });
    assert(reportHealth.ok, `GET /api/reports/system-health failed (${reportHealth.status})`);

    summary.checks.reports = {
      case_volume_status: reportVolume.status,
      case_status_status: reportStatus.status,
      system_health_status: reportHealth.status,
    };

    const newGroupName = `S14-G12-DEP-${Date.now()}`;
    const createGroup = await req('/api/admin/security-groups', {
      method: 'POST',
      token,
      body: {
        name: newGroupName,
        description: 'Sprint 14 G12 dependency smoke group',
      },
    });

    assert(createGroup.ok, `Create security group failed (${createGroup.status}): ${JSON.stringify(createGroup.data)}`);
    created.groupId = Number(createGroup.data?.id);
    assert(Number.isFinite(created.groupId) && created.groupId > 0, 'Create security group returned invalid id');

    const adminUsers = await req('/api/admin/users', { token });
    assert(adminUsers.ok, `GET /api/admin/users failed (${adminUsers.status})`);
    const activeUser = (adminUsers.data?.users || []).find(user => Number(user.is_active) === 1);
    assert(activeUser, 'No active user available for security-group dependency smoke');
    created.userId = Number(activeUser.id);

    const addUser = await req(`/api/admin/security-groups/${created.groupId}/users`, {
      method: 'POST',
      token,
      body: { user_id: created.userId },
    });
    assert(addUser.ok, `Add user to security group failed (${addUser.status}): ${JSON.stringify(addUser.data)}`);

    const blockedDeactivate = await req(`/api/admin/security-groups/${created.groupId}`, {
      method: 'DELETE',
      token,
    });
    assert(blockedDeactivate.status === 409, `Expected 409 on blocked deactivation, got ${blockedDeactivate.status}`);
    assert(Number(blockedDeactivate.data?.dependency?.active_member_count || 0) >= 1, 'Expected dependency.active_member_count >= 1');

    summary.checks.security_group_dependency = {
      blocked_status: blockedDeactivate.status,
      active_member_count: Number(blockedDeactivate.data?.dependency?.active_member_count || 0),
      sample_count: Array.isArray(blockedDeactivate.data?.dependency?.active_members_sample)
        ? blockedDeactivate.data.dependency.active_members_sample.length
        : 0,
    };

    const removeUser = await req(`/api/admin/security-groups/${created.groupId}/users/${created.userId}`, {
      method: 'DELETE',
      token,
    });
    assert(removeUser.ok, `Remove user from security group failed (${removeUser.status})`);

    const finalDeactivate = await req(`/api/admin/security-groups/${created.groupId}`, {
      method: 'DELETE',
      token,
    });
    assert(finalDeactivate.ok, `Final deactivation failed (${finalDeactivate.status}): ${JSON.stringify(finalDeactivate.data)}`);

    summary.checks.security_group_cleanup = {
      remove_user_status: removeUser.status,
      deactivate_after_remove_status: finalDeactivate.status,
    };

    summary.ok = true;
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    try {
      if (created.groupId) {
        const { token } = await loginWithCandidates();
        if (created.userId) {
          const rm = await req(`/api/admin/security-groups/${created.groupId}/users/${created.userId}`, {
            method: 'DELETE',
            token,
          });
          summary.cleanup.remove_user_status = rm.status;
        }
        const del = await req(`/api/admin/security-groups/${created.groupId}`, {
          method: 'DELETE',
          token,
        });
        summary.cleanup.deactivate_group_status = del.status;
      }
    } catch (err) {
      summary.cleanup.error = err.message;
    }
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, base: BASE, error: err.message }, null, 2));
  process.exit(1);
});
