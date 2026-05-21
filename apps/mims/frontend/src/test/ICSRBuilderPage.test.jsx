import { describe, expect, test, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ICSRBuilderPage from '../modules/cases/pages/ICSRBuilderPage'

vi.mock('../shared/context/AuthContext', () => ({ useAuth: () => ({ token: 'test-token', user: { role: 'admin' } }) }))
vi.mock('../shared/components/MIMSLayout', () => ({ default: ({ children }) => <div>{children}</div> }))

beforeEach(() => {
  globalThis.fetch = vi.fn((url) => {
    if (String(url).endsWith('/xml')) return Promise.resolve(new Response('<xml />', { status: 200 }))
    return Promise.resolve(new Response(JSON.stringify({ report: { id: 1, case_id: 22, sender_safety_report_id: 'ORG1-2026-000001', receiver_id: 'FDA', status: 'draft' }, reactions: [], drugs: [], tests: [], history: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  })
})

describe('ICSRBuilderPage', () => {
  test('mounts builder with mock ICSR data', async () => {
    render(
      <MemoryRouter initialEntries={['/icsr/1']}>
        <Routes><Route path="/icsr/:id" element={<ICSRBuilderPage />} /></Routes>
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByText('ICSR Builder')).toBeInTheDocument())
    expect(screen.getAllByText(/ORG1-2026-000001/).length).toBeGreaterThan(0)
    expect(screen.getByText('Generate XML')).toBeInTheDocument()
  })
})
