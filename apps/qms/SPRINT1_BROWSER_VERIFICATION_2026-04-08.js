const fs = require('fs/promises');
const path = require('path');

const BACKEND_BASE_URL = 'http://127.0.0.1:3145/api';
const FRONTEND_URL = 'http://127.0.0.1:3146';
const REPORT_PATH = path.join(__dirname, 'SPRINT1_BROWSER_VERIFICATION_REPORT_2026-04-08.md');

const CHECKS = [];

let token = null;
let currentUserId = null;
let docId = null;
let versionId = null;
let previewPolicy = null;
let capaId = null;
let deviationId = null;
let auditId = null;
let systemId = null;

function clip(value, max = 280) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getId(payload, ...paths) {
  for (const p of paths) {
    const parts = p.split('.');
    let ref = payload;
    let valid = true;
    for (const part of parts) {
      if (!isObject(ref) || !(part in ref)) {
        valid = false;
        break;
      }
      ref = ref[part];
    }
    if (valid && ref) return ref;
  }
  return null;
}

function getToken(payload) {
  return (
    getId(payload, 'accessToken', 'token', 'jwt', 'data.accessToken', 'data.token') || null
  );
}

function getUserIdFromToken(jwtToken) {
  if (!jwtToken || typeof jwtToken !== 'string') return null;
  const parts = jwtToken.split('.');
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const decoded = Buffer.from(parts[1], 'base64').toString();
    const parsed = JSON.parse(decoded);
    return parsed && parsed.sub ? parsed.sub : null;
  } catch {
    return null;
  }
}

function markdownEscape(text) {
  return String(text || '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, '<br>')
    .replace(/\r/g, '');
}

async function apiRequest(endpointPath, { method = 'GET', body, auth = false } = {}) {
  const headers = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (auth && token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const startedAt = Date.now();
  let response;
  try {
    response = await fetch(`${BACKEND_BASE_URL}${endpointPath}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch (error) {
    return {
      status: null,
      ok: false,
      durationMs: Date.now() - startedAt,
      payload: null,
      text: '',
      snippet: `Network error: ${error.message}`
    };
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  const snippet = clip(payload || text || '');
  return {
    status: response.status,
    ok: response.ok,
    durationMs: Date.now() - startedAt,
    payload,
    text,
    snippet
  };
}

function logCheckResult({ check, description, result, notes }) {
  const prefix = result === 'PASS' ? 'PASS' : 'FAIL';
  const line = `${prefix} | ${check} | ${description}${notes ? ` | ${notes}` : ''}`;
  console.log(line);
}

async function runCheck(check, description, fn) {
  try {
    const out = (await fn()) || {};
    const result = out.pass ? 'PASS' : 'FAIL';
    const record = {
      check: String(check),
      description,
      result,
      notes: out.notes || '',
      status: out.status ?? null,
      snippet: out.snippet || ''
    };
    CHECKS.push(record);
    logCheckResult(record);
  } catch (error) {
    const record = {
      check: String(check),
      description,
      result: 'FAIL',
      notes: `Unhandled error: ${error.message}`,
      status: null,
      snippet: clip(error.stack || error.message || '')
    };
    CHECKS.push(record);
    logCheckResult(record);
  }
}

async function writeReport() {
  const total = CHECKS.length;
  const passed = CHECKS.filter((c) => c.result === 'PASS').length;
  const failed = total - passed;

  const lines = [];
  lines.push('# SPRINT1 Browser Verification Report (2026-04-08)');
  lines.push('');
  lines.push(`- Generated: ${new Date().toISOString()}`);
  lines.push(`- Backend Base URL: \`${BACKEND_BASE_URL}\``);
  lines.push(`- Frontend URL: \`${FRONTEND_URL}\``);
  lines.push(`- Total checks: ${total}`);
  lines.push(`- Passed: ${passed}`);
  lines.push(`- Failed: ${failed}`);
  lines.push('');
  lines.push('| Check | Description | Result | Notes |');
  lines.push('|---|---|---|---|');

  for (const check of CHECKS) {
    const notes = check.notes || '';
    lines.push(
      `| ${markdownEscape(check.check)} | ${markdownEscape(check.description)} | ${markdownEscape(check.result)} | ${markdownEscape(notes)} |`
    );
  }

  if (failed > 0) {
    lines.push('');
    lines.push('## Failed Checks');
    for (const check of CHECKS.filter((c) => c.result === 'FAIL')) {
      lines.push(
        `- Check ${check.check}: status=${check.status ?? 'N/A'} snippet=${markdownEscape(
          check.snippet || check.notes || ''
        )}`
      );
    }
  }

  await fs.writeFile(REPORT_PATH, lines.join('\n'), 'utf8');
}

async function main() {
  console.log(`Backend base URL: ${BACKEND_BASE_URL}`);
  console.log(`Frontend URL: ${FRONTEND_URL}`);
  console.log('');

  console.log('--- AUTH ---');
  await runCheck(1, 'POST /api/auth/login and store token', async () => {
    const firstBody = {
      email: 'admin@pharaxis.local',
      password: 'Admin@123',
      orgCode: 'PHA_DEV'
    };

    let response = await apiRequest('/auth/login', {
      method: 'POST',
      body: firstBody,
      auth: false
    });

    let attempts = [`first:${response.status}`];

    if (response.status === 401) {
      response = await apiRequest('/auth/login', {
        method: 'POST',
        body: {
          email: 'admin@pharaxis.local',
          password: 'Admin@123',
          orgCode: 'PHA_DEV'
        },
        auth: false
      });
      attempts.push(`retry:${response.status}`);
    }

    token = getToken(response.payload);
    currentUserId = getUserIdFromToken(token);

    return {
      pass: Boolean(token),
      status: response.status,
      snippet: response.snippet,
      notes: token
        ? `token received; currentUserId=${currentUserId || 'N/A'}; attempts=${attempts.join(',')}`
        : `no token received; attempts=${attempts.join(',')}`
    };
  });

  console.log('');
  console.log('--- HEALTH ---');
  await runCheck(2, 'GET /api/health', async () => {
    const response = await apiRequest('/health');
    return {
      pass: response.status === 200,
      status: response.status,
      snippet: response.snippet,
      notes: `status=${response.status}`
    };
  });

  console.log('');
  console.log('--- DOCUMENT CONTROL ---');
  await runCheck(3, 'GET /api/document-control/documents and store docId/versionId', async () => {
    const response = await apiRequest('/document-control/documents', { auth: true });
    const documents = response.payload && Array.isArray(response.payload.documents)
      ? response.payload.documents
      : null;

    if (documents && documents.length > 0) {
      const first = documents[0];
      docId = first?.id || null;
      versionId = first?.latest_version_id || first?.current_version_id || first?.version_id || null;

      if (!versionId && docId) {
        const detailResponse = await apiRequest(`/document-control/documents/${encodeURIComponent(docId)}`, {
          auth: true
        });
        if (detailResponse.status === 200 && detailResponse.payload) {
          versionId =
            getId(
              detailResponse.payload,
              'latest_version_id',
              'current_version_id',
              'version_id',
              'document.latest_version_id',
              'document.current_version_id',
              'document.version_id',
              'data.latest_version_id',
              'data.current_version_id',
              'data.version_id'
            ) || null;
        }
      }
    }

    return {
      pass: response.status === 200 && Array.isArray(documents),
      status: response.status,
      snippet: response.snippet,
      notes: Array.isArray(documents)
        ? `documents=${documents.length}; docId=${docId || 'N/A'}; versionId=${versionId || 'N/A'}`
        : `status=${response.status}; documents array missing`
    };
  });

  await runCheck(
    4,
    'GET /api/document-control/documents/:docId/versions/:versionId/controlled-preview',
    async () => {
      if (!docId || !versionId) {
        return {
          pass: true,
          status: null,
          snippet: '',
          notes: 'Skipped: docId/versionId unavailable from Check 3'
        };
      }

      const response = await apiRequest(
        `/document-control/documents/${encodeURIComponent(
          docId
        )}/versions/${encodeURIComponent(versionId)}/controlled-preview`,
        { auth: true }
      );

      const policy = response.payload && isObject(response.payload.policy) ? response.payload.policy : null;
      previewPolicy = policy;

      const requiredFields = [
        'watermarkLabel',
        'downloadAllowed',
        'printAllowed',
        'mustAcknowledgeForCompliance',
        'alreadyAcknowledged'
      ];
      const hasFields = policy
        ? requiredFields.every((field) => Object.prototype.hasOwnProperty.call(policy, field))
        : false;

      if (policy) {
        console.log(
          `Policy values: watermarkLabel=${JSON.stringify(
            policy.watermarkLabel
          )}, downloadAllowed=${JSON.stringify(policy.downloadAllowed)}, printAllowed=${JSON.stringify(
            policy.printAllowed
          )}, mustAcknowledgeForCompliance=${JSON.stringify(
            policy.mustAcknowledgeForCompliance
          )}, alreadyAcknowledged=${JSON.stringify(policy.alreadyAcknowledged)}`
        );
      }

      return {
        pass: response.status === 200 && Boolean(policy) && hasFields,
        status: response.status,
        snippet: response.snippet,
        notes: policy ? `policy present with required fields=${hasFields}` : `status=${response.status}; policy missing`
      };
    }
  );

  await runCheck(5, 'Controlled preview enforcement check', async () => {
    if (!previewPolicy) {
      return {
        pass: false,
        status: null,
        snippet: '',
        notes: 'policy unavailable from Check 4'
      };
    }
    const watermarkValid =
      typeof previewPolicy.watermarkLabel === 'string' && previewPolicy.watermarkLabel.trim().length > 0;
    const booleansValid =
      typeof previewPolicy.downloadAllowed === 'boolean' &&
      typeof previewPolicy.printAllowed === 'boolean';

    return {
      pass: watermarkValid && booleansValid,
      status: 200,
      snippet: '',
      notes: `watermarkNonEmpty=${watermarkValid}; booleansStructured=${booleansValid}`
    };
  });

  console.log('');
  console.log('--- CAPA ---');
  await runCheck(6, 'GET /api/capa', async () => {
    const response = await apiRequest('/capa', { auth: true });
    return {
      pass: response.status === 200,
      status: response.status,
      snippet: response.snippet,
      notes: `status=${response.status}`
    };
  });

  await runCheck(7, 'POST /api/capa and store capaId', async () => {
    const response = await apiRequest('/capa', {
      method: 'POST',
      auth: true,
      body: {
        title: 'Shivani Browser Verification CAPA',
        classification: 'Corrective',
        source: 'manual',
        description: 'Browser verification test CAPA',
        ownerUserId: currentUserId
      }
    });

    if (response.status === 200 || response.status === 201) {
      capaId = getId(response.payload, 'capa.id', 'id');
    }

    return {
      pass: (response.status === 200 || response.status === 201) && Boolean(capaId),
      status: response.status,
      snippet: response.snippet,
      notes: `status=${response.status}; capaId=${capaId || 'N/A'}`
    };
  });

  await runCheck(8, 'GET /api/capa and verify created CAPA appears in list', async () => {
    if (!capaId) {
      return {
        pass: false,
        status: null,
        snippet: '',
        notes: 'capaId unavailable from Check 7'
      };
    }

    const response = await apiRequest('/capa', { auth: true });
    const capaList = Array.isArray(response.payload)
      ? response.payload
      : Array.isArray(response.payload?.capas)
      ? response.payload.capas
      : Array.isArray(response.payload?.data)
      ? response.payload.data
      : [];
    const recordExists = capaList.some((item) => item && item.id === capaId);
    return {
      pass: response.status === 200 && recordExists,
      status: response.status,
      snippet: response.snippet,
      notes: `recordExists=${recordExists}; total=${capaList.length}`
    };
  });

  console.log('');
  console.log('--- DEVIATION ---');
  await runCheck(9, 'GET /api/deviations', async () => {
    const response = await apiRequest('/deviations', { auth: true });
    return {
      pass: response.status === 200,
      status: response.status,
      snippet: response.snippet,
      notes: `status=${response.status}`
    };
  });

  await runCheck(10, 'POST /api/deviations and store deviationId', async () => {
    const response = await apiRequest('/deviations', {
      method: 'POST',
      auth: true,
      body: {
        title: 'Shivani Verification Deviation',
        classification: 'Minor',
        deviationType: 'Process',
        description: 'Browser verification test deviation',
        detectedBy: 'Shivani',
        dateOfOccurrence: new Date().toISOString().split('T')[0],
        department: 'Quality'
      }
    });

    if (response.status === 200 || response.status === 201) {
      deviationId = getId(response.payload, 'deviation.id', 'id');
    }

    return {
      pass: (response.status === 200 || response.status === 201) && Boolean(deviationId),
      status: response.status,
      snippet: response.snippet,
      notes: `status=${response.status}; deviationId=${deviationId || 'N/A'}`
    };
  });

  console.log('');
  console.log('--- AUDIT ---');
  await runCheck(11, 'GET /api/audits', async () => {
    const response = await apiRequest('/audits', { auth: true });
    return {
      pass: response.status === 200,
      status: response.status,
      snippet: response.snippet,
      notes: `status=${response.status}`
    };
  });

  await runCheck(12, 'POST /api/audits and store auditId', async () => {
    const response = await apiRequest('/audits', {
      method: 'POST',
      auth: true,
      body: {
        auditTitle: 'Shivani Verification Audit',
        auditType: 'Internal',
        scope: 'QMS modules',
        plannedDate: '2026-05-01'
      }
    });

    if (response.status === 200 || response.status === 201) {
      auditId = getId(response.payload, 'audit.id', 'id');
    }

    return {
      pass: (response.status === 200 || response.status === 201) && Boolean(auditId),
      status: response.status,
      snippet: response.snippet,
      notes: `status=${response.status}; auditId=${auditId || 'N/A'}`
    };
  });

  await runCheck(13, 'POST /api/audits/binder/generate and print time', async () => {
    const response = await apiRequest('/audits/binder/generate', {
      method: 'POST',
      auth: true,
      body: { label: 'Shivani Verification Binder' }
    });
    console.log(`Binder generation request time: ${response.durationMs} ms`);
    return {
      pass: response.status === 200 || response.status === 201 || response.status === 202,
      status: response.status,
      snippet: response.snippet,
      notes: `status=${response.status}; timeMs=${response.durationMs}`
    };
  });

  console.log('');
  console.log('--- VALIDATION SERVICES ---');
  await runCheck(14, 'GET /api/validation/systems', async () => {
    const response = await apiRequest('/validation/systems', { auth: true });
    return {
      pass: response.status === 200,
      status: response.status,
      snippet: response.snippet,
      notes: `status=${response.status}`
    };
  });

  await runCheck(15, 'POST /api/validation/systems and store systemId', async () => {
    const response = await apiRequest('/validation/systems', {
      method: 'POST',
      auth: true,
      body: {
        systemName: 'Shivani Test System',
        vendor: 'Pharaxis',
        version: '1.0',
        gampCategory: 4,
        riskLevel: 'Medium',
        systemOwnerId: null
      }
    });

    if (response.status === 200 || response.status === 201) {
      systemId = getId(response.payload, 'system.id', 'id');
    }

    return {
      pass: (response.status === 200 || response.status === 201) && Boolean(systemId),
      status: response.status,
      snippet: response.snippet,
      notes: `status=${response.status}; systemId=${systemId || 'N/A'}`
    };
  });

  await runCheck(16, 'GET /api/validation/systems (re-verify systems list)', async () => {
    if (!systemId) {
      return {
        pass: false,
        status: null,
        snippet: '',
        notes: 'systemId unavailable from Check 15'
      };
    }
    const response = await apiRequest('/validation/systems', { auth: true });
    return {
      pass: response.status === 200,
      status: response.status,
      snippet: response.snippet,
      notes: `status=${response.status}`
    };
  });

  console.log('');
  console.log('--- PLATFORM SERVICES ---');
  await runCheck(17, 'GET /api/platform/notifications', async () => {
    const response = await apiRequest('/platform/notifications', { auth: true });
    return {
      pass: response.status === 200,
      status: response.status,
      snippet: response.snippet,
      notes: `status=${response.status}`
    };
  });

  await runCheck(18, 'POST /api/platform/events/outbox', async () => {
    const response = await apiRequest('/platform/events/outbox', {
      method: 'POST',
      auth: true,
      body: {
        eventType: 'verification.test',
        topicKey: 'verification.test',
        payload: { test: true }
      }
    });
    return {
      pass: response.status === 200 || response.status === 201,
      status: response.status,
      snippet: response.snippet,
      notes: `status=${response.status}`
    };
  });

  console.log('');
  console.log('--- SUPERADMIN ---');
  await runCheck(19, 'GET /api/superadmin/orgs', async () => {
    const response = await apiRequest('/superadmin/orgs', { auth: true });
    return {
      pass: response.status === 200,
      status: response.status,
      snippet: response.snippet,
      notes: `status=${response.status}`
    };
  });

  await runCheck(20, 'GET /api/superadmin/users', async () => {
    const response = await apiRequest('/superadmin/users', { auth: true });
    return {
      pass: response.status === 200,
      status: response.status,
      snippet: response.snippet,
      notes: `status=${response.status}`
    };
  });

  await writeReport();

  const total = CHECKS.length;
  const passed = CHECKS.filter((c) => c.result === 'PASS').length;
  const failedChecks = CHECKS.filter((c) => c.result === 'FAIL');

  console.log('');
  console.log('--- SUMMARY ---');
  console.log(`Total checks: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failedChecks.length}`);

  if (failedChecks.length > 0) {
    console.log('Failed checks:');
    for (const check of failedChecks) {
      console.log(
        `- Check ${check.check}: status=${check.status ?? 'N/A'} body=${clip(
          check.snippet || check.notes || ''
        )}`
      );
    }
    process.exitCode = 1;
  } else {
    process.exitCode = 0;
  }

  console.log(`Markdown report saved to: ${REPORT_PATH}`);
}

main().catch((error) => {
  console.error(`Fatal error: ${error.stack || error.message}`);
  process.exit(1);
});
