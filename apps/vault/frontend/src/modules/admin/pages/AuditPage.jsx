import { useEffect, useMemo, useState } from 'react'
import AdminTabs from '../components/AdminTabs'
import { apiJson, authHeaders, getOrgToken } from '../../common/utils/session'
import VaultPageHeader from '../../vault/components/VaultPageHeader'

function formatDateTime(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString()
}

export default function AuditPage() {
  const token = getOrgToken()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({
    action: '',
    user_id: '',
    date_from: '',
    date_to: ''
  })
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 25

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total])

  async function loadAudit() {
    if (!token) {
      setError('Session not found. Please log in first.')
      setLoading(false)
      return
    }

    const search = new URLSearchParams({
      page: String(page),
      limit: String(limit)
    })
    if (filters.action) search.set('action', filters.action)
    if (filters.user_id) search.set('user_id', filters.user_id)
    if (filters.date_from) search.set('date_from', filters.date_from)
    if (filters.date_to) search.set('date_to', filters.date_to)

    setLoading(true)
    setError('')
    try {
      const payload = await apiJson(`/api/audit?${search.toString()}`, {
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
  }, [page])

  function applyFilters(event) {
    event.preventDefault()
    setPage(1)
    loadAudit()
  }

  return (
    <div className="app-shell">
      <main className="dashboard-grid">
        <VaultPageHeader
          kicker="Administration / Audit"
          title="Audit Trail"
          note="Read-only activity stream across your organization."
          statusLabel="Admin Console"
        />
        <section className="panel span-12">
          <AdminTabs active="audit" />
          <form className="audit-filters" onSubmit={applyFilters}>
            <div className="form-field">
              <label htmlFor="audit-action">Action</label>
              <input
                id="audit-action"
                value={filters.action}
                onChange={event => setFilters({ ...filters, action: event.target.value })}
                placeholder="e.g. document_uploaded"
              />
            </div>
            <div className="form-field">
              <label htmlFor="audit-user-id">User ID</label>
              <input
                id="audit-user-id"
                value={filters.user_id}
                onChange={event => setFilters({ ...filters, user_id: event.target.value })}
              />
            </div>
            <div className="form-field">
              <label htmlFor="audit-date-from">From</label>
              <input
                id="audit-date-from"
                type="date"
                value={filters.date_from}
                onChange={event => setFilters({ ...filters, date_from: event.target.value })}
              />
            </div>
            <div className="form-field">
              <label htmlFor="audit-date-to">To</label>
              <input
                id="audit-date-to"
                type="date"
                value={filters.date_to}
                onChange={event => setFilters({ ...filters, date_to: event.target.value })}
              />
            </div>
            <button className="btn-secondary audit-apply-btn" type="submit">
              Apply Filters
            </button>
            <button
              className="btn-secondary"
              type="button"
              onClick={() => {
                const search = new URLSearchParams()
                if (filters.action) search.set('action', filters.action)
                if (filters.date_from) search.set('date_from', filters.date_from)
                if (filters.date_to) search.set('date_to', filters.date_to)
                window.open(`/api/audit/export?${search.toString()}`, '_blank')
              }}
              style={{ marginLeft: '8px' }}
            >
              Export GxP Audit Trail (CSV)
            </button>
          </form>

          {error ? <div className="auth-error">{error}</div> : null}
          {loading ? <p className="panel-note">Loading audit log...</p> : null}

          {!loading ? (
            <>
              <div className="users-table-wrap">
                <table className="users-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>User</th>
                      <th>Action</th>
                      <th>Entity</th>
                      <th>Entity ID</th>
                      <th>IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.id}>
                        <td>{formatDateTime(row.created_at) || '-'}</td>
                        <td>{row.user_name || row.user_email || '-'}</td>
                        <td>{row.action}</td>
                        <td>{row.entity_type || '-'}</td>
                        <td>{row.entity_id || '-'}</td>
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

              <div className="pagination-row">
                <button
                  className="btn-secondary"
                  onClick={() => setPage(prev => Math.max(1, prev - 1))}
                  disabled={page <= 1}
                >
                  Previous
                </button>
                <span>Page {page} of {totalPages}</span>
                <button
                  className="btn-secondary"
                  onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                </button>
              </div>
            </>
          ) : null}
        </section>
      </main>
    </div>
  )
}
