/**
 * ESignModal — Theme 9 (Wave 5) e-signature modal for case state transitions.
 *
 * Intercepts transitions (submit / approve / close / transmit / lock / rescind),
 * captures password + reason, POSTs /api/cases/:caseId/esign. The server
 * verifies the password, builds the hash chain, and persists immutably.
 *
 * Props:
 *   open, onClose
 *   caseId, transition  — required
 *   fromStatus, toStatus
 *   meaning?    — defaults to a Part 11 statement scoped to the transition
 *   onSigned?   — (esign event) => void
 */

import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { httpFetch } from '../../api/httpFetch.js'

const DEFAULT_MEANINGS = {
  submit:    'I confirm submission of this case under 21 CFR Part 11.',
  approve:   'I approve this case for release under 21 CFR Part 11.',
  close:     'I attest this case is complete and may be closed.',
  transmit:  'I authorize transmission of this case to the regulatory authority.',
  lock:      'I lock this case from further edits.',
  rescind:   'I rescind a prior decision on this case with cause.',
}

export default function ESignModal({
  open, onClose, caseId, transition,
  fromStatus = null, toStatus = null,
  meaning, onSigned,
}) {
  const { token, user } = useAuth()
  const [password, setPassword] = useState('')
  const [reason, setReason]     = useState('')
  const [busy, setBusy]         = useState(false)
  const [err, setErr]           = useState(null)

  useEffect(() => {
    if (!open) return
    setPassword(''); setReason(''); setErr(null)
  }, [open])

  if (!open) return null
  const statement = meaning || DEFAULT_MEANINGS[transition] || `I confirm the ${transition} action.`

  async function sign() {
    if (!password) { setErr('Password required.'); return }
    setBusy(true); setErr(null)
    try {
      const r = await httpFetch(`/api/cases/${caseId}/esign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          transition, from_status: fromStatus, to_status: toStatus,
          meaning: statement, reason, auth_method: 'password', password,
        }),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Signature failed'); return }
      onSigned?.(d)
      onClose?.()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(20,28,42,0.55)', zIndex: 9990,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 480, maxWidth: '92vw', background: 'var(--surface,#fff)',
        borderRadius: 10, boxShadow: '0 14px 60px rgba(0,0,0,0.32)', overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)',
          background: 'linear-gradient(180deg,#1a4f9c,#143a73)', color: '#fff' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', opacity: 0.85 }}>
            21 CFR Part 11 Electronic Signature
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>
            {transition.charAt(0).toUpperCase() + transition.slice(1)} case #{caseId}
          </div>
        </div>
        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 14, lineHeight: 1.5 }}>
            {statement}
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={lbl}>Signed by</label>
            <div style={{ padding: '7px 10px', background: 'var(--surface-alt,#fafafa)',
              border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, fontWeight: 600 }}>
              {user?.name || user?.email} {user?.email && user?.name ? `· ${user.email}` : ''}
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={lbl}>Confirm password</label>
            <input
              autoFocus type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sign()}
              style={ipt}
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={lbl}>Reason (optional)</label>
            <textarea
              value={reason} onChange={e => setReason(e.target.value)}
              rows={2} style={{ ...ipt, fontFamily: 'inherit', resize: 'vertical' }}
            />
          </div>
          {err && (
            <div style={{ marginTop: 10, padding: '8px 10px',
              background: '#fdecea', border: '1px solid #f5c6c6', borderRadius: 6,
              color: '#7a1313', fontSize: 12 }}>{err}</div>
          )}
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={onClose} style={ghostBtn}>Cancel</button>
            <button onClick={sign} disabled={busy || !password} style={{
              ...primaryBtn, opacity: (busy || !password) ? 0.6 : 1,
            }}>{busy ? 'Signing…' : 'Sign & confirm'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

const lbl = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)',
  marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 }
const ipt = { width: '100%', padding: '8px 10px', fontSize: 13,
  border: '1px solid var(--border)', borderRadius: 6 }
const primaryBtn = { padding: '8px 16px', fontSize: 12, fontWeight: 700,
  background: '#1a4f9c', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }
const ghostBtn = { padding: '8px 16px', fontSize: 12, fontWeight: 600,
  background: '#fff', color: 'var(--text-secondary)',
  border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }
