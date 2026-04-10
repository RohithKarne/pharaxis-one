const { test, expect } = require('@playwright/test')

test('SuperAdmin login page loads', async ({ page }) => {
  await page.goto('/superadmin')
  await expect(page.getByRole('heading', { name: 'SuperAdmin Console' })).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()
})

test('Org user login page loads', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await expect(page.getByLabel('Organization Slug')).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()
})

test('Wrong credentials shows error message', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Organization Slug').fill('novartis')
  await page.getByLabel('Email').fill('admin@novartis.local')
  await page.getByLabel('Password').fill('wrong-password')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByText('Invalid credentials')).toBeVisible()
})

test('Successful login redirects to vault', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Organization Slug').fill(process.env.SMOKE_ORG_SLUG || 'novartis')
  await page.getByLabel('Email').fill(process.env.SMOKE_ADMIN_EMAIL || 'admin@novartis.local')
  await page.getByLabel('Password').fill(process.env.SMOKE_ADMIN_PASSWORD || 'Admin@123')
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page).toHaveURL(/\/vault$/)
  await expect(page.getByRole('heading', { name: 'Vault Workspace' })).toBeVisible()
})
