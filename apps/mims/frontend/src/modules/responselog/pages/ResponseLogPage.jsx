/**
 * ResponseLogPage.jsx — MI Response Log (S19-P0)
 * Filterable log of all MI responses across cases.
 * Shows status, recipient, case number, author, approval chain, and delivery status.
 * CSS namespace: rl-
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import '../responselog.css'
import { httpFetch } from '../../../shared/api/httpFetch.js'

const API = import.meta.env.VITE_API_URL || '/api'

const STATUS_STYLE = {
  DRAFT:    { bg: '#f1f5f9', color: '#475569', label: 'Draft' },
  READY:    { bg: '#fef9c3', color: '#854d0e', label: 'Ready' },
  APPROVED: { bg: '#dbeafe', color: '#1d4ed8', label: 'Approved' },
  SENT:     { bg: '#dcfce7', color: '#15803d', label: 'Sent' },
  VOIDED:   { bg: '#fee2e2', color: '#dc2626', label: 'Voided' },
}

const STATUSES = ['All', 'DRAFT', 'READY', 'APPROVED', 'SENT', 'VOIDED']

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || { bg: '#f1f5f9', color: '#475569', label: status }
  return (
    <span style={{ display:'inline-block', padding:'2px 10px', borderRadius:12, fontSize:11, fontWeight:700, background:s.bg, color:s.color }}>
      {s.label}
    </span>
  )
}

function DetailModal({ resp, onClose }) {
  if (!resp) return null
  return (
    <div className="rl-overlay" onClick={onClose}>
      <div className="rl-modal" onClick={e => e.stopPropagation()}>
        <div className="rl-modal-header">
          <span className="rl-modal-title">Response #{resp.id} — Case {resp.case_number || resp.case_id}</span>
          <button className="rl-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="rl-modal-body">
          <div className="rl-detail-grid">
            <div className="rl-detail-row"><span className="rl-detail-label">Status</span><StatusBadge status={resp.response_status} /></div>
            <div className="rl-detail-row"><span className="rl-detail-label">Case</span><span>{resp.case_number || resp.case_id}</span></div>
            <div className="rl-detail-row"><span className="rl-detail-label">Type</span><span>{resp.case_type || '—'}</span></div>
            <div className="rl-detail-row"><span className="rl-detail-label">Author</span><span>{resp.author_name || '—'}</span></div>
            <div className="rl-detail-row"><span className="rl-detail-label">Approved By</span><span>{resp.approved_by_name || '—'}</span></div>
            <div className="rl-detail-row"><span className="rl-detail-label">Approved At</span><span>{resp.approved_at ? new Date(resp.approved_at).toLocaleString() : '—'}</span></div>
            <div className="rl-detail-row"><span className="rl-detail-label">To</span><span>{resp.recipient_name ? `${resp.recipient_name} <${resp.recipient_email}>` : resp.recipient_email || '—'}</span></div>
            <div className="rl-detail-row"><span className="rl-detail-label">Channel</span><span>{resp.response_channel || '—'}</span></div>
            <div className="rl-detail-row"><span className="rl-detail-label">Date</span><span>{resp.response_date || '—'}</span></div>
            <div className="rl-detail-row"><span className="rl-detail-label">Follow-up</span><span>{resp.follow_up_required ? 'Yes' : 'No'}</span></div>
          </div>
          {resp.response_text && (
            <div className="rl-response-text">
              <div className="rl-detail-label" style={{ marginBottom:8 }}>Response Text</div>
              <div className="rl-response-body">{resp.response_text}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ResponseLogPage() {
  const { token } = useAuth()
  const navigate  = useNavigate()
  const headers   = useMemo(
    () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
    [token]
  )

  const [responses, setResponses] = useState([])
  const [total,     setTotal]     = useState(0)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [detail,    setDetail]    = useState(null)

  const [search,    setSearch]    = useState('')
  const [status,    setStatus]    = useState('All')
  const [fromDate,  setFromDate]  = useState('')
  const [toDate,    setToDate]    = useState('')
  const [page,      setPage]      = useState(1)
  const limit = 50

  const fetchLog = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ page, limit })
      if (status !== 'All') params.set('status', status)
      if (fromDate)          params.set('from_date', fromDate)
      if (toDate)            params.set('to_date', toDate)
      if (search.trim())     params.set('search', search.trim())

      const res  = await httpFetch(`${API}/cases/mi-responses/log?${params}`, { headers })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to load response log.'); return }
      setResponses(data.responses || [])
      setTotal(data.total || 0)
    } catch { setError('Network error.') }
    finally { setLoading(false) }
  }, [fromDate, headers, page, search, status, toDate])

  useEffect(() => { fetchLog() }, [fetchLog])

  const totalPages = Math.max(1, Math.ceil(total / limit))
  const sentCount     = responses.filter(r => r.response_status === 'SENT').length
  const pendingCount  = responses.filter(r => ['DRAFT','READY','APPROVED'].includes(r.response_status)).length

  function clearFilters() { setSearch(''); setStatus('All'); setFromDate(''); setToDate(''); setPage(1) }
  const hasFilters = search || status !== 'All' || fromDate || toDate

  return (
    <MIMSLayout activeNav="response_log">
      <div className="rl-page">
        {/* Header */}
        <div className="rl-header">
          <div>
            <h1 className="rl-title">Response Log</h1>
            <span className="rl-subtitle">All MI responses — complete audit trail per 21 CFR Part 11</span>
          </div>
          <button className="rl-refresh-btn" onClick={fetchLog} disabled={loading}>⟳ Refresh</button>
        </div>

        {/* Stats */}
        <div className="rl-stats">
          <div className="rl-stat"><span className="rl-stat-val">{total}</span><span className="rl-stat-label">Total</span></div>
          <div className="rl-stat"><span className="rl-stat-val" style={{ color:'#15803d' }}>{sentCount}</span><span className="rl-stat-label">Sent (page)</span></div>
          <div className="rl-stat"><span className="rl-stat-val" style={{ color:'#854d0e' }}>{pendingCount}</span><span className="rl-stat-label">Pending (page)</span></div>
        </div>

        {/* Filters */}
        <div className="rl-filters">
          <input className="rl-search" placeholder="Search case #, text, author…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          <select className="rl-filter-select" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
          <input type="date" className="rl-filter-date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1) }} title="From date" />
          <span style={{ color:'#94a3b8' }}>→</span>
          <input type="date" className="rl-filter-date" value={toDate} onChange={e => { setToDate(e.target.value); setPage(1) }} title="To date" />
          {hasFilters && <button className="rl-clear-btn" onClick={clearFilters}>✕ Clear</button>}
        </div>

        {/* Table */}
        {error && <div className="rl-error">{error}</div>}
        <div className="rl-table-wrap">
          <table className="rl-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Case</th>
                <th>Type</th>
                <th>Status</th>
                <th>Recipient</th>
                <th>Author</th>
                <th>Approved By</th>
                <th>Channel</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={10} className="rl-loading-row">Loading…</td></tr>}
              {!loading && responses.length === 0 && (
                <tr><td colSpan={10} className="rl-empty-row">No responses found{hasFilters ? ' matching your filters' : ''}.</td></tr>
              )}
              {!loading && responses.map((r, i) => (
                <tr key={r.id} className="rl-row">
                  <td className="rl-row-num">{(page - 1) * limit + i + 1}</td>
                  <td>
                    <button className="rl-case-link" onClick={() => navigate(`/cases/${r.case_id}`)}>
                      {r.case_number || `#${r.case_id}`}
                    </button>
                  </td>
                  <td><span className="rl-type-tag">{r.case_type || '—'}</span></td>
                  <td><StatusBadge status={r.response_status} /></td>
                  <td className="rl-recipient">
                    {r.recipient_name && <div className="rl-recipient-name">{r.recipient_name}</div>}
                    <div className="rl-recipient-email">{r.recipient_email || '—'}</div>
                  </td>
                  <td className="rl-author">{r.author_name || '—'}</td>
                  <td className="rl-author">{r.approved_by_name || '—'}</td>
                  <td>{r.response_channel || '—'}</td>
                  <td className="rl-date">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString('en-US', { dateStyle:'medium' }) : '—'}
                  </td>
                  <td>
                    <button className="rl-view-btn" onClick={() => setDetail(r)}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="rl-pagination">
            <button className="rl-page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
            <span className="rl-page-info">Page {page} of {totalPages}</span>
            <button className="rl-page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
          </div>
        )}
      </div>

      <DetailModal resp={detail} onClose={() => setDetail(null)} />
    </MIMSLayout>
  )
}
