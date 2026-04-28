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

  useEffect(() => { load() }, [clientId, userType])

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (userType) params.set('user_type', userType)
    if (search) params.set('search', search)
    const res = await fetch(`/api/admin/users/${clientId}?${params}`, { headers: adminHeaders() })
    const d   = await res.json()
    setUsers(d.users || [])
    setLoading(false)
  }

  async function toggleActive(id, current) {
    await fetch(`/api/admin/users/${clientId}/${id}`, { method: 'PATCH', headers: adminHeaders(), body: JSON.stringify({ is_active: !current }) })
    load()
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
    await fetch(`/api/admin/users/${clientId}/${editUser.id}`, {
      method: 'PATCH', headers: adminHeaders(), body: JSON.stringify(editForm)
    })
    setSaving(false); setShowEditModal(false); setEditUser(null); load()
  }

  return (
    <AdminLayout title="Portal Users">
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
        <div className="cp-empty"><div style={{ fontSize: 40 }}>👥</div><p>No portal users yet.</p></div>
      ) : (
        <table className="cp-table">
          <thead><tr><th>Name</th><th>Email</th><th>Type</th><th>Country</th><th>Verified</th><th>Status</th><th>Joined</th><th></th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>{u.first_name} {u.last_name}</td>
                <td>{u.email}</td>
                <td><span className="cp-type-badge">{u.user_type}</span></td>
                <td>{u.country || '—'}</td>
                <td>{u.is_verified ? '✓' : '—'}</td>
                <td><span className={`cp-badge ${u.is_active ? 'badge-active' : 'badge-inactive'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                <td>{u.created_at?.slice(0, 10)}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => openEdit(u)}>Edit</button>
                  <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => toggleActive(u.id, u.is_active)}>{u.is_active ? 'Deactivate' : 'Activate'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminLayout>
  )
}
