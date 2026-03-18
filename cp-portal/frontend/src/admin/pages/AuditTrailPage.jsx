import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'

const ENTITY_OPTIONS = [
  'All', 'branding', 'feature', 'news', 'safety_alert', 'document',
  'compliance', 'chatbox', 'gate', 'msl', 'integration', 'portal_user', 'client',
]

const ACTION_OPTIONS = ['All', 'CREATE', 'UPDATE', 'DELETE', 'ENABLE', 'DISABLE', 'UPLOAD']

const ACTION_BADGE_STYLES = {
  CREATE:  { background: '#dcfce7', color: '#166534' },
  UPDATE:  { background: '#dbeafe', color: '#1e40af' },
  DELETE:  { background: '#fee2e2', color: '#991b1b' },
  ENABLE:  { background: '#dcfce7', color: '#166534' },
  DISABLE: { background: '#ffedd5', color: '#9a3412' },
  UPLOAD:  { background: '#f3e8ff', color: '#6b21a8' },
}

const LIMIT = 50

function formatDetails(detailsRaw) {
  if (!detailsRaw) return '—'
  try {
    const obj = typeof detailsRaw === 'string' ? JSON.parse(detailsRaw) : detailsRaw
    if (typeof obj !== 'object' || obj === null) return String(detailsRaw)
    return Object.entries(obj)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(', ')
  } catch {
    return String(detailsRaw)
  }
}

export default function AuditTrailPage() {
  const { clientId } = useParams()

  const [records, setRecords]   = useState([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

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

      const res = await fetch(`/api/admin/audit/${clientId}?${params.toString()}`, {
        headers: adminHeaders(),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = await res.json()
      setRecords(d.records || [])
      setTotal(d.total || 0)
    } catch (err) {
      setError('Failed to load audit records.')
      setRecords([])
      setTotal(0)
    }
    setLoading(false)
  }, [clientId, page, filterEntity, filterAction, filterFrom, filterTo])

  useEffect(() => { loadRecords() }, [loadRecords])

  function handleApplyFilters() {
    setPage(1)
    loadRecords()
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

      {/* Filters */}
      <div className="cp-card">
        <div className="cp-card-title">Filters</div>
        <div className="cp-field-row" style={{ flexWrap: 'wrap', gap: 12 }}>

          <div className="cp-field" style={{ minWidth: 160 }}>
            <label>Entity</label>
            <select value={filterEntity} onChange={e => setFilterEntity(e.target.value)}>
              {ENTITY_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>

          <div className="cp-field" style={{ minWidth: 160 }}>
            <label>Action</label>
            <select value={filterAction} onChange={e => setFilterAction(e.target.value)}>
              {ACTION_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div className="cp-field" style={{ minWidth: 160 }}>
            <label>From Date</label>
            <input
              type="date"
              value={filterFrom}
              onChange={e => setFilterFrom(e.target.value)}
            />
          </div>

          <div className="cp-field" style={{ minWidth: 160 }}>
            <label>To Date</label>
            <input
              type="date"
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
      <div className="cp-card" style={{ marginTop: 24 }}>
        <div className="cp-card-title">Audit Records</div>

        {error && <div className="cp-error">{error}</div>}

        {loading ? (
          <div className="cp-loading">Loading…</div>
        ) : records.length === 0 ? (
          <p className="cp-page-desc">No audit records yet.</p>
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
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: '0.04em',
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
