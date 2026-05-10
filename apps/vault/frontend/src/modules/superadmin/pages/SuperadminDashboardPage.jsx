import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import SuperadminTabs from '../components/SuperadminTabs'
import SuperadminTopbar from '../components/SuperadminTopbar'
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

  const loginSummary = (stats?.recent_logins || []).reduce((summary, row) => {
    if (row.action === 'login_success') summary.success += 1
    if (row.action === 'login_fail') summary.fail += 1
    if (row.action === 'logout') summary.logout += 1
    return summary
  }, { success: 0, fail: 0, logout: 0 })

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
      <SuperadminTopbar
        title="SuperAdmin Dashboard"
        subtitle="Cross-org operational visibility and governance"
      />

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
            <section className="stat-card">
              <div className="stat-label">Login Failures</div>
              <h2 className="stat-value">{loginSummary.fail}</h2>
            </section>
            <section className="stat-card">
              <div className="stat-label">Platform Attention</div>
              <h2 className="stat-value">
                {stats.orgs?.inactive || loginSummary.fail ? 'Required' : 'Stable'}
              </h2>
            </section>

            <section className="panel span-4">
              <h3>Platform Health</h3>
              <ul className="simple-list detail-list">
                <li><span>Successful Logins</span><strong>{loginSummary.success}</strong></li>
                <li><span>Failed Logins</span><strong>{loginSummary.fail}</strong></li>
                <li><span>Recent Logouts</span><strong>{loginSummary.logout}</strong></li>
                <li><span>Inactive Orgs</span><strong>{stats.orgs?.inactive || 0}</strong></li>
              </ul>
              <div className="detail-actions">
                <Link className="btn-secondary link-button" to="/audit">Open Audit</Link>
                <Link className="btn-secondary link-button" to="/orgs">Open Organizations</Link>
              </div>
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
