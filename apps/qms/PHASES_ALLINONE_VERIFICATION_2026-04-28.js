const API_BASE = 'http://127.0.0.1:3145/api';
const WEB_BASE = 'http://127.0.0.1:3146/qms';

const results = [];
let token = '';

function pushResult(phase, step, pass, detail) {
  results.push({ phase, step, pass, detail });
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  if (!res.ok) {
    const err = new Error(payload.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }

  return payload;
}

async function runStep(phase, step, fn) {
  try {
    const detail = await fn();
    pushResult(phase, step, true, detail || 'ok');
    return detail;
  } catch (error) {
    pushResult(phase, step, false, `${error.message}${error.status ? ` (status ${error.status})` : ''}`);
    return null;
  }
}

async function verifyFrontendRoute(path) {
  const res = await fetch(`${WEB_BASE}${path}`);
  if (!res.ok) throw new Error(`route not reachable: ${res.status}`);
  return `HTTP ${res.status}`;
}

async function main() {
  await runStep('Bootstrap', 'Health check', async () => {
    const payload = await request('/health', { auth: false });
    return payload.ok ? `ok=${payload.ok}` : 'health payload missing ok';
  });

  await runStep('Bootstrap', 'Superadmin login', async () => {
    const payload = await request('/auth/superadmin/login', {
      method: 'POST',
      auth: false,
      body: { userId: 'Superadmin', password: 'Manager@123' }
    });
    token = payload.accessToken;
    if (!token) throw new Error('No accessToken returned');
    return 'accessToken acquired';
  });

  await runStep('Bootstrap', 'Protected profile', async () => {
    const payload = await request('/protected/me');
    return payload.user?.email || 'profile loaded';
  });

  // Phase 1
  await runStep('Phase 1', 'Event hub API', async () => {
    const payload = await request('/intelligence/event-hub');
    return `keys=${Object.keys(payload.summary || {}).length}`;
  });

  for (const path of ['/dashboard', '/event-hub']) {
    await runStep('Phase 1', `Frontend route ${path}`, async () => verifyFrontendRoute(path));
  }

  // Create shared CAPA for linkage
  let capaId = null;
  await runStep('Shared', 'Create CAPA record for linkage', async () => {
    const payload = await request('/capa', {
      method: 'POST',
      body: {
        title: `Verification CAPA ${Date.now()}`,
        sourceType: 'Manual',
        classification: 'Corrective',
        severity: 3,
        occurrence: 2,
        detectability: 2
      }
    });
    capaId = payload.capa?.id;
    if (!capaId) throw new Error('CAPA id not returned');
    return capaId;
  });

  // Phase 2: Complaints
  let complaintId = null;
  await runStep('Phase 2', 'Create complaint', async () => {
    const payload = await request('/complaints', {
      method: 'POST',
      body: {
        sourceChannel: 'Customer',
        summary: `Complaint verification ${Date.now()}`,
        details: 'Batch label mismatch observed',
        customerName: 'Verification Lab',
        productName: 'Test Product',
        batchLotNo: 'LOT-VER-01',
        severity: 'High'
      }
    });
    complaintId = payload.complaint?.id;
    if (!complaintId) throw new Error('complaint id not returned');
    return complaintId;
  });

  await runStep('Phase 2', 'Update complaint', async () => {
    await request(`/complaints/${complaintId}`, {
      method: 'PATCH',
      body: { status: 'Investigation', severity: 'Critical' }
    });
    return 'updated';
  });

  await runStep('Phase 2', 'Link complaint to CAPA', async () => {
    await request(`/complaints/${complaintId}/link-capa`, {
      method: 'POST',
      body: { capaId }
    });
    return 'linked';
  });

  await runStep('Phase 2', 'List complaints', async () => {
    const payload = await request('/complaints');
    return `count=${(payload.complaints || []).length}`;
  });

  // Phase 2: Nonconformance
  let ncId = null;
  await runStep('Phase 2', 'Create nonconformance', async () => {
    const payload = await request('/nonconformance', {
      method: 'POST',
      body: {
        sourceType: 'Manufacturing',
        summary: `NC verification ${Date.now()}`,
        details: 'Seal integrity failed during inspection',
        itemReference: 'PKG-8821',
        severity: 'High'
      }
    });
    ncId = payload.nonconformance?.id;
    if (!ncId) throw new Error('nonconformance id not returned');
    return ncId;
  });

  await runStep('Phase 2', 'Update nonconformance', async () => {
    await request(`/nonconformance/${ncId}`, {
      method: 'PATCH',
      body: { status: 'Containment', disposition: 'Rework' }
    });
    return 'updated';
  });

  await runStep('Phase 2', 'Link nonconformance to CAPA', async () => {
    await request(`/nonconformance/${ncId}/link-capa`, {
      method: 'POST',
      body: { capaId }
    });
    return 'linked';
  });

  await runStep('Phase 2', 'List nonconformance', async () => {
    const payload = await request('/nonconformance');
    return `count=${(payload.nonconformances || []).length}`;
  });

  // Phase 2: Supplier Quality
  let supplierId = null;
  let scarId = null;
  await runStep('Phase 2', 'Create supplier', async () => {
    const payload = await request('/supplier-quality/suppliers', {
      method: 'POST',
      body: {
        supplierName: `Supplier Verification ${Date.now()}`,
        supplierType: 'RawMaterial',
        contactEmail: 'supplier.verification@example.com',
        riskLevel: 'Medium',
        qualificationStatus: 'Pending'
      }
    });
    supplierId = payload.supplier?.id;
    if (!supplierId) throw new Error('supplier id not returned');
    return supplierId;
  });

  await runStep('Phase 2', 'Create supplier audit', async () => {
    const payload = await request(`/supplier-quality/suppliers/${supplierId}/audits`, {
      method: 'POST',
      body: {
        auditType: 'Remote',
        outcome: 'InProgress',
        findingsCount: 2,
        summary: 'Verification supplier audit'
      }
    });
    if (!payload.audit?.id) throw new Error('supplier audit id not returned');
    return payload.audit.id;
  });

  await runStep('Phase 2', 'Create SCAR', async () => {
    const payload = await request(`/supplier-quality/suppliers/${supplierId}/scars`, {
      method: 'POST',
      body: {
        issueSummary: 'Recurring CoA mismatch',
        dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
      }
    });
    scarId = payload.scar?.id;
    if (!scarId) throw new Error('scar id not returned');
    return scarId;
  });

  await runStep('Phase 2', 'Update SCAR status', async () => {
    await request(`/supplier-quality/scars/${scarId}`, {
      method: 'PATCH',
      body: { status: 'Implementation' }
    });
    return 'updated';
  });

  await runStep('Phase 2', 'Supplier quality snapshot', async () => {
    const payload = await request('/supplier-quality');
    return `suppliers=${(payload.suppliers || []).length}, scars=${(payload.scars || []).length}`;
  });

  for (const path of ['/complaints', '/nonconformance', '/supplier-quality']) {
    await runStep('Phase 2', `Frontend route ${path}`, async () => verifyFrontendRoute(path));
  }

  // Phase 3: Risk
  let riskId = null;
  await runStep('Phase 3', 'Create risk', async () => {
    const payload = await request('/risk-management/register', {
      method: 'POST',
      body: {
        riskTitle: `Risk verification ${Date.now()}`,
        riskDomain: 'Process',
        severity: 4,
        occurrence: 3,
        detectability: 2,
        mitigationPlan: 'Add in-process verification gate'
      }
    });
    riskId = payload.risk?.id;
    if (!riskId) throw new Error('risk id not returned');
    return riskId;
  });

  await runStep('Phase 3', 'Update risk', async () => {
    await request(`/risk-management/register/${riskId}`, {
      method: 'PATCH',
      body: {
        status: 'Mitigating',
        severity: 4,
        occurrence: 2,
        detectability: 2
      }
    });
    return 'updated';
  });

  await runStep('Phase 3', 'Add risk review', async () => {
    const payload = await request(`/risk-management/register/${riskId}/review`, {
      method: 'POST',
      body: {
        reviewNotes: 'Mitigation plan accepted, residual exposure trending down',
        residualScore: 10
      }
    });
    return payload.review?.id || 'review-added';
  });

  // Training
  let trainingId = null;
  let assignmentId = null;
  await runStep('Phase 3', 'Create training catalog item', async () => {
    const code = `TRN-${Date.now().toString().slice(-6)}`;
    const payload = await request('/platform/training/catalog', {
      method: 'POST',
      body: {
        trainingCode: code,
        title: 'Deviation triage refresher',
        description: 'Short refresher for triage quality consistency'
      }
    });
    trainingId = payload.training?.id;
    if (!trainingId) throw new Error('training id not returned');
    return code;
  });

  await runStep('Phase 3', 'Assign training by role', async () => {
    const payload = await request('/platform/training/assignments', {
      method: 'POST',
      body: {
        trainingId,
        assignedRoleKey: 'qa_reviewer'
      }
    });
    assignmentId = payload.assignment?.id;
    if (!assignmentId) throw new Error('assignment id not returned');
    return assignmentId;
  });

  await runStep('Phase 3', 'Complete training assignment', async () => {
    await request(`/platform/training/assignments/${assignmentId}/complete`, {
      method: 'POST',
      body: { completionNotes: 'Completed in verification run' }
    });
    return 'completed';
  });

  await runStep('Phase 3', 'Read training catalog', async () => {
    const payload = await request('/platform/training/catalog');
    return `count=${(payload.trainingCatalog || []).length}`;
  });

  // Management review
  let reviewId = null;
  let reviewActionId = null;
  await runStep('Phase 3', 'Create management review', async () => {
    const payload = await request('/management-review', {
      method: 'POST',
      body: {
        reviewPeriodStart: '2026-01-01',
        reviewPeriodEnd: '2026-03-31',
        chairperson: 'QA Head',
        summary: 'Quarterly quality review',
        decisions: 'Increase supplier audit frequency for high-risk vendors'
      }
    });
    reviewId = payload.review?.id;
    if (!reviewId) throw new Error('review id not returned');
    return reviewId;
  });

  await runStep('Phase 3', 'Update management review', async () => {
    await request(`/management-review/${reviewId}`, {
      method: 'PATCH',
      body: { status: 'InReview' }
    });
    return 'updated';
  });

  await runStep('Phase 3', 'Create management action', async () => {
    const payload = await request(`/management-review/${reviewId}/actions`, {
      method: 'POST',
      body: {
        actionTitle: 'Roll out updated supplier quality checklist',
        dueDate: '2026-06-30'
      }
    });
    reviewActionId = payload.action?.id;
    if (!reviewActionId) throw new Error('review action id not returned');
    return reviewActionId;
  });

  await runStep('Phase 3', 'Close management action', async () => {
    await request(`/management-review/actions/${reviewActionId}`, {
      method: 'PATCH',
      body: {
        status: 'Closed',
        closureNotes: 'Checklist deployed to all active suppliers'
      }
    });
    return 'closed';
  });

  // Intelligence + integrations
  await runStep('Phase 3', 'Generate quality insights', async () => {
    const payload = await request('/intelligence/quality-insights');
    return payload.insights?.narrative?.[0] || 'insights generated';
  });

  await runStep('Phase 3', 'Read cached insights', async () => {
    const payload = await request('/intelligence/quality-insights/cached');
    return `cached=${(payload.cached || []).length}`;
  });

  await runStep('Phase 3', 'Configure PLM integration adapter', async () => {
    const payload = await request('/integrations/adapters/PLM', {
      method: 'PUT',
      body: {
        endpointUrl: 'https://plm.example.local/api',
        authMode: 'ApiKey',
        status: 'Connected',
        configJson: { project: 'QMS-VERIFICATION' }
      }
    });
    return payload.adapter?.status || 'configured';
  });

  await runStep('Phase 3', 'Trigger integration sync', async () => {
    const payload = await request('/integrations/adapters/PLM/sync', {
      method: 'POST',
      body: { jobType: 'OnDemandSync', payloadJson: { scope: 'quality-events' } }
    });
    return payload.job?.status || 'sync-triggered';
  });

  await runStep('Phase 3', 'Read integrations snapshot', async () => {
    const payload = await request('/integrations');
    return `adapters=${(payload.adapters || []).length}, jobs=${(payload.jobs || []).length}`;
  });

  for (const path of ['/risk-management', '/training-management', '/management-review', '/quality-insights', '/integrations']) {
    await runStep('Phase 3', `Frontend route ${path}`, async () => verifyFrontendRoute(path));
  }

  // Report
  const phaseGroups = ['Bootstrap', 'Phase 1', 'Shared', 'Phase 2', 'Phase 3'];
  const lines = [];
  lines.push('# QMS All-Phase Verification Report');
  lines.push('');
  lines.push(`- Date: ${new Date().toISOString()}`);
  lines.push('- Scope: Phase 1 + Phase 2 + Phase 3 delivered modules');
  lines.push('- Environment: local backend `127.0.0.1:3145`, frontend `127.0.0.1:3146/qms`');
  lines.push('');

  for (const phase of phaseGroups) {
    const items = results.filter((item) => item.phase === phase);
    if (!items.length) continue;
    lines.push(`## ${phase}`);
    lines.push('');
    lines.push('| Step | Result | Evidence |');
    lines.push('|---|---|---|');
    for (const item of items) {
      lines.push(`| ${item.step} | ${item.pass ? 'PASS' : 'FAIL'} | ${String(item.detail).replace(/\|/g, '\\|')} |`);
    }
    lines.push('');
  }

  const passCount = results.filter((item) => item.pass).length;
  const failCount = results.length - passCount;
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total checks: ${results.length}`);
  lines.push(`- Passed: ${passCount}`);
  lines.push(`- Failed: ${failCount}`);
  lines.push(`- Overall: ${failCount === 0 ? 'PASS' : 'PARTIAL PASS'}`);

  const fs = await import('fs/promises');
  const reportPath = 'apps/qms/PHASES_ALLINONE_VERIFICATION_REPORT_2026-04-28.md';
  await fs.writeFile(reportPath, `${lines.join('\n')}\n`, 'utf8');

  console.log(JSON.stringify({ reportPath, passCount, failCount, total: results.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
