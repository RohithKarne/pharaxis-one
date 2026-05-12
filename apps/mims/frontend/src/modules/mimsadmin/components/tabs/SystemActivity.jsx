import { useState, useEffect } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch.js'
import { fmtDateIST } from '../../../admin/components/AdminShared'

const STATUS_COLORS = {
  success: { bg: '#e6f4ee', color: '#007a5a', label: 'Success' },
  failed:  { bg: '#fde8ef', color: '#e01e5a', label: 'Failed'  },
  warning: { bg: '#fdf3d0', color: '#b8860b', label: 'Warning' },
}

export default function SystemActivity() {
  const { token } = useAuth()

  const [rows,       setRows]       = useState([])
  const [summary,    setSummary]    = useState({ total: 0, success: 0, failed: 0, warning: 0 })
  const [filter,     setFilter]     = useState({ task: 'Email Import', status: '', date_from: '' })
  const [page,       setPage]       = useState(1)
  const [pageSize,   setPageSize]   = useState(20)
  const [total,      setTotal]      = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading,    setLoading]    = useState(false)

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
      const d = await httpFetch(`/api/admin/system-activity?${params}`, { headers: H }).then(r => r.json())
      setRows(d.data || [])
      setSummary(d.summary || { total: 0, success: 0, failed: 0, warning: 0 })
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

      {/* Header + Filters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => load()}
            style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', fontSize: 12, cursor: 'pointer', color: 'var(--text-primary)' }}
          >
            ⟳ Refresh
          </button>

          <select
            value={filter.task}
            onChange={e => handleFilterChange({ task: e.target.value })}
            style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text-primary)', background: 'var(--surface)', minWidth: 160 }}
          >
            <option value="Email Import">Email Import</option>
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

        {/* Summary cards */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
            { label: 'Total',   value: summary.total },
            { label: 'Success', value: summary.success },
            { label: 'Failed',  value: summary.failed },
            { label: 'Warning', value: summary.warning },
          ].map(card => (
            <div key={card.label} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', background: 'var(--bg)', minWidth: 120 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{card.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{card.value ?? 0}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-muted)', fontSize: 14 }}>
            Loading...
          </div>
        ) : rows.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-muted)', gap: 8 }}>
            <div style={{ fontSize: 28 }}>🧾</div>
            <div style={{ fontSize: 14 }}>No system activity entries yet.</div>
            <div style={{ fontSize: 12 }}>Email import runs will appear here once the service runs.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                {[
                  'Task Name', 'Status', 'Start Date', 'End Date',
                  'Total Count', 'Error Count', 'Warning Count', 'Current Count',
                  'Last Activity Date', 'Last Poll Date'
                ].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
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
                    <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{row.task_name || 'Email Import'}</td>
                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                      <span style={{ background: sc.bg, color: sc.color, padding: '2px 10px', borderRadius: 12, fontWeight: 600, fontSize: 11 }}>
                        {sc.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDateIST(row.start_at)}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDateIST(row.end_at)}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{row.total_count ?? '—'}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{row.error_count ?? '—'}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{row.warning_count ?? '—'}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{row.current_count ?? '—'}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDateIST(row.last_activity_at)}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDateIST(row.last_poll_at)}</td>
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
