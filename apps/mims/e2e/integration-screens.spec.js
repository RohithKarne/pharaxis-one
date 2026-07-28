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

// The frontend origin must follow MIMS_BASE_URL. Hardcoding :5173 pinned this
// suite to the dev stack (dev database) whatever the runner was told, so the
// session cookie landed on the wrong origin and every page rendered the admin
// login screen instead of the integration screens.
const FRONTEND = process.env.MIMS_BASE_URL || 'http://localhost:5173'

test.use({ baseURL: `${FRONTEND}${APP_BASE}` })

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
  // Auth is restored from the httpOnly `mims_token` cookie, not localStorage
  // (F14 security hardening — see AuthContext.jsx). Without this the app is
  // unauthenticated no matter what localStorage says.
  await page.context().addCookies([{
    name: 'mims_token',
    value: session.token,
    domain: new URL(page.url()).hostname,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  }])
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
  // Navigate straight to the integrations group rather than driving the sidebar.
  //
  // There is no top-level "Integrations" item — the integrations sit in a group
  // called "Integrations & Platform" (sys-setup-grp-platform) nested inside
  // System, and walking that tree by label was both brittle and wrong: the old
  // exact-text match on "Integrations" could never hit anything. The six
  // admin-side tests in this same file already navigate by adminRouteMap URL,
  // so this is the established pattern here, not a shortcut.
  await page.goto(`${FRONTEND}${APP_BASE}/mims-admin?standalone=1&system=sys-setup-grp-platform`)
  await page.waitForLoadState('networkidle')
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

      await hydrateStorage(page, adminSession, 'mims', `${FRONTEND}${appPath('/')}`)
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

      // Vite serves the app under APP_BASE, so the standalone superadmin console
      // is /mims/mims-admin, not /mims-admin — the bare path returns Vite's
      // "did you mean" page and the sidebar the test clicks never exists.
      //
      // hydrateStorage navigates first and only then sets the cookie, so the
      // console had already rendered its login screen by the time it was
      // authenticated. The admin block above gets away with it because it
      // navigates again afterwards; this one used the target page as its entry
      // URL. Hydrate on the app root, then navigate to the console.
      await hydrateStorage(page, superSession, 'mims', `${FRONTEND}${appPath('/')}`)
      await page.goto(`${FRONTEND}${APP_BASE}/mims-admin?standalone=1`)
      await page.waitForLoadState('networkidle')
    })

    // These two tests used to open a "Platform Admin Integrations" overview and
    // assert MIR, CRM, EMIR and Case Import on one page with a table of
    // organisation rows. No such page exists. The sidebar group that would hold
    // it (System -> Setup -> Integrations & Platform) renders "Configuration for
    // Integrations & Platform is coming soon", and only the leaf items have
    // screens — so the old assertions could never pass, whatever the test did.
    //
    // What is worth covering here is that the PLATFORM ADMIN console can reach
    // those screens at all. That is separate from the Admin Console tests above,
    // which run as a different role against a different shell.
    //
    // Dropped deliberately: the organisation-row assertion. There is no org
    // table in this console to assert against, and a test that invents one is
    // worse than no test.
    const PLATFORM_INTEGRATION_SCREENS = [
      { item: 'sys-setup-int-mir',         expect: ['MIR Integration', 'MIR Endpoint', 'Contact us to activate'] },
      { item: 'sys-setup-int-crm',         expect: ['CRM Integration', 'CRM Type', 'Contact us to activate'] },
      { item: 'sys-setup-int-emir',        expect: ['EMIR Integration', 'Inbound Email', 'Contact us to activate'] },
      { item: 'sys-setup-int-case-import', expect: ['Case Import', 'Download Cases', 'Contact us to activate'] },
    ]

    for (const screen of PLATFORM_INTEGRATION_SCREENS) {
      test(`Platform Admin can open ${screen.item}`, async ({ page }) => {
        await page.goto(`${FRONTEND}${APP_BASE}/mims-admin?standalone=1&system=${screen.item}`)
        await page.waitForLoadState('networkidle')

        await expectPageHealthy(page, { label: `Platform Admin ${screen.item}` })

        const text = await page.locator('body').innerText()
        expect(
          screen.expect.some((needle) => text.includes(needle)),
          `Platform Admin ${screen.item} rendered none of: ${screen.expect.join(' | ')}`
        ).toBe(true)
      })
    }
  })
})
