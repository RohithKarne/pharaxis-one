import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiJson, authHeaders, getOrgToken } from '../../common/utils/session'
import VaultPageHeader from '../components/VaultPageHeader'

export default function ReachScorePage() {
  const token = getOrgToken()
  const [topDocs, setTopDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadReachData() {
    if (!token) {
      setError('Session not found. Please log in first.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const rows = await apiJson('/api/reach/top', { headers: authHeaders(token) })
      setTopDocs(Array.isArray(rows) ? rows : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReachData()
  }, [])

  const totalViews = topDocs.reduce((sum, row) => sum + Number(row.total_views || 0), 0)
  const topScore = topDocs.length ? Number(topDocs[0].total_views || 0) : 0
  const totalReaders = topDocs.reduce((sum, row) => sum + Number(row.unique_viewers || 0), 0)

  return (
    <div className="app-shell">
      <main className="dashboard-grid">
        <VaultPageHeader
          kicker="Intelligence / Reach Score"
          title="Reach Score"
          note="Track how effectively your content is reaching its intended audience across channels."
          statusLabel="Live Data"
          dateLabel={`${topDocs.length} documents tracked`}
        />

        <section className="stat-card">
          <div className="stat-label">Total Views</div>
          <h2 className="stat-value">{totalViews}</h2>
        </section>
        <section className="stat-card">
          <div className="stat-label">Most Viewed (views)</div>
          <h2 className="stat-value">{topScore}</h2>
        </section>
        <section className="stat-card">
          <div className="stat-label">Total Unique Readers</div>
          <h2 className="stat-value">{totalReaders}</h2>
        </section>

        <section className="panel span-12">
          <div className="folder-header">
            <div>
              <h3>Top Performing Documents</h3>
              <p className="panel-note">Ranked by Reach Score — (unique readers × 3) + (total views × 1) + (downloads × 2)</p>
            </div>
            <Link className="btn-secondary link-button" to="/vault">Back to Vault</Link>
          </div>

          {error ? <div className="auth-error">{error}</div> : null}
          {loading ? <p className="panel-note">Loading reach data...</p> : null}

          {!loading ? (
            <div className="users-table-wrap">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Doc Number</th>
                    <th>Title</th>
                    <th>Total Views</th>
                    <th>Unique Readers</th>
                    <th>Downloads</th>
                    <th>Reach Score</th>
                    <th>Open</th>
                  </tr>
                </thead>
                <tbody>
                  {topDocs.map((row, index) => (
                    <tr key={row.content_id}>
                      <td>{index + 1}</td>
                      <td>{row.doc_number}</td>
                      <td>{row.title}</td>
                      <td>{row.total_views}</td>
                      <td>{row.unique_viewers}</td>
                      <td>{row.download_count}</td>
                      <td><strong>{row.reach_score}</strong></td>
                      <td>
                        <Link className="btn-secondary link-button" to={`/vault/content/${row.content_id}`}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {!topDocs.length ? (
                    <tr>
                      <td colSpan={8} className="users-empty">
                        No view data yet. Documents will appear here once they are opened in the viewer.
                      </td>
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
