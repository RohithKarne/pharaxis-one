import { useState, useEffect } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch.js'
import { fmtDateIST } from '../../../admin/components/AdminShared'

const STATUS_COLORS = {
  success: { bg: '#e6f4ee', color: '#007a5a', label: 'Success' },
  failed:  { bg: '#fde8ef', color: '#e01e5a', label: 'Failed'  },
  warning: { bg: '#fdf3d0', color: '#b8860b', label: 'Warning' },
}

export default function ServiceLog() {
  const { token } = useAuth()

  const [logs,        setLogs]        = useState([])
  const [sources,     setSources]     = useState([])
  const [filter,      setFilter]      = useState({ source: '', status: '', date_from: '', date_to: '' })
  const [page,        setPage]        = useState(1)
  const [pageSize,    setPageSize]    = useState(20)
  const [total,       setTotal]       = useState(0)
  const [totalPages,  setTotalPages]  = useState(1)
  const [loading,     setLoading]     = useState(false)

  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  useEffect(() => { load() }, [])

  async function load(overrides = {}) {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        ...filter,
        page:      overrides.page      ?? page,
        page_size: overrides.page_size ?? pageSize,
      })
      for (const [k, v] of [...params.entries()]) { if (!v) params.delete(k) }
      const d = await httpFetch(`/api/admin/service-logs?${params}`, { headers: H }).then(r => r.json())
      setLogs(d.data || [])
      setSources(d.sources || [])
      setTotal(d.total || 0)
      setTotalPages(d.total_pages || 1)
    } catch {
      /* silent — table may not exist on fresh DB */
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

  function handlePageChange(p) {
    setPage(p)
    load({ page: p })
  }

  function handlePageSizeChange(ps) {
    setPageSize(ps)
    setPage(1)
    load({ page: 1, page_size: ps })
  }

  const pages = []
  const start = Math.max(1, page - 2)
  const end   = Math.min(totalPages, page + 2)
  for (let i = start; i <= end; i++) pages.push(i)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', background: 'var(--surface)' }}>
        <select
          value={filter.source}
          onChange={e => handleFilterChange({ source: e.target.value })}
          style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text-primary)', background: 'var(--surface)', minWidth: 160 }}
        >
          <option value="">All Sources</option>
          {sources.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          value={filter.status}
          onChange={e => handleFilterChange({ status: e.target.value })}
          style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text-primary)', background: 'var(--surface)' }}
        >
          <option value="">All Statuses</option>
          <option value="success">Success</option>
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

        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
          {total} record{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-muted)', fontSize: 14 }}>
            Loading...
          </div>
        ) : logs.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-muted)', gap: 8 }}>
            <div style={{ fontSize: 28 }}>📋</div>
            <div style={{ fontSize: 14 }}>No service log entries yet.</div>
            <div style={{ fontSize: 12 }}>Entries will appear here once services run.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                {['Source', 'Service Type', 'Description', 'Status', 'Date'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((row, i) => {
                const sc = STATUS_COLORS[row.status] || STATUS_COLORS.warning
                return (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--bg)' }}>
                    <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{row.source}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{row.service_type}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-primary)', maxWidth: 420 }}>{row.description}</td>
                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                      <span style={{ background: sc.bg, color: sc.color, padding: '2px 10px', borderRadius: 12, fontWeight: 600, fontSize: 11 }}>
                        {sc.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDateIST(row.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
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
    </div>
  )
}
