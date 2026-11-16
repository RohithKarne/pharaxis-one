'use strict';

const path = require('path');
const { chromium } = require('playwright');
const db = require('../database/db');

const SCREENSHOT_DIR = '/Users/rohithkarne/.gemini/antigravity/brain/1b01e546-f649-45c2-ae62-dcda46c90173/screenshots';

async function walkDrop3() {
  console.log('🚀 Starting Case Form Upgrade Drop 3 Live Browser Walk...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 950 }
  });

  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      if (!txt.includes('favicon') && !txt.includes('404 (Not Found)')) {
        consoleErrors.push(txt);
      }
    }
  });

  // Handle window.prompt dialogs for Medical Director Clearance
  page.on('dialog', async (dialog) => {
    console.log(`[Dialog ${dialog.type()}]: ${dialog.message()}`);
    await dialog.accept('Approved for scientific exchange under Medical Affairs Director regulatory oversight.');
  });

  try {
    // 1. Sign In
    console.log('Step 1: Signing in as qa.verifier@novartis-demo.com...');
    await page.goto('http://127.0.0.1:3000/mims/login', { waitUntil: 'networkidle' });
    await page.fill('input[placeholder="you@company.com"]', 'qa.verifier@novartis-demo.com');
    await page.click('button[type="submit"]');

    await page.waitForSelector('input[type="password"]', { timeout: 10000 });
    await page.fill('input[type="password"]', 'QATestPassword123!');
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
    console.log('✅ Logged in successfully.');

    // Reset test cases to clean state for deterministic verification walk
    await db.query(`
      UPDATE case_mi 
      SET is_off_label = 0, is_solicited = 0, promo_review_status = 'not_required', commercial_clearance_status = 'not_required'
      WHERE case_id = 483147
    `);
    await db.query(`
      UPDATE case_pc_general 
      SET is_patient_harm = 0, is_far_reportable = 0, far_due_date = NULL, far_status = 'not_required'
      WHERE version_id = 52
    `);

    // 2. Test CF-06: Off-Label Solicited Commercial Gating (MI Form)
    console.log('Step 2: Navigating to MI Case 483147 (/mims/cases/483147)...');
    await page.goto('http://127.0.0.1:3000/mims/cases/483147', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Switch to Step 2 (Product & Details / MI tab)
    console.log('Switching to Step 2 (Product & Details)...');
    const step2Btn = page.locator('button[aria-label="Step 2: Product & Details"]');
    await step2Btn.click();
    await page.waitForTimeout(1000);

    // Locate Inquiry classification panel
    console.log('Editing Inquiry Classification to flag as Off-Label and Solicited (Commercial)...');
    const editClassificationBtn = page.locator('.cf-mi-approval-block button:has-text("Edit")');
    if (await editClassificationBtn.count() > 0) {
      await editClassificationBtn.click();
      await page.waitForTimeout(500);

      // Check Off-label inquiry checkbox
      const offLabelLabel = page.locator('label:has-text("Off-label inquiry")');
      const offLabelInput = offLabelLabel.locator('input[type="checkbox"]');
      if (!(await offLabelInput.isChecked())) {
        await offLabelInput.click();
        await page.waitForTimeout(800);
      }

      // Check Solicited checkbox
      const solicitedLabel = page.locator('label:has-text("Solicited")');
      const solicitedInput = solicitedLabel.locator('input[type="checkbox"]');
      if (!(await solicitedInput.isChecked())) {
        await solicitedInput.click();
        await page.waitForTimeout(800);
      }

      // Click Done
      const doneBtn = page.locator('.cf-mi-approval-block button:has-text("Done")');
      await doneBtn.click();
      await page.waitForTimeout(1000);
    }

    // Verify 21 CFR 312.7 Commercial Solicited Off-Label Gating Alert appears!
    console.log('Verifying Commercial Solicited Off-Label Gating Alert...');
    const gateAlert = page.locator('[data-testid="solicited-offlabel-gate-alert"]');
    await gateAlert.waitFor({ state: 'visible', timeout: 5000 });
    const isGateAlertVisible = await gateAlert.isVisible();
    console.log(`✅ Solicited Off-Label Gating Alert visible: ${isGateAlertVisible}`);
    if (!isGateAlertVisible) {
      throw new Error('Solicited Off-Label Gating Alert did not appear!');
    }
    const gateText = await gateAlert.innerText();
    console.log('Gate text:', gateText.replace(/\n+/g, ' '));

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '28_cf_drop3_solicited_offlabel_gated.png') });
    console.log('📸 Captured: 28_cf_drop3_solicited_offlabel_gated.png');

    // Medical Affairs Director grants clearance
    console.log('Granting Medical Affairs Director Promotional Clearance...');
    const grantClearanceBtn = page.locator('[data-testid="grant-clearance-btn"]');
    await grantClearanceBtn.click();
    await page.waitForTimeout(1200);

    // Verify Cleared banner appears!
    const clearedBanner = page.locator('[data-testid="solicited-offlabel-cleared-banner"]');
    await clearedBanner.waitFor({ state: 'visible', timeout: 5000 });
    const isClearedVisible = await clearedBanner.isVisible();
    console.log(`✅ Medical Director Clearance Banner visible: ${isClearedVisible}`);
    if (!isClearedVisible) {
      throw new Error('Medical Director Clearance Banner did not appear after granting approval!');
    }
    console.log('Cleared text:', (await clearedBanner.innerText()).replace(/\n+/g, ' '));

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '29_cf_drop3_solicited_offlabel_cleared.png') });
    console.log('📸 Captured: 29_cf_drop3_solicited_offlabel_cleared.png');

    // 3. Test CF-07: Patient Harm & 3-Day FDA FAR Clock Linkage (PC Form)
    console.log('\nStep 3: Navigating to PC Case 483149 (/mims/cases/483149)...');
    await page.goto('http://127.0.0.1:3000/mims/cases/483149', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Switch to Step 2 (Product & Details / PC tab)
    console.log('Switching to Step 2 to access PC General Tab...');
    const pcStep2Btn = page.locator('button[aria-label="Step 2: Product & Details"]');
    await pcStep2Btn.click();
    await page.waitForTimeout(1000);

    // Toggle "Potential or Actual Patient Harm Involved"
    console.log('Flagging Potential or Actual Patient Harm Involved...');
    const patientHarmLabel = page.locator('label:has-text("Potential or Actual Patient Harm Involved")');
    const patientHarmInput = patientHarmLabel.locator('input[type="checkbox"]');
    if (!(await patientHarmInput.isChecked())) {
      await patientHarmInput.click();
      await page.waitForTimeout(800);
    }

    // Verify Patient Harm / FAR Alert and 3-Day Clock Badge appear!
    const harmAlert = page.locator('[data-testid="pc-patient-harm-alert"]');
    await harmAlert.waitFor({ state: 'visible', timeout: 5000 });
    const isHarmAlertVisible = await harmAlert.isVisible();
    console.log(`✅ Patient Harm / FAR Mandate Alert visible: ${isHarmAlertVisible}`);
    if (!isHarmAlertVisible) {
      throw new Error('Patient Harm / FAR Alert did not render upon checking patient harm!');
    }

    const farClockBadge = page.locator('[data-testid="far-clock-badge"]');
    const isBadgeVisible = await farClockBadge.isVisible();
    console.log(`✅ 3-Day FAR Countdown Clock Badge visible: ${isBadgeVisible}`);
    if (!isBadgeVisible) {
      throw new Error('3-Day FAR Countdown Clock Badge did not render!');
    }
    console.log('Clock badge text:', await farClockBadge.innerText());

    // Save General Tab
    console.log('Saving PC General Tab with Patient Harm & FAR tracking...');
    const saveTabBtn = page.locator('button.cf-save-btn:has-text("Save general")');
    const savePromise = page.waitForResponse(res => res.url().includes('/cases/pc/versions/') && res.request().method() === 'PUT');
    await saveTabBtn.click();
    const saveRes = await savePromise;
    console.log(`✅ Save PC General API response status: ${saveRes.status()}`);
    if (saveRes.status() !== 200) {
      throw new Error(`Failed to save PC General tab! Status: ${saveRes.status()}`);
    }

    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '30_cf_drop3_patient_harm_far_clock.png') });
    console.log('📸 Captured: 30_cf_drop3_patient_harm_far_clock.png');

    // Verify DB persistence of FAR clock
    const [pcRows] = await db.query('SELECT is_patient_harm, is_far_reportable, far_due_date, far_status FROM case_pc_general WHERE version_id = 52');
    console.log('DB Record for PC Version 52:', pcRows[0]);
    if (!pcRows[0]?.is_patient_harm || !pcRows[0]?.is_far_reportable || !pcRows[0]?.far_due_date) {
      throw new Error('Database does not reflect patient harm or calculated FAR due date!');
    }
    console.log(`✅ FAR Due Date confirmed in DB: ${pcRows[0].far_due_date}`);

    console.log('\n--- VERIFICATION RESULT ---');
    console.log(`Total console errors: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.warn('Console errors encountered:', consoleErrors);
    }

    console.log('🎉 CASE FORM UPGRADE DROP 3 REAL BROWSER WALK PASSED WITH 100% SUCCESS!');
  } catch (err) {
    console.error('❌ Verification failed:', err);
    throw err;
  } finally {
    await browser.close();
  }
}

walkDrop3().catch((err) => {
  console.error(err);
  process.exit(1);
});
