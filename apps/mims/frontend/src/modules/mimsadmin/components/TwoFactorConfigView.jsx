import { useState, useEffect } from 'react'
import { guardedFetch } from '../utils/guardedFetch'

export default function TwoFactorConfigView({ H, flash, apiBase = '/api/admin/two-factor', showSessionTimeout = true }) {
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [systemForm, setSystemForm] = useState({
    smtp_host: '',
    smtp_port: '587',
    smtp_encryption: 'STARTTLS',
    smtp_username: '',
    smtp_password: '',
    smtp_from_email: '',
    smtp_from_name: 'MIMS Platform',
  })
  const [savingSystemConfig, setSavingSystemConfig] = useState(false)
  const [testingSmtp, setTestingSmtp] = useState(false)
  const [sendingTestEmail, setSendingTestEmail] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [orgSecurityForms, setOrgSecurityForms] = useState({})
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(60)
  const [savingSessionTimeout, setSavingSessionTimeout] = useState(false)

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    try {
      const [orgRes, configRes] = await Promise.all([
        guardedFetch(`${apiBase}/orgs`, { headers: H }),
        guardedFetch(`${apiBase}/config`, { headers: H }),
      ])
      const orgData = await orgRes.json()
      const configData = await configRes.json()
      setOrgs(orgData.orgs || [])
      setSystemForm(f => ({
        ...f,
        smtp_host: configData.config?.smtp_host || '',
        smtp_port: configData.config?.smtp_port || '587',
        smtp_encryption: configData.config?.smtp_encryption || 'STARTTLS',
        smtp_username: configData.config?.smtp_username || '',
        smtp_password: '',
        smtp_from_email: configData.config?.smtp_from_email || '',
        smtp_from_name: configData.config?.smtp_from_name || 'MIMS Platform',
      }))
      setSessionTimeoutMinutes(Number(configData.config?.platform_admin_session_timeout_minutes) || 60)
      setOrgSecurityForms(
        (orgData.orgs || []).reduce((acc, org) => {
          acc[org.id] = {
            two_factor_enabled: !!org.two_factor_enabled,
            methods: String(org.two_factor_methods || 'email,totp').split(',').filter(Boolean),
            remember_days: org.two_factor_remember_days || 7,
          }
          return acc
        }, {})
      )
    } catch {
      flash('Failed to load 2FA configuration.', 'error')
    } finally {
      setLoading(false)
    }
  }

  function updateOrgSecurityForm(orgId, patch) {
    setOrgSecurityForms(prev => ({
      ...prev,
      [orgId]: { ...(prev[orgId] || { two_factor_enabled: false, methods: ['email', 'totp'], remember_days: 7 }), ...patch },
    }))
  }

  async function saveSystemConfig(e) {
    e.preventDefault()
    setSavingSystemConfig(true)
    try {
      const payload = { ...systemForm }
      if (!payload.smtp_password) delete payload.smtp_password
      const res = await guardedFetch(`${apiBase}/config`, {
        method: 'PUT',
        headers: H,
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) return flash(data.error || 'Failed to save platform SMTP config.', 'error')
      flash('Platform SMTP configuration saved.')
      setSystemForm(f => ({ ...f, smtp_password: '' }))
    } catch {
      flash('Failed to save platform SMTP config.', 'error')
    } finally {
      setSavingSystemConfig(false)
    }
  }

  async function testSmtp(mode) {
    if (mode === 'send' && !testEmail.trim()) {
      return flash('Recipient email is required for test email.', 'error')
    }
    if (mode === 'send') setSendingTestEmail(true)
    else setTestingSmtp(true)
    try {
      const payload = {
        ...systemForm,
        mode,
        test_email: mode === 'send' ? testEmail.trim() : undefined,
      }
      if (!payload.smtp_password) delete payload.smtp_password
      const res = await guardedFetch(`${apiBase}/config/test-email`, {
        method: 'POST',
        headers: H,
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) return flash(data.error || 'SMTP test failed.', 'error')
      flash(data.message || (mode === 'send' ? 'Test email sent.' : 'SMTP connection verified.'))
    } catch {
      flash(mode === 'send' ? 'Failed to send test email.' : 'Failed to test SMTP connection.', 'error')
    } finally {
      if (mode === 'send') setSendingTestEmail(false)
      else setTestingSmtp(false)
    }
  }

  async function saveSessionTimeout() {
    const mins = Number(sessionTimeoutMinutes)
    if (isNaN(mins) || mins < 15 || mins > 480) return flash('Session timeout must be between 15 and 480 minutes.', 'error')
    setSavingSessionTimeout(true)
    try {
      const res = await guardedFetch(`${apiBase}/config`, {
        method: 'PUT',
        headers: H,
        body: JSON.stringify({ platform_admin_session_timeout_minutes: mins }),
      })
      const data = await res.json()
      if (!res.ok) return flash(data.error || 'Failed to save session timeout.', 'error')
      flash(`Platform admin session timeout set to ${mins} minutes.`)
    } catch {
      flash('Failed to save session timeout.', 'error')
    } finally {
      setSavingSessionTimeout(false)
    }
  }

  async function saveOrgSecurity(org) {
    const form = orgSecurityForms[org.id] || { two_factor_enabled: false, methods: ['email', 'totp'], remember_days: 7 }
    const res = await guardedFetch(`${apiBase}/orgs/${org.id}`, {
      method: 'PUT',
      headers: H,
      body: JSON.stringify({
        name: org.name,
        is_active: org.is_active,
        session_timeout_minutes: org.session_timeout_minutes || 30,
        two_factor_enabled: form.two_factor_enabled,
        two_factor_methods: form.methods.join(','),
        two_factor_remember_days: form.remember_days,
      }),
    })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to save org 2FA settings.', 'error')
    flash(`2FA settings updated for ${org.name}.`)
    load()
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-header"><h3>Platform SMTP for User 2FA Emails</h3></div>
        <div className="card-body">
          <form onSubmit={saveSystemConfig}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>SMTP Host *</label>
                <input className="form-control" value={systemForm.smtp_host} onChange={e => setSystemForm(f => ({ ...f, smtp_host: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>SMTP Port *</label>
                <input className="form-control" value={systemForm.smtp_port} onChange={e => setSystemForm(f => ({ ...f, smtp_port: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Encryption *</label>
                <select className="form-control" value={systemForm.smtp_encryption} onChange={e => setSystemForm(f => ({ ...f, smtp_encryption: e.target.value }))}>
                  <option value="STARTTLS">STARTTLS</option>
                  <option value="SSL/TLS">SSL/TLS</option>
                  <option value="None">None</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>SMTP Username *</label>
                <input className="form-control" value={systemForm.smtp_username} onChange={e => setSystemForm(f => ({ ...f, smtp_username: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>SMTP Password *</label>
                <input className="form-control" type="password" value={systemForm.smtp_password} onChange={e => setSystemForm(f => ({ ...f, smtp_password: e.target.value }))} placeholder="Leave blank to keep current" />
              </div>
              <div>
                <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>From Email *</label>
                <input className="form-control" value={systemForm.smtp_from_email} onChange={e => setSystemForm(f => ({ ...f, smtp_from_email: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>From Name</label>
                <input className="form-control" value={systemForm.smtp_from_name} onChange={e => setSystemForm(f => ({ ...f, smtp_from_name: e.target.value }))} />
              </div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={savingSystemConfig}>
              {savingSystemConfig ? 'Saving…' : 'Save SMTP Configuration'}
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              style={{ marginLeft: 8 }}
              onClick={() => testSmtp('verify')}
              disabled={testingSmtp || sendingTestEmail}
            >
              {testingSmtp ? 'Testing SMTP…' : 'Test SMTP Connection'}
            </button>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
              <input
                className="form-control"
                style={{ maxWidth: 320 }}
                type="email"
                placeholder="Recipient email for test mail"
                value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
              />
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => testSmtp('send')}
                disabled={testingSmtp || sendingTestEmail}
              >
                {sendingTestEmail ? 'Sending Test Email…' : 'Send Test Email'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {showSessionTimeout && (
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-header"><h3>Platform Admin Session Timeout</h3></div>
        <div className="card-body">
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Set how long a platform admin session stays active before automatic logout (15–480 minutes).
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Timeout (minutes)</label>
              <input
                className="form-control"
                type="number"
                min={15}
                max={480}
                style={{ width: 140 }}
                value={sessionTimeoutMinutes}
                onChange={e => setSessionTimeoutMinutes(e.target.value)}
              />
            </div>
            <button
              className="btn btn-primary"
              style={{ fontSize: 12 }}
              onClick={saveSessionTimeout}
              disabled={savingSessionTimeout}
            >
              {savingSessionTimeout ? 'Saving…' : 'Save Timeout'}
            </button>
          </div>
        </div>
      </div>
      )}

      <div className="card">
        <div className="card-header"><h3>Organisation 2FA Settings</h3></div>
        <div className="card-body" style={{ padding: 0 }}>
          {loading && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>}
          {!loading && (
            <table className="admin-table">
              <thead>
                <tr><th>Organisation</th><th>2FA</th><th>Methods</th><th>Remember Device</th><th></th></tr>
              </thead>
              <tbody>
                {orgs.map(org => (
                  <tr key={org.id}>
                    <td><strong>{org.name}</strong></td>
                    <td>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={!!orgSecurityForms[org.id]?.two_factor_enabled}
                          onChange={e => updateOrgSecurityForm(org.id, { two_factor_enabled: e.target.checked })}
                        />
                        Enable
                      </label>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                          <input
                            type="checkbox"
                            checked={(orgSecurityForms[org.id]?.methods || []).includes('email')}
                            onChange={e => updateOrgSecurityForm(org.id, {
                              methods: e.target.checked
                                ? Array.from(new Set([...(orgSecurityForms[org.id]?.methods || []), 'email']))
                                : (orgSecurityForms[org.id]?.methods || []).filter(m => m !== 'email'),
                            })}
                          />
                          Email OTP
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                          <input
                            type="checkbox"
                            checked={(orgSecurityForms[org.id]?.methods || []).includes('totp')}
                            onChange={e => updateOrgSecurityForm(org.id, {
                              methods: e.target.checked
                                ? Array.from(new Set([...(orgSecurityForms[org.id]?.methods || []), 'totp']))
                                : (orgSecurityForms[org.id]?.methods || []).filter(m => m !== 'totp'),
                            })}
                          />
                          Authenticator App
                        </label>
                      </div>
                    </td>
                    <td>
                      <input
                        className="form-control"
                        style={{ width: 100 }}
                        type="number"
                        min={1}
                        value={orgSecurityForms[org.id]?.remember_days || 7}
                        onChange={e => updateOrgSecurityForm(org.id, { remember_days: Number(e.target.value) || 7 })}
                      />
                    </td>
                    <td>
                      <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => saveOrgSecurity(org)}>
                        Save
                      </button>
                    </td>
                  </tr>
                ))}
                {orgs.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No organisations found.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}
