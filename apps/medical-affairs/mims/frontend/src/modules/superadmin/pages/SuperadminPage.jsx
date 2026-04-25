import React, { useState, useEffect, useCallback, useRef } from 'react'
import Sidebar from '../components/Sidebar'
import Topbar from '../../../shared/components/Topbar'
import { useAuth } from '../../../shared/context/AuthContext'
import { useNavigate } from 'react-router-dom'

const MODULES = [
  { key: 'mims_core', label: 'MIMS' },
  { key: 'admin_console', label: 'Admin Console' },
  { key: 'content_mgmt', label: 'Content Management' },
  { key: 'data_visualization', label: 'Data Visualization' },
  { key: 'reports', label: 'Reports' },
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
  'reports-access': 'Reports Access',
  'help-content':   'Help Content',
  'alerts':        'Alerts',
  'notifications': 'Notifications',
  'audit':         'Audit Trail',
  'login-audit':   'Login Audit',
  'integrations':  'Integrations',
  'copy-division': 'Copy Division',
}

let handleSessionExpiry = null

async function guardedFetch(input, init) {
  const response = await fetch(input, init)
  if (response.status === 401 && typeof handleSessionExpiry === 'function') {
    await handleSessionExpiry()
  }
  return response
}

const INTEGRATION_TYPES = [
  { key: 'mir',         label: 'MIR Integration' },
  { key: 'crm',         label: 'CRM Integration' },
  { key: 'content',     label: 'Content Integration' },
  { key: 'emir',        label: 'EMIR Integration' },
  { key: 'case_import', label: 'Case Import' },
]

function IntegrationsView({ H, flash }) {
  const [orgs, setOrgs] = useState([])
  const [integrations, setIntegrations] = useState([])
  const [selectedIntOrg, setSelectedIntOrg] = useState(null)
  const [intOrgUsers, setIntOrgUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const intOrgs = integrations.reduce((acc, item) => {
    if (item.org_id && !acc.find(o => o.id === item.org_id)) {
      acc.push({ id: item.org_id, name: item.org_name || 'Org ' + item.org_id })
    }
    return acc
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const [orgsRes, intRes] = await Promise.all([
          guardedFetch('/api/superadmin/orgs', { headers: H }).then(r => r.json()),
          guardedFetch('/api/superadmin/integrations', { headers: H }).then(r => r.json()),
        ])
        setOrgs(orgsRes.orgs || [])
        setIntegrations(intRes.integrations || [])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  function getIntegration(orgId, type) {
    return integrations.find(i => i.org_id === orgId && i.integration_type === type)
  }

  async function selectIntOrg(org) {
    setSelectedIntOrg(org)
    const res = await guardedFetch('/api/superadmin/reports/org/' + org.id + '/users', { headers: H }).then(r => r.json())
    setIntOrgUsers(res.users || [])
  }

  async function toggleIntegration(orgId, type, currentEnabled) {
    const existing = getIntegration(orgId, type)
    try {
      if (existing) {
        await guardedFetch(`/api/superadmin/integrations/${existing.id}`, {
          method: 'PUT',
          headers: H,
          body: JSON.stringify({ enabled: currentEnabled ? 0 : 1, org_override_allowed: existing.org_override_allowed }),
        })
      } else {
        await guardedFetch('/api/superadmin/integrations', {
          method: 'POST',
          headers: H,
          body: JSON.stringify({ org_id: orgId, integration_type: type, enabled: 1, org_override_allowed: 0 }),
        })
      }
      const intRes = await guardedFetch('/api/superadmin/integrations', { headers: H }).then(r => r.json())
      setIntegrations(intRes.integrations || [])
      flash('Integration updated', 'success')
    } catch (_e) {
      flash('Failed to update integration', 'error')
    }
  }

  if (loading) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading…</div>

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', gap: 24 }}>
        <div style={{ width: 240, flexShrink: 0 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Organisations</div>
          {intOrgs.map(org => (
            <div key={org.id}
              onClick={() => selectIntOrg(org)}
              style={{
                padding: '8px 12px', borderRadius: 6, cursor: 'pointer', marginBottom: 4,
                background: selectedIntOrg && selectedIntOrg.id === org.id ? '#e8890c22' : '#f5f5f5',
                border: '1px solid ' + (selectedIntOrg && selectedIntOrg.id === org.id ? '#e8890c' : '#ddd'),
                fontSize: 13,
              }}>
              <div style={{ fontWeight: 500 }}>{org.name}</div>
            </div>
          ))}
        </div>
        <div style={{ flex: 1 }}>
          {!selectedIntOrg ? (
            <div style={{ color: '#888', marginTop: 40, textAlign: 'center' }}>
              Select an organisation
            </div>
          ) : (
            <React.Fragment>
              <h2 style={{ marginBottom: 4 }}>Integrations</h2>
              <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 13 }}>
                Enable or disable integrations per organisation based on contract.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Organisation</th>
                      {INTEGRATION_TYPES.map(t => <th key={t.key}>{t.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {orgs.filter(o => o.is_active !== 0 && o.id === selectedIntOrg.id).map(org => (
                      <tr key={org.id}>
                        <td style={{ fontWeight: 500 }}>{org.name}</td>
                        {INTEGRATION_TYPES.map(t => {
                          const existing = getIntegration(org.id, t.key)
                          const enabled = existing ? !!existing.enabled : false
                          return (
                            <td key={t.key} style={{ textAlign: 'center' }}>
                              <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', gap: 6 }}>
                                <input
                                  type="checkbox"
                                  checked={enabled}
                                  onChange={() => toggleIntegration(org.id, t.key, enabled)}
                                />
                                <span style={{ fontSize: 12, color: enabled ? 'var(--success, green)' : 'var(--text-muted)' }}>
                                  {enabled ? 'On' : 'Off'}
                                </span>
                              </label>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 20 }}>
                <h3 style={{ marginBottom: 8 }}>Users in this Organisation</h3>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {intOrgUsers.map(u => (
                      <tr key={u.id}>
                        <td>{u.name}</td>
                        <td>{u.role}</td>
                        <td>Contact superadmin to grant integration access</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </React.Fragment>
          )}
        </div>
      </div>
    </div>
  )
}

function ReportsAccessView({ H, flash }) {
  const REPORT_KEYS = [
    { key: 'case-volume', label: 'Case Volume' },
    { key: 'case-status', label: 'Case Status Distribution' },
    { key: 'case-type', label: 'Case Type Breakdown' },
    { key: 'case-age', label: 'Case Age & SLA' },
    { key: 'case-assignee', label: 'Cases by Assignee' },
    { key: 'case-by-org', label: 'Cases by Org & Site' },
    { key: 'case-intake-channel', label: 'Intake Channel' },
    { key: 'case-priority', label: 'Case Priority' },
    { key: 'case-ae-summary', label: 'Adverse Event Summary' },
    { key: 'case-duplicates', label: 'Duplicate Detection' },
    { key: 'case-source', label: 'Case Source' },
    { key: 'case-audit-trail', label: 'Case Audit Trail' },
    { key: 'regulatory-readiness', label: 'Regulatory Readiness' },
    { key: 'case-monthly-trend', label: 'Monthly Trend' },
    { key: 'case-closure-rate', label: 'Closure Rate' },
    { key: 'user-activity', label: 'User Login Activity' },
    { key: 'security-events', label: 'Security Events' },
    { key: 'module-usage', label: 'Module Usage' },
    { key: 'org-activity', label: 'Org Activity' },
    { key: 'user-roles', label: 'User Role Distribution' },
    { key: 'content-usage', label: 'Content Usage' },
    { key: 'integration-sync', label: 'Integration Sync Status' },
    { key: 'audit-summary', label: 'Audit Summary' },
    { key: 'system-health', label: 'System Health' },
    { key: 'field-usage', label: 'Field Usage' },
  ];

  const [orgs, setOrgs] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [orgReports, setOrgReports] = useState([]);
  const [orgUsers, setOrgUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [viewTab, setViewTab] = useState('org-reports');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    guardedFetch('/api/superadmin/reports/orgs', { headers: H })
      .then(r => r.json()).then(d => setOrgs(d.orgs || []));
    guardedFetch('/api/superadmin/reports/requests', { headers: H })
      .then(r => r.json()).then(d => setRequests(d.requests || []));
  }, []);

  async function selectOrg(org) {
    setSelectedOrg(org);
    setViewTab('org-reports');
    const [rRes, uRes] = await Promise.all([
      guardedFetch('/api/superadmin/reports/org/' + org.id, { headers: H }).then(r => r.json()),
      guardedFetch('/api/superadmin/reports/org/' + org.id + '/users', { headers: H }).then(r => r.json()),
    ]);
    setOrgReports(rRes.reports || []);
    setOrgUsers(uRes.users || []);
  }

  async function toggleOrgReport(reportKey, current) {
    setSaving(true);
    await guardedFetch('/api/superadmin/reports/org/' + selectedOrg.id, {
      method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ report_key: reportKey, is_enabled: current ? 0 : 1 }),
    });
    setOrgReports(prev => prev.map(r => r.key === reportKey ? { ...r, is_enabled: current ? 0 : 1 } : r));
    setSaving(false);
    flash('Report access updated');
  }

  async function toggleUserReport(userId, reportKey, current) {
    setSaving(true);
    await guardedFetch('/api/superadmin/reports/org/' + selectedOrg.id + '/user/' + userId, {
      method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ report_key: reportKey, is_enabled: current ? 0 : 1 }),
    });
    setSaving(false);
    flash('User report access updated');
  }

  async function reviewRequest(id, status) {
    await guardedFetch('/api/superadmin/reports/requests/' + id, {
      method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    flash('Request ' + status);
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginBottom: 4 }}>Reports Access</h2>
      <p style={{ color: '#666', marginBottom: 20 }}>
        Enable reports per organisation and grant access to individual users.
      </p>

      <div style={{ display: 'flex', gap: 24 }}>
        <div style={{ width: 240, flexShrink: 0 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Organisations</div>
          {orgs.map(org => (
            <div key={org.id}
              onClick={() => selectOrg(org)}
              style={{
                padding: '8px 12px', borderRadius: 6, cursor: 'pointer', marginBottom: 4,
                background: selectedOrg && selectedOrg.id === org.id ? '#e8890c22' : '#f5f5f5',
                border: '1px solid ' + (selectedOrg && selectedOrg.id === org.id ? '#e8890c' : '#ddd'),
                fontSize: 13,
              }}>
              <div style={{ fontWeight: 500 }}>{org.name}</div>
              <div style={{ fontSize: 11, color: '#888' }}>{org.reports_enabled} reports enabled</div>
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }}>
          {!selectedOrg ? (
            <div style={{ color: '#888', marginTop: 40, textAlign: 'center' }}>
              Select an organisation to manage report access
            </div>
          ) : (
            <React.Fragment>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {['org-reports', 'user-access', 'requests'].map(t => (
                  <button key={t} onClick={() => setViewTab(t)}
                    style={{
                      padding: '6px 14px', borderRadius: 4, border: '1px solid #ddd',
                      background: viewTab === t ? '#e8890c' : '#fff',
                      color: viewTab === t ? '#fff' : '#333',
                      cursor: 'pointer', fontSize: 13, fontWeight: 500,
                    }}>
                    {t === 'org-reports' ? 'Org Reports' : t === 'user-access' ? 'User Access' : ('Requests' + (pendingCount > 0 ? ' (' + pendingCount + ')' : ''))}
                  </button>
                ))}
              </div>

              {viewTab === 'org-reports' && (
                <table className='admin-table'>
                  <thead><tr><th>Report</th><th>Enabled</th></tr></thead>
                  <tbody>
                    {orgReports.map(r => (
                      <tr key={r.key}>
                        <td>{r.label || r.key}</td>
                        <td>
                          <input type='checkbox' checked={!!r.is_enabled} disabled={saving}
                            onChange={() => toggleOrgReport(r.key, r.is_enabled)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {viewTab === 'user-access' && (
                <div>
                  {orgUsers.map(u => (
                    <div key={u.id} style={{ marginBottom: 16, border: '1px solid #eee', borderRadius: 8, padding: 12 }}>
                      <div style={{ fontWeight: 600, marginBottom: 8 }}>{u.name} <span style={{ fontWeight: 400, color: '#888', fontSize: 12 }}>({u.role})</span></div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {REPORT_KEYS.map(rk => (
                          <label key={rk.key} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type='checkbox' disabled={saving}
                              onChange={() => toggleUserReport(u.id, rk.key, false)} />
                            {rk.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {viewTab === 'requests' && (
                <table className='admin-table'>
                  <thead><tr><th>User</th><th>Report</th><th>Requested By</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {requests.filter(r => r.org_id === selectedOrg.id).map(r => (
                      <tr key={r.id}>
                        <td>{r.user_name}</td>
                        <td>{r.report_key}</td>
                        <td>{r.requested_by_name}</td>
                        <td><span style={{ color: r.status === 'approved' ? 'green' : r.status === 'rejected' ? 'red' : '#e8890c' }}>{r.status}</span></td>
                        <td>
                          {r.status === 'pending' && (
                            <React.Fragment>
                              <button onClick={() => reviewRequest(r.id, 'approved')} style={{ marginRight: 6, color: 'green', background: 'none', border: '1px solid green', borderRadius: 4, cursor: 'pointer', padding: '2px 8px' }}>Approve</button>
                              <button onClick={() => reviewRequest(r.id, 'rejected')} style={{ color: 'red', background: 'none', border: '1px solid red', borderRadius: 4, cursor: 'pointer', padding: '2px 8px' }}>Reject</button>
                            </React.Fragment>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </React.Fragment>
          )}
        </div>
      </div>
    </div>
  );
}

// ── S21-3: Help Content Management View ──────────────────────────────────────
const AUDIENCE_OPTIONS = [
  { value: 'all',       label: 'All Users' },
  { value: 'agent',     label: 'Case Agent' },
  { value: 'cm_admin',  label: 'CM Admin' },
  { value: 'admin',     label: 'Org Admin' },
  { value: 'superadmin',label: 'Superadmin' },
]

const BLANK_ARTICLE = {
  feature_key: '', feature_group: '', title: '', content_html: '',
  summary: '', audience: ['all'], sort_order: 100, is_active: true, tags: [],
}

function HelpContentView({ H, flash }) {
  const [tab, setTab]             = useState('articles') // 'articles' | 'attention'
  const [articles, setArticles]   = useState([])
  const [stale, setStale]         = useState([])
  const [coverage, setCoverage]   = useState(null)
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(false)
  const [search, setSearch]       = useState('')
  const [fkFilter, setFkFilter]   = useState('')
  const [activeFilter, setActFilter] = useState('')
  const [page, setPage]           = useState(1)
  const LIMIT = 25

  // Edit modal
  const [editing, setEditing]     = useState(null) // null | article object | BLANK_ARTICLE
  const [saving, setSaving]       = useState(false)

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: LIMIT })
      if (search)       params.set('search', search)
      if (fkFilter)     params.set('feature_key', fkFilter)
      if (activeFilter !== '') params.set('is_active', activeFilter)
      const data = await guardedFetch(`/api/admin/help?${params}`, { headers: H }).then(r => r.json())
      setArticles(data.articles || [])
      setTotal(data.total || 0)
    } finally {
      setLoading(false)
    }
  }

  async function loadAttention() {
    const [staleData, covData] = await Promise.all([
      guardedFetch('/api/admin/help/stale', { headers: H }).then(r => r.json()),
      guardedFetch('/api/admin/help/coverage', { headers: H }).then(r => r.json()),
    ])
    setStale(staleData.articles || [])
    setCoverage(covData)
  }

  useEffect(() => { load() }, [page, search, fkFilter, activeFilter])
  useEffect(() => { if (tab === 'attention') loadAttention() }, [tab])

  async function save() {
    if (!editing) return
    setSaving(true)
    try {
      const isNew = !editing.id
      const url = isNew ? '/api/admin/help' : `/api/admin/help/${editing.id}`
      const method = isNew ? 'POST' : 'PUT'
      const res = await guardedFetch(url, {
        method,
        headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editing,
          audience: Array.isArray(editing.audience) ? editing.audience : ['all'],
          tags: Array.isArray(editing.tags) ? editing.tags : [],
        }),
      })
      const data = await res.json()
      if (!res.ok) { flash(data.error || 'Save failed', 'error'); return }
      flash(isNew ? 'Article created.' : 'Article updated.', 'success')
      setEditing(null)
      load()
    } finally {
      setSaving(false)
    }
  }

  async function softDelete(id) {
    if (!window.confirm('Deactivate this article?')) return
    await guardedFetch(`/api/admin/help/${id}`, { method: 'DELETE', headers: H })
    flash('Article deactivated.', 'success')
    load()
  }

  async function markReviewed(id) {
    await guardedFetch(`/api/admin/help/${id}/reviewed`, { method: 'PATCH', headers: H })
    flash('Marked as reviewed.', 'success')
    loadAttention()
  }

  function toggleAudience(val) {
    setEditing(prev => {
      const current = Array.isArray(prev.audience) ? prev.audience : ['all']
      if (val === 'all') return { ...prev, audience: ['all'] }
      const without = current.filter(a => a !== 'all')
      const exists  = without.includes(val)
      const next    = exists ? without.filter(a => a !== val) : [...without, val]
      return { ...prev, audience: next.length ? next : ['all'] }
    })
  }

  const pages = Math.ceil(total / LIMIT)

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Help Content</h2>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            Manage in-app help articles for all user roles
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({ ...BLANK_ARTICLE })}>
          + New Article
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        {[['articles','Articles'],['attention','Needs Attention']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '7px 18px', fontSize: 13, fontWeight: 600, background: 'none',
            border: 'none', cursor: 'pointer', borderBottom: `2px solid ${tab === k ? '#1d4ed8' : 'transparent'}`,
            color: tab === k ? '#1d4ed8' : 'var(--text-muted)', borderRadius: '6px 6px 0 0',
          }}>{l}</button>
        ))}
      </div>

      {/* Articles tab */}
      {tab === 'articles' && (
        <>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <input
              className="form-input" style={{ flex: 1, minWidth: 180 }}
              placeholder="Search title, key…"
              value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            />
            <input
              className="form-input" style={{ width: 180 }}
              placeholder="Feature key filter"
              value={fkFilter} onChange={e => { setFkFilter(e.target.value); setPage(1) }}
            />
            <select className="form-input" style={{ width: 130 }} value={activeFilter} onChange={e => setActFilter(e.target.value)}>
              <option value="">All status</option>
              <option value="1">Active</option>
              <option value="0">Inactive</option>
            </select>
          </div>

          {loading && <div style={{ color: 'var(--text-muted)', padding: 20 }}>Loading…</div>}

          {!loading && (
            <div className="card">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg-subtle)' }}>
                    {['Title','Feature Key','Audience','Version','Last Reviewed','Status','Actions'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, fontSize: 12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {articles.length === 0 && (
                    <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No articles found.</td></tr>
                  )}
                  {articles.map(art => (
                    <tr key={art.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', maxWidth: 220 }}>
                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{art.title}</div>
                        {art.summary && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{art.summary.slice(0, 60)}{art.summary.length > 60 ? '…' : ''}</div>}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <code style={{ fontSize: 11, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>{art.feature_key}</code>
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: 11 }}>
                        {(typeof art.audience === 'string' ? JSON.parse(art.audience) : art.audience || ['all']).join(', ')}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>v{art.version}</td>
                      <td style={{ padding: '8px 12px', fontSize: 11 }}>
                        {art.last_reviewed_at
                          ? new Date(art.last_reviewed_at).toLocaleDateString()
                          : <span style={{ color: '#e67e22', fontWeight: 600 }}>Not reviewed</span>
                        }
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                          background: art.is_active ? '#dcfce7' : '#fee2e2',
                          color: art.is_active ? '#166534' : '#dc2626',
                        }}>{art.is_active ? 'Active' : 'Inactive'}</span>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px' }}
                            onClick={() => setEditing({ ...art, audience: typeof art.audience === 'string' ? JSON.parse(art.audience) : art.audience, tags: typeof art.tags === 'string' ? JSON.parse(art.tags) : (art.tags || []) })}>
                            Edit
                          </button>
                          {art.is_active && (
                            <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px', color: '#dc2626', borderColor: '#dc2626' }}
                              onClick={() => softDelete(art.id)}>
                              Deactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, justifyContent: 'center' }}>
              <button className="btn btn-outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Page {page} of {pages} — {total} total</span>
              <button className="btn btn-outline" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          )}
        </>
      )}

      {/* Attention tab */}
      {tab === 'attention' && (
        <>
          {/* Stale articles */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>
              Stale Articles
              <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>not reviewed in 90+ days</span>
            </h3>
            {stale.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No stale articles. ✅</div>}
            {stale.map(art => (
              <div key={art.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8, background: '#fffbeb' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{art.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {art.feature_key} · {art.days_since_review} days since review
                    {art.reviewed_by_name && ` · Last reviewed by ${art.reviewed_by_name}`}
                  </div>
                </div>
                <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => markReviewed(art.id)}>
                  Mark Reviewed
                </button>
              </div>
            ))}
          </div>

          {/* Coverage */}
          {coverage && (
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>
                Feature Key Coverage
                <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
                  {coverage.covered_count}/{coverage.total_keys} keys covered
                </span>
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {coverage.coverage.map(c => (
                  <div key={c.feature_key} style={{
                    padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                    background: c.covered ? '#dcfce7' : '#fee2e2',
                    color: c.covered ? '#166534' : '#dc2626',
                    border: `1px solid ${c.covered ? '#bbf7d0' : '#fecaca'}`,
                  }}>
                    {c.feature_key}
                    {c.article_count > 0 && <span style={{ opacity: 0.6, marginLeft: 4 }}>({c.article_count})</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Edit / Create Modal */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 400, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 40, overflowY: 'auto' }}>
          <div style={{ background: '#fff', borderRadius: 12, width: 680, maxWidth: '95vw', padding: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', marginBottom: 40 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{editing.id ? 'Edit Help Article' : 'New Help Article'}</h3>
              <button style={{ background: '#f1f5f9', border: 'none', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: 14 }} onClick={() => setEditing(null)}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Feature Key *</label>
                <input className="form-input" value={editing.feature_key} onChange={e => setEditing(p => ({ ...p, feature_key: e.target.value }))} placeholder="e.g. cm.documents" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Feature Group</label>
                <input className="form-input" value={editing.feature_group || ''} onChange={e => setEditing(p => ({ ...p, feature_group: e.target.value }))} placeholder="e.g. cm" />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Title *</label>
              <input className="form-input" value={editing.title} onChange={e => setEditing(p => ({ ...p, title: e.target.value }))} placeholder="Article title" />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Summary</label>
              <input className="form-input" value={editing.summary || ''} onChange={e => setEditing(p => ({ ...p, summary: e.target.value }))} placeholder="1-2 sentence summary for search results" />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                Audience
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {AUDIENCE_OPTIONS.map(opt => {
                  const aud = Array.isArray(editing.audience) ? editing.audience : ['all']
                  const selected = aud.includes(opt.value)
                  return (
                    <button key={opt.value} type="button" onClick={() => toggleAudience(opt.value)} style={{
                      padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      background: selected ? '#1d4ed8' : '#f1f5f9',
                      color: selected ? '#fff' : '#334155',
                      border: `1px solid ${selected ? '#1d4ed8' : '#cbd5e1'}`,
                    }}>{opt.label}</button>
                  )
                })}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Content HTML *</label>
              <textarea
                style={{ width: '100%', minHeight: 260, padding: 10, border: '1px solid #cbd5e1', borderRadius: 8, fontFamily: 'monospace', fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }}
                value={editing.content_html}
                onChange={e => setEditing(p => ({ ...p, content_html: e.target.value }))}
                placeholder="<h4>What is this?</h4><p>…</p><h4>When to use it?</h4><p>…</p><h4>How to do it</h4><ul><li>…</li></ul><h4>What happens next?</h4><p>…</p>"
              />
            </div>

            <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 4 }}>Sort Order</label>
                <input type="number" className="form-input" value={editing.sort_order} onChange={e => setEditing(p => ({ ...p, sort_order: parseInt(e.target.value, 10) || 100 }))} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 22 }}>
                <input type="checkbox" id="ha-active" checked={!!editing.is_active} onChange={e => setEditing(p => ({ ...p, is_active: e.target.checked }))} />
                <label htmlFor="ha-active" style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Active</label>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
              <button className="btn btn-outline" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : (editing.id ? 'Save Changes' : 'Create Article')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
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

  const navigate = useNavigate()
  const { token, logout } = useAuth()
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  useEffect(() => {
    let handling = false
    handleSessionExpiry = async () => {
      if (handling) return
      handling = true
      try {
        await logout()
      } finally {
        navigate('/login', { replace: true })
      }
    }
    return () => {
      handleSessionExpiry = null
    }
  }, [logout, navigate])

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
          {activePage === 'integrations'  && <IntegrationsView H={H} flash={flash} />}
          {activePage === 'reports-access' && <ReportsAccessView H={H} flash={flash} />}
          {activePage === 'help-content'   && <HelpContentView H={H} flash={flash} />}
          {activePage === 'copy-division'  && <CopyDivisionView H={H} flash={flash} />}
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
      const res = await guardedFetch('/api/superadmin/dashboard', { headers: H })
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
      const res = await guardedFetch('/api/superadmin/orgs', { headers: H })
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
    const res = await guardedFetch('/api/superadmin/orgs', { method: 'POST', headers: H, body: JSON.stringify(orgForm) })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to create.', 'error')
    flash('Organisation created.')
    setShowOrgForm(false)
    setOrgForm({ name: '' })
    load()
  }

  async function saveOrgEdit() {
    if (!editingOrg || !editOrgName.trim()) return flash('Organisation name is required.', 'error')
    const res = await guardedFetch(`/api/superadmin/orgs/${editingOrg.id}`, {
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
    const res = await guardedFetch(`/api/superadmin/orgs/${org.id}`, {
      method: 'PUT', headers: H,
      body: JSON.stringify({ name: org.name, is_active: org.is_active ? 0 : 1 })
    })
    if (!res.ok) return flash('Failed to update.', 'error')
    flash(`Organisation ${org.is_active ? 'deactivated' : 'activated'}.`)
    load()
  }

  async function toggleSite(site) {
    const res = await guardedFetch(`/api/superadmin/sites/${site.id}`, {
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
    const res = await guardedFetch(`/api/superadmin/orgs/${showSiteForm}/sites`, {
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
    const res = await guardedFetch(`/api/superadmin/sites/${editingSite.id}`, {
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
      const res = await guardedFetch(`/api/superadmin/orgs/${orgId}/logo`, {
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
      await guardedFetch(`/api/superadmin/orgs/${id}`, {
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
    const res = await guardedFetch(`/api/superadmin/orgs/${org.id}`, {
      method: 'PUT', headers: H,
      body: JSON.stringify({ name: org.name, is_active: org.is_active, session_timeout_minutes: mins })
    })
    if (!res.ok) return flash('Failed to update timeout.', 'error')
    flash(`Session timeout updated to ${mins} minutes for ${org.name}.`)
    setEditingTimeout(null)
    load()
  }

  async function toggleProcessExplorer(org) {
    const res = await guardedFetch(`/api/superadmin/orgs/${org.id}`, {
      method: 'PUT',
      headers: H,
      body: JSON.stringify({
        name: org.name,
        is_active: org.is_active,
        session_timeout_minutes: org.session_timeout_minutes || 30,
        process_explorer_enabled: org.process_explorer_enabled ? 0 : 1,
      }),
    })
    if (!res.ok) return flash('Failed to update Process Explorer setting.', 'error')
    flash(`Process Explorer ${org.process_explorer_enabled ? 'disabled' : 'enabled'} for ${org.name}.`)
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
              <span style={{ fontSize: 11, marginLeft: 8, color: org.process_explorer_enabled ? '#155724' : 'var(--text-muted)' }}>
                🧭 Process Explorer {org.process_explorer_enabled ? 'On' : 'Off'}
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
              <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Process Explorer:</span>
                <span style={{
                  fontSize: 11, padding: '1px 7px', borderRadius: 10,
                  background: org.process_explorer_enabled ? '#d4edda' : '#f8d7da',
                  color: org.process_explorer_enabled ? '#155724' : '#721c24',
                }}>
                  {org.process_explorer_enabled ? 'Enabled' : 'Disabled'}
                </span>
                <button className="btn btn-secondary" style={{ fontSize: 11 }} onClick={() => toggleProcessExplorer(org)}>
                  {org.process_explorer_enabled ? 'Disable' : 'Enable'}
                </button>
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
        guardedFetch('/api/superadmin/orgs', { headers: H }),
        guardedFetch('/api/superadmin/config', { headers: H }),
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
      const res = await guardedFetch('/api/superadmin/config', {
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
      const res = await guardedFetch('/api/superadmin/config/test-email', {
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
      const res = await guardedFetch('/api/superadmin/config', {
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
    const res = await guardedFetch(`/api/superadmin/orgs/${org.id}`, {
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
      const res = await guardedFetch('/api/superadmin/all-users', { headers: H })
      const d = await res.json()
      setUsers(d.users || [])
    } catch { flash('Failed to load users.', 'error') }
    finally { setLoading(false) }
  }

  async function createUser(e) {
    e.preventDefault()
    setCreating(true)
    try {
      const res = await guardedFetch('/api/superadmin/users/create', { method: 'POST', headers: H, body: JSON.stringify(form) })
      const d = await res.json()
      if (!res.ok) return flash(d.error || 'Failed to create user.', 'error')
      const tempPassword = d.temporary_password ? ` Temporary password: ${d.temporary_password}` : ''
      flash(`User created.${tempPassword} User must reset on first login.`, 'success')
      setShowForm(false)
      setForm({ name: '', email: '', role: 'agent' })
      load()
    } catch { flash('Create failed.', 'error') }
    finally { setCreating(false) }
  }

  async function saveUserEdit() {
    if (!editingUser) return
    const res = await guardedFetch(`/api/superadmin/users/${editingUser.id}`, {
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
    const res = await guardedFetch('/api/superadmin/users/bulk-action', {
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
        guardedFetch(`/api/superadmin/users/${user.id}/org-access`, { headers: H }),
        guardedFetch('/api/superadmin/orgs-for-assignment', { headers: H }),
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
      const removedOrgNames = orgAccess
        .filter((oa) => !newOrgIds.has(oa.org_id))
        .map((oa) => oa.org_name || `org-${oa.org_id}`)
      if (removedOrgNames.length > 0 && !window.confirm(`Remove org access for: ${removedOrgNames.join(', ')}?`)) {
        return
      }
      for (const oa of orgAccess) {
        if (!newOrgIds.has(oa.org_id)) {
          await guardedFetch(`/api/superadmin/users/${userId}/org-access/${oa.org_id}`, { method: 'DELETE', headers: H })
        }
      }

      // Add/update org assignments (site + role — modules handled separately)
      for (const orgId of newOrgIds) {
        const siteId = selectedSites[orgId] || null
        const roleAtOrg = selectedOrgRoles[orgId] || 'agent'
        if (!existingOrgIds.has(orgId)) {
          await guardedFetch(`/api/superadmin/users/${userId}/org-access`, {
            method: 'POST', headers: H,
            body: JSON.stringify({ org_id: orgId, primary_site_id: siteId, role_at_org: roleAtOrg }),
          })
        } else {
          await guardedFetch(`/api/superadmin/users/${userId}/org-access/${orgId}`, {
            method: 'PUT', headers: H,
            body: JSON.stringify({ primary_site_id: siteId, role_at_org: roleAtOrg }),
          })
        }
      }

      // Save module access globally for this user
      const modules = Array.from(selectedModules)
      await guardedFetch(`/api/superadmin/users/${userId}/modules`, {
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
    if (!window.confirm(`Reset 2FA for "${user.name}"?`)) return
    const res = await guardedFetch(`/api/superadmin/users/${user.id}/reset-2fa`, {
      method: 'POST',
      headers: H,
    })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to reset 2FA.', 'error')
    flash(`2FA reset for ${user.name}.`)
    load()
  }

  async function unlockUser(user) {
    const res = await guardedFetch(`/api/superadmin/users/${user.id}/unlock`, {
      method: 'POST',
      headers: H,
    })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to unlock user.', 'error')
    flash(data.message || `${user.name} unlocked.`)
    load()
  }

  async function forcePasswordReset(user) {
    const res = await guardedFetch(`/api/superadmin/users/${user.id}/force-password-reset`, {
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
              A unique temporary password will be auto-generated and shown once after creation. User will be prompted to reset on first login.
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
                <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Password</label>
                <input className="form-control" type="text" value="Auto-generated on create" readOnly
                  style={{ background: 'var(--bg)', color: 'var(--text-muted)', cursor: 'default', minWidth: 180 }} />
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
      const res = await guardedFetch(`${endpoint}?${params}`, { headers: H })
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
      const res = await guardedFetch(`/api/superadmin/login-audit?${params}`, { headers: H })
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
    const res = await guardedFetch(`/api/superadmin/alerts/events?${params}`, { headers: H })
    const data = await res.json()
    setEvents(data.events || [])
    setEventsTotal(data.total || 0)
    setEventsOffset(off)
  }, [H.Authorization, eventFilter])

  const load = useCallback(async () => {
    const [rulesRes, templateRes] = await Promise.all([
      guardedFetch('/api/superadmin/alerts/rules', { headers: H }),
      guardedFetch('/api/superadmin/alert-email-template', { headers: H }),
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
  const nextToggleStateLabel = (rule) => (rule.is_active ? 'inactive' : 'active')
  const resetRuleForm = () => ({
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
    const res = await guardedFetch(url, {
      method,
      headers: H,
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to save alert rule.', 'error')
    flash(data.message || 'Alert rule saved.')
    setEventTypeError('')
    setForm(resetRuleForm())
    load()
  }

  async function toggleRule(rule) {
    const res = await guardedFetch(`/api/superadmin/alerts/rules/${rule.id}`, {
      method: 'PUT',
      headers: H,
      body: JSON.stringify({ ...rule, is_active: !rule.is_active }),
    })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to update rule.', 'error')
    flash(`Alert rule set to ${nextToggleStateLabel(rule)}. ${rule.is_active ? 'Events and notifications from this rule will stop.' : 'Events and notifications from this rule will resume.'}`)
    load()
  }

  async function deleteRule(rule) {
    const confirmed = window.confirm(`Delete alert rule "${rule.name}"?`)
    if (!confirmed) return
    const res = await guardedFetch(`/api/superadmin/alerts/rules/${rule.id}`, {
      method: 'DELETE',
      headers: H,
    })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to delete rule.', 'error')
    flash('Alert rule deleted.')
    if (form.id === rule.id) {
      setForm(resetRuleForm())
    }
    load()
  }

  async function saveEmailTemplate() {
    if (!emailTemplate.subject.trim() || !emailTemplate.body.trim()) return flash('Subject and body are required.', 'error')
    setEmailTemplateSaving(true)
    try {
      const res = await guardedFetch('/api/superadmin/alert-email-template', {
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
          <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-muted)', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-secondary)' }}>
            Rule status behavior: <strong>Active</strong> rules can fire alert events and notifications. <strong>Inactive</strong> rules do not fire events or notifications.
            {!form.id && ' New rules are active by default.'}
          </div>
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
              Rule active (if off, this rule will not fire events or notifications)
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
                  <td>
                    <span className="badge" title={rule.is_active ? 'This rule can generate events and notifications.' : 'This rule is disabled and will not generate events or notifications.'}>
                      {rule.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
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
    const res = await guardedFetch('/api/superadmin/notifications?limit=100', { headers: H })
    const data = await res.json()
    setRows(data.notifications || [])
    setUnread(data.unread || 0)
    setSelectedIds(new Set())
  }, [H.Authorization])

  useEffect(() => { load() }, [load])

  async function markRead(id) {
    const res = await guardedFetch(`/api/superadmin/notifications/${id}/read`, { method: 'POST', headers: H })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to update notification.', 'error')
    load()
  }

  async function deleteNotification(id) {
    if (!window.confirm('Delete this notification?')) return
    const res = await guardedFetch(`/api/superadmin/notifications/${id}`, { method: 'DELETE', headers: H })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to delete notification.', 'error')
    flash('Notification deleted.')
    load()
  }

  async function clearAllRead() {
    if (!window.confirm('Delete all read notifications?')) return
    const res = await guardedFetch('/api/superadmin/notifications/read', { method: 'DELETE', headers: H })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to clear read notifications.', 'error')
    flash(data.message || 'All read notifications cleared.')
    load()
  }

  async function deleteSelected() {
    const ids = Array.from(selectedIds)
    if (!ids.length) return
    if (!window.confirm(`Delete ${ids.length} selected notification(s)?`)) return
    for (const id of ids) {
      await guardedFetch(`/api/superadmin/notifications/${id}`, { method: 'DELETE', headers: H })
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

// ── Copy Division View ────────────────────────────────────────────────────────
const COPY_CATEGORY_ICONS = {
  picklists:'📋', case_form:'📝', workflow:'⚙️', integrations:'🔗',
  sites:'🏢', case_numbering:'🔢', products:'💊', cm_settings:'📁', exports:'📤',
}

function CopyDivisionView({ H, flash }) {
  const [orgs,       setOrgs]       = React.useState([])
  const [categories, setCategories] = React.useState([])
  const [sourceOrg,  setSourceOrg]  = React.useState('')
  const [targetOrg,  setTargetOrg]  = React.useState('')
  const [selected,   setSelected]   = React.useState({})
  const [overwrite,  setOverwrite]  = React.useState(false)
  const [preview,    setPreview]    = React.useState(null)
  const [previewing, setPreviewing] = React.useState(false)
  const [executing,  setExecuting]  = React.useState(false)
  const [result,     setResult]     = React.useState(null)
  const [err,        setErr]        = React.useState(null)
  const [confirmed,  setConfirmed]  = React.useState(false)

  React.useEffect(() => {
    Promise.all([
      guardedFetch('/api/admin/copy-division/orgs',       { headers: H }).then(r => r.json()),
      guardedFetch('/api/admin/copy-division/categories', { headers: H }).then(r => r.json()),
    ]).then(([o, c]) => {
      setOrgs(o.orgs || [])
      const cats = c.categories || []
      setCategories(cats)
      const init = {}; cats.forEach(c => { init[c.key] = true }); setSelected(init)
    }).catch(() => setErr('Failed to load data.'))
  }, [])

  const selectedKeys = Object.keys(selected).filter(k => selected[k])
  const canPreview   = sourceOrg && targetOrg && sourceOrg !== targetOrg && selectedKeys.length > 0
  const totalRows    = preview ? Object.values(preview).flatMap(t => Object.values(t)).reduce((a,b)=>a+b,0) : 0
  const sourceOrgName = orgs.find(o => String(o.id) === String(sourceOrg))?.name || ''
  const targetOrgName = orgs.find(o => String(o.id) === String(targetOrg))?.name || ''

  async function handlePreview() {
    setPreviewing(true); setErr(null); setPreview(null); setResult(null); setConfirmed(false)
    try {
      const res  = await guardedFetch('/api/admin/copy-division/preview', {
        method:'POST', headers: H,
        body: JSON.stringify({ source_org_id: parseInt(sourceOrg), categories: selectedKeys }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error); return }
      setPreview(data.preview)
    } catch { setErr('Network error.') } finally { setPreviewing(false) }
  }

  async function handleExecute() {
    setExecuting(true); setErr(null); setResult(null)
    try {
      const res  = await guardedFetch('/api/admin/copy-division/execute', {
        method:'POST', headers: H,
        body: JSON.stringify({ source_org_id: parseInt(sourceOrg), target_org_id: parseInt(targetOrg), categories: selectedKeys, overwrite }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error); return }
      setResult(data.results); setPreview(null); setConfirmed(false)
      flash && flash('Copy completed successfully.', 'success')
    } catch { setErr('Network error.') } finally { setExecuting(false) }
  }

  const cardS = { background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, padding:'18px 22px', marginBottom:16 }
  const labelS = { fontSize:12, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.04em', display:'block', marginBottom:6 }
  const selectS = { padding:'8px 12px', border:'1px solid #cbd5e1', borderRadius:7, fontSize:13, width:'100%', maxWidth:320 }

  return (
    <div style={{ padding:'24px 28px', maxWidth:900 }}>
      <div style={{ marginBottom:6 }}>
        <h2 style={{ fontSize:20, fontWeight:700, color:'#0f172a', margin:0 }}>Copy Division</h2>
        <p style={{ fontSize:13, color:'#64748b', margin:'4px 0 0' }}>Copy all selected configuration from one organisation to another. This action is recorded in the audit log.</p>
      </div>

      {err    && <div style={{ padding:'12px 16px', background:'#fee2e2', color:'#dc2626', borderRadius:8, marginBottom:14, fontSize:13 }}>{err}</div>}
      {result && (
        <div style={{ padding:'14px 18px', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8, marginBottom:14 }}>
          <div style={{ fontWeight:700, color:'#15803d', marginBottom:8 }}>✓ Copy completed</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            {Object.entries(result).map(([k,n]) => {
              const cat = categories.find(c => c.key === k)
              return <span key={k} style={{ padding:'3px 10px', background:'#dcfce7', color:'#15803d', borderRadius:20, fontSize:12 }}>{COPY_CATEGORY_ICONS[k]} {cat?.label}: <strong>{n}</strong></span>
            })}
          </div>
        </div>
      )}

      {/* Step 1 */}
      <div style={cardS}>
        <div style={{ fontWeight:700, fontSize:13, color:'#0f172a', marginBottom:14 }}>Step 1 — Select Organisations</div>
        <div style={{ display:'flex', alignItems:'flex-end', gap:20, flexWrap:'wrap' }}>
          <div>
            <label style={labelS}>Copy FROM (Source)</label>
            <select style={selectS} value={sourceOrg} onChange={e => { setSourceOrg(e.target.value); setPreview(null); setResult(null); setConfirmed(false) }}>
              <option value="">— Select source org —</option>
              {orgs.map(o => <option key={o.id} value={o.id} disabled={String(o.id)===String(targetOrg)}>{o.name}</option>)}
            </select>
          </div>
          <div style={{ fontSize:20, color:'#94a3b8', paddingBottom:6 }}>→</div>
          <div>
            <label style={labelS}>Copy TO (Target)</label>
            <select style={selectS} value={targetOrg} onChange={e => { setTargetOrg(e.target.value); setPreview(null); setResult(null); setConfirmed(false) }}>
              <option value="">— Select target org —</option>
              {orgs.map(o => <option key={o.id} value={o.id} disabled={String(o.id)===String(sourceOrg)}>{o.name}</option>)}
            </select>
          </div>
        </div>
        {sourceOrg && targetOrg && sourceOrg === targetOrg && (
          <div style={{ marginTop:10, fontSize:12, color:'#dc2626' }}>Source and target cannot be the same organisation.</div>
        )}
      </div>

      {/* Step 2 */}
      <div style={cardS}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
          <div style={{ fontWeight:700, fontSize:13, color:'#0f172a' }}>Step 2 — Select Categories</div>
          <div style={{ display:'flex', gap:12 }}>
            <button onClick={() => { const s={}; categories.forEach(c=>{s[c.key]=true}); setSelected(s) }} style={{ background:'none', border:'none', color:'#6366f1', fontSize:12, fontWeight:600, cursor:'pointer' }}>Select all</button>
            <button onClick={() => { const s={}; categories.forEach(c=>{s[c.key]=false}); setSelected(s) }} style={{ background:'none', border:'none', color:'#6366f1', fontSize:12, fontWeight:600, cursor:'pointer' }}>Clear all</button>
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px,1fr))', gap:10 }}>
          {categories.map(cat => (
            <label key={cat.key} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 12px', border:`1.5px solid ${selected[cat.key]?'#6366f1':'#e2e8f0'}`, borderRadius:8, cursor:'pointer', background: selected[cat.key]?'#f5f3ff':'#fff' }}>
              <input type="checkbox" checked={!!selected[cat.key]} style={{ marginTop:2, accentColor:'#6366f1' }}
                onChange={e => { setSelected(s=>({...s,[cat.key]:e.target.checked})); setPreview(null); setConfirmed(false) }} />
              <span style={{ fontSize:16 }}>{COPY_CATEGORY_ICONS[cat.key]||'📦'}</span>
              <span>
                <span style={{ display:'block', fontSize:13, fontWeight:600, color:'#0f172a' }}>{cat.label}</span>
                <span style={{ display:'block', fontSize:11, color:'#64748b' }}>{cat.description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Step 3 */}
      <div style={cardS}>
        <div style={{ fontWeight:700, fontSize:13, color:'#0f172a', marginBottom:12 }}>Step 3 — Options</div>
        <label style={{ display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer', fontSize:13, color:'#334155' }}>
          <input type="checkbox" checked={overwrite} style={{ marginTop:2, accentColor:'#dc2626' }} onChange={e => { setOverwrite(e.target.checked); setPreview(null); setConfirmed(false) }} />
          <span><strong>Overwrite existing records</strong> — deletes all existing config in selected categories for the target org before copying.</span>
        </label>
        {overwrite && <div style={{ marginTop:10, padding:'10px 14px', background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:8, fontSize:13, color:'#c2410c' }}>⚠ Overwrite mode: existing config in selected categories for <strong>{targetOrgName||'the target'}</strong> will be deleted first.</div>}
      </div>

      {/* Preview */}
      {preview && (
        <div style={{ ...cardS, background:'#f8fafc' }}>
          <div style={{ fontWeight:700, fontSize:13, color:'#0f172a', marginBottom:12 }}>Preview — {totalRows} rows will be copied</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px,1fr))', gap:10, marginBottom:16 }}>
            {Object.entries(preview).map(([key, tables]) => {
              const cat = categories.find(c => c.key === key)
              return (
                <div key={key} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 12px' }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#0f172a', marginBottom:6 }}>{COPY_CATEGORY_ICONS[key]} {cat?.label}</div>
                  {Object.entries(tables).map(([tbl,n]) => (
                    <div key={tbl} style={{ display:'flex', justifyContent:'space-between', fontSize:11, padding:'2px 0', borderTop:'1px solid #f1f5f9' }}>
                      <span style={{ color:'#64748b', fontFamily:'monospace' }}>{tbl}</span>
                      <span style={{ color:'#6366f1', fontWeight:700 }}>{n}</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
          {totalRows > 0 && (
            <label style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'12px 14px', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8, cursor:'pointer', fontSize:13, color:'#334155' }}>
              <input type="checkbox" checked={confirmed} style={{ marginTop:2, accentColor:'#6366f1' }} onChange={e => setConfirmed(e.target.checked)} />
              <span>I confirm copying <strong>{totalRows} rows</strong> from <strong>{sourceOrgName}</strong> to <strong>{targetOrgName}</strong>{overwrite?' (overwrite mode)':''}.</span>
            </label>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ display:'flex', gap:12, alignItems:'center' }}>
        <button
          onClick={handlePreview}
          disabled={!canPreview || previewing}
          style={{ padding:'10px 22px', background:'#f1f5f9', color:'#334155', border:'1px solid #cbd5e1', borderRadius:8, fontSize:14, fontWeight:600, cursor: canPreview&&!previewing?'pointer':'not-allowed', opacity: canPreview&&!previewing?1:.5 }}
        >{previewing ? 'Loading…' : '🔍 Preview'}</button>
        {preview && totalRows > 0 && (
          <button
            onClick={handleExecute}
            disabled={!confirmed || executing}
            style={{ padding:'10px 22px', background:'#6366f1', color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:700, cursor: confirmed&&!executing?'pointer':'not-allowed', opacity: confirmed&&!executing?1:.5 }}
          >{executing ? 'Copying…' : `▶ Execute Copy (${totalRows} rows)`}</button>
        )}
      </div>
    </div>
  )
}
