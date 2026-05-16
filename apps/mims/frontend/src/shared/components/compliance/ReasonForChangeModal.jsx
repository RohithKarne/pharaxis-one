/**
 * ReasonForChangeModal — Theme 9 (Wave 5).
 *
 * Intercepts a field-save when compliance is on. Caller passes:
 *   open, onClose, onConfirm({reason})
 *   field, oldValue, newValue
 *
 * The reason is sent into fieldHistoryService.record() server-side by the
 * caller's PUT handler (or via the compliance route directly).
 */

import { useEffect, useState } from 'react'

export default function ReasonForChangeModal({ open, onClose, onConfirm, field, oldValue, newValue }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (open) setReason('') }, [open])

  if (!open) return null

  async function confirm() {
    if (!reason.trim()) return
    setBusy(true)
    try { await onConfirm?.({ reason: reason.trim() }) }
    finally { setBusy(false); onClose?.() }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(20,28,42,0.55)', zIndex: 9990,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 480, maxWidth: '92vw', background: 'var(--surface,#fff)',
        borderRadius: 10, boxShadow: '0 12px 48px rgba(0,0,0,0.25)', overflow: 'hidden',
      }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <strong>Reason for change</strong>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            21 CFR Part 11 requires a reason for every audited change.
          </div>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 12, marginBottom: 8 }}>
            <strong>{field}</strong>:
            <span style={{ color: '#b91c1c', textDecoration: 'line-through', marginLeft: 6 }}>
              {String(oldValue ?? '∅')}
            </span>
            <span style={{ margin: '0 6px' }}>→</span>
            <span style={{ color: '#1a7a3f' }}>{String(newValue ?? '∅')}</span>
          </div>
          <textarea
            autoFocus
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            placeholder="Why is this change being made?"
            style={{
              width: '100%', padding: '8px 10px', fontSize: 13,
              border: '1px solid var(--border)', borderRadius: 6,
              fontFamily: 'inherit', resize: 'vertical',
            }}
          />
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={onClose} style={ghostBtn}>Cancel</button>
            <button onClick={confirm} disabled={busy || !reason.trim()} style={{
              ...primaryBtn, opacity: (busy || !reason.trim()) ? 0.6 : 1,
            }}>
              {busy ? 'Saving…' : 'Save with reason'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const primaryBtn = {
  padding: '7px 14px', fontSize: 12, fontWeight: 600,
  background: '#1a4f9c', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer',
}
const ghostBtn = {
  padding: '7px 14px', fontSize: 12, fontWeight: 600,
  background: '#fff', color: 'var(--text-secondary)',
  border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer',
}
