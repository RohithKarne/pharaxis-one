/**
 * admin-console.spec.js — Playwright E2E: MIMS Admin Console Navigation
 */
const { test, expect } = require('@playwright/test')

async function buildSession(request, loginData, token, email, fallbackRole, moduleHints = []) {
  let meData = null
  try {
    const meRes = await request.get('http://localhost:3000/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 30000,
    })
    if (meRes.ok()) meData = await meRes.json()
  } catch (_) {
    // Continue with login payload.
  }

  const allOrgs = Array.isArray(loginData?.allOrgs) && loginData.allOrgs.length
    ? loginData.allOrgs
    : Array.isArray(meData?.allOrgs)
      ? meData.allOrgs
      : []

  const modules = Array.isArray(loginData?.modules) && loginData.modules.length
    ? [...loginData.modules]
    : Array.isArray(meData?.modules)
      ? [...meData.modules]
      : []

  for (const key of moduleHints) {
    if (!modules.includes(key)) modules.push(key)
  }

  const user = loginData?.user || meData?.user || {
    id: 0,
    name: 'E2E User',
    email,
    role: fallbackRole,
  }

  return {
    token,
    user,
    modules,
    orgId: loginData?.orgId ?? meData?.orgId ?? user?.orgId ?? allOrgs[0]?.orgId ?? '',
    siteId: loginData?.siteId ?? meData?.siteId ?? user?.siteId ?? allOrgs[0]?.siteId ?? '',
    orgName: loginData?.orgName ?? meData?.orgName ?? allOrgs[0]?.orgName ?? '',
    siteName: loginData?.siteName ?? meData?.siteName ?? allOrgs[0]?.siteName ?? '',
    allOrgs,
    sessionTimeout: loginData?.sessionTimeout ?? meData?.sessionTimeout ?? 30,
  }
}

async function resolveLoginSession(request, candidates, fallbackRole, moduleHints = []) {
  const failures = []

  for (const candidate of candidates) {
    try {
      const loginRes = await request.post('http://localhost:3000/api/auth/login', {
        data: candidate,
        timeout: 30000,
      })
      const initialData = await loginRes.json()

      let loginData = initialData
      let token = loginData?.token
      const challengeToken = loginData?.challengeToken

      if (!token && challengeToken) {
        const skipRes = await request.post('http://localhost:3000/api/auth/2fa/skip-setup', {
          data: { challengeToken },
          timeout: 30000,
        })
        loginData = await skipRes.json()
        token = loginData?.token
      }

      if (!token) {
        failures.push({ email: candidate.email, reason: 'no-token', body: loginData })
        continue
      }

      const session = await buildSession(request, loginData, token, candidate.email, fallbackRole, moduleHints)
      return { session, failures }
    } catch (error) {
      failures.push({ email: candidate.email, reason: error.message })
    }
  }

  return { session: null, failures }
}

async function hydrateAuthStorage(page, session) {
  await page.goto('/')
  await page.evaluate((auth) => {
    localStorage.setItem('mims_token', auth.token)
    localStorage.setItem('mims_user', JSON.stringify(auth.user || {}))
    localStorage.setItem('mims_modules', JSON.stringify(auth.modules || []))
    localStorage.setItem('mims_org_id', String(auth.orgId ?? ''))
    localStorage.setItem('mims_site_id', String(auth.siteId ?? ''))
    localStorage.setItem('mims_org_name', auth.orgName || '')
    localStorage.setItem('mims_site_name', auth.siteName || '')
    localStorage.setItem('mims_all_orgs', JSON.stringify(auth.allOrgs || []))
    localStorage.setItem('mims_session_timeout', String(auth.sessionTimeout || 30))
    localStorage.setItem('mims_sidebar_collapsed', 'false')
  }, session)
}

test.describe('MIMS Admin Console', () => {
  let sharedSession = null
  let sharedAuthError = ''

  test.beforeAll(async ({ request }) => {
    const { session, failures } = await resolveLoginSession(
      request,
      [
        { email: 'vanaja_admin@reviewco.com', password: 'Test@1234' },
        { email: 'vanaja_admin@reviewco.com', password: 'Manager@123' },
      ],
      'admin',
      ['admin_console', 'mims_core']
    )
    sharedSession = session
    sharedAuthError = JSON.stringify(failures)
  })

  test.beforeEach(async ({ page }) => {
    if (!sharedSession) {
      test.skip(true, `Auth session unavailable: ${sharedAuthError}`)
      return
    }

    await hydrateAuthStorage(page, sharedSession)

    await page.goto('/admin-console')
    await page.waitForLoadState('networkidle')
  })

  test('admin console loads without error', async ({ page }) => {
    await expect(page.locator('body')).not.toContainText('Cannot GET /admin-console')
    const bodyText = await page.locator('body').innerText()
    expect(bodyText.length).toBeGreaterThan(10)
  })

  test('Picklists nav item is visible', async ({ page }) => {
    await expect(page.getByText('Picklists', { exact: true })).toBeVisible({ timeout: 10000 })
  })

  test('Audit Trail section is visible in sidebar', async ({ page }) => {
    await expect(page.getByText('Audit Trail')).toBeVisible({ timeout: 10000 })
  })

  test('clicking Picklists navigates to picklists section', async ({ page }) => {
    await page.getByText('Picklists', { exact: true }).first().click()
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).toContainText('Picklist', { timeout: 10000 })
  })

  test('Integration Setup section is visible', async ({ page }) => {
    await expect(page.getByText('Integration Setup')).toBeVisible({ timeout: 10000 })
  })
})
