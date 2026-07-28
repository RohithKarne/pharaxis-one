/**
 * inbox-saved-views.spec.js — E2E coverage for the Inbox Saved Views feature
 * (server-side, discoverable, auto-applying default, 5-view limit).
 *
 * Auth: consumes e2e/.savedviews-session.json produced by _savedviews-setup.js.
 * Run order: node --env-file=.env e2e/_savedviews-setup.js  →  this spec  →  teardown.
 */
const { test, expect } = require('@playwright/test')
const fs = require('fs')
const path = require('path')

const BACKEND = process.env.MIMS_BACKEND_URL || 'http://localhost:3000'
const APP_BASE = '/mims'
const SESSION_FILE = path.join(__dirname, '.savedviews-session.json')

let session = null
try { session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')) } catch (_) { /* skip below */ }

function authHeaders() {
  return { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' }
}

async function clearAllViews(request) {
  const res = await request.get(`${BACKEND}/api/admin/user-preferences/views?screen_key=inbox`, { headers: authHeaders() })
  if (!res.ok()) return
  const { views = [] } = await res.json()
  for (const v of views) {
    await request.delete(`${BACKEND}/api/admin/user-preferences/views/${v.id}`, { headers: authHeaders() })
  }
}

async function hydrate(page) {
  await page.goto(`${APP_BASE}/`)
  await page.evaluate((s) => {
    localStorage.setItem('mims_token', s.token)
    localStorage.setItem('mims_user', JSON.stringify(s.user || {}))
    localStorage.setItem('mims_modules', JSON.stringify(s.modules || []))
    localStorage.setItem('mims_org_id', String(s.orgId ?? ''))
    localStorage.setItem('mims_site_id', String(s.siteId ?? ''))
    localStorage.setItem('mims_org_name', s.orgName || '')
    localStorage.setItem('mims_site_name', s.siteName || '')
    localStorage.setItem('mims_all_orgs', JSON.stringify(s.allOrgs || []))
    localStorage.setItem('mims_session_timeout', String(s.sessionTimeout || 30))
    localStorage.setItem('mims_sidebar_collapsed', 'false')
  }, session)
}

async function gotoInbox(page) {
  await hydrate(page)
  await page.goto(`${APP_BASE}/inbox`)
  await page.waitForLoadState('networkidle')
}

test.describe('Inbox Saved Views', () => {
  test.beforeAll(() => {
    // Previously this skipped, and so all seven tests quietly reported nothing
    // for weeks — the only coverage this feature has, silently switched off by
    // a missing setup step. The corpus now runs _savedviews-setup.js ahead of
    // this spec, so an absent session means that setup failed and must be seen.
    if (!session) {
      throw new Error(
        '[E2E] No session file at e2e/.savedviews-session.json. It is produced by ' +
        'e2e/_savedviews-setup.js, which the suite command runs first — so this means ' +
        'setup failed (backend down, or the database it provisions into is not reachable). ' +
        'Reported as a failure, not a skip: a silent skip here is why this suite went ' +
        'unnoticed for weeks.'
      )
    }
  })

  test.beforeEach(async ({ request }) => {
    await clearAllViews(request)
  })

  test('AC-B1: Saved Views bar is discoverable (always visible, labeled)', async ({ page }) => {
    await gotoInbox(page)
    await expect(page.locator('.saved-views-bar')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.saved-views-label')).toContainText('Saved Views')
  })

  test('AC-B1b: Empty state hint shows when user has no views', async ({ page }) => {
    await gotoInbox(page)
    await expect(page.locator('.saved-views-empty')).toBeVisible({ timeout: 15000 })
  })

  test('AC-A2: Save button is disabled until a name is entered', async ({ page }) => {
    await gotoInbox(page)
    const saveBtn = page.locator('.saved-view-save-inline button')
    await expect(saveBtn).toBeDisabled()
    await page.locator('.saved-view-save-inline input.save-view-input').fill('Temp Name')
    await expect(saveBtn).toBeEnabled()
  })

  test('AC-Story1: Saving current filters creates a named view chip', async ({ page }) => {
    await gotoInbox(page)
    await page.locator('.inbox-search-bar input').fill('E2E_ALPHA')
    await page.locator('.saved-view-save-inline input.save-view-input').fill('Alpha View')
    await page.locator('.saved-view-save-inline button').click()
    await expect(page.locator('.saved-view-chip', { hasText: 'Alpha View' })).toBeVisible({ timeout: 10000 })
  })

  test('AC-C1+C2: Default view auto-applies its filters on reload', async ({ page }) => {
    await gotoInbox(page)
    // Save a view that carries a distinctive search term
    await page.locator('.inbox-search-bar input').fill('E2E_DEFAULT_TERM')
    await page.locator('.saved-view-save-inline input.save-view-input').fill('My Default')
    await page.locator('.saved-view-save-inline button').click()
    const chip = page.locator('.saved-view-chip', { hasText: 'My Default' })
    await expect(chip).toBeVisible({ timeout: 10000 })
    // Mark it as default via the star toggle
    await chip.locator('.chip-default').click()
    await expect(chip).toHaveClass(/is-default/, { timeout: 10000 })
    // Reload — the default must auto-apply, restoring the search term with zero clicks
    await gotoInbox(page)
    await expect(page.locator('.inbox-search-bar input')).toHaveValue('E2E_DEFAULT_TERM', { timeout: 15000 })
  })

  test('AC-Delete: Deleting a view removes its chip', async ({ page }) => {
    await gotoInbox(page)
    await page.locator('.saved-view-save-inline input.save-view-input').fill('To Delete')
    await page.locator('.saved-view-save-inline button').click()
    const chip = page.locator('.saved-view-chip', { hasText: 'To Delete' })
    await expect(chip).toBeVisible({ timeout: 10000 })
    await chip.locator('.chip-delete').click()
    await expect(chip).toHaveCount(0, { timeout: 10000 })
  })

  test('AC-A4: 6th view is blocked with a clear "limit of 5" message', async ({ page, request }) => {
    // Seed 5 views directly via the API
    for (let i = 1; i <= 5; i++) {
      await request.post(`${BACKEND}/api/admin/user-preferences/views`, {
        headers: authHeaders(),
        data: { screen_key: 'inbox', view_name: `Seed ${i}`, filter_json: { search: `s${i}` }, is_default: 0 },
      })
    }
    await gotoInbox(page)
    await expect(page.locator('.saved-view-chip')).toHaveCount(5, { timeout: 15000 })
    // Attempt a 6th via the UI
    await page.locator('.saved-view-save-inline input.save-view-input').fill('Sixth View')
    await page.locator('.saved-view-save-inline button').click()
    await expect(page.locator('.saved-views-notice')).toContainText('limit of 5', { timeout: 10000 })
  })
})
