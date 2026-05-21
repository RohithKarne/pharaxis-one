/**
 * MiApprovalPanel — Sprint 2 #17 + #16.
 *
 * Two responsibilities:
 *   1. Render the off-label / solicited classification chips for an MI tab,
 *      with admin controls to flip them + request promotional review (#16).
 *   2. Drive the two-signer approval flow on an MI response (#17):
 *        Reviewer signs → status flips to REVIEWED
 *        Approver signs (must be different user) → status flips to APPROVED
 *      Both sigs are e-sign with password verify + hash-chain entry via
 *      complianceService.
 *
 * Props:
 *   miTabId     — required if mode='classification'
 *   responseId  — required if mode='approval'
 *   mode        — 'classification' | 'approval' | 'both' (default)
 *   onChange    — callback after any write (refresh parent)
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { httpFetch } from '../api/httpFetch.js'

export default function MiApprovalPanel({
  miTabId, responseId, mode = 'both', onChange,
}) {
  const { token } = useAuth()
  const H = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {(mode === 'classification' || mode === 'both') && miTabId && (
        <ClassificationCard miTabId={miTabId} H={H} onChange={onChange} />
      )}
      {(mode === 'approval' || mode === 'both') && responseId && (
        <ApprovalCard responseId={responseId} H={H} onChange={onChange} />
      )}
    </div>
  )
}

// ── Classification: off-label + solicited flags + promo review request ──────

function ClassificationCard({ miTabId, H, onChange }) {
  const [state, setState] = useState(null)
  const [editing, setEditing] = useState(false)
  const [flash, setFlash] = useState(null)

  const load = useCallback(async () => {
    try {
      const r = await httpFetch(`/api/mi/tabs/${miTabId}/classification`, { headers: H })
      const d = await r.json()
      setState(d)
    } catch { /* tolerate */ }
  }, [miTabId, H])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await httpFetch(`/api/mi/tabs/${miTabId}/classification`, { headers: H })
        const d = await r.json()
        if (!cancelled) setState(d)
      } catch {
        /* tolerate */
      }
    })()
    return () => { cancelled = true }
  }, [miTabId, H])

  async function save(patch) {
    try {
      const r = await httpFetch(`/api/mi/tabs/${miTabId}/classification`, {
        method: 'PUT', headers: H, body: JSON.stringify(patch),
      })
      if (!r.ok) { setFlash('Save failed'); return }
      setFlash('Saved'); setTimeout(() => setFlash(null), 2000)
      load(); onChange?.()
    } catch (e) { setFlash(e.message) }
  }

  async function requestPromoReview() {
    await httpFetch(`/api/mi/tabs/${miTabId}/promo-review/request`, {
      method: 'POST', headers: H, body: JSON.stringify({}),
    })
    load(); onChange?.()
  }

  if (!state) return null
  const offLabel = !!state.is_off_label
  const solicited = !!state.is_solicited
  const promoStatus = state.promo_review_status || 'not_required'

  return (
    <div style={{
      padding: 12, borderRadius: 8, border: '1px solid var(--border)',
      background: offLabel ? '#fef3c7' : 'var(--surface,#fff)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.3, color: 'var(--text-secondary)' }}>
          Inquiry classification
        </strong>
        <button onClick={() => setEditing(e => !e)} style={ghostBtnSm}>{editing ? 'Done' : 'Edit'}</button>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        <Chip label={offLabel ? '⚠ OFF-LABEL' : 'On-label'} color={offLabel ? '#b91c1c' : '#1a7a3f'} />
        <Chip label={solicited ? 'Solicited' : 'Unsolicited'} color={solicited ? '#c08300' : '#1a4f9c'} />
        {promoStatus !== 'not_required' && (
          <Chip label={`Promo review: ${promoStatus}`}
            color={promoStatus === 'approved' ? '#1a7a3f' : promoStatus === 'rejected' ? '#b91c1c' : '#7a3a8a'} />
        )}
      </div>

      {state.off_label_indication && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, marginBottom: 8 }}>
          <strong>Off-label indication:</strong> {state.off_label_indication}
        </div>
      )}

      {editing && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={lbl}>
            <input type="checkbox" checked={offLabel} onChange={e => save({ is_off_label: e.target.checked })} />
            Off-label inquiry (will require two-signer approval per FDA guidance)
          </label>
          <label style={lbl}>
            <input type="checkbox" checked={solicited} onChange={e => save({ is_solicited: e.target.checked })} />
            Solicited (the company prompted this inquiry — note: unsolicited is preferred for safe-harbor)
          </label>
          {offLabel && (
            <div>
              <label style={{ ...lbl, display: 'block', marginBottom: 4 }}>Off-label indication described:</label>
              <input value={state.off_label_indication || ''}
                onBlur={e => save({ off_label_indication: e.target.value })}
                style={{ width: '100%', padding: '6px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 4 }}
                placeholder="e.g. Pediatric dosing for off-label indication X" />
            </div>
          )}
          {offLabel && promoStatus === 'not_required' && (
            <button onClick={requestPromoReview} style={primaryBtnSm}>Request promotional review</button>
          )}
        </div>
      )}

      {flash && <div style={{ marginTop: 6, fontSize: 11, color: '#1a7a3f' }}>{flash}</div>}
    </div>
  )
}

// ── Two-signer approval card ────────────────────────────────────────────────

function ApprovalCard({ responseId, H, onChange }) {
  const [state, setState] = useState(null)
  const [signing, setSigning] = useState(null) // 'reviewer' | 'approver' | null
  const [password, setPassword] = useState('')
  const [reason, setReason] = useState('')
  const [flash, setFlash] = useState(null)

  const load = useCallback(async () => {
    try {
      const r = await httpFetch(`/api/mi-responses/${responseId}/approval-state`, { headers: H })
      const d = await r.json()
      setState(d)
    } catch { /* tolerate */ }
  }, [responseId, H])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await httpFetch(`/api/mi-responses/${responseId}/approval-state`, { headers: H })
        const d = await r.json()
        if (!cancelled) setState(d)
      } catch {
        /* tolerate */
      }
    })()
    return () => { cancelled = true }
  }, [responseId, H])

  async function sign() {
    if (!password) { setFlash('Password required'); return }
    setFlash(null)
    try {
      const path = signing === 'reviewer' ? 'review' : 'approve'
      const r = await httpFetch(`/api/mi-responses/${responseId}/${path}`, {
        method: 'POST', headers: H, body: JSON.stringify({ password, reason }),
      })
      const d = await r.json()
      if (!r.ok) { setFlash(d.error || 'Signature failed'); return }
      setSigning(null); setPassword(''); setReason('')
      load(); onChange?.()
    } catch (e) { setFlash(e.message) }
  }

  if (!state) return null
  if (!state.required && !state.reviewer && !state.approver) {
    return (
      <div style={{ padding: 10, fontSize: 12, color: 'var(--text-muted)',
        border: '1px dashed var(--border)', borderRadius: 6 }}>
        Single-signer flow — use the standard e-sign button. (Mark inquiry off-label above to require two signers.)
      </div>
    )
  }

  return (
    <div style={{ padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface,#fff)' }}>
      <strong style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.3, color: 'var(--text-secondary)' }}>
        Two-signer approval {state.required && <Chip label="REQUIRED" color="#b91c1c" />}
      </strong>

      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <SignerSlot
          title="Reviewer"
          subtitle="Technical accuracy"
          signed={state.reviewer}
          status={state.status}
          showSignBtn={state.status === 'DRAFT'}
          onSign={() => { setSigning('reviewer'); setPassword(''); setReason('') }}
        />
        <SignerSlot
          title="Approver"
          subtitle="Compliance / release"
          signed={state.approver}
          status={state.status}
          showSignBtn={state.status === 'REVIEWED'}
          requiredRole={state.required_approver_role}
          onSign={() => { setSigning('approver'); setPassword(''); setReason('') }}
        />
      </div>

      {signing && (
        <div onClick={() => setSigning(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(20,28,42,0.55)', zIndex: 9990,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: 440, maxWidth: '92vw', background: 'var(--surface,#fff)',
            borderRadius: 10, padding: 18, boxShadow: '0 14px 60px rgba(0,0,0,0.32)',
          }}>
            <h3 style={{ margin: 0, marginBottom: 8 }}>
              {signing === 'reviewer' ? 'Reviewer signature' : 'Approver signature'}
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 0 }}>
              {signing === 'reviewer'
                ? 'I have reviewed this MI response for technical accuracy under 21 CFR Part 11.'
                : 'I approve this MI response for release under 21 CFR Part 11.'}
            </p>
            <label style={{ ...lbl, marginBottom: 4 }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sign()}
              style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6 }} />
            <label style={{ ...lbl, marginTop: 10, marginBottom: 4 }}>Reason (optional)</label>
            <input value={reason} onChange={e => setReason(e.target.value)}
              style={{ width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6 }} />
            {flash && (
              <div style={{ marginTop: 10, padding: '8px 10px', fontSize: 12,
                background: '#fdecea', border: '1px solid #f5c6c6', borderRadius: 6, color: '#7a1313' }}>{flash}</div>
            )}
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setSigning(null)} style={ghostBtnSm}>Cancel</button>
              <button onClick={sign} style={primaryBtnSm}>Sign &amp; confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SignerSlot({ title, subtitle, signed, showSignBtn, requiredRole, onSign }) {
  return (
    <div style={{
      padding: 10, borderRadius: 6, border: '1px solid var(--border)',
      background: signed ? '#e6f9ee' : 'var(--surface-alt,#fafafa)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>{title}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{subtitle}</div>
      {signed ? (
        <div style={{ marginTop: 6, fontSize: 12 }}>
          ✓ <strong>{signed.name}</strong>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{new Date(signed.at).toLocaleString()}</div>
        </div>
      ) : (
        <>
          {requiredRole && (
            <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>
              required role: {requiredRole}
            </div>
          )}
          {showSignBtn && (
            <button onClick={onSign} style={{ ...primaryBtnSm, marginTop: 6, width: '100%' }}>Sign as {title.toLowerCase()}</button>
          )}
          {!showSignBtn && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              waiting for previous step
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Chip({ label, color }) {
  return <span style={{
    padding: '1px 7px', borderRadius: 10, color: '#fff', background: color,
    fontWeight: 700, fontSize: 10, marginLeft: 4,
  }}>{label}</span>
}

const lbl = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }
const primaryBtnSm = { padding: '6px 12px', fontSize: 11, fontWeight: 700, background: '#1a4f9c', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }
const ghostBtnSm = { padding: '4px 10px', fontSize: 11, fontWeight: 600, background: '#fff', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }
