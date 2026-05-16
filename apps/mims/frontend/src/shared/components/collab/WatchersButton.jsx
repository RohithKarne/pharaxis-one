/**
 * WatchersButton — Theme 5 (Wave 4) watcher list popover + add/remove self.
 *
 * Props:
 *   caseId — required
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useFeatureFlag } from '../../context/FeatureFlagsContext'
import { httpFetch } from '../../api/httpFetch.js'

export default function WatchersButton({ caseId }) {
  const { token, user } = useAuth()
  const enabled = useFeatureFlag('cf.theme5_realtime_collab')
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(false)
  const popRef = useRef(null)

  const load = useCallback(async () => {
    const r = await httpFetch(`/api/cases/${caseId}/watchers`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const d = await r.json()
    setItems(d.watchers || [])
  }, [caseId, token])

  useEffect(() => { if (open) load() }, [open, load])

  useEffect(() => {
    if (!open) return
    const cb = (e) => { if (popRef.current && !popRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', cb)
    return () => document.removeEventListener('mousedown', cb)
  }, [open])

  const isWatching = items.some(w => w.user_id === user?.userId)

  async function toggle() {
    setBusy(true)
    try {
      if (isWatching) {
        await httpFetch(`/api/cases/${caseId}/watchers/${user.userId}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
        })
      } else {
        await httpFetch(`/api/cases/${caseId}/watchers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ user_id: user.userId, reason: 'manual' }),
        })
      }
      load()
    } finally { setBusy(false) }
  }

  if (!enabled) return null
  return (
    <span ref={popRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        padding: '4px 10px', fontSize: 12, fontWeight: 600,
        background: 'transparent', border: '1px solid var(--border)',
        borderRadius: 4, cursor: 'pointer',
        color: 'var(--text-secondary)',
      }}>
        👁 {items.length} watcher{items.length === 1 ? '' : 's'}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 30,
          width: 260, background: 'var(--surface,#fff)',
          border: '1px solid var(--border)', borderRadius: 6,
          boxShadow: '0 10px 28px rgba(0,0,0,0.14)',
        }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 12 }}>Watchers</strong>
            <button onClick={toggle} disabled={busy} style={{
              padding: '3px 8px', fontSize: 11, fontWeight: 600,
              border: `1px solid ${isWatching ? '#b91c1c' : '#1a7a3f'}`,
              color: isWatching ? '#b91c1c' : '#1a7a3f',
              background: '#fff', borderRadius: 4, cursor: 'pointer',
            }}>{isWatching ? 'Unwatch' : 'Watch'}</button>
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {items.length === 0 && (
              <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)' }}>No watchers yet.</div>
            )}
            {items.map(w => (
              <div key={w.user_id} style={{
                padding: '6px 12px', fontSize: 12,
                display: 'flex', justifyContent: 'space-between',
              }}>
                <span>{w.name || w.email}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{w.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </span>
  )
}
