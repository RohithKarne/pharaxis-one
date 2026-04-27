import { useState, useEffect, useCallback } from 'react'
import { guardedFetch, downloadCsv } from '../utils/guardedFetch'

export default function LoginAuditView({ H }) {
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [filters, setFilters] = useState({ status: '', from: '', to: '', user: '', role: '' })
  const [loading, setLoading] = useState(true)
  const LIMIT = 50

  const load = useCallback(async (off = 0, nextFilters = filters) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: LIMIT, offset: off })
      Object.entries(nextFilters).forEach(([key, value]) => value && params.set(key, value))
      const res = await guardedFetch(`/api/superadmin/login-audit?${params}`, { headers: H })
      const data = await res.json()
      setLogs(data.logs || [])
      setTotal(data.total || 0)
      setOffset(off)
    } finally {
      setLoading(false)
    }
  }, [filters, H.Authorization]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(0) }, [load])

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Login Audit</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{total} record{total !== 1 ? 's' : ''}</span>
          <button
            className="btn btn-outline"
            style={{ fontSize: 11, padding: '4px 10px' }}
            onClick={() => {
              const params = new URLSearchParams({ export: 'csv' })
              Object.entries(filters).forEach(([key, value]) => value && params.set(key, value))
              downloadCsv(`/api/superadmin/login-audit?${params}`)
            }}
          >
            Export CSV
          </button>
        </div>
      </div>
      <div className="card-body" style={{ borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select
          className="form-control"
          style={{ maxWidth: 140 }}
          value={filters.status}
          onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
        >
          <option value="">All statuses</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
        </select>
        <input className="form-control" style={{ maxWidth: 150 }} type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
        <input className="form-control" style={{ maxWidth: 150 }} type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
        <input className="form-control" style={{ maxWidth: 150 }} placeholder="User" value={filters.user} onChange={e => setFilters(f => ({ ...f, user: e.target.value }))} />
        <input className="form-control" style={{ maxWidth: 140 }} placeholder="Role" value={filters.role} onChange={e => setFilters(f => ({ ...f, role: e.target.value }))} />
        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => load(0)}>Search</button>
      </div>
      <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Login Time</th>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>IP Address</th>
              <th>Location</th>
              <th>Fail Reason</th>
              <th>Logout Time</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>Loading…</td></tr>
            )}
            {!loading && logs.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No login records found.</td></tr>
            )}
            {logs.map(log => (
              <tr key={log.id}>
                <td style={{ fontSize: 11, whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{log.login_time}</td>
                <td>
                  <div style={{ fontSize: 12 }}>{log.user_name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>ID {log.user_id}</div>
                </td>
                <td style={{ fontSize: 12 }}>{log.role || '—'}</td>
                <td>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 500,
                    background: log.status === 'success' ? 'var(--success-bg, #d4edda)' : 'var(--error-bg, #f8d7da)',
                    color: log.status === 'success' ? 'var(--success, #155724)' : 'var(--error, #721c24)',
                  }}>
                    {log.status}
                  </span>
                </td>
                <td style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{log.ip_address || '—'}</td>
                <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{log.location || '—'}</td>
                <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{log.fail_reason || log.auth_event || '—'}</td>
                <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{log.logout_time || '—'}</td>
              </tr>
            ))}
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
