import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch.js'
import { fmtDateIST } from '../../../admin/components/AdminShared'

const STATUS_COLORS = {
  failed:  { bg: '#fde8ef', color: '#e01e5a', label: 'Failed'  },
  warning: { bg: '#fdf3d0', color: '#b8860b', label: 'Warning' },
}

function DetailField({ label, value, mono = false }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', background: 'var(--bg)', minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflowWrap: 'anywhere', fontFamily: mono ? 'monospace' : undefined }}>{value || '—'}</div>
    </div>
  )
}

export default function ExceptionLog() {
  const { token, user } = useAuth()

  const [rows,       setRows]       = useState([])
  const [filter,     setFilter]     = useState({ search: '', source: '', status: '', date_from: '', date_to: '' })
  const [page,       setPage]       = useState(1)
  const [pageSize,   setPageSize]   = useState(20)
  const [total,      setTotal]      = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [selected,   setSelected]   = useState(null)
  const [copiedId,   setCopiedId]   = useState('')

  const H = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])

  const summary = useMemo(() => {
    const failed = rows.filter(row => String(row.status || '').toLowerCase() === 'failed').length
    const warning = rows.filter(row => String(row.status || '').toLowerCase() === 'warning').length
    const api = rows.filter(row => row.source === 'API Exceptions').length
    return { failed, warning, api, client: rows.length - api }
  }, [rows])

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function load(overrides = {}) {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({
        ...filter,
        page:      overrides.page      ?? page,
        page_size: overrides.page_size ?? pageSize,
      })
      for (const [k, v] of [...params.entries()]) { if (!v) params.delete(k) }
      const res = await httpFetch(`/api/admin/observability/exceptions?${params}`, { headers: H })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load exception logs.')
      setRows(data.data || [])
      setTotal(data.total || 0)
      setTotalPages(data.total_pages || 1)
      setPage(data.page || (overrides.page ?? page))
      setPageSize(data.page_size || (overrides.page_size ?? pageSize))
    } catch (err) {
      setError(err.message || 'Failed to load exception logs.')
    } finally {
      setLoading(false)
    }
  }

  function handleFilterChange(patch) {
    setFilter(prev => ({ ...prev, ...patch }))
  }

  function handleRefine() {
    setPage(1)
    load({ page: 1 })
  }

  function handleReset() {
    const next = { search: '', source: '', status: '', date_from: '', date_to: '' }
    setFilter(next)
    setPage(1)
    loadWithFilter(next, { page: 1 })
  }

  async function loadWithFilter(nextFilter, overrides = {}) {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({
        ...nextFilter,
        page:      overrides.page      ?? page,
        page_size: overrides.page_size ?? pageSize,
      })
      for (const [k, v] of [...params.entries()]) { if (!v) params.delete(k) }
      const res = await httpFetch(`/api/admin/observability/exceptions?${params}`, { headers: H })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load exception logs.')
      setRows(data.data || [])
      setTotal(data.total || 0)
      setTotalPages(data.total_pages || 1)
      setPage(data.page || (overrides.page ?? page))
      setPageSize(data.page_size || (overrides.page_size ?? pageSize))
    } catch (err) {
      setError(err.message || 'Failed to load exception logs.')
    } finally {
      setLoading(false)
    }
  }

  function handlePageChange(p) {
    setPage(p)
    load({ page: p })
  }

  function handlePageSizeChange(ps) {
    setPageSize(ps)
    setPage(1)
    load({ page: 1, page_size: ps })
  }

  async function copyExceptionId(id) {
    if (!id) return
    try {
      await navigator.clipboard.writeText(id)
      setCopiedId(id)
      setTimeout(() => setCopiedId(''), 1200)
    } catch {
      setCopiedId('')
    }
  }

  const pages = []
  const start = Math.max(1, page - 2)
  const end   = Math.min(totalPages, page + 2)
  for (let i = start; i <= end; i++) pages.push(i)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ marginRight: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Exception Log</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>System failure stream with full request payload details. Viewing as {user?.role || 'user'}.</div>
          </div>

          <button
            onClick={() => load()}
            style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', fontSize: 12, cursor: 'pointer', color: 'var(--text-primary)' }}
          >
            Refresh
          </button>

          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
            {total} record{total !== 1 ? 's' : ''}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <input
            placeholder="Search exception ID, endpoint, message, request ID"
            value={filter.search}
            onChange={e => handleFilterChange({ search: e.target.value })}
            style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, minWidth: 280, color: 'var(--text-primary)', background: 'var(--surface)' }}
          />

          <select
            value={filter.source}
            onChange={e => handleFilterChange({ source: e.target.value })}
            style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text-primary)', background: 'var(--surface)', minWidth: 160 }}
          >
            <option value="">All Sources</option>
            <option value="API Exceptions">API Exceptions</option>
            <option value="Frontend Runtime">Frontend Runtime</option>
          </select>

          <select
            value={filter.status}
            onChange={e => handleFilterChange({ status: e.target.value })}
            style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text-primary)', background: 'var(--surface)' }}
          >
            <option value="">All Statuses</option>
            <option value="failed">Failed</option>
            <option value="warning">Warning</option>
          </select>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
            <span>From</span>
            <input
              type="date"
              value={filter.date_from}
              onChange={e => handleFilterChange({ date_from: e.target.value })}
              style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text-primary)', background: 'var(--surface)' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
            <span>To</span>
            <input
              type="date"
              value={filter.date_to}
              onChange={e => handleFilterChange({ date_to: e.target.value })}
              style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text-primary)', background: 'var(--surface)' }}
            />
          </div>

          <button
            onClick={handleRefine}
            style={{ padding: '6px 18px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Refine
          </button>

          <button
            onClick={handleReset}
            style={{ padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', fontSize: 13, cursor: 'pointer', color: 'var(--text-primary)' }}
          >
            Reset
          </button>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
            { label: 'On Page Failed', value: summary.failed },
            { label: 'On Page Warning', value: summary.warning },
            { label: 'API Exceptions', value: summary.api },
            { label: 'Frontend Runtime', value: summary.client },
          ].map(card => (
            <div key={card.label} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', background: 'var(--bg)', minWidth: 140 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{card.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{card.value ?? 0}</div>
            </div>
          ))}
        </div>

        {error && (
          <div style={{ padding: '10px 12px', background: '#fee2e2', color: '#b91c1c', borderRadius: 8, fontSize: 13 }}>
            {error}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-muted)', fontSize: 14 }}>Loading...</div>
        ) : rows.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-muted)', gap: 8 }}>
            <div style={{ fontSize: 28 }}>No exception logs found.</div>
            <div style={{ fontSize: 12 }}>Try clearing filters or checking a wider date range.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1180 }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                {['Exception ID', 'Source', 'Status', 'HTTP', 'Method', 'Route', 'Description', 'Date', 'Details'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const sc = STATUS_COLORS[row.status] || STATUS_COLORS.warning
                return (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--bg)' }}>
                    <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                      <span>{row.exception_id || '—'}</span>
                      {row.exception_id && (
                        <button
                          onClick={() => copyExceptionId(row.exception_id)}
                          style={{ marginLeft: 8, padding: '2px 8px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', fontSize: 11, cursor: 'pointer', color: 'var(--text-secondary)' }}
                        >
                          {copiedId === row.exception_id ? 'Copied' : 'Copy'}
                        </button>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{row.source || '—'}</td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <span style={{ background: sc.bg, color: sc.color, padding: '2px 10px', borderRadius: 12, fontWeight: 600, fontSize: 11 }}>
                        {sc.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{row.status_code ?? '—'}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{row.method || '—'}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontFamily: 'monospace', maxWidth: 260, overflowWrap: 'anywhere' }}>{row.route || '—'}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-primary)', maxWidth: 420, overflowWrap: 'anywhere' }}>{row.description || '—'}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDateIST(row.created_at)}</td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <button
                        onClick={() => setSelected(row)}
                        style={{ padding: '3px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer' }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {!loading && total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 4 }}>Rows per page:</span>
          {[10, 20, 50].map(ps => (
            <button key={ps} onClick={() => handlePageSizeChange(ps)}
              style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: 'pointer', background: pageSize === ps ? 'var(--primary)' : 'var(--surface)', color: pageSize === ps ? '#fff' : 'var(--text-primary)', fontWeight: pageSize === ps ? 700 : 400 }}>
              {ps}
            </button>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => handlePageChange(1)} disabled={page === 1}
              style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? 0.4 : 1, background: 'var(--surface)' }}>«</button>
            <button onClick={() => handlePageChange(page - 1)} disabled={page === 1}
              style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? 0.4 : 1, background: 'var(--surface)' }}>‹</button>
            {pages.map(p => (
              <button key={p} onClick={() => handlePageChange(p)}
                style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: 'pointer', background: p === page ? 'var(--primary)' : 'var(--surface)', color: p === page ? '#fff' : 'var(--text-primary)', fontWeight: p === page ? 700 : 400 }}>
                {p}
              </button>
            ))}
            <button onClick={() => handlePageChange(page + 1)} disabled={page === totalPages}
              style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: page === totalPages ? 'default' : 'pointer', opacity: page === totalPages ? 0.4 : 1, background: 'var(--surface)' }}>›</button>
            <button onClick={() => handlePageChange(totalPages)} disabled={page === totalPages}
              style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: page === totalPages ? 'default' : 'pointer', opacity: page === totalPages ? 0.4 : 1, background: 'var(--surface)' }}>»</button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>Page {page} of {totalPages}</span>
          </div>
        </div>
      )}

      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 1500, background: 'rgba(15,23,42,.24)', display: 'flex', justifyContent: 'flex-end' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: 'min(720px, 100%)', height: '100%', overflow: 'auto', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-14px 0 30px rgba(15,23,42,.22)', padding: 18 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Exception Details</div>
                <h2 style={{ margin: 0, fontSize: 18, color: 'var(--text-primary)' }}>{selected.description || 'Captured failure'}</h2>
              </div>
              <button
                onClick={() => setSelected(null)}
                style={{ padding: '5px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text-primary)', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, margin: '14px 0', padding: '10px 12px', border: '1px dashed #bfdbfe', borderRadius: 10, background: '#eff6ff', color: '#1e3a8a' }}>
              <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{selected.exception_id || '—'}</span>
              {selected.exception_id && (
                <button
                  onClick={() => copyExceptionId(selected.exception_id)}
                  style={{ padding: '3px 10px', border: '1px solid #bfdbfe', borderRadius: 14, background: '#fff', color: '#1d4ed8', fontSize: 12, cursor: 'pointer' }}
                >
                  {copiedId === selected.exception_id ? 'Copied' : 'Copy ID'}
                </button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <DetailField label="Source" value={selected.source} />
              <DetailField label="Status" value={selected.status} />
              <DetailField label="HTTP Code" value={selected.status_code ?? '—'} />
              <DetailField label="Method" value={selected.method} />
              <DetailField label="Route" value={selected.route} mono />
              <DetailField label="Request ID" value={selected.request_id} mono />
              <DetailField label="Created" value={fmtDateIST(selected.created_at)} />
              <DetailField label="Record ID" value={selected.id} mono />
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Description</div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', padding: 12, color: 'var(--text-primary)', fontSize: 13 }}>
                {selected.description || 'No description captured.'}
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Full Payload</div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', padding: 12, color: 'var(--text-primary)', fontSize: 12, lineHeight: 1.45 }}>
                {JSON.stringify(selected.details || {}, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
