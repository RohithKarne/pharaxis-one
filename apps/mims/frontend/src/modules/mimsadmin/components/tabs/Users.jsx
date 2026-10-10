/**
 * Users.jsx — MIMS Admin > System > Security > Add / Edit Users
 * CSS namespace: ma-usr-
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch.js'
import { isPlatformAdmin } from '../../../../shared/utils/adminScope'
import AuditChip from '../../../../shared/components/AuditChip'
import SavedViews from '../../../../shared/components/SavedViews'
import BulkUserImport from './BulkUserImport'
import './Users.css'

const API = '/api/admin'
const PAGE_SIZE = 100

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
// MIPM-35: when someone was switched off — date and time.
function fmtDateTime(d) {
  if (!d) return ''
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function isExpired(d) {
  return d && new Date(d) < new Date()
}

// ── Empty form state ──────────────────────────────────────────────────────────
const EMPTY_FORM = {
  user_id: '', name: '', email: '', initials: '', role: 'agent',
  security_group_id: '', network_user_id: '', department: '',
  is_active: true, is_disabled: false, is_primary_ref: false,
  access_admin_site: false, case_admin: false,
  tenant_ids: [],
}

// ─────────────────────────────────────────────────────────────────────────────
export default function Users() {
  const { token } = useAuth()
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  const [users,      setUsers]      = useState([])
  const [total,      setTotal]      = useState(0)
  const [loading,    setLoading]    = useState(false)
  const [search,     setSearch]     = useState('')
  const [groups,     setGroups]     = useState([])
  const [orgs,       setOrgs]       = useState([])
  const [modalOpen,  setModalOpen]  = useState(false)
  const [bulkOpen,   setBulkOpen]   = useState(false)
  const [editUser,   setEditUser]   = useState(null)   // null = create, object = edit
  const [flash,      setFlash]      = useState(null)

  // Quick filters
  const [fltRole,    setFltRole]    = useState('')   // '' | 'admin' | 'agent' | 'reviewer' | 'content_manager'
  const [fltStatus,  setFltStatus]  = useState('')   // '' | 'active' | 'inactive' | 'disabled'
  const [fltGroup,   setFltGroup]   = useState('')   // security_group_id
  const [page,       setPage]       = useState(0)
  const [loadError,  setLoadError]  = useState('')
  const currentFilter = useMemo(() => ({ search, fltRole, fltStatus, fltGroup }), [search, fltRole, fltStatus, fltGroup])
  function applySavedView(f) {
    setPage(0)
    setSearch(f.search || '')
    setFltRole(f.fltRole || '')
    setFltStatus(f.fltStatus || '')
    setFltGroup(f.fltGroup || '')
  }

  // Load reference data once
  useEffect(() => {
    Promise.all([
      httpFetch(`${API}/users/security-groups`, { headers: H }).then(r => r.json()),
      httpFetch(`${API}/users/orgs`,            { headers: H }).then(r => r.json()),
    ]).then(([g, o]) => {
      setGroups(g.groups || [])
      setOrgs(o.orgs     || [])
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Search and filters run on the server, so they reach every user, not only the loaded page.
  const loadUsers = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const qs = new URLSearchParams({
        search, role: fltRole, status: fltStatus, group: fltGroup,
        limit: PAGE_SIZE, offset: page * PAGE_SIZE,
      })
      const res = await httpFetch(`${API}/users?${qs}`, { headers: H })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not load users.')
      setUsers(data.users || [])
      setTotal(data.total || 0)
    } catch (e) {
      setUsers([])
      setLoadError(e instanceof TypeError ? 'Could not load users: the server could not be reached.' : e.message)
    }
    finally   { setLoading(false) }
  }, [search, fltRole, fltStatus, fltGroup, page]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadUsers() }, [loadUsers])

  function showFlash(msg, type = 'success') {
    setFlash({ msg, type })
    setTimeout(() => setFlash(null), 3500)
  }

  function openCreate() { setEditUser(null); setModalOpen(true) }

  async function openEdit(user) {
    try {
      const data = await httpFetch(`${API}/users/${user.id}`, { headers: H }).then(r => r.json())
      setEditUser(data.user)
      setModalOpen(true)
    } catch { showFlash('Failed to load user.', 'error') }
  }

  function closeModal() { setModalOpen(false); setEditUser(null) }

  async function onSaved() {
    closeModal()
    await loadUsers()
    showFlash(editUser ? 'User updated.' : 'User created. They set their password with “Forgot password” on the sign-in page.')
  }

  const filtered = users
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="ma-usr-page">

      {/* Flash */}
      {flash && (
        <div style={{
          padding: '10px 16px', borderRadius: 7, fontSize: 13, fontWeight: 600,
          background: flash.type === 'error' ? '#fdecea' : '#e6f9ee',
          color:      flash.type === 'error' ? '#b91c1c' : '#1a7a3f',
          border:     `1px solid ${flash.type === 'error' ? '#f5c6c6' : '#a7f3c1'}`,
        }}>
          {flash.msg}
        </div>
      )}

      {/* Toolbar */}
      <div className="ma-usr-toolbar">
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
            Add / Edit Users
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {loading ? 'Loading…' : loadError ? 'Not loaded' : `${total} user${total !== 1 ? 's' : ''} found`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input aria-label="Search users"
            className="ma-usr-search"
            placeholder="Search name, email, user ID…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
          />
          <select aria-label="Filter by role"
            value={fltRole}
            onChange={e => { setFltRole(e.target.value); setPage(0) }}
            style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, background: 'var(--surface)' }}
          >
            <option value="">All Roles</option>
            <option value="admin">Admin</option>
            <option value="agent">Agent</option>
            <option value="reviewer">Reviewer</option>
            <option value="content_manager">Content Manager</option>
          </select>
          <select aria-label="Filter by status"
            value={fltStatus}
            onChange={e => { setFltStatus(e.target.value); setPage(0) }}
            style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, background: 'var(--surface)' }}
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="disabled">Disabled</option>
          </select>
          <select aria-label="Filter by group"
            value={fltGroup}
            onChange={e => { setFltGroup(e.target.value); setPage(0) }}
            style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, background: 'var(--surface)' }}
          >
            <option value="">All Groups</option>
            {groups.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <SavedViews
            screenKey="users"
            currentFilter={currentFilter}
            onApply={applySavedView}
          />
          <button
            className="ma-usr-edit-btn"
            title="Download users as CSV"
            onClick={async () => {
              try {
                const r = await httpFetch(`/api/admin/users/export?search=${encodeURIComponent(search)}`, { headers: H })
                if (!r.ok) { showFlash('Export failed.', 'error'); return }
                const text = await r.text()
                const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
                const url  = URL.createObjectURL(blob)
                const a    = document.createElement('a')
                a.href = url
                a.download = `users-export-${new Date().toISOString().slice(0, 10)}.csv`
                document.body.appendChild(a); a.click(); document.body.removeChild(a)
                URL.revokeObjectURL(url)
                showFlash('CSV downloaded.')
              } catch { showFlash('Network error.', 'error') }
            }}
          >Export CSV</button>
          <button className="ma-usr-btn-bulk" onClick={() => setBulkOpen(true)}>Bulk Add</button>
          <button className="ma-usr-btn-add" onClick={openCreate}>+ Add User</button>
        </div>
      </div>

      {/* Table */}
      <div className="ma-usr-table-wrap">
        <table className="ma-usr-table">
          <thead>
            <tr>
              <th>User ID</th>
              <th>Full Name</th>
              <th>Email</th>
              <th>Security Group</th>
              <th>Department</th>
              <th>Status</th>
              <th>Pwd Expires</th>
              <th>Last Modified</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} className="ma-usr-empty">Loading users…</td></tr>
            )}
            {!loading && loadError && (
              <tr><td colSpan={9} className="ma-usr-empty mims-load-error" role="alert">{loadError} <button className="ma-usr-edit-btn" onClick={() => loadUsers()}>Try again</button></td></tr>
            )}
            {!loading && !loadError && filtered.length === 0 && (
              <tr><td colSpan={9} className="ma-usr-empty">No users found.</td></tr>
            )}
            {!loading && filtered.map(u => (
              <tr key={u.id} onClick={() => openEdit(u)}>
                <td style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>
                  {u.user_id || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                </td>
                <td>{u.name}</td>
                <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{u.email}</td>
                <td style={{ fontSize: 12 }}>{u.security_group_name || '—'}</td>
                <td style={{ fontSize: 12 }}>{u.department || '—'}</td>
                <td>
                  {u.is_disabled
                    ? <span className="ma-usr-pill ma-usr-pill-disabled">Disabled</span>
                    : u.is_active
                      ? <span className="ma-usr-pill ma-usr-pill-active">Active</span>
                      : <span className="ma-usr-pill ma-usr-pill-inactive">Inactive</span>
                  }
                  {(!u.is_active || !!u.is_disabled) && !!u.inactive_reason && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      {u.inactive_reason}{u.inactive_at ? ` · ${fmtDateTime(u.inactive_at)}` : ''}
                    </div>
                  )}
                </td>
                <td style={{ fontSize: 12, color: isExpired(u.password_expires_at) ? 'var(--error, #c00)' : 'var(--text-muted)' }}>
                  {fmtDate(u.password_expires_at)}
                  {isExpired(u.password_expires_at) && ' (expired)'}
                </td>
                <td onClick={e => e.stopPropagation()}>
                  <AuditChip
                    entity="user"
                    entityId={u.id}
                    updatedBy={u.updated_by_name}
                    updatedAt={u.updated_at}
                  />
                </td>
                <td>
                  <button
                    className="ma-usr-edit-btn"
                    onClick={e => { e.stopPropagation(); openEdit(u) }}
                  >Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > PAGE_SIZE && (
        <div className="ma-usr-pager">
          <span>Showing {page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)} of {total}</span>
          <button className="ma-usr-edit-btn" disabled={page === 0 || loading} onClick={() => setPage(p => p - 1)}>Prev</button>
          <button className="ma-usr-edit-btn" disabled={page + 1 >= pageCount || loading} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <UserFormModal
          editUser={editUser}
          groups={groups}
          orgs={orgs}
          H={H}
          onSaved={onSaved}
          onClose={closeModal}
          showFlash={showFlash}
        />
      )}

      {bulkOpen && (
        <BulkUserImport
          groups={groups}
          orgs={orgs}
          token={token}
          onClose={() => setBulkOpen(false)}
          onCreated={(count) => {
            showFlash(`${count} user${count === 1 ? '' : 's'} created.`)
            loadUsers()
          }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// UserFormModal — 3-tab form
// ─────────────────────────────────────────────────────────────────────────────
function UserFormModal({ editUser, groups, orgs, H, onSaved, onClose, showFlash }) {
  const isEdit = !!editUser
  // Break-glass (2026-09-23): only a platform admin can make another user a platform admin.
  const { user: me } = useAuth()
  const canGrantPlatformAdmin = isEdit && isPlatformAdmin(me)

  const [tab,     setTab]     = useState('general')
  const [securityBusy, setSecurityBusy] = useState('')
  const [saving,  setSaving]  = useState(false)
  const [errors,  setErrors]  = useState({})
  const [apiErr,  setApiErr]  = useState('')

  // ── Form state ──────────────────────────────────────────────────────────────
  const [form, setForm] = useState(() => {
    if (!isEdit) return { ...EMPTY_FORM }
    return {
      user_id:          editUser.user_id          || '',
      name:             editUser.name             || '',
      email:            editUser.email            || '',
      initials:         editUser.initials         || '',
      role:             editUser.role             || 'agent',
      security_group_id: editUser.security_group_id ? String(editUser.security_group_id) : '',
      network_user_id:  editUser.network_user_id  || '',
      department:       editUser.department       || '',
      is_active:        !!editUser.is_active,
      is_disabled:      !!editUser.is_disabled,
      is_primary_ref:   !!editUser.is_primary_ref,
      access_admin_site:!!editUser.access_admin_site,
      case_admin:       !!editUser.case_admin,
      tenant_ids:       editUser.tenant_ids       || [],
      inactive_reason:  '',
      reactivation_reason: '',
    }
  })

  // MIPM-35: switching someone back on needs a reason; switching off may give one.
  const wasOff     = isEdit && (!editUser.is_active || !!editUser.is_disabled)
  const willBeOff  = !form.is_active || form.is_disabled
  const switchingOn  = wasOff && !willBeOff
  const switchingOff = isEdit && !wasOff && willBeOff

  // ── Quick Actions state ─────────────────────────────────────────────────────
  const [expiringNow,   setExpiringNow]   = useState(false)
  const [showPwdForm,   setShowPwdForm]   = useState(false)
  const [newPwd,        setNewPwd]        = useState('')
  const [confirmPwd,    setConfirmPwd]    = useState('')
  const [pwdSaving,     setPwdSaving]     = useState(false)
  const [pwdErr,        setPwdErr]        = useState('')

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }))
    if (errors[key]) setErrors(e => ({ ...e, [key]: '' }))
  }
  function toggle(key) { set(key, !form[key]) }

  function toggleTenant(orgId) {
    setForm(f => ({
      ...f,
      tenant_ids: f.tenant_ids.includes(orgId)
        ? f.tenant_ids.filter(id => id !== orgId)
        : [...f.tenant_ids, orgId],
    }))
    if (errors.tenant_ids) setErrors(e => ({ ...e, tenant_ids: '' }))
  }

  // ── Validation ──────────────────────────────────────────────────────────────
  function validate() {
    const e = {}
    if (!form.user_id.trim())        e.user_id          = 'User ID is required.'
    if (!form.name.trim())           e.name             = 'Full Name is required.'
    if (!form.security_group_id)     e.security_group_id= 'Security Group is required.'
    if (!form.email.trim())          e.email            = 'Email Account is required.'
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Enter a valid email address.'
    if (!form.tenant_ids.length)     e.tenant_ids       = 'Select at least one tenant.'
    if (switchingOn && !String(form.reactivation_reason || '').trim())
      e.reactivation_reason = 'Enter a reason for switching this user back on.'
    return e
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  async function handleSave() {
    setApiErr('')
    const e = validate()
    if (Object.keys(e).length) {
      setErrors(e)
      // Jump to first tab with error
      if (e.user_id || e.name || e.security_group_id || e.email || e.reactivation_reason) setTab('general')
      else if (e.tenant_ids) setTab('tenants')
      return
    }

    setSaving(true)
    try {
      const body = {
        ...form,
        security_group_id: form.security_group_id ? parseInt(form.security_group_id, 10) : null,
        is_active:    form.is_active    ? 1 : 0,
        is_disabled:  form.is_disabled  ? 1 : 0,
        is_primary_ref:    form.is_primary_ref    ? 1 : 0,
        access_admin_site: form.access_admin_site ? 1 : 0,
        case_admin:        form.case_admin        ? 1 : 0,
      }

      if (isEdit) {
        // Update fields
        const r = await httpFetch(`/api/admin/users/${editUser.id}`, {
          method: 'PUT', headers: H, body: JSON.stringify(body),
        })
        const d = await r.json()
        if (!r.ok) { setApiErr(d.error || 'Failed to update user.'); return }

        // Update tenants separately
        const rt = await httpFetch(`/api/admin/users/${editUser.id}/tenants`, {
          method: 'PUT', headers: H,
          body: JSON.stringify({ tenant_ids: form.tenant_ids }),
        })
        const dt = await rt.json()
        if (!rt.ok) { setApiErr(dt.error || 'Failed to update tenants.'); return }
      } else {
        // Create (tenants included in body)
        const r = await httpFetch('/api/admin/users', {
          method: 'POST', headers: H, body: JSON.stringify(body),
        })
        const d = await r.json()
        if (!r.ok) { setApiErr(d.error || 'Failed to create user.'); return }
      }

      onSaved()
    } catch { setApiErr('Network error. Please try again.') }
    finally  { setSaving(false) }
  }

  // ── Quick Actions handlers ──────────────────────────────────────────────────
  async function handleExpirePassword() {
    setExpiringNow(true)
    try {
      const r = await httpFetch(`/api/admin/users/${editUser.id}/expire-password`, {
        method: 'POST', headers: H,
      })
      const d = await r.json()
      if (!r.ok) { showFlash(d.error || 'Failed to expire password.', 'error'); return }
      showFlash('Password expired. User must reset on next login.')
    } catch { showFlash('Network error.', 'error') }
    finally { setExpiringNow(false) }
  }

  // Platform admin only: the lock message tells the user to ask for exactly this,
  // and there was no button for it (MIPM-144).
  async function handleSecurityAction(action, okText) {
    setSecurityBusy(action)
    try {
      const r = await httpFetch(`/api/admin/platform/users/${editUser.id}/${action}`, { method: 'POST', headers: H })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { showFlash(d.error || 'Action failed.', 'error'); return }
      showFlash(d.message || okText)
    } catch { showFlash('Network error.', 'error') }
    finally { setSecurityBusy('') }
  }

  async function handleChangePassword() {
    setPwdErr('')
    if (!newPwd || newPwd.length < 8) { setPwdErr('Password must be at least 8 characters.'); return }
    if (newPwd !== confirmPwd)        { setPwdErr('Passwords do not match.'); return }
    setPwdSaving(true)
    try {
      const r = await httpFetch(`/api/admin/users/${editUser.id}/change-password`, {
        method: 'PUT', headers: H, body: JSON.stringify({ new_password: newPwd }),
      })
      const d = await r.json()
      if (!r.ok) { setPwdErr(d.error || 'Failed to change password.'); return }
      setNewPwd(''); setConfirmPwd(''); setShowPwdForm(false)
      showFlash('Password changed successfully.')
    } catch { setPwdErr('Network error.') }
    finally { setPwdSaving(false) }
  }

  const isSSO       = !!editUser?.network_user_id
  const expiresAt   = editUser?.password_expires_at
  const expired     = isExpired(expiresAt)

  return (
    <div className="ma-usr-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="ma-usr-modal">

        {/* Header */}
        <div className="ma-usr-modal-header">
          <h2 className="ma-usr-modal-title">
            {isEdit ? `Edit User — ${editUser.name}` : 'Add New User'}
          </h2>
          <button className="ma-usr-modal-close" onClick={onClose}>×</button>
        </div>

        {/* Tabs */}
        <div className="ma-usr-modal-tabs">
          {[
            { key: 'general',  label: 'General Information' },
            { key: 'actions',  label: 'Quick Actions',       hidden: !isEdit },
            { key: 'tenants',  label: 'Divisions / Tenants' },
          ].filter(t => !t.hidden).map(t => (
            <div
              key={t.key}
              className={`ma-usr-modal-tab${tab === t.key ? ' active' : ''}${
                (t.key === 'general' && (errors.user_id || errors.name || errors.security_group_id || errors.email)) ||
                (t.key === 'tenants' && errors.tenant_ids)
                  ? ' has-error' : ''
              }`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {((t.key === 'general' && (errors.user_id || errors.name || errors.security_group_id || errors.email)) ||
                (t.key === 'tenants' && errors.tenant_ids)) && (
                <span style={{ color: 'var(--error,#c00)', marginLeft: 5 }}>*</span>
              )}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="ma-usr-modal-body">

          {/* ── TAB 1: General Information ── */}
          {tab === 'general' && (
            <>
              {/* Top checkboxes */}
              <div>
                <div className="ma-usr-section-title" style={{ marginBottom: 10 }}>Status</div>
                <div className="ma-usr-checks">
                  <label className="ma-usr-check">
                    <input type="checkbox" checked={!form.is_active} onChange={() => toggle('is_active')} />
                    Inactive
                  </label>
                  <label className="ma-usr-check">
                    <input type="checkbox" checked={form.is_disabled} onChange={() => toggle('is_disabled')} />
                    Disabled
                  </label>
                </div>
                {wasOff && editUser.inactive_reason && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                    Switched off: {editUser.inactive_reason}{editUser.inactive_at ? ` · ${fmtDateTime(editUser.inactive_at)}` : ''}
                  </div>
                )}
                {switchingOn && (
                  <div className="ma-usr-field" style={{ marginTop: 10 }}>
                    <label>Reason for switching back on <span className="req">*</span></label>
                    <input
                      className={`ma-usr-input${errors.reactivation_reason ? ' err' : ''}`}
                      value={form.reactivation_reason}
                      onChange={e => set('reactivation_reason', e.target.value)}
                      placeholder="e.g. Returned from leave"
                      maxLength={255}
                    />
                    {errors.reactivation_reason && <span className="ma-usr-err-msg">{errors.reactivation_reason}</span>}
                  </div>
                )}
                {switchingOff && (
                  <div className="ma-usr-field" style={{ marginTop: 10 }}>
                    <label>Reason for switching off</label>
                    <input aria-label="Reason for switching off"
                      className="ma-usr-input"
                      value={form.inactive_reason}
                      onChange={e => set('inactive_reason', e.target.value)}
                      placeholder="e.g. Left the company"
                      maxLength={255}
                    />
                  </div>
                )}
              </div>

              <div className="ma-usr-row">
                <div className="ma-usr-field">
                  <label>User ID <span className="req">*</span></label>
                  <input
                    className={`ma-usr-input${errors.user_id ? ' err' : ''}`}
                    value={form.user_id}
                    onChange={e => set('user_id', e.target.value)}
                    placeholder="e.g. USR-001"
                  />
                  {errors.user_id && <span className="ma-usr-err-msg">{errors.user_id}</span>}
                </div>
                <div className="ma-usr-field">
                  <label>Initials</label>
                  <input aria-label="Initials"
                    className="ma-usr-input"
                    value={form.initials}
                    onChange={e => set('initials', e.target.value.toUpperCase().slice(0, 5))}
                    placeholder="e.g. RK"
                    maxLength={5}
                  />
                </div>
              </div>

              <div className="ma-usr-row">
                <div className="ma-usr-field">
                  <label>Full Name <span className="req">*</span></label>
                  <input
                    className={`ma-usr-input${errors.name ? ' err' : ''}`}
                    value={form.name}
                    onChange={e => set('name', e.target.value)}
                    placeholder="Full name"
                  />
                  {errors.name && <span className="ma-usr-err-msg">{errors.name}</span>}
                </div>
                <div className="ma-usr-field">
                  <label>Email Account <span className="req">*</span></label>
                  <input
                    className={`ma-usr-input${errors.email ? ' err' : ''}`}
                    type="email"
                    value={form.email}
                    onChange={e => set('email', e.target.value)}
                    placeholder="user@example.com"
                  />
                  {errors.email && <span className="ma-usr-err-msg">{errors.email}</span>}
                </div>
              </div>

              <div className="ma-usr-row">
                <div className="ma-usr-field">
                  <label>Security Group <span className="req">*</span></label>
                  <select
                    className={`ma-usr-select${errors.security_group_id ? ' err' : ''}`}
                    value={form.security_group_id}
                    onChange={e => set('security_group_id', e.target.value)}
                  >
                    <option value="">— Select group —</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                  {errors.security_group_id && <span className="ma-usr-err-msg">{errors.security_group_id}</span>}
                </div>
                <div className="ma-usr-field">
                  <label>Department</label>
                  <input aria-label="Department"
                    className="ma-usr-input"
                    value={form.department}
                    onChange={e => set('department', e.target.value)}
                    placeholder="e.g. Medical Affairs"
                  />
                </div>
              </div>

              <div className="ma-usr-field">
                <label>Network User ID <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(SSO identifier)</span></label>
                <input
                  className="ma-usr-input"
                  value={form.network_user_id}
                  onChange={e => set('network_user_id', e.target.value)}
                  placeholder="e.g. DOMAIN\\username or UPN"
                />
              </div>

              {/* Privilege checkboxes */}
              <div>
                <div className="ma-usr-section-title" style={{ marginBottom: 10 }}>Privileges</div>
                <div className="ma-usr-checks">
                  <label className="ma-usr-check">
                    <input type="checkbox" checked={form.is_primary_ref} onChange={() => toggle('is_primary_ref')} />
                    Primary Ref To
                  </label>
                  <label className="ma-usr-check">
                    <input type="checkbox" checked={form.access_admin_site} onChange={() => toggle('access_admin_site')} />
                    Access Admin Site
                  </label>
                  <label className="ma-usr-check">
                    <input type="checkbox" checked={form.case_admin} onChange={() => toggle('case_admin')} />
                    Case Admin
                  </label>
                  {canGrantPlatformAdmin && (
                    <label className="ma-usr-check">
                      <input
                        type="checkbox"
                        checked={form.role === 'platform_admin'}
                        onChange={e => set('role', e.target.checked ? 'platform_admin' : 'admin')}
                      />
                      Platform Administrator
                    </label>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── TAB 2: Quick Actions ── */}
          {tab === 'actions' && isEdit && (
            <>
              {/* Password Expiry card */}
              <div>
                <div className="ma-usr-section-title" style={{ marginBottom: 10 }}>Password Expiry</div>
                <div className="ma-usr-expiry-card">
                  <div>
                    <div className="ma-usr-expiry-label">Password expires on</div>
                    <div className={`ma-usr-expiry-val${expired ? ' expired' : ''}`}>
                      {fmtDate(expiresAt)}
                      {expired && <span style={{ fontSize: 13, marginLeft: 8, fontWeight: 400 }}>— EXPIRED</span>}
                    </div>
                  </div>
                  <div className="ma-usr-qa-actions">
                    <button
                      className="ma-usr-qa-btn danger"
                      onClick={handleExpirePassword}
                      disabled={expiringNow}
                    >
                      {expiringNow ? 'Expiring…' : 'Expire Password'}
                    </button>
                    {!isSSO && (
                      <button
                        className="ma-usr-qa-btn"
                        onClick={() => setShowPwdForm(v => !v)}
                      >
                        {showPwdForm ? 'Cancel' : 'Change Password'}
                      </button>
                    )}
                    {isSSO && (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
                        SSO user — password managed by identity provider
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Change password inline form */}
              {showPwdForm && !isSSO && (
                <div className="ma-usr-pwd-form">
                  <div className="ma-usr-section-title">Set New Password</div>
                  <div className="ma-usr-field">
                    <label>New Password</label>
                    <input aria-label="New Password"
                      type="password"
                      className="ma-usr-input"
                      value={newPwd}
                      onChange={e => { setNewPwd(e.target.value); setPwdErr('') }}
                      placeholder="Min. 8 characters"
                    />
                  </div>
                  <div className="ma-usr-field">
                    <label>Confirm Password</label>
                    <input aria-label="Confirm Password"
                      type="password"
                      className="ma-usr-input"
                      value={confirmPwd}
                      onChange={e => { setConfirmPwd(e.target.value); setPwdErr('') }}
                      placeholder="Repeat new password"
                    />
                  </div>
                  {pwdErr && <span className="ma-usr-err-msg">{pwdErr}</span>}
                  <div>
                    <button
                      className="ma-usr-btn-save"
                      onClick={handleChangePassword}
                      disabled={pwdSaving}
                      style={{ marginTop: 4 }}
                    >
                      {pwdSaving ? 'Saving…' : 'Set Password'}
                    </button>
                  </div>
                </div>
              )}

              {canGrantPlatformAdmin && (
                <div>
                  <div className="ma-usr-section-title" style={{ marginBottom: 10 }}>Sign-in Security</div>
                  <div className="ma-usr-expiry-card">
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      Unlock clears failed sign-in and 2FA attempts. Reset 2FA removes the user's 2FA set-up, backup codes and remembered devices; they set it up again at next sign-in.
                    </div>
                    <div className="ma-usr-qa-actions">
                      <button className="ma-usr-qa-btn" disabled={!!securityBusy}
                        onClick={() => handleSecurityAction('unlock', 'Account unlocked.')}>
                        {securityBusy === 'unlock' ? 'Unlocking…' : 'Unlock Account'}
                      </button>
                      <button className="ma-usr-qa-btn danger" disabled={!!securityBusy}
                        onClick={() => handleSecurityAction('reset-2fa', 'User 2FA reset.')}>
                        {securityBusy === 'reset-2fa' ? 'Resetting…' : 'Reset 2FA'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── TAB 3: Divisions / Tenants ── */}
          {tab === 'tenants' && (
            <>
              <div>
                <div className="ma-usr-section-title" style={{ marginBottom: 4 }}>
                  Tenant Access
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                  Select the tenants (organisations) this user can access.
                  {errors.tenant_ids && (
                    <span className="ma-usr-err-msg" style={{ display: 'block', marginTop: 4 }}>
                      {errors.tenant_ids}
                    </span>
                  )}
                </div>
              </div>

              {orgs.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  No tenants found.
                </div>
              )}

              <div className="ma-usr-tenants-list">
                {orgs.map(o => {
                  const checked = form.tenant_ids.includes(o.id)
                  return (
                    <div
                      key={o.id}
                      className={`ma-usr-tenant-row${checked ? ' checked' : ''}`}
                      onClick={() => toggleTenant(o.id)}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTenant(o.id)}
                        onClick={e => e.stopPropagation()}
                      />
                      <span className="ma-usr-tenant-name">{o.name}</span>
                      <span className="ma-usr-tenant-status">
                        {o.is_active ? '' : '(inactive)'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </>
          )}

        </div>

        {/* Footer */}
        <div className="ma-usr-modal-footer">
          {apiErr && <span className="ma-usr-footer-err">{apiErr}</span>}
          <button className="ma-usr-btn-cancel" onClick={onClose}>Cancel</button>
          <button
            className="ma-usr-btn-save"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create User'}
          </button>
        </div>

      </div>
    </div>
  )
}
