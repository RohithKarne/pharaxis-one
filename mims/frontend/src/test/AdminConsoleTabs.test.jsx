/**
 * AdminConsoleTabs.test.jsx
 * Functional tests for Admin Console top tab navigation.
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock useAuth to avoid context errors
vi.mock('../shared/context/AuthContext', () => ({
  useAuth: () => ({
    user: { name: 'Test Admin', email: 'admin@test.com', role: 'admin' },
    token: 'mock-token',
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

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminConsolePage />
    </MemoryRouter>
  )
}

describe('Admin Console — Top Tab Navigation', () => {
  it('renders all 9 tabs', () => {
    renderPage()
    const expectedTabs = [
      'Service Log', 'System Activity', 'Service Dashboard',
      'Configuration', 'Escalation', 'Documents',
      'Tables', 'System', 'Help',
    ]
    expectedTabs.forEach(label => {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    })
  })

  it('defaults to Configuration tab', () => {
    renderPage()
    const configTab = screen.getByRole('button', { name: 'Configuration' })
    expect(configTab).toHaveClass('active')
  })

  it('shows skeleton for non-Configuration tabs', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Service Log' }))
    expect(screen.getByText('This section is under construction.')).toBeInTheDocument()
  })

  it('switches active tab highlight on click', () => {
    renderPage()
    const escalationTab = screen.getByRole('button', { name: 'Escalation' })
    fireEvent.click(escalationTab)
    expect(escalationTab).toHaveClass('active')
    expect(screen.getByRole('button', { name: 'Configuration' })).not.toHaveClass('active')
  })

  it('shows Configuration content when Configuration tab is active', () => {
    renderPage()
    // Configuration tab is default — admin nav section label should be present
    expect(screen.getByText('General')).toBeInTheDocument()
  })
})
