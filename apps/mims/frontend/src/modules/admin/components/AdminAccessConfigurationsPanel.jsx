import { useEffect, useMemo, useState } from 'react'
import { SectionHeader, StatusPill } from './AdminShared'
import { httpFetch } from '../../../shared/api/httpFetch.js'
import { useAuth } from '../../../shared/context/AuthContext'
import { hasGlobalAdminScope } from '../../../shared/utils/adminScope.js'

const TAB_LABELS = [
  ['overview', 'Overview'],
  ['users', 'Users'],
  ['sites', 'Sites'],
  ['groups', 'Groups'],
  ['privileges', 'Privileges'],
  ['requests', 'Requests'],
  ['auth', 'Auth Policy'],
  ['reviews', 'Reviews'],
]

const DEFAULT_TAB_BY_SECTION = {
  'auth-policy': 'auth',
  'security-groups': 'groups',
  'user-security': 'privileges',
  'user-config': 'users',
  'user-security-groups': 'groups',
  'report-access-requests': 'requests',
  'change-approvals': 'requests',
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function boolText(value) {
  return value ? 'On' : 'Off'
}

function formatDate(value) {
  if (!value) return '-'
  try { return new Date(value).toLocaleString() } catch { return String(value) }
}

function groupPrivilegesByCategory(privileges) {
  return asArray(privileges).reduce((acc, privilege) => {
    const category = privilege.category || 'Other'
    if (!acc[category]) acc[category] = []
    acc[category].push(privilege)
    return acc
  }, {})
}

function cardStyle(accent = '#0f766e') {
  return {
    border: '1px solid var(--border)',
    borderLeft: `4px solid ${accent}`,
    borderRadius: 10,
    padding: 16,
    background: 'var(--surface)',
    boxShadow: '0 10px 24px rgba(15,23,42,0.04)',
  }
}

function buttonStyle(primary = false) {
  return {
    border: primary ? '1px solid #0f766e' : '1px solid var(--border)',
    background: primary ? '#0f766e' : 'var(--surface)',
    color: primary ? '#fff' : 'var(--text-primary)',
    borderRadius: 8,
    padding: '8px 12px',
    fontWeight: 700,
    cursor: 'pointer',
  }
}

function buildProviderDraft(providerKey, source = {}) {
  return {
    provider_key: providerKey,
    provider_type: 'oidc',
    client_id: source.client_id || '',
    client_secret: '',
    client_secret_configured: !!source.client_secret_configured,
    tenant_id: providerKey === 'microsoft' ? (source.tenant_id || 'common') : '',
    allowed_domains: asArray(source.allowed_domains).join(', '),
    is_active: !!source.is_active,
    configured: !!source.configured,
    updated_at: source.updated_at || null,
  }
}

function buildEmptyAuthForm() {
  return {
    session_timeout_minutes: 30,
    two_factor_enabled: false,
    two_factor_methods: 'email,totp',
    two_factor_remember_days: 7,
    login_mode: 'local_only',
    providers: {
      google: buildProviderDraft('google'),
      microsoft: buildProviderDraft('microsoft'),
    },
  }
}

export default function AdminAccessConfigurationsPanel({ H, flash, contentSection }) {
  const { user, orgId: activeOrgId, orgName: activeOrgName } = useAuth()
  const isPlatformAdmin = hasGlobalAdminScope(user)
  const [activeTab, setActiveTab] = useState(DEFAULT_TAB_BY_SECTION[contentSection] || 'overview')
  const [orgs, setOrgs] = useState([])
  const [selectedOrgId, setSelectedOrgId] = useState('')
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [selectedPrivilegeKeys, setSelectedPrivilegeKeys] = useState([])
  const [reason, setReason] = useState('Initial enterprise access configuration update')
  const [siteAccessForm, setSiteAccessForm] = useState({ user_id: '', site_id: '', access_level: 'full', is_primary: false })
  const [authForm, setAuthForm] = useState(buildEmptyAuthForm)
  const [requestForm, setRequestForm] = useState({ target_type: 'security_group', target_id: '', action: 'grant_access', reason: '', e_signature_required: true })
  const [snapshotName, setSnapshotName] = useState('')
  const [snapshots, setSnapshots] = useState([])

  const privilegesByCategory = useMemo(() => groupPrivilegesByCategory(overview?.privileges || []), [overview])
  const selectedGroup = useMemo(() => asArray(overview?.groups).find(group => String(group.id) === String(selectedGroupId)) || null, [overview, selectedGroupId])

  useEffect(() => { loadOrgs() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isPlatformAdmin && activeOrgId && String(selectedOrgId) !== String(activeOrgId)) {
      setSelectedOrgId(String(activeOrgId))
    }
  }, [activeOrgId, isPlatformAdmin, selectedOrgId])
  useEffect(() => {
    setActiveTab(DEFAULT_TAB_BY_SECTION[contentSection] || 'overview')
  }, [contentSection])
  useEffect(() => {
    if (selectedOrgId) {
      loadOverview(selectedOrgId)
      loadSnapshots(selectedOrgId)
    }
  }, [selectedOrgId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (selectedGroup) setSelectedPrivilegeKeys(selectedGroup.privilege_keys || [])
  }, [selectedGroupId, overview]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (overview?.auth_policy?.org) {
      const org = overview.auth_policy.org
      const providers = asArray(overview.auth_policy.providers)
      const google = providers.find((provider) => provider.key === 'google') || {}
      const microsoft = providers.find((provider) => provider.key === 'microsoft') || {}
      setAuthForm({
        session_timeout_minutes: org.session_timeout_minutes || 30,
        two_factor_enabled: !!org.two_factor_enabled,
        two_factor_methods: org.two_factor_methods || 'email,totp',
        two_factor_remember_days: org.two_factor_remember_days ?? 7,
        login_mode: org.login_mode || 'local_only',
        providers: {
          google: buildProviderDraft('google', google),
          microsoft: buildProviderDraft('microsoft', microsoft),
        },
      })
    }
  }, [overview?.auth_policy])

  async function loadOrgs() {
    if (!isPlatformAdmin) {
      const fallbackOrgId = activeOrgId ? String(activeOrgId) : ''
      setOrgs(fallbackOrgId ? [{ id: fallbackOrgId, name: activeOrgName || 'Current Organisation' }] : [])
      if (fallbackOrgId) setSelectedOrgId(fallbackOrgId)
      return
    }
    try {
      const data = await httpFetch('/api/admin/orgs', { headers: H }).then(r => r.json())
      const list = data.orgs || []
      setOrgs(list)
      if (!selectedOrgId && list[0]?.id) setSelectedOrgId(String(list[0].id))
    } catch {
      setOrgs([])
    }
  }

  async function loadOverview(orgId = selectedOrgId) {
    if (!orgId) return
    setLoading(true)
    setLoadError('')
    try {
      const data = await httpFetch(`/api/admin/access-config/overview?org_id=${orgId}`, { headers: H }).then(r => r.json())
      if (data.error) throw new Error(data.error)
      setOverview(data)
      if (!selectedGroupId && data.groups?.[0]?.id) setSelectedGroupId(String(data.groups[0].id))
    } catch (err) {
      flash?.(err.message || 'Failed to load access configuration.', 'error')
      setLoadError(err.message || 'Failed to load access configuration.')
      setOverview(null)
    } finally {
      setLoading(false)
    }
  }

  async function loadSnapshots(orgId = selectedOrgId) {
    if (!orgId) return
    try {
      const data = await httpFetch(`/api/admin/access-config/review-snapshots?org_id=${orgId}`, { headers: H }).then(r => r.json())
      setSnapshots(data.snapshots || [])
    } catch {
      setSnapshots([])
    }
  }

  async function postJson(path, body = {}, method = 'POST') {
    const payload = { ...body, org_id: Number(selectedOrgId) }
    const res = await httpFetch(path, { method, headers: H, body: JSON.stringify(payload) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Request failed.')
    return data
  }

  async function seedTemplates() {
    try {
      await postJson('/api/admin/access-config/templates/seed', {})
      flash?.('Enterprise access group templates seeded.')
      await loadOverview()
    } catch (err) { flash?.(err.message, 'error') }
  }

  async function saveGroupPrivileges() {
    if (!selectedGroupId) return
    try {
      await postJson(`/api/admin/access-config/groups/${selectedGroupId}/privileges`, { privilege_keys: selectedPrivilegeKeys, reason }, 'PUT')
      flash?.('Group privileges saved.')
      await loadOverview()
    } catch (err) { flash?.(err.message, 'error') }
  }

  async function saveSiteAccess() {
    if (!siteAccessForm.user_id || !siteAccessForm.site_id) return
    try {
      await postJson('/api/admin/access-config/site-access', { ...siteAccessForm, reason })
      setSiteAccessForm({ user_id: '', site_id: '', access_level: 'full', is_primary: false })
      flash?.('Site access saved.')
      await loadOverview()
    } catch (err) { flash?.(err.message, 'error') }
  }

  async function deactivateSiteAccess(accessId) {
    try {
      await httpFetch(`/api/admin/access-config/site-access/${accessId}?org_id=${selectedOrgId}`, { method: 'DELETE', headers: H, body: JSON.stringify({ reason }) }).then(async r => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.error || 'Failed to deactivate site access.')
      })
      flash?.('Site access deactivated.')
      await loadOverview()
    } catch (err) { flash?.(err.message, 'error') }
  }

  async function saveAuthPolicy() {
    try {
      await postJson('/api/admin/access-config/auth-policy', {
        session_timeout_minutes: Number(authForm.session_timeout_minutes || 30),
        two_factor_enabled: !!authForm.two_factor_enabled,
        two_factor_methods: authForm.two_factor_methods,
        two_factor_remember_days: Number(authForm.two_factor_remember_days || 7),
        login_mode: authForm.login_mode,
        providers: Object.values(authForm.providers || {}).map((provider) => ({
          provider_key: provider.provider_key,
          provider_type: provider.provider_type || 'oidc',
          client_id: provider.client_id,
          client_secret: provider.client_secret,
          tenant_id: provider.provider_key === 'microsoft' ? provider.tenant_id : '',
          allowed_domains: provider.allowed_domains,
          is_active: !!provider.is_active,
        })),
        reason,
      }, 'PUT')
      flash?.('Authentication policy saved.')
      await loadOverview()
    } catch (err) { flash?.(err.message, 'error') }
  }

  async function createAccessRequest() {
    if (!requestForm.reason.trim()) return flash?.('Reason is required for an access request.', 'error')
    try {
      await postJson('/api/admin/access-config/requests', requestForm)
      setRequestForm({ target_type: 'security_group', target_id: '', action: 'grant_access', reason: '', e_signature_required: true })
      flash?.('Access request created.')
      await loadOverview()
    } catch (err) { flash?.(err.message, 'error') }
  }

  async function reviewAccessRequest(id, status) {
    try {
      await postJson(`/api/admin/access-config/requests/${id}/review`, { status, note: reason }, 'PUT')
      flash?.(`Access request ${status}.`)
      await loadOverview()
    } catch (err) { flash?.(err.message, 'error') }
  }

  async function createSnapshot() {
    try {
      await postJson('/api/admin/access-config/review-snapshots', { snapshot_name: snapshotName || undefined })
      setSnapshotName('')
      flash?.('Access review snapshot created.')
      await loadSnapshots()
    } catch (err) { flash?.(err.message, 'error') }
  }

  function togglePrivilege(key) {
    setSelectedPrivilegeKeys(prev => prev.includes(key) ? prev.filter(item => item !== key) : [...prev, key])
  }

  function renderOrgSelector() {
    if (!isPlatformAdmin) {
      return (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button style={buttonStyle()} onClick={() => loadOverview()} disabled={!selectedOrgId || loading}>{loading ? 'Loading...' : 'Refresh'}</button>
          <input className="form-control" style={{ maxWidth: 340 }} value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for access changes" />
        </div>
      )
    }
    return (
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, fontWeight: 700 }}>Organisation</label>
        <select className="form-control" style={{ maxWidth: 300 }} value={selectedOrgId} onChange={e => setSelectedOrgId(e.target.value)}>
          {orgs.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
        </select>
        <button style={buttonStyle()} onClick={() => loadOverview()} disabled={!selectedOrgId || loading}>{loading ? 'Loading...' : 'Refresh'}</button>
        <input className="form-control" style={{ maxWidth: 340 }} value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for access changes" />
      </div>
    )
  }

  function renderTabs() {
    return (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '18px 0' }}>
        {TAB_LABELS.map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} style={{ ...buttonStyle(activeTab === key), padding: '9px 14px' }}>{label}</button>
        ))}
      </div>
    )
  }

  function renderOverview() {
    const summary = overview?.summary || {}
    return (
      <div style={{ display: 'grid', gap: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
          {[
            ['Users', summary.users || 0, '#0f766e'],
            ['Sites', summary.sites || 0, '#2563eb'],
            ['Groups', summary.groups || 0, '#7c3aed'],
            ['Pending Requests', summary.pending_requests || 0, '#d97706'],
            ['Validation Issues', summary.validation_issues || 0, '#dc2626'],
          ].map(([label, value, color]) => (
            <div key={label} style={cardStyle(color)}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>{value}</div>
            </div>
          ))}
        </div>
        <div style={cardStyle('#dc2626')}>
          <h3 style={{ marginTop: 0 }}>Configuration Readiness</h3>
          {asArray(overview?.validation?.issues).length === 0 ? (
            <p style={{ color: 'var(--success)' }}>No access configuration issues found.</p>
          ) : (
            <table className="admin-table"><thead><tr><th>Severity</th><th>Type</th><th>Message</th></tr></thead><tbody>
              {overview.validation.issues.map((issue, idx) => <tr key={`${issue.type}-${idx}`}><td>{issue.severity}</td><td>{issue.type}</td><td>{issue.message}</td></tr>)}
            </tbody></table>
          )}
        </div>
        <div style={cardStyle('#0f766e')}>
          <h3 style={{ marginTop: 0 }}>Enterprise Templates</h3>
          <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>Seeds Admin, MI Agent, Reviewer, Manager, Content Manager, and Read-only Auditor groups with client-ready privileges.</p>
          <button style={buttonStyle(true)} onClick={seedTemplates}>Seed / Refresh Templates</button>
        </div>
      </div>
    )
  }

  function renderUsers() {
    return (
      <div style={cardStyle('#2563eb')}>
        <h3 style={{ marginTop: 0 }}>User Access Lifecycle</h3>
        <table className="admin-table"><thead><tr><th>User</th><th>Role</th><th>Primary Site</th><th>Groups</th><th>Expires</th><th>Status</th></tr></thead><tbody>
          {asArray(overview?.users).map(user => (
            <tr key={user.id}>
              <td><strong>{user.name}</strong><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{user.email}</div></td>
              <td>{user.role_at_org || user.role}</td>
              <td>{user.primary_site_name || '-'}</td>
              <td style={{ maxWidth: 260 }}>{user.groups || '-'}</td>
              <td>{user.access_expires_at ? formatDate(user.access_expires_at) : '-'}</td>
              <td><StatusPill active={user.is_active} /></td>
            </tr>
          ))}
        </tbody></table>
      </div>
    )
  }

  function renderSites() {
    return (
      <div style={{ display: 'grid', gap: 18 }}>
        <div style={cardStyle('#2563eb')}>
          <h3 style={{ marginTop: 0 }}>Site Access Assignment</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
            <select className="form-control" value={siteAccessForm.user_id} onChange={e => setSiteAccessForm(prev => ({ ...prev, user_id: e.target.value }))}>
              <option value="">Select user</option>
              {asArray(overview?.users).map(user => <option key={user.id} value={user.id}>{user.name} ({user.email})</option>)}
            </select>
            <select className="form-control" value={siteAccessForm.site_id} onChange={e => setSiteAccessForm(prev => ({ ...prev, site_id: e.target.value }))}>
              <option value="">Select site</option>
              {asArray(overview?.sites).map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
            <select className="form-control" value={siteAccessForm.access_level} onChange={e => setSiteAccessForm(prev => ({ ...prev, access_level: e.target.value }))}>
              <option value="full">Full</option><option value="read_only">Read only</option><option value="case_intake">Case intake</option><option value="review_only">Review only</option>
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={siteAccessForm.is_primary} onChange={e => setSiteAccessForm(prev => ({ ...prev, is_primary: e.target.checked }))} /> Primary site</label>
            <button style={buttonStyle(true)} onClick={saveSiteAccess}>Save Site Access</button>
          </div>
          <table className="admin-table"><thead><tr><th>User</th><th>Site</th><th>Level</th><th>Primary</th><th>Status</th><th>Action</th></tr></thead><tbody>
            {asArray(overview?.site_access).map(row => (
              <tr key={row.id}><td>{row.user_name}<div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.email}</div></td><td>{row.site_name}</td><td>{row.access_level}</td><td>{boolText(row.is_primary)}</td><td><StatusPill active={row.is_active} /></td><td><button style={buttonStyle()} onClick={() => deactivateSiteAccess(row.id)}>Deactivate</button></td></tr>
            ))}
          </tbody></table>
        </div>
        <div style={cardStyle('#0f766e')}>
          <h3 style={{ marginTop: 0 }}>Site Rules Snapshot</h3>
          <table className="admin-table"><thead><tr><th>Site</th><th>Country</th><th>Default Case Country</th><th>DPPR Off</th><th>RTF</th><th>Assigned Users</th></tr></thead><tbody>
            {asArray(overview?.sites).map(site => <tr key={site.id}><td>{site.name}</td><td>{site.country || '-'}</td><td>{site.default_country_for_case || site.default_country || '-'}</td><td>{boolText(site.dppr_disabled)}</td><td>{boolText(site.right_to_forget_enabled)}</td><td>{site.assigned_user_count}</td></tr>)}
          </tbody></table>
        </div>
      </div>
    )
  }

  function renderGroups() {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 360px) 1fr', gap: 18 }}>
        <div style={cardStyle('#7c3aed')}>
          <h3 style={{ marginTop: 0 }}>Security Groups</h3>
          {asArray(overview?.groups).map(group => (
            <button key={group.id} onClick={() => setSelectedGroupId(String(group.id))} style={{ width: '100%', textAlign: 'left', marginBottom: 8, ...buttonStyle(String(selectedGroupId) === String(group.id)) }}>
              <strong>{group.name}</strong><div style={{ fontSize: 12, opacity: 0.75 }}>{group.user_count} users, {asArray(group.privilege_keys).length} privileges</div>
            </button>
          ))}
        </div>
        <div style={cardStyle('#0f766e')}>
          <h3 style={{ marginTop: 0 }}>{selectedGroup ? selectedGroup.name : 'Select a group'}</h3>
          {selectedGroup && <p style={{ color: 'var(--text-muted)' }}>{selectedGroup.description || 'No description.'}</p>}
          {Object.entries(privilegesByCategory).map(([category, list]) => (
            <div key={category} style={{ marginBottom: 18 }}>
              <h4 style={{ margin: '0 0 8px' }}>{category}</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                {list.map(privilege => (
                  <label key={privilege.privilege_key} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <input type="checkbox" checked={selectedPrivilegeKeys.includes(privilege.privilege_key)} onChange={() => togglePrivilege(privilege.privilege_key)} />
                    <span><strong>{privilege.label}</strong>{privilege.is_sensitive && <span style={{ color: '#dc2626', marginLeft: 6 }}>Sensitive</span>}<div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{privilege.description}</div></span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <button style={buttonStyle(true)} onClick={saveGroupPrivileges} disabled={!selectedGroup}>Save Group Privileges</button>
        </div>
      </div>
    )
  }

  function renderPrivileges() {
    return (
      <div style={cardStyle('#7c3aed')}>
        <h3 style={{ marginTop: 0 }}>Role, Menu, and Activity Privilege Matrix</h3>
        <table className="admin-table"><thead><tr><th>Category</th><th>Privilege</th><th>Key</th><th>Sensitive</th><th>Default Roles</th></tr></thead><tbody>
          {asArray(overview?.privileges).map(privilege => <tr key={privilege.privilege_key}><td>{privilege.category}</td><td>{privilege.label}</td><td>{privilege.privilege_key}</td><td>{boolText(privilege.is_sensitive)}</td><td>{asArray(privilege.default_allowed_roles).join(', ') || '-'}</td></tr>)}
        </tbody></table>
      </div>
    )
  }

  function renderRequests() {
    return (
      <div style={{ display: 'grid', gap: 18 }}>
        <div style={cardStyle('#d97706')}>
          <h3 style={{ marginTop: 0 }}>Create Access Request</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <select className="form-control" value={requestForm.target_type} onChange={e => setRequestForm(prev => ({ ...prev, target_type: e.target.value }))}><option value="security_group">Security Group</option><option value="user_site_access">User Site Access</option><option value="report_access">Report Access</option><option value="auth_policy">Auth Policy</option></select>
            <input className="form-control" value={requestForm.target_id} onChange={e => setRequestForm(prev => ({ ...prev, target_id: e.target.value }))} placeholder="Target ID" />
            <input className="form-control" value={requestForm.action} onChange={e => setRequestForm(prev => ({ ...prev, action: e.target.value }))} placeholder="Action" />
            <input className="form-control" value={requestForm.reason} onChange={e => setRequestForm(prev => ({ ...prev, reason: e.target.value }))} placeholder="Reason" />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={requestForm.e_signature_required} onChange={e => setRequestForm(prev => ({ ...prev, e_signature_required: e.target.checked }))} /> E-sign required</label>
            <button style={buttonStyle(true)} onClick={createAccessRequest}>Submit Request</button>
          </div>
        </div>
        <div style={cardStyle('#d97706')}>
          <h3 style={{ marginTop: 0 }}>Access Requests</h3>
          <table className="admin-table"><thead><tr><th>Request</th><th>Requester</th><th>Status</th><th>Reason</th><th>Created</th><th>Actions</th></tr></thead><tbody>
            {asArray(overview?.requests).map(req => <tr key={req.id}><td>{req.action}<div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{req.target_type} #{req.target_id || '-'}</div></td><td>{req.requester_name || req.requested_by}</td><td>{req.status}</td><td>{req.reason || '-'}</td><td>{formatDate(req.created_at)}</td><td>{req.status === 'pending' ? <div style={{ display: 'flex', gap: 6 }}><button style={buttonStyle(true)} onClick={() => reviewAccessRequest(req.id, 'approved')}>Approve</button><button style={buttonStyle()} onClick={() => reviewAccessRequest(req.id, 'rejected')}>Reject</button></div> : '-'}</td></tr>)}
          </tbody></table>
        </div>
      </div>
    )
  }

  function renderAuth() {
    const loginModeSummary = {
      local_only: 'Users will see only password login.',
      sso_only: 'Users will see only approved SSO providers.',
      local_and_sso: 'Users will see both password login and approved SSO providers.',
    }
    const providerEntries = [
      ['google', 'Google', '#dc2626'],
      ['microsoft', 'Microsoft 365', '#2563eb'],
    ]

    function updateProvider(providerKey, field, value) {
      setAuthForm((prev) => ({
        ...prev,
        providers: {
          ...prev.providers,
          [providerKey]: {
            ...prev.providers[providerKey],
            [field]: value,
          },
        },
      }))
    }

    return (
      <div style={{ display: 'grid', gap: 18 }}>
        <div style={cardStyle('#0f766e')}>
          <h3 style={{ marginTop: 0 }}>Authentication and Login Policy</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <label>Session timeout minutes<input className="form-control" type="number" value={authForm.session_timeout_minutes} onChange={e => setAuthForm(prev => ({ ...prev, session_timeout_minutes: e.target.value }))} /></label>
            <label>MFA methods<input className="form-control" value={authForm.two_factor_methods} onChange={e => setAuthForm(prev => ({ ...prev, two_factor_methods: e.target.value }))} /></label>
            <label>Trusted-device days<input className="form-control" type="number" value={authForm.two_factor_remember_days} onChange={e => setAuthForm(prev => ({ ...prev, two_factor_remember_days: e.target.value }))} /></label>
            <label>Login mode
              <select className="form-control" value={authForm.login_mode} onChange={e => setAuthForm(prev => ({ ...prev, login_mode: e.target.value }))}>
                <option value="local_only">Local login only</option>
                <option value="sso_only">SSO only</option>
                <option value="local_and_sso">Local + SSO</option>
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={authForm.two_factor_enabled} onChange={e => setAuthForm(prev => ({ ...prev, two_factor_enabled: e.target.checked }))} /> Require MFA</label>
          </div>
          <div style={{ marginTop: 14, padding: 12, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface-alt, #f8fafc)' }}>
            <strong>User login experience</strong>
            <div style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: 13 }}>{loginModeSummary[authForm.login_mode]}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
          {providerEntries.map(([providerKey, label, accent]) => {
            const provider = authForm.providers?.[providerKey] || buildProviderDraft(providerKey)
            return (
              <div key={providerKey} style={cardStyle(accent)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{label}</h3>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                      Status: {provider.is_active ? 'Enabled' : 'Disabled'} | Credentials: {provider.client_secret_configured ? 'Configured' : 'Missing'}
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>
                    <input type="checkbox" checked={provider.is_active} onChange={e => updateProvider(providerKey, 'is_active', e.target.checked)} />
                    Active
                  </label>
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  <label>Client ID
                    <input className="form-control" value={provider.client_id} onChange={e => updateProvider(providerKey, 'client_id', e.target.value)} placeholder={providerKey === 'google' ? 'Google OAuth Client ID' : 'Microsoft Application (Client) ID'} />
                  </label>
                  <label>Client Secret
                    <input className="form-control" type="password" value={provider.client_secret} onChange={e => updateProvider(providerKey, 'client_secret', e.target.value)} placeholder={provider.client_secret_configured ? 'Configured. Enter a new secret only to replace it.' : 'Paste provider secret'} />
                  </label>
                  {providerKey === 'microsoft' && (
                    <label>Tenant ID
                      <input className="form-control" value={provider.tenant_id} onChange={e => updateProvider(providerKey, 'tenant_id', e.target.value)} placeholder="common or specific tenant ID" />
                    </label>
                  )}
                  <label>Allowed email domains
                    <input className="form-control" value={provider.allowed_domains} onChange={e => updateProvider(providerKey, 'allowed_domains', e.target.value)} placeholder="example.com, partner.org" />
                  </label>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Login button visibility: {provider.is_active && provider.client_id && (provider.client_secret || provider.client_secret_configured) ? `Users will see Continue with ${label}.` : `${label} button will stay hidden until credentials are complete.`}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div style={cardStyle('#0f766e')}>
          <h3 style={{ marginTop: 0 }}>Login Preview</h3>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>
            This preview reflects what users in the selected organisation will see on the MIMS login page.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ padding: '6px 10px', borderRadius: 999, background: authForm.login_mode !== 'sso_only' ? '#dcfce7' : '#fee2e2', color: authForm.login_mode !== 'sso_only' ? '#166534' : '#991b1b', fontWeight: 700, fontSize: 12 }}>
              Password Login: {authForm.login_mode !== 'sso_only' ? 'Shown' : 'Hidden'}
            </span>
            {Object.values(authForm.providers || {}).map((provider) => {
              const ready = provider.is_active && provider.client_id && (provider.client_secret || provider.client_secret_configured)
              return (
                <span key={provider.provider_key} style={{ padding: '6px 10px', borderRadius: 999, background: ready ? '#dbeafe' : '#f3f4f6', color: ready ? '#1d4ed8' : '#475569', fontWeight: 700, fontSize: 12 }}>
                  {provider.provider_key === 'google' ? 'Google' : 'Microsoft'}: {ready ? 'Shown' : 'Hidden'}
                </span>
              )
            })}
          </div>
          <div style={{ marginTop: 14 }}><button style={buttonStyle(true)} onClick={saveAuthPolicy}>Save Auth Policy</button></div>
        </div>
      </div>
    )
  }

  function renderReviews() {
    return (
      <div style={cardStyle('#dc2626')}>
        <h3 style={{ marginTop: 0 }}>Access Review Evidence</h3>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <input className="form-control" style={{ maxWidth: 360 }} value={snapshotName} onChange={e => setSnapshotName(e.target.value)} placeholder="Snapshot name" />
          <button style={buttonStyle(true)} onClick={createSnapshot}>Create Review Snapshot</button>
        </div>
        <table className="admin-table"><thead><tr><th>Name</th><th>Created</th><th>Created By</th></tr></thead><tbody>
          {snapshots.map(snapshot => <tr key={snapshot.id}><td>{snapshot.snapshot_name}</td><td>{formatDate(snapshot.created_at)}</td><td>{snapshot.created_by || '-'}</td></tr>)}
        </tbody></table>
      </div>
    )
  }

  function renderActiveTab() {
    if (!overview) {
      return (
        <div style={cardStyle(loadError ? '#dc2626' : '#64748b')}>
          {loading ? 'Loading access configuration...' : (loadError || (selectedOrgId ? 'No access configuration data available for this organisation.' : 'Select an organisation to load access configuration.'))}
        </div>
      )
    }
    if (activeTab === 'users') return renderUsers()
    if (activeTab === 'sites') return renderSites()
    if (activeTab === 'groups') return renderGroups()
    if (activeTab === 'privileges') return renderPrivileges()
    if (activeTab === 'requests') return renderRequests()
    if (activeTab === 'auth') return renderAuth()
    if (activeTab === 'reviews') return renderReviews()
    return renderOverview()
  }

  return (
    <div style={{ padding: 24, maxWidth: 1320 }}>
      <SectionHeader title="Access Configurations" desc="Unified tenant, site, group, privilege, report, authentication, and audit controls for enterprise MIMS clients." />
      {renderOrgSelector()}
      {renderTabs()}
      {renderActiveTab()}
    </div>
  )
}
