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
                <td><button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => toggleActive(u.id, u.is_active)}>{u.is_active ? 'Deactivate' : 'Activate'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminLayout>
  )
}
