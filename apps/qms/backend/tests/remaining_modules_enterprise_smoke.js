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

async function createAndLoginEnterpriseUser(superToken, runId) {
  const orgs = await request('/superadmin/orgs', {
    token: superToken,
    expectedStatus: 200
  });

  const org = (orgs.payload.orgs || []).find((row) => row.org_code === CREDS.orgCode);
  if (!org) throw new Error(`Org not found for code ${CREDS.orgCode}`);

  const userEmail = `enterprise_owner_${runId}@pharaxis.local`;
  const password = 'Owner@123';

  const created = await request('/superadmin/users', {
    method: 'POST',
    token: superToken,
    expectedStatus: 201,
    body: {
      orgId: org.id,
      email: userEmail,
      fullName: 'Enterprise Module Owner',
      password,
      roleKeys: ['admin', 'author', 'qa_reviewer', 'approver', 'viewer']
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

async function runDeviationFlow(ownerToken, superToken, ownerUserId, runId) {
  const created = await request('/deviations', {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 201,
    body: {
      title: `Deviation Enterprise ${runId}`,
      description: 'Temperature excursion in controlled storage.',
      deviationType: 'Environmental',
      classification: 'Major',
      dateOfOccurrence: '2026-04-14',
      department: 'Quality',
      dueDate: '2026-04-25'
    }
  });

  const deviationId = created.payload.deviation?.id;
  if (!deviationId) throw new Error('Deviation create failed');

  await request(`/deviations/${deviationId}/triage`, {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 200,
    body: {
      triageSummary: 'Potential product impact requires full investigation.',
      impactLevel: 'High',
      dueDate: '2026-04-24'
    }
  });

  await request(`/deviations/${deviationId}/containment`, {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 201,
    body: {
      actionText: 'Quarantined affected lots and stopped dispatch.'
    }
  });

  await request(`/deviations/${deviationId}/investigation`, {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 201,
    body: {
      investigatorUserId: ownerUserId,
      dueDate: '2026-04-23',
      findings: 'Cooling failure due to calibration drift.',
      rootCause: 'PM checklist gap'
    }
  });

  await request(`/deviations/${deviationId}/qa-review`, {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 200,
    body: {
      decision: 'Approve',
      reviewNotes: 'Accept investigation and proceed for closure.',
      reportabilityStatus: 'No'
    }
  });

  await request(`/deviations/${deviationId}/close`, {
    method: 'POST',
    token: superToken,
    expectedStatus: 200,
    body: {
      reportabilityStatus: 'No',
      reportabilityReason: 'No patient product released.',
      closureSummary: 'Deviation controlled and closed.'
    }
  });

  const detail = await request(`/deviations/${deviationId}`, {
    token: ownerToken,
    expectedStatus: 200
  });

  if (!Array.isArray(detail.payload.history) || detail.payload.history.length === 0) {
    throw new Error('Deviation timeline/history missing');
  }

  return deviationId;
}

async function runAuditFlow(ownerToken, superToken, runId, capaId) {
  const created = await request('/audits', {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 201,
    body: {
      auditTitle: `Audit Enterprise ${runId}`,
      auditType: 'Internal',
      scope: 'Deviation-CAPA effectiveness review',
      plannedDate: '2026-04-18'
    }
  });

  const auditId = created.payload.audit?.id;
  if (!auditId) throw new Error('Audit create failed');

  await request(`/audits/${auditId}/start`, {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 200
  });

  const finding = await request(`/audits/${auditId}/findings`, {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 201,
    body: {
      description: 'SOP revision training lag observed.',
      findingType: 'Major',
      department: 'Quality',
      processArea: 'Document Control',
      dueDate: '2026-04-28',
      responseDueDate: '2026-04-22'
    }
  });

  const findingId = finding.payload.finding?.id;
  if (!findingId) throw new Error('Finding create failed');

  await request(`/audits/${auditId}/findings/${findingId}/respond`, {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 201,
    body: {
      responseText: 'Targeted retraining initiated for impacted users.',
      proposedAction: 'Training completion by due date.'
    }
  });

  await request(`/audits/${auditId}/findings/${findingId}/link-capa`, {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 201,
    body: {
      capaId
    }
  });

  await request(`/audits/${auditId}/findings/${findingId}/close`, {
    method: 'POST',
    token: superToken,
    expectedStatus: 200,
    body: {
      closureSummary: 'Corrective action completed and verified.',
      effectivenessResult: 'Effective'
    }
  });

  await request(`/audits/${auditId}/close`, {
    method: 'POST',
    token: superToken,
    expectedStatus: 200,
    body: {
      closureSummary: 'Audit closed after finding closure.'
    }
  });

  const detail = await request(`/audits/${auditId}`, {
    token: ownerToken,
    expectedStatus: 200
  });

  if (!Array.isArray(detail.payload.timeline) || detail.payload.timeline.length === 0) {
    throw new Error('Audit timeline missing');
  }

  return { auditId, findingId };
}

async function runValidationFlow(ownerToken, superToken, runId) {
  const system = await request('/validation/systems', {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 201,
    body: {
      systemName: `CSV System ${runId}`,
      vendor: 'Pharaxis',
      version: '2.0.0',
      gampCategory: '5',
      riskLevel: 'High',
      validationScope: 'End-to-end transaction validation',
      complianceImpact: 'GxP critical'
    }
  });

  const systemId = system.payload.system?.id;
  if (!systemId) throw new Error('Validation system create failed');

  const requirement = await request(`/validation/systems/${systemId}/requirements`, {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 201,
    body: {
      requirementCode: `URS-${runId}`,
      requirementType: 'URS',
      description: 'System must enforce role-based approvals',
      riskLevel: 'High'
    }
  });

  const requirementId = requirement.payload.requirement?.id;
  if (!requirementId) throw new Error('Requirement create failed');

  const plan = await request(`/validation/systems/${systemId}/plans`, {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 201,
    body: {
      scope: 'Core workflows',
      approach: 'Risk-based test execution'
    }
  });

  const planId = plan.payload.plan?.id;
  if (!planId) throw new Error('Validation plan create failed');

  const protocol = await request(`/validation/plans/${planId}/protocols`, {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 201,
    body: {
      protocolName: `OQ Protocol ${runId}`
    }
  });

  const protocolId = protocol.payload.protocol?.id;
  if (!protocolId) throw new Error('Protocol create failed');

  const script = await request(`/validation/protocols/${protocolId}/scripts`, {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 201,
    body: {
      scriptName: 'Approval SoD check',
      expectedResult: 'Creator cannot final approve'
    }
  });

  const stepId = script.payload.step?.id;
  if (!stepId) throw new Error('Validation step create failed');

  await request(`/validation/steps/${stepId}/execute`, {
    method: 'PATCH',
    token: ownerToken,
    expectedStatus: 200,
    body: {
      actualResult: 'Rule blocked creator approval successfully',
      outcome: 'Pass',
      evidenceRef: `VAL-EV-${runId}`
    }
  });

  await request(`/validation/systems/${systemId}/traceability`, {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 201,
    body: {
      requirementId,
      stepId,
      traceStatus: 'Pass',
      notes: 'URS trace completed'
    }
  });

  await request(`/validation/systems/${systemId}/complete`, {
    method: 'POST',
    token: superToken,
    expectedStatus: 200,
    body: {
      summary: 'Validation evidence reviewed and approved.'
    }
  });

  const detail = await request(`/validation/systems/${systemId}`, {
    token: ownerToken,
    expectedStatus: 200
  });

  if (!Array.isArray(detail.payload.timeline) || detail.payload.timeline.length === 0) {
    throw new Error('Validation timeline missing');
  }

  return systemId;
}

async function runChangeControlFlow(ownerToken, superToken, ownerUserId, runId) {
  const created = await request('/change-control', {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 201,
    body: {
      title: `Enterprise Change ${runId}`,
      changeType: 'Major',
      reason: 'Enable enterprise workflow controls',
      ownerUserId,
      plannedStartDate: '2026-04-20',
      plannedEndDate: '2026-04-28',
      riskLevel: 'High',
      cabRequired: true
    }
  });

  const changeId = created.payload.change?.id;
  if (!changeId) throw new Error('Change request create failed');

  await request(`/change-control/${changeId}/impact-assessment`, {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 201,
    body: {
      assessmentSummary: 'Impacts approvals, training, and traceability.',
      impactedModules: ['DocumentControl', 'CAPA', 'Training'],
      riskLevel: 'High'
    }
  });

  await request(`/change-control/${changeId}/cab-review`, {
    method: 'POST',
    token: superToken,
    expectedStatus: 201,
    body: {
      decision: 'Approve',
      comments: 'CAB approved for execution.'
    }
  });

  await request(`/change-control/${changeId}/approvals`, {
    method: 'POST',
    token: superToken,
    expectedStatus: 201,
    body: {
      decision: 'Approve',
      comments: 'Final approval granted.'
    }
  });

  await request(`/change-control/${changeId}/implementation`, {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 201,
    body: {
      stepTitle: 'Deploy enterprise feature set',
      stepStatus: 'Completed',
      dueDate: '2026-04-24',
      evidenceRef: `CC-EV-${runId}`
    }
  });

  await request(`/change-control/${changeId}/close`, {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 200,
    body: {
      closureSummary: 'Deployment completed and verified.',
      effectivenessResult: 'Effective'
    }
  });

  const detail = await request(`/change-control/${changeId}`, {
    token: ownerToken,
    expectedStatus: 200
  });

  if (!Array.isArray(detail.payload.timeline) || detail.payload.timeline.length === 0) {
    throw new Error('Change control timeline missing');
  }

  return changeId;
}

async function runPlatformFlow(ownerToken, runId, ownerUserId, changeId) {
  const training = await request('/platform/training/catalog', {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 201,
    body: {
      trainingCode: `TRN-${runId}`,
      title: 'Enterprise change awareness',
      description: 'Mandatory awareness for regulated changes',
      sourceModule: 'change_control',
      sourceTable: 'cc_change_records',
      sourceId: changeId
    }
  });

  const trainingId = training.payload.training?.id;
  if (!trainingId) throw new Error('Training catalog create failed');

  const assignment = await request('/platform/training/assignments', {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 201,
    body: {
      trainingId,
      assignedUserId: ownerUserId,
      dueDate: '2026-04-30'
    }
  });

  const assignmentId = assignment.payload.assignment?.id;
  if (!assignmentId) throw new Error('Training assignment create failed');

  await request(`/platform/training/assignments/${assignmentId}/complete`, {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 200,
    body: {
      completionNotes: 'Completed by smoke suite.'
    }
  });

  const trace = await request('/platform/trace-links?limit=20', {
    token: ownerToken,
    expectedStatus: 200
  });

  if (!Array.isArray(trace.payload.traceLinks)) {
    throw new Error('Trace links response invalid');
  }
}

async function run() {
  const runId = Date.now().toString();
  const superToken = await loginSuperadmin();
  const { ownerToken, ownerUserId } = await createAndLoginEnterpriseUser(superToken, runId);

  const capa = await request('/capa', {
    method: 'POST',
    token: ownerToken,
    expectedStatus: 201,
    body: {
      title: `Enterprise Linked CAPA ${runId}`,
      sourceType: 'Manual',
      classification: 'Corrective',
      ownerUserId,
      dueDate: '2026-05-05',
      severity: 3,
      occurrence: 3,
      detectability: 2
    }
  });

  const capaId = capa.payload.capa?.id;
  if (!capaId) throw new Error('CAPA create failed for linkage');

  await runDeviationFlow(ownerToken, superToken, ownerUserId, runId);
  await runAuditFlow(ownerToken, superToken, runId, capaId);
  await runValidationFlow(ownerToken, superToken, runId);
  const changeId = await runChangeControlFlow(ownerToken, superToken, ownerUserId, runId);
  await runPlatformFlow(ownerToken, runId, ownerUserId, changeId);

  console.log('PASS: Remaining enterprise modules smoke suite');
}

run().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
