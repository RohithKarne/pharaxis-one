/**
 * TransmissionsPage.jsx — Transmissions Log (F-10)
 * Displays all outbound transmissions (Argus, Veeva, TrackWise, etc.)
 * with search, filter by system/status, date range, and pagination.
 * CSS namespace: tx- (transmissions)
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import '../transmissions.css'
import { httpFetch } from '../../../shared/api/httpFetch.js'

const API = import.meta.env.VITE_API_URL || '/api'

function logScreenEvent(token, action, context) {
  httpFetch(`${API}/admin/transmission-screen-audit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, context }),
  }).catch(() => {})
}

// Stored status spelling varies by writer ("Sent", "SENT"), so it is compared in upper case.
const STATUS_COLORS = {
  SENT:    { bg: '#dcfce7', color: '#15803d' },
  FAILED:  { bg: '#fee2e2', color: '#dc2626' },
  PENDING: { bg: '#fef9c3', color: '#854d0e' },
  RETRY:   { bg: '#ffedd5', color: '#c2410c' },
}
const STATUS_LABELS = { SENT: 'Sent', FAILED: 'Failed', PENDING: 'Pending', RETRY: 'Retry', NO_TARGET: 'No target' }
const statusLabel = s => STATUS_LABELS[String(s || '').toUpperCase()] || s

function StatusBadge({ status }) {
  const s = STATUS_COLORS[String(status || '').toUpperCase()] || { bg: '#f1f5f9', color: '#475569' }
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 600,
      background: s.bg,
      color: s.color,
    }}>
      {status ? statusLabel(status) : '—'}
    </span>
  )
}

export default function TransmissionsPage() {
  const { token } = useAuth()
  const navigate        = useNavigate()
  const headers         = useMemo(
    () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
    [token]
  )

  const [entries,    setEntries]    = useState([])
  const [total,      setTotal]      = useState(0)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)
  const [statusCounts, setStatusCounts] = useState({})
  const [systems,    setSystems]    = useState([])

  // filters
  const [search,     setSearch]     = useState('')
  const [query,      setQuery]      = useState('')
  const [system,     setSystem]     = useState('All')
  const [status,     setStatus]     = useState('All')
  const [fromDate,   setFromDate]   = useState('')
  const [toDate,     setToDate]     = useState('')
  const [page,       setPage]       = useState(1)
  const limit = 50

  useEffect(() => {
    logScreenEvent(token, 'PAGE_VIEW', {})
  }, [token])

  // The search runs on the server; wait for a pause in typing before asking.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page, limit })
      if (system !== 'All')  params.set('target_system', system)
      if (status !== 'All')  params.set('status', status)
      if (fromDate)           params.set('from_date', fromDate)
      if (toDate)             params.set('to_date', toDate)
      if (query)              params.set('q', query)

      const res  = await httpFetch(`${API}/admin/transmission-audit-trail?${params}`, { headers })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to load transmissions.'); return }

      setEntries(data.entries || [])
      setTotal(data.total || 0)
      setStatusCounts(data.statusCounts || {})
      setSystems(data.systems || [])
    } catch {
      setError('Network error.')
    } finally {
      setLoading(false)
    }
  }, [fromDate, headers, page, query, status, system, toDate])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <MIMSLayout showStatStrip={false} bodyClassName="mims-ops-page-body" surfaceVariant="workspace" compact>
      <div className="tx-page">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="tx-header">
          <div className="tx-header-left">
            <h1 className="tx-title">Transmissions</h1>
            <span className="tx-subtitle">Outbound case transmissions to external systems</span>
          </div>
          <button className="tx-refresh-btn" onClick={() => { logScreenEvent(token, 'REFRESH', {}); fetchEntries() }} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {/* ── Filters ─────────────────────────────────────────────────── */}
        <div className="tx-filters">
          <input
            className="tx-search"
            placeholder="Search case number, system, user, payload…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
          <span className="tx-date-sep">System</span>
          <select className="tx-filter-select" value={system} onChange={e => { setSystem(e.target.value); setPage(1); logScreenEvent(token, 'FILTER_APPLIED', { target_system: e.target.value }) }}>
            <option value="All">All</option>
            {systems.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span className="tx-date-sep">Status</span>
          <select className="tx-filter-select" value={status} onChange={e => { setStatus(e.target.value); setPage(1); logScreenEvent(token, 'FILTER_APPLIED', { status: e.target.value }) }}>
            <option value="All">All</option>
            {Object.keys(statusCounts).filter(Boolean).map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
          <span className="tx-date-sep">From</span>
          <input
            type="date"
            className="tx-filter-date"
            value={fromDate}
            onChange={e => { setFromDate(e.target.value); setPage(1) }}
            title="From date"
          />
          <span className="tx-date-sep">to</span>
          <input
            type="date"
            className="tx-filter-date"
            value={toDate}
            onChange={e => { setToDate(e.target.value); setPage(1) }}
            title="To date"
          />
          {(search || system !== 'All' || status !== 'All' || fromDate || toDate) && (
            <button
              className="tx-clear-btn"
              onClick={() => {
                logScreenEvent(token, 'FILTER_CLEARED', {})
                setSearch(''); setSystem('All'); setStatus('All'); setFromDate(''); setToDate(''); setPage(1)
              }}
            >
              ✕ Clear
            </button>
          )}
        </div>

        {/* ── Stats strip ─────────────────────────────────────────────── */}
        <div className="tx-stats">
          <div className="tx-stat">
            <span className="tx-stat-val">{total}</span>
            <span className="tx-stat-label">Total Transmissions</span>
          </div>
          <div className="tx-stat">
            <span className="tx-stat-val" style={{ color: '#15803d' }}>
              {statusCounts.SENT || 0}
            </span>
            <span className="tx-stat-label">Sent</span>
          </div>
          <div className="tx-stat">
            <span className="tx-stat-val" style={{ color: '#dc2626' }}>
              {statusCounts.FAILED || 0}
            </span>
            <span className="tx-stat-label">Failed</span>
          </div>
          <div className="tx-stat">
            <span className="tx-stat-val">{systems.length}</span>
            <span className="tx-stat-label">Systems</span>
          </div>
        </div>

        {/* ── Table ───────────────────────────────────────────────────── */}
        {error && <div className="tx-error">{error}</div>}

        {!error && (
          <div className="tx-table-wrap">
            <table className="tx-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Case</th>
                  <th>Target System</th>
                  <th>Status</th>
                  <th>Response Code</th>
                  <th>Sent By</th>
                  <th>Timestamp</th>
                  <th>Payload Summary</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={8} className="tx-loading-row">Loading transmissions…</td></tr>
                )}
                {!loading && entries.length === 0 && (
                  <tr><td colSpan={8} className="tx-empty-row">No transmissions found matching your filters.</td></tr>
                )}
                {!loading && entries.map((row, i) => (
                  <tr key={row.id} className="tx-row">
                    <td className="tx-row-num">{(page - 1) * limit + i + 1}</td>
                    <td>
                      <button
                        className="tx-case-link"
                        onClick={() => navigate(`/cases/${row.case_id}`)}
                        title="Open case"
                      >
                        {row.case_number || row.case_id}
                      </button>
                    </td>
                    <td>
                      <span className="tx-system-tag">{row.target_system || '—'}</span>
                    </td>
                    <td><StatusBadge status={row.status} /></td>
                    <td>
                      <span className={`tx-code ${row.response_code >= 400 ? 'tx-code--error' : ''}`}>
                        {row.response_code || '—'}
                      </span>
                    </td>
                    <td className="tx-user">{row.user_name || row.user_id || '—'}</td>
                    <td className="tx-timestamp">
                      {row.timestamp
                        ? new Date(row.timestamp).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
                        : '—'}
                    </td>
                    <td className="tx-payload" title={row.payload_summary || ''}>
                      {row.payload_summary
                        ? (row.payload_summary.length > 80
                            ? row.payload_summary.slice(0, 80) + '…'
                            : row.payload_summary)
                        : <span className="tx-no-payload">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Pagination ──────────────────────────────────────────────── */}
        {!loading && totalPages > 1 && (
          <div className="tx-pagination">
            <button
              className="tx-page-btn"
              disabled={page === 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <span className="tx-page-info">Page {page} of {totalPages}</span>
            <button
              className="tx-page-btn"
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </MIMSLayout>
  )
}
