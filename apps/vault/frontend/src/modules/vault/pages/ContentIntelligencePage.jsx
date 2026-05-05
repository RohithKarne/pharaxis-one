import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiJson, authHeaders, getOrgToken } from '../../common/utils/session'
import VaultPageHeader from '../components/VaultPageHeader'

function formatDate(value) {
  if (!value) return 'Never'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'Never'
  return d.toLocaleDateString()
}

function healthChipClass(status) {
  if (status === 'stale') return 'status-chip danger'
  if (status === 'at_risk') return 'status-chip warning'
  return 'status-chip success'
}

export default function ContentIntelligencePage() {
  const token = getOrgToken()
  const [summary, setSummary] = useState(null)
  const [staleList, setStaleList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadIntelligence() {
    if (!token) {
      setError('Session not found. Please log in first.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const [summaryData, staleData] = await Promise.all([
        apiJson('/api/intelligence/summary', { headers: authHeaders(token) }),
        apiJson('/api/intelligence/stale', { headers: authHeaders(token) })
      ])
      setSummary(summaryData)
      setStaleList(Array.isArray(staleData) ? staleData : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadIntelligence()
  }, [])

  return (
    <div className="app-shell">
      <main className="dashboard-grid">
        <VaultPageHeader
          kicker="Intelligence / Content"
          title="Content Intelligence"
          note="Identify stale, at-risk, and expiring content before it becomes a compliance risk."
          statusLabel="Intelligence Active"
          dateLabel={new Date().toLocaleDateString()}
        />

        {error ? (
          <section className="panel span-12">
            <div className="auth-error">{error}</div>
          </section>
        ) : null}

        <section className="stat-card">
          <div className="stat-label">Stale Documents</div>
          <h2 className="stat-value">{loading ? '—' : (summary?.stale_count ?? 0)}</h2>
        </section>
        <section className="stat-card">
          <div className="stat-label">At Risk</div>
          <h2 className="stat-value">{loading ? '—' : (summary?.at_risk_count ?? 0)}</h2>
        </section>
        <section className="stat-card">
          <div className="stat-label">Expiring in 30 Days</div>
          <h2 className="stat-value">{loading ? '—' : (summary?.expiry_30d_count ?? 0)}</h2>
        </section>
        <section className="stat-card">
          <div className="stat-label">Total Governed</div>
          <h2 className="stat-value">{loading ? '—' : (summary?.total_governed ?? 0)}</h2>
        </section>

        <section className="panel span-12">
          <div className="folder-header">
            <div>
              <h3>Content Health Report</h3>
              <p className="panel-note">Approved and published documents with low or no engagement activity.</p>
            </div>
            <Link className="btn-secondary link-button" to="/vault">Back to Vault</Link>
          </div>

          {loading ? <p className="panel-note">Loading content health data...</p> : null}

          {!loading ? (
            <div className="users-table-wrap">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Doc Number</th>
                    <th>Title</th>
                    <th>Lifecycle State</th>
                    <th>Last Viewed</th>
                    <th>Days Since View</th>
                    <th>Total Views</th>
                    <th>Health</th>
                    <th>Open</th>
                  </tr>
                </thead>
                <tbody>
                  {staleList.map(row => (
                    <tr key={row.id}>
                      <td>{row.doc_number}</td>
                      <td>{row.title}</td>
                      <td>{row.lifecycle_state}</td>
                      <td>{formatDate(row.last_viewed_at)}</td>
                      <td>{row.days_since_last_view ?? '—'}</td>
                      <td>{row.total_views}</td>
                      <td>
                        <span className={healthChipClass(row.health_status)}>
                          {row.health_status === 'at_risk' ? 'At Risk' : row.health_status.charAt(0).toUpperCase() + row.health_status.slice(1)}
                        </span>
                      </td>
                      <td>
                        <Link className="btn-secondary link-button" to={`/vault/content/${row.id}`}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {!staleList.length ? (
                    <tr>
                      <td colSpan={8} className="users-empty">No stale or at-risk content found.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  )
}
