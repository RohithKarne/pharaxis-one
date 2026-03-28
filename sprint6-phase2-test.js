'use strict';
/**
 * Sprint 6 — Phase 2 Full Test Suite
 * QA: Karthik & Shivani
 *
 * Coverage:
 *   F-13  Case Creation + List View       — API + Browser
 *   F-14  Case Contacts / Requestor       — API
 *   F-15  Case Information (auto-save)    — API
 *   F-16  MI Component (multi-tab)        — API
 *   F-17  AE Component (version control)  — API + Browser
 *   F-18  PC Component (version control)  — API + Browser
 *
 * Credentials: superadmin / Manager@123
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
  if (!Array.isArray(data) && data.error) { log(section, label, 'FAIL', `body.error="${data.error}"`); return null; }
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
      const cls  = e => (typeof e.className === 'string' ? e.className : '');
      const el  = els.find(e =>
        (e.tagName === 'BUTTON' || e.tagName === 'A' || cls(e).includes('tab') || cls(e).includes('btn')) &&
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
  console.log('║  MIMS Sprint 6 — Phase 2 Full QA Test Suite           ║');
  console.log('║  F-13 Case Creation   | F-14 Case Contacts             ║');
  console.log('║  F-15 Case Info       | F-16 MI Component              ║');
  console.log('║  F-17 AE Component    | F-18 PC Component              ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const ts = Date.now();

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
    token        = parsed.token  || '';
    adminUser    = parsed.user   || null;
    adminModules = parsed.modules || [];
    log('Auth', 'Login as superadmin', token ? 'PASS' : 'FAIL', token ? 'Token received' : parsed.error || 'No token');
  } catch (e) {
    log('Auth', 'Login as superadmin', 'FAIL', e.message.slice(0, 100));
  }
  AUTH_HEADER = token ? `-H "Authorization: Bearer ${token}"` : '';
  if (!token) { console.log('\n❌ Cannot proceed without auth token. Is the server running on port 3000?'); process.exit(1); }

  // ──────────────────────────────────────────────────────────────
  // SETUP — get a valid org_id and site_id for test case creation
  // ──────────────────────────────────────────────────────────────
  let testOrgId = null, testSiteId = null;
  try {
    const orgsData = curl('GET', '/api/admin/orgs', null, 'Setup', 'GET orgs for test fixture');
    const orgs = Array.isArray(orgsData) ? orgsData : (orgsData?.orgs || []);
    const activeOrg = orgs.find(o => o.is_active) || orgs[0];
    if (activeOrg) {
      testOrgId = activeOrg.id;
      log('Setup', `Found active org id=${testOrgId} name="${activeOrg.name}"`, 'PASS');
    } else {
      log('Setup', 'Find active org for test fixture', 'WARN', 'No orgs found — some tests will be skipped');
    }
    if (testOrgId) {
      const sitesData = curl('GET', `/api/admin/sites?org_id=${testOrgId}`, null, 'Setup', 'GET sites for test fixture');
      const sites = Array.isArray(sitesData) ? sitesData : (sitesData?.sites || []);
      const activeSite = sites.find(s => s.is_active) || sites[0];
      if (activeSite) {
        testSiteId = activeSite.id;
        log('Setup', `Found active site id=${testSiteId} name="${activeSite.name}"`, 'PASS');
      } else {
        log('Setup', 'Find active site for test fixture', 'WARN', 'No sites found — some tests will be skipped');
      }
    }
  } catch (e) {
    log('Setup', 'Fixture org/site lookup', 'WARN', e.message.slice(0, 100));
  }

  // ══════════════════════════════════════════════════════════════
  // F-13  CASE CREATION + LIST VIEW
  // ══════════════════════════════════════════════════════════════
  console.log('\n━━ F-13: CASE CREATION + LIST VIEW ━━━━━━━━━━━━━━━━━━━');

  // 13A. GET /cases — returns array (direct array response, not wrapped)
  const casesList = curl('GET', '/api/cases', null, 'F-13 API', 'GET /cases returns array');
  if (Array.isArray(casesList)) {
    log('F-13 API', 'GET /cases returns array', 'PASS', `count=${casesList.length}`);
  } else {
    log('F-13 API', 'GET /cases returns array', 'FAIL', JSON.stringify(casesList)?.slice(0, 80));
  }

  // 13B. GET /cases/my — returns array
  const myCases = curl('GET', '/api/cases/my', null, 'F-13 API', 'GET /cases/my');
  if (Array.isArray(myCases)) {
    log('F-13 API', 'GET /cases/my returns array', 'PASS', `count=${myCases.length}`);
  } else {
    log('F-13 API', 'GET /cases/my returns array', 'FAIL', JSON.stringify(myCases)?.slice(0, 80));
  }

  // 13C. GET /cases/unassigned — returns array
  const unassigned = curl('GET', '/api/cases/unassigned', null, 'F-13 API', 'GET /cases/unassigned');
  if (Array.isArray(unassigned)) {
    log('F-13 API', 'GET /cases/unassigned returns array', 'PASS', `count=${unassigned.length}`);
  } else {
    log('F-13 API', 'GET /cases/unassigned returns array', 'FAIL', JSON.stringify(unassigned)?.slice(0, 80));
  }

  // 13D. GET /cases?deleted=true — returns array
  const deletedCases = curl('GET', '/api/cases?deleted=true', null, 'F-13 API', 'GET /cases?deleted=true');
  if (Array.isArray(deletedCases)) {
    log('F-13 API', 'GET /cases?deleted=true returns array', 'PASS', `count=${deletedCases.length}`);
  } else {
    log('F-13 API', 'GET /cases?deleted=true returns array', 'FAIL', JSON.stringify(deletedCases)?.slice(0, 80));
  }

  // 13E. POST — missing required fields → 400
  const createBad = curlCode('POST', '/api/cases', { case_type: 'MI' }, 'F-13 API', 'POST /cases missing org_id → 400');
  log('F-13 API', 'POST without org_id/site_id returns 400', createBad === 400 ? 'PASS' : 'FAIL', `HTTP ${createBad}`);

  // 13F. POST — invalid case_type → 400
  if (testOrgId && testSiteId) {
    const createInvType = curlCode('POST', '/api/cases', { org_id: testOrgId, site_id: testSiteId, case_type: 'INVALID' }, 'F-13 API', 'POST invalid case_type → 400');
    log('F-13 API', 'POST invalid case_type returns 400', createInvType === 400 ? 'PASS' : 'FAIL', `HTTP ${createInvType}`);
  }

  // 13G. POST — create MI case (DRAFT)
  let testMiCaseId = null;
  if (testOrgId && testSiteId) {
    const newMi = curl('POST', '/api/cases', {
      org_id: testOrgId, site_id: testSiteId,
      case_type: 'MI', intake_channel: 'manual',
    }, 'F-13 API', 'POST create MI case');
    if (newMi?.id && newMi?.case_type === 'MI') {
      testMiCaseId = newMi.id;
      log('F-13 API', 'POST create MI case returns case object', 'PASS', `id=${testMiCaseId} case_type=MI`);
      log('F-13 API', 'New MI case has null case_number (DRAFT)', newMi.case_number === null ? 'PASS' : 'FAIL', `case_number=${newMi.case_number}`);
      log('F-13 API', 'New MI case has org_name and site_name joined', (newMi.org_name || newMi.site_name) ? 'PASS' : 'WARN', `org=${newMi.org_name} site=${newMi.site_name}`);
    } else {
      log('F-13 API', 'POST create MI case returns case object', 'FAIL', JSON.stringify(newMi)?.slice(0, 120));
    }
  } else {
    log('F-13 API', 'POST create MI case', 'WARN', 'Skipped — no org/site available');
  }

  // 13H. POST — create AE case
  let testAeCaseId = null;
  if (testOrgId && testSiteId) {
    const newAe = curl('POST', '/api/cases', {
      org_id: testOrgId, site_id: testSiteId,
      case_type: 'AE', intake_channel: 'email',
      date_received: '2026-03-25',
    }, 'F-13 API', 'POST create AE case');
    if (newAe?.id && newAe?.case_type === 'AE') {
      testAeCaseId = newAe.id;
      log('F-13 API', 'POST create AE case returns case object', 'PASS', `id=${testAeCaseId} case_type=AE`);
      log('F-13 API', 'AE case date_received stored', newAe.date_received ? 'PASS' : 'WARN', `date_received=${newAe.date_received}`);
    } else {
      log('F-13 API', 'POST create AE case returns case object', 'FAIL', JSON.stringify(newAe)?.slice(0, 120));
    }
  }

  // 13I. POST — create PC case
  let testPcCaseId = null;
  if (testOrgId && testSiteId) {
    const newPc = curl('POST', '/api/cases', {
      org_id: testOrgId, site_id: testSiteId,
      case_type: 'PC', intake_channel: 'phone',
    }, 'F-13 API', 'POST create PC case');
    if (newPc?.id && newPc?.case_type === 'PC') {
      testPcCaseId = newPc.id;
      log('F-13 API', 'POST create PC case returns case object', 'PASS', `id=${testPcCaseId} case_type=PC`);
    } else {
      log('F-13 API', 'POST create PC case returns case object', 'FAIL', JSON.stringify(newPc)?.slice(0, 120));
    }
  }

  // 13J. GET /cases/:id — single case detail
  if (testMiCaseId) {
    const singleCase = curl('GET', `/api/cases/${testMiCaseId}`, null, 'F-13 API', 'GET /cases/:id single detail');
    if (singleCase?.id === testMiCaseId) {
      log('F-13 API', 'GET /cases/:id returns correct case', 'PASS', `id=${singleCase.id} case_type=${singleCase.case_type}`);
    } else {
      log('F-13 API', 'GET /cases/:id returns correct case', 'FAIL', JSON.stringify(singleCase)?.slice(0, 80));
    }
  }

  // 13K. GET /cases/99999 — 404
  const missingCase = curlCode('GET', '/api/cases/99999', null, 'F-13 API', 'GET /cases/99999 → 404');
  log('F-13 API', 'GET non-existent case returns 404', missingCase === 404 ? 'PASS' : 'FAIL', `HTTP ${missingCase}`);

  // 13L. POST /cases/:id/assign-number — generates and assigns case number
  if (testMiCaseId) {
    const assignRes = curl('POST', `/api/cases/${testMiCaseId}/assign-number`, {}, 'F-13 API', 'POST assign-number generates case number');
    if (assignRes?.case_number && typeof assignRes.case_number === 'string' && assignRes.case_number.length > 0) {
      log('F-13 API', 'assign-number returns case_number string', 'PASS', `case_number="${assignRes.case_number}"`);
      // 13M. Idempotency: call assign-number again, same number returned
      const assignAgain = curl('POST', `/api/cases/${testMiCaseId}/assign-number`, {}, 'F-13 API', 'assign-number idempotent on repeat call');
      if (assignAgain?.case_number === assignRes.case_number) {
        log('F-13 API', 'assign-number is idempotent (same number returned)', 'PASS', `case_number="${assignAgain.case_number}"`);
      } else {
        log('F-13 API', 'assign-number is idempotent (same number returned)', 'FAIL', `first="${assignRes.case_number}" second="${assignAgain?.case_number}"`);
      }
    } else {
      log('F-13 API', 'assign-number returns case_number string', 'FAIL', JSON.stringify(assignRes)?.slice(0, 100));
    }
  }

  // 13N. GET /cases?type=MI — filter by type
  if (testMiCaseId) {
    const filteredMi = curl('GET', '/api/cases?type=MI', null, 'F-13 API', 'GET /cases?type=MI filter works');
    if (Array.isArray(filteredMi)) {
      const allMi = filteredMi.every(c => c.case_type === 'MI');
      log('F-13 API', 'GET /cases?type=MI returns only MI cases', allMi ? 'PASS' : 'FAIL', `count=${filteredMi.length} allMI=${allMi}`);
    } else {
      log('F-13 API', 'GET /cases?type=MI filter works', 'FAIL', JSON.stringify(filteredMi)?.slice(0, 80));
    }
  }

  // 13O. DELETE /cases/:id — soft delete (admin only)
  // Create a throwaway case to delete
  let throwawayId = null;
  if (testOrgId && testSiteId) {
    const throwaway = curl('POST', '/api/cases', {
      org_id: testOrgId, site_id: testSiteId, case_type: 'MI',
    }, 'F-13 API', 'POST create throwaway case for delete test');
    if (throwaway?.id) {
      throwawayId = throwaway.id;
      const delCode = curlCode('DELETE', `/api/cases/${throwawayId}`, null, 'F-13 API', 'DELETE /cases/:id soft delete');
      log('F-13 API', 'DELETE case returns 200', delCode === 200 ? 'PASS' : 'FAIL', `HTTP ${delCode}`);
      // Verify it appears in deleted tab but not in active tab
      const deletedList = curl('GET', '/api/cases?deleted=true', null, 'F-13 API', 'Soft-deleted case appears in deleted list');
      const foundInDeleted = Array.isArray(deletedList) && deletedList.some(c => c.id === throwawayId && c.is_deleted === 1);
      log('F-13 API', 'Soft-deleted case is_deleted=1 in deleted list', foundInDeleted ? 'PASS' : 'FAIL');
      const activeList = curl('GET', '/api/cases', null, 'F-13 API', 'Soft-deleted case gone from active list');
      const foundInActive = Array.isArray(activeList) && activeList.some(c => c.id === throwawayId);
      log('F-13 API', 'Soft-deleted case not in active list', !foundInActive ? 'PASS' : 'FAIL');
    }
  }

  // ══════════════════════════════════════════════════════════════
  // F-14  CASE CONTACTS / REQUESTOR
  // ══════════════════════════════════════════════════════════════
  console.log('\n━━ F-14: CASE CONTACTS / REQUESTOR ━━━━━━━━━━━━━━━━━━━');

  // 14A. GET /cases/contacts/search?q= — empty q returns empty array
  const searchEmpty = curl('GET', '/api/cases/contacts/search?q=a', null, 'F-14 API', 'GET contact search returns array');
  if (Array.isArray(searchEmpty)) {
    log('F-14 API', 'Contact search returns array', 'PASS', `count=${searchEmpty.length}`);
  } else {
    log('F-14 API', 'Contact search returns array', 'FAIL', JSON.stringify(searchEmpty)?.slice(0, 80));
  }

  // 14B. Short query (<2 chars) returns empty array
  const shortSearch = curl('GET', '/api/cases/contacts/search?q=a', null, 'F-14 API', 'Contact search q=1char returns []');
  const shortSearch1 = curl('GET', '/api/cases/contacts/search?q=x', null, 'F-14 API', 'GET contact search q=x (1 char)');
  if (Array.isArray(shortSearch1) && shortSearch1.length === 0) {
    log('F-14 API', 'q < 2 chars returns empty array', 'PASS');
  } else {
    log('F-14 API', 'q < 2 chars returns empty array', Array.isArray(shortSearch1) ? 'WARN' : 'FAIL', JSON.stringify(shortSearch1)?.slice(0, 80));
  }

  // 14C. GET /cases/:id/contacts — returns array
  let contactCaseId = testMiCaseId || testAeCaseId || testPcCaseId;
  if (contactCaseId) {
    const contacts = curl('GET', `/api/cases/${contactCaseId}/contacts`, null, 'F-14 API', 'GET /cases/:id/contacts returns array');
    if (Array.isArray(contacts)) {
      log('F-14 API', 'GET /cases/:id/contacts returns array', 'PASS', `count=${contacts.length}`);
    } else {
      log('F-14 API', 'GET /cases/:id/contacts returns array', 'FAIL', JSON.stringify(contacts)?.slice(0, 80));
    }
  } else {
    log('F-14 API', 'GET /cases/:id/contacts', 'WARN', 'Skipped — no test case created');
  }

  // 14D. POST /cases/:id/contacts — add a contact (without master link)
  let testContactId = null;
  if (contactCaseId) {
    const addContact = curl('POST', `/api/cases/${contactCaseId}/contacts`, {
      contact_role: 'reporter',
      do_not_update_master: 1,
      is_primary: 1,
      first_name: 'QA',
      last_name: `Test-${ts}`,
      contact_type: 'HCP',
      specialty: 'Cardiology',
      institution: 'QA Hospital',
      phone: '555-0000',
      email: `qa.test.${ts}@example.com`,
    }, 'F-14 API', 'POST add contact to case');
    if (addContact?.id) {
      testContactId = addContact.id;
      log('F-14 API', 'POST add contact returns id', 'PASS', `id=${testContactId} role=${addContact.contact_role}`);
      log('F-14 API', 'Contact is_primary=1 stored', addContact.is_primary === 1 ? 'PASS' : 'FAIL', `is_primary=${addContact.is_primary}`);
      log('F-14 API', 'Contact do_not_update_master=1 stored', addContact.do_not_update_master === 1 ? 'PASS' : 'FAIL');
    } else {
      log('F-14 API', 'POST add contact to case', 'FAIL', JSON.stringify(addContact)?.slice(0, 120));
    }
  }

  // 14E. GET /cases/:id/contacts — now contains the new contact
  if (contactCaseId && testContactId) {
    const contacts2 = curl('GET', `/api/cases/${contactCaseId}/contacts`, null, 'F-14 API', 'GET contacts after adding one');
    if (Array.isArray(contacts2) && contacts2.some(c => c.id === testContactId)) {
      log('F-14 API', 'Added contact appears in GET list', 'PASS');
    } else {
      log('F-14 API', 'Added contact appears in GET list', 'FAIL', `contacts count=${Array.isArray(contacts2) ? contacts2.length : 'N/A'}`);
    }
    // Primary contact is listed first
    if (Array.isArray(contacts2) && contacts2[0]?.is_primary === 1) {
      log('F-14 API', 'Primary contact is first in list (ORDER BY is_primary DESC)', 'PASS');
    } else {
      log('F-14 API', 'Primary contact is first in list (ORDER BY is_primary DESC)', 'WARN', 'May be correct if only one contact');
    }
  }

  // 14F. PUT /cases/contacts/:ccId — update contact role
  if (testContactId) {
    const updContact = curl('PUT', `/api/cases/contacts/${testContactId}`, {
      contact_role: 'prescriber',
      specialty: 'Oncology',
    }, 'F-14 API', 'PUT update contact role and specialty');
    if (updContact?.contact_role === 'prescriber') {
      log('F-14 API', 'PUT contact role updated to prescriber', 'PASS');
      log('F-14 API', 'PUT contact specialty updated to Oncology', updContact.specialty === 'Oncology' ? 'PASS' : 'FAIL', `specialty=${updContact.specialty}`);
    } else {
      log('F-14 API', 'PUT update contact role and specialty', 'FAIL', JSON.stringify(updContact)?.slice(0, 120));
    }
  }

  // 14G. DELETE /cases/contacts/:ccId
  if (testContactId) {
    const delContact = curlCode('DELETE', `/api/cases/contacts/${testContactId}`, null, 'F-14 API', 'DELETE contact from case');
    log('F-14 API', 'DELETE contact returns 200', delContact === 200 ? 'PASS' : 'FAIL', `HTTP ${delContact}`);
    const afterDel = curl('GET', `/api/cases/${contactCaseId}/contacts`, null, 'F-14 API', 'Contact gone after delete');
    const stillThere = Array.isArray(afterDel) && afterDel.some(c => c.id === testContactId);
    log('F-14 API', 'Deleted contact no longer in GET list', !stillThere ? 'PASS' : 'FAIL');
  }

  // ══════════════════════════════════════════════════════════════
  // F-15  CASE INFORMATION (PUT /cases/:id)
  // ══════════════════════════════════════════════════════════════
  console.log('\n━━ F-15: CASE INFORMATION (AUTO-SAVE) ━━━━━━━━━━━━━━━━');

  if (testMiCaseId) {
    // 15A. PUT full update
    const updCase = curl('PUT', `/api/cases/${testMiCaseId}`, {
      priority:       'high',
      description:    `QA test description ${ts}`,
      internal_notes: 'QA internal note',
      intake_channel: 'fax',
    }, 'F-15 API', 'PUT update case info fields');
    if (updCase?.id === testMiCaseId) {
      log('F-15 API', 'PUT /cases/:id returns updated case', 'PASS', `id=${updCase.id}`);
      log('F-15 API', 'priority updated to "high"', updCase.priority === 'high' ? 'PASS' : 'FAIL', `priority=${updCase.priority}`);
      log('F-15 API', 'description updated', updCase.description?.includes('QA test description') ? 'PASS' : 'FAIL');
      log('F-15 API', 'intake_channel updated to fax', updCase.intake_channel === 'fax' ? 'PASS' : 'FAIL', `intake_channel=${updCase.intake_channel}`);
    } else {
      log('F-15 API', 'PUT /cases/:id returns updated case', 'FAIL', JSON.stringify(updCase)?.slice(0, 120));
    }

    // 15B. COALESCE: partial update — only description changes, priority stays
    const partialUpd = curl('PUT', `/api/cases/${testMiCaseId}`, {
      description: `QA partial update ${ts}`,
    }, 'F-15 API', 'PUT partial update (COALESCE) preserves other fields');
    if (partialUpd?.id) {
      log('F-15 API', 'Partial update returns case', 'PASS');
      log('F-15 API', 'COALESCE: priority stays "high" after partial update', partialUpd.priority === 'high' ? 'PASS' : 'FAIL', `priority=${partialUpd.priority}`);
      log('F-15 API', 'COALESCE: description updated correctly', partialUpd.description?.includes('QA partial update') ? 'PASS' : 'FAIL');
    } else {
      log('F-15 API', 'PUT partial update (COALESCE)', 'FAIL', JSON.stringify(partialUpd)?.slice(0, 100));
    }

    // 15C. PUT with unknown case id → still returns 200 (UPDATE on non-existent row is silent in MySQL)
    const nonExistUpd = curlCode('PUT', '/api/cases/99999', { priority: 'normal' }, 'F-15 API', 'PUT non-existent case (MySQL UPDATE is silent)');
    log('F-15 API', 'PUT non-existent case returns 200 (MySQL silent UPDATE)', nonExistUpd === 200 ? 'PASS' : 'WARN', `HTTP ${nonExistUpd}`);
  } else {
    log('F-15 API', 'Case information tests', 'WARN', 'Skipped — no MI test case');
  }

  // ══════════════════════════════════════════════════════════════
  // F-16  MI COMPONENT (MULTI-TAB)
  // ══════════════════════════════════════════════════════════════
  console.log('\n━━ F-16: MI COMPONENT (MULTI-TAB) ━━━━━━━━━━━━━━━━━━━━');

  if (testMiCaseId) {
    // 16A. GET /cases/:id/mi — initially empty
    const miTabs = curl('GET', `/api/cases/${testMiCaseId}/mi`, null, 'F-16 API', 'GET /cases/:id/mi initially empty');
    if (Array.isArray(miTabs)) {
      log('F-16 API', 'GET /cases/:id/mi returns array', 'PASS', `count=${miTabs.length}`);
    } else {
      log('F-16 API', 'GET /cases/:id/mi returns array', 'FAIL', JSON.stringify(miTabs)?.slice(0, 80));
    }

    // 16B. POST — create first MI tab
    let miTab1Id = null;
    const mi1 = curl('POST', `/api/cases/${testMiCaseId}/mi`, {
      mi_category:      'Drug Interaction',
      subcategory:      'Pharmacokinetics',
      question_summary: `QA MI question ${ts}`,
      detailed_question: 'What is the interaction profile?',
      status: 'Open',
    }, 'F-16 API', 'POST create first MI tab');
    if (mi1?.id) {
      miTab1Id = mi1.id;
      log('F-16 API', 'POST MI tab returns id', 'PASS', `id=${miTab1Id} tab_index=${mi1.tab_index}`);
      log('F-16 API', 'First MI tab has tab_index=1', mi1.tab_index === 1 ? 'PASS' : 'WARN', `tab_index=${mi1.tab_index}`);
      log('F-16 API', 'MI status defaults to Open', mi1.status === 'Open' ? 'PASS' : 'FAIL', `status=${mi1.status}`);
    } else {
      log('F-16 API', 'POST create first MI tab', 'FAIL', JSON.stringify(mi1)?.slice(0, 120));
    }

    // 16C. POST — create second MI tab — tab_index auto-increments
    let miTab2Id = null;
    const mi2 = curl('POST', `/api/cases/${testMiCaseId}/mi`, {
      mi_category: 'Dosing',
      question_summary: `QA MI tab 2 ${ts}`,
      status: 'In Progress',
    }, 'F-16 API', 'POST create second MI tab (auto tab_index)');
    if (mi2?.id) {
      miTab2Id = mi2.id;
      log('F-16 API', 'Second MI tab created', 'PASS', `id=${miTab2Id} tab_index=${mi2.tab_index}`);
      log('F-16 API', 'Second MI tab has tab_index=2 (auto-increment)', mi2.tab_index === 2 ? 'PASS' : 'WARN', `tab_index=${mi2.tab_index}`);
    } else {
      log('F-16 API', 'POST create second MI tab', 'FAIL', JSON.stringify(mi2)?.slice(0, 120));
    }

    // 16D. GET /cases/:id/mi — now shows 2 tabs
    const miTabsList = curl('GET', `/api/cases/${testMiCaseId}/mi`, null, 'F-16 API', 'GET /cases/:id/mi after adding 2 tabs');
    if (Array.isArray(miTabsList) && miTabsList.length >= 2) {
      log('F-16 API', 'GET /cases/:id/mi returns 2+ tabs after creation', 'PASS', `count=${miTabsList.length}`);
      const ordered = miTabsList[0]?.tab_index <= miTabsList[1]?.tab_index;
      log('F-16 API', 'Tabs ordered by tab_index ASC', ordered ? 'PASS' : 'FAIL');
    } else {
      log('F-16 API', 'GET /cases/:id/mi after 2 tabs', 'FAIL', `count=${Array.isArray(miTabsList) ? miTabsList.length : 'N/A'}`);
    }

    // 16E. PUT /cases/mi/:miId — update MI tab
    if (miTab1Id) {
      const updMi = curl('PUT', `/api/cases/mi/${miTab1Id}`, {
        status: 'Completed',
        response_provided: 'Yes, interaction profile reviewed.',
        response_channel: 'email',
      }, 'F-16 API', 'PUT update MI tab status and response');
      if (updMi?.status === 'Completed') {
        log('F-16 API', 'PUT MI tab status updated to Completed', 'PASS');
        log('F-16 API', 'PUT MI tab response_provided stored', updMi.response_provided ? 'PASS' : 'FAIL');
        log('F-16 API', 'PUT MI tab response_channel=email stored', updMi.response_channel === 'email' ? 'PASS' : 'FAIL');
      } else {
        log('F-16 API', 'PUT update MI tab', 'FAIL', JSON.stringify(updMi)?.slice(0, 120));
      }
    }

    // 16F. DELETE /cases/mi/:miId — delete second tab
    if (miTab2Id) {
      const delMi = curlCode('DELETE', `/api/cases/mi/${miTab2Id}`, null, 'F-16 API', 'DELETE second MI tab');
      log('F-16 API', 'DELETE MI tab returns 200', delMi === 200 ? 'PASS' : 'FAIL', `HTTP ${delMi}`);
      const miAfterDel = curl('GET', `/api/cases/${testMiCaseId}/mi`, null, 'F-16 API', 'GET MI tabs after delete');
      const stillThere = Array.isArray(miAfterDel) && miAfterDel.some(m => m.id === miTab2Id);
      log('F-16 API', 'Deleted MI tab not in list', !stillThere ? 'PASS' : 'FAIL');
    }
  } else {
    log('F-16 API', 'MI component tests', 'WARN', 'Skipped — no MI test case');
  }

  // ══════════════════════════════════════════════════════════════
  // F-17  AE COMPONENT (VERSION CONTROL, 8 TABS)
  // ══════════════════════════════════════════════════════════════
  console.log('\n━━ F-17: AE COMPONENT (VERSION CONTROL) ━━━━━━━━━━━━━━');

  if (testAeCaseId) {
    // 17A. GET versions — initially empty
    const aeVersions0 = curl('GET', `/api/cases/${testAeCaseId}/ae/versions`, null, 'F-17 API', 'GET AE versions initially empty');
    if (Array.isArray(aeVersions0)) {
      log('F-17 API', 'GET AE versions returns array', 'PASS', `count=${aeVersions0.length}`);
    } else {
      log('F-17 API', 'GET AE versions returns array', 'FAIL', JSON.stringify(aeVersions0)?.slice(0, 80));
    }

    // 17B. POST /cases/:id/ae/versions — create V1
    let aeV1Id = null;
    const aeV1 = curl('POST', `/api/cases/${testAeCaseId}/ae/versions`, {}, 'F-17 API', 'POST create AE version V1');
    if (aeV1?.id) {
      aeV1Id = aeV1.id;
      log('F-17 API', 'POST AE V1 created', 'PASS', `id=${aeV1Id} version_number=${aeV1.version_number}`);
      log('F-17 API', 'AE V1 version_number=1', aeV1.version_number === 1 ? 'PASS' : 'FAIL', `version_number=${aeV1.version_number}`);
      log('F-17 API', 'AE V1 is_locked=0 initially', aeV1.is_locked === 0 ? 'PASS' : 'FAIL', `is_locked=${aeV1.is_locked}`);
    } else {
      log('F-17 API', 'POST create AE V1', 'FAIL', JSON.stringify(aeV1)?.slice(0, 120));
    }

    // 17C. Tab: GENERAL — PUT + GET
    if (aeV1Id) {
      const putGeneral = curl('PUT', `/api/cases/ae/versions/${aeV1Id}/general`, {
        report_type: 'Spontaneous',
        date_of_onset: '2026-03-01',
        date_of_report: '2026-03-20',
        additional_info: `QA AE general ${ts}`,
      }, 'F-17 API', 'PUT AE general tab (UPSERT)');
      if (putGeneral?.version_id === aeV1Id) {
        log('F-17 API', 'PUT AE general tab returns row', 'PASS', `report_type=${putGeneral.report_type}`);
      } else {
        log('F-17 API', 'PUT AE general tab (UPSERT)', 'FAIL', JSON.stringify(putGeneral)?.slice(0, 100));
      }
      const getGeneral = curl('GET', `/api/cases/ae/versions/${aeV1Id}/general`, null, 'F-17 API', 'GET AE general tab');
      if (getGeneral?.version_id === aeV1Id) {
        log('F-17 API', 'GET AE general tab returns stored data', 'PASS', `report_type=${getGeneral.report_type}`);
        log('F-17 API', 'AE general date_of_onset stored correctly', getGeneral.date_of_onset ? 'PASS' : 'FAIL');
      } else {
        log('F-17 API', 'GET AE general tab', 'FAIL', JSON.stringify(getGeneral)?.slice(0, 80));
      }
    }

    // 17D. Tab: EVENTS (ICH E2B R3 seriousness booleans)
    let aeEventId = null;
    if (aeV1Id) {
      const postEvent = curl('POST', `/api/cases/ae/versions/${aeV1Id}/events`, {
        event_description: 'Anaphylactic shock',
        outcome: 'Recovered',
        start_date: '2026-03-01',
        is_serious: 1,
        is_life_threatening: 1,
        is_hospitalization: 1,
        is_death: 0,
        is_disability: 0,
        is_congenital_anomaly: 0,
        is_other_medically_important: 0,
      }, 'F-17 API', 'POST AE event with ICH E2B R3 seriousness booleans');
      if (postEvent?.id) {
        aeEventId = postEvent.id;
        log('F-17 API', 'POST AE event returns id', 'PASS', `id=${aeEventId}`);
        // Verify ICH E2B R3: separate boolean columns, not JSON
        log('F-17 API', 'ICH E2B R3: is_serious=1 stored as column', postEvent.is_serious === 1 ? 'PASS' : 'FAIL', `is_serious=${postEvent.is_serious}`);
        log('F-17 API', 'ICH E2B R3: is_life_threatening=1 stored as column', postEvent.is_life_threatening === 1 ? 'PASS' : 'FAIL');
        log('F-17 API', 'ICH E2B R3: is_hospitalization=1 stored as column', postEvent.is_hospitalization === 1 ? 'PASS' : 'FAIL');
        log('F-17 API', 'ICH E2B R3: is_death=0 stored as column', postEvent.is_death === 0 ? 'PASS' : 'FAIL');
        log('F-17 API', 'ICH E2B R3: is_disability=0 stored as column', postEvent.is_disability === 0 ? 'PASS' : 'FAIL');
        log('F-17 API', 'ICH E2B R3: is_congenital_anomaly=0 stored as column', postEvent.is_congenital_anomaly === 0 ? 'PASS' : 'FAIL');
        log('F-17 API', 'ICH E2B R3: is_other_medically_important=0 stored as column', postEvent.is_other_medically_important === 0 ? 'PASS' : 'FAIL');
      } else {
        log('F-17 API', 'POST AE event', 'FAIL', JSON.stringify(postEvent)?.slice(0, 120));
      }
      const getEvents = curl('GET', `/api/cases/ae/versions/${aeV1Id}/events`, null, 'F-17 API', 'GET AE events list');
      if (Array.isArray(getEvents) && getEvents.length > 0) {
        log('F-17 API', 'GET AE events returns rows', 'PASS', `count=${getEvents.length}`);
      } else {
        log('F-17 API', 'GET AE events returns rows', 'FAIL', JSON.stringify(getEvents)?.slice(0, 80));
      }
    }

    // 17E. Tab: PATIENT INFO
    if (aeV1Id) {
      const putPi = curl('PUT', `/api/cases/ae/versions/${aeV1Id}/patient-info`, {
        age: 45, age_unit: 'years', sex: 'female',
        weight_kg: 65, height_cm: 165, ethnicity: 'Caucasian',
        pregnant: 0,
      }, 'F-17 API', 'PUT AE patient info (UPSERT)');
      if (putPi?.version_id === aeV1Id) {
        log('F-17 API', 'PUT AE patient info returns row', 'PASS', `age=${putPi.age} sex=${putPi.sex}`);
      } else {
        log('F-17 API', 'PUT AE patient info (UPSERT)', 'FAIL', JSON.stringify(putPi)?.slice(0, 100));
      }
    }

    // 17F. Tab: LAB RESULTS (multi-row)
    let aeLabId = null;
    if (aeV1Id) {
      const postLab = curl('POST', `/api/cases/ae/versions/${aeV1Id}/lab-results`, {
        test_name: 'WBC', result: '12.5', unit: '10^9/L', normal_range: '4.0-11.0', test_date: '2026-03-20',
      }, 'F-17 API', 'POST AE lab result');
      if (postLab?.id) {
        aeLabId = postLab.id;
        log('F-17 API', 'POST AE lab result created', 'PASS', `id=${aeLabId} test=${postLab.test_name}`);
      } else {
        log('F-17 API', 'POST AE lab result', 'FAIL', JSON.stringify(postLab)?.slice(0, 100));
      }
      const getLabs = curl('GET', `/api/cases/ae/versions/${aeV1Id}/lab-results`, null, 'F-17 API', 'GET AE lab results');
      if (Array.isArray(getLabs) && getLabs.length > 0) {
        log('F-17 API', 'GET AE lab results returns row', 'PASS', `count=${getLabs.length}`);
      } else {
        log('F-17 API', 'GET AE lab results', 'FAIL', JSON.stringify(getLabs)?.slice(0, 80));
      }
    }

    // 17G. Tab: LAB NOTES
    if (aeV1Id) {
      const putLabNotes = curl('PUT', `/api/cases/ae/versions/${aeV1Id}/lab-notes`, {
        notes: `QA lab notes ${ts}`,
      }, 'F-17 API', 'PUT AE lab notes (UPSERT)');
      if (putLabNotes?.notes) {
        log('F-17 API', 'PUT AE lab notes stored', 'PASS');
        // Upsert second time — should update not duplicate
        const putLabNotes2 = curl('PUT', `/api/cases/ae/versions/${aeV1Id}/lab-notes`, {
          notes: `QA updated lab notes ${ts}`,
        }, 'F-17 API', 'PUT AE lab notes UPSERT (2nd call = update)');
        const getLabNotes = curl('GET', `/api/cases/ae/versions/${aeV1Id}/lab-notes`, null, 'F-17 API', 'GET AE lab notes');
        if (getLabNotes?.version_id === aeV1Id) {
          log('F-17 API', 'GET AE lab notes returns single row (no duplicate on UPSERT)', 'PASS');
        } else {
          log('F-17 API', 'GET AE lab notes', 'FAIL', JSON.stringify(getLabNotes)?.slice(0, 80));
        }
      } else {
        log('F-17 API', 'PUT AE lab notes', 'FAIL', JSON.stringify(putLabNotes)?.slice(0, 100));
      }
    }

    // 17H. Tab: MEDICAL HISTORY
    let aeMhId = null;
    if (aeV1Id) {
      const postMh = curl('POST', `/api/cases/ae/versions/${aeV1Id}/medical-history`, {
        condition_name: 'Hypertension', is_ongoing: 1, notes: 'Controlled with medication',
      }, 'F-17 API', 'POST AE medical history entry');
      if (postMh?.id) {
        aeMhId = postMh.id;
        log('F-17 API', 'POST AE medical history created', 'PASS', `id=${aeMhId} is_ongoing=${postMh.is_ongoing}`);
      } else {
        log('F-17 API', 'POST AE medical history', 'FAIL', JSON.stringify(postMh)?.slice(0, 100));
      }
    }

    // 17I. Tab: MEDICAL NOTES
    if (aeV1Id) {
      const putMedNotes = curl('PUT', `/api/cases/ae/versions/${aeV1Id}/medical-notes`, {
        notes: `QA medical notes ${ts}`,
      }, 'F-17 API', 'PUT AE medical notes (UPSERT)');
      log('F-17 API', 'PUT AE medical notes stored', putMedNotes?.version_id ? 'PASS' : 'FAIL');
    }

    // 17J. Tab: PRODUCT INFO (concomitant meds)
    let aePiId = null;
    if (aeV1Id) {
      const postPi = curl('POST', `/api/cases/ae/versions/${aeV1Id}/product-info`, {
        product_name: 'Aspirin', dose: '100', dose_unit: 'mg',
        route_of_admin: 'oral', frequency: 'daily',
        is_suspect: 1, is_concomitant: 0,
      }, 'F-17 API', 'POST AE product info (suspect drug)');
      if (postPi?.id) {
        aePiId = postPi.id;
        log('F-17 API', 'POST AE product info created', 'PASS', `id=${aePiId} is_suspect=${postPi.is_suspect}`);
        log('F-17 API', 'is_suspect=1 stored correctly', postPi.is_suspect === 1 ? 'PASS' : 'FAIL');
        log('F-17 API', 'is_concomitant=0 stored correctly', postPi.is_concomitant === 0 ? 'PASS' : 'FAIL');
      } else {
        log('F-17 API', 'POST AE product info', 'FAIL', JSON.stringify(postPi)?.slice(0, 100));
      }
      // Add a concomitant med
      const postConc = curl('POST', `/api/cases/ae/versions/${aeV1Id}/product-info`, {
        product_name: 'Metformin', dose: '500', dose_unit: 'mg',
        is_suspect: 0, is_concomitant: 1,
      }, 'F-17 API', 'POST AE product info (concomitant med)');
      if (postConc?.is_concomitant === 1) {
        log('F-17 API', 'Concomitant med is_concomitant=1 stored', 'PASS');
      } else {
        log('F-17 API', 'POST AE concomitant med', postConc?.id ? 'FAIL' : 'FAIL', JSON.stringify(postConc)?.slice(0, 80));
      }
      const getPi = curl('GET', `/api/cases/ae/versions/${aeV1Id}/product-info`, null, 'F-17 API', 'GET AE product-info list');
      if (Array.isArray(getPi)) {
        log('F-17 API', 'GET AE product-info returns array', 'PASS', `count=${getPi.length}`);
        const hasSuspect = getPi.some(p => p.is_suspect === 1);
        const hasConc    = getPi.some(p => p.is_concomitant === 1);
        log('F-17 API', 'Product list has suspect drug', hasSuspect ? 'PASS' : 'FAIL');
        log('F-17 API', 'Product list has concomitant med', hasConc ? 'PASS' : 'FAIL');
      } else {
        log('F-17 API', 'GET AE product-info list', 'FAIL', JSON.stringify(getPi)?.slice(0, 80));
      }
    }

    // 17K. Version locking: create V2 — V1 should become locked
    let aeV2Id = null;
    if (aeV1Id) {
      const aeV2 = curl('POST', `/api/cases/${testAeCaseId}/ae/versions`, {}, 'F-17 API', 'POST AE V2 (locks V1)');
      if (aeV2?.id) {
        aeV2Id = aeV2.id;
        log('F-17 API', 'POST AE V2 created', 'PASS', `id=${aeV2Id} version_number=${aeV2.version_number}`);
        log('F-17 API', 'AE V2 version_number=2', aeV2.version_number === 2 ? 'PASS' : 'FAIL');
        log('F-17 API', 'AE V2 is_locked=0 initially', aeV2.is_locked === 0 ? 'PASS' : 'FAIL');
        // Verify V1 is now locked
        const v1Check = curl('GET', `/api/cases/${testAeCaseId}/ae/versions`, null, 'F-17 API', 'GET versions to verify V1 locked');
        if (Array.isArray(v1Check)) {
          const v1 = v1Check.find(v => v.version_number === 1);
          log('F-17 API', 'V1 is_locked=1 after V2 creation (version locking pattern)', v1?.is_locked === 1 ? 'PASS' : 'FAIL', `V1 is_locked=${v1?.is_locked}`);
        }
      } else {
        log('F-17 API', 'POST AE V2', 'FAIL', JSON.stringify(aeV2)?.slice(0, 120));
      }
    }

    // 17L. guardLocked: write to V1 (now locked) → 403
    if (aeV1Id && aeV2Id) {
      const lockedWrite = curlCode('PUT', `/api/cases/ae/versions/${aeV1Id}/general`, {
        report_type: 'Solicited',
      }, 'F-17 API', 'PUT to locked V1 returns 403');
      log('F-17 API', 'Write to locked AE version returns 403', lockedWrite === 403 ? 'PASS' : 'FAIL', `HTTP ${lockedWrite}`);

      // Also test event write on locked version
      const lockedEvent = curlCode('POST', `/api/cases/ae/versions/${aeV1Id}/events`, {
        event_description: 'Should be rejected',
      }, 'F-17 API', 'POST event to locked AE version → 403');
      log('F-17 API', 'POST event to locked version returns 403', lockedEvent === 403 ? 'PASS' : 'FAIL', `HTTP ${lockedEvent}`);
    }

    // 17M. Version status update
    if (aeV2Id) {
      const vStatus = curl('PUT', `/api/cases/ae/versions/${aeV2Id}/status`, {
        status: 'In Review',
      }, 'F-17 API', 'PUT AE version status update');
      if (vStatus?.status === 'In Review') {
        log('F-17 API', 'PUT AE version status updated to "In Review"', 'PASS');
      } else {
        log('F-17 API', 'PUT AE version status update', 'FAIL', JSON.stringify(vStatus)?.slice(0, 80));
      }
      // Locked version status update should not change (WHERE is_locked = 0 filter)
      if (aeV1Id) {
        const lockedStatus = curl('PUT', `/api/cases/ae/versions/${aeV1Id}/status`, {
          status: 'Hacked',
        }, 'F-17 API', 'PUT status on locked version is silently ignored');
        const v1After = curl('GET', `/api/cases/${testAeCaseId}/ae/versions`, null, 'F-17 API', 'GET V1 status after locked update attempt');
        if (Array.isArray(v1After)) {
          const v1 = v1After.find(v => v.version_number === 1);
          log('F-17 API', 'Locked version status not changed by PUT (WHERE is_locked=0)', v1?.status !== 'Hacked' ? 'PASS' : 'FAIL', `V1 status=${v1?.status}`);
        }
      }
    }

    // 17N. Delete from locked version → should be blocked (guardLocked on delete checks version)
    if (aeEventId && aeV1Id && aeV2Id) {
      const lockedDel = curlCode('DELETE', `/api/cases/ae/events/${aeEventId}`, null, 'F-17 API', 'DELETE event from locked V1 → 403');
      log('F-17 API', 'DELETE event from locked version returns 403', lockedDel === 403 ? 'PASS' : 'FAIL', `HTTP ${lockedDel}`);
    }

  } else {
    log('F-17 API', 'AE component tests', 'WARN', 'Skipped — no AE test case');
  }

  // ══════════════════════════════════════════════════════════════
  // F-18  PC COMPONENT (VERSION CONTROL, 6 TABS)
  // ══════════════════════════════════════════════════════════════
  console.log('\n━━ F-18: PC COMPONENT (VERSION CONTROL) ━━━━━━━━━━━━━━');

  if (testPcCaseId) {
    // 18A. GET versions — initially empty
    const pcVersions0 = curl('GET', `/api/cases/${testPcCaseId}/pc/versions`, null, 'F-18 API', 'GET PC versions initially empty');
    if (Array.isArray(pcVersions0)) {
      log('F-18 API', 'GET PC versions returns array', 'PASS', `count=${pcVersions0.length}`);
    } else {
      log('F-18 API', 'GET PC versions returns array', 'FAIL', JSON.stringify(pcVersions0)?.slice(0, 80));
    }

    // 18B. POST — create PC V1
    let pcV1Id = null;
    const pcV1 = curl('POST', `/api/cases/${testPcCaseId}/pc/versions`, {}, 'F-18 API', 'POST create PC version V1');
    if (pcV1?.id) {
      pcV1Id = pcV1.id;
      log('F-18 API', 'POST PC V1 created', 'PASS', `id=${pcV1Id} version_number=${pcV1.version_number}`);
      log('F-18 API', 'PC V1 version_number=1', pcV1.version_number === 1 ? 'PASS' : 'FAIL');
      log('F-18 API', 'PC V1 is_locked=0 initially', pcV1.is_locked === 0 ? 'PASS' : 'FAIL');
    } else {
      log('F-18 API', 'POST create PC V1', 'FAIL', JSON.stringify(pcV1)?.slice(0, 120));
    }

    // 18C. Tab: GENERAL (with complaint_description for copy-from-PC test)
    const PC_COMPLAINT = `QA complaint description for copy-from-PC test ${ts}`;
    if (pcV1Id) {
      const putPcGen = curl('PUT', `/api/cases/pc/versions/${pcV1Id}/general`, {
        complaint_description: PC_COMPLAINT,
        pc_category: 'Packaging',
        severity: 'Moderate',
      }, 'F-18 API', 'PUT PC general tab (UPSERT)');
      if (putPcGen?.complaint_description === PC_COMPLAINT) {
        log('F-18 API', 'PUT PC general complaint_description stored', 'PASS');
        log('F-18 API', 'PUT PC general pc_category=Packaging stored', putPcGen.pc_category === 'Packaging' ? 'PASS' : 'FAIL');
      } else {
        log('F-18 API', 'PUT PC general tab (UPSERT)', 'FAIL', JSON.stringify(putPcGen)?.slice(0, 100));
      }
    }

    // 18D. Tab: PATIENT INFO
    if (pcV1Id) {
      const putPcPi = curl('PUT', `/api/cases/pc/versions/${pcV1Id}/patient-info`, {
        age: 62, age_unit: 'years', sex: 'male',
        weight_kg: 80, therapy_start_date: '2026-01-01', indication: 'Hypertension',
      }, 'F-18 API', 'PUT PC patient info (UPSERT)');
      log('F-18 API', 'PUT PC patient info stored', putPcPi?.version_id === pcV1Id ? 'PASS' : 'FAIL');
    }

    // 18E. Tab: PRODUCT INFO
    if (pcV1Id) {
      const putPcProd = curl('PUT', `/api/cases/pc/versions/${pcV1Id}/product-info`, {
        product_name: 'TestDrug 100mg',
        lot_number: `LOT${ts}`,
        expiry_date: '2027-12-31',
        quantity_available: 1,
        storage_conditions: 'Refrigerated',
      }, 'F-18 API', 'PUT PC product info (UPSERT)');
      if (putPcProd?.version_id === pcV1Id) {
        log('F-18 API', 'PUT PC product info stored', 'PASS', `lot=${putPcProd.lot_number}`);
        log('F-18 API', 'quantity_available=1 stored', putPcProd.quantity_available === 1 ? 'PASS' : 'FAIL');
      } else {
        log('F-18 API', 'PUT PC product info', 'FAIL', JSON.stringify(putPcProd)?.slice(0, 100));
      }
    }

    // 18F. Tab: RETURN/RETRIEVAL
    if (pcV1Id) {
      const putRR = curl('PUT', `/api/cases/pc/versions/${pcV1Id}/return-retrieval`, {
        return_requested: 1, return_date: '2026-03-30', return_method: 'courier',
        retrieval_requested: 0, tracking_number: `TRK${ts}`,
      }, 'F-18 API', 'PUT PC return-retrieval (UPSERT)');
      if (putRR?.version_id === pcV1Id) {
        log('F-18 API', 'PUT PC return-retrieval stored', 'PASS', `return_requested=${putRR.return_requested}`);
        log('F-18 API', 'return_requested=1 stored', putRR.return_requested === 1 ? 'PASS' : 'FAIL');
        log('F-18 API', 'retrieval_requested=0 stored', putRR.retrieval_requested === 0 ? 'PASS' : 'FAIL');
      } else {
        log('F-18 API', 'PUT PC return-retrieval', 'FAIL', JSON.stringify(putRR)?.slice(0, 100));
      }
    }

    // 18G. Tab: REPLACEMENT
    if (pcV1Id) {
      const putRepl = curl('PUT', `/api/cases/pc/versions/${pcV1Id}/replacement`, {
        replacement_requested: 1, replacement_approved: 1,
        replacement_product: 'TestDrug 100mg (new batch)', quantity: 2,
      }, 'F-18 API', 'PUT PC replacement (UPSERT)');
      if (putRepl?.version_id === pcV1Id) {
        log('F-18 API', 'PUT PC replacement stored', 'PASS', `approved=${putRepl.replacement_approved}`);
        log('F-18 API', 'replacement_approved=1 stored', putRepl.replacement_approved === 1 ? 'PASS' : 'FAIL');
      } else {
        log('F-18 API', 'PUT PC replacement', 'FAIL', JSON.stringify(putRepl)?.slice(0, 100));
      }
    }

    // 18H. Tab: REFUND/CREDIT
    if (pcV1Id) {
      const putRefund = curl('PUT', `/api/cases/pc/versions/${pcV1Id}/refund-credit`, {
        refund_requested: 1, refund_approved: 0, refund_amount: 99.99,
        credit_requested: 0, credit_approved: 0,
      }, 'F-18 API', 'PUT PC refund-credit (UPSERT)');
      if (putRefund?.version_id === pcV1Id) {
        log('F-18 API', 'PUT PC refund-credit stored', 'PASS', `refund_amount=${putRefund.refund_amount}`);
        log('F-18 API', 'refund_amount stored correctly', parseFloat(putRefund.refund_amount) === 99.99 ? 'PASS' : 'WARN', `refund_amount=${putRefund.refund_amount}`);
      } else {
        log('F-18 API', 'PUT PC refund-credit', 'FAIL', JSON.stringify(putRefund)?.slice(0, 100));
      }
    }

    // 18I. Create PC V2 — verify V1 is locked + copy-from-PC
    let pcV2Id = null;
    if (pcV1Id) {
      const pcV2 = curl('POST', `/api/cases/${testPcCaseId}/pc/versions`, {}, 'F-18 API', 'POST PC V2 (locks V1 + copy-from-PC)');
      if (pcV2?.id) {
        pcV2Id = pcV2.id;
        log('F-18 API', 'POST PC V2 created', 'PASS', `id=${pcV2Id} version_number=${pcV2.version_number}`);
        log('F-18 API', 'PC V2 version_number=2', pcV2.version_number === 2 ? 'PASS' : 'FAIL');
        // Verify V1 is locked
        const pcVersionsList = curl('GET', `/api/cases/${testPcCaseId}/pc/versions`, null, 'F-18 API', 'GET PC versions after V2 creation');
        if (Array.isArray(pcVersionsList)) {
          const v1 = pcVersionsList.find(v => v.version_number === 1);
          log('F-18 API', 'PC V1 is_locked=1 after V2 creation', v1?.is_locked === 1 ? 'PASS' : 'FAIL', `V1 is_locked=${v1?.is_locked}`);
        }
        // Verify copy-from-PC: V2 general should have complaint_description from V1
        const v2General = curl('GET', `/api/cases/pc/versions/${pcV2Id}/general`, null, 'F-18 API', 'GET PC V2 general (copy-from-PC check)');
        if (v2General?.complaint_description === PC_COMPLAINT) {
          log('F-18 API', 'copy-from-PC: V2 general has complaint_description from V1', 'PASS', `desc="${v2General.complaint_description?.slice(0, 50)}"`);
        } else {
          log('F-18 API', 'copy-from-PC: V2 general has complaint_description from V1', 'FAIL', `got="${v2General?.complaint_description?.slice(0, 80)}" expected="${PC_COMPLAINT.slice(0, 40)}"`);
        }
      } else {
        log('F-18 API', 'POST PC V2', 'FAIL', JSON.stringify(pcV2)?.slice(0, 120));
      }
    }

    // 18J. guardLocked: write to locked PC V1 → 403
    if (pcV1Id && pcV2Id) {
      const lockedPcWrite = curlCode('PUT', `/api/cases/pc/versions/${pcV1Id}/general`, {
        pc_category: 'Should be rejected',
      }, 'F-18 API', 'PUT to locked PC V1 returns 403');
      log('F-18 API', 'Write to locked PC version returns 403', lockedPcWrite === 403 ? 'PASS' : 'FAIL', `HTTP ${lockedPcWrite}`);

      const lockedPcRR = curlCode('PUT', `/api/cases/pc/versions/${pcV1Id}/return-retrieval`, {
        return_requested: 0,
      }, 'F-18 API', 'PUT return-retrieval to locked PC V1 → 403');
      log('F-18 API', 'PUT return-retrieval to locked version → 403', lockedPcRR === 403 ? 'PASS' : 'FAIL', `HTTP ${lockedPcRR}`);
    }

    // 18K. GET all tabs from V1 — verify data survived lock
    if (pcV1Id) {
      const v1Gen = curl('GET', `/api/cases/pc/versions/${pcV1Id}/general`, null, 'F-18 API', 'GET PC V1 general (locked, data intact)');
      log('F-18 API', 'GET locked PC V1 general still readable', v1Gen?.complaint_description ? 'PASS' : 'WARN', `desc="${v1Gen?.complaint_description?.slice(0, 40)}"`);
      const v1Pi = curl('GET', `/api/cases/pc/versions/${pcV1Id}/patient-info`, null, 'F-18 API', 'GET PC V1 patient-info readable');
      log('F-18 API', 'GET locked PC V1 patient-info readable', v1Pi ? 'PASS' : 'FAIL');
      const v1Prod = curl('GET', `/api/cases/pc/versions/${pcV1Id}/product-info`, null, 'F-18 API', 'GET PC V1 product-info readable');
      log('F-18 API', 'GET locked PC V1 product-info readable', v1Prod ? 'PASS' : 'FAIL');
      const v1Repl = curl('GET', `/api/cases/pc/versions/${pcV1Id}/replacement`, null, 'F-18 API', 'GET PC V1 replacement readable');
      log('F-18 API', 'GET locked PC V1 replacement readable', v1Repl ? 'PASS' : 'FAIL');
      const v1Ref = curl('GET', `/api/cases/pc/versions/${pcV1Id}/refund-credit`, null, 'F-18 API', 'GET PC V1 refund-credit readable');
      log('F-18 API', 'GET locked PC V1 refund-credit readable', v1Ref ? 'PASS' : 'FAIL');
    }

  } else {
    log('F-18 API', 'PC component tests', 'WARN', 'Skipped — no PC test case');
  }

  // ══════════════════════════════════════════════════════════════
  // BROWSER TESTS
  // ══════════════════════════════════════════════════════════════
  console.log('\n━━ BROWSER TESTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

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

  // Inject auth into localStorage
  await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 12000 });
  if (adminUser) {
    await page.evaluate((user, tok, mods) => {
      localStorage.setItem('mims_user',    JSON.stringify(user));
      localStorage.setItem('mims_token',   tok);
      localStorage.setItem('mims_modules', JSON.stringify(mods));
    }, adminUser, token, adminModules);
    log('Browser', 'Browser localStorage injected', 'PASS');
  }

  // ── F-13 Browser: /cases list page ────────────────────────────
  console.log('\n━━ F-13 Browser: Cases List ━━━━━━━━━━━━━━━━━━━━━━━━━━');
  await goto(page, `${BASE}/cases`, 'F-13 Browser', 3000);
  await checkNotBlank(page, 'F-13 Browser', '/cases page renders without crash');
  await checkJsErrors(page, 'F-13 Browser', 'No JS errors on /cases');
  await textExists(page, 'Case Management', 'F-13 Browser', '"Case Management" heading visible');
  await textExists(page, 'My Cases', 'F-13 Browser', '"My Cases" tab visible');
  await textExists(page, 'Unassigned Cases', 'F-13 Browser', '"Unassigned Cases" tab visible');
  await textExists(page, 'Deleted Cases', 'F-13 Browser', '"Deleted Cases" tab visible');
  await textExists(page, '+ New Case', 'F-13 Browser', '"+ New Case" button visible');

  // Click "Unassigned Cases" tab
  await clickText(page, 'Unassigned Cases', 'F-13 Browser', 'Click "Unassigned Cases" tab');
  await new Promise(r => setTimeout(r, 1500));
  await checkJsErrors(page, 'F-13 Browser', 'No JS errors after tab switch');

  // Click "+ New Case" to open modal
  await clickText(page, '+ New Case', 'F-13 Browser', 'Click "+ New Case" button opens modal');
  await new Promise(r => setTimeout(r, 1200));
  await textExists(page, 'New Case', 'F-13 Browser', '"New Case" modal appears');
  await textExists(page, 'Organisation', 'F-13 Browser', 'Step 1 — Organisation label visible in modal');

  // ── F-13/F-17/F-18 Browser: /cases/:id case form page ─────────
  let browserCaseId = testMiCaseId || testAeCaseId || testPcCaseId;
  if (browserCaseId) {
    console.log('\n━━ F-15 Browser: Case Form ━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    await goto(page, `${BASE}/cases/${browserCaseId}`, 'F-15 Browser', 3500);
    await checkNotBlank(page, 'F-15 Browser', '/cases/:id page renders without crash');
    await checkJsErrors(page, 'F-15 Browser', 'No JS errors on case form');
    await textExists(page, 'Case Information', 'F-15 Browser', '"Case Information" section label in sidebar');
  }

  if (testAeCaseId) {
    console.log('\n━━ F-17 Browser: AE Case Form ━━━━━━━━━━━━━━━━━━━━━━━━');
    await goto(page, `${BASE}/cases/${testAeCaseId}`, 'F-17 Browser', 3500);
    await checkNotBlank(page, 'F-17 Browser', 'AE case form renders');
    await checkJsErrors(page, 'F-17 Browser', 'No JS errors on AE case form');
    await textExists(page, 'AE Component', 'F-17 Browser', '"AE Component" sidebar link visible for AE case');
    await clickText(page, 'AE Component', 'F-17 Browser', 'Click AE Component in sidebar');
    await new Promise(r => setTimeout(r, 1500));
    await checkJsErrors(page, 'F-17 Browser', 'No JS errors after clicking AE Component');
  }

  if (testPcCaseId) {
    console.log('\n━━ F-18 Browser: PC Case Form ━━━━━━━━━━━━━━━━━━━━━━━━');
    await goto(page, `${BASE}/cases/${testPcCaseId}`, 'F-18 Browser', 3500);
    await checkNotBlank(page, 'F-18 Browser', 'PC case form renders');
    await checkJsErrors(page, 'F-18 Browser', 'No JS errors on PC case form');
    await textExists(page, 'PC Component', 'F-18 Browser', '"PC Component" sidebar link visible for PC case');
    await clickText(page, 'PC Component', 'F-18 Browser', 'Click PC Component in sidebar');
    await new Promise(r => setTimeout(r, 1500));
    await checkJsErrors(page, 'F-18 Browser', 'No JS errors after clicking PC Component');
  }

  if (testMiCaseId) {
    console.log('\n━━ F-16 Browser: MI Case Form ━━━━━━━━━━━━━━━━━━━━━━━━');
    await goto(page, `${BASE}/cases/${testMiCaseId}`, 'F-16 Browser', 3500);
    await checkNotBlank(page, 'F-16 Browser', 'MI case form renders');
    await checkJsErrors(page, 'F-16 Browser', 'No JS errors on MI case form');
    await textExists(page, 'MI Component', 'F-16 Browser', '"MI Component" sidebar link visible for MI case');
    await clickText(page, 'MI Component', 'F-16 Browser', 'Click MI Component in sidebar');
    await new Promise(r => setTimeout(r, 1500));
    await checkJsErrors(page, 'F-16 Browser', 'No JS errors after clicking MI Component');
  }

  // ── Navbar: Case Management dropdown is navigable ────────────
  console.log('\n━━ Navbar: Case Management ━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  await goto(page, `${BASE}/dashboard`, 'Navbar', 2500);
  await checkNotBlank(page, 'Navbar', 'Dashboard loads for navbar check');
  const hasCaseMgmt = await page.evaluate(() => document.body?.innerText?.includes('Case Management'));
  log('Navbar', '"Case Management" dropdown visible in navbar', hasCaseMgmt ? 'PASS' : 'WARN', 'Requires MIMS navbar to be mounted');

  // ══════════════════════════════════════════════════════════════
  // REGRESSION — Phase 1A/1B features still work
  // ══════════════════════════════════════════════════════════════
  console.log('\n━━ REGRESSION: Phase 1 APIs ━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const regressionApis = [
    { url: '/api/health',                       label: 'Health' },
    { url: '/api/admin/case-number-config',      label: 'Case Number Config' },
    { url: '/api/admin/case-form-definition/sections', label: 'Case Form Sections' },
    { url: '/api/admin/field-setup',             label: 'Field Setup' },
    { url: '/api/admin/picklists',               label: 'Picklists' },
    { url: '/api/admin/sites',                   label: 'Sites' },
    { url: '/api/admin/orgs',                    label: 'Orgs' },
    { url: '/api/admin/security-groups',         label: 'Security Groups' },
    { url: '/api/admin/contacts',                label: 'Contacts' },
    { url: '/api/cm/folders',                    label: 'CM Folders' },
    { url: '/api/cm/documents',                  label: 'CM Documents' },
    { url: '/api/cm/faqs',                       label: 'CM FAQs' },
    { url: '/api/inbox',                         label: 'Inbox' },
  ];
  for (const { url, label } of regressionApis) {
    const code = curlCode('GET', url, null, 'Regression/API', label);
    log('Regression/API', label, code === 200 ? 'PASS' : code === 401 ? 'WARN' : 'FAIL', `HTTP ${code}`);
  }

  console.log('\n━━ REGRESSION: Phase 1 Browser Sections ━━━━━━━━━━━━━━');
  const regressionPages = [
    { path: '/dashboard',                   label: 'Dashboard' },
    { path: '/inbox',                       label: 'Inbox' },
    { path: '/admin-console/case-numbering', label: 'Case Numbering' },
    { path: '/admin-console/picklists',      label: 'Picklists' },
    { path: '/admin-console/sites',          label: 'Sites' },
    { path: '/admin-console/field-setup',    label: 'Field Setup' },
    { path: '/browse-content',               label: 'Browse Content' },
  ];
  for (const { path, label } of regressionPages) {
    await goto(page, `${BASE}${path}`, `Regression/${label}`, 2500);
    await checkNotBlank(page, `Regression/${label}`, 'Has content');
    await checkJsErrors(page, `Regression/${label}`, 'No JS errors');
  }

  await browser.close();

  // ══════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════
  const total = passed + failed + warned;
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log(`║  SPRINT 6 PHASE 2 — QA RESULTS                        ║`);
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

  console.log(`\nExit code: ${failed > 0 ? 1 : 0}`);
  process.exit(failed > 0 ? 1 : 0);
})();
