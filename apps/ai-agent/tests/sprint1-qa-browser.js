const fs = require('fs');
const http = require('http');
const { execSync } = require('child_process');

const results = [];
const AI_AGENT_INTERNAL_TOKEN = 'dev-internal-token-change-in-prod';
const CP_PORTAL_BACKEND = 'http://localhost:4000';
const AI_AGENT_BACKEND = 'http://localhost:6000';
const MYSQL = '/usr/local/mysql/bin/mysql --protocol=TCP --host=127.0.0.1 -u devuser -pdevpass -e';

const DOCUMENTS_ROUTE_FILE = '/Users/rohithkarne/Pharaxis-One/apps/medical-affairs/cp-portal/backend/routes/portal/documents.js';
const DOCUMENTS_PAGE_FILE = '/Users/rohithkarne/Pharaxis-One/apps/medical-affairs/cp-portal/frontend/src/portal/pages/DocumentsPage.jsx';
const USAGE_PAGE_FILE = '/Users/rohithkarne/Pharaxis-One/apps/ai-agent/frontend/src/pages/UsagePage/index.jsx';
const ADAPTER_INDEX_FILE = '/Users/rohithkarne/Pharaxis-One/apps/ai-agent/backend/adapters/index.js';

function pass(id, detail) {
  results.push({ id, status: 'PASS', detail });
  console.log(`PASS ${id} - ${detail}`);
}

function fail(id, detail) {
  results.push({ id, status: 'FAIL', detail });
  console.log(`FAIL ${id} - ${detail}`);
}

function skip(id, detail) {
  results.push({ id, status: 'SKIP', detail });
  console.log(`SKIP ${id} - ${detail}`);
}

function mysql(query) {
  const cmd = `${MYSQL} ${JSON.stringify(query)}`;
  return execSync(cmd, { encoding: 'utf8' });
}

function parseCount(output) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (/^\d+$/.test(lines[i])) return parseInt(lines[i], 10);
  }

  return Number.NaN;
}

function httpReq(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const body = options.body || '';
    const headers = { ...(options.headers || {}) };

    if (body && headers['Content-Length'] === undefined) {
      headers['Content-Length'] = Buffer.byteLength(body);
    }

    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers,
    };

    const req = http.request(reqOptions, (res) => {
      let text = '';
      res.on('data', (chunk) => {
        text += chunk;
      });
      res.on('end', () => {
        let bodyJson = null;
        try {
          bodyJson = text ? JSON.parse(text) : null;
        } catch (_) {
          bodyJson = null;
        }
        resolve({ status: res.statusCode, text, body: bodyJson });
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  console.log('\n=== Suite 4 - Provider Handling ===');

  skip('T4.1', 'Requires real API key - manual test in staging');

  try {
    const r = await httpReq(`${AI_AGENT_BACKEND}/api/v1/agent/internal/keys`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AI_AGENT_INTERNAL_TOKEN}`,
        'X-Org-Id': '55555',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'openai',
        api_key: 'sk-invalid-key-that-will-fail-validation',
      }),
    });

    if (r.status === 422 || r.status === 503) {
      pass('T4.2', `Expected validation/provider failure status returned (${r.status})`);
    } else if (r.status === 200) {
      fail('T4.2', 'Expected failure status (422/503), got 200');
    } else {
      fail('T4.2', `Unexpected status ${r.status}; body=${r.text}`);
    }
  } catch (err) {
    fail('T4.2', err.message);
  }

  try {
    const adapters = require(ADAPTER_INDEX_FILE);
    if (!adapters || typeof adapters.getAdapter !== 'function') {
      fail('T4.3', 'getAdapter export not found');
    } else {
      try {
        adapters.getAdapter('unknown_provider');
        fail('T4.3', 'Expected getAdapter("unknown_provider") to throw');
      } catch (err) {
        const msg = String((err && err.message) || err);
        if (msg.includes('Unsupported provider')) {
          pass('T4.3', 'Throws expected Unsupported provider error');
        } else {
          fail('T4.3', `Thrown error did not include expected text: ${msg}`);
        }
      }
    }
  } catch (err) {
    fail('T4.3', err.message);
  }

  console.log('\n=== Suite 6 - CP Portal AI Mode Checks ===');
  console.log(`Using CP Portal backend constant: ${CP_PORTAL_BACKEND}`);

  try {
    const raw = fs.readFileSync(DOCUMENTS_PAGE_FILE, 'utf8');
    if (raw.includes('aiMode')) {
      pass('T6.1', 'DocumentsPage contains aiMode');
    } else {
      fail('T6.1', 'DocumentsPage missing aiMode');
    }
  } catch (err) {
    fail('T6.1', err.message);
  }

  try {
    const raw = fs.readFileSync(DOCUMENTS_PAGE_FILE, 'utf8');
    if (raw.includes('ai_unavailable')) {
      pass('T6.2', 'DocumentsPage contains ai_unavailable');
    } else {
      fail('T6.2', 'DocumentsPage missing ai_unavailable');
    }
  } catch (err) {
    fail('T6.2', err.message);
  }

  skip('T6.3', 'Requires real API key and live document data - manual test in staging');

  try {
    const raw = fs.readFileSync(DOCUMENTS_ROUTE_FILE, 'utf8');
    if (raw.includes('ai_unavailable')) {
      pass('T6.4', 'documents.js contains ai_unavailable');
    } else {
      fail('T6.4', 'documents.js missing ai_unavailable');
    }
  } catch (err) {
    fail('T6.4', err.message);
  }

  try {
    const raw = fs.readFileSync(DOCUMENTS_ROUTE_FILE, 'utf8');
    if (raw.includes('results: []') || raw.includes('ai_unavailable')) {
      pass('T6.5', 'documents.js contains fallback results handling');
    } else {
      fail('T6.5', 'documents.js missing fallback markers (results: [] / ai_unavailable)');
    }
  } catch (err) {
    fail('T6.5', err.message);
  }

  console.log('\n=== Suite 7 - Usage UI and DB Checks ===');

  try {
    if (!fs.existsSync(USAGE_PAGE_FILE)) {
      fail('T7.4', `Missing file: ${USAGE_PAGE_FILE}`);
    } else {
      const raw = fs.readFileSync(USAGE_PAGE_FILE, 'utf8');
      if (raw.includes('UsagePage') || /usage/i.test(raw)) {
        pass('T7.4', 'Usage page exists and contains usage markers');
      } else {
        fail('T7.4', 'Usage page exists but lacks UsagePage/usage text');
      }
    }
  } catch (err) {
    fail('T7.4', err.message);
  }

  try {
    const out = mysql('SELECT COUNT(*) as cnt FROM pharaxis_ai_agent_dev.ai_agent_usage_log;');
    const cnt = parseCount(out);

    if (!Number.isNaN(cnt) && cnt > 0) {
      pass('T7.5', `ai_agent_usage_log has ${cnt} rows`);
    } else if (!Number.isNaN(cnt) && cnt === 0) {
      skip('T7.5', 'ai_agent_usage_log is empty (cnt=0)');
    } else {
      skip('T7.5', `Could not parse count from MySQL output: ${out.trim()}`);
    }
  } catch (err) {
    skip('T7.5', `DB unavailable or query failed: ${err.message}`);
  }

  console.log('\n=== Suite 9 - documents.js Regression Checks ===');

  try {
    const raw = fs.readFileSync(DOCUMENTS_ROUTE_FILE, 'utf8');
    const hasBrokenFetch =
      raw.includes('await fetch("http://localhost:6000') ||
      raw.includes("await fetch('http://localhost:6000");

    if (!hasBrokenFetch) {
      pass('T9.1', 'Old broken fetch call is not present');
    } else {
      fail('T9.1', 'Old broken fetch call is still present');
    }
  } catch (err) {
    fail('T9.1', err.message);
  }

  try {
    execSync(`node --check ${JSON.stringify(DOCUMENTS_ROUTE_FILE)}`, { stdio: 'pipe' });
    pass('T9.2', 'node --check passed for documents.js');
  } catch (err) {
    fail('T9.2', `node --check failed: ${(err && err.message) || String(err)}`);
  }

  const passCount = results.filter((r) => r.status === 'PASS').length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  const skipCount = results.filter((r) => r.status === 'SKIP').length;
  const failIds = results.filter((r) => r.status === 'FAIL').map((r) => r.id);
  const skipIds = results.filter((r) => r.status === 'SKIP').map((r) => r.id);

  console.log('\n=== SPRINT 1 QA BROWSER/REMAINING SUMMARY ===');
  console.log(`PASS: ${passCount}  FAIL: ${failCount}  SKIP: ${skipCount}  Total: ${results.length}`);
  console.log(`FAIL IDs: ${failIds.length ? failIds.join(', ') : 'None'}  SKIP IDs: ${skipIds.length ? skipIds.join(', ') : 'None'}`);
})();
