/**
 * TransmissionAuditTrailPage.jsx — Transmission Audit Trail (two-panel UI)
 * Left: cases with outbound transmissions · Right: numbered transmission records with full detail
 * CSS namespace: tat-
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import './TransmissionAuditTrailPage.css'
import { httpFetch } from '../../../shared/api/httpFetch.js'

const API = import.meta.env.VITE_API_URL || '/api'

function statusClass(status) {
  if (!status) return ''
  return status.toLowerCase() === 'sent' ? 'sent' : 'failed'
}

function TxRecord({ entry, index, total }) {
  const [open, setOpen] = useState(false)
  const txNum = total - index
  const sc = statusClass(entry.status)
  const ts = entry.timestamp ? new Date(entry.timestamp).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

  return (
    <div className="tat-tx">
      <div className="tat-tx-hdr" onClick={() => setOpen(o => !o)}>
        <span className={`tat-tx-num ${sc}`}>#{txNum}</span>
        <span className="tat-tx-system">{entry.target_system || '—'}</span>
        <span className="tat-tx-time">{ts}</span>
        <span className={`tat-tx-status ${sc}`}>{entry.status || '—'}</span>
        <span className={`tat-tx-chevron${open ? ' open' : ''}`}>▶</span>
      </div>
      {open && (
        <div className="tat-tx-body">
          <div className="tat-tx-grid">
            <div className="tat-tx-row">
              <span className="tat-tx-label">Target System</span>
              <span className="tat-tx-val">{entry.target_system || '—'}</span>
            </div>
            <div className="tat-tx-row">
              <span className="tat-tx-label">Status</span>
              <span className={`tat-tx-status ${sc}`}>{entry.status || '—'}</span>
            </div>
            {entry.response_code != null && (
              <div className="tat-tx-row">
                <span className="tat-tx-label">Response Code</span>
                <span className="tat-tx-val">{entry.response_code}</span>
              </div>
            )}
            <div className="tat-tx-row">
              <span className="tat-tx-label">Sent By</span>
              <span className="tat-tx-val">{entry.user_name || entry.user_id || '—'}</span>
            </div>
            <div className="tat-tx-row">
              <span className="tat-tx-label">Timestamp</span>
              <span className="tat-tx-val">
                {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '—'}
              </span>
            </div>
          </div>
          {entry.payload_summary && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
                Payload Summary
              </div>
              <div className="tat-tx-payload">{entry.payload_summary}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function RightPanel({ caseItem, token }) {
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token])
  const [entries,  setEntries]  = useState([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  useEffect(() => {
    if (!caseItem) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      setEntries([])
      try {
        const data = await httpFetch(`${API}/admin/transmission-audit-trail/${caseItem.case_id}`, { headers }).then(r => r.json())
        if (cancelled) return
        if (data.error) { setError(data.error); return }
        setEntries(data.entries || [])
      } catch {
        if (!cancelled) setError('Network error.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [caseItem, headers])

  if (!caseItem) {
    return (
      <div className="tat-right">
        <div className="tat-right-empty">
          <div className="tat-right-empty-icon">📡</div>
          <div>Select a case to view its transmission history</div>
        </div>
      </div>
    )
  }

  return (
    <div className="tat-right">
      <div className="tat-right-hdr">
        <div className="tat-right-case">{caseItem.case_number || `Case #${caseItem.case_id}`}</div>
        <div className="tat-right-sub">
          {caseItem.case_type && <span>{caseItem.case_type} · </span>}
          {caseItem.total_transmissions} transmission{caseItem.total_transmissions !== 1 ? 's' : ''} ·
          Systems: {caseItem.systems || '—'}
        </div>
      </div>
      <div className="tat-right-body">
        {loading && <div className="tat-right-loading">Loading transmissions…</div>}
        {error && <div className="tat-error-banner">{error}</div>}
        {!loading && !error && entries.length === 0 && (
          <div className="tat-right-loading">No transmissions found for this case.</div>
        )}
        {!loading && entries.map((e, i) => (
          <TxRecord key={e.id} entry={e} index={i} total={entries.length} />
        ))}
      </div>
    </div>
  )
}

export default function TransmissionAuditTrailPage({ embedded = false } = {}) {
  const { token } = useAuth()
  const headers   = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token])

  const [cases,       setCases]       = useState([])
  const [total,       setTotal]       = useState(0)
  const [leftLoading, setLeftLoading] = useState(false)
  const [leftError,   setLeftError]   = useState(null)
  const [selected,    setSelected]    = useState(null)
  const [search,      setSearch]      = useState('')
  const [page,        setPage]        = useState(1)
  const limit = 30

  const fetchCases = useCallback(async () => {
    setLeftLoading(true); setLeftError(null)
    try {
      const params = new URLSearchParams({ page, limit })
      if (search.trim()) params.set('search', search.trim())
      const res  = await httpFetch(`${API}/admin/transmission-audit-trail/cases-summary?${params}`, { headers })
      const data = await res.json()
      if (!res.ok) { setLeftError(data.error || 'Failed to load cases.'); return }
      setCases(data.cases || [])
      setTotal(data.total || 0)
    } catch { setLeftError('Network error.') }
    finally { setLeftLoading(false) }
  }, [headers, page, search])

  useEffect(() => { fetchCases() }, [fetchCases])

  const totalPages = Math.max(1, Math.ceil(total / limit))

  function handleSearch(val) { setSearch(val); setPage(1); setSelected(null) }

  const content = (
    <>
      <div className="tat-page">
        <div className="tat-top">
          <div>
            <h1 className="tat-title">Transmission Audit Trail</h1>
            <span className="tat-subtitle">Outbound transmission log per case — click a case to view all transmissions</span>
          </div>
          <button className="tat-refresh-btn" onClick={fetchCases} disabled={leftLoading}>⟳ Refresh</button>
        </div>

        <div className="tat-panels">
          {/* Left — case list */}
          <div className="tat-left">
            <div className="tat-left-hdr">
              <span className="tat-left-title">Cases ({total})</span>
              <input
                className="tat-search"
                placeholder="Search case number…"
                value={search}
                onChange={e => handleSearch(e.target.value)}
              />
            </div>
            <div className="tat-left-list">
              {leftLoading && <div className="tat-left-loading">Loading…</div>}
              {leftError   && <div className="tat-left-empty" style={{ color: '#dc2626' }}>{leftError}</div>}
              {!leftLoading && cases.length === 0 && !leftError && (
                <div className="tat-left-empty">No cases with transmissions{search ? ' matching your search' : ''}.</div>
              )}
              {cases.map(c => (
                <div
                  key={c.case_id}
                  className={`tat-case-item${selected?.case_id === c.case_id ? ' active' : ''}`}
                  onClick={() => setSelected(c)}
                >
                  <div className="tat-case-item-num">{c.case_number || `#${c.case_id}`}</div>
                  <div className="tat-case-item-meta">
                    {c.case_type && <span>{c.case_type} · </span>}
                    {c.systems || 'No systems'}
                  </div>
                  <div className="tat-case-item-stats">
                    <span className="tat-case-item-stat">{c.total_transmissions} total</span>
                    {c.sent_count > 0 && <span className="tat-case-item-stat tat-case-item-sent">{c.sent_count} sent</span>}
                    {c.failed_count > 0 && <span className="tat-case-item-stat tat-case-item-failed">{c.failed_count} failed</span>}
                  </div>
                </div>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="tat-left-pagination">
                <button className="tat-left-pg-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>←</button>
                <span className="tat-left-pg-info">{page} / {totalPages}</span>
                <button className="tat-left-pg-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>→</button>
              </div>
            )}
          </div>

          {/* Right — transmission records */}
          <RightPanel caseItem={selected} token={token} />
        </div>
      </div>
    </>
  )

  if (embedded) return content
  return <MIMSLayout activeNav="utilities">{content}</MIMSLayout>
}
