import { useEffect, useState } from 'react'
import { SectionHeader, StatusPill } from './AdminShared'

const ROLE_LABELS = {
  admin: 'Administrator',
  agent: 'MI Agent',
  reviewer: 'Reviewer',
  content_manager: 'Content Manager',
}

export default function AdminUserConfigPanel({ H, flash }) {
  const [orgUsers, setOrgUsers] = useState([])
  const [orgUsersLoading, setOrgUsersLoading] = useState(false)
  const [expiryEditUserId, setExpiryEditUserId] = useState(null)
  const [expiryDateInput, setExpiryDateInput] = useState('')
  const [expirySaving, setExpirySaving] = useState(false)

  useEffect(() => { loadOrgUsers() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadOrgUsers() {
    setOrgUsersLoading(true)
    try {
      const me = await fetch('/api/auth/me', { headers: H }).then(r => r.json())
      if (!me.orgId) { setOrgUsers([]); return }
      const data = await fetch(`/api/admin/orgs/${me.orgId}/users`, { headers: H }).then(r => r.json())
      setOrgUsers(data.users || [])
    } catch {
      setOrgUsers([])
    } finally {
      setOrgUsersLoading(false)
    }
  }

  async function saveUserExpiry(userId) {
    setExpirySaving(true)
    try {
      const me = await fetch('/api/auth/me', { headers: H }).then(r => r.json())
      await fetch(`/api/admin/orgs/${me.orgId}/users/${userId}/expiry`, {
        method: 'PUT',
        headers: H,
        body: JSON.stringify({ access_expires_at: expiryDateInput || null }),
      })
      setOrgUsers(prev => prev.map(user => (
        user.id === userId ? { ...user, access_expires_at: expiryDateInput || null } : user
      )))
      setExpiryEditUserId(null)
    } catch {
      flash('Failed to update access expiry.', 'error')
    } finally {
      setExpirySaving(false)
    }
  }

  return (
    <>
      <SectionHeader title="User Configuration" desc="Manage organisation users and their access expiry dates." />
      <div className="card">
        <div className="card-header"><h3>Organisation Users {orgUsersLoading ? '(loading...)' : ''}</h3></div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="admin-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Access Expires</th><th>Action</th></tr></thead>
            <tbody>
              {orgUsers.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>{orgUsersLoading ? 'Loading users...' : 'No users in this organisation.'}</td></tr>}
              {orgUsers.map(user => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{user.email}</td>
                  <td><span className="badge badge-new">{ROLE_LABELS[user.role_at_org] || user.role_at_org}</span></td>
                  <td><StatusPill active={user.is_active} /></td>
                  <td style={{ color: user.access_expires_at && new Date(user.access_expires_at) < new Date() ? 'var(--warning)' : 'var(--text-muted)', fontSize: 12 }}>
                    {user.access_expires_at ? new Date(user.access_expires_at).toLocaleDateString() : '—'}
                  </td>
                  <td>
                    {expiryEditUserId === user.id ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input type="date" className="form-input" style={{ width: 140, fontSize: 12, padding: '2px 6px' }} value={expiryDateInput} onChange={e => setExpiryDateInput(e.target.value)} />
                        <button className="btn btn-primary" style={{ fontSize: 11, padding: '2px 8px' }} disabled={expirySaving} onClick={() => saveUserExpiry(user.id)}>Save</button>
                        <button className="btn btn-secondary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => setExpiryEditUserId(null)}>Cancel</button>
                      </div>
                    ) : (
                      <button className="btn btn-outline" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => { setExpiryEditUserId(user.id); setExpiryDateInput(user.access_expires_at ? user.access_expires_at.slice(0, 10) : '') }}>
                        {user.access_expires_at ? 'Edit Expiry' : 'Set Expiry'}
                      </button>
                    )}
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
