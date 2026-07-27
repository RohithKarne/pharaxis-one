const { test, expect } = require('@playwright/test')
const { requireSession, expectPageHealthy } = require('./_assertions')
const adminRouteMap = require('../frontend/src/shared/config/adminRouteMap.json')

const BACKEND = process.env.MIMS_BACKEND_URL || 'http://localhost:3000'
const APP_BASE = '/mims'

function appPath(path = '/') {
  const raw = String(path || '/')
  if (raw === '/') return `${APP_BASE}/`
  return `${APP_BASE}${raw.startsWith('/') ? raw : `/${raw}`}`
}

test.use({ baseURL: `http://localhost:5173${APP_BASE}` })

async function buildSession(request, loginData, token, email, fallbackRole, moduleHints = []) {
  let meData = null
  try {
    const meRes = await request.get(`${BACKEND}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 30000,
    })
    if (meRes.ok()) meData = await meRes.json()
  } catch (_) {
    // Keep going with login payload.
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
      const loginResponse = await request.post(`${BACKEND}/api/auth/login`, {
        data: candidate,
        timeout: 30000,
      })
      const initialData = await loginResponse.json()

      let loginData = initialData
      let token = loginData?.token
      const challengeToken = loginData?.challengeToken

      if (!token && challengeToken) {
        const skipRes = await request.post(`${BACKEND}/api/auth/2fa/skip-setup`, {
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

async function hydrateStorage(page, session, prefix, entryUrl) {
  await page.goto(entryUrl)
  await page.evaluate(({ auth, pfx }) => {
    localStorage.setItem(`${pfx}_token`, auth.token)
    localStorage.setItem(`${pfx}_user`, JSON.stringify(auth.user || {}))
    localStorage.setItem(`${pfx}_modules`, JSON.stringify(auth.modules || []))
    localStorage.setItem(`${pfx}_org_id`, String(auth.orgId ?? ''))
    localStorage.setItem(`${pfx}_site_id`, String(auth.siteId ?? ''))
    localStorage.setItem(`${pfx}_org_name`, auth.orgName || '')
    localStorage.setItem(`${pfx}_site_name`, auth.siteName || '')
    localStorage.setItem(`${pfx}_all_orgs`, JSON.stringify(auth.allOrgs || []))
    localStorage.setItem(`${pfx}_session_timeout`, String(auth.sessionTimeout || 30))
    localStorage.setItem('mims_sidebar_collapsed', 'false')
  }, { auth: session, pfx: prefix })
  await page.reload()
  await page.waitForLoadState('load')
}

async function expectBodyContainsOneOf(page, texts) {
  let matched = false

  for (const text of texts) {
    try {
      await expect(page.locator('body')).toContainText(text, { timeout: 30000 })
      matched = true
      break
    } catch (error) {
      // Try next fallback text.
    }
  }

  expect.soft(matched, `Expected body to contain one of: ${texts.join(' | ')}`).toBeTruthy()
}

async function clickIntegrationsInSidebar(page) {
  try {
    const integrationLink = page.getByRole('link', { name: /Integrations/i }).first()
    await integrationLink.click({ timeout: 5000 })
    return
  } catch (error) {
    // fall through
  }

  try {
    const integrationButton = page.getByRole('button', { name: /Integrations/i }).first()
    await integrationButton.click({ timeout: 5000 })
    return
  } catch (error) {
    // fall through
  }

  await page.getByText('Integrations', { exact: true }).first().click({ timeout: 10000 })
}

test.describe('Phase 3 — Integration Screens', () => {
  test.describe.configure({ timeout: 60000 })

  test.describe('Admin Console Integration Setup', () => {
    let adminSession = null
    let adminAuthError = ''

    test.beforeAll(async ({ request }) => {
      const { session, failures } = await resolveLoginSession(
        request,
        [
          { email: 'vanaja_admin@reviewco.com', password: 'Test@1234' },
          { email: 'vanaja_admin@reviewco.com', password: '__SET_SMOKE_TEST_PASSWORD__' },
        ],
        'admin',
        ['admin_console', 'mims_core']
      )
      adminSession = session
      adminAuthError = JSON.stringify(failures)
    })

    test.beforeEach(async ({ page }) => {
      requireSession(adminSession, adminAuthError, 'Integration Screens admin')

      await hydrateStorage(page, adminSession, 'mims', `http://localhost:5173${appPath('/')}`)
    })

    test('Integration Setup sidebar shows MIR Integration page', async ({ page }) => {
      await page.goto(appPath(adminRouteMap.adminEntryRoutes.mirIntegration))
      await page.waitForLoadState('load')

      const body = page.locator('body')
      await expect.soft(body).toContainText('MIR Integration')
      await expect.soft(body).toContainText('MIMS Admin')
    })

    test('MIR Integration screen loads without error', async ({ page }) => {
      await page.goto(appPath(adminRouteMap.adminEntryRoutes.mirIntegration))
      await page.waitForLoadState('load')

      await expect.soft(page.locator('body')).not.toContainText('Coming Soon')
      await expectBodyContainsOneOf(page, [
        'MIR Integration',
        'Contact us to activate',
        'MIR Endpoint'
      ])
    })

    test('CRM Integration screen loads without error', async ({ page }) => {
      await page.goto(appPath(adminRouteMap.adminEntryRoutes.crmIntegration))
      await page.waitForLoadState('load')

      await expect.soft(page.locator('body')).not.toContainText('Coming Soon')
      await expectBodyContainsOneOf(page, [
        'CRM Integration',
        'Contact us to activate',
        'CRM Type'
      ])
    })

    test('Content Integration screen loads without error', async ({ page }) => {
      await page.goto(appPath(adminRouteMap.adminEntryRoutes.contentIntegration))
      await page.waitForLoadState('load')

      await expect.soft(page.locator('body')).not.toContainText('Coming Soon')
      await expectBodyContainsOneOf(page, [
        'Content Integration',
        'Contact us to activate',
        'Vault URL'
      ])
    })

    test('EMIR Integration screen loads without error', async ({ page }) => {
      await page.goto(appPath(adminRouteMap.adminEntryRoutes.emirIntegration))
      await page.waitForLoadState('load')

      await expect.soft(page.locator('body')).not.toContainText('Coming Soon')
      await expectBodyContainsOneOf(page, [
        'EMIR Integration',
        'Contact us to activate',
        'Inbound Email'
      ])
    })

    test('Case Import screen loads with filter form', async ({ page }) => {
      await page.goto(appPath(adminRouteMap.adminEntryRoutes.caseImport))
      await page.waitForLoadState('load')

      await expect.soft(page.locator('body')).not.toContainText('Coming Soon')
      await expectBodyContainsOneOf(page, [
        'Case Import',
        'Contact us to activate',
        'Download Cases'
      ])
    })
  })

  test.describe('Platform Admin Integrations page', () => {
    let superSession = null
    let superAuthError = ''

    test.beforeAll(async ({ request }) => {
      const { session, failures } = await resolveLoginSession(
        request,
        [
          { email: 'platform_admin', password: '__SET_SMOKE_TEST_PASSWORD__' },
          { email: 'platform_admin', password: 'Test@1234' },
          { email: 'platform_admin@mims.io', password: '__SET_SMOKE_TEST_PASSWORD__' },
          { email: 'platform_admin@mims.io', password: 'Test@1234' },
        ],
        'platform_admin',
        ['platform_admin_console']
      )
      superSession = session
      superAuthError = JSON.stringify(failures)
    })

    test.beforeEach(async ({ page }) => {
      requireSession(superSession, superAuthError, 'Integration Screens platform admin')

      await hydrateStorage(page, superSession, 'mims', 'http://localhost:5173/mims-admin?standalone=1')
    })

    test('Platform Admin Integrations page loads with org table', async ({ page }) => {
      await clickIntegrationsInSidebar(page)
      await page.waitForLoadState('load')

      const body = page.locator('body')
      await expect.soft(body).toContainText('MIR Integration')
      await expect.soft(body).toContainText('CRM Integration')
      await expect.soft(body).toContainText('EMIR Integration')
      await expect.soft(body).toContainText('Case Import')
    })

    test('Platform Admin Integrations page shows organisation rows', async ({ page }) => {
      await clickIntegrationsInSidebar(page)
      await page.waitForLoadState('load')

      let hasNovartis = false
      try {
        await expect(page.locator('body')).toContainText('Novartis', { timeout: 30000 })
        hasNovartis = true
      } catch (error) {
        // fall back to checkbox row presence
      }

      const checkboxCount = await page.locator('input[type="checkbox"]').count()
      expect.soft(checkboxCount).toBeGreaterThan(0)

      if (!hasNovartis) {
        expect.soft(checkboxCount, 'Expected Novartis text or at least one checkbox row').toBeGreaterThan(0)
      }
    })
  })
})
