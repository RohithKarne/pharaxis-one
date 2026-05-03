import { useEffect, useState } from 'react'
import SuperadminTabs from '../components/SuperadminTabs'
import SuperadminTopbar from '../components/SuperadminTopbar'
import { apiJson, authHeaders, getSuperadminToken } from '../../common/utils/session'

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

export default function SuperadminAuditPage() {
  const token = getSuperadminToken()
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [orgFilter, setOrgFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  async function loadAudit() {
    if (!token) {
      setError('Superadmin session missing. Please sign in again.')
      setLoading(false)
      return
    }

    const query = new URLSearchParams()
    if (orgFilter) query.set('org_id', orgFilter)
    if (actionFilter) query.set('action', actionFilter)
    if (dateFrom) query.set('date_from', dateFrom)
    if (dateTo) query.set('date_to', dateTo)

    setLoading(true)
    setError('')
    try {
      const payload = await apiJson(`/api/superadmin/audit${query.toString() ? `?${query.toString()}` : ''}`, {
        headers: authHeaders(token)
      })
      setRows(payload.results || [])
      setTotal(Number(payload.total || 0))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAudit()
  }, [orgFilter, actionFilter, dateFrom, dateTo])

  return (
    <div className="app-shell">
      <SuperadminTopbar
        title="Platform Audit"
        subtitle="Cross-org login and system activity review for Pharaxis internal operations"
      />

      <main className="dashboard-grid">
        <section className="panel span-12">
          <SuperadminTabs active="audit" />
          <div className="detail-actions">
            <input
              className="workspace-module-search"
              value={orgFilter}
              onChange={event => setOrgFilter(event.target.value)}
              placeholder="Filter by org id"
            />
            <input
              className="workspace-module-search"
              value={actionFilter}
              onChange={event => setActionFilter(event.target.value)}
              placeholder="Filter by action"
            />
            <input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} />
            <input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} />
            <button className="btn-secondary" type="button" onClick={loadAudit}>Refresh</button>
          </div>
          <div className="stats-mini-grid">
            <article className="stat-card-mini"><span>Records</span><strong>{total || rows.length}</strong></article>
            <article className="stat-card-mini"><span>Failures</span><strong>{rows.filter(row => row.action === 'login_fail').length}</strong></article>
            <article className="stat-card-mini"><span>Success</span><strong>{rows.filter(row => row.action === 'login_success').length}</strong></article>
          </div>
          {error ? <div className="auth-error">{error}</div> : null}
          {loading ? <p className="panel-note">Loading platform audit...</p> : null}
        </section>

        <section className="panel span-12">
          {!loading ? (
            <div className="users-table-wrap">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Action</th>
                    <th>Email</th>
                    <th>User Type</th>
                    <th>Org</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.id}>
                      <td>{formatDateTime(row.created_at)}</td>
                      <td>{row.action}</td>
                      <td>{row.email || '-'}</td>
                      <td>{row.user_type || '-'}</td>
                      <td>{row.org_id || '-'}</td>
                      <td>{row.ip_address || '-'}</td>
                    </tr>
                  ))}
                  {!rows.length ? (
                    <tr>
                      <td colSpan={6} className="users-empty">No audit records found.</td>
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
