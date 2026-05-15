import { useState } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import AlertsView from '../AlertsView'

export default function SetupAlerts() {
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
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Alerts</h1>
        <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
          Configure platform alert rules, email templates, and review recent alert events.
        </p>
      </div>
      {msg.text && (
        <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`} style={{ display: 'block', marginBottom: 12 }}>
          {msg.text}
        </div>
      )}
      <AlertsView H={H} flash={flash} apiBase="/api/admin" />
    </div>
  )
}
