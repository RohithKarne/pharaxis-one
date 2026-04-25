/**
 * TransmissionsPage.jsx — Transmissions Log (F-10)
 * Displays all outbound transmissions (Argus, Veeva, TrackWise, etc.)
 * with search, filter by system/status, date range, and pagination.
 * CSS namespace: tx- (transmissions)
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import '../transmissions.css'

const API = import.meta.env.VITE_API_URL || '/api'

function logScreenEvent(token, action, context) {
  fetch(`${API}/admin/transmission-screen-audit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, context }),
  }).catch(() => {})
}

const STATUS_COLORS = {
  Sent:    { bg: '#dcfce7', color: '#15803d' },
  Failed:  { bg: '#fee2e2', color: '#dc2626' },
  Pending: { bg: '#fef9c3', color: '#854d0e' },
  Retry:   { bg: '#ffedd5', color: '#c2410c' },
}

const TARGET_SYSTEMS = ['All', 'Argus', 'Veeva', 'TrackWise', 'EMEA', 'CRM', 'Other']
const STATUSES       = ['All', 'Sent', 'Failed', 'Pending', 'Retry']

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || { bg: '#f1f5f9', color: '#475569' }
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
      {status || '—'}
    </span>
  )
}

export default function TransmissionsPage() {
  const { token, user } = useAuth()
  const navigate        = useNavigate()
  const headers         = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  const [entries,    setEntries]    = useState([])
  const [total,      setTotal]      = useState(0)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)

  // filters
  const [search,     setSearch]     = useState('')
  const [system,     setSystem]     = useState('All')
  const [status,     setStatus]     = useState('All')
  const [fromDate,   setFromDate]   = useState('')
  const [toDate,     setToDate]     = useState('')
  const [page,       setPage]       = useState(1)
  const limit = 50

  useEffect(() => {
    logScreenEvent(token, 'PAGE_VIEW', {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page, limit })
      if (system !== 'All')  params.set('target_system', system)
      if (status !== 'All')  params.set('status', status)
      if (fromDate)           params.set('from_date', fromDate)
      if (toDate)             params.set('to_date', toDate)

      const res  = await fetch(`${API}/admin/transmission-audit-trail?${params}`, { headers })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to load transmissions.'); return }

      let rows = data.entries || []
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        rows = rows.filter(r =>
          String(r.case_id).toLowerCase().includes(q) ||
          (r.target_system || '').toLowerCase().includes(q) ||
          (r.user_name || '').toLowerCase().includes(q) ||
          (r.payload_summary || '').toLowerCase().includes(q)
        )
      }
      setEntries(rows)
      setTotal(data.total || 0)
    } catch (e) {
      setError('Network error.')
    } finally {
      setLoading(false)
    }
  }, [page, system, status, fromDate, toDate, search, token])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <MIMSLayout activeNav="transmissions">
      <div className="tx-page">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="tx-header">
          <div className="tx-header-left">
            <h1 className="tx-title">Transmissions</h1>
            <span className="tx-subtitle">Outbound case transmissions to external systems</span>
          </div>
          <button className="tx-refresh-btn" onClick={() => { logScreenEvent(token, 'REFRESH', {}); fetchEntries() }} disabled={loading}>
            {loading ? '⟳ Loading…' : '⟳ Refresh'}
          </button>
        </div>

        {/* ── Filters ─────────────────────────────────────────────────── */}
        <div className="tx-filters">
          <input
            className="tx-search"
            placeholder="Search case ID, system, user, payload…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
          <select className="tx-filter-select" value={system} onChange={e => { setSystem(e.target.value); setPage(1); logScreenEvent(token, 'FILTER_APPLIED', { target_system: e.target.value }) }}>
            {TARGET_SYSTEMS.map(s => <option key={s}>{s}</option>)}
          </select>
          <select className="tx-filter-select" value={status} onChange={e => { setStatus(e.target.value); setPage(1); logScreenEvent(token, 'FILTER_APPLIED', { status: e.target.value }) }}>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
          <input
            type="date"
            className="tx-filter-date"
            value={fromDate}
            onChange={e => { setFromDate(e.target.value); setPage(1) }}
            title="From date"
          />
          <span className="tx-date-sep">→</span>
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
              {entries.filter(r => r.status === 'Sent').length}
            </span>
            <span className="tx-stat-label">Sent (this page)</span>
          </div>
          <div className="tx-stat">
            <span className="tx-stat-val" style={{ color: '#dc2626' }}>
              {entries.filter(r => r.status === 'Failed').length}
            </span>
            <span className="tx-stat-label">Failed (this page)</span>
          </div>
          <div className="tx-stat">
            <span className="tx-stat-val">
              {[...new Set(entries.map(r => r.target_system).filter(Boolean))].length}
            </span>
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
                  <th>Case ID</th>
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
                        {row.case_id}
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
              ← Prev
            </button>
            <span className="tx-page-info">Page {page} of {totalPages}</span>
            <button
              className="tx-page-btn"
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </MIMSLayout>
  )
}
