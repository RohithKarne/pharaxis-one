const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3160/api';
const CREDS = {
  email: process.env.QMS_EMAIL || 'admin@pharaxis.local',
  password: process.env.QMS_PASSWORD || 'Admin@123',
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

  if (response.status !== expectedStatus) {
    throw new Error(
      `Expected ${expectedStatus} for ${method} ${path}, got ${response.status}: ${JSON.stringify(payload)}`
    );
  }

  return payload;
}

function printSummary(summary) {
  console.log(`SPRINT1_UAT_SUMMARY: ${JSON.stringify(summary)}`);
}

async function run() {
  const runId = Date.now().toString();
  const checks = [];

  function pass(name, details = {}) {
    checks.push({ name, status: 'pass', details });
  }

  const login = await request('/auth/login', {
    method: 'POST',
    body: CREDS,
    expectedStatus: 200
  });

  if (!login.accessToken || !login.user?.id) {
    throw new Error('Login did not return accessToken/user');
  }
  const token = login.accessToken;
  const userId = login.user.id;
  pass('UAT_01_Login', { userId });

  const dc = await request('/document-control/documents', {
    method: 'POST',
    token,
    expectedStatus: 201,
    body: {
      title: `UAT SOP ${runId}`,
      documentType: 'SOP',
      department: 'Quality',
      ownerUserId: userId,
      reviewIntervalDays: 365,
      contentSummary: 'UAT controlled document baseline'
    }
  });
  pass('UAT_02_Document_Create', { documentId: dc.document.id, versionId: dc.version.id });

  await request(`/document-control/documents/${dc.document.id}/versions/${dc.version.id}/transition`, {
    method: 'POST',
    token,
    expectedStatus: 200,
    body: { toStatus: 'Review', notes: 'Internal UAT flow' }
  });
  pass('UAT_03_Document_Transition_Review');

  const [documentList, capaList, deviationList, auditList, validationList] = await Promise.all([
    request('/document-control/documents', { token, expectedStatus: 200 }),
    request('/capa', { token, expectedStatus: 200 }),
    request('/deviations', { token, expectedStatus: 200 }),
    request('/audits', { token, expectedStatus: 200 }),
    request('/validation/systems', { token, expectedStatus: 200 })
  ]);

  const currentDocumentCount = Array.isArray(documentList.documents) ? documentList.documents.length : 0;
  const currentCapaCount = Array.isArray(capaList.capaRecords) ? capaList.capaRecords.length : 0;
  const currentDeviationCount = Array.isArray(deviationList.deviations)
    ? deviationList.deviations.length
    : 0;
  const currentAuditCount = Array.isArray(auditList.audits) ? auditList.audits.length : 0;
  const currentValidationCount = Array.isArray(validationList.systems)
    ? validationList.systems.length
    : 0;

  // Ensure binder "50 records <= 60s" target scenario has enough data.
  // We seed missing records as CAPA entries since that path is fastest and already in-scope.
  const targetTotalRecords = 50;
  const currentTotalRecords =
    currentDocumentCount +
    currentCapaCount +
    currentDeviationCount +
    currentAuditCount +
    currentValidationCount;
  const needed = Math.max(0, targetTotalRecords - currentTotalRecords);

  for (let i = 0; i < needed; i += 1) {
    await request('/capa', {
      method: 'POST',
      token,
      expectedStatus: 201,
      body: {
        title: `UAT PERF CAPA ${runId}-${i + 1}`,
        sourceType: 'Manual',
        classification: 'Corrective',
        ownerUserId: userId
      }
    });
  }
  pass('UAT_04_Perf_Seed_Records', {
    seededCapaRecords: needed,
    currentTotalRecordsBeforeSeed: currentTotalRecords
  });

  const binder = await request('/audits/binder/generate', {
    method: 'POST',
    token,
    expectedStatus: 201,
    body: {}
  });

  const durationMs = Number(binder.job?.duration_ms || 0);
  const totalRecords = Number(binder.job?.total_records || 0);

  if (binder.job?.job_status !== 'Completed') {
    throw new Error('Binder generation did not complete');
  }
  if (totalRecords < 50) {
    throw new Error(`Binder total_records below target: ${totalRecords}`);
  }
  if (durationMs > 60000) {
    throw new Error(`Binder duration SLA failed: ${durationMs}ms`);
  }
  pass('UAT_05_Binder_50_Records_Performance', { totalRecords, durationMs });

  const summary = {
    runId,
    baseUrl: BASE_URL,
    decision: 'GO',
    totalChecks: checks.length,
    passed: checks.length,
    failed: 0,
    checks
  };

  printSummary(summary);
}

run().catch((error) => {
  console.error(`SPRINT1_UAT_FAILURE: ${error.message}`);
  process.exit(1);
});
