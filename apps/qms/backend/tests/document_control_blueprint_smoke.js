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

  const userEmail = `dc_owner_${runId}@pharaxis.local`;
  const password = 'Owner@123';

  const created = await request('/superadmin/users', {
    method: 'POST',
    token: superToken,
    expectedStatus: 201,
    body: {
      orgId: org.id,
      email: userEmail,
      fullName: 'Document Control Owner',
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

  const created = await request('/document-control/documents', {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 201,
    body: {
      title: `DC Blueprint Smoke ${runId}`,
      documentType: 'SOP',
      documentSubtype: 'Manufacturing Instruction',
      department: 'Quality',
      ownerUserId,
      reviewIntervalDays: 365,
      contentSummary: 'Initial controlled document baseline',
      reasonForChange: 'New enterprise rollout',
      siteCode: 'HYD-01',
      criticality: 'High',
      trainingRequired: true,
      controlledCopyRequired: true
    }
  });

  const documentId = created.payload.document?.id;
  const version1Id = created.payload.version?.id;
  if (!documentId || !version1Id) throw new Error('Document create failed');

  const revision = await request(`/document-control/documents/${documentId}/revisions`, {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 201,
    body: {
      contentSummary: 'Revision for workflow checks',
      reasonForChange: 'Formatting and control updates'
    }
  });

  const version2Id = revision.payload.version?.id;
  if (!version2Id) throw new Error('Revision not created');

  await request(`/document-control/documents/${documentId}/versions/${version2Id}/transition`, {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 200,
    body: {
      toStatus: 'Review',
      notes: 'Sent to quality review queue'
    }
  });

  const preview = await request(
    `/document-control/documents/${documentId}/versions/${version1Id}/controlled-preview`,
    {
      token: ownerToken,
      expectedStatus: 200
    }
  );

  if (!preview.payload.policy || typeof preview.payload.policy.downloadAllowed !== 'boolean') {
    throw new Error('Controlled preview policy missing');
  }

  await request(`/document-control/documents/${documentId}/versions/${version1Id}/acknowledge`, {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 201
  });

  await request(`/document-control/documents/${documentId}/access-policies`, {
    method: 'PUT',
    token: superToken,
    expectedStatus: 200,
    body: {
      policies: [
        { roleKey: 'admin', canView: true, canDownload: true, canPrint: true },
        { roleKey: 'author', canView: true, canDownload: false, canPrint: false },
        { roleKey: 'qa_reviewer', canView: true, canDownload: false, canPrint: false },
        { roleKey: 'approver', canView: true, canDownload: false, canPrint: false },
        { roleKey: 'viewer', canView: true, canDownload: false, canPrint: false }
      ]
    }
  });

  await request(`/document-control/documents/${documentId}/versions/${version1Id}/export`, {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 201,
    body: {
      exportFormat: 'PDF',
      binderJobReference: `BINDER-${runId}`
    }
  });

  const reviews = await request(`/document-control/documents/${documentId}/reviews`, {
    token: ownerToken,
    expectedStatus: 200
  });

  const pendingReview = (reviews.payload.reviews || []).find((item) => item.status === 'Pending');
  if (!pendingReview) throw new Error('No pending periodic review found');

  await request(`/document-control/documents/${documentId}/reviews/${pendingReview.id}/complete`, {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 200,
    body: {
      result: 'Completed',
      notes: 'Review passed without findings.'
    }
  });

  const detail = await request(`/document-control/documents/${documentId}`, {
    token: ownerToken,
    expectedStatus: 200
  });

  if (!Array.isArray(detail.payload.reviews) || detail.payload.reviews.length < 2) {
    throw new Error('Expected completed and next pending review records');
  }

  const timeline = await request(`/document-control/documents/${documentId}/timeline`, {
    token: ownerToken,
    expectedStatus: 200
  });

  if (!Array.isArray(timeline.payload.timeline) || timeline.payload.timeline.length === 0) {
    throw new Error('Expected timeline events to be present');
  }

  console.log('PASS: Document Control blueprint smoke suite');
}

run().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
