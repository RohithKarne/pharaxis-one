import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'

export default function PortalUsersPage() {
  const { clientId }    = useParams()
  const [users, setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [userType, setUserType] = useState('')

  const [editUser, setEditUser]         = useState(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editForm, setEditForm]         = useState({ first_name: '', last_name: '', email: '', user_type: '', country: '', is_verified: false, is_active: true })
  const [saving, setSaving]             = useState(false)
  const [msg, setMsg]                   = useState(null)  // { type: 'success' | 'error', text }
  const [selectedIds, setSelectedIds]   = useState([])

  useEffect(() => { load() }, [clientId, userType])

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (userType) params.set('user_type', userType)
      if (search) params.set('search', search)
      const res = await fetch(`/api/admin/users/${clientId}?${params}`, { headers: adminHeaders() })
      if (!res.ok) throw new Error('Failed to load users.')
      const d   = await res.json()
      setUsers(d.users || [])
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setLoading(false)
    }
  }

  async function toggleActive(id, current) {
    if (!confirm(`${current ? 'Deactivate' : 'Activate'} this portal user?`)) return
    try {
      const res = await fetch(`/api/admin/users/${clientId}/${id}`, { method: 'PATCH', headers: adminHeaders(), body: JSON.stringify({ is_active: !current }) })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Update failed.') }
      setMsg({ type: 'success', text: `User ${current ? 'deactivated' : 'activated'}.` })
      load()
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    }
  }

  function toggleSelect(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function toggleSelectAll() {
    setSelectedIds(prev => prev.length === users.length ? [] : users.map(u => u.id))
  }
  async function bulkSetActive(isActive) {
    if (selectedIds.length === 0) return
    if (!confirm(`${isActive ? 'Activate' : 'Deactivate'} ${selectedIds.length} selected user(s)?`)) return
    try {
      const res = await fetch(`/api/admin/users/${clientId}/bulk`, {
        method: 'PATCH', headers: adminHeaders(), body: JSON.stringify({ ids: selectedIds, is_active: isActive }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Bulk update failed.') }
      const d = await res.json()
      setMsg({ type: 'success', text: d.message || 'Users updated.' })
      setSelectedIds([])
      load()
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    }
  }

  function openEdit(user) {
    setEditUser(user)
    setEditForm({
      first_name:  user.first_name  || '',
      last_name:   user.last_name   || '',
      email:       user.email       || '',
      user_type:   user.user_type   || 'other',
      country:     user.country     || '',
      is_verified: !!user.is_verified,
      is_active:   !!user.is_active,
    })
    setShowEditModal(true)
  }

  async function handleEdit(e) {
    e.preventDefault(); setSaving(true)
    try {
      const res = await fetch(`/api/admin/users/${clientId}/${editUser.id}`, {
        method: 'PATCH', headers: adminHeaders(), body: JSON.stringify(editForm)
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Save failed.') }
      setMsg({ type: 'success', text: 'User updated.' })
      setShowEditModal(false); setEditUser(null); load()
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminLayout title="Portal Users">
      {msg && (
        <div className={msg.type === 'error' ? 'cp-error' : 'cp-success'} onClick={() => setMsg(null)} style={{ cursor: 'pointer' }}>
          {msg.text}
        </div>
      )}
      <div className="cp-filter-bar">
        <input className="cp-search-input" placeholder="Search name or email…" value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load()} />
        <select value={userType} onChange={e => setUserType(e.target.value)}>
          <option value="">All Types</option>
          <option value="hcp">HCP</option>
          <option value="patient">Patient</option>
          <option value="physician">Physician</option>
          <option value="non_hcp">Non-HCP</option>
          <option value="other">Other</option>
        </select>
        <button className="cp-btn cp-btn-outline" onClick={load}>Search</button>
      </div>

      {selectedIds.length > 0 && (
        <div className="cp-bulk-bar">
          <strong>{selectedIds.length} selected</strong>
          <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => bulkSetActive(true)}>Activate</button>
          <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => bulkSetActive(false)}>Deactivate</button>
          <button className="cp-btn cp-btn-sm" onClick={() => setSelectedIds([])}>Clear selection</button>
        </div>
      )}

      {showEditModal && editUser && (
        <div className="cp-modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="cp-modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="cp-modal-header">
              <span>Edit User</span>
              <button className="cp-modal-close" onClick={() => setShowEditModal(false)}>✕</button>
            </div>
            <form onSubmit={handleEdit} className="cp-modal-body">
              <div className="cp-field-row">
                <div className="cp-field"><label>First Name</label><input value={editForm.first_name} onChange={e => setEditForm(f => ({ ...f, first_name: e.target.value }))} /></div>
                <div className="cp-field"><label>Last Name</label><input value={editForm.last_name} onChange={e => setEditForm(f => ({ ...f, last_name: e.target.value }))} /></div>
              </div>
              <div className="cp-field"><label>Email</label><input type="text" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div className="cp-field-row">
                <div className="cp-field">
                  <label>User Type</label>
                  <select value={editForm.user_type} onChange={e => setEditForm(f => ({ ...f, user_type: e.target.value }))}>
                    <option value="hcp">HCP</option>
                    <option value="patient">Patient</option>
                    <option value="physician">Physician</option>
                    <option value="non_hcp">Non-HCP</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="cp-field"><label>Country</label><input value={editForm.country} onChange={e => setEditForm(f => ({ ...f, country: e.target.value }))} /></div>
              </div>
              <div className="cp-field-row">
                <div className="cp-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" id="eu-verified" checked={editForm.is_verified} onChange={e => setEditForm(f => ({ ...f, is_verified: e.target.checked }))} />
                  <label htmlFor="eu-verified">Verified</label>
                </div>
                <div className="cp-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" id="eu-active" checked={editForm.is_active} onChange={e => setEditForm(f => ({ ...f, is_active: e.target.checked }))} />
                  <label htmlFor="eu-active">Active</label>
                </div>
              </div>
              <div className="cp-modal-footer">
                <button type="submit" className="cp-btn cp-btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                <button type="button" className="cp-btn cp-btn-outline" onClick={() => setShowEditModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? <div className="cp-loading">Loading…</div> : users.length === 0 ? (
        <div className="cp-empty"><p>No portal users have registered yet.</p></div>
      ) : (
        <div className="cp-table-card">
          <table className="cp-table">
            <thead><tr>
              <th><input type="checkbox" checked={users.length > 0 && selectedIds.length === users.length} onChange={toggleSelectAll} aria-label="Select all" /></th>
              <th>Name</th><th>Email</th><th>Type</th><th>Country</th><th>Verified</th><th>Status</th><th>Last Login</th><th>Joined</th><th></th>
            </tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td><input type="checkbox" checked={selectedIds.includes(u.id)} onChange={() => toggleSelect(u.id)} aria-label={`Select ${u.email}`} /></td>
                  <td>{u.first_name} {u.last_name}</td>
                  <td>{u.email}</td>
                  <td><span className="cp-type-badge">{u.user_type}</span></td>
                  <td>{u.country || '—'}</td>
                  <td>{u.is_verified ? 'Verified' : 'Not verified'}</td>
                  <td><span className={`cp-status-badge ${u.is_active ? 'cp-status-active' : 'cp-status-inactive'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td style={{ fontSize: 12 }}>{u.last_login_at ? u.last_login_at.slice(0, 16).replace('T', ' ') : '—'}</td>
                  <td>{u.created_at?.slice(0, 10)}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => openEdit(u)}>Edit</button>
                    <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => toggleActive(u.id, u.is_active)}>{u.is_active ? 'Deactivate' : 'Activate'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  )
}
