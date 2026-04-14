const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3145/api';
const CREDS = {
  superadminUserId: process.env.QMS_SUPERADMIN_USER_ID || 'Superadmin',
  password: process.env.QMS_PASSWORD || 'Manager@123',
  orgCode: process.env.QMS_ORG_CODE || 'PHA_DEV'
};

async function request(path, { method = 'GET', token = '', body, expectedStatus = 200 } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  const expected = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  if (!expected.includes(response.status)) {
    throw new Error(
      `Expected ${expected.join(' or ')} for ${method} ${path}, got ${response.status}: ${JSON.stringify(payload)}`
    );
  }

  return { status: response.status, payload };
}

async function createTemporaryUserViaSuperadmin(runId) {
  const superLogin = await request('/auth/superadmin/login', {
    method: 'POST',
    expectedStatus: 200,
    body: { userId: CREDS.superadminUserId, password: CREDS.password }
  });
  const superToken = superLogin.payload.accessToken;

  const orgs = await request('/superadmin/orgs', {
    token: superToken,
    expectedStatus: 200
  });
  const org =
    (orgs.payload.orgs || []).find((item) => item.org_code === CREDS.orgCode) ||
    orgs.payload.orgs?.[0];
  if (!org) {
    throw new Error('No organization found for smoke test user bootstrap');
  }

  const tempEmail = `cc_smoke_${runId}@pharaxis.local`;
  const userCreate = await request('/superadmin/users', {
    method: 'POST',
    token: superToken,
    expectedStatus: 201,
    body: {
      orgId: org.id,
      email: tempEmail,
      fullName: 'Change Control Smoke User',
      password: CREDS.password,
      roleKeys: ['author', 'qa_reviewer', 'approver']
    }
  });
  if (!userCreate.payload.user?.id) {
    throw new Error('Failed to create temporary user for smoke test');
  }

  const userLogin = await request('/auth/login', {
    method: 'POST',
    expectedStatus: [200, 202],
    body: {
      email: tempEmail,
      password: CREDS.password,
      orgCode: org.org_code
    }
  });
  if (userLogin.status === 200) {
    return { token: userLogin.payload.accessToken, userId: userLogin.payload.user.id };
  }
  if (userLogin.payload.otpRequired && userLogin.payload.challengeId && userLogin.payload.devOtp) {
    const verify = await request('/auth/login/verify-otp', {
      method: 'POST',
      expectedStatus: 200,
      body: {
        challengeId: userLogin.payload.challengeId,
        otp: userLogin.payload.devOtp
      }
    });
    return { token: verify.payload.accessToken, userId: verify.payload.user.id };
  }
  throw new Error('User login requires OTP but test could not verify challenge');
}

async function run() {
  const runId = Date.now().toString();
  const { token, userId } = await createTemporaryUserViaSuperadmin(runId);

  const create = await request('/change-control', {
    method: 'POST',
    token,
    expectedStatus: 201,
    body: {
      title: `Sprint2 Change Control ${runId}`,
      changeType: 'Standard',
      reason: 'Smoke test for change-control module',
      ownerUserId: userId,
      plannedStartDate: '2026-04-14',
      plannedEndDate: '2026-04-20',
      riskLevel: 'Medium'
    }
  });

  const changeId = create.payload.change.id;

  await request(`/change-control/${changeId}/impact-assessment`, {
    method: 'POST',
    token,
    expectedStatus: 201,
    body: {
      assessmentSummary: 'Impacts document workflow and training tracker.',
      impactedModules: ['DocumentControl', 'TrainingManagement'],
      riskLevel: 'Medium'
    }
  });

  await request(`/change-control/${changeId}/approvals`, {
    method: 'POST',
    token,
    expectedStatus: 403,
    body: {
      decision: 'Approve',
      comments: 'Should fail due to segregation rule.'
    }
  });

  const superLogin = await request('/auth/superadmin/login', {
    method: 'POST',
    expectedStatus: 200,
    body: { userId: CREDS.superadminUserId, password: CREDS.password }
  });
  const superToken = superLogin.payload.accessToken;

  await request(`/change-control/${changeId}/approvals`, {
    method: 'POST',
    token: superToken,
    expectedStatus: 201,
    body: {
      decision: 'Approve',
      comments: 'Approved by separate actor as per segregation rule.'
    }
  });

  await request(`/change-control/${changeId}/implementation`, {
    method: 'POST',
    token,
    expectedStatus: 201,
    body: {
      stepTitle: 'Deploy workflow rule update',
      stepStatus: 'Completed',
      dueDate: '2026-04-15',
      evidenceRef: 'CC-SMOKE-001'
    }
  });

  const closed = await request(`/change-control/${changeId}/close`, {
    method: 'POST',
    token,
    expectedStatus: 200,
    body: {
      closureSummary: 'Rollout completed and verified',
      effectivenessResult: 'Effective'
    }
  });

  if (closed.payload.change.status !== 'Closed') {
    throw new Error(`Expected Closed status, got ${closed.payload.change.status}`);
  }

  const list = await request('/change-control', {
    token,
    expectedStatus: 200
  });

  const found =
    Array.isArray(list.payload.changes) && list.payload.changes.some((item) => item.id === changeId);
  if (!found) {
    throw new Error('Created change request was not returned by GET /change-control');
  }

  console.log('PASS: Sprint 2 change-control smoke suite');
}

run().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
