import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useAdminAuth, adminHeaders } from '../context/AdminAuthContext'

const ROLES = [
  { value: 'admin',           label: 'Admin',           desc: 'Full access to this client' },
  { value: 'content_manager', label: 'Content Manager', desc: 'Create & edit content; submit for review' },
  { value: 'reviewer',        label: 'Reviewer',         desc: 'Approve or reject content in review queue' },
  { value: 'viewer',          label: 'Viewer',           desc: 'Read-only access' },
]

const ROLE_BADGE = {
  superadmin:      { label: 'Superadmin',      color: '#7C3AED', bg: '#EDE9FE' },
  admin:           { label: 'Admin',           color: '#1D4ED8', bg: '#DBEAFE' },
  content_manager: { label: 'Content Manager', color: '#D97706', bg: '#FEF3C7' },
  reviewer:        { label: 'Reviewer',        color: '#0891B2', bg: '#CFFAFE' },
  viewer:          { label: 'Viewer',          color: '#6B7280', bg: '#F3F4F6' },
}

const EMPTY_FORM = { name: '', email: '', password: '', role: 'content_manager' }

export default function AdminUsersPage() {
  const { clientId }        = useParams()
  const { admin }           = useAdminAuth()
  const [users, setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal]   = useState(null)   // null | 'create' | {user}
  const [form, setForm]     = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [listMsg, setListMsg] = useState(null)  // { type, text } — list-level feedback

  useEffect(() => { loadUsers() }, [clientId])

  function loadUsers() {
    setLoading(true)
    fetch(`/api/admin/admin-users/${clientId}`, { headers: adminHeaders() })
      .then(r => r.json())
      .then(d => { setUsers(d.users || []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  function openCreate() {
    setForm(EMPTY_FORM)
    setError('')
    setModal('create')
  }

  function openEdit(user) {
    setForm({ name: user.name, email: user.email, password: '', role: user.role })
    setError('')
    setModal(user)
  }

  async function save(e) {
    if (e) e.preventDefault()
    setError('')
    setSaving(true)
    try {
      let res
      if (modal === 'create') {
        res = await fetch(`/api/admin/admin-users/${clientId}`, {
          method: 'POST',
          headers: adminHeaders(),
          body: JSON.stringify(form),
        })
      } else {
        const body = { name: form.name, role: form.role }
        res = await fetch(`/api/admin/admin-users/${clientId}/${modal.id}`, {
          method: 'PATCH',
          headers: adminHeaders(),
          body: JSON.stringify(body),
        })
      }
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Save failed.'); setSaving(false); return }
      setModal(null)
      loadUsers()
    } catch {
      setError('Network error. Please try again.')
    }
    setSaving(false)
  }

  async function toggleActive(user) {
    if (!confirm(`${user.is_active ? 'Deactivate' : 'Activate'} ${user.name || 'this admin user'}?`)) return
    try {
      const res = await fetch(`/api/admin/admin-users/${clientId}/${user.id}`, {
        method: 'PATCH',
        headers: adminHeaders(),
        body: JSON.stringify({ is_active: user.is_active ? 0 : 1 }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Update failed.') }
      setListMsg({ type: 'success', text: `${user.name || 'User'} ${user.is_active ? 'deactivated' : 'activated'}.` })
      loadUsers()
    } catch (e) {
      setListMsg({ type: 'error', text: e.message })
    }
  }

  function roleBadge(role) {
    const r = ROLE_BADGE[role] || ROLE_BADGE.viewer
    return (
      <span style={{ background: r.bg, color: r.color, borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>
        {r.label}
      </span>
    )
  }

  const isCreate = modal === 'create'

  return (
    <div className="cp-page">
      <div className="cp-page-header">
        <h1 className="cp-page-title">Admin Users</h1>
        {admin?.role !== 'viewer' && (
          <button className="cp-btn cp-btn-primary" onClick={openCreate}>+ Add Admin User</button>
        )}
      </div>

      {listMsg && (
        <div className={listMsg.type === 'error' ? 'cp-error' : 'cp-success'} onClick={() => setListMsg(null)} style={{ cursor: 'pointer' }}>
          {listMsg.text}
        </div>
      )}

      <div className="cp-card" style={{ marginBottom: 16, padding: '12px 16px', background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 8 }}>
        <strong style={{ color: '#0369A1', fontSize: 13 }}>Role permissions summary</strong>
        <div style={{ display: 'flex', gap: 24, marginTop: 8, flexWrap: 'wrap' }}>
          {ROLES.map(r => (
            <div key={r.value} style={{ fontSize: 12 }}>
              {roleBadge(r.value)} <span style={{ color: '#374151', marginLeft: 4 }}>{r.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="cp-empty">Loading…</div>
      ) : users.length === 0 ? (
        <div className="cp-empty">No admin users yet. Add one to get started.</div>
      ) : (
        <div className="cp-card">
          <table className="cp-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Created</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{roleBadge(u.role)}</td>
                  <td>
                    <span className={`cp-badge ${u.is_active ? 'cp-badge-active' : 'cp-badge-inactive'}`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                  <td style={{ display: 'flex', gap: 8 }}>
                    {admin?.role !== 'viewer' && (
                      <>
                        <button className="cp-btn cp-btn-sm" onClick={() => openEdit(u)}>Edit</button>
                        {u.id !== admin?.id && (
                          <button
                            className={`cp-btn cp-btn-sm ${u.is_active ? 'cp-btn-danger-outline' : 'cp-btn-outline'}`}
                            onClick={() => toggleActive(u)}
                          >
                            {u.is_active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="cp-modal-backdrop">
          <div className="cp-modal" style={{ width: 480 }}>
            <div className="cp-modal-header">
              <h2>{isCreate ? 'Add Admin User' : `Edit — ${modal.name}`}</h2>
              <button className="cp-modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <form onSubmit={save}>
              <div className="cp-modal-body">
                {error && <div className="cp-alert cp-alert-error" style={{ marginBottom: 12 }}>{error}</div>}

                <div className="cp-field">
                  <label>Full Name *</label>
                  <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Jane Smith" />
                </div>

                {isCreate && (
                  <>
                    <div className="cp-field">
                      <label>Email *</label>
                      <input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@example.com" />
                    </div>
                    <div className="cp-field">
                      <label>Password * <span style={{ fontSize: 11, color: '#6B7280' }}>(min 8 characters)</span></label>
                      <input required minLength={8} type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                    </div>
                  </>
                )}

                <div className="cp-field">
                  <label>Role *</label>
                  <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    {ROLES.map(r => (
                      <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="cp-modal-footer">
                <button type="button" className="cp-btn cp-btn-outline" onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="cp-btn cp-btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : isCreate ? 'Create User' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
