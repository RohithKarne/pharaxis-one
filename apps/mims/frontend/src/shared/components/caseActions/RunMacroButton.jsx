/**
 * RunMacroButton — Theme 8 (Wave 4) dropdown to pick + run a macro on a case.
 *
 * Props:
 *   caseId
 *   onRan?  — (results[]) => void
 */

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useFeatureFlag } from '../../context/FeatureFlagsContext'
import { httpFetch } from '../../api/httpFetch.js'

export default function RunMacroButton({ caseId, onRan }) {
  const { token } = useAuth()
  const enabled = useFeatureFlag('cf.theme8_smart_actions')
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [busy, setBusy] = useState(false)
  const popRef = useRef(null)

  useEffect(() => {
    if (!open || !enabled) return
    httpFetch('/api/case-macros', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setItems(d.macros || []))
      .catch(() => setItems([]))
  }, [open, token, enabled])

  useEffect(() => {
    if (!open) return
    const cb = (e) => { if (popRef.current && !popRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', cb)
    return () => document.removeEventListener('mousedown', cb)
  }, [open])

  async function run(m) {
    if (!confirm(`Run macro "${m.name}" with ${m.step_count} steps?`)) return
    setBusy(true)
    try {
      const r = await httpFetch(`/api/cases/${caseId}/run-macro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ macro_id: m.id }),
      })
      const d = await r.json()
      onRan?.(d.results || [])
      setOpen(false)
    } finally { setBusy(false) }
  }

  if (!enabled) return null
  return (
    <span ref={popRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setOpen(o => !o)} disabled={busy} style={{
        padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        background: 'transparent', color: 'var(--accent,#1a4f9c)',
        border: '1px solid var(--accent,#1a4f9c)', borderRadius: 4,
      }}>⚡ Macros ▾</button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 30,
          width: 280, background: 'var(--surface,#fff)',
          border: '1px solid var(--border)', borderRadius: 6,
          boxShadow: '0 10px 28px rgba(0,0,0,0.14)', overflow: 'hidden',
        }}>
          {items.length === 0 && (
            <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)' }}>No macros configured.</div>
          )}
          {items.map(m => (
            <div key={m.id} onClick={() => run(m)} style={{
              padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
              {m.description && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{m.description}</div>
              )}
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                {m.step_count} step{m.step_count === 1 ? '' : 's'}
              </div>
            </div>
          ))}
        </div>
      )}
    </span>
  )
}
