import { useState, useEffect } from 'react'
import { guardedFetch } from '../utils/guardedFetch'
import { useAuth } from '../../../shared/context/AuthContext'
import { hasGlobalAdminScope } from '../../../shared/utils/adminScope.js'

// Sign-in & Security (L4, Rohith 2026-11-13): the one screen for sign-in.
// Platform rules (one value for everyone) are set by platform admins. Each client
// row (two-step, personal emails, company domains) is set by a platform admin, or
// by that client's own admin — who sees only their own row.

const RULE_FIELDS = [
  ['user_session_timeout_minutes', 'Idle timeout (minutes)', 30, 480],
  ['platform_admin_session_timeout_minutes', 'Platform admin idle timeout (minutes)', 30, 480],
  ['two_factor_remember_days', '"Remember this device" (days)', 1, 90],
  ['login_lockout_threshold', 'Lock after wrong passwords', 3, 20],
  ['login_lockout_minutes', 'Lock for (minutes)', 5, 1440],
]

export default function TwoFactorConfigView({ H, flash, apiBase = '/api/admin/two-factor' }) {
  const { user } = useAuth()
  const platform = hasGlobalAdminScope(user)
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [systemForm, setSystemForm] = useState({
    smtp_host: '', smtp_port: '587', smtp_encryption: 'STARTTLS', smtp_username: '',
    smtp_password: '', smtp_from_email: '', smtp_from_name: 'MIMS Platform',
  })
  const [savingSystemConfig, setSavingSystemConfig] = useState(false)
  const [testingSmtp, setTestingSmtp] = useState(false)
  const [sendingTestEmail, setSendingTestEmail] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [rules, setRules] = useState({})
  const [methods, setMethods] = useState(['email', 'totp'])
  const [pw, setPw] = useState({})
  const [clientForms, setClientForms] = useState({})
  const [saving, setSaving] = useState('')

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    try {
      const [orgRes, configRes, pwRes] = await Promise.all([
        guardedFetch(`${apiBase}/orgs`, { headers: H }),
        platform ? guardedFetch(`${apiBase}/config`, { headers: H }) : null,
        platform ? guardedFetch('/api/admin/system-params', { headers: H }) : null,
      ])
      const orgData = await orgRes.json()
      const cfg = configRes ? (await configRes.json()).config || {} : {}
      const pwData = pwRes ? await pwRes.json() : {}
      setOrgs(orgData.orgs || [])
      setSystemForm(f => ({
        ...f,
        smtp_host: cfg.smtp_host || '', smtp_port: cfg.smtp_port || '587',
        smtp_encryption: cfg.smtp_encryption || 'STARTTLS', smtp_username: cfg.smtp_username || '',
        smtp_password: '', smtp_from_email: cfg.smtp_from_email || '', smtp_from_name: cfg.smtp_from_name || 'MIMS Platform',
      }))
      setRules({
        user_session_timeout_minutes: cfg.user_session_timeout_minutes || 30,
        platform_admin_session_timeout_minutes: cfg.platform_admin_session_timeout_minutes || 60,
        two_factor_remember_days: cfg.two_factor_remember_days || 7,
        login_lockout_threshold: cfg.login_lockout_threshold || 5,
        login_lockout_minutes: cfg.login_lockout_minutes || 30,
      })
      setMethods(String(cfg.two_factor_methods || 'email,totp').split(',').filter(Boolean))
      setPw(pwData.general || {})
      setClientForms(Object.fromEntries((orgData.orgs || []).map(o => [o.id, {
        two_factor_enabled: !!Number(o.two_factor_enabled),
        allow_personal_emails: !!Number(o.allow_personal_emails),
        company_email_domains: (o.company_email_domains || []).join(', '),
      }])))
    } catch {
      flash('Could not load Sign-in & Security.', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function put(url, body, okText) {
    const res = await guardedFetch(url, { method: 'PUT', headers: H, body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { flash(data.error || 'Not saved.', 'error'); return false }
    flash(okText || data.message || 'Saved.')
    return true
  }

  async function saveRules() {
    if (!methods.length) return flash('Choose at least one two-step method.', 'error')
    setSaving('rules')
    try { await put(`${apiBase}/config`, { ...rules, two_factor_methods: methods.join(',') }, 'Platform sign-in rules saved.') }
    finally { setSaving('') }
  }

  async function savePasswordRules() {
    setSaving('pw')
    try {
      await put('/api/admin/system-params/general', {
        password_expiry_days: pw.password_expiry_days,
        password_history_count: pw.password_history_count,
        password_require_alphanumeric: !!pw.password_require_alphanumeric,
        password_require_special_chars: !!pw.password_require_special_chars,
      }, 'Password rules saved.')
    } finally { setSaving('') }
  }

  async function saveClient(org) {
    setSaving(`org-${org.id}`)
    try {
      if (await put(`${apiBase}/orgs/${org.id}`, clientForms[org.id])) load()
    } finally { setSaving('') }
  }

  const setClient = (id, patch) => setClientForms(p => ({ ...p, [id]: { ...p[id], ...patch } }))

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


  return (
    <>
      {platform && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-header"><h3>Platform sign-in rules</h3></div>
          <div className="card-body">
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              One value for every client. Clients cannot change these.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
              {RULE_FIELDS.map(([key, label, min, max]) => (
                <label key={key} style={{ fontSize: 12 }}>{label}
                  <input aria-label={label} className="form-control" type="number" min={min} max={max}
                    value={rules[key] ?? ''} onChange={e => setRules(r => ({ ...r, [key]: e.target.value }))} />
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12, fontSize: 13 }}>
              <strong style={{ fontSize: 12 }}>Two-step methods</strong>
              {[['email', 'Email code'], ['totp', 'Authenticator app']].map(([m, label]) => (
                <label key={m} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={methods.includes(m)}
                    onChange={e => setMethods(list => e.target.checked ? [...new Set([...list, m])] : list.filter(x => x !== m))} />
                  {label}
                </label>
              ))}
            </div>
            <button className="btn btn-primary" onClick={saveRules} disabled={saving === 'rules'}>
              {saving === 'rules' ? 'Saving…' : 'Save sign-in rules'}
            </button>
          </div>
        </div>
      )}

      {platform && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-header"><h3>Password rules</h3></div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
              <label style={{ fontSize: 12 }}>Password expires after (days)
                <input aria-label="Password expires after (days)" className="form-control" type="number" min={1} max={3650}
                  value={pw.password_expiry_days ?? ''} onChange={e => setPw(p => ({ ...p, password_expiry_days: e.target.value }))} />
              </label>
              <label style={{ fontSize: 12 }}>Cannot reuse the last (passwords)
                <input aria-label="Cannot reuse the last (passwords)" className="form-control" type="number" min={1} max={24}
                  value={pw.password_history_count ?? ''} onChange={e => setPw(p => ({ ...p, password_history_count: e.target.value }))} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 13 }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={!!pw.password_require_alphanumeric} onChange={e => setPw(p => ({ ...p, password_require_alphanumeric: e.target.checked }))} />
                Letters and numbers
              </label>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={!!pw.password_require_special_chars} onChange={e => setPw(p => ({ ...p, password_require_special_chars: e.target.checked }))} />
                A special character
              </label>
            </div>
            <button className="btn btn-primary" onClick={savePasswordRules} disabled={saving === 'pw'}>
              {saving === 'pw' ? 'Saving…' : 'Save password rules'}
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-header"><h3>{platform ? 'Clients' : 'Your organisation'}</h3></div>
        <div className="card-body" style={{ padding: 0 }}>
          {!platform && (
            <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
              Timeouts, two-step methods and password rules are set by the platform for every client.
            </div>
          )}
          {loading && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>}
          {!loading && (
            <table className="admin-table">
              <thead>
                <tr><th>Client</th><th>Two-step</th><th>Company login</th><th>Personal emails</th><th>Company email domains</th><th></th></tr>
              </thead>
              <tbody>
                {orgs.map(org => {
                  const f = clientForms[org.id] || {}
                  const sso = org.company_login || []
                  return (
                    <tr key={org.id}>
                      <td><strong>{org.name}</strong>{!Number(org.is_active) && <span style={{ color: 'var(--text-muted)' }}> (inactive)</span>}</td>
                      <td>
                        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                          <input type="checkbox" aria-label={`Two-step for ${org.name}`} checked={!!f.two_factor_enabled}
                            onChange={e => setClient(org.id, { two_factor_enabled: e.target.checked })} />
                          {f.two_factor_enabled ? 'On' : 'Off'}
                        </label>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {sso.length
                          ? sso.map(p => <div key={p.provider}>{p.provider === 'microsoft' ? 'Microsoft' : 'Google'}{p.domains.length ? ` — ${p.domains.join(', ')}` : ' — all emails'}</div>)
                          : <span style={{ color: 'var(--text-muted)' }}>Not set up</span>}
                        <div style={{ color: 'var(--text-muted)' }}>Set up in Company Login</div>
                      </td>
                      <td>
                        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                          <input type="checkbox" aria-label={`Personal emails for ${org.name}`} checked={!!f.allow_personal_emails}
                            onChange={e => setClient(org.id, { allow_personal_emails: e.target.checked })} />
                          {f.allow_personal_emails ? 'Allowed' : 'Not allowed'}
                        </label>
                      </td>
                      <td>
                        <input aria-label={`Company email domains for ${org.name}`} className="form-control" style={{ minWidth: 180 }}
                          placeholder="calder.com" value={f.company_email_domains || ''}
                          onChange={e => setClient(org.id, { company_email_domains: e.target.value })} />
                        {!f.company_email_domains && !sso.some(p => p.domains.length) && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>No domains: personal emails cannot be told apart.</div>
                        )}
                      </td>
                      <td>
                        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => saveClient(org)} disabled={saving === `org-${org.id}`}>
                          {saving === `org-${org.id}` ? 'Saving…' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {orgs.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No organisations found.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {platform && (
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-header"><h3>Platform mail for sign-in codes</h3></div>
        <div className="card-body">
          <form onSubmit={saveSystemConfig}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>SMTP Host *</label>
                <input aria-label="SMTP Host" className="form-control" value={systemForm.smtp_host} onChange={e => setSystemForm(f => ({ ...f, smtp_host: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>SMTP Port *</label>
                <input aria-label="SMTP Port" className="form-control" value={systemForm.smtp_port} onChange={e => setSystemForm(f => ({ ...f, smtp_port: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Encryption *</label>
                <select aria-label="Encryption" className="form-control" value={systemForm.smtp_encryption} onChange={e => setSystemForm(f => ({ ...f, smtp_encryption: e.target.value }))}>
                  <option value="STARTTLS">STARTTLS</option>
                  <option value="SSL/TLS">SSL/TLS</option>
                  <option value="None">None</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>SMTP Username *</label>
                <input aria-label="SMTP Username" className="form-control" value={systemForm.smtp_username} onChange={e => setSystemForm(f => ({ ...f, smtp_username: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>SMTP Password *</label>
                <input aria-label="SMTP Password" className="form-control" type="password" value={systemForm.smtp_password} onChange={e => setSystemForm(f => ({ ...f, smtp_password: e.target.value }))} placeholder="Leave blank to keep current" />
              </div>
              <div>
                <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>From Email *</label>
                <input aria-label="From Email" className="form-control" value={systemForm.smtp_from_email} onChange={e => setSystemForm(f => ({ ...f, smtp_from_email: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>From Name</label>
                <input aria-label="From Name" className="form-control" value={systemForm.smtp_from_name} onChange={e => setSystemForm(f => ({ ...f, smtp_from_name: e.target.value }))} />
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
      )}

    </>
  )
}
