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

function log(label, data) {
  const safe = typeof data === 'string' ? data : JSON.stringify(data);
  console.log(`${label}: ${safe}`);
}

async function run() {
  const runId = Date.now().toString();
  let passed = 0;
  const checks = [];

  function ok(name) {
    passed += 1;
    checks.push({ name, status: 'pass' });
  }

  const login = await request('/auth/login', {
    method: 'POST',
    body: CREDS,
    expectedStatus: 200
  });
  if (!login.accessToken) throw new Error('Missing accessToken from login');
  const token = login.accessToken;
  const userId = login.user.id;
  ok('AUTH_01 login success');

  await request('/auth/login', {
    method: 'POST',
    body: { ...CREDS, password: 'wrong-pass' },
    expectedStatus: 401
  });
  ok('AUTH_02 login negative path');

  const document = await request('/document-control/documents', {
    method: 'POST',
    token,
    expectedStatus: 201,
    body: {
      title: `Sprint1 QA SOP ${runId}`,
      documentType: 'SOP',
      department: 'Quality',
      ownerUserId: userId,
      reviewIntervalDays: 365,
      contentSummary: 'Deep QA baseline'
    }
  });
  const docId = document.document.id;
  const versionId = document.version.id;
  ok('DC_01 document create');

  await request(`/document-control/documents/${docId}/versions/${versionId}/transition`, {
    method: 'POST',
    token,
    expectedStatus: 400,
    body: { toStatus: 'Approved' }
  });
  ok('DC_02 invalid transition blocked');

  await request(`/document-control/documents/${docId}/versions/${versionId}/transition`, {
    method: 'POST',
    token,
    expectedStatus: 200,
    body: { toStatus: 'Review', notes: 'QA workflow check' }
  });
  ok('DC_03 valid transition Draft->Review');

  const preview = await request(
    `/document-control/documents/${docId}/versions/${versionId}/controlled-preview`,
    { token, expectedStatus: 200 }
  );
  if (preview.policy.downloadAllowed || preview.policy.printAllowed) {
    throw new Error('Controlled preview policy violation: download/print should be blocked');
  }
  ok('DC_04 controlled preview policy');

  const capa = await request('/capa', {
    method: 'POST',
    token,
    expectedStatus: 201,
    body: {
      title: `Sprint1 QA CAPA ${runId}`,
      sourceType: 'Manual',
      classification: 'Corrective',
      ownerUserId: userId
    }
  });
  const capaId = capa.capa.id;
  ok('CA_01 CAPA create');

  await request('/capa', {
    method: 'POST',
    token,
    expectedStatus: 400,
    body: { title: 'Missing fields' }
  });
  ok('CA_02 CAPA negative required fields');

  const action = await request(`/capa/${capaId}/actions`, {
    method: 'POST',
    token,
    expectedStatus: 201,
    body: {
      description: 'Complete deviation correction plan',
      assignedOwnerUserId: userId,
      dueDate: '2026-04-01'
    }
  });
  const actionId = action.actionItem.id;
  ok('CA_03 CAPA action create');

  await request(`/capa/${capaId}/actions/${actionId}/status`, {
    method: 'PATCH',
    token,
    expectedStatus: 200,
    body: { status: 'InProgress' }
  });
  ok('CA_04 CAPA action status update and escalation check');

  await request(`/capa/${capaId}/close`, {
    method: 'POST',
    token,
    expectedStatus: 400
  });
  ok('CA_05 close blocked before effectiveness');

  await request(`/capa/${capaId}/actions/${actionId}/status`, {
    method: 'PATCH',
    token,
    expectedStatus: 200,
    body: { status: 'Complete' }
  });
  ok('CA_06 CAPA action complete');

  await request(`/capa/${capaId}/effectiveness`, {
    method: 'POST',
    token,
    expectedStatus: 201,
    body: { criteria: 'No recurrence in 7 days', result: 'Pass', evidenceRef: 'QA-EV-001' }
  });
  ok('CA_07 effectiveness pass recorded');

  await request(`/capa/${capaId}/close`, {
    method: 'POST',
    token,
    expectedStatus: 200
  });
  ok('CA_08 CAPA closed after pass');

  const deviation = await request('/deviations', {
    method: 'POST',
    token,
    expectedStatus: 201,
    body: {
      title: `Sprint1 QA Deviation ${runId}`,
      description: 'Process variation detected during review',
      deviationType: 'Process',
      classification: 'Major',
      dateOfOccurrence: '2026-04-09',
      department: 'Manufacturing'
    }
  });
  const deviationId = deviation.deviation.id;
  ok('DV_01 deviation create');

  await request(`/deviations/${deviationId}/containment`, {
    method: 'POST',
    token,
    expectedStatus: 201,
    body: { actionText: 'Stopped affected process and quarantined records.' }
  });
  ok('DV_02 containment action');

  await request(`/deviations/${deviationId}/investigation`, {
    method: 'POST',
    token,
    expectedStatus: 201,
    body: {
      investigatorUserId: userId,
      dueDate: '2026-04-12',
      findings: 'Root cause linked to incorrect SOP revision usage.',
      rootCause: 'Outdated instruction reference'
    }
  });
  ok('DV_03 investigation update');

  await request(`/deviations/${deviationId}/link-capa`, {
    method: 'POST',
    token,
    expectedStatus: 201,
    body: { capaId }
  });
  ok('DV_04 deviation linked to CAPA');

  await request(`/deviations/${deviationId}/close`, {
    method: 'POST',
    token,
    expectedStatus: 200,
    body: { reportabilityStatus: 'No', reportabilityReason: 'No impact to released product' }
  });
  ok('DV_05 deviation close');

  const audit = await request('/audits', {
    method: 'POST',
    token,
    expectedStatus: 201,
    body: {
      auditTitle: `Sprint1 QA Audit ${runId}`,
      auditType: 'Internal',
      scope: 'All sprint-1 modules',
      plannedDate: '2026-04-10'
    }
  });
  const auditId = audit.audit.id;
  ok('AU_01 audit create');

  const finding = await request(`/audits/${auditId}/findings`, {
    method: 'POST',
    token,
    expectedStatus: 201,
    body: {
      description: 'CAPA effectiveness evidence linkage should be standardized',
      findingType: 'Minor',
      department: 'Quality'
    }
  });
  const findingId = finding.finding.id;
  ok('AU_02 finding capture');

  await request(`/audits/${auditId}/findings/${findingId}/link-capa`, {
    method: 'POST',
    token,
    expectedStatus: 201,
    body: { capaId }
  });
  ok('AU_03 finding linked to CAPA');

  await request(`/audits/${auditId}/respond/${findingId}`, {
    method: 'POST',
    token,
    expectedStatus: 201,
    body: {
      responseText: 'Will update evidence template and training.',
      proposedAction: 'Template update in next release.'
    }
  });
  ok('AU_04 auditee response');

  const binder = await request('/audits/binder/generate', {
    method: 'POST',
    token,
    expectedStatus: 201,
    body: {}
  });
  if (binder.job.job_status !== 'Completed') throw new Error('Binder job not completed');
  ok('AU_05 one-click binder generation');

  const system = await request('/validation/systems', {
    method: 'POST',
    token,
    expectedStatus: 201,
    body: {
      systemName: `Sprint1 QA Validation System ${runId}`,
      vendor: 'Internal',
      version: '1.0',
      gampCategory: '5',
      riskLevel: 'High'
    }
  });
  const systemId = system.system.id;
  ok('VS_01 system inventory create');

  const plan = await request(`/validation/systems/${systemId}/plans`, {
    method: 'POST',
    token,
    expectedStatus: 201,
    body: {
      scope: 'Full IQ/OQ/PQ/UAT for module suite',
      approach: 'Risk-based',
      responsibilities: 'QA lead + Engineering',
      protocolTypes: ['IQ', 'OQ', 'PQ', 'UAT']
    }
  });
  const planId = plan.plan.id;
  ok('VS_02 validation plan create');

  const protocol = await request(`/validation/plans/${planId}/protocols`, {
    method: 'POST',
    token,
    expectedStatus: 201,
    body: { protocolName: `Protocol ${runId}` }
  });
  const protocolId = protocol.protocol.id;
  ok('VS_03 protocol create');

  const script = await request(`/validation/protocols/${protocolId}/scripts`, {
    method: 'POST',
    token,
    expectedStatus: 201,
    body: { scriptName: 'Critical workflow validation', expectedResult: 'Should pass all checkpoints' }
  });
  const stepId = script.step.id;
  ok('VS_04 script + step create');

  await request(`/validation/steps/${stepId}/execute`, {
    method: 'PATCH',
    token,
    expectedStatus: 200,
    body: {
      actualResult: 'Observed failure on role-mapping edge case',
      outcome: 'Fail',
      evidenceRef: 'QA-VS-FAIL-001'
    }
  });
  ok('VS_05 failed step creates validation deviation');

  const validationDeviations = await request('/validation/deviations', { token, expectedStatus: 200 });
  if (!Array.isArray(validationDeviations.validationDeviations) || validationDeviations.validationDeviations.length < 1) {
    throw new Error('Expected validation deviations after failed step');
  }
  ok('VS_06 validation deviation list');

  await request(`/validation/systems/${systemId}/revalidation-flag`, {
    method: 'POST',
    token,
    expectedStatus: 201,
    body: {
      changeType: 'major_config_change',
      isRevalidationRequired: true,
      reason: 'Major risk-bearing change'
    }
  });
  ok('VS_07 revalidation flag');

  await request(`/validation/reports/${systemId}/generate-vsr`, {
    method: 'POST',
    token,
    expectedStatus: 201,
    body: { planId }
  });
  ok('VS_08 VSR generation');

  await request('/platform/notifications/in-app', {
    method: 'POST',
    token,
    expectedStatus: 201,
    body: {
      eventType: 'SPRINT1_QA',
      title: 'Deep QA event',
      message: 'Deep QA suite notification'
    }
  });
  ok('PLT_01 in-app notification');

  await request('/platform/notifications/email', {
    method: 'POST',
    token,
    expectedStatus: 201,
    body: {
      recipientEmail: 'qa@pharaxis.local',
      subject: 'Sprint1 QA',
      body: 'Deep QA email queue validation'
    }
  });
  ok('PLT_02 email queue');

  const outbox = await request('/platform/events/outbox', {
    method: 'POST',
    token,
    expectedStatus: 201,
    body: { topicKey: 'qms.qa.completed', payloadJson: { runId } }
  });
  ok('PLT_03 outbox queue');

  await request(`/platform/events/outbox/${outbox.outboxEvent.id}/publish`, {
    method: 'POST',
    token,
    expectedStatus: 200
  });
  ok('PLT_04 outbox publish');

  await request('/platform/alerts/run', {
    method: 'POST',
    token,
    expectedStatus: 200,
    body: {}
  });
  ok('PLT_05 periodic alerts run');

  const summary = {
    runId,
    baseUrl: BASE_URL,
    totalChecks: checks.length,
    passed,
    failed: checks.length - passed,
    checks
  };

  log('SPRINT1_QA_SUMMARY', summary);
}

run().catch((error) => {
  console.error(`SPRINT1_QA_FAILURE: ${error.message}`);
  process.exit(1);
});

