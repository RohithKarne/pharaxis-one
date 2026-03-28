import { useState, useEffect, useCallback } from 'react'
import Sidebar from '../components/Sidebar'
import Topbar from '../../../shared/components/Topbar'
import { useAuth } from '../../../shared/context/AuthContext'

const MODULES = [
  { key: 'mims_core', label: 'MIMS' },
  { key: 'admin_console', label: 'Admin Console' },
  { key: 'content_mgmt', label: 'Content Management' },
  { key: 'data_visualization', label: 'Data Visualization' },
]

const PAGE_TITLES = {
  'organizations': 'Organisations & Sites',
  '2fa-config':    '2FA Configuration',
  'users':         'User Management',
  'module-access': 'Module Access',
  'audit':         'Audit Trail',
  'login-audit':   'Login Audit',
}

export default function SuperadminPage() {
  const [activePage, setActivePage] = useState('organizations')
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem('mims_sidebar_collapsed') === 'true'
  )
  const [theme, setThemeState] = useState(() =>
    localStorage.getItem('mims_theme') || 'light'
  )
  const [msg, setMsg] = useState({ text: '', type: '' })

  const { token } = useAuth()
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('mims_theme', theme)
  }, [theme])

  function flash(text, type = 'success') {
    setMsg({ text, type })
    setTimeout(() => setMsg({ text: '', type: '' }), 4000)
  }

  function toggleSidebar() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('mims_sidebar_collapsed', next)
  }

  return (
    <div className="app-wrapper">
      <Sidebar
        collapsed={collapsed}
        onCollapse={toggleSidebar}
        theme={theme}
        setTheme={setThemeState}
        activePage={activePage}
        onNavigate={setActivePage}
      />
      <div className="main-content">
        <Topbar title={`Superadmin Console — ${PAGE_TITLES[activePage]}`} onToggleSidebar={toggleSidebar} />
        <main className="page-content">
          {msg.text && (
            <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`} style={{ display: 'block', marginBottom: 12 }}>
              {msg.text}
            </div>
          )}
          {activePage === 'organizations' && <OrganisationsView H={H} flash={flash} />}
          {activePage === '2fa-config'    && <TwoFactorConfigView H={H} flash={flash} />}
          {activePage === 'users'         && <UsersView H={H} flash={flash} />}
          {activePage === 'module-access' && <ModuleAccessView H={H} flash={flash} />}
          {activePage === 'audit'         && <AuditView H={H} endpoint="/api/superadmin/audit" />}
          {activePage === 'login-audit'   && <LoginAuditView H={H} />}
        </main>
      </div>
    </div>
  )
}

/* ── Organisations View ─────────────────────────────────────────────────── */
function OrganisationsView({ H, flash }) {
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [showOrgForm, setShowOrgForm] = useState(false)
  const [orgForm, setOrgForm] = useState({ name: '' })
  const [editingOrg, setEditingOrg] = useState(null)
  const [editOrgName, setEditOrgName] = useState('')
  const [showSiteForm, setShowSiteForm] = useState(null) // org_id or null
  const [siteForm, setSiteForm] = useState({ name: '', country: '', is_primary: false })
  const [editingTimeout, setEditingTimeout] = useState(null) // org_id or null
  const [timeoutValue, setTimeoutValue]     = useState(30)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/superadmin/orgs', { headers: H })
      const data = await res.json()
      setOrgs(data.orgs || [])
    } catch { flash('Failed to load organisations.', 'error') }
    finally { setLoading(false) }
  }

  async function createOrg(e) {
    e.preventDefault()
    if (!orgForm.name.trim()) return flash('Organisation name is required.', 'error')
    const res = await fetch('/api/superadmin/orgs', { method: 'POST', headers: H, body: JSON.stringify(orgForm) })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to create.', 'error')
    flash('Organisation created.')
    setShowOrgForm(false)
    setOrgForm({ name: '' })
    load()
  }

  async function saveOrgEdit() {
    if (!editingOrg || !editOrgName.trim()) return flash('Organisation name is required.', 'error')
    const res = await fetch(`/api/superadmin/orgs/${editingOrg.id}`, {
      method: 'PUT',
      headers: H,
      body: JSON.stringify({
        name: editOrgName.trim(),
        is_active: editingOrg.is_active,
        session_timeout_minutes: editingOrg.session_timeout_minutes || 30,
      })
    })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to update organisation.', 'error')
    flash('Organisation updated.')
    setEditingOrg(null)
    setEditOrgName('')
    load()
  }

  async function toggleOrg(org) {
    const res = await fetch(`/api/superadmin/orgs/${org.id}`, {
      method: 'PUT', headers: H,
      body: JSON.stringify({ name: org.name, is_active: org.is_active ? 0 : 1 })
    })
    if (!res.ok) return flash('Failed to update.', 'error')
    flash(`Organisation ${org.is_active ? 'deactivated' : 'activated'}.`)
    load()
  }

  async function toggleSite(site) {
    const res = await fetch(`/api/superadmin/sites/${site.id}`, {
      method: 'PUT', headers: H,
      body: JSON.stringify({ name: site.name, country: site.country, is_primary: site.is_primary, is_active: site.is_active ? 0 : 1 })
    })
    if (!res.ok) return flash('Failed to update site.', 'error')
    flash(`Site "${site.name}" ${site.is_active ? 'deactivated' : 'activated'}.`)
    load()
  }

  async function createSite(e) {
    e.preventDefault()
    if (!siteForm.name.trim()) return flash('Site name is required.', 'error')
    const res = await fetch(`/api/superadmin/orgs/${showSiteForm}/sites`, {
      method: 'POST', headers: H, body: JSON.stringify(siteForm)
    })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to create site.', 'error')
    flash('Site created.')
    setShowSiteForm(null)
    setSiteForm({ name: '', country: '', is_primary: false })
    load()
  }

  async function saveTimeout(org) {
    const mins = parseInt(timeoutValue)
    if (isNaN(mins) || mins < 30) return flash('Minimum session timeout is 30 minutes.', 'error')
    const res = await fetch(`/api/superadmin/orgs/${org.id}`, {
      method: 'PUT', headers: H,
      body: JSON.stringify({ name: org.name, is_active: org.is_active, session_timeout_minutes: mins })
    })
    if (!res.ok) return flash('Failed to update timeout.', 'error')
    flash(`Session timeout updated to ${mins} minutes for ${org.name}.`)
    setEditingTimeout(null)
    load()
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Organisations & Sites</h3>
          <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setShowOrgForm(v => !v)}>
            + New Organisation
          </button>
        </div>
        {showOrgForm && (
          <div className="card-body" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
            <form onSubmit={createOrg} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div>
                <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Organisation Name *</label>
                <input className="form-control" style={{ fontSize: 13 }} value={orgForm.name}
                  onChange={e => setOrgForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Pfizer India" />
              </div>
              <button className="btn btn-primary" type="submit" style={{ fontSize: 12 }}>Create</button>
              <button className="btn btn-secondary" type="button" style={{ fontSize: 12 }} onClick={() => setShowOrgForm(false)}>Cancel</button>
            </form>
          </div>
        )}
      </div>

      {loading && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>}
      {!loading && orgs.map(org => (
        <div key={org.id} className="card" style={{ marginBottom: 8 }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            onClick={() => setExpanded(e => e === org.id ? null : org.id)}>
            <div>
              <strong style={{ fontSize: 14 }}>{org.name}</strong>
              <span style={{ fontSize: 11, marginLeft: 10, color: 'var(--text-muted)' }}>
                {(org.sites || []).length} site{(org.sites || []).length !== 1 ? 's' : ''}
              </span>
              <span style={{
                fontSize: 11, marginLeft: 8, padding: '1px 7px', borderRadius: 10,
                background: org.is_active ? '#d4edda' : '#f8d7da',
                color: org.is_active ? '#155724' : '#721c24',
              }}>{org.is_active ? 'Active' : 'Inactive'}</span>
              <span style={{ fontSize: 11, marginLeft: 8, color: 'var(--text-muted)' }}>
                ⏱ {org.session_timeout_minutes || 30} min timeout
              </span>
              <span style={{ fontSize: 11, marginLeft: 8, color: org.two_factor_enabled ? '#155724' : 'var(--text-muted)' }}>
                🔐 2FA {org.two_factor_enabled ? 'On' : 'Off'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                className="btn btn-outline"
                style={{ fontSize: 11, padding: '3px 10px' }}
                onClick={e => {
                  e.stopPropagation()
                  setEditingOrg(org)
                  setEditOrgName(org.name)
                }}
              >
                Edit
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{org.is_active ? 'Active' : 'Inactive'}</span>
              <div
                onClick={e => { e.stopPropagation(); toggleOrg(org) }}
                style={{
                  width: 36, height: 20, borderRadius: 10, cursor: 'pointer',
                  background: org.is_active ? '#28a745' : '#ccc',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0
                }}>
                <div style={{
                  width: 14, height: 14, borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: 3,
                  left: org.is_active ? 19 : 3,
                  transition: 'left 0.2s'
                }} />
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{expanded === org.id ? '▲' : '▼'}</span>
            </div>
          </div>
          {expanded === org.id && (
            <div className="card-body" style={{ paddingTop: 8 }}>
              <table className="admin-table" style={{ marginBottom: 8 }}>
                <thead>
                  <tr><th>Site</th><th>Country</th><th>Primary</th><th>Status</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {(org.sites || []).length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No sites yet.</td></tr>
                  )}
                  {(org.sites || []).map(s => (
                    <tr key={s.id}>
                      <td style={{ fontSize: 13 }}>{s.name}</td>
                      <td style={{ fontSize: 12 }}>{s.country || '—'}</td>
                      <td style={{ fontSize: 12 }}>{s.is_primary ? 'Yes' : 'No'}</td>
                      <td><span style={{
                        fontSize: 11, padding: '1px 7px', borderRadius: 10,
                        background: s.is_active ? '#d4edda' : '#f8d7da',
                        color: s.is_active ? '#155724' : '#721c24',
                      }}>{s.is_active ? 'Active' : 'Inactive'}</span></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.is_active ? 'Active' : 'Inactive'}</span>
                          <div onClick={() => toggleSite(s)} style={{
                            width: 36, height: 20, borderRadius: 10, cursor: 'pointer',
                            background: s.is_active ? '#28a745' : '#ccc',
                            position: 'relative', transition: 'background 0.2s', flexShrink: 0
                          }}>
                            <div style={{
                              width: 14, height: 14, borderRadius: '50%', background: '#fff',
                              position: 'absolute', top: 3,
                              left: s.is_active ? 19 : 3,
                              transition: 'left 0.2s'
                            }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Session Timeout:</span>
                {editingTimeout === org.id ? (
                  <>
                    <select className="form-control" style={{ fontSize: 12, width: 'auto' }}
                      value={timeoutValue} onChange={e => setTimeoutValue(e.target.value)}>
                      <option value={30}>30 minutes</option>
                      <option value={45}>45 minutes</option>
                      <option value={60}>60 minutes</option>
                      <option value={90}>90 minutes</option>
                      <option value={120}>120 minutes</option>
                    </select>
                    <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => saveTimeout(org)}>Save</button>
                    <button className="btn btn-secondary" style={{ fontSize: 11 }} onClick={() => setEditingTimeout(null)}>Cancel</button>
                  </>
                ) : (
                  <button className="btn btn-secondary" style={{ fontSize: 11 }}
                    onClick={() => { setEditingTimeout(org.id); setTimeoutValue(org.session_timeout_minutes || 30) }}>
                    Edit Timeout
                  </button>
                )}
              </div>

              {showSiteForm === org.id ? (
                <form onSubmit={createSite} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div>
                    <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Site Name *</label>
                    <input className="form-control" style={{ fontSize: 13 }} value={siteForm.name}
                      onChange={e => setSiteForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Mumbai HQ" />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Country</label>
                    <input className="form-control" style={{ fontSize: 13 }} value={siteForm.country}
                      onChange={e => setSiteForm(f => ({ ...f, country: e.target.value }))} placeholder="India" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 2 }}>
                    <input type="checkbox" id={`primary-${org.id}`} checked={siteForm.is_primary}
                      onChange={e => setSiteForm(f => ({ ...f, is_primary: e.target.checked }))} />
                    <label htmlFor={`primary-${org.id}`} style={{ fontSize: 12 }}>Primary site</label>
                  </div>
                  <button className="btn btn-primary" type="submit" style={{ fontSize: 12 }}>Add Site</button>
                  <button className="btn btn-secondary" type="button" style={{ fontSize: 12 }}
                    onClick={() => { setShowSiteForm(null); setSiteForm({ name: '', country: '', is_primary: false }) }}>Cancel</button>
                </form>
              ) : (
                <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setShowSiteForm(org.id)}>
                  + Add Site
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {editingOrg && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 24
        }}>
          <div style={{
            width: '100%', maxWidth: 420, background: '#fff', borderRadius: 12,
            border: '1px solid #ddd', padding: 20, boxShadow: '0 10px 30px rgba(0,0,0,0.15)'
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Edit Organisation</div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>
              Update organisation name. Status, timeout, 2FA, and sites remain in their own controls.
            </div>
            <div className="form-group">
              <label>Organisation Name</label>
              <input
                className="form-control"
                value={editOrgName}
                onChange={e => setEditOrgName(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary" type="button" onClick={saveOrgEdit}>Save</button>
              <button className="btn btn-secondary" type="button" onClick={() => { setEditingOrg(null); setEditOrgName('') }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ── 2FA Configuration View ─────────────────────────────────────────────── */
function TwoFactorConfigView({ H, flash }) {
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

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [orgRes, configRes] = await Promise.all([
        fetch('/api/superadmin/orgs', { headers: H }),
        fetch('/api/superadmin/config', { headers: H }),
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
      const res = await fetch('/api/superadmin/config', {
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
      const res = await fetch('/api/superadmin/config/test-email', {
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

  async function saveOrgSecurity(org) {
    const form = orgSecurityForms[org.id] || { two_factor_enabled: false, methods: ['email', 'totp'], remember_days: 7 }
    const res = await fetch(`/api/superadmin/orgs/${org.id}`, {
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

/* ── Users View ─────────────────────────────────────────────────────────── */
function UsersView({ H, flash }) {
  const [users, setUsers]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState({ name: '', email: '', role: 'agent' })
  const [creating, setCreating]   = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', email: '', role: 'agent', is_active: true })

  // Org Assignment Panel state
  const [assignTarget, setAssignTarget]   = useState(null) // user object
  const [assignTab, setAssignTab]         = useState('org')
  const [allOrgsWithSites, setAllOrgsWithSites] = useState([])
  const [orgAccess, setOrgAccess]         = useState([]) // current assignments for this user
  const [assignLoading, setAssignLoading] = useState(false)
  const [assignSaving, setAssignSaving]   = useState(false)

  // Org tab — selected orgs (multi-select)
  const [selectedOrgIds, setSelectedOrgIds] = useState(new Set())
  // Site tab — selected primary site per org
  const [selectedSites, setSelectedSites]   = useState({}) // { orgId: siteId }
  // Role tab — module access (global per user, not per org)
  const [selectedModules, setSelectedModules] = useState(new Set())

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/superadmin/all-users', { headers: H })
      const d = await res.json()
      setUsers(d.users || [])
    } catch { flash('Failed to load users.', 'error') }
    finally { setLoading(false) }
  }

  async function createUser(e) {
    e.preventDefault()
    setCreating(true)
    try {
      const res = await fetch('/api/superadmin/users/create', { method: 'POST', headers: H, body: JSON.stringify(form) })
      const d = await res.json()
      if (!res.ok) return flash(d.error || 'Failed to create user.', 'error')
      flash(`User created. Default password: Manager@123 (reset required on first login).`, 'success')
      setShowForm(false)
      setForm({ name: '', email: '', role: 'agent' })
      load()
    } catch { flash('Create failed.', 'error') }
    finally { setCreating(false) }
  }

  async function saveUserEdit() {
    if (!editingUser) return
    const res = await fetch(`/api/superadmin/users/${editingUser.id}`, {
      method: 'PUT',
      headers: H,
      body: JSON.stringify({
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        role: editForm.role,
        is_active: editForm.is_active,
      }),
    })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to update user.', 'error')
    flash('User updated.')
    setEditingUser(null)
    setEditForm({ name: '', email: '', role: 'agent', is_active: true })
    load()
  }

  async function openAssignPanel(user) {
    setAssignTarget(user)
    setAssignTab('org')
    setAssignLoading(true)
    try {
      const [accessRes, orgsRes] = await Promise.all([
        fetch(`/api/superadmin/users/${user.id}/org-access`, { headers: H }),
        fetch('/api/superadmin/orgs-for-assignment', { headers: H }),
      ])
      const accessData = await accessRes.json()
      const orgsData   = await orgsRes.json()
      const access = accessData.orgAccess || []
      const orgsAll = orgsData.orgs || []
      setOrgAccess(access)
      setAllOrgsWithSites(orgsAll)

      // Pre-populate selections from existing assignments
      const orgIds = new Set(access.map(a => a.org_id))
      const sites  = {}
      access.forEach(a => { sites[a.org_id] = a.primary_site_id || '' })
      // Modules are global per user — take from first row that has them
      const modRow = access.find(a => Array.isArray(a.modules) && a.modules.length > 0)
      const mods   = new Set(modRow ? modRow.modules : [])
      setSelectedOrgIds(orgIds)
      setSelectedSites(sites)
      setSelectedModules(mods)
    } catch { flash('Failed to load org access.', 'error') }
    finally { setAssignLoading(false) }
  }

  function toggleOrg(orgId) {
    setSelectedOrgIds(prev => {
      const next = new Set(prev)
      if (next.has(orgId)) {
        next.delete(orgId)
        // clear site/module selection for removed org
        setSelectedSites(s => { const n = { ...s }; delete n[orgId]; return n })
        setSelectedModules(m => { const n = { ...m }; delete n[orgId]; return n })
      } else {
        next.add(orgId)
      }
      return next
    })
  }

  function toggleModule(mod) {
    setSelectedModules(prev => {
      const next = new Set(prev)
      if (next.has(mod)) next.delete(mod)
      else next.add(mod)
      return next
    })
  }

  async function saveAssignments() {
    if (!assignTarget) return
    setAssignSaving(true)
    try {
      const userId         = assignTarget.id
      const existingOrgIds = new Set(orgAccess.map(a => a.org_id))
      const newOrgIds      = selectedOrgIds

      // Remove deselected orgs
      for (const oa of orgAccess) {
        if (!newOrgIds.has(oa.org_id)) {
          await fetch(`/api/superadmin/users/${userId}/org-access/${oa.org_id}`, { method: 'DELETE', headers: H })
        }
      }

      // Add/update org assignments (site only — modules handled separately)
      for (const orgId of newOrgIds) {
        const siteId = selectedSites[orgId] || null
        if (!existingOrgIds.has(orgId)) {
          await fetch(`/api/superadmin/users/${userId}/org-access`, {
            method: 'POST', headers: H,
            body: JSON.stringify({ org_id: orgId, primary_site_id: siteId }),
          })
        } else {
          await fetch(`/api/superadmin/users/${userId}/org-access/${orgId}`, {
            method: 'PUT', headers: H,
            body: JSON.stringify({ primary_site_id: siteId }),
          })
        }
      }

      // Save module access globally for this user
      const modules = Array.from(selectedModules)
      await fetch(`/api/superadmin/users/${userId}/modules`, {
        method: 'PUT', headers: H,
        body: JSON.stringify({ modules }),
      })

      flash('Assignments saved successfully.', 'success')
      setAssignTarget(null)
      load()
    } catch { flash('Save failed.', 'error') }
    finally { setAssignSaving(false) }
  }

  async function resetUserTwoFactor(user) {
    const res = await fetch(`/api/superadmin/users/${user.id}/reset-2fa`, {
      method: 'POST',
      headers: H,
    })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to reset 2FA.', 'error')
    flash(`2FA reset for ${user.name}.`)
    load()
  }

  const ASSIGN_TABS = [
    { key: 'org',  label: 'Org'  },
    { key: 'site', label: 'Site' },
    { key: 'role', label: 'Role' },
  ]

  return (
    <>
      {/* ── New User Form ── */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>User Management</h3>
          <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => { setShowForm(v => !v); setAssignTarget(null) }}>
            + New User
          </button>
        </div>
        {showForm && (
          <div className="card-body" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, padding: '6px 10px', background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 6 }}>
              Default password <strong>Manager@123</strong> will be auto-assigned. User will be prompted to reset on first login.
            </div>
            <form onSubmit={createUser} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Username *</label>
                <input className="form-control" type="text" placeholder="Full name" required
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Email ID *</label>
                <input className="form-control" type="email" placeholder="user@company.com" required
                  value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Default Password</label>
                <input className="form-control" type="text" value="Manager@123" readOnly
                  style={{ background: 'var(--bg)', color: 'var(--text-muted)', cursor: 'default', minWidth: 130 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Role</label>
                <select className="form-control" value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="agent">Agent</option>
                  <option value="reviewer">Reviewer</option>
                  <option value="content_manager">Content Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" type="submit" disabled={creating} style={{ fontSize: 12 }}>
                  {creating ? 'Creating…' : 'Create User'}
                </button>
                <button className="btn btn-secondary" type="button" style={{ fontSize: 12 }} onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* ── User List ── */}
      <div className="card" style={{ marginBottom: assignTarget ? 12 : 0 }}>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>2FA</th><th>Org Assignments</th><th></th></tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>Loading…</td></tr>}
              {!loading && users.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No users found.</td></tr>}
              {users.map(u => (
                <tr key={u.id} style={{ background: assignTarget?.id === u.id ? 'var(--primary-light, #e8f0fe)' : undefined }}>
                  <td>
                    <strong style={{ fontSize: 13, color: assignTarget?.id === u.id ? 'var(--primary)' : undefined }}>{u.name}</strong>
                    {u.password_reset_required ? <span style={{ marginLeft: 6, fontSize: 10, background: '#fff3cd', color: '#856404', padding: '1px 6px', borderRadius: 10 }}>Reset Pending</span> : null}
                  </td>
                  <td style={{ fontSize: 12 }}>{u.email}</td>
                  <td><span className="badge">{u.role}</span></td>
                  <td>
                    <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, background: u.is_active ? '#d4edda' : '#f8d7da', color: u.is_active ? '#155724' : '#721c24' }}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    <span style={{
                      fontSize: 11, padding: '1px 7px', borderRadius: 10,
                      background: u.two_factor_enabled ? '#d1ecf1' : '#f1f3f5',
                      color: u.two_factor_enabled ? '#0c5460' : '#6c757d',
                    }}>
                      {u.two_factor_enabled ? (u.two_factor_locked ? 'Locked' : 'Enabled') : 'Not Enrolled'}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {u.org_name ? <span style={{ color: 'var(--text-primary)' }}>{u.org_name}</span> : <span>No org assigned</span>}
                  </td>
                  <td>
                    {u.role !== 'superadmin' && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 10px' }}
                          onClick={() => {
                            if (assignTarget?.id === u.id) { setAssignTarget(null); return }
                            openAssignPanel(u)
                            setShowForm(false)
                          }}>
                          {assignTarget?.id === u.id ? '✕ Close' : 'Assign Org'}
                        </button>
                        <button
                          className="btn btn-outline"
                          style={{ fontSize: 11, padding: '3px 10px' }}
                          onClick={() => {
                            setEditingUser(u)
                            setEditForm({
                              name: u.name || '',
                              email: u.email || '',
                              role: u.role || 'agent',
                              is_active: !!u.is_active,
                            })
                            setShowForm(false)
                          }}
                        >
                          Edit
                        </button>
                        <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => resetUserTwoFactor(u)}>
                          Reset 2FA
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Org Assignment Panel ── */}
      {assignTarget && (
        <div className="card" style={{ border: '1px solid var(--primary)' }}>
          {/* Header */}
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Org Assignment — {assignTarget.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{assignTarget.email}</div>
            <button className="btn btn-outline" style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 12px' }}
              onClick={() => setAssignTarget(null)}>✕ Close</button>
          </div>

          {/* 3 Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
            {ASSIGN_TABS.map(tab => (
              <button key={tab.key} type="button"
                style={{
                  padding: '10px 28px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13,
                  fontWeight: assignTab === tab.key ? 700 : 400,
                  color: assignTab === tab.key ? 'var(--primary)' : 'var(--text-muted)',
                  borderBottom: assignTab === tab.key ? '2px solid var(--primary)' : '2px solid transparent',
                }}
                onClick={() => setAssignTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ padding: 24 }}>
            {assignLoading && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>}

            {/* ── Org Tab ── */}
            {!assignLoading && assignTab === 'org' && (
              <>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                  Select one or more organisations to grant this user access to.
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
                  {allOrgsWithSites.length === 0
                    ? <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No organisations available.</div>
                    : allOrgsWithSites.map(org => {
                      const checked = selectedOrgIds.has(org.id)
                      return (
                        <label key={org.id} style={{
                          display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                          padding: '8px 14px', border: `1px solid ${checked ? 'var(--primary)' : 'var(--border)'}`,
                          borderRadius: 8, cursor: 'pointer',
                          background: checked ? 'var(--primary-light, #e8f0fe)' : 'var(--surface)',
                          color: checked ? 'var(--primary)' : 'var(--text-primary)',
                          userSelect: 'none', transition: 'all 0.15s',
                        }}>
                          <span style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${checked ? 'var(--primary)' : 'var(--border)'}`, background: checked ? 'var(--primary)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {checked && <span style={{ color: '#fff', fontSize: 11, lineHeight: 1 }}>✓</span>}
                          </span>
                          <input type="checkbox" checked={checked} style={{ display: 'none' }} onChange={() => toggleOrg(org.id)} />
                          <span style={{ fontWeight: checked ? 700 : 400 }}>{org.name}</span>
                        </label>
                      )
                    })
                  }
                </div>
                {selectedOrgIds.size > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {selectedOrgIds.size} organisation{selectedOrgIds.size !== 1 ? 's' : ''} selected. Go to <strong>Site</strong> and <strong>Role</strong> tabs to configure per-org settings.
                  </div>
                )}
              </>
            )}

            {/* ── Site Tab ── */}
            {!assignLoading && assignTab === 'site' && (
              <>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                  Set the primary site for each assigned organisation.
                </div>
                {selectedOrgIds.size === 0
                  ? <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No organisations selected. Go to Org tab first.</div>
                  : [...selectedOrgIds].map(orgId => {
                    const org = allOrgsWithSites.find(o => o.id === orgId)
                    if (!org) return null
                    const sites = Array.isArray(org.sites) ? org.sites : []
                    return (
                      <div key={orgId} style={{ marginBottom: 20 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: 'var(--text-primary)' }}>{org.name}</div>
                        {sites.length === 0
                          ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No sites configured for this org.</div>
                          : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                              {sites.map(s => {
                                const selected = selectedSites[orgId] === s.id
                                return (
                                  <label key={s.id} style={{
                                    display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
                                    padding: '6px 12px', border: `1px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
                                    borderRadius: 6, cursor: 'pointer',
                                    background: selected ? 'var(--primary-light, #e8f0fe)' : 'var(--surface)',
                                    color: selected ? 'var(--primary)' : 'var(--text-primary)', userSelect: 'none',
                                  }}>
                                    <input type="radio" name={`site-${orgId}`} style={{ display: 'none' }}
                                      checked={selected}
                                      onChange={() => setSelectedSites(prev => ({ ...prev, [orgId]: s.id }))} />
                                    <span style={{ width: 14, height: 14, borderRadius: '50%', border: `1.5px solid ${selected ? 'var(--primary)' : 'var(--border)'}`, background: selected ? 'var(--primary)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                      {selected && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', display: 'inline-block' }} />}
                                    </span>
                                    {s.name}
                                    {s.is_primary ? <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>(Primary)</span> : null}
                                  </label>
                                )
                              })}
                            </div>
                          )
                        }
                      </div>
                    )
                  })
                }
              </>
            )}

            {/* ── Role Tab (Module Access — global per user) ── */}
            {!assignLoading && assignTab === 'role' && (
              <>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
                  Select which modules this user can access. Module access applies across all assigned organisations.
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {MODULES.map(m => {
                    const checked = selectedModules.has(m.key)
                    return (
                      <label key={m.key} style={{
                        display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                        padding: '10px 18px', border: `1px solid ${checked ? 'var(--primary)' : 'var(--border)'}`,
                        borderRadius: 8, cursor: 'pointer',
                        background: checked ? 'var(--primary-light, #e8f0fe)' : 'var(--surface)',
                        color: checked ? 'var(--primary)' : 'var(--text-primary)', userSelect: 'none',
                        transition: 'all 0.15s',
                      }}>
                        <span style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${checked ? 'var(--primary)' : 'var(--border)'}`, background: checked ? 'var(--primary)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {checked && <span style={{ color: '#fff', fontSize: 11, lineHeight: 1 }}>✓</span>}
                        </span>
                        <input type="checkbox" style={{ display: 'none' }} checked={checked} onChange={() => toggleModule(m.key)} />
                        {m.label}
                      </label>
                    )
                  })}
                </div>
              </>
            )}

            {/* Save button */}
            {!assignLoading && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <button className="btn btn-primary" onClick={saveAssignments} disabled={assignSaving}>
                  {assignSaving ? 'Saving…' : 'Save Assignments'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {editingUser && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 24
        }}>
          <div style={{
            width: '100%', maxWidth: 440, background: '#fff', borderRadius: 12,
            border: '1px solid #ddd', padding: 20, boxShadow: '0 10px 30px rgba(0,0,0,0.15)'
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Edit User</div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>
              Update core user details here. Org assignment and password management stay separate.
            </div>

            <div className="form-group">
              <label>Name</label>
              <input className="form-control" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input className="form-control" type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Role</label>
              <select className="form-control" value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}>
                <option value="agent">Agent</option>
                <option value="reviewer">Reviewer</option>
                <option value="content_manager">Content Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 12 }}>
              <input
                type="checkbox"
                checked={!!editForm.is_active}
                onChange={e => setEditForm(f => ({ ...f, is_active: e.target.checked }))}
              />
              Active user
            </label>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btn-primary" type="button" onClick={saveUserEdit}>Save</button>
              <button className="btn btn-secondary" type="button" onClick={() => {
                setEditingUser(null)
                setEditForm({ name: '', email: '', role: 'agent', is_active: true })
              }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ── Module Access View ─────────────────────────────────────────────────── */
function ModuleAccessView({ H, flash }) {
  const [users, setUsers] = useState([])
  const [moduleMap, setModuleMap] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadUsers() }, [])

  async function loadUsers() {
    setLoading(true)
    try {
      const res = await fetch('/api/superadmin/users', { headers: H })
      const data = await res.json()
      if (!res.ok) return flash(data.error || 'Failed to load users.', 'error')
      setUsers(data.users || [])
      const map = {}
      ;(data.users || []).forEach(u => { map[u.id] = new Set(u.modules || []) })
      setModuleMap(map)
    } catch {
      flash('Server unreachable. Please restart the backend.', 'error')
    } finally {
      setLoading(false)
    }
  }

  function toggleModule(userId, mod) {
    setModuleMap(prev => {
      const next = { ...prev }
      const set = new Set(next[userId] || [])
      if (set.has(mod)) set.delete(mod)
      else set.add(mod)
      next[userId] = set
      return next
    })
  }

  async function saveModules(userId) {
    const modules = Array.from(moduleMap[userId] || [])
    const res = await fetch(`/api/superadmin/users/${userId}/modules`, {
      method: 'PUT', headers: H, body: JSON.stringify({ modules })
    })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to save modules.', 'error')
    flash('Module access updated.')
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h3>Scope</h3></div>
        <div className="card-body" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Superadmin assigns module access per user. Access is based on these assignments.
        </div>
      </div>
      <div className="card">
        <div className="card-header"><h3>User Module Access</h3></div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                {MODULES.map(m => <th key={m.key}>{m.label}</th>)}
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={MODULES.length + 3} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>Loading…</td></tr>
              )}
              {!loading && users.length === 0 && (
                <tr><td colSpan={MODULES.length + 3} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No users found.</td></tr>
              )}
              {users.map(u => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.name}</strong>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.email}</div>
                  </td>
                  <td style={{ fontSize: 12 }}>{u.role}</td>
                  {MODULES.map(m => {
                    const checked = (moduleMap[u.id] || new Set()).has(m.key)
                    return (
                      <td key={m.key} style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleModule(u.id, m.key)}
                        />
                      </td>
                    )
                  })}
                  <td>
                    <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => saveModules(u.id)}>
                      Save
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

/* ── Audit Trail View ───────────────────────────────────────────────────── */
function AuditView({ H, endpoint }) {
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const LIMIT = 50

  const load = useCallback(async (off = 0) => {
    setLoading(true)
    try {
      const res = await fetch(`${endpoint}?limit=${LIMIT}&offset=${off}`, { headers: H })
      const data = await res.json()
      setLogs(data.logs || [])
      setTotal(data.total || 0)
      setOffset(off)
    } finally {
      setLoading(false)
    }
  }, [endpoint])

  useEffect(() => { load(0) }, [load])

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Audit Trail</h3>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{total} record{total !== 1 ? 's' : ''}</span>
      </div>
      <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>User</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>Loading…</td></tr>
            )}
            {!loading && logs.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No audit records found.</td></tr>
            )}
            {logs.map(log => (
              <tr key={log.id}>
                <td style={{ fontSize: 11, whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{log.created_at}</td>
                <td>
                  <div style={{ fontSize: 12 }}>{log.user_name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>ID {log.user_id}</div>
                </td>
                <td><span className="badge">{log.action}</span></td>
                <td style={{ fontSize: 12 }}>{log.entity}{log.entity_id ? ` #${log.entity_id}` : ''}</td>
                <td style={{ fontSize: 11, maxWidth: 300, wordBreak: 'break-all' }}>
                  {log.details ? (typeof log.details === 'object' ? JSON.stringify(log.details) : log.details) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > LIMIT && (
        <div style={{ padding: '10px 16px', display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-secondary" style={{ fontSize: 12 }} disabled={offset === 0} onClick={() => load(offset - LIMIT)}>← Prev</button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
            {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
          </span>
          <button className="btn btn-secondary" style={{ fontSize: 12 }} disabled={offset + LIMIT >= total} onClick={() => load(offset + LIMIT)}>Next →</button>
        </div>
      )}
    </div>
  )
}

/* ── Login Audit View ───────────────────────────────────────────────────── */
function LoginAuditView({ H }) {
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const LIMIT = 50

  const load = useCallback(async (off = 0, status = statusFilter) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: LIMIT, offset: off })
      if (status) params.set('status', status)
      const res = await fetch(`/api/superadmin/login-audit?${params}`, { headers: H })
      const data = await res.json()
      setLogs(data.logs || [])
      setTotal(data.total || 0)
      setOffset(off)
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { load(0) }, [load])

  function handleStatusChange(e) {
    setStatusFilter(e.target.value)
    load(0, e.target.value)
  }

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Login Audit</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{total} record{total !== 1 ? 's' : ''}</span>
          <select
            value={statusFilter}
            onChange={handleStatusChange}
            style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text)' }}
          >
            <option value="">All</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>
      <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Login Time</th>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Fail Reason</th>
              <th>Logout Time</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>Loading…</td></tr>
            )}
            {!loading && logs.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No login records found.</td></tr>
            )}
            {logs.map(log => (
              <tr key={log.id}>
                <td style={{ fontSize: 11, whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{log.login_time}</td>
                <td>
                  <div style={{ fontSize: 12 }}>{log.user_name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>ID {log.user_id}</div>
                </td>
                <td style={{ fontSize: 12 }}>{log.role || '—'}</td>
                <td>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 500,
                    background: log.status === 'success' ? 'var(--success-bg, #d4edda)' : 'var(--error-bg, #f8d7da)',
                    color: log.status === 'success' ? 'var(--success, #155724)' : 'var(--error, #721c24)',
                  }}>
                    {log.status}
                  </span>
                </td>
                <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{log.fail_reason || log.auth_event || '—'}</td>
                <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{log.logout_time || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > LIMIT && (
        <div style={{ padding: '10px 16px', display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-secondary" style={{ fontSize: 12 }} disabled={offset === 0} onClick={() => load(offset - LIMIT)}>← Prev</button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
            {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
          </span>
          <button className="btn btn-secondary" style={{ fontSize: 12 }} disabled={offset + LIMIT >= total} onClick={() => load(offset + LIMIT)}>Next →</button>
        </div>
      )}
    </div>
  )
}
