'use strict';
/**
 * Sprint 6 — Phase 1A Full Test Suite
 * QA: Karthik & Shivani
 *
 * Coverage:
 *   F-01  Case Number Configuration  — API + Browser
 *   F-02  Case Form Definition        — API + Browser
 *   F-03  Field Setup (expanded)      — API
 *   F-04  Picklists (with category)   — API + Browser
 *   F-05  Sites Setup (4 config tabs) — API + Browser
 *   F-06  Security Groups (casemgmt)  — API + Browser
 *
 * Credentials: superadmin / Manager@123
 */

const puppeteer  = require('puppeteer-core');
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
  const line = `  ${icon} [${section}] ${test}${detail ? ' — ' + detail : ''}`;
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
    const raw  = execSync(cmd, { timeout: 10000 }).toString();
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
  log(section, label, 'PASS', `HTTP 200`);
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

async function waitFor(page, selector, section, label, timeout = 9000) {
  try {
    await page.waitForSelector(selector, { timeout });
    log(section, label, 'PASS');
    return true;
  } catch {
    const body = await page.evaluate(() => document.body?.innerText?.slice(0, 200) || '').catch(() => '');
    log(section, label, 'FAIL', body.slice(0, 100).replace(/\n/g, ' ') || 'Selector not found');
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

async function clickText(page, text, section, label) {
  try {
    const clicked = await page.evaluate((t) => {
      const els = [...document.querySelectorAll('*')];
      const el  = els.find(e =>
        (e.tagName === 'BUTTON' || e.tagName === 'A' || e.className?.includes('tab') || e.className?.includes('btn')) &&
        e.textContent?.trim().includes(t)
      ) || els.find(e => e.textContent?.trim() === t && window.getComputedStyle(e).cursor === 'pointer');
      if (el) { el.click(); return true; }
      return false;
    }, text);
    if (!clicked) { log(section, label, 'FAIL', `Button/tab "${text}" not found`); return false; }
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
  console.log('║  MIMS Sprint 6 — Phase 1A Full QA Test Suite         ║');
  console.log('║  F-01 Case Numbering | F-02 Case Form Def             ║');
  console.log('║  F-03 Field Setup    | F-04 Picklists                 ║');
  console.log('║  F-05 Sites Config   | F-06 Security Groups           ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // ──────────────────────────────────────────────────────────────
  // SETUP — get auth token
  // ──────────────────────────────────────────────────────────────
  console.log('━━ AUTH SETUP ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  let token = '', adminUser = null, adminModules = [];
  try {
    const loginRes = execSync(
      `curl -s -X POST ${API}/api/auth/login -H "Content-Type: application/json" -d '{"email":"superadmin","password":"Manager@123"}'`,
      { timeout: 8000 }
    ).toString();
    const parsed = JSON.parse(loginRes);
    token        = parsed.token || '';
    adminUser    = parsed.user  || null;
    adminModules = parsed.modules || [];
    log('Auth', 'Login as superadmin', token ? 'PASS' : 'FAIL', token ? 'Token received' : parsed.error || 'No token');
  } catch (e) {
    log('Auth', 'Login as superadmin', 'FAIL', e.message.slice(0, 100));
  }
  AUTH_HEADER = token ? `-H "Authorization: Bearer ${token}"` : '';
  if (!token) { console.log('\n❌ Cannot proceed without auth token. Is the server running on port 3000?'); process.exit(1); }

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
  // F-01  CASE NUMBER CONFIGURATION
  // ══════════════════════════════════════════════════════════════
  console.log('\n━━ F-01: CASE NUMBER CONFIG ━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 1A. GET all configs
  assertGet('/api/admin/case-number-config', 'F-01 API', 'GET all configs returns 200 with configs array', [
    { field: 'configs', fn: v => Array.isArray(v), msg: 'configs must be an array' },
  ]);

  // 1B. Preview endpoint — verify format
  const prevData = assertGet(
    '/api/admin/case-number-config/preview?prefix=MI&separator=-&include_year=1&include_month=0&seq_length=5',
    'F-01 API', 'GET preview returns generated string', [
      { field: 'preview', fn: v => typeof v === 'string' && v.startsWith('MI'), msg: 'preview must start with prefix "MI"' },
    ]
  );
  if (prevData?.preview) log('F-01 API', `Preview value = "${prevData.preview}"`, 'PASS');

  // 1C. Preview with month included
  const prevMonth = assertGet(
    '/api/admin/case-number-config/preview?prefix=AE&separator=-&include_year=1&include_month=1&seq_length=4',
    'F-01 API', 'Preview with month flag includes 4 parts', [
      { field: 'preview', fn: v => v && v.split('-').length >= 4, msg: 'Preview should have 4+ dash-separated parts' },
    ]
  );
  if (prevMonth?.preview) log('F-01 API', `Monthly preview = "${prevMonth.preview}"`, 'PASS');

  // 1D. Preview with separator=none
  const prevNone = assertGet(
    '/api/admin/case-number-config/preview?prefix=CASE&separator=none&include_year=1&include_month=0&seq_length=6',
    'F-01 API', 'Preview with separator=none has no dashes', [
      { field: 'preview', fn: v => v && !v.includes('-'), msg: 'separator=none should produce no dashes' },
    ]
  );
  if (prevNone?.preview) log('F-01 API', `No-separator preview = "${prevNone.preview}"`, 'PASS');

  // 1E. POST — create global config
  const cnCreate = curl('POST', '/api/admin/case-number-config', {
    org_id: null, case_type: 'TEST', prefix: 'QA', separator: '-',
    include_year: true, include_month: false, seq_length: 5,
  }, 'F-01 API', 'POST create/upsert global config');
  if (cnCreate?.config) {
    log('F-01 API', 'POST create returns config object', 'PASS', `id=${cnCreate.config.id}`);
    if (cnCreate.config.preview) log('F-01 API', `Config preview = "${cnCreate.config.preview}"`, 'PASS');
  } else {
    log('F-01 API', 'POST create returns config object', 'FAIL', JSON.stringify(cnCreate)?.slice(0, 100));
  }

  // 1F. POST — missing prefix → 400
  const cnBad = curlCode('POST', '/api/admin/case-number-config', { case_type: 'ALL' }, 'F-01 API', 'POST without prefix → 400');
  log('F-01 API', 'POST without prefix returns 400', cnBad === 400 ? 'PASS' : 'FAIL', `HTTP ${cnBad}`);

  // 1G. POST — upsert same case_type (verify explicit update, not duplicate error)
  const cnUpdate = curl('POST', '/api/admin/case-number-config', {
    org_id: null, case_type: 'TEST', prefix: 'QA2', separator: '_',
    include_year: false, include_month: false, seq_length: 6,
  }, 'F-01 API', 'POST upsert same case_type updates in place');
  if (cnUpdate?.config?.prefix === 'QA2') {
    log('F-01 API', 'Upsert updates prefix correctly', 'PASS', `prefix=${cnUpdate.config.prefix}`);
  } else if (cnUpdate?.error) {
    log('F-01 API', 'Upsert updates prefix correctly', 'FAIL', `error: ${cnUpdate.error}`);
  } else {
    // prefix may lag by one select — re-fetch to confirm
    const cnCheck = curl('GET', '/api/admin/case-number-config', null, 'F-01 API', 'Fetch all to verify upsert prefix');
    const updated = cnCheck?.configs?.find(c => c.case_type === 'TEST' && c.org_id === null);
    log('F-01 API', 'Upsert updates prefix correctly', updated?.prefix === 'QA2' ? 'PASS' : 'FAIL', `prefix=${updated?.prefix}`);
  }

  // 1H. DELETE the test config
  const allCn = curl('GET', '/api/admin/case-number-config', null, 'F-01 API', 'GET configs to find test id');
  const testCn = allCn?.configs?.find(c => c.case_type === 'TEST' && c.org_id === null);
  if (testCn) {
    const delCode = curlCode('DELETE', `/api/admin/case-number-config/${testCn.id}`, null, 'F-01 API', 'DELETE test config');
    log('F-01 API', 'DELETE test config returns 200', delCode === 200 ? 'PASS' : 'FAIL', `HTTP ${delCode}`);
    // Verify it's gone
    const afterDel = curl('GET', '/api/admin/case-number-config', null, 'F-01 API', 'Verify deleted config gone');
    const stillExists = afterDel?.configs?.find(c => c.case_type === 'TEST' && c.org_id === null);
    log('F-01 API', 'Deleted config no longer in list', !stillExists ? 'PASS' : 'FAIL');
  }

  // 1I. DELETE non-existent → 404
  const delMissCode = curlCode('DELETE', '/api/admin/case-number-config/999999', null, 'F-01 API', 'DELETE non-existent → 404');
  log('F-01 API', 'DELETE non-existent returns 404', delMissCode === 404 ? 'PASS' : 'FAIL', `HTTP ${delMissCode}`);

  // 1J. Browser — section loads
  await goto(page, `${BASE}/admin-console/case-numbering`, 'F-01 Browser');
  await checkNotBlank(page, 'F-01 Browser', 'Case Numbering section renders');
  await checkJsErrors(page, 'F-01 Browser', 'No JS errors');
  await textExists(page, 'Case Numbering', 'F-01 Browser', 'Section header "Case Numbering" visible');
  await textExists(page, 'Preview', 'F-01 Browser', 'Preview label visible on page');

  // ══════════════════════════════════════════════════════════════
  // F-02  CASE FORM DEFINITION
  // ══════════════════════════════════════════════════════════════
  console.log('\n━━ F-02: CASE FORM DEFINITION ━━━━━━━━━━━━━━━━━━━━━━━━');

  // 2A. GET all sections master list
  const sectionsData = assertGet('/api/admin/case-form-definition/sections', 'F-02 API', 'GET /sections returns MI/AE/PC master list', [
    { field: 'sections.MI', fn: v => Array.isArray(v) && v.length === 5, msg: 'MI must have 5 sections' },
    { field: 'sections.AE', fn: v => Array.isArray(v) && v.length === 10, msg: 'AE must have 10 sections' },
    { field: 'sections.PC', fn: v => Array.isArray(v) && v.length === 8, msg: 'PC must have 8 sections' },
  ]);
  if (sectionsData?.sections) {
    log('F-02 API', `MI sections (${sectionsData.sections.MI?.length}): ${sectionsData.sections.MI?.join(' | ')}`, 'PASS');
    log('F-02 API', `AE sections (${sectionsData.sections.AE?.length})`, 'PASS');
    log('F-02 API', `PC sections (${sectionsData.sections.PC?.length})`, 'PASS');
  }

  // 2B. GET MI definition (global)
  const miDef = assertGet('/api/admin/case-form-definition?case_type=MI', 'F-02 API', 'GET MI definition returns sections array', [
    { field: 'sections', fn: v => Array.isArray(v) && v.length === 5, msg: 'MI must return 5 sections' },
    { field: 'case_type', fn: v => v === 'MI', msg: 'case_type must be MI' },
  ]);
  if (miDef?.sections) {
    const allVisible = miDef.sections.every(s => s.is_visible === 1);
    log('F-02 API', 'Default MI sections all visible (is_visible=1)', allVisible ? 'PASS' : 'WARN', allVisible ? '' : 'Some hidden by default');
  }

  // 2C. GET AE definition
  assertGet('/api/admin/case-form-definition?case_type=AE', 'F-02 API', 'GET AE definition returns 10 sections', [
    { field: 'sections', fn: v => Array.isArray(v) && v.length === 10, msg: 'AE must return 10 sections' },
  ]);

  // 2D. GET PC definition
  assertGet('/api/admin/case-form-definition?case_type=PC', 'F-02 API', 'GET PC definition returns 8 sections', [
    { field: 'sections', fn: v => Array.isArray(v) && v.length === 8, msg: 'PC must return 8 sections' },
  ]);

  // 2E. GET without case_type → 400
  const noTypCode = curlCode('GET', '/api/admin/case-form-definition', null, 'F-02 API', 'GET without case_type → 400');
  log('F-02 API', 'GET without case_type returns 400', noTypCode === 400 ? 'PASS' : 'FAIL', `HTTP ${noTypCode}`);

  // 2F. POST — save MI definition with one section hidden
  const miSectionsToSave = miDef?.sections?.map((s, i) => ({
    section_name: s.section_name,
    is_visible:   i === 2 ? 0 : 1,   // hide the 3rd section for test
    field_overrides: {},
  })) || [];
  const saveRes = curl('POST', '/api/admin/case-form-definition', {
    org_id: null, case_type: 'MI', sections: miSectionsToSave,
  }, 'F-02 API', 'POST save MI definition (hide 1 section)');
  if (saveRes?.ok) {
    log('F-02 API', 'POST save returns ok=true', 'PASS', `saved=${saveRes.saved}`);
  } else {
    log('F-02 API', 'POST save returns ok=true', 'FAIL', JSON.stringify(saveRes)?.slice(0, 100));
  }

  // 2G. GET MI after save — verify override persisted
  const miAfter = assertGet('/api/admin/case-form-definition?case_type=MI', 'F-02 API', 'GET MI after save reflects hidden section', [
    { field: 'sections', fn: v => Array.isArray(v) && v.length === 5, msg: 'Still 5 sections after save' },
  ]);
  if (miAfter?.sections) {
    const hidden = miAfter.sections.filter(s => s.is_visible === 0);
    log('F-02 API', `Section visibility override persisted (${hidden.length} hidden)`, hidden.length === 1 ? 'PASS' : 'FAIL', hidden.map(s => s.section_name).join(', ') || 'none');
  }

  // 2H. Restore — set all visible again
  if (miSectionsToSave.length) {
    const restore = miSectionsToSave.map(s => ({ ...s, is_visible: 1 }));
    curl('POST', '/api/admin/case-form-definition', { org_id: null, case_type: 'MI', sections: restore }, 'F-02 API', 'Restore MI to all-visible');
  }

  // 2I. POST — missing sections array → 400
  const badPost = curlCode('POST', '/api/admin/case-form-definition', { case_type: 'MI' }, 'F-02 API', 'POST without sections → 400');
  log('F-02 API', 'POST without sections returns 400', badPost === 400 ? 'PASS' : 'FAIL', `HTTP ${badPost}`);

  // 2J. Browser
  await goto(page, `${BASE}/admin-console/case-form-def`, 'F-02 Browser');
  await checkNotBlank(page, 'F-02 Browser', 'Case Form Definition section renders');
  await checkJsErrors(page, 'F-02 Browser', 'No JS errors');
  await textExists(page, 'Case Form', 'F-02 Browser', '"Case Form" text visible');
  // Toggle buttons MI / AE / PC
  await textExists(page, 'MI', 'F-02 Browser', 'MI case type button visible');
  await textExists(page, 'AE', 'F-02 Browser', 'AE case type button visible');
  await textExists(page, 'PC', 'F-02 Browser', 'PC case type button visible');

  // ══════════════════════════════════════════════════════════════
  // F-03  FIELD SETUP (EXPANDED 100+ FIELDS)
  // ══════════════════════════════════════════════════════════════
  console.log('\n━━ F-03: FIELD SETUP ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 3A. GET field-setup — verify many sections exist
  const fsData = assertGet('/api/admin/field-setup', 'F-03 API', 'GET /field-setup returns 200 with fields', [
    { field: 'fields', fn: v => Array.isArray(v), msg: 'fields must be array' },
  ]);

  if (fsData?.fields) {
    const count = fsData.fields.length;
    log('F-03 API', `Total fields in setup: ${count}`, count >= 50 ? 'PASS' : 'WARN', count < 50 ? `Only ${count} — expected 100+` : '');

    // Check sections present
    const sections = [...new Set(fsData.fields.map(f => f.section_name))];
    log('F-03 API', `Distinct sections: ${sections.length}`, sections.length >= 10 ? 'PASS' : 'WARN', sections.join(', ').slice(0, 120));

    const expectedSections = [
      'Contact / Requestor', 'Case Information',
      'AE — General', 'AE — Patient Information', 'AE — Events & Seriousness',
      'PC — General', 'PC — Product Information', 'MI — Category & Product',
    ];
    for (const s of expectedSections) {
      const found = sections.includes(s);
      log('F-03 API', `Section "${s}" present`, found ? 'PASS' : 'FAIL');
    }

    // Check for new columns (help_text, lookup_target, do_not_update_master, max_length, default_value)
    const sample = fsData.fields[0];
    const newCols = ['help_text', 'lookup_target', 'do_not_update_master', 'max_length', 'default_value'];
    for (const col of newCols) {
      log('F-03 API', `New column "${col}" exists in response`, Object.prototype.hasOwnProperty.call(sample, col) ? 'PASS' : 'FAIL');
    }
  }

  // 3B. GET with section filter
  const fsContact = assertGet('/api/admin/field-setup?section=Contact+%2F+Requestor', 'F-03 API', 'GET with section filter returns subset', [
    { field: 'fields', fn: v => Array.isArray(v) && v.length > 0, msg: 'Should return fields for section' },
  ]);
  if (fsContact?.fields) {
    log('F-03 API', `Contact/Requestor fields returned: ${fsContact.fields.length}`, 'PASS');
  }

  // 3C. Browser — Field Setup loads with expanded sections
  await goto(page, `${BASE}/admin-console/field-setup`, 'F-03 Browser');
  await checkNotBlank(page, 'F-03 Browser', 'Field Setup section renders');
  await checkJsErrors(page, 'F-03 Browser', 'No JS errors');
  await textExists(page, 'Field Setup', 'F-03 Browser', '"Field Setup" header visible');
  await textExists(page, 'AE', 'F-03 Browser', 'AE sections visible in field list');

  // ══════════════════════════════════════════════════════════════
  // F-04  PICKLISTS (with Category)
  // ══════════════════════════════════════════════════════════════
  console.log('\n━━ F-04: PICKLISTS (WITH CATEGORY) ━━━━━━━━━━━━━━━━━━━');

  // 4A. GET all picklists
  const pkData = assertGet('/api/admin/picklists', 'F-04 API', 'GET /picklists returns list', [
    { field: 'picklists', fn: v => Array.isArray(v), msg: 'picklists must be array' },
  ]);

  if (pkData?.picklists?.length > 0) {
    const hasCategoryCol = Object.prototype.hasOwnProperty.call(pkData.picklists[0], 'category');
    log('F-04 API', 'Each picklist entry has "category" column', hasCategoryCol ? 'PASS' : 'FAIL');
  }

  // 4B. POST — create new picklist with specific category
  const ts = Date.now();
  const pkCreate = curl('POST', '/api/admin/picklists', {
    name: `QA Test Picklist ${ts}`,
    category: 'Case Form MI',
    field_type: `qa_test_type_${ts}`,
    value: `QA Test Value ${ts}`,
    description: 'Created by Phase 1A QA test',
    status: 'Active',
  }, 'F-04 API', 'POST create picklist with category');

  let pkId = null;
  if (pkCreate?.id) {
    pkId = pkCreate.id;
    log('F-04 API', 'POST create returns id', 'PASS', `id=${pkId}`);
    log('F-04 API', 'Created picklist has category', pkCreate.picklist?.category === 'Case Form MI' ? 'PASS' : 'FAIL', `category=${pkCreate.picklist?.category}`);
  } else {
    log('F-04 API', 'POST create returns id', 'FAIL', JSON.stringify(pkCreate)?.slice(0, 100));
  }

  // 4C. GET with category filter — should include our created item
  if (pkId) {
    const pkFiltered = assertGet(`/api/admin/picklists?category=Case+Form+MI`, 'F-04 API', 'GET with category=Case Form MI filter', [
      { field: 'picklists', fn: v => Array.isArray(v), msg: 'picklists array' },
    ]);
    if (pkFiltered?.picklists) {
      const found = pkFiltered.picklists.some(p => p.id === pkId);
      log('F-04 API', 'Filtered results include our created item', found ? 'PASS' : 'FAIL');
      const wrongCat = pkFiltered.picklists.filter(p => p.category !== 'Case Form MI');
      log('F-04 API', 'Filtered results contain ONLY "Case Form MI" items', wrongCat.length === 0 ? 'PASS' : 'FAIL',
        wrongCat.length > 0 ? `${wrongCat.length} items with wrong category found` : '');
    }
  }

  // 4D. GET with status filter
  assertGet('/api/admin/picklists?status=Active', 'F-04 API', 'GET with status=Active filter returns 200', [
    { field: 'picklists', fn: v => Array.isArray(v), msg: 'picklists must be array' },
  ]);

  // 4E. GET with search
  assertGet(`/api/admin/picklists?search=QA+Test+Picklist`, 'F-04 API', 'GET with search finds our test picklist', [
    { field: 'picklists', fn: v => Array.isArray(v) && v.length > 0, msg: 'search must find result' },
  ]);

  // 4F. PUT — update category of created picklist
  if (pkId) {
    const pkUpdate = curl('PUT', `/api/admin/picklists/${pkId}`, {
      name: `QA Test Picklist ${ts}`,
      category: 'Case Form AE',
      field_type: `qa_test_type_${ts}`,
      value: `QA Test Value ${ts}`,
      description: 'Updated by QA test',
      status: 'Active',
    }, 'F-04 API', 'PUT update picklist category');
    log('F-04 API', 'PUT update returns success message', pkUpdate?.message ? 'PASS' : 'FAIL', pkUpdate?.message || JSON.stringify(pkUpdate)?.slice(0, 80));
    // Verify change persisted
    const pkAfter = curl('GET', `/api/admin/picklists?search=QA+Test+Picklist`, null, 'F-04 API', 'GET after update');
    const updated = pkAfter?.picklists?.find(p => p.id === pkId);
    log('F-04 API', 'Category update persisted to DB', updated?.category === 'Case Form AE' ? 'PASS' : 'FAIL', `category=${updated?.category}`);
  }

  // 4G. GET export endpoint
  assertGet('/api/admin/picklists/export', 'F-04 API', 'GET /picklists/export returns 200', [
    { field: 'picklists', fn: v => Array.isArray(v), msg: 'Export must return picklists array' },
  ]);

  // 4H. DELETE (soft) the test picklist
  if (pkId) {
    const delPk = curlCode('DELETE', `/api/admin/picklists/${pkId}`, null, 'F-04 API', 'DELETE (soft) test picklist');
    log('F-04 API', 'DELETE returns 200', delPk === 200 ? 'PASS' : 'FAIL', `HTTP ${delPk}`);
    // Verify it's Inactive now
    const pkInactive = curl('GET', `/api/admin/picklists?search=QA+Test+Picklist&status=All`, null, 'F-04 API', 'Verify soft-deleted is Inactive');
    const deletedPk = pkInactive?.picklists?.find(p => p.id === pkId);
    log('F-04 API', 'Soft-deleted picklist is now Inactive', deletedPk?.status === 'Inactive' ? 'PASS' : 'FAIL', `status=${deletedPk?.status}`);
  }

  // 4I. POST duplicate → 409
  const dupTs = Date.now();
  curl('POST', '/api/admin/picklists', { name: 'DupTest', field_type: `dup_ft_${dupTs}`, value: `dup_v_${dupTs}`, category: 'General', status: 'Active' }, 'F-04 API', 'POST 1st entry (setup for dup test)');
  const dupCode = curlCode('POST', '/api/admin/picklists', { name: 'DupTest', field_type: `dup_ft_${dupTs}`, value: `dup_v_${dupTs}`, category: 'General', status: 'Active' }, 'F-04 API', 'POST duplicate → 409');
  log('F-04 API', 'Duplicate picklist returns 409', dupCode === 409 ? 'PASS' : 'FAIL', `HTTP ${dupCode}`);

  // 4J. Browser — Picklists section with category column
  await goto(page, `${BASE}/admin-console/picklists`, 'F-04 Browser', 4000);
  await checkNotBlank(page, 'F-04 Browser', 'Picklists section renders');
  await checkJsErrors(page, 'F-04 Browser', 'No JS errors');
  await textExists(page, 'Picklists', 'F-04 Browser', '"Picklists" title visible');
  // .admin-table th has text-transform:uppercase — header renders as "CATEGORY"
  await textExists(page, 'CATEGORY', 'F-04 Browser', '"CATEGORY" column header visible in table (CSS uppercase)');
  // Category filter dropdown always rendered in toolbar (no CSS transform on select options)
  await textExists(page, 'All Categories', 'F-04 Browser', '"All Categories" filter option visible in toolbar');

  // ══════════════════════════════════════════════════════════════
  // F-05  SITES SETUP — 4 CONFIG TABS
  // ══════════════════════════════════════════════════════════════
  console.log('\n━━ F-05: SITES SETUP ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Get a site ID to test with
  const sitesData = curl('GET', '/api/admin/sites', null, 'F-05 API', 'GET /sites to find test site');
  let testSiteId = null;
  if (sitesData?.sites?.length > 0) {
    testSiteId = sitesData.sites[0].id;
    log('F-05 API', `Using site id=${testSiteId} (${sitesData.sites[0].name || 'unnamed'}) for config tab tests`, 'PASS');
  } else {
    log('F-05 API', 'GET /sites — site available for testing', 'WARN', 'No sites found — skipping site-tab API tests');
  }

  if (testSiteId) {
    // ── Email Accounts ─────────────────────────────────────────
    // 5A. GET email accounts
    assertGet(`/api/admin/sites/${testSiteId}/email-accounts`, 'F-05 Email', 'GET email accounts returns 200', [
      { field: 'emailAccounts', fn: v => Array.isArray(v), msg: 'emailAccounts must be array' },
    ]);

    // 5B. POST — add email account
    const emailRes = curl('POST', `/api/admin/sites/${testSiteId}/email-accounts`, {
      email: `qa-test-${ts}@mims-test.com`,
      label: 'QA Test Account',
      case_types: 'ALL',
    }, 'F-05 Email', 'POST add email account');
    let emailAccountId = null;
    if (emailRes?.emailAccount?.id) {
      emailAccountId = emailRes.emailAccount.id;
      log('F-05 Email', 'POST email account returns created record', 'PASS', `id=${emailAccountId}`);
    } else {
      log('F-05 Email', 'POST email account returns created record', 'FAIL', JSON.stringify(emailRes)?.slice(0, 100));
    }

    // 5C. POST — missing email → 400
    const badEmail = curlCode('POST', `/api/admin/sites/${testSiteId}/email-accounts`, { label: 'No Email' }, 'F-05 Email', 'POST without email → 400');
    log('F-05 Email', 'POST without email returns 400', badEmail === 400 ? 'PASS' : 'FAIL', `HTTP ${badEmail}`);

    // 5D. GET — verify account in list
    if (emailAccountId) {
      const eaAfter = assertGet(`/api/admin/sites/${testSiteId}/email-accounts`, 'F-05 Email', 'GET email accounts shows new account', [
        { field: 'emailAccounts', fn: v => v.some(a => a.id === emailAccountId), msg: 'New account must appear in list' },
      ]);
    }

    // 5E. DELETE the email account
    if (emailAccountId) {
      const delEaCode = curlCode('DELETE', `/api/admin/sites/${testSiteId}/email-accounts/${emailAccountId}`, null, 'F-05 Email', 'DELETE email account');
      log('F-05 Email', 'DELETE email account returns 200', delEaCode === 200 ? 'PASS' : 'FAIL', `HTTP ${delEaCode}`);
      // Verify gone
      const eaGone = curl('GET', `/api/admin/sites/${testSiteId}/email-accounts`, null, 'F-05 Email', 'GET after delete');
      const stillThere = eaGone?.emailAccounts?.some(a => a.id === emailAccountId);
      log('F-05 Email', 'Deleted email account no longer in list', !stillThere ? 'PASS' : 'FAIL');
    }

    // ── Response Template ─────────────────────────────────────
    // 5F. GET response template
    assertGet(`/api/admin/sites/${testSiteId}/response-template`, 'F-05 Template', 'GET response template returns 200', [
      { field: 'template', fn: v => v === null || typeof v === 'object', msg: 'template must be null or object' },
    ]);

    // 5G. PUT — save/upsert template
    const tmplRes = curl('PUT', `/api/admin/sites/${testSiteId}/response-template`, {
      subject: 'QA Test — Auto Response',
      body_html: '<p>Thank you for your enquiry. This is a QA test template.</p>',
    }, 'F-05 Template', 'PUT upsert response template');
    if (tmplRes?.template?.id) {
      log('F-05 Template', 'PUT returns saved template record', 'PASS', `id=${tmplRes.template.id}`);
    } else {
      log('F-05 Template', 'PUT returns saved template record', 'FAIL', JSON.stringify(tmplRes)?.slice(0, 100));
    }

    // 5H. GET again — verify persisted
    const tmplAfter = assertGet(`/api/admin/sites/${testSiteId}/response-template`, 'F-05 Template', 'GET after save returns saved template', [
      { field: 'template.subject', fn: v => v === 'QA Test — Auto Response', msg: 'Subject must match saved value' },
    ]);

    // 5I. PUT again — update (idempotent upsert)
    const tmplUpdate = curl('PUT', `/api/admin/sites/${testSiteId}/response-template`, {
      subject: 'Updated QA Response',
      body_html: '<p>Updated.</p>',
    }, 'F-05 Template', 'PUT update template (upsert idempotency)');
    log('F-05 Template', 'Second PUT upsert succeeds', tmplUpdate?.template ? 'PASS' : 'FAIL');

    // ── Data Retention ────────────────────────────────────────
    // 5J. GET data retention
    assertGet(`/api/admin/sites/${testSiteId}/data-retention`, 'F-05 Retention', 'GET data retention returns 200', [
      { field: 'rules', fn: v => Array.isArray(v), msg: 'rules must be array' },
    ]);

    // 5K. PUT — save GDPR rule
    const retRes = curl('PUT', `/api/admin/sites/${testSiteId}/data-retention`, {
      regulation: 'GDPR',
      retention_days: 1825,
      auto_delete_enabled: false,
      notes: 'QA test GDPR rule',
    }, 'F-05 Retention', 'PUT save GDPR data retention rule');
    if (retRes?.rules) {
      log('F-05 Retention', 'PUT returns updated rules array', 'PASS', `rules count=${retRes.rules.length}`);
    } else {
      log('F-05 Retention', 'PUT returns updated rules array', 'FAIL', JSON.stringify(retRes)?.slice(0, 100));
    }

    // 5L. GET — verify persisted
    const retAfter = assertGet(`/api/admin/sites/${testSiteId}/data-retention`, 'F-05 Retention', 'GET after save shows GDPR rule', [
      { field: 'rules', fn: v => v.some(r => r.regulation === 'GDPR'), msg: 'GDPR rule must be in list' },
    ]);

    // 5M. PUT — regulation required → 400
    const badRet = curlCode('PUT', `/api/admin/sites/${testSiteId}/data-retention`, { retention_days: 100 }, 'F-05 Retention', 'PUT without regulation → 400');
    log('F-05 Retention', 'PUT without regulation returns 400', badRet === 400 ? 'PASS' : 'FAIL', `HTTP ${badRet}`);

    // ── Alerts ────────────────────────────────────────────────
    // 5N. GET alerts
    assertGet(`/api/admin/sites/${testSiteId}/alerts`, 'F-05 Alerts', 'GET alerts returns 200', [
      { field: 'alerts', fn: v => Array.isArray(v), msg: 'alerts must be array' },
    ]);

    // 5O. POST — add alert
    const alertRes = curl('POST', `/api/admin/sites/${testSiteId}/alerts`, {
      alert_type: 'overdue_cases',
      threshold_value: 5,
      notify_emails: 'qa-alert@mims.test',
    }, 'F-05 Alerts', 'POST add alert');
    let alertId = null;
    if (alertRes?.alert?.id) {
      alertId = alertRes.alert.id;
      log('F-05 Alerts', 'POST alert returns created record', 'PASS', `id=${alertId}`);
    } else {
      log('F-05 Alerts', 'POST alert returns created record', 'FAIL', JSON.stringify(alertRes)?.slice(0, 100));
    }

    // 5P. POST — missing alert_type → 400
    const badAlert = curlCode('POST', `/api/admin/sites/${testSiteId}/alerts`, { threshold_value: 10 }, 'F-05 Alerts', 'POST without alert_type → 400');
    log('F-05 Alerts', 'POST without alert_type returns 400', badAlert === 400 ? 'PASS' : 'FAIL', `HTTP ${badAlert}`);

    // 5Q. PUT — update alert
    if (alertId) {
      const alertUpd = curl('PUT', `/api/admin/sites/${testSiteId}/alerts/${alertId}`, {
        alert_type: 'overdue_cases', threshold_value: 10,
        notify_emails: 'updated@mims.test', is_active: true,
      }, 'F-05 Alerts', 'PUT update alert');
      log('F-05 Alerts', 'PUT update returns alert record', alertUpd?.alert ? 'PASS' : 'FAIL');
      log('F-05 Alerts', 'Updated threshold persisted', alertUpd?.alert?.threshold_value === 10 ? 'PASS' : 'FAIL', `threshold=${alertUpd?.alert?.threshold_value}`);
    }

    // 5R. DELETE alert
    if (alertId) {
      const delAlCode = curlCode('DELETE', `/api/admin/sites/${testSiteId}/alerts/${alertId}`, null, 'F-05 Alerts', 'DELETE alert');
      log('F-05 Alerts', 'DELETE alert returns 200', delAlCode === 200 ? 'PASS' : 'FAIL', `HTTP ${delAlCode}`);
      const alGone = curl('GET', `/api/admin/sites/${testSiteId}/alerts`, null, 'F-05 Alerts', 'GET after delete');
      const alStill = alGone?.alerts?.some(a => a.id === alertId);
      log('F-05 Alerts', 'Deleted alert no longer in list', !alStill ? 'PASS' : 'FAIL');
    }
  }

  // 5S. Browser — Sites section loads and shows org/site management UI
  await goto(page, `${BASE}/admin-console/sites`, 'F-05 Browser', 3500);
  await checkNotBlank(page, 'F-05 Browser', 'Sites section renders');
  await checkJsErrors(page, 'F-05 Browser', 'No JS errors');
  await textExists(page, 'Sites', 'F-05 Browser', '"Sites" section title visible');
  // "Add Organisation" card is always visible at the top of the Sites Setup section
  await textExists(page, 'Add Organisation', 'F-05 Browser', '"Add Organisation" card always visible in Sites Setup');

  // ══════════════════════════════════════════════════════════════
  // F-06  SECURITY GROUPS (casemgmt tab)
  // ══════════════════════════════════════════════════════════════
  console.log('\n━━ F-06: SECURITY GROUPS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 6A. GET all security groups
  const sgData = assertGet('/api/admin/security-groups', 'F-06 API', 'GET /security-groups returns 200', [
    { field: 'groups', fn: v => Array.isArray(v), msg: 'groups must be array' },
  ]);
  if (sgData?.groups) {
    log('F-06 API', `Security groups count: ${sgData.groups.length}`, sgData.groups.length > 0 ? 'PASS' : 'WARN');
    const hasCaseMgmt = sgData.groups.some(g => {
      const privs = g.privileges;
      const obj = typeof privs === 'string' ? JSON.parse(privs || '{}') : (privs || {});
      return obj.casemgmt !== undefined;
    });
    log('F-06 API', 'At least one group has casemgmt privileges key', hasCaseMgmt ? 'PASS' : 'WARN', 'New groups may not have casemgmt key yet if none created post-update');
  }

  // 6B. POST — create a test group with casemgmt privileges
  const sgCreate = curl('POST', '/api/admin/security-groups', {
    name: `QA Test Group ${ts}`,
    description: 'Phase 1A QA test group',
    privileges: {
      casemgmt: {
        case_mi_create: true,
        case_ae_create: true,
        case_pc_create: false,
        case_ae_seriousness: true,
        case_version_create: false,
        case_doc_upload: true,
        case_export: false,
        case_bulk_ops: false,
      },
      cases: {
        case_view: true,
        case_close: false,
        case_reopen: false,
      },
    },
  }, 'F-06 API', 'POST create security group with casemgmt privileges');
  let sgId = null;
  if (sgCreate?.group?.id || sgCreate?.id) {
    sgId = sgCreate?.group?.id || sgCreate?.id;
    log('F-06 API', 'POST create security group returns id', 'PASS', `id=${sgId}`);
  } else {
    log('F-06 API', 'POST create security group returns id', 'FAIL', JSON.stringify(sgCreate)?.slice(0, 100));
  }

  // 6C. GET the group — verify casemgmt structure persisted
  if (sgId) {
    const sgRead = curl('GET', `/api/admin/security-groups/${sgId}`, null, 'F-06 API', 'GET individual security group');
    if (sgRead?.group) {
      const privs = typeof sgRead.group.privileges === 'string' ? JSON.parse(sgRead.group.privileges) : sgRead.group.privileges;
      log('F-06 API', 'Retrieved group has casemgmt key in privileges', privs?.casemgmt ? 'PASS' : 'FAIL', JSON.stringify(privs?.casemgmt || {}).slice(0, 80));
      log('F-06 API', 'casemgmt.case_mi_create=true persisted', privs?.casemgmt?.case_mi_create === true ? 'PASS' : 'FAIL');
      log('F-06 API', 'casemgmt.case_ae_create=true persisted', privs?.casemgmt?.case_ae_create === true ? 'PASS' : 'FAIL');
      log('F-06 API', 'cases.case_close key exists in privileges', privs?.cases?.case_close !== undefined ? 'PASS' : 'FAIL');
    } else {
      log('F-06 API', 'GET individual security group', 'WARN', 'Endpoint may not support single-group GET — check implementation');
    }
  }

  // 6D. PUT — update the group
  if (sgId) {
    const sgUpd = curl('PUT', `/api/admin/security-groups/${sgId}`, {
      name: `QA Test Group ${ts} Updated`,
      description: 'Updated by QA',
      privileges: {
        casemgmt: { case_mi_create: true, case_ae_create: true, case_pc_create: true },
      },
    }, 'F-06 API', 'PUT update security group');
    log('F-06 API', 'PUT update returns success', sgUpd?.message || sgUpd?.group ? 'PASS' : 'FAIL', JSON.stringify(sgUpd)?.slice(0, 80));
  }

  // 6E. DELETE test group
  if (sgId) {
    const delSgCode = curlCode('DELETE', `/api/admin/security-groups/${sgId}`, null, 'F-06 API', 'DELETE test security group');
    log('F-06 API', 'DELETE security group returns 200', delSgCode === 200 ? 'PASS' : 'FAIL', `HTTP ${delSgCode}`);
  }

  // 6F. Browser — Security Groups section loads with new user-security-groups UI
  await goto(page, `${BASE}/admin-console/user-security`, 'F-06 Browser', 3500);
  await checkNotBlank(page, 'F-06 Browser', 'Security Groups section renders');
  await checkJsErrors(page, 'F-06 Browser', 'No JS errors');
  await textExists(page, 'User Security Groups', 'F-06 Browser', '"User Security Groups" header visible');
  // Button text is "+ New Group" (line 2401 of AdminConsolePage.jsx)
  await textExists(page, '+ New Group', 'F-06 Browser', '"+ New Group" button visible in left panel');
  // Click "+ New Group" to open the create/edit form, then click "Case Management" tab
  const clickedNew = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const btn = btns.find(b => b.textContent?.trim() === '+ New Group');
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (clickedNew) {
    await new Promise(r => setTimeout(r, 1500));
    log('F-06 Browser', 'Clicked "+ New Group" to open right panel', 'PASS');
    await textExists(page, 'Case Management', 'F-06 Browser', '"Case Management" tab button visible in right panel');
    // Click the "Case Management" tab to reveal its permissions grid
    const clickedCaseMgmt = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const btn = btns.find(b => b.textContent?.trim() === 'Case Management');
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (clickedCaseMgmt) {
      await new Promise(r => setTimeout(r, 1000));
      log('F-06 Browser', 'Clicked "Case Management" tab', 'PASS');
      await textExists(page, 'MI — Create/Edit', 'F-06 Browser', 'casemgmt permission "MI — Create/Edit" visible');
    } else {
      log('F-06 Browser', 'Click "Case Management" tab', 'WARN', 'Tab button not found after opening new group form');
    }
  } else {
    log('F-06 Browser', 'Click "+ New Group"', 'WARN', 'Button not found');
  }

  // ══════════════════════════════════════════════════════════════
  // REGRESSION — existing sections still load
  // ══════════════════════════════════════════════════════════════
  console.log('\n━━ REGRESSION: Existing Admin Sections ━━━━━━━━━━━━━━━');
  const regressionSections = [
    { key: 'picklists',      label: 'Picklists' },
    { key: 'field-setup',    label: 'Field Setup' },
    { key: 'user-security',  label: 'User Security Groups' },
    { key: 'case-contacts',  label: 'Case Contacts' },
    { key: 'company-reps',   label: 'Company Reps' },
    { key: 'sites',          label: 'Sites' },
    { key: 'orgs',           label: 'Organisations' },
    { key: 'audit-admin',    label: 'Admin Audit Trail' },
  ];
  for (const { key, label } of regressionSections) {
    await goto(page, `${BASE}/admin-console/${key}`, `Regression/${label}`);
    await checkNotBlank(page, `Regression/${label}`, 'Has content');
    await checkJsErrors(page, `Regression/${label}`, 'No JS errors');
  }

  // ══════════════════════════════════════════════════════════════
  // REGRESSION — existing API endpoints
  // ══════════════════════════════════════════════════════════════
  console.log('\n━━ REGRESSION: Core API Endpoints ━━━━━━━━━━━━━━━━━━━━');
  const existingApis = [
    { url: '/api/health',                   label: 'Health' },
    { url: '/api/admin/picklists',          label: 'Picklists' },
    { url: '/api/admin/field-setup',        label: 'Field Setup' },
    { url: '/api/admin/security-groups',    label: 'Security Groups' },
    { url: '/api/admin/contacts',           label: 'Contacts' },
    { url: '/api/admin/company-reps',       label: 'Company Reps' },
    { url: '/api/admin/sites',              label: 'Sites' },
    { url: '/api/admin/orgs',              label: 'Orgs' },
    { url: '/api/admin/audit-logs',        label: 'Audit Logs' },
    { url: '/api/cm/folders',              label: 'CM Folders' },
    { url: '/api/cm/documents',            label: 'CM Documents' },
    { url: '/api/cm/faqs',                 label: 'CM FAQs' },
  ];
  for (const { url, label } of existingApis) {
    const code = curlCode('GET', url, null, `Regression/API`, label);
    log('Regression/API', label, code === 200 ? 'PASS' : code === 401 ? 'WARN' : 'FAIL', `HTTP ${code}`);
  }

  // ══════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════
  await browser.close();

  const total = passed + failed + warned;
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log(`║  SPRINT 6 PHASE 1A — QA RESULTS                       ║`);
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
    console.log('\n🎉 All Phase 1A tests passed! Ready for Gate 2 sign-off.\n');
  } else {
    console.log('\n🔴 Failures detected. Defects must be resolved before Gate 2.\n');
  }

  process.exit(failed > 0 ? 1 : 0);
})();
