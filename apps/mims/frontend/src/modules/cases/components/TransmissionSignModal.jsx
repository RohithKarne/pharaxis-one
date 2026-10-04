import { useState } from 'react'

// MIPM-164: the server asks for an e-signature when a PV hand-off is accepted or
// closed (or moved back out), but the tracker sent the status alone, so those
// buttons always failed. This box collects the password and reason, in the same
// style as the MI response sign-off.
export default function TransmissionSignModal({ target, onCancel, onConfirm, what = 'PV hand-off' }) {
  const [password, setPassword] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  if (!target) return null

  async function confirm() {
    if (!password.trim() || !reason.trim()) { setError('Enter your password and a reason.'); return }
    setSaving(true); setError('')
    const message = await onConfirm(password, reason.trim())
    setSaving(false)
    if (message) setError(message)
  }

  return (
    <div className="cf-corr-compose-overlay" onClick={() => !saving && onCancel()}>
      <div className="cf-esign-modal" onClick={e => e.stopPropagation()}>
        <div className="cf-corr-compose-header">
          <div className="cf-corr-compose-title">Electronic Signature - {what} to {target.status}</div>
          <button className="cf-corr-modal-close" onClick={() => !saving && onCancel()}>x</button>
        </div>
        <div className="cf-corr-compose-body">
          <div className="cf-esign-notice">
            <span>This change requires your electronic signature. Your identity and reason will be recorded against it.</span>
          </div>
          <div className="cf-esign-fields">
            <div className="cf-form-field">
              <label>Your Password <span style={{ color: '#dc2626' }}>*</span></label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your login password to confirm identity" disabled={saving} autoComplete="current-password" />
            </div>
            <div className="cf-form-field">
              <label>Reason / Justification <span style={{ color: '#dc2626' }}>*</span></label>
              <textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} disabled={saving} />
            </div>
          </div>
          {error && <div role="alert" style={{ color: '#b91c1c', fontSize: 13, marginTop: 8 }}>{error}</div>}
        </div>
        <div className="cf-form-actions" style={{ padding: '12px 16px', marginTop: 0 }}>
          <button className="cf-cancel-btn" onClick={onCancel} disabled={saving}>Cancel</button>
          <button className="cf-save-btn cf-esign-confirm-btn" onClick={confirm} disabled={saving}>
            {saving ? 'Processing...' : 'Sign and Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
