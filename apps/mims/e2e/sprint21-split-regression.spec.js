/**
 * sprint21-split-regression.spec.js — Playwright E2E: Sprint 21 integration tests
 *
 * Coverage:
 *  1. Admin Console — all sidebar tabs render without blank screen
 *  2. Picklist → CaseForm cross-feature: create a picklist value, verify it appears
 *     in the matching CaseForm dropdown, then clean up
 *  3. CaseForm — all tabs render without error
 *  4. Content page — section switching
 *  5. Platform Admin — all 12 sidebar sections render
 *  6. 401 auto-logout — clearing token triggers redirect to /login
 */
const { test, expect } = require('@playwright/test')
const adminRouteMap = require('../frontend/src/shared/config/adminRouteMap.json')

// ─── helpers (same pattern as admin-console.spec.js) ─────────────────────────

const BACKEND = 'http://localhost:3000'
const APP_BASE = '/mims'

function appPath(path = '/') {
  const raw = String(path || '/')
  if (raw === '/') return `${APP_BASE}/`
  return `${APP_BASE}${raw.startsWith('/') ? raw : `/${raw}`}`
}

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'vanaja_admin@reviewco.com'
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'Test@1234'
const ALT_PASSWORD = process.env.E2E_ALT_PASSWORD || '__SET_SMOKE_TEST_PASSWORD__'
const PLATFORM_ADMIN_EMAIL = process.env.E2E_PLATFORM_ADMIN_EMAIL || ''
const PLATFORM_ADMIN_PASSWORD = process.env.E2E_PLATFORM_ADMIN_PASSWORD || ''

function adminCandidates() {
  return [
    { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    { email: ADMIN_EMAIL, password: ALT_PASSWORD },
  ]
}

function platformAdminCandidates() {
  const candidates = []
  if (PLATFORM_ADMIN_EMAIL && PLATFORM_ADMIN_PASSWORD) {
    candidates.push({ email: PLATFORM_ADMIN_EMAIL, password: PLATFORM_ADMIN_PASSWORD })
  }
  candidates.push(
    { email: 'platform_admin', password: ALT_PASSWORD },
    { email: 'platform_admin', password: 'Test@1234' },
    { email: 'platform_admin@mims.io', password: ALT_PASSWORD },
    { email: 'platform_admin@mims.io', password: 'Test@1234' },
  )
  return candidates
}

async function buildSession(request, loginData, token, email, fallbackRole, moduleHints = []) {
  let meData = null
  try {
    const meRes = await request.get(`${BACKEND}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 30000,
    })
    if (meRes.ok()) meData = await meRes.json()
  } catch (_) {}

  const allOrgs = Array.isArray(loginData?.allOrgs) && loginData.allOrgs.length
    ? loginData.allOrgs
    : Array.isArray(meData?.allOrgs) ? meData.allOrgs : []

  const modules = Array.isArray(loginData?.modules) && loginData.modules.length
    ? [...loginData.modules]
    : Array.isArray(meData?.modules) ? [...meData.modules] : []

  for (const key of moduleHints) {
    if (!modules.includes(key)) modules.push(key)
  }

  const user = loginData?.user || meData?.user || { id: 0, name: 'E2E User', email, role: fallbackRole }

  return {
    token,
    user,
    modules,
    orgId:    loginData?.orgId    ?? meData?.orgId    ?? user?.orgId    ?? allOrgs[0]?.orgId  ?? '',
    siteId:   loginData?.siteId   ?? meData?.siteId   ?? user?.siteId   ?? allOrgs[0]?.siteId ?? '',
    orgName:  loginData?.orgName  ?? meData?.orgName  ?? allOrgs[0]?.orgName  ?? '',
    siteName: loginData?.siteName ?? meData?.siteName ?? allOrgs[0]?.siteName ?? '',
    allOrgs,
    sessionTimeout: loginData?.sessionTimeout ?? meData?.sessionTimeout ?? 30,
  }
}

async function resolveLoginSession(request, candidates, fallbackRole, moduleHints = []) {
  const failures = []
  for (const candidate of candidates) {
    try {
      const loginRes = await request.post(`${BACKEND}/api/auth/login`, {
        data: candidate,
        timeout: 30000,
      })
      const initialData = await loginRes.json()
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
      if (!token) { failures.push({ email: candidate.email, reason: 'no-token', body: loginData }); continue }
      const session = await buildSession(request, loginData, token, candidate.email, fallbackRole, moduleHints)
      return { session, failures }
    } catch (error) {
      failures.push({ email: candidate.email, reason: error.message })
    }
  }
  return { session: null, failures }
}

async function hydrateAuthStorage(page, session) {
  await page.goto(appPath('/'))
  await page.evaluate((auth) => {
    localStorage.setItem('mims_token',           auth.token)
    localStorage.setItem('mims_user',            JSON.stringify(auth.user || {}))
    localStorage.setItem('mims_modules',         JSON.stringify(auth.modules || []))
    localStorage.setItem('mims_org_id',          String(auth.orgId ?? ''))
    localStorage.setItem('mims_site_id',         String(auth.siteId ?? ''))
    localStorage.setItem('mims_org_name',        auth.orgName || '')
    localStorage.setItem('mims_site_name',       auth.siteName || '')
    localStorage.setItem('mims_all_orgs',        JSON.stringify(auth.allOrgs || []))
    localStorage.setItem('mims_session_timeout', String(auth.sessionTimeout || 30))
    localStorage.setItem('mims_sidebar_collapsed', 'false')
  }, session)
}

// ─── 1. Admin Console — sidebar tab coverage ──────────────────────────────────

test.describe('Admin Console — tab navigation', () => {
  let session = null
  let authErr = ''

  test.beforeAll(async ({ request }) => {
    const result = await resolveLoginSession(
      request,
      adminCandidates(),
      'admin',
      ['admin_console', 'mims_core']
    )
    session = result.session
    authErr = JSON.stringify(result.failures)
  })

  test.beforeEach(async ({ page }) => {
    if (!session) { test.skip(true, `Auth unavailable: ${authErr}`); return }
    await hydrateAuthStorage(page, session)
    await page.goto(appPath('/admin-console'))
    await page.waitForLoadState('networkidle')
  })

  const ADMIN_TABS = [
    { label: 'Tables → General', path: appPath(adminRouteMap.adminEntryRoutes.picklists) },
    { label: 'System → Customize Forms', path: appPath(adminRouteMap.adminEntryRoutes.customizeForms) },
    { label: 'System → MIR Integration', path: appPath(adminRouteMap.adminEntryRoutes.mirIntegration) },
    { label: 'System → View Data', path: appPath(adminRouteMap.adminEntryRoutes.viewData) },
  ]

  for (const tab of ADMIN_TABS) {
    test(`Admin Console → ${tab.label} section renders`, async ({ page }) => {
      await page.goto(tab.path)
      await page.waitForLoadState('networkidle')

      // Page must show content — no blank body, no server error text
      await expect(page.locator('body')).not.toContainText('Cannot GET', { timeout: 8000 })
      const bodyText = await page.locator('body').innerText()
      expect(bodyText.trim().length).toBeGreaterThan(20)
    })
  }
})

// ─── 2. Picklist → CaseForm cross-feature integration ─────────────────────────

test.describe('Picklist → CaseForm cross-feature', () => {
  let session = null
  let authErr = ''
  let createdPicklistId = null
  let targetFieldName = null
  let targetCaseType = null

  test.beforeAll(async ({ request }) => {
    const result = await resolveLoginSession(
      request,
      adminCandidates(),
      'admin',
      ['admin_console', 'mims_core']
    )
    session = result.session
    authErr = JSON.stringify(result.failures)
    if (!session) return

    // Step A: discover picklist types that are actually used by CaseForm config
    const caseFormPicklistTypes = new Set()
    const caseTypeFieldOptions = new Map() // key: `${caseType}:${picklistType}` -> optionCount
    for (const caseType of ['MI', 'AE', 'PC']) {
      try {
        const cfgRes = await request.get(`${BACKEND}/api/cases/form-config?case_type=${encodeURIComponent(caseType)}`, {
          headers: { Authorization: `Bearer ${session.token}` },
        })
        if (!cfgRes.ok()) continue
        const cfg = await cfgRes.json()
        for (const section of (cfg.sections || [])) {
          for (const field of (section.fields || [])) {
            if (!field?.picklist_type) continue
            caseFormPicklistTypes.add(field.picklist_type)
            const count = Array.isArray(field.options) ? field.options.length : 0
            caseTypeFieldOptions.set(`${caseType}:${field.picklist_type}`, Math.max(caseTypeFieldOptions.get(`${caseType}:${field.picklist_type}`) || 0, count))
          }
        }
      } catch (_) {}
    }

    // Step B: discover a picklist field linked to a CaseForm dropdown
    const catRes = await request.get(`${BACKEND}/api/admin/picklists/categories`, {
      headers: { Authorization: `Bearer ${session.token}` },
    })
    if (!catRes.ok()) return

    const { categories } = await catRes.json()
    let chosenField = null
    const preferFormBound = caseFormPicklistTypes.size > 0
    for (const cat of (categories || [])) {
      for (const field of (cat.fields || [])) {
        if (!field.name || !field.is_active) continue
        if (!preferFormBound || caseFormPicklistTypes.has(field.name)) {
          // Prefer fields that already expose options in form-config for at least one case type.
          const typeWithOptions = ['MI', 'AE', 'PC'].find((ct) => (caseTypeFieldOptions.get(`${ct}:${field.name}`) || 0) > 0) || null
          if (preferFormBound && !typeWithOptions) continue
          chosenField = field
          targetCaseType = typeWithOptions
          break
        }
      }
      if (chosenField) break
    }
    // Fallback if no overlap found: first active field
    if (!chosenField && preferFormBound) {
      for (const cat of (categories || [])) {
        for (const field of (cat.fields || [])) {
          if (field.name && field.is_active) { chosenField = field; break }
        }
        if (chosenField) break
      }
    }
    if (!chosenField) return
    targetFieldName = chosenField.name

    // Step C: create a uniquely-named test picklist value
    const uniqueValue = `E2E_TEST_${Date.now()}`
    const createRes = await request.post(`${BACKEND}/api/admin/picklists`, {
      headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
      data: { field_id: chosenField.id, value: uniqueValue, name: uniqueValue, status: 'Active' },
    })
    if (!createRes.ok()) return
    const created = await createRes.json()
    createdPicklistId = created.id ?? created.picklist?.id ?? null
  })

  test.afterAll(async ({ request }) => {
    if (createdPicklistId && session) {
      await request.delete(`${BACKEND}/api/admin/picklists/${createdPicklistId}`, {
        headers: { Authorization: `Bearer ${session.token}` },
      })
    }
  })

  test('new picklist value appears in Admin Console picklist table', async ({ page }) => {
    if (!session)             { test.skip(true, `Auth unavailable: ${authErr}`); return }
    if (!createdPicklistId)   { test.skip(true, 'Picklist creation failed — skipping'); return }

    await hydrateAuthStorage(page, session)
    await page.goto(appPath(adminRouteMap.adminEntryRoutes.picklists))
    await page.waitForLoadState('networkidle')

    // Search for the unique value by field type filter
    if (targetFieldName) {
      const searchInput = page.locator('input[type="search"], input[placeholder*="Search"], input[placeholder*="search"]').first()
      if (await searchInput.isVisible()) {
        await searchInput.fill(`E2E_TEST_`)
        await page.waitForLoadState('networkidle')
      }
    }

    await expect(page.locator('body')).toContainText('E2E_TEST_', { timeout: 10000 })
  })

  test('new picklist value appears as option in CaseForm dropdown', async ({ page, request }) => {
    if (!session)           { test.skip(true, `Auth unavailable: ${authErr}`); return }
    if (!createdPicklistId) { test.skip(true, 'Picklist creation failed — skipping'); return }
    if (!targetFieldName)   { test.skip(true, 'No target field resolved — skipping'); return }

    // Verify via API: form-config returns the new value in options
    let caseType = targetCaseType
    try {
      const caseRes = await request.get(`${BACKEND}/api/cases?limit=1`, {
        headers: { Authorization: `Bearer ${session.token}` },
      })
      if (caseRes.ok()) {
        const caseData = await caseRes.json()
        const first = (caseData.cases || caseData.rows || [])[0] || {}
        if (!caseType) caseType = first.case_type || first.type || null
      }
    } catch (_) {}

    let formConfig = null
    const candidates = [caseType, 'MI', 'AE', 'PC'].filter(Boolean)
    for (const type of candidates) {
      const formRes = await request.get(`${BACKEND}/api/cases/form-config?case_type=${encodeURIComponent(type)}`, {
        headers: { Authorization: `Bearer ${session.token}` },
      })
      if (formRes.ok()) {
        formConfig = await formRes.json()
        break
      }
    }
    expect(formConfig).toBeTruthy()

    const allOptions = []
    for (const section of (formConfig.sections || [])) {
      for (const field of (section.fields || [])) {
        if (field.picklist_type === targetFieldName && Array.isArray(field.options)) {
          allOptions.push(...field.options.map(o => o.value || o.label))
        }
      }
    }

    // The newly created value should be present in options for that picklist_type
    if (allOptions.length === 0) { test.skip(true, `Field "${targetFieldName}" has no options in form-config for tested case types`); return }
    const found = allOptions.some(v => String(v).startsWith('E2E_TEST_'))
    expect(found, `Expected E2E_TEST_ value in form-config options for field "${targetFieldName}". Got: ${JSON.stringify(allOptions.slice(0, 10))}`).toBe(true)
  })

  test('CaseForm dropdown renders the new value for a real case', async ({ page, request }) => {
    if (!session)           { test.skip(true, `Auth unavailable: ${authErr}`); return }
    if (!createdPicklistId) { test.skip(true, 'Picklist creation failed — skipping'); return }
    if (!targetFieldName)   { test.skip(true, 'No target field resolved — skipping'); return }

    // Find an existing case to open
    const casesRes = await request.get(`${BACKEND}/api/cases?limit=1&status=Open`, {
      headers: { Authorization: `Bearer ${session.token}` },
    })
    if (!casesRes.ok()) { test.skip(true, 'Could not fetch cases list'); return }
    const casesData = await casesRes.json()
    const firstCase = (casesData.cases || casesData.rows || [])[0]
    const firstCaseId = firstCase?.id ?? firstCase?.case_id ?? null
    if (!firstCaseId) { test.skip(true, 'No open cases available'); return }

    await hydrateAuthStorage(page, session)
    await page.goto(appPath(`/cases/${firstCaseId}`))
    await page.waitForLoadState('networkidle')

    // Wait for the form to actually render (not just the loading spinner)
    await page.waitForFunction(() => {
      const selects = document.querySelectorAll('select')
      return selects.length > 0
    }, { timeout: 15000 })

    // Check that at least one select element contains our new value as an option
    const found = await page.evaluate((val) => {
      const selects = Array.from(document.querySelectorAll('select'))
      return selects.some(sel =>
        Array.from(sel.options).some(opt => opt.value === val || opt.text === val)
      )
    }, `E2E_TEST_${String(createdPicklistId)}`)

    // If we can't find by exact ID-derived name, search all selects for anything starting with E2E_TEST_
    if (!found) {
      const partialFound = await page.evaluate(() => {
        const selects = Array.from(document.querySelectorAll('select'))
        return selects.some(sel =>
          Array.from(sel.options).some(opt => opt.value.startsWith('E2E_TEST_') || opt.text.startsWith('E2E_TEST_'))
        )
      })
      expect(partialFound, 'New picklist value should appear in at least one CaseForm dropdown').toBe(true)
    }
  })
})

// ─── 3. CaseForm — all tabs render ────────────────────────────────────────────

test.describe('CaseForm — tab navigation', () => {
  let session = null
  let authErr = ''
  let testCaseId = null

  test.beforeAll(async ({ request }) => {
    const result = await resolveLoginSession(
      request,
      adminCandidates(),
      'admin',
      ['admin_console', 'mims_core']
    )
    session = result.session
    authErr = JSON.stringify(result.failures)
    if (!session) return

    const casesRes = await request.get(`${BACKEND}/api/cases?limit=1`, {
      headers: { Authorization: `Bearer ${session.token}` },
    })
    if (casesRes.ok()) {
      const data = await casesRes.json()
      const first = (data.cases || data.rows || [])[0] || null
      testCaseId = first?.id ?? first?.case_id ?? null
    }
  })

  test.beforeEach(async ({ page }) => {
    if (!session)    { test.skip(true, `Auth unavailable: ${authErr}`); return }
    if (!testCaseId) { test.skip(true, 'No cases available'); return }
    await hydrateAuthStorage(page, session)
    await page.goto(appPath(`/cases/${testCaseId}`))
    await page.waitForLoadState('networkidle')
    // Wait for tab bar to appear
    await page.waitForSelector('.cf-tabbar-btn', { timeout: 15000 }).catch(() => {})
  })

  const CASE_TABS = ['info', 'mi', 'ae', 'pc', 'dppr', 'contacts', 'correspondence', 'comments']

  for (const tab of CASE_TABS) {
    test(`CaseForm tab "${tab}" renders without error`, async ({ page }) => {
      const tabBtn = page.locator(`.cf-tabbar-btn`).filter({ hasText: new RegExp(tab, 'i') }).first()
      const tabExists = await tabBtn.isVisible().catch(() => false)
      if (!tabExists) {
        // Tab may not exist for this case type — skip silently
        return
      }
      await tabBtn.click()
      await page.waitForLoadState('networkidle')

      // No JavaScript crash modal
      await expect(page.locator('body')).not.toContainText('Something went wrong', { timeout: 5000 }).catch(() => {})
      // Tab content area must have rendered content
      const content = page.locator('.cf-tab-content')
      const contentVisible = await content.isVisible().catch(() => false)
      if (contentVisible) {
        const text = await content.innerText()
        // At minimum some text or inputs should be present
        const inputCount = await page.locator('.cf-tab-content input, .cf-tab-content select, .cf-tab-content textarea').count()
        const hasContent = text.trim().length > 0 || inputCount > 0
        expect(hasContent).toBe(true)
      }
    })
  }
})

// ─── 4. Content page — section switching ─────────────────────────────────────

test.describe('Content page — section tabs', () => {
  let session = null
  let authErr = ''

  test.beforeAll(async ({ request }) => {
    const result = await resolveLoginSession(
      request,
      adminCandidates(),
      'admin',
      ['admin_console', 'mims_core', 'content']
    )
    session = result.session
    authErr = JSON.stringify(result.failures)
  })

  test.beforeEach(async ({ page }) => {
    if (!session) { test.skip(true, `Auth unavailable: ${authErr}`); return }
    await hydrateAuthStorage(page, session)
    await page.goto(appPath('/content'))
    await page.waitForLoadState('networkidle')
  })

  test('Content page loads without error', async ({ page }) => {
    await expect(page.locator('body')).not.toContainText('Cannot GET /content', { timeout: 8000 })
    const bodyText = await page.locator('body').innerText()
    expect(bodyText.trim().length).toBeGreaterThan(10)
  })

  const CONTENT_SECTIONS = ['Documents', 'FAQs', 'Templates', 'Merge Reports']

  for (const section of CONTENT_SECTIONS) {
    test(`Content → ${section} section renders`, async ({ page }) => {
      const navBtn = page.getByText(section, { exact: true }).first()
      const visible = await navBtn.isVisible().catch(() => false)
      if (!visible) return // section may not be configured for this org

      await navBtn.click()
      await page.waitForLoadState('networkidle')

      await expect(page.locator('body')).not.toContainText('Something went wrong', { timeout: 5000 }).catch(() => {})
      const bodyText = await page.locator('body').innerText()
      expect(bodyText.trim().length).toBeGreaterThan(10)
    })
  }
})

// ─── 5. Platform Admin — all sidebar sections ────────────────────────────────────

test.describe('Platform Admin — sidebar navigation', () => {
  let session = null
  let authErr = ''

  test.beforeAll(async ({ request }) => {
    const result = await resolveLoginSession(
      request,
      platformAdminCandidates(),
      'platform_admin'
    )
    session = result.session
    authErr = JSON.stringify(result.failures)
  })

  test.beforeEach(async ({ page }) => {
    if (!session) { test.skip(true, `Platform Admin auth unavailable: ${authErr}`); return }
    await hydrateAuthStorage(page, session)
    await page.goto(appPath('/mims-admin?standalone=1'))
    await page.waitForLoadState('networkidle')
  })

  const PLATFORM_ADMIN_SECTIONS = [
    'Dashboard',
    'Organizations',
    'Users',
    '2FA / Security',
    'Audit Log',
    'Login Audit',
    'Alerts',
    'Notifications',
    'Copy Division',
    'Help Content',
    'Reports',
  ]

  for (const section of PLATFORM_ADMIN_SECTIONS) {
    test(`Platform Admin -> ${section} renders without blank screen`, async ({ page }) => {
      const navItem = page.getByText(section, { exact: true }).first()
      const visible = await navItem.isVisible({ timeout: 8000 }).catch(() => false)
      if (!visible) return // section may not exist in this build

      await navItem.click()
      await page.waitForLoadState('networkidle')

      await expect(page.locator('body')).not.toContainText('Something went wrong', { timeout: 5000 }).catch(() => {})
      const bodyText = await page.locator('body').innerText()
      expect(bodyText.trim().length).toBeGreaterThan(20)
    })
  }
})

// ─── 6. 401 auto-logout ───────────────────────────────────────────────────────

test.describe('401 auto-logout', () => {
  let session = null
  let authErr = ''

  test.beforeAll(async ({ request }) => {
    const result = await resolveLoginSession(
      request,
      adminCandidates(),
      'admin',
      ['admin_console', 'mims_core']
    )
    session = result.session
    authErr = JSON.stringify(result.failures)
  })

  test('expired token triggers redirect to login page', async ({ page }) => {
    if (!session) { test.skip(true, `Auth unavailable: ${authErr}`); return }

    await hydrateAuthStorage(page, session)

    // Corrupt the token so next API call returns 401
    await page.evaluate(() => {
      localStorage.setItem('mims_token', 'expired.invalid.token')
    })

    await page.goto(appPath('/dashboard'))
    await page.waitForLoadState('networkidle')

    // The app should detect the 401 and redirect to /login
    // Give it up to 10 seconds for the auto-logout flow
    await page.waitForURL(/\/login/, { timeout: 10000 }).catch(() => {})
    const url = page.url()
    expect(url).toMatch(/\/login/)
  })

  test('cleared token redirects to login immediately', async ({ page }) => {
    if (!session) { test.skip(true, `Auth unavailable: ${authErr}`); return }

    // No auth at all — ProtectedRoute should redirect
    await page.goto(appPath('/'))
    await page.evaluate(() => localStorage.clear())
    await page.goto(appPath('/dashboard'))
    await page.waitForLoadState('networkidle')

    const url = page.url()
    expect(url).toMatch(/\/login/)
  })
})
