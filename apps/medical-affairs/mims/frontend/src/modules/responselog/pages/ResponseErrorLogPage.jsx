/**
 * ResponseErrorLogPage.jsx — Response Error Log
 * Org-admin view of response API and email delivery errors, each with a UUID log ID.
 * CSS namespace: rel-
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import './ResponseErrorLogPage.css'

const API = import.meta.env.VITE_API_URL || '/api'

const ERROR_TYPE_STYLE = {
  EMAIL_DELIVERY_FAILED: { bg: '#fee2e2', color: '#dc2626' },
  API_ERROR:             { bg: '#fef3c7', color: '#92400e' },
  DEFAULT:               { bg: '#f1f5f9', color: '#475569' },
}

function ErrorTypeBadge({ errorType }) {
  const s = ERROR_TYPE_STYLE[errorType] || ERROR_TYPE_STYLE.DEFAULT
  return (
    <span style={{ display:'inline-block', padding:'2px 9px', borderRadius:10, fontSize:11, fontWeight:700, background:s.bg, color:s.color }}>
      {errorType || '—'}
    </span>
  )
}

function DetailModal({ entry, onClose }) {
  if (!entry) return null
  let details = {}
  try { details = typeof entry.details === 'string' ? JSON.parse(entry.details) : (entry.details || {}) } catch {}
  return (
    <div className="rel-overlay" onClick={onClose}>
      <div className="rel-modal" onClick={e => e.stopPropagation()}>
        <div className="rel-modal-header">
          <span className="rel-modal-title">Error Details</span>
          <button className="rel-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="rel-modal-body">
          <div className="rel-log-id-block">
            <span className="rel-detail-label">Log ID</span>
            <code className="rel-log-id-code">{entry.log_id}</code>
          </div>
          <div className="rel-detail-grid">
            <div className="rel-detail-row"><span className="rel-detail-label">Error Type</span><ErrorTypeBadge errorType={entry.error_type} /></div>
            <div className="rel-detail-row"><span className="rel-detail-label">Case</span><span>{entry.case_id ? `#${entry.case_id}` : '—'}</span></div>
            <div className="rel-detail-row"><span className="rel-detail-label">Timestamp</span><span>{entry.created_at ? new Date(entry.created_at).toLocaleString() : '—'}</span></div>
          </div>
          <div className="rel-detail-section">
            <div className="rel-detail-label" style={{ marginBottom:4 }}>Error Message</div>
            <div className="rel-error-msg-box">{entry.error_message || '—'}</div>
          </div>
          {Object.keys(details).length > 0 && (
            <div className="rel-detail-section">
              <div className="rel-detail-label" style={{ marginBottom:4 }}>Additional Details</div>
              <div className="rel-json-box">
                {Object.entries(details).map(([k, v]) => (
                  <div key={k} className="rel-json-row">
                    <span className="rel-json-key">{k}</span>
                    <span className="rel-json-val">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ResponseErrorLogPage() {
  const { token } = useAuth()
  const navigate  = useNavigate()
  const headers   = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  const [entries,   setEntries]   = useState([])
  const [total,     setTotal]     = useState(0)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [detail,    setDetail]    = useState(null)

  const [caseId,     setCaseId]     = useState('')
  const [errorType,  setErrorType]  = useState('')
  const [fromDate,   setFromDate]   = useState('')
  const [toDate,     setToDate]     = useState('')
  const [page,       setPage]       = useState(1)
  const limit = 50

  const fetchEntries = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({ page, limit })
      if (caseId.trim())    params.set('case_id', caseId.trim())
      if (errorType.trim()) params.set('error_type', errorType.trim())
      if (fromDate)         params.set('from_date', fromDate)
      if (toDate)           params.set('to_date', toDate)

      const res  = await fetch(`${API}/admin/response-error-logs?${params}`, { headers })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to load response error log.'); return }
      setEntries(data.entries || [])
      setTotal(data.total || 0)
    } catch { setError('Network error.') }
    finally { setLoading(false) }
  }, [page, caseId, errorType, fromDate, toDate, token])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const totalPages  = Math.max(1, Math.ceil(total / limit))
  const hasFilters  = caseId || errorType || fromDate || toDate

  function clearFilters() { setCaseId(''); setErrorType(''); setFromDate(''); setToDate(''); setPage(1) }

  return (
    <MIMSLayout activeNav="response_error_log">
      <div className="rel-page">
        <div className="rel-header">
          <div>
            <h1 className="rel-title">Response Error Log</h1>
            <span className="rel-subtitle">API and email delivery errors on MI responses — each entry has a unique Log ID for traceability</span>
          </div>
          <button className="rel-refresh-btn" onClick={fetchEntries} disabled={loading}>⟳ Refresh</button>
        </div>

        <div className="rel-stats">
          <div className="rel-stat"><span className="rel-stat-val">{total}</span><span className="rel-stat-label">Total Errors</span></div>
          <div className="rel-stat"><span className="rel-stat-val">{entries.filter(e => e.error_type === 'EMAIL_DELIVERY_FAILED').length}</span><span className="rel-stat-label">Email Failures</span></div>
          <div className="rel-stat"><span className="rel-stat-val">{entries.filter(e => e.error_type === 'API_ERROR').length}</span><span className="rel-stat-label">API Errors</span></div>
        </div>

        <div className="rel-filters">
          <input className="rel-filter-input" placeholder="Filter by Case ID…" value={caseId} onChange={e => { setCaseId(e.target.value); setPage(1) }} />
          <input className="rel-filter-input" placeholder="Error type…" value={errorType} onChange={e => { setErrorType(e.target.value); setPage(1) }} />
          <input type="date" className="rel-filter-date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1) }} title="From date" />
          <span style={{ color:'#94a3b8' }}>→</span>
          <input type="date" className="rel-filter-date" value={toDate} onChange={e => { setToDate(e.target.value); setPage(1) }} title="To date" />
          {hasFilters && <button className="rel-clear-btn" onClick={clearFilters}>✕ Clear</button>}
        </div>

        {error && <div className="rel-error-banner">{error}</div>}

        <div className="rel-table-wrap">
          <table className="rel-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Log ID</th>
                <th>Error Type</th>
                <th>Case</th>
                <th>Message</th>
                <th>Timestamp</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="rel-loading-row">Loading…</td></tr>}
              {!loading && entries.length === 0 && (
                <tr><td colSpan={7} className="rel-empty-row">No error records found{hasFilters ? ' matching your filters' : ''}.</td></tr>
              )}
              {!loading && entries.map((e, i) => (
                <tr key={e.id} className="rel-row">
                  <td className="rel-row-num">{(page - 1) * limit + i + 1}</td>
                  <td><code className="rel-log-id-short" title={e.log_id}>{e.log_id?.slice(0, 8)}…</code></td>
                  <td><ErrorTypeBadge errorType={e.error_type} /></td>
                  <td>
                    {e.case_id
                      ? <button className="rel-case-link" onClick={() => navigate(`/cases/${e.case_id}`)}>#{e.case_id}</button>
                      : <span className="rel-muted">—</span>}
                  </td>
                  <td className="rel-msg">{e.error_message ? (e.error_message.length > 80 ? e.error_message.slice(0, 80) + '…' : e.error_message) : '—'}</td>
                  <td className="rel-timestamp">{e.created_at ? new Date(e.created_at).toLocaleString('en-US', { dateStyle:'medium', timeStyle:'short' }) : '—'}</td>
                  <td><button className="rel-view-btn" onClick={() => setDetail(e)}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && totalPages > 1 && (
          <div className="rel-pagination">
            <button className="rel-page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
            <span className="rel-page-info">Page {page} of {totalPages} · {total} records</span>
            <button className="rel-page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
          </div>
        )}
      </div>
      <DetailModal entry={detail} onClose={() => setDetail(null)} />
    </MIMSLayout>
  )
}
