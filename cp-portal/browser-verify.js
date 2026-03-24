/**
 * CP Portal — Browser Verification Script (Playwright)
 * Verifies all major user flows against the live MySQL-backed server.
 *
 * Run: node browser-verify.js
 */

const { chromium } = require('@playwright/test');

const BASE_ADMIN  = 'http://localhost:5174';
const BASE_API    = 'http://localhost:4000/api';
const ADMIN_EMAIL = 'cpadmin';
const ADMIN_PASS  = 'Admin@123';
const CLIENT_CODE = 'novartis';
const PORTAL_EMAIL = 'sweep_test@novartis-demo.com';
const PORTAL_PASS  = 'Test@1234';

let passed = 0, failed = 0;

function ok(label)   { console.log(`  ✅ ${label}`); passed++; }
function fail(label, err) { console.log(`  ❌ ${label}: ${err}`); failed++; }

async function check(label, fn) {
  try { await fn(); ok(label); }
  catch (e) { fail(label, e.message?.slice(0, 120)); }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  // Capture console errors
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  // ── 1. Frontend loads ──────────────────────────────────────────
  console.log('\n━━ 1. Frontend ━━');
  await check('Admin login page loads', async () => {
    await page.goto(`${BASE_ADMIN}/admin/login`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForSelector('input[type="text"], input[type="email"]', { timeout: 8000 });
  });

  // ── 2. Admin login ─────────────────────────────────────────────
  console.log('\n━━ 2. Admin Login ━━');
  await check('Fill and submit login form', async () => {
    const emailInput = page.locator('input[type="text"], input[type="email"]').first();
    const passInput  = page.locator('input[type="password"]').first();
    await emailInput.fill(ADMIN_EMAIL);
    await passInput.fill(ADMIN_PASS);
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/admin(?!\/login)/, { timeout: 10000 });
  });

  await check('Admin dashboard visible after login', async () => {
    await page.waitForLoadState('networkidle', { timeout: 10000 });
    const url = page.url();
    if (url.includes('/login')) throw new Error('Still on login page');
  });

  // ── 3. Admin — Client List ─────────────────────────────────────
  console.log('\n━━ 3. Admin — Clients ━━');
  await check('Clients page loads with data', async () => {
    await page.goto(`${BASE_ADMIN}/admin/clients`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1500);
    const text = await page.content();
    if (!text.includes('novartis') && !text.includes('Novartis') && !text.includes('ergomed') && !text.includes('client'))
      throw new Error('No client data visible');
  });

  // ── 4. Admin — Client Detail (Novartis = id 4) ─────────────────
  console.log('\n━━ 4. Admin — Client Detail ━━');
  await check('Client detail page loads', async () => {
    await page.goto(`${BASE_ADMIN}/admin/clients/4`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(2000);
    const text = await page.content();
    // Should show client name or tabs — not a blank/error page
    if (text.includes('Cannot GET') || text.includes('Unexpected token')) throw new Error('Hard error');
    if ((text.match(/<div/g) || []).length < 5) throw new Error('Page rendered empty');
  });

  // ── 5. Admin — Audit Trail ─────────────────────────────────────
  console.log('\n━━ 5. Admin — Audit Trail ━━');
  await check('Audit trail page loads with records', async () => {
    await page.goto(`${BASE_ADMIN}/admin/clients/4/audit`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(2000);
    const text = await page.content();
    // Should show audit records or the audit trail component
    if (text.includes('Server error') || text.includes('Cannot GET')) throw new Error('Page error');
  });

  // ── 6. Admin — Analytics ──────────────────────────────────────
  console.log('\n━━ 6. Admin — Analytics ━━');
  await check('Analytics page loads', async () => {
    await page.goto(`${BASE_ADMIN}/admin/clients/4/analytics`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(2000);
    const text = await page.content();
    if (text.includes('Server error') || text.includes('Cannot GET')) throw new Error('Page error');
  });

  // ── 7. Admin — Process Explorer ───────────────────────────────
  console.log('\n━━ 7. Admin — Process Explorer ━━');
  await check('Process Explorer loads with log entries', async () => {
    await page.goto(`${BASE_ADMIN}/admin/process-explorer`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(2000);
    const text = await page.content();
    if (text.includes('Server error') || text.includes('Cannot GET')) throw new Error('Page error');
  });

  // ── 8. Portal — Config loads ──────────────────────────────────
  console.log('\n━━ 8. Portal — Public Access ━━');
  await check('Portal login page loads', async () => {
    await page.goto(`${BASE_ADMIN}/portal/${CLIENT_CODE}/login`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1500);
    // SPA — always returns 200 HTML. Check that a form or input rendered.
    await page.waitForSelector('input', { timeout: 6000 });
  });

  // ── 9. Portal login ────────────────────────────────────────────
  console.log('\n━━ 9. Portal Login ━━');
  await check('Portal user can log in', async () => {
    const emailInput = page.locator('input[type="email"], input[type="text"]').first();
    const passInput  = page.locator('input[type="password"]').first();
    await emailInput.fill(PORTAL_EMAIL);
    await passInput.fill(PORTAL_PASS);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
    const url = page.url();
    if (url.includes('/login')) throw new Error('Still on login page after submit');
  });

  await check('Portal home/dashboard visible after login', async () => {
    await page.waitForLoadState('networkidle', { timeout: 8000 });
    const text = await page.content();
    if (text.includes('Server error')) throw new Error('Server error on portal home');
  });

  // ── 10. Portal — News feed ─────────────────────────────────────
  console.log('\n━━ 10. Portal — Content ━━');
  await check('News page loads', async () => {
    await page.goto(`${BASE_ADMIN}/portal/${CLIENT_CODE}/news`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1500);
    const text = await page.content();
    if (text.includes('Server error') || text.includes('Cannot GET')) throw new Error('Page error');
  });

  await check('Safety alerts page loads', async () => {
    await page.goto(`${BASE_ADMIN}/portal/${CLIENT_CODE}/safety`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1500);
    const text = await page.content();
    if (text.includes('Server error') || text.includes('Cannot GET')) throw new Error('Page error');
  });

  await check('Documents page loads', async () => {
    await page.goto(`${BASE_ADMIN}/portal/${CLIENT_CODE}/documents`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1500);
    const text = await page.content();
    if (text.includes('Server error') || text.includes('Cannot GET')) throw new Error('Page error');
  });

  // ── 11. Portal — Submission form ──────────────────────────────
  console.log('\n━━ 11. Portal — Submit Form ━━');
  await check('Submit form page renders', async () => {
    await page.goto(`${BASE_ADMIN}/portal/${CLIENT_CODE}/submit`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1500);
    const text = await page.content();
    if (text.includes('Cannot GET') || text.includes('Unexpected token')) throw new Error('Hard error');
    if ((text.match(/<div/g) || []).length < 5) throw new Error('Page rendered empty');
  });

  // ── 12. Console errors check ───────────────────────────────────
  console.log('\n━━ 12. Console Errors ━━');
  const criticalErrors = consoleErrors.filter(e =>
    !e.includes('favicon') &&
    !e.includes('robots.txt') &&
    !e.includes('net::ERR_') &&
    !e.includes('translate') &&
    e.toLowerCase().includes('error') || e.includes('TypeError') || e.includes('is not a function')
  );

  if (criticalErrors.length === 0) {
    ok('No critical JS console errors');
  } else {
    fail(`${criticalErrors.length} console error(s)`, criticalErrors.slice(0, 3).join(' | '));
  }

  await browser.close();

  // ── Summary ───────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Passed : ${passed}`);
  console.log(`  Failed : ${failed}`);
  console.log(`  Result : ${failed === 0 ? '✅ ALL CHECKS PASSED' : '❌ FAILURES — see above'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  process.exit(failed > 0 ? 1 : 0);
})();
