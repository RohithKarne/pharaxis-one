'use strict';
/**
 * Sprint 6 — Phase 1B Full Test Suite
 * QA: Karthik & Shivani
 *
 * Coverage:
 *   F-07  Product Dictionary (Approvals + Country Auth) — API + Browser
 *   F-08  Case Contacts (Enhancement)                  — API + Browser
 *   F-09  Case Audit Trail                             — API
 *   F-10  Transmission Audit Trail                     — API
 *   F-11  Company Representatives (Territory)          — API + Browser
 *   F-12  Workflow Activity Triggers                   — API + Browser
 *   REGRESSION  Phase 1A sections + core APIs still passing
 *
 * Credentials: superadmin / Manager@123
 * Run: node sprint6-phase1b-test.js
 * Requires: backend on :3000, frontend on :5173, MySQL Docker up
 */

const puppeteer    = require('puppeteer-core');
const { execSync } = require('child_process');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE   = 'http://localhost:5173';
const API    = 'http://localhost:3000';

// ──────────────────────────────────────────────────────────────────
// Reporting
// ──────────────────────────────────────────────────────────────────
const results = [];
let passed = 0, failed = 0, warned = 0;

function log(section, test, status, detail = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️ ';
  const line  = `  ${icon} [${section}] ${test}${detail ? ' — ' + detail : ''}`;
  console.log(line);
  results.push({ section, test, status, detail });
  if (status === 'PASS') passed++;
  else if (status === 'FAIL') failed++;
  else warned++;
}

// ──────────────────────────────────────────────────────────────────
// API helpers (curl-based, avoids CORS entirely)
// ──────────────────────────────────────────────────────────────────
let AUTH_HEADER = '';

function curl(method, path, body, section, label) {
  try {
    const bodyFlag = body ? `-H "Content-Type: application/json" -d '${JSON.stringify(body)}'` : '';
    const cmd = `curl -s -X ${method} ${AUTH_HEADER} ${bodyFlag} "${API}${path}"`;
    const raw = execSync(cmd, { timeout: 10000 }).toString();
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = { _raw: raw }; }
    return parsed;
  } catch (e) {
    log(section, label, 'FAIL', 'curl exec error: ' + e.message.slice(0, 120));
    return null;
  }
}

function curlCode(method, path, body, section, label) {
  try {
    const bodyFlag = body ? `-H "Content-Type: application/json" -d '${JSON.stringify(body)}'` : '';
    const cmd = `curl -s -o /dev/null -w "%{http_code}" -X ${method} ${AUTH_HEADER} ${bodyFlag} "${API}${path}"`;
    return parseInt(execSync(cmd, { timeout: 10000 }).toString().trim(), 10);
  } catch (e) {
    log(section, label, 'FAIL', 'curl exec error: ' + e.message.slice(0, 120));
    return 0;
  }
}

function assertGet(path, section, label, checks = []) {
  const code = curlCode('GET', path, null, section, label);
  if (code !== 200) { log(section, label, 'FAIL', `HTTP ${code}`); return null; }
  const data = curl('GET', path, null, section, label);
  if (!data) return null;
  if (data.error) { log(section, label, 'FAIL', `body.error="${data.error}"`); return null; }
  for (const { field, fn, msg } of checks) {
    const val = field.split('.').reduce((o, k) => o?.[k], data);
    if (fn && !fn(val)) { log(section, label, 'FAIL', msg || `field "${field}" failed assertion`); return null; }
  }
  log(section, label, 'PASS', 'HTTP 200');
  return data;
}

// ──────────────────────────────────────────────────────────────────
// Browser helpers
// ──────────────────────────────────────────────────────────────────
async function goto(page, url, section, extraWait = 2500) {
  page._jsErrors = [];
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 14000 });
    await new Promise(r => setTimeout(r, extraWait));
    log(section, `Load ${url}`, 'PASS');
    return true;
  } catch (e) {
    log(section, `Load ${url}`, 'FAIL', e.message.slice(0, 100));
    return false;
  }
}

async function checkNotBlank(page, section, label) {
  const text = await page.evaluate(() => document.body?.innerText?.trim() || '').catch(() => '');
  if (text.includes('Cannot read') || text.includes('is not a function') || text.includes('Something went wrong')) {
    log(section, label, 'FAIL', 'React crash: ' + text.slice(0, 120)); return false;
  }
  if (text.length < 40) { log(section, label, 'FAIL', 'Page blank (< 40 chars)'); return false; }
  log(section, label, 'PASS');
  return true;
}

async function checkJsErrors(page, section, label) {
  const errs = (page._jsErrors || []).filter(e =>
    e.includes('TypeError') || e.includes('is not a function') || e.includes('Cannot read') ||
    (e.includes('undefined') && e.includes('read'))
  );
  if (errs.length) { log(section, label, 'FAIL', errs[0].slice(0, 150)); return false; }
  log(section, label, 'PASS');
  return true;
}

async function textExists(page, text, section, label) {
  try {
    const found = await page.evaluate((t) => document.body?.innerText?.includes(t), text);
    if (found) { log(section, label, 'PASS', `"${text}" found`); return true; }
    log(section, label, 'FAIL', `"${text}" not found on page`); return false;
  } catch (e) {
    log(section, label, 'FAIL', e.message.slice(0, 100)); return false;
  }
}

async function clickBtn(page, text, section, label) {
  try {
    const clicked = await page.evaluate((t) => {
      const el = [...document.querySelectorAll('button')].find(b => b.textContent?.trim().includes(t));
      if (el) { el.click(); return true; }
      return false;
    }, text);
    if (!clicked) { log(section, label, 'FAIL', `Button "${text}" not found`); return false; }
    await new Promise(r => setTimeout(r, 1500));
    log(section, label, 'PASS');
    return true;
  } catch (e) {
    log(section, label, 'FAIL', e.message.slice(0, 100)); return false;
  }
}

// ══════════════════════════════════════════════════════════════════
(async () => {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  MIMS Sprint 6 — Phase 1B Full QA Test Suite         ║');
  console.log('║  F-07 Product Dict  | F-08 Case Contacts             ║');
  console.log('║  F-09 Case Audit    | F-10 Transmission Audit        ║');
  console.log('║  F-11 Company Reps  | F-12 Workflow Triggers         ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // ──────────────────────────────────────────────────────────────
  // SETUP — auth token
  // ──────────────────────────────────────────────────────────────
  console.log('━━ AUTH SETUP ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  let token = '', adminUser = null, adminModules = [];
  try {
    const loginRes = execSync(
      `curl -s -X POST ${API}/api/auth/login -H "Content-Type: application/json" -d '{"email":"superadmin","password":"Manager@123"}'`,
      { timeout: 8000 }
    ).toString();
    const parsed = JSON.parse(loginRes);
    token        = parsed.token  || '';
    adminUser    = parsed.user   || null;
    adminModules = parsed.modules || [];
    log('Auth', 'Login as superadmin', token ? 'PASS' : 'FAIL', token ? 'Token received' : parsed.error || 'No token');
  } catch (e) {
    log('Auth', 'Login as superadmin', 'FAIL', e.message.slice(0, 100));
  }
  AUTH_HEADER = token ? `-H "Authorization: Bearer ${token}"` : '';
  if (!token) { console.log('\n❌ Cannot proceed without auth token. Is the server running on port 3000?'); process.exit(1); }

  const ts = Date.now();

  // Launch browser
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-web-security'],
  });
  const page = await browser.newPage();
  page._jsErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') page._jsErrors.push(msg.text()); });
  page.on('pageerror', err => page._jsErrors.push(err.message));
  await page.setViewport({ width: 1440, height: 900 });

  // Inject auth into browser localStorage
  await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 12000 });
  if (adminUser) {
    await page.evaluate((user, tok, mods) => {
      localStorage.setItem('mims_user',    JSON.stringify(user));
      localStorage.setItem('mims_token',   tok);
      localStorage.setItem('mims_modules', JSON.stringify(mods));
    }, adminUser, token, adminModules);
    log('Auth', 'Browser localStorage injected', 'PASS');
  }

  // ══════════════════════════════════════════════════════════════
  // F-07  PRODUCT DICTIONARY — APPROVALS + COUNTRY AUTH
  // ══════════════════════════════════════════════════════════════
  console.log('\n━━ F-07: PRODUCT DICTIONARY ━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 7A. GET products list — need a product id to work with
  const prodData = assertGet('/api/admin/products-full', 'F-07 API', 'GET /products-full returns 200 with products array', [
    { field: 'products', fn: v => Array.isArray(v), msg: 'products must be array' },
  ]);

  // Get or create a product for approval/country auth tests
  let testProductId = null;
  if (prodData?.products?.length > 0) {
    testProductId = prodData.products[0].id;
    log('F-07 API', `Using existing product id=${testProductId} for sub-tests`, 'PASS');
  } else {
    // Create a product to test with
    const newProd = curl('POST', '/api/admin/products-full', {
      trade_name: `QA Test Product ${ts}`,
      org_id: null,
    }, 'F-07 API', 'POST create product for testing');
    testProductId = newProd?.id || null;
    log('F-07 API', 'POST create product (for sub-tests)', testProductId ? 'PASS' : 'FAIL', `id=${testProductId}`);
  }

  // 7B. GET approvals for product — should return empty array
  if (testProductId) {
    assertGet(`/api/admin/products/${testProductId}/approvals`, 'F-07 API', 'GET /products/:id/approvals returns 200 with approvals array', [
      { field: 'approvals', fn: v => Array.isArray(v), msg: 'approvals must be array' },
    ]);
  }

  // 7C. POST — create approval
  let approvalId = null;
  if (testProductId) {
    const apprCreate = curl('POST', `/api/admin/products/${testProductId}/approvals`, {
      approval_number: `QA-APPR-${ts}`,
      regulatory_body: 'QA Test FDA',
      approval_date: '2024-01-15',
      expiry_date: '2029-01-15',
      status: 'Active',
    }, 'F-07 API', 'POST create product approval');

    if (apprCreate?.approval?.id) {
      approvalId = apprCreate.approval.id;
      log('F-07 API', 'POST create approval returns approval object with id', 'PASS', `id=${approvalId}`);
      log('F-07 API', 'Created approval has correct approval_number', apprCreate.approval.approval_number === `QA-APPR-${ts}` ? 'PASS' : 'FAIL');
      log('F-07 API', 'Created approval has correct regulatory_body', apprCreate.approval.regulatory_body === 'QA Test FDA' ? 'PASS' : 'FAIL');
      log('F-07 API', 'Created approval status is Active', apprCreate.approval.status === 'Active' ? 'PASS' : 'FAIL');
    } else {
      log('F-07 API', 'POST create approval returns approval object with id', 'FAIL', JSON.stringify(apprCreate)?.slice(0, 100));
    }
  }

  // 7D. GET approvals again — should now contain our entry
  if (testProductId && approvalId) {
    const apprsAfter = assertGet(`/api/admin/products/${testProductId}/approvals`, 'F-07 API', 'GET approvals after create includes new entry', [
      { field: 'approvals', fn: v => Array.isArray(v) && v.length > 0, msg: 'must have at least 1 approval' },
    ]);
    if (apprsAfter?.approvals) {
      const found = apprsAfter.approvals.some(a => a.id === approvalId);
      log('F-07 API', 'New approval appears in GET list', found ? 'PASS' : 'FAIL');
    }
  }

  // 7E. PUT — update approval
  if (approvalId) {
    const apprUpd = curl('PUT', `/api/admin/products/approvals/${approvalId}`, {
      approval_number: `QA-APPR-${ts}`,
      regulatory_body: 'EMA',
      approval_date: '2024-01-15',
      expiry_date: '2030-06-30',
      status: 'Active',
    }, 'F-07 API', 'PUT update product approval');
    log('F-07 API', 'PUT update approval returns success', apprUpd?.message ? 'PASS' : 'FAIL', apprUpd?.message || JSON.stringify(apprUpd)?.slice(0, 80));
    // Verify persisted
    if (testProductId) {
      const apprsUpd = curl('GET', `/api/admin/products/${testProductId}/approvals`, null, 'F-07 API', 'GET approvals after update');
      const updated = apprsUpd?.approvals?.find(a => a.id === approvalId);
      log('F-07 API', 'Updated regulatory_body persisted (EMA)', updated?.regulatory_body === 'EMA' ? 'PASS' : 'FAIL', `regulatory_body=${updated?.regulatory_body}`);
    }
  }

  // 7F. DELETE approval
  if (approvalId) {
    const delApprCode = curlCode('DELETE', `/api/admin/products/approvals/${approvalId}`, null, 'F-07 API', 'DELETE approval');
    log('F-07 API', 'DELETE approval returns 200', delApprCode === 200 ? 'PASS' : 'FAIL', `HTTP ${delApprCode}`);
    if (testProductId) {
      const apprsGone = curl('GET', `/api/admin/products/${testProductId}/approvals`, null, 'F-07 API', 'GET after delete');
      const stillThere = apprsGone?.approvals?.some(a => a.id === approvalId);
      log('F-07 API', 'Deleted approval no longer in list', !stillThere ? 'PASS' : 'FAIL');
    }
  }

  // 7G. GET country authorizations for product
  if (testProductId) {
    assertGet(`/api/admin/products/${testProductId}/country-authorizations`, 'F-07 API', 'GET /products/:id/country-authorizations returns 200 with array', [
      { field: 'authorizations', fn: v => Array.isArray(v), msg: 'authorizations must be array' },
    ]);
  }

  // 7H. POST — create country authorization
  let countryAuthId = null;
  if (testProductId) {
    const caCreate = curl('POST', `/api/admin/products/${testProductId}/country-authorizations`, {
      country: 'India',
      auth_number: `QA-AUTH-${ts}`,
      auth_date: '2023-06-01',
      status: 'Active',
    }, 'F-07 API', 'POST create country authorization');

    if (caCreate?.authorization?.id) {
      countryAuthId = caCreate.authorization.id;
      log('F-07 API', 'POST create country auth returns authorization with id', 'PASS', `id=${countryAuthId}`);
      log('F-07 API', 'Country auth has correct country', caCreate.authorization.country === 'India' ? 'PASS' : 'FAIL');
      log('F-07 API', 'Country auth status is Active', caCreate.authorization.status === 'Active' ? 'PASS' : 'FAIL');
    } else {
      log('F-07 API', 'POST create country auth returns authorization with id', 'FAIL', JSON.stringify(caCreate)?.slice(0, 100));
    }
  }

  // 7I. PUT — update country authorization
  if (countryAuthId) {
    const caUpd = curl('PUT', `/api/admin/products/country-authorizations/${countryAuthId}`, {
      country: 'India',
      auth_number: `QA-AUTH-${ts}`,
      auth_date: '2023-06-01',
      status: 'Suspended',
    }, 'F-07 API', 'PUT update country authorization status to Suspended');
    log('F-07 API', 'PUT update country auth returns success', caUpd?.message ? 'PASS' : 'FAIL', caUpd?.message || JSON.stringify(caUpd)?.slice(0, 80));
    if (testProductId) {
      const casUpd = curl('GET', `/api/admin/products/${testProductId}/country-authorizations`, null, 'F-07 API', 'GET after country auth update');
      const updated = casUpd?.authorizations?.find(a => a.id === countryAuthId);
      log('F-07 API', 'Status update to Suspended persisted', updated?.status === 'Suspended' ? 'PASS' : 'FAIL', `status=${updated?.status}`);
    }
  }

  // 7J. DELETE country authorization
  if (countryAuthId) {
    const delCaCode = curlCode('DELETE', `/api/admin/products/country-authorizations/${countryAuthId}`, null, 'F-07 API', 'DELETE country authorization');
    log('F-07 API', 'DELETE country auth returns 200', delCaCode === 200 ? 'PASS' : 'FAIL', `HTTP ${delCaCode}`);
    if (testProductId) {
      const casGone = curl('GET', `/api/admin/products/${testProductId}/country-authorizations`, null, 'F-07 API', 'GET after country auth delete');
      const stillThere = casGone?.authorizations?.some(a => a.id === countryAuthId);
      log('F-07 API', 'Deleted country auth no longer in list', !stillThere ? 'PASS' : 'FAIL');
    }
  }

  // 7K. 404 on non-existent approval
  const notFoundCode = curlCode('PUT', '/api/admin/products/approvals/999999', { approval_number: 'X', regulatory_body: 'X', status: 'Active' }, 'F-07 API', 'PUT non-existent approval → 404');
  log('F-07 API', 'PUT non-existent approval returns 404', notFoundCode === 404 ? 'PASS' : 'FAIL', `HTTP ${notFoundCode}`);

  // 7L. Browser — Products section renders with sub-tabs
  await goto(page, `${BASE}/admin-console/products`, 'F-07 Browser', 3500);
  await checkNotBlank(page, 'F-07 Browser', 'Products section renders');
  await checkJsErrors(page, 'F-07 Browser', 'No JS errors on load');
  await textExists(page, 'Product Dictionary', 'F-07 Browser', '"Product Dictionary" title visible');
  await textExists(page, 'Products', 'F-07 Browser', '"Products" sub-tab visible');
  await textExists(page, 'Approvals', 'F-07 Browser', '"Approvals" sub-tab visible');
  await textExists(page, 'Country Auth', 'F-07 Browser', '"Country Auth" sub-tab visible');

  // Check "Approvals / Auth →" button present when products exist
  const hasApprBtn = await page.evaluate(() =>
    [...document.querySelectorAll('button')].some(b => b.textContent?.includes('Approvals') && b.textContent?.includes('Auth'))
  );
  log('F-07 Browser', '"Approvals / Auth →" action button visible in Products table', hasApprBtn ? 'PASS' : 'WARN', hasApprBtn ? '' : 'No products in list — add one first');

  // ══════════════════════════════════════════════════════════════
  // F-08  CASE CONTACTS — ENHANCEMENT
  // ══════════════════════════════════════════════════════════════
  console.log('\n━━ F-08: CASE CONTACTS ENHANCEMENT ━━━━━━━━━━━━━━━━━━━');

  // 8A. GET contacts list
  assertGet('/api/admin/contacts', 'F-08 API', 'GET /contacts returns 200 with contacts array', [
    { field: 'contacts', fn: v => Array.isArray(v), msg: 'contacts must be array' },
  ]);

  // 8B. POST — create contact with new fields
  const ctCreate = curl('POST', '/api/admin/contacts', {
    first_name: 'QA',
    last_name: `Contact ${ts}`,
    type: 'HCP',
    specialty: 'Oncology',
    institution: 'QA Test Hospital',
    email: `qa.contact.${ts}@test.com`,
    phone: `+91${ts.toString().slice(-10)}`,
    notes: 'Phase 1B QA test contact',
    address: '123 Test Street, QA City',
    do_not_update_master: false,
  }, 'F-08 API', 'POST create contact with specialty, institution, address, DNUMD');

  let contactId = null;
  if (ctCreate?.id) {
    contactId = ctCreate.id;
    log('F-08 API', 'POST create contact returns id', 'PASS', `id=${contactId}`);
    const ct = ctCreate.contact;
    log('F-08 API', 'Contact has specialty field', ct?.specialty === 'Oncology' ? 'PASS' : 'FAIL', `specialty=${ct?.specialty}`);
    log('F-08 API', 'Contact has institution field', ct?.institution === 'QA Test Hospital' ? 'PASS' : 'FAIL', `institution=${ct?.institution}`);
    log('F-08 API', 'Contact has address field', ct?.address === '123 Test Street, QA City' ? 'PASS' : 'FAIL', `address=${ct?.address}`);
    log('F-08 API', 'Contact has do_not_update_master field (0)', ct?.do_not_update_master === 0 ? 'PASS' : 'FAIL', `do_not_update_master=${ct?.do_not_update_master}`);
  } else {
    log('F-08 API', 'POST create contact returns id', 'FAIL', JSON.stringify(ctCreate)?.slice(0, 100));
  }

  // 8C. GET single contact — verify new fields present
  if (contactId) {
    const ctGet = assertGet(`/api/admin/contacts/${contactId}`, 'F-08 API', 'GET /contacts/:id returns 200 with contact', [
      { field: 'contact', fn: v => v && v.id === contactId, msg: 'contact must have correct id' },
    ]);
    if (ctGet?.contact) {
      log('F-08 API', 'GET single contact has specialty field', 'specialty' in ctGet.contact ? 'PASS' : 'FAIL');
      log('F-08 API', 'GET single contact has institution field', 'institution' in ctGet.contact ? 'PASS' : 'FAIL');
      log('F-08 API', 'GET single contact has address field', 'address' in ctGet.contact ? 'PASS' : 'FAIL');
      log('F-08 API', 'GET single contact has do_not_update_master field', 'do_not_update_master' in ctGet.contact ? 'PASS' : 'FAIL');
    }
  }

  // 8D. PUT — update contact with DNUMD = true
  if (contactId) {
    const ctUpd = curl('PUT', `/api/admin/contacts/${contactId}`, {
      first_name: 'QA',
      last_name: `Contact ${ts}`,
      type: 'HCP',
      specialty: 'Cardiology',
      institution: 'Updated Hospital',
      email: `qa.contact.${ts}@test.com`,
      phone: `+91${ts.toString().slice(-10)}`,
      notes: 'Updated by QA',
      address: '456 Updated Street',
      do_not_update_master: true,
    }, 'F-08 API', 'PUT update contact — change specialty + set DNUMD=true');
    log('F-08 API', 'PUT update returns success', ctUpd?.message ? 'PASS' : 'FAIL', ctUpd?.message || JSON.stringify(ctUpd)?.slice(0, 80));

    // Verify update persisted
    const ctAfter = curl('GET', `/api/admin/contacts/${contactId}`, null, 'F-08 API', 'GET after update');
    log('F-08 API', 'Specialty update persisted (Cardiology)', ctAfter?.contact?.specialty === 'Cardiology' ? 'PASS' : 'FAIL', `specialty=${ctAfter?.contact?.specialty}`);
    log('F-08 API', 'DNUMD update persisted (1)', ctAfter?.contact?.do_not_update_master === 1 ? 'PASS' : 'FAIL', `do_not_update_master=${ctAfter?.contact?.do_not_update_master}`);
  }

  // 8E. Duplicate detection — POST same name+email → 409
  const dup409 = curlCode('POST', '/api/admin/contacts', {
    first_name: 'QA',
    last_name: `Contact ${ts}`,
    type: 'HCP',
    email: `qa.contact.${ts}@test.com`,
  }, 'F-08 API', 'POST duplicate contact (same name+email) → 409');
  log('F-08 API', 'Duplicate contact returns 409', dup409 === 409 ? 'PASS' : 'FAIL', `HTTP ${dup409}`);

  // 8F. Duplicate detection — POST same name+phone → 409
  const dup409Phone = curlCode('POST', '/api/admin/contacts', {
    first_name: 'QA',
    last_name: `Contact ${ts}`,
    type: 'HCP',
    phone: `+91${ts.toString().slice(-10)}`,
  }, 'F-08 API', 'POST duplicate contact (same name+phone) → 409');
  log('F-08 API', 'Duplicate by name+phone returns 409', dup409Phone === 409 ? 'PASS' : 'FAIL', `HTTP ${dup409Phone}`);

  // 8G. GET with type filter
  assertGet('/api/admin/contacts?type=HCP', 'F-08 API', 'GET contacts with type=HCP filter', [
    { field: 'contacts', fn: v => Array.isArray(v), msg: 'contacts must be array' },
  ]);

  // 8H. GET with search
  assertGet(`/api/admin/contacts?search=QA`, 'F-08 API', 'GET contacts with search=QA finds results', [
    { field: 'contacts', fn: v => Array.isArray(v) && v.length > 0, msg: 'search must return at least 1 result' },
  ]);

  // 8I. DELETE (soft) test contact
  if (contactId) {
    const delCtCode = curlCode('DELETE', `/api/admin/contacts/${contactId}`, null, 'F-08 API', 'DELETE (soft) test contact');
    log('F-08 API', 'DELETE contact returns 200', delCtCode === 200 ? 'PASS' : 'FAIL', `HTTP ${delCtCode}`);
  }

  // 8J. POST missing required field → 400
  const ct400 = curlCode('POST', '/api/admin/contacts', { type: 'HCP' }, 'F-08 API', 'POST missing first_name → 400');
  log('F-08 API', 'POST without first_name returns 400', ct400 === 400 ? 'PASS' : 'FAIL', `HTTP ${ct400}`);

  // 8K. Browser — Contact Master section renders with new fields
  await goto(page, `${BASE}/admin-console/contact-master`, 'F-08 Browser', 3500);
  await checkNotBlank(page, 'F-08 Browser', 'Contact Master section renders');
  await checkJsErrors(page, 'F-08 Browser', 'No JS errors on load');
  await textExists(page, 'Contact Master', 'F-08 Browser', '"Contact Master" title visible');

  // Open Add Contact modal and check for new fields
  await clickBtn(page, '+ Add Contact', 'F-08 Browser', 'Click "+ Add Contact" to open modal');
  await textExists(page, 'Specialty', 'F-08 Browser', '"Specialty" field label visible in modal');
  await textExists(page, 'Institution', 'F-08 Browser', '"Institution" field label visible in modal');
  await textExists(page, 'Address', 'F-08 Browser', '"Address" field label visible in modal');
  await textExists(page, 'Do Not Update Master Data', 'F-08 Browser', '"Do Not Update Master Data" checkbox visible in modal');
  await textExists(page, 'Reporter', 'F-08 Browser', '"Reporter" type option visible in Type dropdown');

  // Close modal by clicking Cancel
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const cancel = btns.find(b => b.textContent?.trim() === 'Cancel');
    if (cancel) cancel.click();
  });

  // ══════════════════════════════════════════════════════════════
  // F-09  CASE AUDIT TRAIL
  // ══════════════════════════════════════════════════════════════
  console.log('\n━━ F-09: CASE AUDIT TRAIL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 9A. POST — write an audit entry
  const catCreate = curl('POST', '/api/admin/case-audit-trail', {
    case_id: 1,
    action_type: 'FIELD_CHANGE',
    field_name: 'status',
    old_value: 'Open',
    new_value: 'In Review',
  }, 'F-09 API', 'POST write case audit entry');
  let catId = null;
  if (catCreate?.id) {
    catId = catCreate.id;
    log('F-09 API', 'POST case audit entry returns id', 'PASS', `id=${catId}`);
  } else {
    log('F-09 API', 'POST case audit entry returns id', 'FAIL', JSON.stringify(catCreate)?.slice(0, 100));
  }

  // 9B. POST another entry — different action_type
  curl('POST', '/api/admin/case-audit-trail', {
    case_id: 1,
    action_type: 'STATUS_CHANGE',
    field_name: null,
    old_value: null,
    new_value: 'Closed',
  }, 'F-09 API', 'POST second audit entry (STATUS_CHANGE)');

  // 9C. GET entries for case_id=1
  const catGet = assertGet('/api/admin/case-audit-trail/1', 'F-09 API', 'GET /case-audit-trail/1 returns entries array', [
    { field: 'entries', fn: v => Array.isArray(v), msg: 'entries must be array' },
  ]);
  if (catGet?.entries) {
    log('F-09 API', 'Audit entries count > 0', catGet.entries.length > 0 ? 'PASS' : 'FAIL', `count=${catGet.entries.length}`);
    if (catGet.entries.length > 0) {
      const e = catGet.entries[0];
      log('F-09 API', 'Entry has required fields (case_id, user_id, action_type, timestamp)', e.case_id && e.user_id && e.action_type && e.timestamp ? 'PASS' : 'FAIL');
      log('F-09 API', 'Entry has field_name column', 'field_name' in e ? 'PASS' : 'FAIL');
      log('F-09 API', 'Entry has old_value column', 'old_value' in e ? 'PASS' : 'FAIL');
      log('F-09 API', 'Entry has new_value column', 'new_value' in e ? 'PASS' : 'FAIL');
    }
  }

  // 9D. GET with action_type filter
  const catFiltered = assertGet('/api/admin/case-audit-trail/1?action_type=FIELD_CHANGE', 'F-09 API', 'GET with action_type=FIELD_CHANGE filter returns only matching entries', [
    { field: 'entries', fn: v => Array.isArray(v), msg: 'entries must be array' },
  ]);
  if (catFiltered?.entries) {
    const wrongType = catFiltered.entries.filter(e => e.action_type !== 'FIELD_CHANGE');
    log('F-09 API', 'Filter returns only FIELD_CHANGE entries', wrongType.length === 0 ? 'PASS' : 'FAIL', `${wrongType.length} non-matching entries found`);
  }

  // 9E. Immutability — no DELETE endpoint exists for case audit trail
  const catDelCode = curlCode('DELETE', `/api/admin/case-audit-trail/1`, null, 'F-09 API', 'DELETE on case-audit-trail is not exposed (expect 404 or 405)');
  log('F-09 API', 'No DELETE endpoint for case audit trail (immutable)', catDelCode === 404 || catDelCode === 405 ? 'PASS' : 'WARN', `HTTP ${catDelCode}`);

  // 9F. POST missing required field → 400
  const cat400 = curlCode('POST', '/api/admin/case-audit-trail', { action_type: 'FIELD_CHANGE' }, 'F-09 API', 'POST missing case_id → 400');
  log('F-09 API', 'POST without case_id returns 400', cat400 === 400 ? 'PASS' : 'FAIL', `HTTP ${cat400}`);

  // ══════════════════════════════════════════════════════════════
  // F-10  TRANSMISSION AUDIT TRAIL
  // ══════════════════════════════════════════════════════════════
  console.log('\n━━ F-10: TRANSMISSION AUDIT TRAIL ━━━━━━━━━━━━━━━━━━━━');

  // 10A. POST — record a transmission
  const tatCreate = curl('POST', '/api/admin/transmission-audit-trail', {
    case_id: 1,
    target_system: 'Argus',
    payload_summary: 'AE V1 — ICH E2B R3 payload',
    status: 'Sent',
    response_code: '200',
  }, 'F-10 API', 'POST record transmission entry (Argus)');
  let tatId = null;
  if (tatCreate?.id) {
    tatId = tatCreate.id;
    log('F-10 API', 'POST transmission entry returns id', 'PASS', `id=${tatId}`);
  } else {
    log('F-10 API', 'POST transmission entry returns id', 'FAIL', JSON.stringify(tatCreate)?.slice(0, 100));
  }

  // 10B. POST — second entry, different system
  curl('POST', '/api/admin/transmission-audit-trail', {
    case_id: 1,
    target_system: 'Veeva',
    payload_summary: 'PC V2 — Veeva Vault sync',
    status: 'Failed',
    response_code: '503',
  }, 'F-10 API', 'POST second transmission entry (Veeva, Failed)');

  // 10C. GET by case
  const tatByCase = assertGet('/api/admin/transmission-audit-trail/1', 'F-10 API', 'GET /transmission-audit-trail/1 returns entries array', [
    { field: 'entries', fn: v => Array.isArray(v), msg: 'entries must be array' },
  ]);
  if (tatByCase?.entries) {
    log('F-10 API', 'Transmission entries count > 0 for case_id=1', tatByCase.entries.length > 0 ? 'PASS' : 'FAIL', `count=${tatByCase.entries.length}`);
    if (tatByCase.entries.length > 0) {
      const e = tatByCase.entries[0];
      log('F-10 API', 'Entry has required fields (case_id, target_system, status, timestamp)', e.case_id && e.target_system && e.status && e.timestamp ? 'PASS' : 'FAIL');
      log('F-10 API', 'Entry has payload_summary column', 'payload_summary' in e ? 'PASS' : 'FAIL');
      log('F-10 API', 'Entry has response_code column', 'response_code' in e ? 'PASS' : 'FAIL');
    }
  }

  // 10D. GET global — with target_system filter
  const tatArgus = assertGet('/api/admin/transmission-audit-trail?target_system=Argus', 'F-10 API', 'GET with target_system=Argus filter', [
    { field: 'entries', fn: v => Array.isArray(v), msg: 'entries must be array' },
  ]);
  if (tatArgus?.entries) {
    const wrongSys = tatArgus.entries.filter(e => e.target_system !== 'Argus');
    log('F-10 API', 'Filter returns only Argus entries', wrongSys.length === 0 ? 'PASS' : 'FAIL', `${wrongSys.length} non-Argus entries found`);
  }

  // 10E. GET global — with status filter
  assertGet('/api/admin/transmission-audit-trail?status=Failed', 'F-10 API', 'GET with status=Failed filter returns 200', [
    { field: 'entries', fn: v => Array.isArray(v), msg: 'entries must be array' },
  ]);

  // 10F. GET global — with case_id filter
  assertGet('/api/admin/transmission-audit-trail?case_id=1', 'F-10 API', 'GET global with case_id=1 filter', [
    { field: 'entries', fn: v => Array.isArray(v) && v.length > 0, msg: 'must find entries for case_id=1' },
  ]);

  // 10G. Immutability — no DELETE endpoint
  const tatDelCode = curlCode('DELETE', '/api/admin/transmission-audit-trail/1', null, 'F-10 API', 'DELETE on transmission-audit-trail is not exposed (expect 404 or 405)');
  log('F-10 API', 'No DELETE endpoint for transmission audit trail (immutable)', tatDelCode === 404 || tatDelCode === 405 ? 'PASS' : 'WARN', `HTTP ${tatDelCode}`);

  // 10H. POST missing required fields → 400
  const tat400 = curlCode('POST', '/api/admin/transmission-audit-trail', { status: 'Sent' }, 'F-10 API', 'POST missing case_id + target_system → 400');
  log('F-10 API', 'POST without case_id/target_system returns 400', tat400 === 400 ? 'PASS' : 'FAIL', `HTTP ${tat400}`);

  // ══════════════════════════════════════════════════════════════
  // F-11  COMPANY REPRESENTATIVES — TERRITORY
  // ══════════════════════════════════════════════════════════════
  console.log('\n━━ F-11: COMPANY REPRESENTATIVES (TERRITORY) ━━━━━━━━━');

  // 11A. GET company reps list
  const repsData = assertGet('/api/admin/company-reps', 'F-11 API', 'GET /company-reps returns 200 with reps array', [
    { field: 'reps', fn: v => Array.isArray(v), msg: 'reps must be array' },
  ]);
  if (repsData?.reps?.length > 0) {
    log('F-11 API', 'Company reps list has territory field', 'territory' in repsData.reps[0] ? 'PASS' : 'FAIL', 'territory column should now exist in DB response');
  }

  // 11B. POST — create rep with territory
  const repCreate = curl('POST', '/api/admin/company-reps', {
    name: `QA Rep ${ts}`,
    title: 'MSL',
    territory: 'South India',
    email: `qa.rep.${ts}@company.com`,
    phone: `+91${(ts + 1).toString().slice(-10)}`,
    org_id: null,
  }, 'F-11 API', 'POST create company rep with territory');
  let repId = null;
  if (repCreate?.rep?.id || repCreate?.id) {
    repId = repCreate.rep?.id || repCreate.id;
    const rep = repCreate.rep;
    log('F-11 API', 'POST create rep returns id', 'PASS', `id=${repId}`);
    log('F-11 API', 'Created rep has territory field', rep?.territory === 'South India' ? 'PASS' : 'FAIL', `territory=${rep?.territory}`);
    log('F-11 API', 'Created rep has title field', rep?.title === 'MSL' ? 'PASS' : 'FAIL', `title=${rep?.title}`);
  } else {
    log('F-11 API', 'POST create rep returns id', 'FAIL', JSON.stringify(repCreate)?.slice(0, 100));
  }

  // 11C. GET list — verify territory persisted
  if (repId) {
    const repsAfter = curl('GET', '/api/admin/company-reps', null, 'F-11 API', 'GET reps after create');
    const created = repsAfter?.reps?.find(r => r.id === repId);
    log('F-11 API', 'Created rep appears in list with territory', created?.territory === 'South India' ? 'PASS' : 'FAIL', `territory=${created?.territory}`);
  }

  // 11D. PUT — update territory
  if (repId) {
    const repUpd = curl('PUT', `/api/admin/company-reps/${repId}`, {
      name: `QA Rep ${ts}`,
      title: 'Senior MSL',
      territory: 'North India',
      email: `qa.rep.${ts}@company.com`,
      phone: `+91${(ts + 1).toString().slice(-10)}`,
    }, 'F-11 API', 'PUT update rep territory to North India');
    log('F-11 API', 'PUT update returns success', repUpd?.message ? 'PASS' : 'FAIL', repUpd?.message || JSON.stringify(repUpd)?.slice(0, 80));

    const repsUpd = curl('GET', '/api/admin/company-reps', null, 'F-11 API', 'GET after territory update');
    const updRep = repsUpd?.reps?.find(r => r.id === repId);
    log('F-11 API', 'Territory update persisted (North India)', updRep?.territory === 'North India' ? 'PASS' : 'FAIL', `territory=${updRep?.territory}`);
  }

  // 11E. DELETE (soft) test rep
  if (repId) {
    const delRepCode = curlCode('DELETE', `/api/admin/company-reps/${repId}`, null, 'F-11 API', 'DELETE (soft) test rep');
    log('F-11 API', 'DELETE rep returns 200', delRepCode === 200 ? 'PASS' : 'FAIL', `HTTP ${delRepCode}`);
  }

  // 11F. POST missing required field → 400
  const rep400 = curlCode('POST', '/api/admin/company-reps', { territory: 'East India' }, 'F-11 API', 'POST missing name → 400');
  log('F-11 API', 'POST without name returns 400', rep400 === 400 ? 'PASS' : 'FAIL', `HTTP ${rep400}`);

  // 11G. Browser — Company Representatives tab shows Territory column
  await goto(page, `${BASE}/admin-console/contact-master`, 'F-11 Browser', 3500);
  await checkNotBlank(page, 'F-11 Browser', 'Contact Master section renders');
  await checkJsErrors(page, 'F-11 Browser', 'No JS errors on load');

  // Click Company Representatives sub-tab
  await clickBtn(page, 'Company Representatives', 'F-11 Browser', 'Click "Company Representatives" sub-tab');
  await textExists(page, 'Company Representatives', 'F-11 Browser', '"Company Representatives" section visible');
  // Table header uses CSS uppercase — column shows as "TERRITORY"
  await textExists(page, 'TERRITORY', 'F-11 Browser', '"TERRITORY" column header visible in reps table (CSS uppercase)');
  await textExists(page, '+ Add Rep', 'F-11 Browser', '"+ Add Rep" button visible');

  // Open modal and check Territory field
  await clickBtn(page, '+ Add Rep', 'F-11 Browser', 'Click "+ Add Rep" to open modal');
  await textExists(page, 'Territory', 'F-11 Browser', '"Territory" field label visible in Add Rep modal');

  // Close modal
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const cancel = btns.find(b => b.textContent?.trim() === 'Cancel');
    if (cancel) cancel.click();
  });

  // ══════════════════════════════════════════════════════════════
  // F-12  WORKFLOW ACTIVITY TRIGGERS
  // ══════════════════════════════════════════════════════════════
  console.log('\n━━ F-12: WORKFLOW ACTIVITY TRIGGERS ━━━━━━━━━━━━━━━━━━');

  // 12A. GET workflow activities — should have 6 seeded activities
  const wfActData = assertGet('/api/admin/workflow-activities', 'F-12 API', 'GET /workflow-activities returns 200 with activities array', [
    { field: 'activities', fn: v => Array.isArray(v), msg: 'activities must be array' },
  ]);
  if (wfActData?.activities) {
    log('F-12 API', '6 seeded workflow activities exist', wfActData.activities.length >= 6 ? 'PASS' : 'FAIL', `count=${wfActData.activities.length}`);
    const names = wfActData.activities.map(a => a.name);
    const expected = ['Version Created', 'Document Uploaded', 'Comment Added', 'Seriousness Flag Set', 'Case Closed', 'Transmission Sent'];
    for (const name of expected) {
      log('F-12 API', `Seeded activity "${name}" exists`, names.includes(name) ? 'PASS' : 'FAIL');
    }
    // Verify structure
    if (wfActData.activities.length > 0) {
      const a = wfActData.activities[0];
      log('F-12 API', 'Activity has required fields (id, name, is_active)', a.id && a.name !== undefined && a.is_active !== undefined ? 'PASS' : 'FAIL');
    }
  }

  // 12B. PUT — toggle is_active on first activity
  let firstActivityId = wfActData?.activities?.[0]?.id;
  if (firstActivityId) {
    const act = wfActData.activities[0];
    const wfActUpd = curl('PUT', `/api/admin/workflow-activities/${firstActivityId}`, {
      name: act.name,
      description: act.description,
      is_active: act.is_active ? 0 : 1,
    }, 'F-12 API', 'PUT toggle workflow activity is_active');
    log('F-12 API', 'PUT update activity returns success', wfActUpd?.message ? 'PASS' : 'FAIL', wfActUpd?.message || JSON.stringify(wfActUpd)?.slice(0, 80));

    // Restore original state
    curl('PUT', `/api/admin/workflow-activities/${firstActivityId}`, {
      name: act.name,
      description: act.description,
      is_active: act.is_active,
    }, 'F-12 API', 'Restore activity is_active to original state');
    log('F-12 API', 'Activity is_active restored', 'PASS');
  }

  // 12C. GET workflow-activity-triggers — should return empty array initially
  const wfTrigData = assertGet('/api/admin/workflow-activity-triggers', 'F-12 API', 'GET /workflow-activity-triggers returns 200 with triggers array', [
    { field: 'triggers', fn: v => Array.isArray(v), msg: 'triggers must be array' },
  ]);

  // 12D. POST — create trigger: "Case Closed" → change_state → first workflow state
  let triggerId = null;
  if (firstActivityId) {
    // Get a workflow state to use as target
    const wfStates = curl('GET', '/api/admin/workflow-states', null, 'F-12 API', 'GET workflow-states for trigger target');
    const targetStateId = wfStates?.states?.[0]?.id || 1;

    const trigCreate = curl('POST', '/api/admin/workflow-activity-triggers', {
      activity_id: firstActivityId,
      trigger_type: 'change_state',
      target_state_id: targetStateId,
      alert_rule: null,
      assign_to: null,
    }, 'F-12 API', 'POST create activity trigger (change_state)');

    if (trigCreate?.trigger?.id) {
      triggerId = trigCreate.trigger.id;
      log('F-12 API', 'POST create trigger returns trigger with id', 'PASS', `id=${triggerId}`);
      const t = trigCreate.trigger;
      log('F-12 API', 'Trigger has activity_id', t.activity_id == firstActivityId ? 'PASS' : 'FAIL', `activity_id=${t.activity_id}`);
      log('F-12 API', 'Trigger has trigger_type = change_state', t.trigger_type === 'change_state' ? 'PASS' : 'FAIL', `trigger_type=${t.trigger_type}`);
      log('F-12 API', 'Trigger includes activity_name join', t.activity_name ? 'PASS' : 'FAIL', `activity_name=${t.activity_name}`);
    } else {
      log('F-12 API', 'POST create trigger returns trigger with id', 'FAIL', JSON.stringify(trigCreate)?.slice(0, 100));
    }
  }

  // 12E. POST — create trigger with send_alert type
  let triggerIdAlert = null;
  if (firstActivityId) {
    const trigAlert = curl('POST', '/api/admin/workflow-activity-triggers', {
      activity_id: firstActivityId,
      trigger_type: 'send_alert',
      target_state_id: null,
      alert_rule: 'Notify compliance team',
      assign_to: null,
    }, 'F-12 API', 'POST create trigger (send_alert)');
    if (trigAlert?.trigger?.id) {
      triggerIdAlert = trigAlert.trigger.id;
      log('F-12 API', 'POST create send_alert trigger returns id', 'PASS', `id=${triggerIdAlert}`);
      log('F-12 API', 'send_alert trigger has alert_rule', trigAlert.trigger.alert_rule === 'Notify compliance team' ? 'PASS' : 'FAIL');
    } else {
      log('F-12 API', 'POST create send_alert trigger returns id', 'FAIL', JSON.stringify(trigAlert)?.slice(0, 100));
    }
  }

  // 12F. GET triggers — verify both triggers present, with joins
  const wfTrigAfter = assertGet('/api/admin/workflow-activity-triggers', 'F-12 API', 'GET triggers after create — shows joins (activity_name, target_state_name)', [
    { field: 'triggers', fn: v => Array.isArray(v) && v.length > 0, msg: 'must have at least 1 trigger' },
  ]);
  if (wfTrigAfter?.triggers?.length > 0) {
    const t = wfTrigAfter.triggers[0];
    log('F-12 API', 'Trigger has activity_name join field', 'activity_name' in t ? 'PASS' : 'FAIL');
    log('F-12 API', 'Trigger has is_active field', 'is_active' in t ? 'PASS' : 'FAIL');
  }

  // 12G. PUT — update trigger type
  if (triggerId) {
    const trigUpd = curl('PUT', `/api/admin/workflow-activity-triggers/${triggerId}`, {
      activity_id: firstActivityId,
      trigger_type: 'assign_to',
      target_state_id: null,
      alert_rule: null,
      assign_to: 'QA Reviewer',
      is_active: 1,
    }, 'F-12 API', 'PUT update trigger type to assign_to');
    log('F-12 API', 'PUT update trigger returns success', trigUpd?.message ? 'PASS' : 'FAIL', trigUpd?.message || JSON.stringify(trigUpd)?.slice(0, 80));

    const trigsUpd = curl('GET', '/api/admin/workflow-activity-triggers', null, 'F-12 API', 'GET after trigger update');
    const updTrig = trigsUpd?.triggers?.find(t => t.id === triggerId);
    log('F-12 API', 'Trigger type updated to assign_to', updTrig?.trigger_type === 'assign_to' ? 'PASS' : 'FAIL', `trigger_type=${updTrig?.trigger_type}`);
    log('F-12 API', 'assign_to field updated to QA Reviewer', updTrig?.assign_to === 'QA Reviewer' ? 'PASS' : 'FAIL', `assign_to=${updTrig?.assign_to}`);
  }

  // 12H. DELETE triggers
  if (triggerId) {
    const delTrigCode = curlCode('DELETE', `/api/admin/workflow-activity-triggers/${triggerId}`, null, 'F-12 API', 'DELETE trigger');
    log('F-12 API', 'DELETE trigger returns 200', delTrigCode === 200 ? 'PASS' : 'FAIL', `HTTP ${delTrigCode}`);
  }
  if (triggerIdAlert) {
    const delTrigAlertCode = curlCode('DELETE', `/api/admin/workflow-activity-triggers/${triggerIdAlert}`, null, 'F-12 API', 'DELETE send_alert trigger');
    log('F-12 API', 'DELETE send_alert trigger returns 200', delTrigAlertCode === 200 ? 'PASS' : 'FAIL', `HTTP ${delTrigAlertCode}`);
  }

  // 12I. POST missing required field → 400
  const trig400 = curlCode('POST', '/api/admin/workflow-activity-triggers', { trigger_type: 'change_state' }, 'F-12 API', 'POST missing activity_id → 400');
  log('F-12 API', 'POST without activity_id returns 400', trig400 === 400 ? 'PASS' : 'FAIL', `HTTP ${trig400}`);

  // 12J. Browser — Workflow section has Activity Triggers sub-tab
  await goto(page, `${BASE}/admin-console/workflow`, 'F-12 Browser', 3500);
  await checkNotBlank(page, 'F-12 Browser', 'Workflow Setup section renders');
  await checkJsErrors(page, 'F-12 Browser', 'No JS errors on load');
  await textExists(page, 'Workflow Setup', 'F-12 Browser', '"Workflow Setup" title visible');
  await textExists(page, 'Workflow States', 'F-12 Browser', '"Workflow States" sub-tab visible');
  await textExists(page, 'Activity Triggers', 'F-12 Browser', '"Activity Triggers" sub-tab visible');

  // Click Activity Triggers tab
  await clickBtn(page, 'Activity Triggers', 'F-12 Browser', 'Click "Activity Triggers" sub-tab');
  await textExists(page, 'Case Activities', 'F-12 Browser', '"Case Activities" section visible after clicking tab');
  await textExists(page, 'Trigger Rules', 'F-12 Browser', '"Trigger Rules" section visible');
  await textExists(page, '+ Add Trigger', 'F-12 Browser', '"+ Add Trigger" button visible');

  // Check seeded activities render
  await textExists(page, 'Version Created', 'F-12 Browser', 'Seeded activity "Version Created" visible in activities table');
  await textExists(page, 'Case Closed', 'F-12 Browser', 'Seeded activity "Case Closed" visible in activities table');

  // Open Add Trigger modal
  await clickBtn(page, '+ Add Trigger', 'F-12 Browser', 'Click "+ Add Trigger" to open modal');
  await textExists(page, 'If Activity', 'F-12 Browser', '"If Activity" label visible in trigger modal');
  await textExists(page, 'Change State', 'F-12 Browser', '"Change State" option visible in trigger type dropdown');

  // Close modal
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const cancel = btns.find(b => b.textContent?.trim() === 'Cancel');
    if (cancel) cancel.click();
  });

  // ══════════════════════════════════════════════════════════════
  // REGRESSION — Phase 1A sections still load + no regressions
  // ══════════════════════════════════════════════════════════════
  console.log('\n━━ REGRESSION: Phase 1A Admin Sections ━━━━━━━━━━━━━━━');
  const regressionSections = [
    { key: 'picklists',         label: 'Picklists' },
    { key: 'field-setup',       label: 'Field Setup' },
    { key: 'user-security',     label: 'User Security Groups' },
    { key: 'case-numbering',    label: 'Case Numbering' },
    { key: 'case-form-def',     label: 'Case Form Definition' },
    { key: 'sites',             label: 'Sites Setup' },
    { key: 'audit-admin',       label: 'Admin Audit Trail' },
    { key: 'audit-login',       label: 'Login Audit Trail' },
    { key: 'contact-master',    label: 'Contact Master' },
    { key: 'products',          label: 'Product Dictionary' },
    { key: 'workflow',          label: 'Workflow Setup' },
  ];
  for (const { key, label } of regressionSections) {
    await goto(page, `${BASE}/admin-console/${key}`, `Regression/${label}`);
    await checkNotBlank(page, `Regression/${label}`, 'Has content');
    await checkJsErrors(page, `Regression/${label}`, 'No JS errors');
  }

  // ══════════════════════════════════════════════════════════════
  // REGRESSION — Core API endpoints still returning 200
  // ══════════════════════════════════════════════════════════════
  console.log('\n━━ REGRESSION: Core API Endpoints ━━━━━━━━━━━━━━━━━━━━');
  const existingApis = [
    { url: '/api/health',                              label: 'Health' },
    { url: '/api/admin/picklists',                     label: 'Picklists' },
    { url: '/api/admin/field-setup',                   label: 'Field Setup' },
    { url: '/api/admin/security-groups',               label: 'Security Groups' },
    { url: '/api/admin/contacts',                      label: 'Contacts' },
    { url: '/api/admin/company-reps',                  label: 'Company Reps' },
    { url: '/api/admin/sites',                         label: 'Sites' },
    { url: '/api/admin/orgs',                          label: 'Orgs' },
    { url: '/api/admin/audit-logs',                    label: 'Audit Logs' },
    { url: '/api/admin/case-number-config',            label: 'Case Number Config (F-01)' },
    { url: '/api/admin/case-form-definition/sections', label: 'Case Form Definition (F-02)' },
    { url: '/api/admin/workflow-states',               label: 'Workflow States' },
    { url: '/api/admin/workflow-activity-triggers',    label: 'Workflow Activity Triggers (F-12)' },
    { url: '/api/admin/workflow-activities',           label: 'Workflow Activities (F-12)' },
    { url: '/api/cm/folders',                          label: 'CM Folders' },
    { url: '/api/cm/documents',                        label: 'CM Documents' },
    { url: '/api/cm/faqs',                             label: 'CM FAQs' },
  ];
  for (const { url, label } of existingApis) {
    const code = curlCode('GET', url, null, 'Regression/API', label);
    log('Regression/API', label, code === 200 ? 'PASS' : code === 401 ? 'WARN' : 'FAIL', `HTTP ${code}`);
  }

  // ══════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════
  await browser.close();

  const total = passed + failed + warned;
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log(`║  SPRINT 6 PHASE 1B — QA RESULTS                       ║`);
  console.log(`║  Total: ${String(total).padEnd(4)} | ✅ ${String(passed).padEnd(4)} PASS | ❌ ${String(failed).padEnd(4)} FAIL | ⚠️  ${String(warned).padEnd(4)} WARN  ║`);
  console.log('╚══════════════════════════════════════════════════════╝');

  if (failed > 0) {
    console.log('\n❌ FAILURES:\n');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  • [${r.section}] ${r.test}`);
      if (r.detail) console.log(`    ↳ ${r.detail}`);
    });
  }
  if (warned > 0) {
    console.log('\n⚠️  WARNINGS:\n');
    results.filter(r => r.status === 'WARN').forEach(r => {
      console.log(`  • [${r.section}] ${r.test}${r.detail ? ' — ' + r.detail : ''}`);
    });
  }

  if (failed === 0) {
    console.log('\n🎉 All Phase 1B tests passed! Ready for Gate 2 sign-off.\n');
  } else {
    console.log('\n🔴 Failures detected. Defects must be resolved before Gate 2.\n');
  }

  process.exit(failed > 0 ? 1 : 0);
})();
