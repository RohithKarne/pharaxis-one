import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import SuperadminTabs from '../components/SuperadminTabs'
import { apiJson, authHeaders, getSuperadminToken } from '../../common/utils/session'

function formatDate(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString()
}

export default function SuperadminOrgDetailPage() {
  const { id } = useParams()
  const token = getSuperadminToken()
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadOrgUsers() {
    if (!token) {
      setError('Superadmin session missing. Please sign in again.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const data = await apiJson(`/api/superadmin/orgs/${id}/users`, {
        headers: authHeaders(token)
      })
      setPayload(data)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadOrgUsers()
  }, [id])

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="brand-block">
          <h1 className="brand-title">Organization Users</h1>
          <p className="brand-subtitle">Role and status drill-down for selected tenant</p>
        </div>
        <span className="topbar-pill">Pharaxis Internal</span>
      </header>

      <main className="dashboard-grid">
        <section className="panel span-12">
          <SuperadminTabs active="orgs" />
          <div className="detail-actions">
            <Link className="btn-secondary link-button" to="/superadmin/orgs">
              Back to Organizations
            </Link>
          </div>
          {error ? <div className="auth-error">{error}</div> : null}
          {loading ? <p className="panel-note">Loading organization users...</p> : null}
        </section>

        {!loading && payload ? (
          <section className="panel span-12">
            <h3>{payload.org?.name} ({payload.org?.slug})</h3>
            <p className="panel-note">Status: {payload.org?.status}</p>
            <div className="users-table-wrap">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Last Login</th>
                  </tr>
                </thead>
                <tbody>
                  {(payload.users || []).map(user => (
                    <tr key={user.id}>
                      <td>{user.name}</td>
                      <td>{user.email}</td>
                      <td>{user.role}</td>
                      <td>
                        <span className={Number(user.is_active) === 1 ? 'status-chip success' : 'status-chip pending'}>
                          {Number(user.is_active) === 1 ? 'active' : 'inactive'}
                        </span>
                      </td>
                      <td>{formatDate(user.created_at)}</td>
                      <td>{formatDate(user.last_login_at)}</td>
                    </tr>
                  ))}
                  {!payload.users?.length ? (
                    <tr>
                      <td colSpan={6} className="users-empty">No users found for this organization.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  )
}
