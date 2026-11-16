'use strict';

/**
 * verify-rep1-rep4-ui.js — Browser Verification for REP-1 (PDF Export) and REP-4 (Case Drill Drawer)
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = '/Users/rohithkarne/.gemini/antigravity/brain/1b01e546-f649-45c2-ae62-dcda46c90173/screenshots';
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function verifyRep1AndRep4() {
  console.log('🚀 Starting REP-1 & REP-4 Live Browser Verification...');

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true
  });

  const page = await context.newPage();
  const consoleErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', (err) => {
    consoleErrors.push(`Uncaught: ${err.message}`);
  });

  try {
    // 1. Sign in
    console.log('Step 1: Signing in as qa.verifier@novartis-demo.com...');
    await page.goto('http://127.0.0.1:3000/mims/login', { waitUntil: 'networkidle' });
    await page.fill('input[placeholder="you@company.com"]', 'qa.verifier@novartis-demo.com');
    await page.click('button[type="submit"]');

    await page.waitForSelector('input[type="password"]', { timeout: 10000 });
    await page.fill('input[type="password"]', 'QATestPassword123!');
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    console.log('✅ Logged in successfully.');

    // 2. Navigate to Reports
    console.log('Step 2: Navigating to Reports page (/mims/reports)...');
    await page.goto('http://127.0.0.1:3000/mims/reports', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // 3. Select Open Cases by Age
    console.log('Step 3: Selecting "Open Cases by Age" report...');
    const reportBtn = page.locator('button:has-text("Open Cases by Age")').first();
    await reportBtn.click();
    await page.waitForTimeout(500);

    // Run report
    console.log('Running report...');
    const runResponsePromise = page.waitForResponse(res => res.url().includes('/run'));
    await page.click('button:text-is("Run")');
    await runResponsePromise;
    await page.waitForTimeout(1000);

    // 4. Verify Export PDF button (REP-1)
    console.log('Step 4: Checking "Export PDF" button visibility and state...');
    const pdfBtn = page.locator('button[data-testid="export-pdf-button"]');
    const pdfBtnCount = await pdfBtn.count();
    if (pdfBtnCount === 0) {
      throw new Error('Export PDF button not found on screen!');
    }
    const isPdfDisabled = await pdfBtn.isDisabled();
    console.log(`✅ Export PDF button found. Disabled state: ${isPdfDisabled}`);
    if (isPdfDisabled) {
      throw new Error('Export PDF button is unexpectedly disabled despite table having data!');
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '16_rep1_pdf_export_screen.png') });
    console.log('📸 Captured: 16_rep1_pdf_export_screen.png');

    // 5. Trigger PDF Download and verify file on disk (REP-1)
    console.log('Step 5: Clicking "Export PDF" and awaiting download...');
    const downloadPromise = page.waitForEvent('download');
    await pdfBtn.click();
    const download = await downloadPromise;
    const downloadPath = path.join(SCREENSHOT_DIR, 'executive_report_export.pdf');
    await download.saveAs(downloadPath);
    console.log(`✅ Downloaded PDF successfully saved to: ${downloadPath}`);

    const stats = fs.statSync(downloadPath);
    const pdfBuffer = fs.readFileSync(downloadPath);
    const headerStr = pdfBuffer.subarray(0, 15).toString();
    console.log(`PDF Size: ${stats.size} bytes`);
    console.log(`PDF Header: ${headerStr}`);

    if (stats.size < 1000 || !headerStr.includes('%PDF-1.4')) {
      throw new Error(`Downloaded PDF failed integrity check! Size=${stats.size}, Header=${headerStr}`);
    }
    console.log('✅ REP-1 Verified: Valid %PDF-1.4 generated and downloaded.');

    // 6. Test In-Context Case Drill-Through Drawer (REP-4)
    console.log('Step 6: Testing In-Context Case Drill-Through Drawer (REP-4)...');
    // Find the first clickable row in the table
    const firstRow = page.locator('tbody tr[title="Open"]').first();
    const rowCount = await firstRow.count();
    if (rowCount === 0) {
      throw new Error('No clickable table rows with title="Open" found in report!');
    }

    console.log('Clicking first table row to open Case Drill-Through Drawer...');
    await firstRow.click();
    await page.waitForTimeout(800);

    // Check if drawer appeared
    const drawer = page.locator('[data-testid="case-drill-drawer"]');
    const isDrawerVisible = await drawer.isVisible();
    console.log(`Drawer visible: ${isDrawerVisible}`);
    if (!isDrawerVisible) {
      throw new Error('Case Drill-Through Drawer did not open upon clicking table row!');
    }

    // Verify drawer contents
    const drawerText = await drawer.innerText();
    console.log('Drawer text preview:\n', drawerText.slice(0, 300).replace(/\n+/g, ' | '));

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '14_rep4_case_drill_drawer.png') });
    console.log('📸 Captured: 14_rep4_case_drill_drawer.png');

    // 7. Verify closing drawer maintains report state
    console.log('Step 7: Closing Case Drill-Through Drawer...');
    const closeBtn = drawer.locator('button[aria-label="Close drawer"]');
    await closeBtn.click();
    await page.waitForTimeout(500);

    const isDrawerStillVisible = await drawer.isVisible();
    console.log(`Drawer closed cleanly: ${!isDrawerStillVisible}`);
    if (isDrawerStillVisible) {
      throw new Error('Drawer failed to close upon clicking close button!');
    }

    // Verify report table is still fully rendered and visible
    const tableVisible = await page.locator('table').isVisible();
    console.log(`Report table intact: ${tableVisible}`);
    if (!tableVisible) {
      throw new Error('Report table disappeared after closing drawer!');
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '15_rep4_drawer_closed.png') });
    console.log('📸 Captured: 15_rep4_drawer_closed.png');

    console.log('\n--- VERIFICATION RESULT ---');
    console.log(`Total console errors: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.warn('Console errors encountered:', consoleErrors);
    }

    console.log('🎉 ALL REP-1 AND REP-4 SCREEN CHECKS PASSED WITH 100% SUCCESS!');
  } catch (err) {
    console.error('❌ Verification failed:', err);
    throw err;
  } finally {
    await browser.close();
  }
}

verifyRep1AndRep4().catch((err) => {
  console.error(err);
  process.exit(1);
});
