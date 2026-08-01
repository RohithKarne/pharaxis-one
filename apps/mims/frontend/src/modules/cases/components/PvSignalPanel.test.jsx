import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PvSignalPanel from './PvSignalPanel.jsx'

/**
 * MIMS-46 Option B — the "not yet statistically validated" label.
 *
 * This component is not currently mounted on any route, so QA cannot open it in
 * the browser to confirm the label renders. That is precisely why it is tested
 * here: the label is the deliverable of Option B, and an unmounted component is
 * not an excuse for unverified behaviour. Whoever mounts this panel later
 * inherits the guarantee.
 */

const SIGNAL_ROWS = [
  {
    id: 1,
    product_name: 'Cosentyx',
    reaction_term: 'Urticaria',
    prr: 7.333,
    ror: 20,
    is_statistically_validated: false,
  },
]

beforeEach(() => {
  global.fetch = vi.fn((url) => {
    if (String(url).includes('/pv/signals')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          rows: SIGNAL_ROWS,
          signal_detection_enabled: false,
          statistically_validated: false,
          notice: 'Automatic PRR/ROR signal detection is disabled.',
        }),
      })
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ rows: [] }) })
  })
})

describe('PvSignalPanel — Option B labelling', () => {
  it('shows the "not yet statistically validated" label', async () => {
    render(<PvSignalPanel headers={{}} />)
    expect(await screen.findByText(/Not yet statistically validated/i)).toBeInTheDocument()
  })

  it('explains that signal detection happens in the receiving safety system', async () => {
    render(<PvSignalPanel headers={{}} />)
    const notice = await screen.findByRole('status')
    expect(notice.textContent).toMatch(/no real background-reporting-rate comparator/i)
    expect(notice.textContent).toMatch(/receiving safety system/i)
  })

  it('disables the Run Signal Detection control', async () => {
    render(<PvSignalPanel headers={{}} />)
    const btn = await screen.findByRole('button', { name: /Run Signal Detection/i })
    expect(btn).toBeDisabled()
  })

  it('tags each historical row as not validated', async () => {
    render(<PvSignalPanel headers={{}} />)
    await waitFor(() => expect(screen.getByText('Cosentyx')).toBeInTheDocument())
    // A reviewer must not be able to read a stored row as a valid signal.
    expect(screen.getByText(/Not validated/i)).toBeInTheDocument()
  })
})
