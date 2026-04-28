import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import '../cases.css'
import { httpFetch } from '../../../shared/api/httpFetch.js'

const API = import.meta.env.VITE_API_URL || '/api'

const CASE_TYPE_COLORS = { MI: '#2563eb', AE: '#dc2626', PC: '#d97706' }

function formatDateTime(value) {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return value
  return dt.toLocaleString()
}

export default function CaseQueryPage() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sortBy, setSortBy] = useState('created_at')
  const [sortDir, setSortDir] = useState('desc')
  const [filters, setFilters] = useState({
    search: '',
    has_correspondence: '',
    corr_box: '',
    corr_from: '',
    corr_to: '',
    corr_party: '',
  })

  const loadRows = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const q = new URLSearchParams({
        deleted: 'false',
        include_meta: 'true',
        limit: String(pageSize),
        offset: String((page - 1) * pageSize),
        sort_by: sortBy,
        sort_dir: sortDir,
      })
      if (filters.search.trim()) q.set('search', filters.search.trim())
      if (filters.has_correspondence) q.set('has_correspondence', filters.has_correspondence)
      if (filters.corr_box) q.set('corr_box', filters.corr_box)
      if (filters.corr_from) q.set('corr_from', filters.corr_from)
      if (filters.corr_to) q.set('corr_to', filters.corr_to)
      if (filters.corr_party.trim()) q.set('corr_party', filters.corr_party.trim())
      const res = await httpFetch(`${API}/cases?${q.toString()}`, { headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load case query results.')
      const nextRows = Array.isArray(data?.rows) ? data.rows : (Array.isArray(data) ? data : [])
      setRows(nextRows)
      setTotal(Number(data?.total || nextRows.length || 0))
    } catch (err) {
      setRows([])
      setTotal(0)
      setError(err.message || 'Failed to load case query results.')
    } finally {
      setLoading(false)
    }
  }, [filters, token, page, pageSize, sortBy, sortDir])

  useEffect(() => { loadRows() }, [loadRows])
  useEffect(() => { setPage(1) }, [filters, pageSize, sortBy, sortDir])

  const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize))

  return (
    <MIMSLayout>
    <div className="cf-cases-page">
      <div className="cf-cases-header">
        <div className="cf-cases-title-row">
          <h1 className="cf-cases-title">Case Query</h1>
        </div>
        <div className="cf-query-toolbar">
          <input
            className="cf-cases-search"
            placeholder="Global search: case #, notes, contacts, products…"
            value={filters.search}
            onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
          />
          <select
            className="cf-query-select"
            value={filters.has_correspondence}
            onChange={e => setFilters(prev => ({ ...prev, has_correspondence: e.target.value }))}
          >
            <option value="">Has Correspondence: Any</option>
            <option value="yes">Has Correspondence: Yes</option>
            <option value="no">Has Correspondence: No</option>
          </select>
          <select
            className="cf-query-select"
            value={filters.corr_box}
            onChange={e => setFilters(prev => ({ ...prev, corr_box: e.target.value }))}
          >
            <option value="">Last Communication: Any</option>
            <option value="inbox">Last Communication: Inbox</option>
            <option value="sent">Last Communication: Sent</option>
          </select>
          <input
            className="cf-query-input"
            placeholder="Sender/Recipient keyword…"
            value={filters.corr_party}
            onChange={e => setFilters(prev => ({ ...prev, corr_party: e.target.value }))}
          />
          <label className="cf-query-date">
            <span>From</span>
            <input
              type="date"
              value={filters.corr_from}
              onChange={e => setFilters(prev => ({ ...prev, corr_from: e.target.value }))}
            />
          </label>
          <label className="cf-query-date">
            <span>To</span>
            <input
              type="date"
              value={filters.corr_to}
              onChange={e => setFilters(prev => ({ ...prev, corr_to: e.target.value }))}
            />
          </label>
          <button
            className="cf-cancel-btn"
            onClick={() => setFilters({
              search: '',
              has_correspondence: '',
              corr_box: '',
              corr_from: '',
              corr_to: '',
              corr_party: '',
            })}
          >
            Clear
          </button>
          <select className="cf-query-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="created_at">Sort: Created At</option>
            <option value="updated_at">Sort: Updated At</option>
            <option value="case_number">Sort: Case Number</option>
            <option value="date_received">Sort: Date Received</option>
            <option value="communication_count">Sort: Communication Count</option>
            <option value="last_comm_at">Sort: Last Communication</option>
          </select>
          <select className="cf-query-select" value={sortDir} onChange={e => setSortDir(e.target.value)}>
            <option value="desc">Direction: Desc</option>
            <option value="asc">Direction: Asc</option>
          </select>
          <select className="cf-query-select" value={pageSize} onChange={e => setPageSize(Number(e.target.value) || 25)}>
            <option value={25}>Page Size: 25</option>
            <option value={50}>Page Size: 50</option>
            <option value={100}>Page Size: 100</option>
          </select>
        </div>
      </div>

      <div className="cf-cases-body">
        {loading ? (
          <div className="cf-cases-loading">Loading query results…</div>
        ) : error ? (
          <div className="cf-form-error">{error}</div>
        ) : rows.length === 0 ? (
          <div className="cf-cases-empty">No case query results found.</div>
        ) : (
          <table className="cf-cases-table">
            <thead>
              <tr>
                <th>Case #</th>
                <th>Type</th>
                <th>Status</th>
                <th>Owner</th>
                <th>Communication Count</th>
                <th>Last Communication</th>
                <th>Last Direction</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(c => (
                <tr key={c.id} className="cf-cases-row" onClick={() => navigate(`/cases/${c.id}?section=correspondence`, { state: { from: '/case-query' } })}>
                  <td className="cf-case-num">{c.case_number || <span className="cf-draft-badge">DRAFT</span>}</td>
                  <td>
                    <span className="cf-type-badge" style={{ background: CASE_TYPE_COLORS[c.case_type] || '#6b7280' }}>
                      {c.case_type || '—'}
                    </span>
                  </td>
                  <td>{c.status_name || 'New'}</td>
                  <td>{c.owner_name || '—'}</td>
                  <td>{c.communication_count || 0}</td>
                  <td>{formatDateTime(c.last_comm_at)}</td>
                  <td>
                    {c.last_comm_box
                      ? <span className={`cf-query-dir ${c.last_comm_box}`}>{c.last_comm_box === 'sent' ? 'Sent' : 'Inbox'}</span>
                      : '—'}
                  </td>
                  <td>
                      <button
                        className="cf-open-btn"
                      onClick={e => { e.stopPropagation(); navigate(`/cases/${c.id}?section=correspondence`, { state: { from: '/case-query' } }) }}
                    >
                      Open Correspondence →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && !error && rows.length > 0 && (
          <div className="cf-query-pagination">
            <div className="cf-query-page-meta">
              Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total}
            </div>
            <div className="cf-query-page-actions">
              <button className="cf-open-btn" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>◀ Prev</button>
              <span className="cf-query-page-num">Page {page} / {totalPages}</span>
              <button className="cf-open-btn" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next ▶</button>
            </div>
          </div>
        )}
      </div>
    </div>
    </MIMSLayout>
  )
}
