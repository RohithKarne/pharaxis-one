import React, { useState, useEffect, useCallback, useRef } from 'react'
import Sidebar from '../components/Sidebar'
import Topbar from '../../../shared/components/Topbar'
import { useAuth } from '../../../shared/context/AuthContext'

const MODULES = [
  { key: 'mims_core', label: 'MIMS' },
  { key: 'admin_console', label: 'Admin Console' },
  { key: 'content_mgmt', label: 'Content Management' },
  { key: 'data_visualization', label: 'Data Visualization' },
]

const ALERT_EVENT_OPTIONS = [
  { value: 'failed_login_spike', label: 'Failed Login Spike', mode: 'threshold' },
  { value: 'two_factor_lockout', label: '2FA Lockout', mode: 'threshold' },
  { value: 'smtp_failure', label: 'SMTP Failure', mode: 'immediate' },
  { value: 'mailbox_failure', label: 'Mailbox Failure', mode: 'immediate' },
  { value: 'organization_deactivated', label: 'Organisation Deactivated', mode: 'immediate' },
  { value: 'site_deactivated', label: 'Site Deactivated', mode: 'immediate' },
  { value: 'sensitive_config_change', label: 'Sensitive Config Change', mode: 'immediate' },
  { value: 'service_error_threshold', label: 'Service Error Threshold', mode: 'threshold' },
]

const PAGE_TITLES = {
  'dashboard':     'Dashboard',
  'organizations': 'Organisations & Sites',
  '2fa-config':    '2FA Configuration',
  'users':         'User Management',
  'alerts':        'Alerts',
  'notifications': 'Notifications',
  'audit':         'Audit Trail',
  'login-audit':   'Login Audit',
}

export default function SuperadminPage() {
  const [activePage, setActivePage] = useState('dashboard')
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
          {activePage === 'dashboard'     && <DashboardView H={H} setActivePage={setActivePage} />}
          {activePage === 'organizations' && <OrganisationsView H={H} flash={flash} />}
          {activePage === '2fa-config'    && <TwoFactorConfigView H={H} flash={flash} />}
          {activePage === 'users'         && <UsersView H={H} flash={flash} />}
          {activePage === 'alerts'        && <AlertsView H={H} flash={flash} />}
          {activePage === 'notifications' && <NotificationsView H={H} flash={flash} />}
          {activePage === 'audit'         && <AuditView H={H} endpoint="/api/superadmin/audit" />}
          {activePage === 'login-audit'   && <LoginAuditView H={H} />}
        </main>
      </div>
    </div>
  )
}

function downloadCsv(url) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

function DashboardView({ H, setActivePage }) {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/superadmin/dashboard', { headers: H })
      const data = await res.json()
      setSummary(data)
    } finally {
      setLoading(false)
    }
  }, [H.Authorization])

  useEffect(() => { load() }, [load])

  const kpis = summary?.kpis || {}
  const cards = [
    { label: 'Organisations', value: kpis.organisations?.total || 0, note: `${kpis.organisations?.active || 0} active`, page: 'organizations' },
    { label: 'Users', value: kpis.users?.total || 0, note: `${kpis.users?.active || 0} active`, page: 'users' },
    { label: 'Failed Logins 24h', value: kpis.failedLogins24h || 0, note: 'Security watch', page: 'login-audit' },
    { label: 'Locked 2FA Users', value: kpis.lockedUsers || 0, note: 'Needs review', page: 'users' },
    { label: 'Unread Notifications', value: kpis.unreadNotifications || 0, note: 'In-app queue', page: 'notifications' },
    { label: 'Alert Events 24h', value: kpis.alertEvents24h || 0, note: `SMTP: ${kpis.smtpStatus || 'unknown'}`, page: 'alerts' },
  ]

  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Platform Health</h3>
          <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={load}>Refresh</button>
        </div>
        {loading && <div className="card-body" style={{ color: 'var(--text-muted)' }}>Loading dashboard…</div>}
        {!loading && (
          <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {cards.map(card => (
              <div
                key={card.label}
                onClick={() => setActivePage(card.page)}
                style={{
                  border: '1px solid var(--border)', borderRadius: 10, padding: 16,
                  background: 'var(--surface)', cursor: 'pointer', transition: 'box-shadow 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.12)'; e.currentTarget.style.borderColor = 'var(--primary)' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.borderColor = 'var(--border)' }}
              >
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{card.label}</div>
                <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>{card.value}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{card.note}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
        <div className="card">
          <div className="card-header"><h3>Recent Audit Activity</h3></div>
          <div className="card-body">
            {loading && <div style={{ color: 'var(--text-muted)' }}>Loading…</div>}
            {!loading && !(summary?.recentAudit || []).length && <div style={{ color: 'var(--text-muted)' }}>No audit activity yet.</div>}
            {!loading && (summary?.recentAudit || []).map(log => (
              <div key={log.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{log.action} on {log.entity}{log.entity_id ? ` #${log.entity_id}` : ''}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{log.user_name || 'Unknown user'} • {log.created_at}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3>Recent Login Activity</h3></div>
          <div className="card-body">
            {loading && <div style={{ color: 'var(--text-muted)' }}>Loading…</div>}
            {!loading && !(summary?.recentLogins || []).length && <div style={{ color: 'var(--text-muted)' }}>No login activity yet.</div>}
            {!loading && (summary?.recentLogins || []).map(log => (
              <div key={log.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{log.user_name || 'Unknown user'} • {log.status}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{log.auth_event || log.fail_reason || 'login'} • {log.login_time}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
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
  const [selectedOrgIds, setSelectedOrgIds] = useState(new Set())
  const [editingSite, setEditingSite] = useState(null) // site object or null
  const [siteEditForm, setSiteEditForm] = useState({ name: '', country: '' })
  const [orgLogos, setOrgLogos] = useState({}) // { orgId: logoUrl }
  const logoInputRefs = useRef({}) // { orgId: inputElement }

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/superadmin/orgs', { headers: H })
      const data = await res.json()
      const orgsData = data.orgs || []
      setOrgs(orgsData)
      const logoMap = {}
      orgsData.forEach(org => { if (org.logo_url) logoMap[org.id] = org.logo_url })
      setOrgLogos(prev => ({ ...prev, ...logoMap }))
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

  async function saveSiteEdit() {
    if (!editingSite) return
    if (!siteEditForm.name.trim()) return flash('Site name is required.', 'error')
    const res = await fetch(`/api/superadmin/sites/${editingSite.id}`, {
      method: 'PUT',
      headers: H,
      body: JSON.stringify({
        name: siteEditForm.name.trim(),
        country: siteEditForm.country.trim(),
        is_primary: editingSite.is_primary,
        is_active: editingSite.is_active,
      }),
    })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to update site.', 'error')
    flash(`Site "${siteEditForm.name.trim()}" updated.`)
    setEditingSite(null)
    setSiteEditForm({ name: '', country: '' })
    load()
  }

  async function uploadOrgLogo(orgId, file) {
    if (!file) return
    const formData = new FormData()
    formData.append('logo', file)
    try {
      const res = await fetch(`/api/superadmin/orgs/${orgId}/logo`, {
        method: 'POST',
        headers: { Authorization: H.Authorization },
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) return flash(data.error || 'Failed to upload logo.', 'error')
      setOrgLogos(prev => ({ ...prev, [orgId]: data.logo_url }))
      flash('Logo uploaded successfully.')
    } catch {
      flash('Failed to upload logo.', 'error')
    }
  }

  function toggleSelectOrg(orgId) {
    setSelectedOrgIds(prev => {
      const next = new Set(prev)
      if (next.has(orgId)) next.delete(orgId)
      else next.add(orgId)
      return next
    })
  }

  async function bulkToggleOrgs(activate) {
    const ids = Array.from(selectedOrgIds)
    if (!ids.length) return flash('Select at least one organisation.', 'error')
    for (const id of ids) {
      const org = orgs.find(o => o.id === id)
      if (!org) continue
      await fetch(`/api/superadmin/orgs/${id}`, {
        method: 'PUT', headers: H,
        body: JSON.stringify({ name: org.name, is_active: activate ? 1 : 0 }),
      })
    }
    flash(`${ids.length} organisation${ids.length !== 1 ? 's' : ''} ${activate ? 'activated' : 'deactivated'}.`)
    setSelectedOrgIds(new Set())
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
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h3>Organisations & Sites</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {selectedOrgIds.size > 0 && (
              <>
                <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => bulkToggleOrgs(true)}>Activate Selected ({selectedOrgIds.size})</button>
                <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => bulkToggleOrgs(false)}>Deactivate Selected ({selectedOrgIds.size})</button>
              </>
            )}
            <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setShowOrgForm(v => !v)}>
              + New Organisation
            </button>
          </div>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                checked={selectedOrgIds.has(org.id)}
                onClick={e => e.stopPropagation()}
                onChange={() => toggleSelectOrg(org.id)}
                style={{ flexShrink: 0 }}
              />
              {orgLogos[org.id] ? (
                <img
                  src={orgLogos[org.id]}
                  alt={`${org.name} logo`}
                  style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'contain', border: '1px solid var(--border)', background: '#fff', flexShrink: 0 }}
                />
              ) : null}
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                ref={el => { logoInputRefs.current[org.id] = el }}
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) uploadOrgLogo(org.id, file)
                  e.target.value = ''
                }}
              />
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
              <button
                className="btn btn-outline"
                style={{ fontSize: 11, padding: '3px 10px' }}
                title="Upload logo"
                onClick={e => {
                  e.stopPropagation()
                  logoInputRefs.current[org.id]?.click()
                }}
              >
                📷 Logo
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
                    <React.Fragment key={s.id}>
                      <tr>
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
                            <button
                              className="btn btn-outline"
                              style={{ fontSize: 11, padding: '2px 8px' }}
                              title="Edit site"
                              onClick={() => {
                                if (editingSite?.id === s.id) {
                                  setEditingSite(null)
                                  setSiteEditForm({ name: '', country: '' })
                                } else {
                                  setEditingSite(s)
                                  setSiteEditForm({ name: s.name, country: s.country || '' })
                                }
                              }}
                            >✏</button>
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
                      {editingSite?.id === s.id && (
                        <tr>
                          <td colSpan={5} style={{ background: 'var(--bg-secondary)', padding: '10px 12px', borderBottom: '2px solid var(--primary)' }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', marginBottom: 3 }}>Site Name</label>
                                <input
                                  className="form-control"
                                  style={{ fontSize: 13, minWidth: 180 }}
                                  value={siteEditForm.name}
                                  onChange={e => setSiteEditForm(f => ({ ...f, name: e.target.value }))}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', marginBottom: 3 }}>Country</label>
                                <input
                                  className="form-control"
                                  style={{ fontSize: 13, minWidth: 140 }}
                                  value={siteEditForm.country}
                                  onChange={e => setSiteEditForm(f => ({ ...f, country: e.target.value }))}
                                  placeholder="e.g. India"
                                />
                              </div>
                              <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={saveSiteEdit}>Save</button>
                              <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => { setEditingSite(null); setSiteEditForm({ name: '', country: '' }) }}>Cancel</button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(60)
  const [savingSessionTimeout, setSavingSessionTimeout] = useState(false)

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
      setSessionTimeoutMinutes(Number(configData.config?.superadmin_session_timeout_minutes) || 60)
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

  async function saveSessionTimeout() {
    const mins = Number(sessionTimeoutMinutes)
    if (isNaN(mins) || mins < 15 || mins > 480) return flash('Session timeout must be between 15 and 480 minutes.', 'error')
    setSavingSessionTimeout(true)
    try {
      const res = await fetch('/api/superadmin/config', {
        method: 'PUT',
        headers: H,
        body: JSON.stringify({ superadmin_session_timeout_minutes: mins }),
      })
      const data = await res.json()
      if (!res.ok) return flash(data.error || 'Failed to save session timeout.', 'error')
      flash(`Superadmin session timeout set to ${mins} minutes.`)
    } catch {
      flash('Failed to save session timeout.', 'error')
    } finally {
      setSavingSessionTimeout(false)
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

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-header"><h3>Superadmin Session Timeout</h3></div>
        <div className="card-body">
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
            Set how long a superadmin session stays active before automatic logout (15–480 minutes).
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
  const [selectedUserIds, setSelectedUserIds] = useState(new Set())
  const [userSearch, setUserSearch] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState('')

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
  // Role per org
  const [selectedOrgRoles, setSelectedOrgRoles] = useState({}) // { orgId: role }
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

  function toggleSelectedUser(userId) {
    setSelectedUserIds(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  async function runBulkAction(action) {
    const userIds = Array.from(selectedUserIds)
    if (!userIds.length) return flash('Select at least one user first.', 'error')
    const res = await fetch('/api/superadmin/users/bulk-action', {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ action, userIds }),
    })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Bulk action failed.', 'error')
    flash(data.message || 'Bulk action completed.')
    setSelectedUserIds(new Set())
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
      const roles  = {}
      access.forEach(a => {
        sites[a.org_id] = a.primary_site_id || ''
        roles[a.org_id] = a.role_at_org || 'agent'
      })
      // Modules are global per user — take from first row that has them
      const modRow = access.find(a => Array.isArray(a.modules) && a.modules.length > 0)
      const mods   = new Set(modRow ? modRow.modules : [])
      setSelectedOrgIds(orgIds)
      setSelectedSites(sites)
      setSelectedOrgRoles(roles)
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

      // Add/update org assignments (site + role — modules handled separately)
      for (const orgId of newOrgIds) {
        const siteId = selectedSites[orgId] || null
        const roleAtOrg = selectedOrgRoles[orgId] || 'agent'
        if (!existingOrgIds.has(orgId)) {
          await fetch(`/api/superadmin/users/${userId}/org-access`, {
            method: 'POST', headers: H,
            body: JSON.stringify({ org_id: orgId, primary_site_id: siteId, role_at_org: roleAtOrg }),
          })
        } else {
          await fetch(`/api/superadmin/users/${userId}/org-access/${orgId}`, {
            method: 'PUT', headers: H,
            body: JSON.stringify({ primary_site_id: siteId, role_at_org: roleAtOrg }),
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

  async function unlockUser(user) {
    const res = await fetch(`/api/superadmin/users/${user.id}/unlock`, {
      method: 'POST',
      headers: H,
    })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to unlock user.', 'error')
    flash(data.message || `${user.name} unlocked.`)
    load()
  }

  async function forcePasswordReset(user) {
    const res = await fetch(`/api/superadmin/users/${user.id}/force-password-reset`, {
      method: 'POST',
      headers: H,
    })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to force password reset.', 'error')
    flash(data.message || `Password reset required for ${user.name}.`)
    load()
  }

  const ASSIGN_TABS = [
    { key: 'org',  label: 'Org'  },
    { key: 'site', label: 'Site' },
    { key: 'role', label: 'Role' },
  ]

  const filteredUsers = users.filter(u => {
    const searchLower = userSearch.toLowerCase()
    const matchesSearch = !userSearch ||
      (u.name || '').toLowerCase().includes(searchLower) ||
      (u.email || '').toLowerCase().includes(searchLower)
    const matchesRole = !userRoleFilter || u.role === userRoleFilter
    return matchesSearch && matchesRole
  })

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
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h3>Users</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => runBulkAction('activate')}>Bulk Activate</button>
            <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => runBulkAction('deactivate')}>Bulk Deactivate</button>
            <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => runBulkAction('force_password_reset')}>Bulk Force Reset</button>
          </div>
        </div>
        <div className="card-body" style={{ borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="form-control"
            style={{ maxWidth: 240, fontSize: 13 }}
            placeholder="Search by name or email…"
            value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
          />
          <select
            className="form-control"
            style={{ maxWidth: 180, fontSize: 13 }}
            value={userRoleFilter}
            onChange={e => setUserRoleFilter(e.target.value)}
          >
            <option value="">All roles</option>
            <option value="admin">Admin</option>
            <option value="agent">Agent</option>
            <option value="reviewer">Reviewer</option>
            <option value="content_manager">Content Manager</option>
          </select>
          {(userSearch || userRoleFilter) && (
            <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => { setUserSearch(''); setUserRoleFilter('') }}>Clear</button>
          )}
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {filteredUsers.length} of {users.length} user{users.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr><th></th><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>2FA</th><th>Last Login</th><th>Org Assignments</th><th></th></tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>Loading…</td></tr>}
              {!loading && filteredUsers.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>{users.length === 0 ? 'No users found.' : 'No users match your search.'}</td></tr>}
              {filteredUsers.map(u => (
                <tr key={u.id} style={{ background: assignTarget?.id === u.id ? 'var(--primary-light, #e8f0fe)' : undefined }}>
                  <td style={{ width: 32 }}>
                    <input type="checkbox" checked={selectedUserIds.has(u.id)} onChange={() => toggleSelectedUser(u.id)} />
                  </td>
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
                  <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {(() => {
                      const raw = u.last_login_at || u.last_login
                      if (!raw) return 'Never'
                      const d = new Date(raw)
                      if (isNaN(d.getTime())) return 'Never'
                      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    })()}
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
                        <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => unlockUser(u)}>
                          Unlock
                        </button>
                        <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => forcePasswordReset(u)}>
                          Force Reset
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
                  Set the primary site and role for each assigned organisation.
                </div>
                {selectedOrgIds.size === 0
                  ? <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No organisations selected. Go to Org tab first.</div>
                  : [...selectedOrgIds].map(orgId => {
                    const org = allOrgsWithSites.find(o => o.id === orgId)
                    if (!org) return null
                    const sites = Array.isArray(org.sites) ? org.sites : []
                    return (
                      <div key={orgId} style={{ marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: 'var(--text-primary)' }}>{org.name}</div>
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1, minWidth: 200 }}>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Primary Site</div>
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
                          <div style={{ minWidth: 160 }}>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Role at this Org</div>
                            <select
                              className="form-control"
                              style={{ fontSize: 13 }}
                              value={selectedOrgRoles[orgId] || 'agent'}
                              onChange={e => setSelectedOrgRoles(prev => ({ ...prev, [orgId]: e.target.value }))}
                            >
                              <option value="admin">Admin</option>
                              <option value="agent">Agent</option>
                              <option value="reviewer">Reviewer</option>
                              <option value="content_manager">Content Manager</option>
                            </select>
                          </div>
                        </div>
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


function AuditDetailPanel({ details }) {
  let parsed = null
  try {
    parsed = typeof details === 'object' ? details : JSON.parse(details)
  } catch { parsed = null }

  if (!parsed) {
    return <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>{String(details)}</pre>
  }

  const hasDiff = parsed.before !== undefined || parsed.after !== undefined

  if (hasDiff) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#c0392b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Before</div>
          <div style={{ background: '#fdf0ef', border: '1px solid #f5c6cb', borderRadius: 6, padding: 10, fontSize: 12 }}>
            {parsed.before && typeof parsed.before === 'object'
              ? Object.entries(parsed.before).map(([k, v]) => (
                <div key={k} style={{ marginBottom: 4 }}><strong>{k}:</strong> {JSON.stringify(v)}</div>
              ))
              : <span>{String(parsed.before ?? '—')}</span>
            }
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#155724', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>After</div>
          <div style={{ background: '#d4edda', border: '1px solid #c3e6cb', borderRadius: 6, padding: 10, fontSize: 12 }}>
            {parsed.after && typeof parsed.after === 'object'
              ? Object.entries(parsed.after).map(([k, v]) => (
                <div key={k} style={{ marginBottom: 4 }}><strong>{k}:</strong> {JSON.stringify(v)}</div>
              ))
              : <span>{String(parsed.after ?? '—')}</span>
            }
          </div>
        </div>
        {Object.keys(parsed).filter(k => k !== 'before' && k !== 'after').length > 0 && (
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>Additional Fields</div>
            {Object.entries(parsed).filter(([k]) => k !== 'before' && k !== 'after').map(([k, v]) => (
              <div key={k} style={{ fontSize: 12, marginBottom: 4 }}><strong>{k}:</strong> {JSON.stringify(v)}</div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ fontSize: 12 }}>
      {Object.entries(parsed).map(([k, v]) => (
        <div key={k} style={{ marginBottom: 4 }}><strong>{k}:</strong> {JSON.stringify(v)}</div>
      ))}
    </div>
  )
}

/* ── Audit Trail View ───────────────────────────────────────────────────── */
function AuditView({ H, endpoint }) {
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [filters, setFilters] = useState({ from: '', to: '', user: '', action: '', entity: '' })
  const [loading, setLoading] = useState(true)
  const [expandedLogId, setExpandedLogId] = useState(null)
  const LIMIT = 50

  const load = useCallback(async (off = 0) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: LIMIT, offset: off })
      Object.entries(filters).forEach(([key, value]) => value && params.set(key, value))
      const res = await fetch(`${endpoint}?${params}`, { headers: H })
      const data = await res.json()
      setLogs(data.logs || [])
      setTotal(data.total || 0)
      setOffset(off)
    } finally {
      setLoading(false)
    }
  }, [endpoint, filters, H.Authorization])

  useEffect(() => { load(0) }, [load])

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Audit Trail</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{total} record{total !== 1 ? 's' : ''}</span>
          <button
            className="btn btn-outline"
            style={{ fontSize: 11, padding: '4px 10px' }}
            onClick={() => {
              const params = new URLSearchParams({ export: 'csv' })
              Object.entries(filters).forEach(([key, value]) => value && params.set(key, value))
              downloadCsv(`${endpoint}?${params}`)
            }}
          >
            Export CSV
          </button>
        </div>
      </div>
      <div className="card-body" style={{ borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input className="form-control" style={{ maxWidth: 150 }} type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
        <input className="form-control" style={{ maxWidth: 150 }} type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
        <input className="form-control" style={{ maxWidth: 150 }} placeholder="User" value={filters.user} onChange={e => setFilters(f => ({ ...f, user: e.target.value }))} />
        <input className="form-control" style={{ maxWidth: 150 }} placeholder="Action" value={filters.action} onChange={e => setFilters(f => ({ ...f, action: e.target.value }))} />
        <input className="form-control" style={{ maxWidth: 150 }} placeholder="Entity" value={filters.entity} onChange={e => setFilters(f => ({ ...f, entity: e.target.value }))} />
        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => load(0)}>Search</button>
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
            {logs.map(log => {
              const rawDetails = log.details ? (typeof log.details === 'object' ? JSON.stringify(log.details) : log.details) : null
              const truncated = rawDetails ? (rawDetails.length > 60 ? rawDetails.slice(0, 60) + '…' : rawDetails) : '—'
              const isExpanded = expandedLogId === log.id
              return (
                <React.Fragment key={log.id}>
                  <tr>
                    <td style={{ fontSize: 11, whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{log.created_at}</td>
                    <td>
                      <div style={{ fontSize: 12 }}>{log.user_name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>ID {log.user_id}</div>
                    </td>
                    <td><span className="badge">{log.action}</span></td>
                    <td style={{ fontSize: 12 }}>{log.entity}{log.entity_id ? ` #${log.entity_id}` : ''}</td>
                    <td style={{ fontSize: 11, maxWidth: 300 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ wordBreak: 'break-all', color: 'var(--text-muted)' }}>{truncated}</span>
                        {rawDetails && rawDetails.length > 0 && (
                          <button
                            className="btn btn-outline"
                            style={{ fontSize: 10, padding: '2px 8px', flexShrink: 0 }}
                            onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                          >
                            {isExpanded ? 'Hide' : 'View'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={5} style={{ background: 'var(--bg-secondary)', padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                        <AuditDetailPanel details={log.details || rawDetails} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
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
  const [filters, setFilters] = useState({ status: '', from: '', to: '', user: '', role: '' })
  const [loading, setLoading] = useState(true)
  const LIMIT = 50

  const load = useCallback(async (off = 0, nextFilters = filters) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: LIMIT, offset: off })
      Object.entries(nextFilters).forEach(([key, value]) => value && params.set(key, value))
      const res = await fetch(`/api/superadmin/login-audit?${params}`, { headers: H })
      const data = await res.json()
      setLogs(data.logs || [])
      setTotal(data.total || 0)
      setOffset(off)
    } finally {
      setLoading(false)
    }
  }, [filters, H.Authorization])

  useEffect(() => { load(0) }, [load])

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Login Audit</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{total} record{total !== 1 ? 's' : ''}</span>
          <button
            className="btn btn-outline"
            style={{ fontSize: 11, padding: '4px 10px' }}
            onClick={() => {
              const params = new URLSearchParams({ export: 'csv' })
              Object.entries(filters).forEach(([key, value]) => value && params.set(key, value))
              downloadCsv(`/api/superadmin/login-audit?${params}`)
            }}
          >
            Export CSV
          </button>
        </div>
      </div>
      <div className="card-body" style={{ borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select
          className="form-control"
          style={{ maxWidth: 140 }}
          value={filters.status}
          onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
        >
          <option value="">All statuses</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
        </select>
        <input className="form-control" style={{ maxWidth: 150 }} type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
        <input className="form-control" style={{ maxWidth: 150 }} type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
        <input className="form-control" style={{ maxWidth: 150 }} placeholder="User" value={filters.user} onChange={e => setFilters(f => ({ ...f, user: e.target.value }))} />
        <input className="form-control" style={{ maxWidth: 140 }} placeholder="Role" value={filters.role} onChange={e => setFilters(f => ({ ...f, role: e.target.value }))} />
        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => load(0)}>Search</button>
      </div>
      <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Login Time</th>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>IP Address</th>
              <th>Location</th>
              <th>Fail Reason</th>
              <th>Logout Time</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>Loading…</td></tr>
            )}
            {!loading && logs.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No login records found.</td></tr>
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
                <td style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{log.ip_address || '—'}</td>
                <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{log.location || '—'}</td>
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

function AlertsView({ H, flash }) {
  const [rules, setRules] = useState([])
  const [events, setEvents] = useState([])
  const [eventTypeError, setEventTypeError] = useState('')
  const [form, setForm] = useState({
    id: null,
    name: '',
    event_type: 'failed_login_spike',
    severity: 'high',
    channels: 'email,in_app',
    recipient_emails: '',
    threshold_value: 1,
    window_minutes: 15,
    cooldown_minutes: 30,
    is_active: true,
  })

  const [eventFilter, setEventFilter] = useState({ event_type: '', severity: '' })
  const [eventsOffset, setEventsOffset] = useState(0)
  const [eventsTotal, setEventsTotal] = useState(0)
  const EVENTS_LIMIT = 20

  const DEFAULT_EMAIL_SUBJECT = 'MIMS Alert: {{alert_title}}'
  const DEFAULT_EMAIL_BODY = 'Alert: {{alert_title}}\nSeverity: {{severity}}\nOrganisation: {{org_name}}\nTriggered at: {{triggered_at}}\n\n{{message}}'
  const [emailTemplateOpen, setEmailTemplateOpen] = useState(false)
  const [emailTemplate, setEmailTemplate] = useState({ subject: DEFAULT_EMAIL_SUBJECT, body: DEFAULT_EMAIL_BODY })
  const [emailTemplateSaving, setEmailTemplateSaving] = useState(false)

  const loadEvents = useCallback(async (off = 0, filter = eventFilter) => {
    const params = new URLSearchParams({ limit: EVENTS_LIMIT, offset: off })
    if (filter.event_type) params.set('event_type', filter.event_type)
    if (filter.severity) params.set('severity', filter.severity)
    const res = await fetch(`/api/superadmin/alerts/events?${params}`, { headers: H })
    const data = await res.json()
    setEvents(data.events || [])
    setEventsTotal(data.total || 0)
    setEventsOffset(off)
  }, [H.Authorization, eventFilter])

  const load = useCallback(async () => {
    const [rulesRes, templateRes] = await Promise.all([
      fetch('/api/superadmin/alerts/rules', { headers: H }),
      fetch('/api/superadmin/alert-email-template', { headers: H }),
    ])
    const rulesData = await rulesRes.json()
    setRules(rulesData.rules || [])
    if (templateRes.ok) {
      const templateData = await templateRes.json()
      if (templateData.subject || templateData.body) {
        setEmailTemplate({
          subject: templateData.subject || DEFAULT_EMAIL_SUBJECT,
          body: templateData.body || DEFAULT_EMAIL_BODY,
        })
      }
    }
    loadEvents(0)
  }, [H.Authorization, loadEvents])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadEvents(0, eventFilter) }, [eventFilter])

  const selectedEvent = ALERT_EVENT_OPTIONS.find(option => option.value === form.event_type)
  const isThresholdRule = selectedEvent?.mode === 'threshold'

  async function saveRule(e) {
    e.preventDefault()
    setEventTypeError('')
    // Duplicate event_type guard (only for new rules)
    if (!form.id) {
      const duplicate = rules.find(r => r.event_type === form.event_type)
      if (duplicate) {
        setEventTypeError('A rule for this event type already exists.')
        return
      }
    }
    const url = form.id ? `/api/superadmin/alerts/rules/${form.id}` : '/api/superadmin/alerts/rules'
    const method = form.id ? 'PUT' : 'POST'
    const res = await fetch(url, {
      method,
      headers: H,
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to save alert rule.', 'error')
    flash(data.message || 'Alert rule saved.')
    setEventTypeError('')
    setForm({ id: null, name: '', event_type: 'failed_login_spike', severity: 'high', channels: 'email,in_app', recipient_emails: '', threshold_value: 1, window_minutes: 15, cooldown_minutes: 30, is_active: true })
    load()
  }

  async function toggleRule(rule) {
    const res = await fetch(`/api/superadmin/alerts/rules/${rule.id}`, {
      method: 'PUT',
      headers: H,
      body: JSON.stringify({ ...rule, is_active: !rule.is_active }),
    })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to update rule.', 'error')
    flash('Alert rule updated.')
    load()
  }

  async function deleteRule(rule) {
    const confirmed = window.confirm(`Delete alert rule "${rule.name}"?`)
    if (!confirmed) return
    const res = await fetch(`/api/superadmin/alerts/rules/${rule.id}`, {
      method: 'DELETE',
      headers: H,
    })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to delete rule.', 'error')
    flash('Alert rule deleted.')
    if (form.id === rule.id) {
      setForm({ id: null, name: '', event_type: 'failed_login_spike', severity: 'high', channels: 'email,in_app', recipient_emails: '', threshold_value: 1, window_minutes: 15, cooldown_minutes: 30, is_active: true })
    }
    load()
  }

  async function saveEmailTemplate() {
    if (!emailTemplate.subject.trim() || !emailTemplate.body.trim()) return flash('Subject and body are required.', 'error')
    setEmailTemplateSaving(true)
    try {
      const res = await fetch('/api/superadmin/alert-email-template', {
        method: 'PUT',
        headers: H,
        body: JSON.stringify({ subject: emailTemplate.subject, body: emailTemplate.body }),
      })
      const data = await res.json()
      if (!res.ok) return flash(data.error || 'Failed to save email template.', 'error')
      flash('Email alert template saved.')
    } catch {
      flash('Failed to save email template.', 'error')
    } finally {
      setEmailTemplateSaving(false)
    }
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-header"><h3>Alert Rule Setup</h3></div>
        <div className="card-body">
          <form onSubmit={saveRule} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div><label style={{ fontSize: 12 }}>Rule Name</label><input className="form-control" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><label style={{ fontSize: 12 }}>Event</label><select className="form-control" value={form.event_type} onChange={e => {
              const eventType = e.target.value
              const option = ALERT_EVENT_OPTIONS.find(item => item.value === eventType)
              setForm(f => ({
                ...f,
                event_type: eventType,
                threshold_value: option?.mode === 'threshold' ? (f.threshold_value || 1) : 1,
                window_minutes: option?.mode === 'threshold' ? (f.window_minutes || 15) : 0,
              }))
            }}>
              {ALERT_EVENT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select></div>
            <div><label style={{ fontSize: 12 }}>Severity</label><select className="form-control" value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}><option value="medium">Medium</option><option value="high">High</option></select></div>
            <div><label style={{ fontSize: 12 }}>Channels</label><select className="form-control" value={form.channels} onChange={e => setForm(f => ({ ...f, channels: e.target.value }))}><option value="email">Email only</option><option value="in_app">In-app only</option><option value="email,in_app">Email + In-app</option></select></div>
            {isThresholdRule ? (
              <>
                <div><label style={{ fontSize: 12 }}>Threshold</label><input className="form-control" type="number" min="1" value={form.threshold_value} onChange={e => setForm(f => ({ ...f, threshold_value: Number(e.target.value) || 1 }))} /></div>
                <div><label style={{ fontSize: 12 }}>Window (min)</label><input className="form-control" type="number" min="1" value={form.window_minutes} onChange={e => setForm(f => ({ ...f, window_minutes: Number(e.target.value) || 15 }))} /></div>
              </>
            ) : (
              <div style={{ gridColumn: 'span 2', paddingTop: 22 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-secondary)' }}>
                  This is an immediate event alert. It triggers when the event happens. Threshold and window settings do not apply.
                </div>
              </div>
            )}
            <div><label style={{ fontSize: 12 }}>Cooldown (min)</label><input className="form-control" type="number" min="0" value={form.cooldown_minutes} onChange={e => setForm(f => ({ ...f, cooldown_minutes: Number(e.target.value) || 0 }))} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={{ fontSize: 12 }}>Recipient Emails</label><input className="form-control" placeholder="comma-separated emails" value={form.recipient_emails} onChange={e => setForm(f => ({ ...f, recipient_emails: e.target.value }))} /></div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={!!form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
              Rule active
            </label>
            {eventTypeError && (
              <div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#c0392b', background: '#fdf0ef', border: '1px solid #f5c6cb', borderRadius: 6, padding: '8px 12px' }}>
                {eventTypeError}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" type="submit">{form.id ? 'Update Rule' : 'Create Rule'}</button>
              {form.id && <button className="btn btn-secondary" type="button" onClick={() => { setForm({ id: null, name: '', event_type: 'failed_login_spike', severity: 'high', channels: 'email,in_app', recipient_emails: '', threshold_value: 1, window_minutes: 15, cooldown_minutes: 30, is_active: true }); setEventTypeError('') }}>Cancel</button>}
            </div>
          </form>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-header"><h3>Alert Rules</h3></div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="admin-table">
            <thead><tr><th>Name</th><th>Event</th><th>Mode</th><th>Channels</th><th>Rule Logic</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {!rules.length && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No alert rules yet.</td></tr>}
              {rules.map(rule => (
                <tr key={rule.id}>
                  <td>{rule.name}</td>
                  <td style={{ fontSize: 12 }}>{rule.event_type}</td>
                  <td style={{ fontSize: 12 }}>{ALERT_EVENT_OPTIONS.find(option => option.value === rule.event_type)?.mode === 'threshold' ? 'Threshold' : 'Immediate'}</td>
                  <td style={{ fontSize: 12 }}>{rule.channels}</td>
                  <td style={{ fontSize: 12 }}>
                    {ALERT_EVENT_OPTIONS.find(option => option.value === rule.event_type)?.mode === 'threshold'
                      ? `${rule.threshold_value} within ${rule.window_minutes}m`
                      : `Immediate event • cooldown ${rule.cooldown_minutes}m`}
                  </td>
                  <td><span className="badge">{rule.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => setForm({ ...rule, is_active: !!rule.is_active })}>Edit</button>
                      <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => toggleRule(rule)}>{rule.is_active ? 'Disable' : 'Enable'}</button>
                      <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => deleteRule(rule)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div
          className="card-header"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
          onClick={() => setEmailTemplateOpen(v => !v)}
        >
          <h3>Email Alert Template</h3>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{emailTemplateOpen ? '▲' : '▼'}</span>
        </div>
        {emailTemplateOpen && (
          <div className="card-body">
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              Available placeholders:{' '}
              {['{{alert_title}}', '{{severity}}', '{{org_name}}', '{{triggered_at}}', '{{message}}'].map(p => (
                <code key={p} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px', fontSize: 11, marginRight: 6 }}>{p}</code>
              ))}
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Subject</label>
              <input
                className="form-control"
                style={{ fontSize: 13 }}
                value={emailTemplate.subject}
                onChange={e => setEmailTemplate(t => ({ ...t, subject: e.target.value }))}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Body</label>
              <textarea
                className="form-control"
                rows={6}
                style={{ fontSize: 13, fontFamily: 'monospace', resize: 'vertical' }}
                value={emailTemplate.body}
                onChange={e => setEmailTemplate(t => ({ ...t, body: e.target.value }))}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={saveEmailTemplate} disabled={emailTemplateSaving}>
                {emailTemplateSaving ? 'Saving…' : 'Save Template'}
              </button>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 12 }}
                onClick={() => setEmailTemplate({ subject: DEFAULT_EMAIL_SUBJECT, body: DEFAULT_EMAIL_BODY })}
              >
                Reset to Default
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Recent Alert Events</h3>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{eventsTotal} event{eventsTotal !== 1 ? 's' : ''}</span>
        </div>
        <div className="card-body" style={{ borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            className="form-control"
            style={{ maxWidth: 220, fontSize: 13 }}
            value={eventFilter.event_type}
            onChange={e => setEventFilter(f => ({ ...f, event_type: e.target.value }))}
          >
            <option value="">All event types</option>
            {ALERT_EVENT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          <select
            className="form-control"
            style={{ maxWidth: 160, fontSize: 13 }}
            value={eventFilter.severity}
            onChange={e => setEventFilter(f => ({ ...f, severity: e.target.value }))}
          >
            <option value="">All severities</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          {(eventFilter.event_type || eventFilter.severity) && (
            <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setEventFilter({ event_type: '', severity: '' })}>Clear</button>
          )}
        </div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="admin-table">
            <thead><tr><th>Time</th><th>Rule</th><th>Message</th><th>Email</th><th>In-App</th></tr></thead>
            <tbody>
              {!events.length && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No alert events yet.</td></tr>}
              {events.map(event => (
                <tr key={event.id}>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{event.created_at}</td>
                  <td style={{ fontSize: 12 }}>{event.rule_name || event.event_type}</td>
                  <td style={{ fontSize: 12 }}>{event.message || event.title}</td>
                  <td style={{ fontSize: 12 }}>{event.email_status}</td>
                  <td style={{ fontSize: 12 }}>{event.in_app_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {eventsTotal > EVENTS_LIMIT && (
          <div style={{ padding: '10px 16px', display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-secondary" style={{ fontSize: 12 }} disabled={eventsOffset === 0} onClick={() => loadEvents(eventsOffset - EVENTS_LIMIT)}>← Prev</button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
              {eventsOffset + 1}–{Math.min(eventsOffset + EVENTS_LIMIT, eventsTotal)} of {eventsTotal}
            </span>
            <button className="btn btn-secondary" style={{ fontSize: 12 }} disabled={eventsOffset + EVENTS_LIMIT >= eventsTotal} onClick={() => loadEvents(eventsOffset + EVENTS_LIMIT)}>Next →</button>
          </div>
        )}
      </div>
    </>
  )
}

function NotificationsView({ H, flash }) {
  const [rows, setRows] = useState([])
  const [unread, setUnread] = useState(0)
  const [selectedIds, setSelectedIds] = useState(new Set())

  const load = useCallback(async () => {
    const res = await fetch('/api/superadmin/notifications?limit=100', { headers: H })
    const data = await res.json()
    setRows(data.notifications || [])
    setUnread(data.unread || 0)
    setSelectedIds(new Set())
  }, [H.Authorization])

  useEffect(() => { load() }, [load])

  async function markRead(id) {
    const res = await fetch(`/api/superadmin/notifications/${id}/read`, { method: 'POST', headers: H })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to update notification.', 'error')
    load()
  }

  async function deleteNotification(id) {
    const res = await fetch(`/api/superadmin/notifications/${id}`, { method: 'DELETE', headers: H })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to delete notification.', 'error')
    flash('Notification deleted.')
    load()
  }

  async function clearAllRead() {
    const res = await fetch('/api/superadmin/notifications/read', { method: 'DELETE', headers: H })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to clear read notifications.', 'error')
    flash(data.message || 'All read notifications cleared.')
    load()
  }

  async function deleteSelected() {
    const ids = Array.from(selectedIds)
    if (!ids.length) return
    for (const id of ids) {
      await fetch(`/api/superadmin/notifications/${id}`, { method: 'DELETE', headers: H })
    }
    flash(`${ids.length} notification${ids.length !== 1 ? 's' : ''} deleted.`)
    load()
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h3>Notifications</h3>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{unread} unread</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {selectedIds.size > 0 && (
            <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px' }} onClick={deleteSelected}>
              Delete Selected ({selectedIds.size})
            </button>
          )}
          <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={clearAllRead}>
            Clear All Read
          </button>
        </div>
      </div>
      <div className="card-body">
        {!rows.length && <div style={{ color: 'var(--text-muted)' }}>No notifications yet.</div>}
        {rows.map(row => (
          <div key={row.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flex: 1 }}>
              <input
                type="checkbox"
                checked={selectedIds.has(row.id)}
                onChange={() => toggleSelect(row.id)}
                style={{ marginTop: 3, flexShrink: 0 }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: row.is_read ? 500 : 700 }}>{row.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{row.message || 'No message'}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>{row.created_at}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {!row.is_read && (
                <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => markRead(row.id)}>Mark Read</button>
              )}
              <button
                className="btn btn-outline"
                style={{ fontSize: 11, padding: '4px 10px', color: '#c0392b', borderColor: '#c0392b' }}
                onClick={() => deleteNotification(row.id)}
                title="Delete"
              >✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
