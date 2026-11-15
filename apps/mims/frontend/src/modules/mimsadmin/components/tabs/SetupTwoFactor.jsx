import { useState } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import TwoFactorConfigView from '../TwoFactorConfigView'

export default function SetupTwoFactor() {
  const { token } = useAuth()
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const [msg, setMsg] = useState({ text: '', type: '' })

  function flash(text, type = 'success') {
    setMsg({ text, type })
    setTimeout(() => setMsg({ text: '', type: '' }), 4000)
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Sign-in &amp; Security</h1>
        <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
          One sign-in for all of MIMS: platform rules, and each client's two-step, company login and personal-email settings.
        </p>
      </div>
      {msg.text && (
        <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`} style={{ display: 'block', marginBottom: 12 }}>
          {msg.text}
        </div>
      )}
      <TwoFactorConfigView H={H} flash={flash} apiBase="/api/admin/two-factor" />
    </div>
  )
}
