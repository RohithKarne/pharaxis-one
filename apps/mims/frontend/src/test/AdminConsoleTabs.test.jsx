import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

beforeEach(() => {
  global.fetch = vi.fn((url) => {
    if (String(url).includes('/api/auth/org-logo')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ logo_url: null }),
        text: async () => '{"logo_url":null}',
      })
    }

    return Promise.resolve({
      ok: true,
      json: async () => ({}),
      text: async () => '{}',
    })
  })
})

import AdminConsoleRouter from '../modules/admin/AdminConsoleRouter'

function renderRouter(path = '/admin-console') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin-console/*" element={<AdminConsoleRouter />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Admin Console navigation board', () => {
  it('opens the overview at /admin-console', async () => {
    renderRouter('/admin-console')

    expect(screen.getByRole('heading', { name: /admin overview and configurations of test org/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Picklists' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Service Log' })).toBeInTheDocument()
  })

  it('navigates from overview to a detail page', async () => {
    renderRouter('/admin-console')

    fireEvent.click(screen.getByRole('button', { name: 'Picklists' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Admin Console' })).toBeInTheDocument()
      expect(screen.getByText('Picklists')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: '+ Category' })).toBeInTheDocument()
  })

  it('keeps deep links working for detail routes', async () => {
    renderRouter('/admin-console/picklists')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Admin Console' })).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: '+ Category' })).toBeInTheDocument()
  })

  it('allows breadcrumb navigation back to admin overview', async () => {
    renderRouter('/admin-console/picklists')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Admin Console' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Admin Console' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /admin overview and configurations of test org/i })).toBeInTheDocument()
    })
  })

  it('uses the same breadcrumb stage on non-picklists detail routes', async () => {
    renderRouter('/admin-console/sites')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Admin Console' })).toBeInTheDocument()
    })
    expect(screen.getByText('Sites Setup')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /admin overview and configurations/i })).not.toBeInTheDocument()
  })

  it('marks unavailable sections as disabled in the launcher', () => {
    renderRouter('/admin-console')

    expect(screen.getByRole('button', { name: /analytics url/i })).toBeDisabled()
  })
})
