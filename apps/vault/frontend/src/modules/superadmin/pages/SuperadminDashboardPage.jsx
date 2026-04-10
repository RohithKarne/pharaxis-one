import { useEffect, useState } from 'react'
import SuperadminTabs from '../components/SuperadminTabs'
import { apiJson, authHeaders, getSuperadminToken } from '../../common/utils/session'

function formatDateTime(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString()
}

export default function SuperadminDashboardPage() {
  const token = getSuperadminToken()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadDashboard() {
    if (!token) {
      setError('Superadmin session missing. Please sign in again.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const payload = await apiJson('/api/superadmin/dashboard', {
        headers: authHeaders(token)
      })
      setStats(payload)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="brand-block">
          <h1 className="brand-title">SuperAdmin Dashboard</h1>
          <p className="brand-subtitle">Cross-org operational visibility and governance</p>
        </div>
        <span className="topbar-pill">Pharaxis Internal</span>
      </header>

      <main className="dashboard-grid">
        <section className="panel span-12">
          <SuperadminTabs active="dashboard" />
          {error ? <div className="auth-error">{error}</div> : null}
          {loading ? <p className="panel-note">Loading platform dashboard...</p> : null}
        </section>

        {!loading && stats ? (
          <>
            <section className="stat-card">
              <div className="stat-label">Total Orgs</div>
              <h2 className="stat-value">{stats.orgs?.total || 0}</h2>
            </section>
            <section className="stat-card">
              <div className="stat-label">Active Orgs</div>
              <h2 className="stat-value">{stats.orgs?.active || 0}</h2>
            </section>
            <section className="stat-card">
              <div className="stat-label">Inactive Orgs</div>
              <h2 className="stat-value">{stats.orgs?.inactive || 0}</h2>
            </section>
            <section className="stat-card">
              <div className="stat-label">Documents</div>
              <h2 className="stat-value">{stats.documents?.total || 0}</h2>
            </section>

            <section className="panel span-8">
              <h3>Recent Login Activity</h3>
              <p className="panel-note">Last 50 login records across all organizations.</p>
              <div className="users-table-wrap">
                <table className="users-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>User</th>
                      <th>Type</th>
                      <th>Action</th>
                      <th>Org</th>
                      <th>IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(stats.recent_logins || []).map(row => (
                      <tr key={row.id}>
                        <td>{formatDateTime(row.created_at)}</td>
                        <td>{row.email || `User #${row.user_id || '-'}`}</td>
                        <td>{row.user_type}</td>
                        <td>{row.action}</td>
                        <td>{row.org_id || '-'}</td>
                        <td>{row.ip_address || '-'}</td>
                      </tr>
                    ))}
                    {!stats.recent_logins?.length ? (
                      <tr>
                        <td colSpan={6} className="users-empty">No login activity found.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel span-4">
              <h3>Storage</h3>
              <p className="panel-note">Total storage used by current-version documents.</p>
              <h2 className="stat-value">{(Number(stats.documents?.storage_kb || 0) / 1024).toFixed(2)} MB</h2>
            </section>
          </>
        ) : null}
      </main>
    </div>
  )
}
