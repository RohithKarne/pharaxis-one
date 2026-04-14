const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3145/api';
const CREDS = {
  superadminUserId: process.env.QMS_SUPERADMIN_USER_ID || 'Superadmin',
  superadminPassword: process.env.QMS_SUPERADMIN_PASSWORD || 'Manager@123',
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

async function loginSuperadmin() {
  const login = await request('/auth/superadmin/login', {
    method: 'POST',
    expectedStatus: 200,
    body: {
      userId: CREDS.superadminUserId,
      password: CREDS.superadminPassword
    }
  });

  return login.payload.accessToken;
}

async function createAndLoginOwner(superToken, runId) {
  const orgs = await request('/superadmin/orgs', {
    token: superToken,
    expectedStatus: 200
  });

  const org = (orgs.payload.orgs || []).find((row) => row.org_code === CREDS.orgCode);
  if (!org) throw new Error(`Org not found for code ${CREDS.orgCode}`);

  const userEmail = `capa_owner_${runId}@pharaxis.local`;
  const password = 'Owner@123';

  const created = await request('/superadmin/users', {
    method: 'POST',
    token: superToken,
    expectedStatus: 201,
    body: {
      orgId: org.id,
      email: userEmail,
      fullName: 'CAPA Blueprint Owner',
      password,
      roleKeys: ['author', 'qa_reviewer']
    }
  });

  const ownerUserId = created.payload.user?.id;
  if (!ownerUserId) throw new Error('Owner user was not created');

  const login = await request('/auth/login', {
    method: 'POST',
    expectedStatus: [200, 202],
    body: {
      userId: userEmail,
      password,
      orgCode: org.org_code
    }
  });

  if (login.status === 200) {
    return { ownerToken: login.payload.accessToken, ownerUserId };
  }

  if (login.payload.otpRequired && login.payload.challengeId && login.payload.devOtp) {
    const verify = await request('/auth/login/verify-otp', {
      method: 'POST',
      expectedStatus: 200,
      body: {
        challengeId: login.payload.challengeId,
        otp: login.payload.devOtp
      }
    });
    return { ownerToken: verify.payload.accessToken, ownerUserId };
  }

  throw new Error('Owner login OTP flow failed');
}

async function run() {
  const runId = Date.now().toString();
  const superToken = await loginSuperadmin();
  const { ownerToken, ownerUserId } = await createAndLoginOwner(superToken, runId);

  const create = await request('/capa', {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 201,
    body: {
      title: `CAPA Blueprint Smoke ${runId}`,
      sourceType: 'Manual',
      classification: 'Corrective',
      ownerUserId,
      dueDate: '2026-05-30',
      department: 'Quality',
      productName: 'QMS Platform',
      batchLotNo: 'LOT-CAPA-001',
      severity: 4,
      occurrence: 3,
      detectability: 2
    }
  });

  const capaId = create.payload.capa?.id;
  if (!capaId) throw new Error('CAPA not created');

  await request(`/capa/${capaId}/submit`, {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 200
  });

  await request(`/capa/${capaId}/triage`, {
    method: 'POST',
    token: superToken,
    expectedStatus: 200,
    body: {
      triageSummary: 'Risk verified and accepted for investigation.'
    }
  });

  await request(`/capa/${capaId}/rca/5why`, {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 201,
    body: {
      entries: [
        { whyLevel: 1, answer: 'Review checklist was skipped' },
        { whyLevel: 2, answer: 'Checklist ownership was unclear' }
      ]
    }
  });

  await request(`/capa/${capaId}/rca/fishbone`, {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 201,
    body: {
      category: 'Method',
      cause: 'No mandatory pre-release checklist gating'
    }
  });

  const action = await request(`/capa/${capaId}/actions`, {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 201,
    body: {
      actionType: 'Corrective',
      description: 'Enforce release checklist in deployment workflow',
      dueDate: '2026-05-25',
      assignedOwnerUserId: ownerUserId
    }
  });

  const actionId = action.payload.actionItem?.id;
  if (!actionId) throw new Error('Action item not created');

  await request(`/capa/${capaId}/approve`, {
    method: 'POST',
    token: superToken,
    expectedStatus: 201,
    body: {
      stage: 'ActionPlan',
      decision: 'Approve',
      comments: 'Plan is sufficient for execution.'
    }
  });

  await request(`/capa/${capaId}/actions/${actionId}`, {
    method: 'PATCH',
    token: ownerToken,
    expectedStatus: 200,
    body: {
      status: 'Complete',
      completionEvidenceRef: 'EV-CAPA-001',
      completionNotes: 'Checklist gate enabled and verified.'
    }
  });

  await request(`/capa/${capaId}/effectiveness`, {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 201,
    body: {
      criteria: 'No checklist bypass in 3 consecutive releases',
      result: 'Pass',
      evidenceRef: 'EFF-CAPA-001'
    }
  });

  await request(`/capa/${capaId}/approve`, {
    method: 'POST',
    token: superToken,
    expectedStatus: 201,
    body: {
      stage: 'Closure',
      decision: 'Approve',
      comments: 'Closure approved after effectiveness pass.'
    }
  });

  const detail = await request(`/capa/${capaId}`, {
    token: superToken,
    expectedStatus: 200
  });

  if (detail.payload?.capa?.status !== 'Closed') {
    throw new Error(`Expected CAPA status Closed, got ${detail.payload?.capa?.status || 'unknown'}`);
  }

  if (!Array.isArray(detail.payload.timeline) || detail.payload.timeline.length === 0) {
    throw new Error('Expected CAPA timeline events to be present');
  }

  console.log('PASS: CAPA blueprint smoke suite');
}

run().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
