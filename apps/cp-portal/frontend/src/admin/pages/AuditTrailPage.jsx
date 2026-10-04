import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'

// The filter drop-downs list what the server has actually recorded for this
// scope (sent with every page), so nothing recorded is impossible to filter for.

const ACTION_BADGE_STYLES = {
  CREATE:  { background: '#dcfce7', color: '#166534' },
  UPDATE:  { background: '#dbeafe', color: '#1e40af' },
  DELETE:  { background: '#fee2e2', color: '#991b1b' },
  ENABLE:  { background: '#dcfce7', color: '#166534' },
  DISABLE: { background: '#ffedd5', color: '#9a3412' },
  UPLOAD:  { background: '#f3e8ff', color: '#6b21a8' },
}

const LIMIT = 50

// CPPM-43: an edit records { changes: { field: { from, to } } }. Shown as
// "status: Recruiting → Active, not recruiting"; long values are shortened here
// and kept in full in the View panel and the export.
function shortValue(v) {
  if (v === null || v === undefined || v === '') return '(empty)'
  const s = String(v)
  return s.length > 60 ? s.slice(0, 57) + '…' : s
}

function formatChanges(changes) {
  const parts = Object.entries(changes).map(([field, c]) =>
    c && c.changed ? `${field}: changed` : `${field}: ${shortValue(c?.from)} → ${shortValue(c?.to)}`)
  return parts.length ? parts.join('; ') : 'no changes'
}

function formatDetails(detailsRaw) {
  if (!detailsRaw) return '—'
  try {
    const obj = typeof detailsRaw === 'string' ? JSON.parse(detailsRaw) : detailsRaw
    if (typeof obj !== 'object' || obj === null) return String(detailsRaw)
    return Object.entries(obj)
      .map(([k, v]) => k === 'changes' && v && typeof v === 'object'
        ? formatChanges(v)
        : `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(', ')
  } catch {
    return String(detailsRaw)
  }
}

export default function AuditTrailPage() {
  const { clientId } = useParams()
  // CPPM-62: with no client in the address this is the platform audit trail —
  // records that belong to no client, for the platform admin only.
  const scope = clientId || 'platform'

  const [records, setRecords]   = useState([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [detailRecord, setDetailRecord] = useState(null)
  const [options, setOptions]   = useState({ entities: [], actions: [] })
  const [exporting, setExporting] = useState(false)

  const [filterEntity, setFilterEntity] = useState('All')
  const [filterAction, setFilterAction] = useState('All')
  const [filterFrom,   setFilterFrom]   = useState('')
  const [filterTo,     setFilterTo]     = useState('')

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  const loadRecords = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page, limit: LIMIT })
      if (filterEntity !== 'All') params.set('entity', filterEntity)
      if (filterAction !== 'All') params.set('action', filterAction)
      if (filterFrom)             params.set('from',   filterFrom)
      if (filterTo)               params.set('to',     filterTo)

      const res = await fetch(`/api/admin/audit/${scope}?${params.toString()}`, {
        headers: adminHeaders(),
      })
      if (res.status === 403) { setError('Only the platform admin can see this audit trail.'); setRecords([]); setTotal(0); setLoading(false); return }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = await res.json()
      setRecords(d.records || [])
      setTotal(d.total || 0)
      if (d.filters) setOptions(d.filters)
    } catch (err) {
      setError('Failed to load audit records.')
      setRecords([])
      setTotal(0)
    }
    setLoading(false)
  }, [scope, page, filterEntity, filterAction, filterFrom, filterTo])

  useEffect(() => { loadRecords() }, [loadRecords])

  // CP walk, 4 Oct 2026: the export carried only the page on screen (50 rows at
  // most) under the name "GxP Audit Package". It now fetches every page that
  // matches the filters and writes them all, newest first, the same order as the screen.
  async function exportCsv() {
    setExporting(true)
    try {
      const all = []
      for (let pg = 1; ; pg++) {
        const params = new URLSearchParams({ page: pg, limit: 100 })
        if (filterEntity !== 'All') params.set('entity', filterEntity)
        if (filterAction !== 'All') params.set('action', filterAction)
        if (filterFrom)             params.set('from',   filterFrom)
        if (filterTo)               params.set('to',     filterTo)
        const res = await fetch(`/api/admin/audit/${scope}?${params.toString()}`, { headers: adminHeaders() })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const d = await res.json()
        all.push(...(d.records || []))
        if (pg >= (d.pages || 1)) break
      }
      const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`
      const csvHeader = 'Timestamp,Admin,Action,Entity,EntityID,Details\n'
      const csvRows = all.map(r => [r.created_at, r.admin_email || r.admin_name || '', r.action, r.entity, r.entity_id ?? '', r.details || ''].map(cell).join(',')).join('\n')
      const blob = new Blob([csvHeader + csvRows], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gxp_audit_package_${scope}_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('The export could not be completed. Nothing was downloaded.')
    } finally {
      setExporting(false)
    }
  }

  function handleApplyFilters() {
    setPage(1)
  }

  function handleClearFilters() {
    setFilterEntity('All')
    setFilterAction('All')
    setFilterFrom('')
    setFilterTo('')
    setPage(1)
  }

  // Re-fetch when filters are cleared (state update is async, so use a reset flag)
  useEffect(() => {
    if (filterEntity === 'All' && filterAction === 'All' && filterFrom === '' && filterTo === '') {
      loadRecords()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterEntity, filterAction, filterFrom, filterTo])

  return (
    <AdminLayout title="Audit Trail">

      {detailRecord && (
        <div className="cp-modal-overlay" onClick={() => setDetailRecord(null)}>
          <div className="cp-modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <div className="cp-modal-header">
              <span>Audit Detail</span>
              <button className="cp-modal-close" onClick={() => setDetailRecord(null)}>✕</button>
            </div>
            <div className="cp-modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: 16 }}>
                <div><span style={{ fontWeight: 600, fontSize: 12, color: '#475569' }}>Entity</span><div>{detailRecord.entity || '—'}</div></div>
                <div><span style={{ fontWeight: 600, fontSize: 12, color: '#475569' }}>Action</span><div>{detailRecord.action || '—'}</div></div>
                <div><span style={{ fontWeight: 600, fontSize: 12, color: '#475569' }}>Entity ID</span><div style={{ fontFamily: 'monospace' }}>{detailRecord.entity_id != null ? detailRecord.entity_id : '—'}</div></div>
                <div><span style={{ fontWeight: 600, fontSize: 12, color: '#475569' }}>Performed by</span><div>{detailRecord.admin_name || detailRecord.admin_email || '—'}</div></div>
                <div style={{ gridColumn: '1 / -1' }}><span style={{ fontWeight: 600, fontSize: 12, color: '#475569' }}>Timestamp</span><div>{detailRecord.created_at ? new Date(detailRecord.created_at).toLocaleString() : '—'}</div></div>
              </div>
              <div style={{ fontWeight: 600, fontSize: 12, color: '#475569', marginBottom: 6 }}>Details</div>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: '#F8FAFC', padding: 12, borderRadius: 6, border: '1px solid #E2E8F0', maxHeight: 400, overflowY: 'auto' }}>
                {detailRecord.details ? (() => { try { return JSON.stringify(typeof detailRecord.details === 'string' ? JSON.parse(detailRecord.details) : detailRecord.details, null, 2) } catch { return String(detailRecord.details) } })() : '—'}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="cp-card">
        <div className="cp-card-title">Filter Audit Records</div>
        <div className="cp-field-row" style={{ flexWrap: 'wrap', gap: 12 }}>

          <div className="cp-field" style={{ minWidth: 160 }}>
            <label>Entity</label>
            <select aria-label="Entity" value={filterEntity} onChange={e => setFilterEntity(e.target.value)}>
              {['All', ...options.entities].map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>

          <div className="cp-field" style={{ minWidth: 160 }}>
            <label>Action</label>
            <select aria-label="Action" value={filterAction} onChange={e => setFilterAction(e.target.value)}>
              {['All', ...options.actions].map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div className="cp-field" style={{ minWidth: 160 }}>
            <label>From Date</label>
            <input
              type="date"
              aria-label="From date"
              value={filterFrom}
              onChange={e => setFilterFrom(e.target.value)}
            />
          </div>

          <div className="cp-field" style={{ minWidth: 160 }}>
            <label>To Date</label>
            <input
              type="date"
              aria-label="To date"
              value={filterTo}
              onChange={e => setFilterTo(e.target.value)}
            />
          </div>

        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="cp-btn cp-btn-primary" onClick={handleApplyFilters}>
            Apply Filters
          </button>
          <button className="cp-btn cp-btn-outline" onClick={handleClearFilters}>
            Clear Filters
          </button>
        </div>
      </div>

      {/* Audit Table */}
      <div className="cp-card cp-table-card" style={{ marginTop: 24, padding: 0 }}>
        <div className="cp-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px' }}>
          <span>Audit Records ({total})</span>
          <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={exportCsv} disabled={exporting || total === 0}>
            {exporting ? 'Exporting…' : `Export GxP Audit Package (CSV, ${total} records)`}
          </button>
        </div>

        {error && <div className="cp-error">{error}</div>}

        {loading ? (
          <div className="cp-loading">Loading…</div>
        ) : records.length === 0 ? (
          <p className="cp-page-desc cp-empty-text">No audit records yet.</p>
        ) : (
          <>
            <table className="cp-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Admin</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Entity ID</th>
                  <th>Details</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                    </td>
                    <td>{r.admin_email || r.admin_name || '—'}</td>
                    <td>
                      {r.action ? (
                        <span className="cp-status-badge" style={{
                          ...(ACTION_BADGE_STYLES[r.action] || { background: '#f1f5f9', color: '#475569' }),
                        }}>
                          {r.action}
                        </span>
                      ) : '—'}
                    </td>
                    <td>{r.entity || '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                      {r.entity_id != null ? r.entity_id : '—'}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--cp-text-muted)', maxWidth: 320, wordBreak: 'break-word' }}>
                      {formatDetails(r.details)}
                    </td>
                    <td>
                      <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => setDetailRecord(r)}>View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
                <button
                  className="cp-btn cp-btn-sm cp-btn-outline"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  Previous
                </button>
                <span style={{ fontSize: 12, color: 'var(--cp-text-muted)' }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  className="cp-btn cp-btn-sm cp-btn-outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

    </AdminLayout>
  )
}
