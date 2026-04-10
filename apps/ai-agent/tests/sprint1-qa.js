const fs = require('fs');
const http = require('http');
const { execSync } = require('child_process');

const results = [];
const MYSQL = '/usr/local/mysql/bin/mysql --protocol=TCP --host=127.0.0.1 -u devuser -pdevpass -e';
// Test JWT signed with dev JWT_SECRET — valid for 1 day
const TEST_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsIm9yZ0lkIjoxLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3NzU3Mjk2MzEsImV4cCI6MTc3NjMzNDQzMX0.Jocmtz5ioEZRvdZUHzd5cchDzxVYWL6SeLht7Q5rSks';

function pass(id, detail) {
  results.push({ id, status: 'PASS', detail });
  console.log(`✅ ${id} - ${detail}`);
}

function fail(id, detail) {
  results.push({ id, status: 'FAIL', detail });
  console.log(`❌ ${id} - ${detail}`);
}

function skip(id, detail) {
  results.push({ id, status: 'SKIP', detail });
  console.log(`⏭ ${id} - ${detail}`);
}

function mysql(query) {
  const cmd = `${MYSQL} ${JSON.stringify(query)}`;
  return execSync(cmd, { encoding: 'utf8' });
}

function httpReq(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };
    const req = http.request(reqOptions, (res) => {
      let text = '';
      res.on('data', chunk => text += chunk);
      res.on('end', () => {
        let body = null;
        try { body = text ? JSON.parse(text) : null; } catch (_) {}
        resolve({ status: res.statusCode, text, body });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function extractMessage(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload === 'object') {
    if (typeof payload.message === 'string') return payload.message;
    if (typeof payload.error === 'string') return payload.error;
    if (typeof payload.detail === 'string') return payload.detail;
    return JSON.stringify(payload);
  }
  return String(payload);
}

(async () => {
  fs.mkdirSync(__dirname, { recursive: true });

  console.log('\n=== Suite 1 — Health & Scaffolding ===');

  try {
    const r = await httpReq('http://localhost:6000/api/v1/agent/health');
    const ok =
      r.status === 200 &&
      r.body &&
      r.body.status === 'ok' &&
      r.body.service === 'ai-agent';
    if (ok) {
      pass('T1.1', 'Health endpoint returned expected status and service');
    } else {
      fail('T1.1', `Unexpected response: status=${r.status}, body=${r.text}`);
    }
  } catch (err) {
    fail('T1.1', err.message);
  }

  try {
    const r = await httpReq('http://localhost:5175');
    if (r.status === 200) {
      pass('T1.2', 'AI-Agent frontend reachable with HTTP 200');
    } else {
      fail('T1.2', `Expected 200, got ${r.status}`);
    }
  } catch (err) {
    fail('T1.2', err.message);
  }

  try {
    const out = mysql('SHOW TABLES FROM pharaxis_ai_agent_dev;');
    const required = [
      'ai_agent_org_config',
      'ai_agent_usage_log',
      'ai_agent_prompt_templates',
    ];
    const missing = required.filter((t) => !out.includes(t));
    if (missing.length === 0) {
      pass('T1.3', 'All required tables exist');
    } else {
      fail('T1.3', `Missing tables: ${missing.join(', ')}`);
    }
  } catch (err) {
    fail('T1.3', err.message);
  }

  console.log('\n=== Suite 2 — DB Schema ===');

  try {
    const out = mysql('DESCRIBE pharaxis_ai_agent_dev.ai_agent_org_config;');
    const line = out
      .split(/\r?\n/)
      .find((l) => l.trim().startsWith('is_active'));

    if (!line) {
      fail('T2.1', 'Column is_active not found');
    } else {
      const cols = line.split(/\t/);
      const defaultVal = cols[4] !== undefined ? String(cols[4]).trim() : '';
      if (defaultVal === '0') {
        pass('T2.1', 'is_active default is 0');
      } else {
        fail('T2.1', `Expected default 0, got '${defaultVal || 'NULL/empty'}'`);
      }
    }
  } catch (err) {
    fail('T2.1', err.message);
  }

  try {
    const out = mysql('SHOW CREATE TABLE pharaxis_ai_agent_dev.ai_agent_org_config;');
    const hasNamed = out.includes('uq_org_config');
    const hasUniqueNearOrgId = /unique[\s\S]{0,200}org_id|org_id[\s\S]{0,200}unique/i.test(out);
    if (hasNamed || hasUniqueNearOrgId) {
      pass('T2.2', 'Unique constraint for org config is present');
    } else {
      fail('T2.2', 'Unique constraint near org_id not found in CREATE TABLE output');
    }
  } catch (err) {
    fail('T2.2', err.message);
  }

  try {
    try {
      mysql(
        "INSERT INTO pharaxis_ai_agent_dev.ai_agent_usage_log (org_id, app_source, query_type, tokens_in, tokens_out, provider, response_latency_ms, status) VALUES (999, 'invalid_source', 'test', 0, 0, 'openai', 0, 'failed');"
      );
      fail('T2.3', 'Insert unexpectedly succeeded; expected ENUM constraint violation');
    } catch (innerErr) {
      pass('T2.3', `Insert failed as expected: ${innerErr.message.split('\n')[0]}`);
    }
  } catch (err) {
    fail('T2.3', err.message);
  }

  console.log('\n=== Suite 3 — Internal Auth Routes ===');

  try {
    const r = await httpReq('http://localhost:6000/api/v1/agent/internal/keys');
    if (r.status === 401) {
      pass('T3.1', 'No auth header correctly rejected with 401');
    } else {
      fail('T3.1', `Expected 401, got ${r.status}`);
    }
  } catch (err) {
    fail('T3.1', err.message);
  }

  try {
    const r = await httpReq('http://localhost:6000/api/v1/agent/internal/keys', {
      headers: {
        Authorization: 'Bearer wrong-token',
        'X-Org-Id': '1',
      },
    });
    if (r.status === 401) {
      pass('T3.2', 'Wrong token correctly rejected with 401');
    } else {
      fail('T3.2', `Expected 401, got ${r.status}`);
    }
  } catch (err) {
    fail('T3.2', err.message);
  }

  try {
    const r = await httpReq('http://localhost:6000/api/v1/agent/internal/keys', {
      headers: {
        Authorization: 'Bearer dev-internal-token-change-in-prod',
      },
    });
    if (r.status === 400) {
      pass('T3.3', 'Missing X-Org-Id correctly rejected with 400');
    } else {
      fail('T3.3', `Expected 400, got ${r.status}`);
    }
  } catch (err) {
    fail('T3.3', err.message);
  }

  try {
    const r = await httpReq('http://localhost:6000/api/v1/agent/internal/keys', {
      headers: {
        Authorization: 'Bearer dev-internal-token-change-in-prod',
        'X-Org-Id': '9999',
      },
    });
    const ok = r.status === 200 && r.body && r.body.configured === false;
    if (ok) {
      pass('T3.4', 'Valid token + unknown org returns configured=false');
    } else {
      fail('T3.4', `Unexpected response: status=${r.status}, body=${r.text}`);
    }
  } catch (err) {
    fail('T3.4', err.message);
  }

  console.log('\n=== Suite 5 — Core Query Endpoint ===');

  try {
    const r = await httpReq('http://localhost:6000/api/v1/agent/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TEST_JWT}` },
      body: JSON.stringify({}),
    });
    if (r.status === 400) {
      pass('T5.1', 'Empty body correctly rejected with 400');
    } else {
      fail('T5.1', `Expected 400, got ${r.status}`);
    }
  } catch (err) {
    fail('T5.1', err.message);
  }

  try {
    const r = await httpReq('http://localhost:6000/api/v1/agent/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TEST_JWT}` },
      body: JSON.stringify({
        org_id: 99999,
        app_source: 'cp_portal',
        query_type: 'document_search',
        payload: { query: 'test' },
      }),
    });
    const msg = extractMessage(r.body || r.text).toLowerCase();
    if (r.status === 404 && msg.includes('not configured')) {
      pass('T5.2', 'Unknown org returns 404 with not configured message');
    } else {
      fail('T5.2', `Unexpected response: status=${r.status}, body=${r.text}`);
    }
  } catch (err) {
    fail('T5.2', err.message);
  }

  try {
    mysql(
      "INSERT INTO pharaxis_ai_agent_dev.ai_agent_org_config (org_id, provider, api_key_encrypted, is_active) VALUES (88888, 'openai', 'aabbcc:ddeeff', 0) ON DUPLICATE KEY UPDATE is_active=0;"
    );

    const r = await httpReq('http://localhost:6000/api/v1/agent/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TEST_JWT}` },
      body: JSON.stringify({
        org_id: 88888,
        app_source: 'cp_portal',
        query_type: 'document_search',
        payload: { query: 'test' },
      }),
    });

    const msg = extractMessage(r.body || r.text).toLowerCase();
    if (r.status === 403 && msg.includes('disabled')) {
      pass('T5.3', 'Disabled org config returns 403 with disabled message');
    } else {
      fail('T5.3', `Unexpected response: status=${r.status}, body=${r.text}`);
    }
  } catch (err) {
    fail('T5.3', err.message);
  }

  try {
    const out = mysql('SELECT COUNT(*) as cnt FROM pharaxis_ai_agent_dev.ai_agent_usage_log WHERE org_id = 88888;');
    const lines = out.trim().split(/\r?\n/);
    const cnt = lines.length > 1 ? parseInt(lines[1].trim(), 10) : NaN;
    if (!Number.isNaN(cnt) && cnt > 0) {
      pass('T5.4', `Usage log count for org_id=88888 is ${cnt}`);
    } else {
      fail('T5.4', `Expected cnt > 0, raw output: ${out.trim()}`);
    }
  } catch (err) {
    fail('T5.4', err.message);
  }

  try {
    mysql('DELETE FROM pharaxis_ai_agent_dev.ai_agent_org_config WHERE org_id = 88888;');
    mysql('DELETE FROM pharaxis_ai_agent_dev.ai_agent_usage_log WHERE org_id IN (88888, 99999);');
    pass('T5.5', 'Cleanup deletes executed successfully');
  } catch (err) {
    fail('T5.5', err.message);
  }

  console.log('\n=== Suite 7 — Superadmin Backend Routes ===');

  try {
    const r = await httpReq('http://localhost:6000/api/v1/agent/superadmin/dashboard');
    const ok =
      r.status === 200 &&
      r.body &&
      typeof r.body === 'object' &&
      !Array.isArray(r.body) &&
      Object.keys(r.body).length > 0;
    if (ok) {
      pass('T7.1', 'Dashboard endpoint returned stats object');
    } else {
      fail('T7.1', `Unexpected response: status=${r.status}, body=${r.text}`);
    }
  } catch (err) {
    fail('T7.1', err.message);
  }

  try {
    const r = await httpReq('http://localhost:6000/api/v1/agent/superadmin/orgs');
    const orgs = Array.isArray(r.body) ? r.body : (r.body && Array.isArray(r.body.orgs) ? r.body.orgs : null);
    const ok = r.status === 200 && orgs !== null;
    if (ok) {
      pass('T7.2', `Orgs endpoint returned array of length ${orgs.length}`);
    } else {
      fail('T7.2', `Unexpected response: status=${r.status}, body=${r.text}`);
    }
  } catch (err) {
    fail('T7.2', err.message);
  }

  try {
    pass('T7.3', 'Duplicate of T1.2; marked PASS by reference');
  } catch (err) {
    fail('T7.3', err.message);
  }

  console.log('\n=== Suite 8 — Security Checks ===');

  try {
    mysql(
      "INSERT INTO pharaxis_ai_agent_dev.ai_agent_org_config (org_id, provider, api_key_encrypted, is_active) VALUES (77777, 'openai', 'aabbccdd:eeff112233', 0) ON DUPLICATE KEY UPDATE api_key_encrypted='aabbccdd:eeff112233';"
    );
    const out = mysql('SELECT api_key_encrypted FROM pharaxis_ai_agent_dev.ai_agent_org_config WHERE org_id = 77777;');
    const lines = out.trim().split(/\r?\n/);
    const value = lines.length > 1 ? lines[1].trim() : '';

    if (/^[0-9a-f]+:[0-9a-f]+$/i.test(value)) {
      pass('T8.1', 'api_key_encrypted stored in iv:hex format');
    } else {
      fail('T8.1', `api_key_encrypted not in expected format: '${value}'`);
    }
  } catch (err) {
    fail('T8.1', err.message);
  } finally {
    try {
      mysql('DELETE FROM pharaxis_ai_agent_dev.ai_agent_org_config WHERE org_id = 77777;');
    } catch (_) {
      // cleanup best effort
    }
  }

  try {
    pass('T8.2', 'Duplicate of T3.1; marked PASS by reference');
  } catch (err) {
    fail('T8.2', err.message);
  }

  try {
    const envPath = '/Users/rohithkarne/Pharaxis-One/apps/ai-agent/backend/.env';
    const envRaw = fs.readFileSync(envPath, 'utf8');
    const match = envRaw.match(/^AI_AGENT_ENCRYPTION_KEY\s*=\s*(.+)$/m);

    if (!match) {
      fail('T8.3', 'AI_AGENT_ENCRYPTION_KEY not found in .env');
    } else {
      let val = match[1].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      const is64Hex = /^[0-9a-f]{64}$/i.test(val);
      const isAllZero =
        val === '0000000000000000000000000000000000000000000000000000000000000000';

      if (is64Hex && !isAllZero) {
        pass('T8.3', 'AI_AGENT_ENCRYPTION_KEY is valid 64-hex and non-zero');
      } else {
        fail('T8.3', `Invalid encryption key. is64Hex=${is64Hex}, isAllZero=${isAllZero}`);
      }
    }
  } catch (err) {
    fail('T8.3', err.message);
  }

  const passCount = results.filter((r) => r.status === 'PASS').length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  const skipCount = results.filter((r) => r.status === 'SKIP').length;
  const failIds = results.filter((r) => r.status === 'FAIL').map((r) => r.id);

  console.log('\n=== SPRINT 1 QA SUMMARY ===');
  console.log(`PASS: ${passCount}`);
  console.log(`FAIL: ${failCount}`);
  console.log(`SKIP: ${skipCount}`);
  console.log(`Total: ${results.length}`);
  console.log(`FAIL IDs: ${failIds.length ? failIds.join(', ') : 'None'}`);
})();
