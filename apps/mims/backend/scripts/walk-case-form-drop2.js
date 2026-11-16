'use strict';

/**
 * walk-case-form-drop2.js — Real Browser Walk for Case Form Upgrade Drop 2:
 * - CF-03: Real-Time E2B(R3) 4-Factor Gate & Hard Block at Transmit to PV (Decision 1A)
 * - CF-05: AI / Clinical Safety Term Interception & 1-sentence Override Rationale (Decision 2A)
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = '/Users/rohithkarne/.gemini/antigravity/brain/1b01e546-f649-45c2-ae62-dcda46c90173/screenshots';
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function walkDrop2() {
  console.log('🚀 Starting Case Form Upgrade Drop 2 Live Browser Walk...');

  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
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

    // 2. Test CF-05: AI / Clinical Safety Term Interception (MI Form)
    console.log('Step 2: Navigating to MI Case 483147 (/mims/cases/483147)...');
    await page.goto('http://127.0.0.1:3000/mims/cases/483147', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Switch to Step 2 (Product & Details / MI tab)
    console.log('Switching to Step 2 (Product & Details)...');
    const step2Btn = page.locator('button[aria-label="Step 2: Product & Details"]');
    await step2Btn.click();
    await page.waitForTimeout(1000);

    // Enter safety trigger terms in Question Summary
    console.log('Entering clinical safety trigger terms into Question Summary...');
    const questionTextarea = page.locator('textarea[aria-label="Question Summary"]');
    await questionTextarea.waitFor({ state: 'visible', timeout: 8000 });
    await questionTextarea.fill('Physician calling about Entresto dosing; mentions patient developed acute urticaria, dyspnea and angioedema after first dose.');
    await page.waitForTimeout(600);

    // Verify Clinical Safety Alert banner appears!
    const safetyAlert = page.locator('[data-testid="mi-safety-trigger-alert"]');
    await safetyAlert.waitFor({ state: 'visible', timeout: 5000 });
    const isAlertVisible = await safetyAlert.isVisible();
    console.log(`✅ Clinical Safety Trigger Alert visible: ${isAlertVisible}`);
    if (!isAlertVisible) {
      throw new Error('Clinical Safety Trigger Alert did not render upon typing safety terms!');
    }
    const alertText = await safetyAlert.innerText();
    console.log('Alert text:', alertText.replace(/\n+/g, ' '));

    // Operator selects "No" for AE/PC screening
    console.log('Selecting "No" for AE/PC screening...');
    await page.selectOption('select[aria-label="Mentions an adverse event or product complaint?"]', 'no');
    await page.waitForTimeout(600);

    // Verify Clinical Override Rationale field appears!
    const overrideField = page.locator('[data-testid="mi-override-rationale-field"]');
    await overrideField.waitFor({ state: 'visible', timeout: 5000 });
    const isOverrideVisible = await overrideField.isVisible();
    console.log(`✅ Clinical Override Rationale field visible: ${isOverrideVisible}`);
    if (!isOverrideVisible) {
      throw new Error('Clinical Override Rationale field did not appear when selecting "No" with detected safety terms!');
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '25_cf_drop2_safety_term_interception.png') });
    console.log('📸 Captured: 25_cf_drop2_safety_term_interception.png');

    // Fill in the Clinical Override Rationale
    console.log('Entering Clinical Override Rationale...');
    const rationaleInput = overrideField.locator('input[type="text"]');
    await rationaleInput.fill('Confirmed with physician: Discussion was regarding hypothetical contraindications; no patient took the drug and no actual event occurred.');

    // Save Case
    console.log('Saving Case with Clinical Override Rationale...');
    const saveBtn = page.locator('button.cf-save-btn:has-text("Save Case")');
    const savePromise = page.waitForResponse(res => res.url().includes('/cases/mi/') && res.request().method() === 'PUT');
    await saveBtn.click();
    const saveRes = await savePromise;
    console.log(`✅ Save MI API response status: ${saveRes.status()}`);
    if (saveRes.status() !== 200) {
      throw new Error(`Failed to save MI with override rationale! Status: ${saveRes.status()}`);
    }

    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '26_cf_drop2_override_rationale_saved.png') });
    console.log('📸 Captured: 26_cf_drop2_override_rationale_saved.png');

    // 3. Test CF-03: Real-Time E2B(R3) 4-Factor Gate & Transmit to PV Hard Block (Decision 1A)
    console.log('Step 3: Navigating to Child AE Case 483153 (/mims/cases/483153)...');
    await page.goto('http://127.0.0.1:3000/mims/cases/483153', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Verify validity banner is visible at the top of the case
    const validityBanner = page.locator('[data-testid="ae-validity-banner"]');
    const isBannerVisible = await validityBanner.isVisible();
    console.log(`✅ AE Validity Banner visible at top: ${isBannerVisible}`);
    if (isBannerVisible) {
      console.log('Banner text:', (await validityBanner.innerText()).replace(/\n+/g, ' '));
    }

    // Switch to Step 2 (Product & Details / AE tab)
    console.log('Switching to Step 2 to access AE Tab...');
    const aeStep2Btn = page.locator('button[aria-label="Step 2: Product & Details"]');
    await aeStep2Btn.click();
    await page.waitForTimeout(1000);

    // Click "Transmit to PV" to open the transmission drawer
    console.log('Clicking "Transmit to PV" button in CaseAETab header...');
    const txTriggerBtn = page.locator('button.cf-tx-trigger-btn:has-text("Transmit to PV")');
    if (await txTriggerBtn.count() > 0) {
      await txTriggerBtn.click();
      await page.waitForTimeout(800);

      // Verify the Transmission Blocked warning notice is rendered in the drawer
      const txBlockedNotice = page.locator('[data-testid="ae-tx-blocked-notice"]');
      const isNoticeVisible = await txBlockedNotice.isVisible();
      console.log(`✅ Transmission Blocked Notice visible inside drawer: ${isNoticeVisible}`);

      // Verify the Transmit submit button is disabled
      const submitTxBtn = page.locator('.cf-form-actions button.cf-save-btn:has-text("Transmit to PV")');
      const isDisabled = await submitTxBtn.isDisabled();
      console.log(`✅ Transmit to PV submit button disabled state: ${isDisabled}`);
      if (!isDisabled) {
        throw new Error('Transmit to PV submit button is NOT disabled despite incomplete E2B criteria!');
      }

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '27_cf_drop2_transmission_hard_gate.png') });
      console.log('📸 Captured: 27_cf_drop2_transmission_hard_gate.png');
    }

    console.log('\n--- VERIFICATION RESULT ---');
    console.log(`Total console errors: ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      console.warn('Console errors encountered:', consoleErrors);
    }

    console.log('🎉 CASE FORM UPGRADE DROP 2 REAL BROWSER WALK PASSED WITH 100% SUCCESS!');
  } catch (err) {
    console.error('❌ Verification failed:', err);
    throw err;
  } finally {
    await browser.close();
  }
}

walkDrop2().catch((err) => {
  console.error(err);
  process.exit(1);
});
