'use strict';
/**
 * MIMS Full Functional Browser Test
 * Uses puppeteer-core + system Chrome (headless)
 *
 * Routes confirmed:
 *   /login                          — LoginPage
 *   /dashboard                      — DashboardPage
 *   /inbox                          — InboxPage
 *   /admin-console                  — AdminConsoleOverview
 *   /admin-console/:section         — AdminConsolePage (picklists, field-setup, user-security, case-contacts, company-reps)
 *   /content                        — ContentPage (tabs: documents, faqs, merge-reports, templates)
 *
 * Credentials: superadmin / Manager@123
 */

const puppeteer = require('puppeteer-core');

const CHROME  = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE    = 'http://localhost:5173';
const API     = 'http://localhost:3000';
const CREDS   = { email: 'superadmin', password: 'Manager@123' };

const results = [];
let   passed  = 0;
let   failed  = 0;
let   warned  = 0;

function log(section, test, status, detail = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  const line = `  ${icon} [${section}] ${test}${detail ? ' — ' + detail : ''}`;
  console.log(line);
  results.push({ section, test, status, detail });
  if (status === 'PASS') passed++;
  else if (status === 'FAIL') failed++;
  else warned++;
}

async function waitFor(page, selector, section, label, timeout = 8000) {
  try {
    await page.waitForSelector(selector, { timeout });
    log(section, label, 'PASS');
    return true;
  } catch {
    const body = await page.evaluate(() => document.body?.innerText?.slice(0, 200) || '').catch(() => '');
    log(section, label, 'FAIL', body.slice(0, 100).replace(/\n/g,' ') || 'Selector not found');
    return false;
  }
}

async function checkNotBlank(page, section, label) {
  const text = await page.evaluate(() => document.body?.innerText?.trim() || '').catch(() => '');
  const blank = text.length < 40;
  const crashed = text.includes('Cannot read') || text.includes('is not a function') || text.includes('Something went wrong');
  if (crashed) { log(section, label, 'FAIL', 'React crash detected: ' + text.slice(0, 100)); return false; }
  if (blank)   { log(section, label, 'FAIL', 'Page appears blank (< 40 chars)'); return false; }
  log(section, label, 'PASS');
  return true;
}

async function checkJsErrors(page, section, label) {
  const errs = (page._jsErrors || []).filter(e =>
    e.includes('TypeError') || e.includes('is not a function') || e.includes('Cannot read') ||
    e.includes('.map') || e.includes('undefined') && e.includes('read')
  );
  if (errs.length) { log(section, label, 'FAIL', errs[0].slice(0, 150)); return false; }
  log(section, label, 'PASS');
  return true;
}

async function goto(page, url, section) {
  page._jsErrors = [];
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 12000 });
    await new Promise(r => setTimeout(r, 1500));
    log(section, `Load ${url}`, 'PASS');
    return true;
  } catch (e) {
    log(section, `Load ${url}`, 'FAIL', e.message.slice(0, 100));
    return false;
  }
}

async function clickTab(page, tabText, section) {
  try {
    page._jsErrors = [];
    const result = await page.evaluate((txt) => {
      // Try multiple selector strategies
      const allEls = [...document.querySelectorAll('*')];
      // Strategy 1: exact text match on common tab elements
      let el = allEls.find(e =>
        (e.className?.includes?.('tab') || e.tagName === 'BUTTON') &&
        e.textContent?.trim() === txt
      );
      // Strategy 2: text includes match
      if (!el) el = allEls.find(e =>
        (e.className?.includes?.('tab') || e.tagName === 'BUTTON') &&
        e.textContent?.trim().includes(txt)
      );
      // Strategy 3: any clickable with matching text
      if (!el) el = allEls.find(e =>
        (e.tagName === 'DIV' || e.tagName === 'SPAN' || e.tagName === 'A') &&
        e.textContent?.trim() === txt &&
        window.getComputedStyle(e).cursor === 'pointer'
      );
      if (el) { el.click(); return { clicked: true, tag: el.tagName, cls: el.className }; }
      // Debug: list all tab-like elements
      const tabEls = allEls
        .filter(e => e.className?.includes?.('tab') || (e.tagName === 'BUTTON' && e.textContent?.trim().length < 30))
        .map(e => e.textContent?.trim())
        .filter(Boolean)
        .slice(0, 10);
      return { clicked: false, available: tabEls };
    }, tabText);

    if (!result.clicked) {
      log(section, `Click tab "${tabText}"`, 'FAIL', `Available: [${result.available?.join(', ')}]`);
      return false;
    }
    await new Promise(r => setTimeout(r, 2000));
    log(section, `Click tab "${tabText}"`, 'PASS', `${result.tag}.${result.cls}`);
    return true;
  } catch (e) {
    log(section, `Click tab "${tabText}"`, 'FAIL', e.message);
    return false;
  }
}

// ──────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  MIMS Full Functional Browser Test — Headless Chrome');
  console.log('══════════════════════════════════════════════════════\n');

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

  // ──────────────────────────────────────────────
  // 1. LOGIN
  // ──────────────────────────────────────────────
  console.log('━━ 1. LOGIN ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Get auth token via curl (backend API) then inject into browser localStorage
  const { execSync: execSyncEarly } = require('child_process');
  let earlyToken = '', earlyUser = null, earlyModules = [];
  try {
    const loginRes = execSyncEarly(
      `curl -s -X POST ${API}/api/auth/login -H "Content-Type: application/json" -d '{"email":"superadmin","password":"Manager@123"}'`
    ).toString();
    const parsed = JSON.parse(loginRes);
    earlyToken   = parsed.token || '';
    earlyUser    = parsed.user  || null;
    earlyModules = parsed.modules || [];
    log('Login', 'API login (superadmin / Manager@123)', earlyToken ? 'PASS' : 'FAIL', earlyToken ? 'Token received' : parsed.error || 'No token');
  } catch (e) {
    log('Login', 'API login', 'FAIL', e.message.slice(0, 100));
  }

  // Load the login page so the domain is set, then inject auth into localStorage
  await goto(page, BASE + '/login', 'Login');
  await waitFor(page, 'input[type="password"]', 'Login', 'Login form renders');

  if (earlyToken && earlyUser) {
    try {
      await page.evaluate((user, token, modules) => {
        localStorage.setItem('mims_user',    JSON.stringify(user));
        localStorage.setItem('mims_token',   token);
        localStorage.setItem('mims_modules', JSON.stringify(modules));
      }, earlyUser, earlyToken, earlyModules);
      log('Login', 'Auth injected into localStorage', 'PASS');

      // Navigate to dashboard — ProtectedRoute reads localStorage
      await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle2', timeout: 10000 });
      await new Promise(r => setTimeout(r, 1500));
      const url = await page.evaluate(() => window.location.pathname);
      const ok  = !url.includes('/login');
      log('Login', 'Redirect to protected route works', ok ? 'PASS' : 'FAIL', `→ ${url}`);
    } catch (e) {
      log('Login', 'Auth inject + redirect', 'FAIL', e.message);
    }
  }

  // ──────────────────────────────────────────────
  // 2. DASHBOARD
  // ──────────────────────────────────────────────
  console.log('\n━━ 2. DASHBOARD ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  await goto(page, BASE + '/dashboard', 'Dashboard');
  await checkNotBlank(page, 'Dashboard', 'Page has content');
  await checkJsErrors(page, 'Dashboard', 'No JS errors');

  // ──────────────────────────────────────────────
  // 3. INBOX
  // ──────────────────────────────────────────────
  console.log('\n━━ 3. INBOX ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  await goto(page, BASE + '/inbox', 'Inbox');
  await checkNotBlank(page, 'Inbox', 'Page has content');
  await checkJsErrors(page, 'Inbox', 'No JS errors');

  // ──────────────────────────────────────────────
  // 4. ADMIN CONSOLE — OVERVIEW
  // ──────────────────────────────────────────────
  console.log('\n━━ 4. ADMIN CONSOLE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  await goto(page, BASE + '/admin-console', 'Admin/Overview');
  await checkNotBlank(page, 'Admin/Overview', 'Overview has content');
  await checkJsErrors(page, 'Admin/Overview', 'No JS errors');

  // Admin Console sections (navigate by URL — sections are URL-driven)
  const adminSections = [
    { key: 'picklists',      label: 'Picklists' },
    { key: 'field-setup',    label: 'Field Setup' },
    { key: 'user-security',  label: 'User Security Groups' },
    { key: 'case-contacts',  label: 'Case Contacts' },
    { key: 'company-reps',   label: 'Company Reps' },
    { key: 'audit-admin',    label: 'Admin Audit Trail' },
    { key: 'audit-login',    label: 'Login Audit Trail' },
  ];

  for (const { key, label } of adminSections) {
    console.log(`\n  ↳ Admin Section: ${label}`);
    const url = `${BASE}/admin-console/${key}`;
    await goto(page, url, `Admin/${label}`);
    await checkNotBlank(page, `Admin/${label}`, 'Has content');
    await checkJsErrors(page, `Admin/${label}`, 'No JS errors');
  }

  // ──────────────────────────────────────────────
  // 5. CONTENT MANAGEMENT
  // ──────────────────────────────────────────────
  console.log('\n━━ 5. CONTENT MANAGEMENT ━━━━━━━━━━━━━━━━━━━━━━━━━━');
  await goto(page, BASE + '/content', 'CM/Base');
  await checkNotBlank(page, 'CM/Base', 'Content page loads');
  await checkJsErrors(page, 'CM/Base', 'No JS errors on load');

  // Test each tab
  const cmTabs = ['Documents', 'FAQs', 'Merge Reports', 'Templates'];
  for (const tab of cmTabs) {
    console.log(`\n  ↳ CM Tab: ${tab}`);
    await clickTab(page, tab, `CM/${tab}`);
    await checkNotBlank(page, `CM/${tab}`, 'Has content after tab switch');
    await checkJsErrors(page, `CM/${tab}`, 'No JS errors');
  }

  // ──────────────────────────────────────────────
  // 6. BACKEND API CHECKS (via curl — avoids CORS)
  // ──────────────────────────────────────────────
  console.log('\n━━ 6. BACKEND API CHECKS ━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Get auth token via login
  const { execSync } = require('child_process');
  let token = '';
  try {
    const loginRes = execSync(
      `curl -s -X POST ${API}/api/auth/login -H "Content-Type: application/json" -d '{"email":"superadmin","password":"Manager@123"}'`
    ).toString();
    token = JSON.parse(loginRes).token || '';
    log('API', 'Auth token obtained', token ? 'PASS' : 'FAIL');
  } catch (e) {
    log('API', 'Auth token obtained', 'FAIL', e.message);
  }

  const H = token ? `-H "Authorization: Bearer ${token}"` : '';

  const apiEndpoints = [
    { url: '/api/health',                     label: 'Health' },
    { url: '/api/admin/picklists',            label: 'Admin Picklists' },
    { url: '/api/admin/field-setup',          label: 'Admin Field Setup' },
    { url: '/api/admin/security-groups',      label: 'Admin Security Groups' },
    { url: '/api/admin/contacts',             label: 'Admin Contacts' },
    { url: '/api/admin/company-reps',         label: 'Admin Company Reps' },
    { url: '/api/admin/audit-logs',           label: 'Admin Audit Logs' },
    { url: '/api/cm/folders',                 label: 'CM Folders' },
    { url: '/api/cm/documents',               label: 'CM Documents' },
    { url: '/api/cm/faqs',                    label: 'CM FAQs' },
    { url: '/api/cm/merge-reports',           label: 'CM Merge Reports' },
    { url: '/api/cm/templates',               label: 'CM Templates' },
    { url: '/api/cm/reviews/all',             label: 'CM Reviews' },
    { url: '/api/admin/orgs',                 label: 'Admin Orgs' },
    { url: '/api/admin/users',                label: 'Admin Users' },
  ];

  for (const { url, label } of apiEndpoints) {
    try {
      const out = execSync(`curl -s -o /dev/null -w "%{http_code}" ${H} ${API}${url}`, { timeout: 8000 }).toString().trim();
      const code = parseInt(out, 10);
      if (code === 200) {
        // Also check response shape
        const body = execSync(`curl -s ${H} "${API}${url}"`, { timeout: 8000 }).toString();
        let parsed;
        try { parsed = JSON.parse(body); } catch { parsed = null; }
        const hasError = parsed && parsed.error;
        if (hasError) {
          log('API', label, 'FAIL', `HTTP 200 but body.error="${parsed.error}"`);
        } else {
          log('API', label, 'PASS', `HTTP 200`);
        }
      } else if (code === 401) {
        log('API', label, 'WARN', `HTTP 401 — endpoint exists but auth failed`);
      } else {
        const body = execSync(`curl -s ${H} "${API}${url}"`, { timeout: 8000 }).toString().slice(0, 150);
        log('API', label, 'FAIL', `HTTP ${code} — ${body}`);
      }
    } catch (e) {
      log('API', label, 'FAIL', e.message.slice(0, 100));
    }
  }

  // ──────────────────────────────────────────────
  // SUMMARY
  // ──────────────────────────────────────────────
  await browser.close();

  console.log('\n══════════════════════════════════════════════════════');
  console.log(`  RESULTS: ✅ ${passed} PASSED  |  ❌ ${failed} FAILED  |  ⚠️  ${warned} WARNINGS`);
  console.log('══════════════════════════════════════════════════════');

  if (failed > 0) {
    console.log('\n❌ FAILURES:\n');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  • [${r.section}] ${r.test}`);
      if (r.detail) console.log(`    ${r.detail}`);
    });
  }
  if (warned > 0) {
    console.log('\n⚠️  WARNINGS:\n');
    results.filter(r => r.status === 'WARN').forEach(r => {
      console.log(`  • [${r.section}] ${r.test}${r.detail ? ' — ' + r.detail : ''}`);
    });
  }

  if (failed === 0) console.log('\n🎉 All tests passed!');
  console.log('');
  process.exit(failed > 0 ? 1 : 0);
})();
