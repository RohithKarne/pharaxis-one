/**
 * _assertions.js — shared, real assertions for the MIMS E2E suite.
 *
 * Written to replace three patterns that made the old suite incapable of
 * failing (measured 2026-07-27: 41 of 54 tests skipped themselves, 11 passed):
 *
 *   1. `if (!visible) return`            — a missing element passed as success
 *   2. `await expect(...).catch(() => {})` — the assertion result was discarded
 *   3. `expect(bodyText.length).toBeGreaterThan(20)` — any 20 characters passed
 *
 * The rule here: a page that fails to load, fails to authenticate, or renders an
 * error is a FAILURE, never a skip. Skipping is reserved for genuinely optional
 * functionality that is absent by configuration, and it must be explicit.
 */
const { expect } = require('@playwright/test')

/** Error text that must never appear on a healthy page. */
const ERROR_SIGNATURES = [
  'Something went wrong',
  'Cannot GET',
  'Internal Server Error',
  'Unexpected Application Error',
  'TypeError:',
  'ReferenceError:',
  'Failed to fetch',
  '404 Not Found',
]

/**
 * Fail loudly when a login could not be established.
 *
 * The old suite called test.skip() here, which meant a total auth outage
 * produced a green run. Authentication breaking IS the regression we most need
 * to catch, so it must fail.
 */
function requireSession(session, failures, context = 'session') {
  if (session) return session
  const detail = typeof failures === 'string' ? failures : JSON.stringify(failures)
  throw new Error(
    `[E2E] Could not authenticate for ${context}. This is a failure, not a skip — ` +
    `every test in this group depends on it. Login attempts: ${detail}`
  )
}

/**
 * Fail loudly when required setup data could not be created.
 */
function requireFixture(value, description) {
  if (value !== null && value !== undefined && value !== '') return value
  throw new Error(
    `[E2E] Required test fixture missing: ${description}. The suite cannot verify ` +
    `this behaviour without it, so this is reported as a failure rather than a skip.`
  )
}

/**
 * Assert a page actually rendered the application, not an error or empty shell.
 *
 * Replaces the "body has more than 20 characters" check. Verifies:
 *   - no known error signature is present
 *   - the app shell mounted (React root has real children)
 *   - the page is not the login screen when a session was expected
 */
async function expectPageHealthy(page, { label, expectAuthenticated = true } = {}) {
  const where = label ? ` [${label}]` : ''

  const root = page.locator('#root, [data-app-root]').first()
  await expect(root, `${where} app root never mounted — the bundle failed to render`)
    .toBeVisible({ timeout: 10000 })

  const bodyText = await page.locator('body').innerText()

  for (const signature of ERROR_SIGNATURES) {
    expect(
      bodyText,
      `${where} page rendered an error containing "${signature}"`
    ).not.toContain(signature)
  }

  // An authenticated page that bounced to login means the session broke.
  if (expectAuthenticated) {
    const onLogin = /sign in|log in to your account/i.test(bodyText) &&
                    /password/i.test(bodyText)
    expect(onLogin, `${where} redirected to the login screen — session was rejected`)
      .toBe(false)
  }

  // Meaningful content, not the old 20-character floor. An app screen that
  // renders fewer than 3 distinct text nodes is effectively blank.
  const textNodes = bodyText.split('\n').map(s => s.trim()).filter(Boolean)
  expect(
    textNodes.length,
    `${where} rendered an effectively blank page (${textNodes.length} text lines)`
  ).toBeGreaterThanOrEqual(3)
}

/**
 * Assert a named navigation target exists AND navigating to it renders cleanly.
 *
 * The old version returned early when the nav item was missing, so a deleted
 * section reported success. Here a missing nav item fails.
 */
async function expectNavigatesCleanly(page, linkText, { label } = {}) {
  const navItem = page.getByText(linkText, { exact: true }).first()
  await expect(navItem, `[${label || linkText}] navigation item "${linkText}" is missing`)
    .toBeVisible({ timeout: 10000 })

  await navItem.click()
  await page.waitForLoadState('networkidle')
  await expectPageHealthy(page, { label: label || linkText })
}

module.exports = {
  ERROR_SIGNATURES,
  requireSession,
  requireFixture,
  expectPageHealthy,
  expectNavigatesCleanly,
}
