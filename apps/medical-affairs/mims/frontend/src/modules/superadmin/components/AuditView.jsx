import React, { useState, useEffect, useCallback } from 'react'
import { guardedFetch, downloadCsv } from '../utils/guardedFetch'

function AuditDetailPanel({ details }) {
  let parsed = null
  try {
    parsed = typeof details === 'object' ? details : JSON.parse(details)
  } catch { parsed = null }

  if (!parsed) {
    return <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>{String(details)}</pre>
  }

  const hasDiff = parsed.before !== undefined || parsed.after !== undefined

  if (hasDiff) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#c0392b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Before</div>
          <div style={{ background: '#fdf0ef', border: '1px solid #f5c6cb', borderRadius: 6, padding: 10, fontSize: 12 }}>
            {parsed.before && typeof parsed.before === 'object'
              ? Object.entries(parsed.before).map(([k, v]) => (
                <div key={k} style={{ marginBottom: 4 }}><strong>{k}:</strong> {JSON.stringify(v)}</div>
              ))
              : <span>{String(parsed.before ?? '—')}</span>
            }
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#155724', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>After</div>
          <div style={{ background: '#d4edda', border: '1px solid #c3e6cb', borderRadius: 6, padding: 10, fontSize: 12 }}>
            {parsed.after && typeof parsed.after === 'object'
              ? Object.entries(parsed.after).map(([k, v]) => (
                <div key={k} style={{ marginBottom: 4 }}><strong>{k}:</strong> {JSON.stringify(v)}</div>
              ))
              : <span>{String(parsed.after ?? '—')}</span>
            }
          </div>
        </div>
        {Object.keys(parsed).filter(k => k !== 'before' && k !== 'after').length > 0 && (
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>Additional Fields</div>
            {Object.entries(parsed).filter(([k]) => k !== 'before' && k !== 'after').map(([k, v]) => (
              <div key={k} style={{ fontSize: 12, marginBottom: 4 }}><strong>{k}:</strong> {JSON.stringify(v)}</div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ fontSize: 12 }}>
      {Object.entries(parsed).map(([k, v]) => (
        <div key={k} style={{ marginBottom: 4 }}><strong>{k}:</strong> {JSON.stringify(v)}</div>
      ))}
    </div>
  )
}

export default function AuditView({ H, endpoint }) {
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [filters, setFilters] = useState({ from: '', to: '', user: '', action: '', entity: '' })
  const [loading, setLoading] = useState(true)
  const [expandedLogId, setExpandedLogId] = useState(null)
  const LIMIT = 50

  const load = useCallback(async (off = 0) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: LIMIT, offset: off })
      Object.entries(filters).forEach(([key, value]) => value && params.set(key, value))
      const res = await guardedFetch(`${endpoint}?${params}`, { headers: H })
      const data = await res.json()
      setLogs(data.logs || [])
      setTotal(data.total || 0)
      setOffset(off)
    } finally {
      setLoading(false)
    }
  }, [endpoint, filters, H.Authorization]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(0) }, [load])

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Audit Trail</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{total} record{total !== 1 ? 's' : ''}</span>
          <button
            className="btn btn-outline"
            style={{ fontSize: 11, padding: '4px 10px' }}
            onClick={() => {
              const params = new URLSearchParams({ export: 'csv' })
              Object.entries(filters).forEach(([key, value]) => value && params.set(key, value))
              downloadCsv(`${endpoint}?${params}`)
            }}
          >
            Export CSV
          </button>
        </div>
      </div>
      <div className="card-body" style={{ borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input className="form-control" style={{ maxWidth: 150 }} type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
        <input className="form-control" style={{ maxWidth: 150 }} type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
        <input className="form-control" style={{ maxWidth: 150 }} placeholder="User" value={filters.user} onChange={e => setFilters(f => ({ ...f, user: e.target.value }))} />
        <input className="form-control" style={{ maxWidth: 150 }} placeholder="Action" value={filters.action} onChange={e => setFilters(f => ({ ...f, action: e.target.value }))} />
        <input className="form-control" style={{ maxWidth: 150 }} placeholder="Entity" value={filters.entity} onChange={e => setFilters(f => ({ ...f, entity: e.target.value }))} />
        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => load(0)}>Search</button>
      </div>
      <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>User</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>Loading…</td></tr>
            )}
            {!loading && logs.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No audit records found.</td></tr>
            )}
            {logs.map(log => {
              const rawDetails = log.details ? (typeof log.details === 'object' ? JSON.stringify(log.details) : log.details) : null
              const truncated = rawDetails ? (rawDetails.length > 60 ? rawDetails.slice(0, 60) + '…' : rawDetails) : '—'
              const isExpanded = expandedLogId === log.id
              return (
                <React.Fragment key={log.id}>
                  <tr>
                    <td style={{ fontSize: 11, whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{log.created_at}</td>
                    <td>
                      <div style={{ fontSize: 12 }}>{log.user_name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>ID {log.user_id}</div>
                    </td>
                    <td><span className="badge">{log.action}</span></td>
                    <td style={{ fontSize: 12 }}>{log.entity}{log.entity_id ? ` #${log.entity_id}` : ''}</td>
                    <td style={{ fontSize: 11, maxWidth: 300 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ wordBreak: 'break-all', color: 'var(--text-muted)' }}>{truncated}</span>
                        {rawDetails && rawDetails.length > 0 && (
                          <button
                            className="btn btn-outline"
                            style={{ fontSize: 10, padding: '2px 8px', flexShrink: 0 }}
                            onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                          >
                            {isExpanded ? 'Hide' : 'View'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={5} style={{ background: 'var(--bg-secondary)', padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                        <AuditDetailPanel details={log.details || rawDetails} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {total > LIMIT && (
        <div style={{ padding: '10px 16px', display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-secondary" style={{ fontSize: 12 }} disabled={offset === 0} onClick={() => load(offset - LIMIT)}>← Prev</button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
            {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
          </span>
          <button className="btn btn-secondary" style={{ fontSize: 12 }} disabled={offset + LIMIT >= total} onClick={() => load(offset + LIMIT)}>Next →</button>
        </div>
      )}
    </div>
  )
}
