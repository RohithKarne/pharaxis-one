/**
 * AdminConsoleTabs.test.jsx
 * Functional tests for Admin Console sidebar navigation.
 */

import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock useAuth to avoid context errors
vi.mock('../shared/context/AuthContext', () => ({
  useAuth: () => ({
    user: { name: 'Test Admin', email: 'admin@test.com', role: 'admin' },
    token: 'mock-token',
    orgName: 'Test Org',
    orgId: 1,
    siteName: 'Test Site',
    allOrgs: [{ orgId: 1, orgName: 'Test Org' }],
    switchOrg: vi.fn(),
    refreshOrgAccess: vi.fn(),
    logout: vi.fn(),
    hasModuleAccess: () => true,
    getInitials: () => 'TA',
    formatRole: (r) => r,
  }),
}))

// Mock fetch globally
beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({}),
    text: async () => '{}',
  })
})

import AdminConsolePage from '../modules/admin/pages/AdminConsolePage'

function renderPage(path = '/admin-console') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin-console/:section?" element={<AdminConsolePage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Admin Console — Sidebar Navigation', () => {
  it('renders key sidebar items', () => {
    renderPage()
    const expectedItems = ['Sites Setup', 'Service Log', 'System Activity']
    expectedItems.forEach(label => {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    })
  })

  it('shows coming soon panel by default', () => {
    renderPage()
    expect(screen.getByText('Coming Soon')).toBeInTheDocument()
    expect(screen.getByText(/under development/i)).toBeInTheDocument()
  })

  it('shows Service Log action as available', () => {
    renderPage('/admin-console')
    expect(screen.getByRole('button', { name: 'Service Log' })).toBeEnabled()
  })

  it('shows System Activity action as available', () => {
    renderPage('/admin-console')
    expect(screen.getByRole('button', { name: 'System Activity' })).toBeEnabled()
  })

  it('shows General section label in sidebar', () => {
    renderPage()
    expect(screen.getByText('General')).toBeInTheDocument()
  })
})
