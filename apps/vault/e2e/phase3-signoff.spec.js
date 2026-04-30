const { test, expect } = require('@playwright/test')

const ORG_SLUG = process.env.SMOKE_ORG_SLUG || 'novartis'
const REVIEWER_EMAIL = process.env.SMOKE_REVIEWER_EMAIL || 'reviewer@novartis.local'
const REVIEWER_PASSWORD = process.env.SMOKE_REVIEWER_PASSWORD || 'Reviewer@123'
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL || 'admin@novartis.local'
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || 'Admin@123'

async function login(page, { email, password }) {
  await page.goto('/')
  await page.getByLabel('Organization Slug').fill(ORG_SLUG)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
}

async function loginByApi(page, request, { email, password }) {
  const response = await request.post('/api/auth/login', {
    data: {
      orgSlug: ORG_SLUG,
      email,
      password
    }
  })
  expect(response.status()).toBe(200)
  const payload = await response.json()

  await page.goto('/')
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('vault_token', token)
    localStorage.setItem('vault_user', JSON.stringify(user))
  }, payload)
}

test('P3-UAT-05 My Tasks visibility for reviewer', async ({ page }) => {
  await login(page, { email: REVIEWER_EMAIL, password: REVIEWER_PASSWORD })
  await expect(page).toHaveURL(/\/vault$/)

  await page.goto('/vault/tasks')
  await expect(page.getByRole('heading', { name: 'My Workflow Tasks' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'pending', exact: true }).first()).toBeVisible()
  await expect(page.getByRole('cell', { name: 'ready', exact: true }).first()).toBeVisible()
})

test('P3-UAT-08 Signature flow completes from ready task', async ({ page }) => {
  await login(page, { email: REVIEWER_EMAIL, password: REVIEWER_PASSWORD })
  await expect(page).toHaveURL(/\/vault$/)

  await page.goto('/vault/tasks')
  await expect(page.getByRole('heading', { name: 'My Workflow Tasks' })).toBeVisible()

  const openTaskButton = page.getByRole('button', { name: 'Open Task' }).first()
  await expect(openTaskButton).toBeVisible()
  await openTaskButton.click()

  await expect(page.getByRole('heading', { name: /^Task #/ })).toBeVisible()
  await page.getByLabel('Re-enter Password').fill(REVIEWER_PASSWORD)
  await page.getByRole('button', { name: 'Confirm Signature' }).click()
  await expect(page.getByText('Task signed. Signature ID:')).toBeVisible()
})

test('P3-UAT-10 Escalation visible in admin queue', async ({ page, request }) => {
  await loginByApi(page, request, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD })

  await page.goto('/vault/')
  await expect(page.getByRole('heading', { name: 'Vault Workspace' })).toBeVisible()
  await page.getByRole('link', { name: 'Admin Queue' }).first().click()
  await expect(page.getByRole('heading', { name: 'Workflow Queue' })).toBeVisible()
  await expect(page.getByText('Escalated').first()).toBeVisible()
  await expect(page.getByRole('cell', { name: /Owner:/ }).first()).toBeVisible()
})
