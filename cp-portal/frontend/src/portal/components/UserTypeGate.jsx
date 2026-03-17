import { useState } from 'react'
import { usePortal } from '../context/PortalContext'

const TYPE_KEY = 'cp_user_type_confirmed'

export default function UserTypeGate() {
  const { portalConfig, clientCode, login } = usePortal()
  const gate = portalConfig?.gate
  const [confirmed, setConfirmed]   = useState(() => !!localStorage.getItem(TYPE_KEY))
  const [selected, setSelected]     = useState(null)
  const [accepted, setAccepted]     = useState(false)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState(null)

  if (!gate || confirmed) return null

  const canConfirm = selected && (!gate.require_disclaimer || accepted)

  async function confirm() {
    if (!canConfirm) return
    setSaving(true)
    setError(null)
    try {
      const token = localStorage.getItem('cp_portal_token')
      const res = await fetch(`/api/portal/auth/confirm-type`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_type: selected })
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Failed to save. Please try again.'); setSaving(false); return }
      localStorage.setItem(TYPE_KEY, selected)
      setConfirmed(true)
      login(d.user, d.token)
    } catch {
      setError('Network error. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div className="pp-gate-overlay">
      <div className="pp-gate-modal" role="dialog" aria-modal="true" aria-labelledby="pp-gate-title">
        <div className="pp-gate-header">
          <h2 id="pp-gate-title" className="pp-gate-title">
            {gate.gate_title || 'Welcome — Please Identify Yourself'}
          </h2>
          {gate.gate_subtitle && (
            <p className="pp-gate-subtitle">{gate.gate_subtitle}</p>
          )}
        </div>

        <div className="pp-gate-type-grid">
          {gate.userTypes.map(t => (
            <button
              key={t.type_key}
              type="button"
              role="radio"
              aria-checked={selected === t.type_key}
              className={`pp-gate-type-card ${selected === t.type_key ? 'pp-gate-type-selected' : ''}`}
              onClick={() => setSelected(t.type_key)}
            >
              <span className="pp-gate-type-icon">{t.icon || '👤'}</span>
              <span className="pp-gate-type-label">{t.label}</span>
              {t.description && <span className="pp-gate-type-desc">{t.description}</span>}
              <span className="pp-gate-type-check">{selected === t.type_key ? '✓' : ''}</span>
            </button>
          ))}
        </div>

        {gate.require_disclaimer && gate.disclaimer_text && (
          <div className="pp-gate-disclaimer">
            <label className="pp-gate-disclaimer-label">
              <input
                type="checkbox"
                checked={accepted}
                onChange={e => setAccepted(e.target.checked)}
              />
              <span>{gate.disclaimer_text}</span>
            </label>
          </div>
        )}

        {error && <div className="pp-gate-error">{error}</div>}

        <div className="pp-gate-actions">
          <button
            type="button"
            className="pp-btn pp-btn-primary pp-gate-confirm-btn"
            disabled={!canConfirm || saving}
            onClick={confirm}
          >
            {saving ? 'Saving…' : 'Confirm My Selection'}
          </button>
        </div>
      </div>
    </div>
  )
}
