import { useState, useEffect } from 'react'
import { guardedFetch } from '../utils/guardedFetch'
import { confirm } from '../../../shared/utils/confirm'

const MODULES = [
  { key: 'mims_core', label: 'MIMS' },
  { key: 'admin_console', label: 'Admin Console' },
  { key: 'content_mgmt', label: 'Content Management' },
  { key: 'data_visualization', label: 'Data Visualization' },
  { key: 'reports', label: 'Reports' },
]

export default function UsersView({ H, flash }) {
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

  const [assignTarget, setAssignTarget]   = useState(null)
  const [assignTab, setAssignTab]         = useState('org')
  const [allOrgsWithSites, setAllOrgsWithSites] = useState([])
  const [orgAccess, setOrgAccess]         = useState([])
  const [assignLoading, setAssignLoading] = useState(false)
  const [assignSaving, setAssignSaving]   = useState(false)

  const [selectedOrgIds, setSelectedOrgIds] = useState(new Set())
  const [selectedSites, setSelectedSites]   = useState({})
  const [selectedOrgRoles, setSelectedOrgRoles] = useState({})
  const [selectedModules, setSelectedModules] = useState(new Set())

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

      const orgIds = new Set(access.map(a => a.org_id))
      const sites  = {}
      const roles  = {}
      access.forEach(a => {
        sites[a.org_id] = a.primary_site_id || ''
        roles[a.org_id] = a.role_at_org || 'agent'
      })
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

      const removedOrgNames = orgAccess
        .filter((oa) => !newOrgIds.has(oa.org_id))
        .map((oa) => oa.org_name || `org-${oa.org_id}`)
      if (removedOrgNames.length > 0 && !await confirm(`Remove org access for: ${removedOrgNames.join(', ')}?`)) {
        return
      }
      for (const oa of orgAccess) {
        if (!newOrgIds.has(oa.org_id)) {
          await guardedFetch(`/api/superadmin/users/${userId}/org-access/${oa.org_id}`, { method: 'DELETE', headers: H })
        }
      }

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
    if (!await confirm(`Reset 2FA for "${user.name}"?`)) return
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

      {assignTarget && (
        <div className="card" style={{ border: '1px solid var(--primary)' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Org Assignment — {assignTarget.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{assignTarget.email}</div>
            <button className="btn btn-outline" style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 12px' }}
              onClick={() => setAssignTarget(null)}>✕ Close</button>
          </div>

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
