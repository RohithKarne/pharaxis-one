import { useState } from 'react'
import { adminHeaders, useAdminAuth } from '../context/AdminAuthContext'

// CPPM-61 — who is working an item, for the enquiry list and the review queue.
//
// The same thing the Safety Queue shows (CPPM-6), written once for the lists that
// came after it: who holds the item, and Take / Release / Hand to… for the people
// who may use them. Anyone but a viewer can take a free item; the holder (or an
// admin, covering for someone away) can release it or hand it to a colleague.
// Holding an item is never needed to work it.
//
// A page gives each item a `base` URL (…/take, …/release and …/hand hang off it)
// and a `staffUrl` for the hand-over list, and reloads its own list in `onChanged`.

async function post(url, body) {
  try {
    const res = await fetch(url, { method: 'POST', headers: adminHeaders(), body: JSON.stringify(body || {}) })
    const d = await res.json().catch(() => ({}))
    return res.ok ? { message: d.message || 'Done.' } : { error: d.error || 'That did not work. Refresh and try again.' }
  } catch {
    return { error: 'Network error — please try again.' }
  }
}

export function OwnerCell({ item }) {
  if (!item.owner_id) return <span style={{ color: '#6B7280' }}>Nobody yet</span>
  return (
    <>
      {item.owned_by_me ? <strong>You</strong> : (item.owner_name || 'Unknown')}
      <div style={{ fontSize: 12, color: '#6B7280' }}>
        since {item.owner_since ? new Date(item.owner_since).toLocaleString() : '—'}
      </div>
    </>
  )
}

// `open` is whether the item can be held at all (an open enquiry, an item still in the queue).
export function OwnerButtons({ item, open = true, base, staffUrl, label, onChanged, onMessage }) {
  const { hasRole } = useAdminAuth()
  const canHold = !hasRole('viewer')
  const isLead  = hasRole('admin', 'superadmin')
  const [handing, setHanding] = useState(false)
  const [staff, setStaff]     = useState([])
  const [handTo, setHandTo]   = useState('')
  const [busy, setBusy]       = useState(false)
  const [handError, setHandError] = useState('')

  if (!canHold || !open) return null
  const mayMove = item.owned_by_me || isLead

  async function act(action) {
    const out = await post(`${base}/${action}`)
    // Reload either way: a refusal usually means someone else got there first,
    // and the list should show who.
    onChanged()
    onMessage(out.error ? { type: 'error', text: out.error } : { type: 'success', text: out.message })
    if (!out.error) window.dispatchEvent(new Event('cp:badges-changed'))
  }

  async function startHand() {
    setHanding(true); setHandTo(''); setHandError(''); setStaff([])
    try {
      const res = await fetch(staffUrl, { headers: adminHeaders() })
      if (!res.ok) { setHandError(`Could not load the list of people (error ${res.status}).`); return }
      const d = await res.json()
      setStaff(d.staff || [])
    } catch { setHandError('Network error — please try again.') }
  }

  async function submitHand() {
    if (!handTo) { setHandError('Choose who to hand this to.'); return }
    setBusy(true)
    const out = await post(`${base}/hand`, { to_admin_id: Number(handTo) })
    setBusy(false)
    onChanged()
    if (out.error) { setHandError(out.error); return }
    setHanding(false)
    onMessage({ type: 'success', text: out.message })
    window.dispatchEvent(new Event('cp:badges-changed'))
  }

  const stop = fn => e => { e.stopPropagation(); fn() }
  return (
    <>
      {!item.owner_id && (
        <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={stop(() => act('take'))}>Take</button>
      )}
      {item.owner_id && mayMove ? (
        <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={stop(() => act('release'))}>Release</button>
      ) : null}
      {mayMove && (
        <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={stop(startHand)}>Hand to…</button>
      )}

      {handing && (
        <div className="cp-modal-overlay" onClick={e => { e.stopPropagation(); if (!busy) setHanding(false) }}>
          <div className="cp-modal" onClick={e => e.stopPropagation()}>
            <div className="cp-modal-header">
              <span>Hand over · {label}</span>
              <button className="cp-modal-close" disabled={busy} onClick={() => setHanding(false)}>×</button>
            </div>
            <div className="cp-modal-body">
              <p style={{ marginTop: 0 }}>
                {item.owner_id
                  ? `${item.owned_by_me ? 'You hold' : `${item.owner_name || 'Someone'} holds`} this now.`
                  : 'Nobody holds this yet.'}{' '}
                Choose who should work on it. The hand-over is recorded in the audit trail.
              </p>
              <select value={handTo} onChange={e => setHandTo(e.target.value)} style={{ width: '100%' }}>
                <option value="">Choose a person…</option>
                {staff.filter(p => p.id !== item.owner_id).map(p => (
                  <option key={p.id} value={p.id}>{p.name} · {String(p.role).replace(/_/g, ' ')}</option>
                ))}
              </select>
              {handError && <div className="cp-error" style={{ marginTop: 8 }}>{handError}</div>}
            </div>
            <div className="cp-modal-footer" style={{ justifyContent: 'flex-end' }}>
              <button className="cp-btn cp-btn-outline" disabled={busy} onClick={() => setHanding(false)}>Cancel</button>
              <button className="cp-btn" disabled={busy || !handTo} onClick={submitHand}>
                {busy ? 'Handing over…' : 'Hand over'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
