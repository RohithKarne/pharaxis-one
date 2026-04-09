const http = require('http');

const BASE = 'http://127.0.0.1:3000';

let passCount = 0;
let failCount = 0;

let superadminToken;
let adminToken;
let vaultConfigId;
let emirConfigId;
let typeMapId;
let emirRequestId;

function req(method, path, body, headers) {
  return new Promise((resolve) => {
    const url = new URL(path, BASE);
    const payload = body != null ? JSON.stringify(body) : null;

    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: Object.assign({}, headers || {})
    };

    if (payload) {
      opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        let parsed = data;
        try {
          parsed = data ? JSON.parse(data) : {};
        } catch (_) {
          // Keep raw string if response is not JSON.
        }
        resolve({
          status: res.statusCode,
          body: parsed
        });
      });
    });

    r.on('error', (err) => {
      resolve({
        status: 0,
        body: { error: err.message }
      });
    });

    if (payload) r.write(payload);
    r.end();
  });
}

function assert(label, cond, detail) {
  if (!cond) {
    failCount += 1;
    console.error('FAIL ' + label + (detail ? ' - ' + detail : ''));
  } else {
    passCount += 1;
    console.log('PASS ' + label);
  }
}

async function run() {
  // Test 1 — Superadmin login
  let res = await req('POST', '/api/auth/login', {
    email: 'superadmin',
    password: 'Manager@123'
  });
  assert('Test 1 status', res.status === 200, 'status=' + res.status);
  assert('Test 1 token', !!(res.body && res.body.token), JSON.stringify(res.body));
  superadminToken = res.body && res.body.token;

  // Test 2 — Admin login
  res = await req('POST', '/api/auth/login', {
    email: 'rohithreddy480@gmail.com',
    password: 'Manager@123'
  });
  assert('Test 2 status', res.status === 200, 'status=' + res.status);
  assert('Test 2 token/challengeToken', !!(res.body && (res.body.token || res.body.challengeToken)), JSON.stringify(res.body));
  adminToken = res.body && (res.body.token || res.body.challengeToken);

  // Test 3 — Create vault config (superadmin)
  res = await req(
    'POST',
    '/api/superadmin/vault-config',
    {
      org_id: 26,
      vault_domain: 'https://test.veevavault.com',
      vault_username: 'test_user',
      vault_password: 'test_pass',
      vault_api_version: 'v24.1',
      poll_interval_hours: 12,
      enabled: 1
    },
    { Authorization: 'Bearer ' + superadminToken }
  );
  assert('Test 3 status', res.status === 200, 'status=' + res.status + ' body=' + JSON.stringify(res.body));
  assert('Test 3 id', !!(res.body && res.body.id > 0), JSON.stringify(res.body));
  vaultConfigId = res.body && res.body.id;

  // Test 4 — Get vault configs (superadmin)
  res = await req('GET', '/api/superadmin/vault-config', null, {
    Authorization: 'Bearer ' + superadminToken
  });
  assert('Test 4 status', res.status === 200, 'status=' + res.status);
  assert('Test 4 configs array', !!(res.body && Array.isArray(res.body.configs)), JSON.stringify(res.body));

  // Test 5 — Create EMIR config (superadmin)
  res = await req(
    'POST',
    '/api/superadmin/emir-config',
    {
      org_id: 26,
      inbound_email: 'emir@test.com',
      sender_whitelist: ['pharma@client.com'],
      ack_template: 'Your request {ref} is received.',
      enabled: 1
    },
    { Authorization: 'Bearer ' + superadminToken }
  );
  assert('Test 5 status', res.status === 200, 'status=' + res.status + ' body=' + JSON.stringify(res.body));
  assert('Test 5 id', !!(res.body && res.body.id > 0), JSON.stringify(res.body));
  emirConfigId = res.body && res.body.id;

  // Test 6 — Get EMIR configs (superadmin)
  res = await req('GET', '/api/superadmin/emir-config', null, {
    Authorization: 'Bearer ' + superadminToken
  });
  assert('Test 6 status', res.status === 200, 'status=' + res.status);
  assert('Test 6 configs array', !!(res.body && Array.isArray(res.body.configs)), JSON.stringify(res.body));

  // Test 7 — Create vault document type mapping (superadmin)
  res = await req(
    'POST',
    '/api/superadmin/vault-query-params/26',
    {
      vault_type: 'promotional_piece__v',
      vault_subtype: null,
      vault_classification: null,
      mims_cm_category: 'Promotional Material'
    },
    { Authorization: 'Bearer ' + superadminToken }
  );
  assert('Test 7 status', res.status === 200, 'status=' + res.status + ' body=' + JSON.stringify(res.body));
  assert('Test 7 id', !!(res.body && res.body.id > 0), JSON.stringify(res.body));
  typeMapId = res.body && res.body.id;

  // Test 8 — Get vault query params (superadmin)
  res = await req('GET', '/api/superadmin/vault-query-params/26', null, {
    Authorization: 'Bearer ' + superadminToken
  });
  assert('Test 8 status', res.status === 200, 'status=' + res.status);
  assert('Test 8 params exists', !!(res.body && res.body.params !== undefined), JSON.stringify(res.body));

  // Test 9 — Vault search requires q param (admin)
  res = await req('GET', '/api/admin/vault/search', null, {
    Authorization: 'Bearer ' + adminToken
  });
  assert('Test 9 status', res.status === 500, 'status=' + res.status + ' body=' + JSON.stringify(res.body));

  // Test 10 — Vault documents list fails gracefully without real Vault (admin)
  res = await req('GET', '/api/admin/vault/documents', null, {
    Authorization: 'Bearer ' + adminToken
  });
  assert('Test 10 status', res.status === 500, 'status=' + res.status + ' body=' + JSON.stringify(res.body));

  // Test 11 — EMIR receive with whitelisted sender
  res = await req(
    'POST',
    '/api/admin/emir/receive',
    {
      org_id: 26,
      from_email: 'pharma@client.com',
      subject: 'MI Request - Product X',
      body: 'Please provide MI information for Product X',
      attachments: []
    },
    { Authorization: 'Bearer ' + adminToken }
  );
  assert('Test 11 status', res.status === 200, 'status=' + res.status + ' body=' + JSON.stringify(res.body));
  assert('Test 11 reference_number', !!(res.body && typeof res.body.reference_number === 'string' && res.body.reference_number.indexOf('EMIR-') === 0), JSON.stringify(res.body));
  assert('Test 11 case_id', !!(res.body && res.body.case_id > 0), JSON.stringify(res.body));
  emirRequestId = res.body && res.body.reference_number;

  // Test 12 — EMIR receive with non-whitelisted sender fails
  res = await req(
    'POST',
    '/api/admin/emir/receive',
    {
      org_id: 26,
      from_email: 'unknown@notallowed.com',
      subject: 'Test',
      body: 'Test body',
      attachments: []
    },
    { Authorization: 'Bearer ' + adminToken }
  );
  assert('Test 12 status', res.status === 500, 'status=' + res.status + ' body=' + JSON.stringify(res.body));

  // Test 13 — EMIR requests list (superadmin)
  res = await req('GET', '/api/superadmin/emir/requests', null, {
    Authorization: 'Bearer ' + superadminToken
  });
  assert('Test 13 status', res.status === 200, 'status=' + res.status);
  assert('Test 13 requests array', !!(res.body && Array.isArray(res.body.requests)), JSON.stringify(res.body));

  // Test 14 — EMIR audit log (superadmin)
  const listForAudit = await req('GET', '/api/superadmin/emir/requests', null, {
    Authorization: 'Bearer ' + superadminToken
  });
  let emirRequestNumericId;
  if (listForAudit.status === 200 && listForAudit.body && Array.isArray(listForAudit.body.requests) && listForAudit.body.requests.length > 0) {
    emirRequestNumericId = listForAudit.body.requests[0].id;
  }
  assert('Test 14 request id present', !!emirRequestNumericId, JSON.stringify(listForAudit.body));

  res = await req('GET', '/api/superadmin/emir/requests/' + emirRequestNumericId + '/audit', null, {
    Authorization: 'Bearer ' + superadminToken
  });
  assert('Test 14 status', res.status === 200, 'status=' + res.status + ' body=' + JSON.stringify(res.body));
  assert('Test 14 audit array', !!(res.body && Array.isArray(res.body.audit)), JSON.stringify(res.body));
  assert('Test 14 audit length >= 3', !!(res.body && Array.isArray(res.body.audit) && res.body.audit.length >= 3), JSON.stringify(res.body));

  // Test 15 — Vault poll trigger (superadmin)
  res = await req('GET', '/api/superadmin/vault/poll-now/26', null, {
    Authorization: 'Bearer ' + superadminToken
  });
  assert('Test 15 status', res.status === 200, 'status=' + res.status + ' body=' + JSON.stringify(res.body));
  assert(
    'Test 15 skipped or processed',
    !!(res.body && (res.body.skipped === true || res.body.processed !== undefined)),
    JSON.stringify(res.body)
  );

  // Test 16 — Delete vault type mapping (cleanup)
  res = await req('DELETE', '/api/superadmin/vault-query-params/' + typeMapId, null, {
    Authorization: 'Bearer ' + superadminToken
  });
  assert('Test 16 status', res.status === 200, 'status=' + res.status + ' body=' + JSON.stringify(res.body));

  // Test 17 — Delete EMIR config (cleanup)
  res = await req('DELETE', '/api/superadmin/emir-config/' + emirConfigId, null, {
    Authorization: 'Bearer ' + superadminToken
  });
  assert('Test 17 status', res.status === 200, 'status=' + res.status + ' body=' + JSON.stringify(res.body));

  // Test 18 — Delete vault config (cleanup)
  res = await req('DELETE', '/api/superadmin/vault-config/' + vaultConfigId, null, {
    Authorization: 'Bearer ' + superadminToken
  });
  assert('Test 18 status', res.status === 200, 'status=' + res.status + ' body=' + JSON.stringify(res.body));

  console.log('---');
  console.log('PASS: ' + passCount);
  console.log('FAIL: ' + failCount);
  if (failCount === 0) console.log('ALL TESTS PASSED');
  process.exit(failCount > 0 ? 1 : 0);
}

run().catch((err) => {
  failCount += 1;
  console.error('FAIL unexpected error - ' + (err && err.stack ? err.stack : err));
  console.log('---');
  console.log('PASS: ' + passCount);
  console.log('FAIL: ' + failCount);
  process.exit(1);
});
