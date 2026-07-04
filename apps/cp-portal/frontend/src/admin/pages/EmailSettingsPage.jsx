import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'
import LoadingButton from '../components/LoadingButton'

const ENCRYPTION_OPTIONS = ['STARTTLS', 'SSL/TLS', 'None']

const EMPTY = {
  smtp_host: '', smtp_port: 587, smtp_encryption: 'STARTTLS',
  smtp_username: '', smtp_password: '', from_email: '', from_name: '',
  is_active: false,
}

export default function EmailSettingsPage() {
  const { clientId } = useParams()
  const [form, setForm] = useState(EMPTY)
  const [hasPassword, setHasPassword] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [testTo, setTestTo] = useState('')
  const [testMsg, setTestMsg] = useState(null)   // { type: 'success'|'error', text }
  const [testing, setTesting] = useState(false)

  useEffect(() => { loadConfig() }, [clientId])

  async function loadConfig() {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/email-config/${clientId}`, { headers: adminHeaders() })
      const d = await res.json()
      const cfg = d.config || {}
      setForm({
        smtp_host: cfg.smtp_host || '',
        smtp_port: cfg.smtp_port || 587,
        smtp_encryption: cfg.smtp_encryption || 'STARTTLS',
        smtp_username: cfg.smtp_username || '',
        smtp_password: '',  // never pre-filled for security
        from_email: cfg.from_email || '',
        from_name: cfg.from_name || '',
        is_active: !!cfg.is_active,
      })
      setHasPassword(!!cfg.has_password)
    } catch {
      // leave defaults
    } finally {
      setLoading(false)
    }
  }

  function set(field, value) {
    setSaved(false)
    setSaveError('')
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSave() {
    setSaved(false); setSaveError('')
    // Guard the port: fall back to 587 if blank/NaN so it isn't persisted as 0
    const port = parseInt(form.smtp_port, 10)
    const body = { ...form, smtp_port: Number.isFinite(port) && port > 0 ? port : 587, is_active: form.is_active ? 1 : 0 }
    // If password field is blank and server already has one, omit it (don't overwrite with empty)
    if (!body.smtp_password) delete body.smtp_password
    try {
      const res = await fetch(`/api/admin/email-config/${clientId}`, {
        method: 'PATCH',
        headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setSaveError(d.error || `Could not save settings (error ${res.status}).`)
        return
      }
      setSaved(true)
      if (form.smtp_password) setHasPassword(true)
      setForm(f => ({ ...f, smtp_port: body.smtp_port, smtp_password: '' }))
    } catch {
      setSaveError('Network error — please try again.')
    }
  }

  async function handleTest() {
    if (!testTo) { setTestMsg({ type: 'error', text: 'Enter a recipient email address.' }); return }
    setTesting(true)
    setTestMsg(null)
    try {
      const res = await fetch(`/api/admin/email-config/${clientId}/test`, {
        method: 'POST',
        headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testTo }),
      })
      const d = await res.json()
      if (res.ok) setTestMsg({ type: 'success', text: d.message })
      else setTestMsg({ type: 'error', text: d.error || 'Test failed.' })
    } catch {
      setTestMsg({ type: 'error', text: 'Network error.' })
    } finally {
      setTesting(false)
    }
  }

  if (loading) return <AdminLayout><div className="cp-loading">Loading…</div></AdminLayout>

  return (
    <AdminLayout>
      <div className="cp-section-header">
        <h2>Email Settings</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => set('is_active', e.target.checked)}
            />
            Enable email service
          </label>
        </div>
      </div>

      <div className="cp-card" style={{ marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 600, color: '#1A1A2E' }}>
          SMTP Configuration
        </h3>

        <div className="cp-field-row">
          <div className="cp-field" style={{ flex: 2 }}>
            <label>SMTP Host *</label>
            <input
              value={form.smtp_host}
              onChange={e => set('smtp_host', e.target.value)}
              placeholder="e.g. smtp.gmail.com"
            />
          </div>
          <div className="cp-field" style={{ flex: 1 }}>
            <label>Port</label>
            <input
              type="number"
              value={form.smtp_port}
              onChange={e => set('smtp_port', e.target.value)}
              placeholder="587"
            />
          </div>
          <div className="cp-field" style={{ flex: 1 }}>
            <label>Encryption</label>
            <select value={form.smtp_encryption} onChange={e => set('smtp_encryption', e.target.value)}>
              {ENCRYPTION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>

        <div className="cp-field-row">
          <div className="cp-field">
            <label>SMTP Username *</label>
            <input
              value={form.smtp_username}
              onChange={e => set('smtp_username', e.target.value)}
              placeholder="your@email.com"
              autoComplete="off"
            />
          </div>
          <div className="cp-field">
            <label>
              SMTP Password
              {hasPassword && <span style={{ color: '#16A34A', fontSize: 11, marginLeft: 8 }}>● saved</span>}
            </label>
            <input
              type="password"
              value={form.smtp_password}
              onChange={e => set('smtp_password', e.target.value)}
              placeholder={hasPassword ? 'Leave blank to keep existing' : 'Enter password'}
              autoComplete="new-password"
            />
          </div>
        </div>

        <div className="cp-field-row">
          <div className="cp-field">
            <label>From Name</label>
            <input
              value={form.from_name}
              onChange={e => set('from_name', e.target.value)}
              placeholder="e.g. Medical Portal Team"
            />
          </div>
          <div className="cp-field">
            <label>From Email *</label>
            <input
              type="email"
              value={form.from_email}
              onChange={e => set('from_email', e.target.value)}
              placeholder="noreply@yourdomain.com"
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <LoadingButton onClick={handleSave}>Save Settings</LoadingButton>
          {saved && <span style={{ fontSize: 13, color: '#16A34A', fontWeight: 500 }}>✓ Saved</span>}
          {saveError && <span style={{ fontSize: 13, color: '#DC2626', fontWeight: 500 }}>✗ {saveError}</span>}
        </div>
      </div>

      <div className="cp-card">
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: '#1A1A2E' }}>
          Send Test Email
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6B7280' }}>
          Send a test email to verify your SMTP configuration is working. Save your settings first.
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div className="cp-field" style={{ margin: 0, flex: 1 }}>
            <label>Recipient Email</label>
            <input
              type="email"
              value={testTo}
              onChange={e => { setTestTo(e.target.value); setTestMsg(null) }}
              placeholder="test@example.com"
            />
          </div>
          <LoadingButton
            onClick={handleTest}
            className="cp-btn cp-btn-outline"
            disabled={testing}
            minDuration={1500}
          >
            Send Test
          </LoadingButton>
        </div>
        {testMsg && (
          <div style={{
            marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13,
            background: testMsg.type === 'success' ? '#F0FDF4' : '#FEF2F2',
            color:      testMsg.type === 'success' ? '#16A34A' : '#DC2626',
            border: `1px solid ${testMsg.type === 'success' ? '#BBF7D0' : '#FECACA'}`,
          }}>
            {testMsg.type === 'success' ? '✓ ' : '✗ '}{testMsg.text}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
