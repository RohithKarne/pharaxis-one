/**
 * AI Agent — browser smoke suite.
 *
 * First browser coverage for this application: until 2026-07-28 it had none at
 * all, so a blank page or a crashing route would have reached a person before
 * a test noticed.
 *
 * These assert real things deliberately. The lesson from the MIMS suite is that
 * `expect(page).toBeDefined()` and "body has some text" pass whatever happens,
 * so a route that renders nothing still reports success.
 */
const { test, expect } = require('@playwright/test')

const ERROR_SIGNATURES = [
  'Cannot GET',
  'Something went wrong',
  'Internal Server Error',
  'Unexpected Application Error',
  'TypeError:',
  '404 Not Found',
]

/** A route must respond, mount the app, show no error, and render real content. */
async function expectRouteRenders(page, route) {
  const response = await page.goto(route, { waitUntil: 'networkidle' })
  if (response) {
    expect(response.status(), `${route} responded ${response.status()}`).toBeLessThan(500)
  }

  const root = page.locator('#root').first()
  await expect(root, `${route} — the app root never mounted`).toBeVisible({ timeout: 10000 })

  const body = await page.locator('body').innerText()
  for (const sig of ERROR_SIGNATURES) {
    expect(body, `${route} rendered an error containing "${sig}"`).not.toContain(sig)
  }

  const lines = body.split('\n').map((s) => s.trim()).filter(Boolean)
  expect(lines.length, `${route} rendered an effectively blank page`).toBeGreaterThanOrEqual(3)
}

test.describe('AI Agent smoke', () => {
  test('dashboard renders', async ({ page }) => {
    await expectRouteRenders(page, 'dashboard')
  })

  test('organisations page renders', async ({ page }) => {
    await expectRouteRenders(page, 'orgs')
  })

  test('usage page renders', async ({ page }) => {
    await expectRouteRenders(page, 'usage')
  })

  test('root redirects to dashboard', async ({ page }) => {
    await page.goto('')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('unknown route stays inside the app shell', async ({ page }) => {
    await page.goto('__does_not_exist__')
    await page.waitForLoadState('networkidle')
    // The router sends everything unmatched to the dashboard rather than
    // falling through to the server and producing "Cannot GET".
    const body = await page.locator('body').innerText()
    expect(body).not.toContain('Cannot GET')
    await expect(page).toHaveURL(/\/dashboard$/)
  })
})
