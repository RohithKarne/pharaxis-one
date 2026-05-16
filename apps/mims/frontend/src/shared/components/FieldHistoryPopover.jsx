/**
 * FieldHistoryPopover — Theme 2 (Wave 2) field history popover.
 *
 * Reads /api/field-history?entity_type=&entity_id=&field= (powered by Wave 0
 * piece #2 — field_value_history). Rendered as a clickable clock icon next
 * to the field label.
 *
 * Usage:
 *   <FieldHistoryPopover entityType="case" entityId={caseId} field="reporter_name" />
 */

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { httpFetch } from '../api/httpFetch.js'

export default function FieldHistoryPopover({ entityType, entityId, field, label }) {
  const { token } = useAuth()
  const [open, setOpen]   = useState(false)
  const [rows, setRows]   = useState([])
  const [busy, setBusy]   = useState(false)
  const popRef            = useRef(null)

  useEffect(() => {
    if (!open) return
    setBusy(true)
    const H = { Authorization: `Bearer ${token}` }
    const params = new URLSearchParams({
      entity_type: entityType, entity_id: String(entityId),
    })
    if (field) params.set('field', field)
    httpFetch(`/api/field-history?${params}`, { headers: H })
      .then(r => r.json())
      .then(d => setRows(d.history || []))
      .catch(() => setRows([]))
      .finally(() => setBusy(false))
  }, [open, entityType, entityId, field, token])

  useEffect(() => {
    if (!open) return
    function close(e) {
      if (popRef.current && !popRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <span ref={popRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={`History · ${label || field}`}
        style={{
          padding: 0, background: 'transparent', border: 'none', cursor: 'pointer',
          marginLeft: 4, fontSize: 12, color: 'var(--text-muted)',
        }}
      >🕘</button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 40,
          width: 320, padding: 12, background: 'var(--surface,#fff)',
          border: '1px solid var(--border)', borderRadius: 8,
          boxShadow: '0 10px 32px rgba(0,0,0,0.16)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
            {label || field} — history
          </div>
          {busy && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>}
          {!busy && rows.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No history yet.</div>
          )}
          {!busy && rows.length > 0 && (
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              {rows.map(r => (
                <div key={r.id} style={{
                  fontSize: 12, padding: '6px 0', borderBottom: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                    <span>{r.changed_by_name || `User ${r.changed_by ?? '—'}`}</span>
                    <span>{new Date(r.changed_at).toLocaleString()}</span>
                  </div>
                  <div style={{ marginTop: 2 }}>
                    <span style={{ color: '#b91c1c', textDecoration: 'line-through' }}>{r.old_value || '∅'}</span>
                    {' → '}
                    <span style={{ color: '#1a7a3f' }}>{r.new_value || '∅'}</span>
                  </div>
                  {r.reason && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>
                      Reason: {r.reason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </span>
  )
}
