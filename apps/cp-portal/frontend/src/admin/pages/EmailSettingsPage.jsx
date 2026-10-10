import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { CanChange, ReadOnlyUnless } from '../components/RoleGate'
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
  const [outbox, setOutbox] = useState({ emails: [], counts: { sent: 0, pending: 0, failed: 0 } })
  const [viewing, setViewing] = useState(null) // CPPM-144: one email, as it would be sent

  async function viewEmail(id) {
    setResendMsg(null)
    const res = await fetch(`/api/admin/email-config/${clientId}/outbox/${id}`, { headers: adminHeaders() })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setResendMsg({ type: 'error', text: d.error || 'Could not open this email.' }); return }
    setViewing(d.email)
  }
  const [resendMsg, setResendMsg] = useState(null)

  // CPPM-36: failed and retrying emails, so nobody is left unnotified unseen.
  async function loadOutbox() {
    try {
      const res = await fetch(`/api/admin/email-config/${clientId}/outbox`, { headers: adminHeaders() })
      if (res.ok) setOutbox(await res.json())
    } catch { /* leave the last known list on screen */ }
  }
  useEffect(() => { loadOutbox() }, [clientId])

  async function handleResend(id) {
    setResendMsg(null)
    const res = await fetch(`/api/admin/email-config/${clientId}/outbox/${id}/resend`, { method: 'POST', headers: adminHeaders() })
    const d = await res.json().catch(() => ({}))
    setResendMsg(res.ok
      ? { type: d.status === 'sent' ? 'success' : 'error', text: d.status === 'sent' ? 'Email sent.' : `Still failing: ${d.error || 'unknown error'}` }
      : { type: 'error', text: d.error || 'Resend failed.' })
    loadOutbox()
  }

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
      <ReadOnlyUnless area="email-config" what="the email settings">
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

      {/* CP ease-of-use plan, phase 3 row 22: who the emails come from first, then the
          mail server, with port and encryption under Advanced; Send test beside Save. */}
      <div className="cp-card" style={{ marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 600, color: '#1A1A2E' }}>
          Sending email
        </h3>

        <div className="cp-field-row">
          <div className="cp-field">
            <label htmlFor="mail-from-name">From name</label>
            <input
              id="mail-from-name"
              value={form.from_name}
              onChange={e => set('from_name', e.target.value)}
              placeholder="e.g. Medical Portal Team"
            />
          </div>
          <div className="cp-field">
            <label htmlFor="mail-from-email">From email address *</label>
            <input
              id="mail-from-email"
              type="email"
              value={form.from_email}
              onChange={e => set('from_email', e.target.value)}
              placeholder="noreply@yourdomain.com"
            />
          </div>
        </div>

        <p style={{ margin: '4px 0 10px', fontSize: 13, color: '#4B5563' }}>
          Mail server — your IT team has these details.
        </p>
        <div className="cp-field-row">
          <div className="cp-field" style={{ flex: 2 }}>
            <label htmlFor="mail-host">Mail server address *</label>
            <input
              id="mail-host"
              value={form.smtp_host}
              onChange={e => set('smtp_host', e.target.value)}
              placeholder="e.g. smtp.gmail.com"
            />
          </div>
          <div className="cp-field">
            <label htmlFor="mail-user">Username *</label>
            <input
              id="mail-user"
              value={form.smtp_username}
              onChange={e => set('smtp_username', e.target.value)}
              placeholder="your@email.com"
              autoComplete="off"
            />
          </div>
          <div className="cp-field">
            <label htmlFor="mail-password">
              Password
              {hasPassword && <span style={{ color: '#166534', fontSize: 11, marginLeft: 8 }}>(saved)</span>}
            </label>
            <input
              id="mail-password"
              type="password"
              value={form.smtp_password}
              onChange={e => set('smtp_password', e.target.value)}
              placeholder={hasPassword ? 'Leave blank to keep existing' : 'Enter password'}
              autoComplete="new-password"
            />
          </div>
        </div>

        <details className="cp-advanced">
          <summary>Advanced: port {form.smtp_port || '587'}, {form.smtp_encryption}</summary>
          <div className="cp-field-row">
            <div className="cp-field">
              <label htmlFor="smtp-port">Port</label>
              <input
                id="smtp-port"
                type="number"
                value={form.smtp_port}
                onChange={e => set('smtp_port', e.target.value)}
                placeholder="587"
              />
            </div>
            <div className="cp-field">
              <label htmlFor="smtp-encryption">Encryption</label>
              <select id="smtp-encryption" value={form.smtp_encryption} onChange={e => set('smtp_encryption', e.target.value)}>
                {ENCRYPTION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
        </details>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <LoadingButton onClick={handleSave}>Save Settings</LoadingButton>
          <div className="cp-field" style={{ margin: '0 0 0 12px', flex: '1 1 220px', maxWidth: 360 }}>
            <label htmlFor="mail-test-to">Send a test to (save first)</label>
            <input
              id="mail-test-to"
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
        {saved && <div style={{ marginTop: 8, fontSize: 13, color: '#166534', fontWeight: 500 }}>Saved</div>}
        {saveError && <div style={{ marginTop: 8, fontSize: 13, color: '#B91C1C', fontWeight: 500 }}>{saveError}</div>}
        {testMsg && (
          <div style={{
            marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13,
            background: testMsg.type === 'success' ? '#F0FDF4' : '#FEF2F2',
            color:      testMsg.type === 'success' ? '#166534' : '#B91C1C',
            border: `1px solid ${testMsg.type === 'success' ? '#BBF7D0' : '#FECACA'}`,
          }}>
            {testMsg.text}
          </div>
        )}
      </div>

      <div className="cp-card">
        <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600, color: '#1A1A2E' }}>
          Email Delivery
        </h3>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: '#4B5563' }}>
          {outbox.counts.sent} sent · {outbox.counts.pending} retrying · <strong style={{ color: outbox.counts.failed ? '#B91C1C' : undefined }}>{outbox.counts.failed} failed</strong>
        </p>
        {resendMsg && (
          <div style={{ marginBottom: 12, fontSize: 13, color: resendMsg.type === 'success' ? '#166534' : '#B91C1C' }}>
            {resendMsg.text}
          </div>
        )}
        {outbox.emails.length === 0 ? (
          <div style={{ fontSize: 13, color: '#166534' }}>No failed or pending emails.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #E2E8F0' }}>
                <th style={{ padding: 8 }}>To</th><th style={{ padding: 8 }}>Email</th><th style={{ padding: 8 }}>Status</th><th style={{ padding: 8 }}>Last error</th><th style={{ padding: 8 }}></th>
              </tr>
            </thead>
            <tbody>
              {outbox.emails.map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                  <td style={{ padding: 8 }}>{e.to_email}</td>
                  <td style={{ padding: 8 }}>{e.subject}</td>
                  <td style={{ padding: 8, fontWeight: 600, color: e.status === 'failed' ? '#B91C1C' : '#B45309' }}>
                    {e.status === 'failed' ? `Failed (${e.attempts} tries)` : `Retrying (${e.attempts} so far)`}
                  </td>
                  <td style={{ padding: 8, color: '#4B5563', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.last_error || ''}>{e.last_error || '—'}</td>
                  <td style={{ padding: 8, whiteSpace: 'nowrap' }}>
                    <button className="cp-btn cp-btn-outline" style={{ padding: '4px 10px', fontSize: 12, marginRight: 6 }} onClick={() => viewEmail(e.id)}>View</button>
                    {e.status === 'failed' && !e.is_sensitive && (
                      <button className="cp-btn cp-btn-outline" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => handleResend(e.id)}>Resend</button>
                    )}
                    {e.status === 'failed' && !!e.is_sensitive && (
                      <span style={{ fontSize: 12, color: '#4B5563' }}>Person must request a new link</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </ReadOnlyUnless>
      {viewing && (
        <div className="cp-modal-overlay" onClick={() => setViewing(null)}>
          <div className="cp-modal" role="dialog" aria-label="Email" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="cp-modal-header"><span>{viewing.subject}</span><button className="cp-modal-close" onClick={() => setViewing(null)} aria-label="Close">✕</button></div>
            <div className="cp-modal-body" style={{ fontSize: 13 }}>
              <div style={{ color: '#4B5563', marginBottom: 10 }}>
                To {viewing.to_email} · {viewing.status === 'failed' ? 'Failed' : viewing.status === 'sent' ? 'Sent' : 'Waiting to send'} · queued {new Date(viewing.created_at).toISOString().replace('T', ' ').slice(0, 16)} UTC
              </div>
              {viewing.withheld ? (
                <div role="note" style={{ padding: '10px 14px', background: '#F0F9FF', border: '1px solid #BAE6FD', color: '#0369A1' }}>
                  Content withheld: this email carries a personal sign-in or reset link, which is never shown here.
                </div>
              ) : (
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0, padding: 12, background: '#F8FAFC', border: '1px solid #E2E8F0' }}>{viewing.text || '(no text)'}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
