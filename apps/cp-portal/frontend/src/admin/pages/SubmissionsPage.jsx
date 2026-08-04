import { useState, useEffect, Fragment } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'

const TYPE_LABELS = {
  medical_inquiry:   'Medical Inquiry',
  adverse_event:     'Adverse Event',
  product_complaint: 'Product Complaint',
  other_inquiry:     'Other Inquiry',
}

const STATUS_COLORS = {
  submitted:     { background: '#DBEAFE', color: '#1E40AF' },
  pending_sync:  { background: '#FFEDD5', color: '#9A3412' },
  synced:        { background: '#DCFCE7', color: '#16A34A' },
  failed_sync:   { background: '#FEE2E2', color: '#991B1B' },
  closed:        { background: '#F3F4F6', color: '#6B7280' },
}

const STATUS_LABELS = {
  submitted: 'New submission',
  pending_sync: 'Sync pending',
  synced: 'Synced',
  failed_sync: 'Sync failed',
  closed: 'Closed',
}

export default function SubmissionsPage() {
  const { clientId }            = useParams()
  const [submissions, setSubmissions] = useState([])
  const [counts, setCounts]     = useState([])
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(true)
  const [typeFilter, setTypeFilter]   = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch]     = useState('')
  const [expanded, setExpanded] = useState(null)
  const [msg, setMsg]           = useState(null)  // { type, text }
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')

  useEffect(() => { load() }, [clientId, typeFilter, statusFilter, search])

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (typeFilter)   params.set('type', typeFilter)
      if (statusFilter) params.set('status', statusFilter)
      if (search)       params.set('search', search)
      const res = await fetch(`/api/admin/submissions/${clientId}?${params}`, { headers: adminHeaders() })
      if (!res.ok) throw new Error('Failed to load submissions.')
      const d   = await res.json()
      setSubmissions(d.submissions || [])
      setCounts(d.counts || [])
      setTotal(d.total || 0)
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    }
    setLoading(false)
  }

  async function updateStatus(id, status) {
    try {
      const res = await fetch(`/api/admin/submissions/${clientId}/${id}`, {
        method: 'PATCH',
        headers: adminHeaders(),
        body: JSON.stringify({ status }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Status update failed.') }
      load()
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    }
  }

  // O2: admin-triggered re-sync of a failed submission.
  async function retrySync(id) {
    try {
      const res = await fetch(`/api/admin/submissions/${clientId}/${id}/retry`, { method: 'POST', headers: adminHeaders() })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Retry failed.')
      setMsg(d.status === 'synced'
        ? { type: 'success', text: `Synced (MIMS #${d.external_ref}).` }
        : { type: 'error', text: `Still failed: ${d.error || 'unknown'}` })
      load()
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    }
  }

  function parseFormData(raw) {
    try { return JSON.parse(raw) } catch { return {} }
  }

  // Server-side export of the FULL filtered dataset (respects date range), CSV or PDF.
  async function exportServer(format) {
    const params = new URLSearchParams()
    if (typeFilter)   params.set('type', typeFilter)
    if (statusFilter) params.set('status', statusFilter)
    if (search)       params.set('search', search)
    if (dateFrom)     params.set('from', dateFrom)
    if (dateTo)       params.set('to', dateTo)
    params.set('format', format)
    try {
      const res = await fetch(`/api/admin/submissions/${clientId}/export?${params}`, { headers: adminHeaders() })
      if (!res.ok) throw new Error('Export failed.')
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `submissions-${clientId}-${new Date().toISOString().slice(0, 10)}.${format}`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    }
  }

  function exportCsv() {
    const esc = v => {
      const s = v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v))
      return `"${s.replace(/"/g, '""')}"`
    }
    const header = ['ID', 'Date', 'Type', 'Submitter', 'Email', 'User Type', 'Status', 'Ref', 'Form Data']
    const rows = submissions.map(s => [
      s.id,
      s.submitted_at || '',
      TYPE_LABELS[s.submission_type] || s.submission_type,
      s.submitter_name || (s.first_name ? `${s.first_name} ${s.last_name}` : ''),
      s.submitter_email || s.user_email || '',
      s.submitter_type || '',
      s.status,
      s.external_ref || '',
      s.form_data || '',
    ].map(esc).join(','))
    const csv = [header.map(esc).join(','), ...rows].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `submissions-client-${clientId}-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (loading) return <AdminLayout title="Submissions"><div className="cp-loading">Loading…</div></AdminLayout>

  return (
    <AdminLayout title="Submissions">

      {/* Summary stats */}
      <div className="cp-stats-row" style={{ marginBottom: 20 }}>
        <div className="cp-stat-card">
          <div className="cp-stat-value">{total}</div>
          <div className="cp-stat-label">Total Submissions</div>
        </div>
        {counts.map(c => (
          <div key={c.submission_type} className="cp-stat-card">
            <div className="cp-stat-value">{c.count}</div>
            <div className="cp-stat-label">{TYPE_LABELS[c.submission_type] || c.submission_type}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="cp-table-toolbar">
        <select
          className="cp-select"
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
        >
          <option value="">All Types</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select
          className="cp-select"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="">All Statuses</option>
          {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, email, ref…"
          className="cp-search-input"
        />
        <label className="cp-date-filter">From
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          />
        </label>
        <label className="cp-date-filter">To
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          />
        </label>
        {(typeFilter || statusFilter || search || dateFrom || dateTo) && (
          <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => { setTypeFilter(''); setStatusFilter(''); setSearch(''); setDateFrom(''); setDateTo('') }}>
            Clear
          </button>
        )}
        <div className="cp-table-actions">
          <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={exportCsv} disabled={submissions.length === 0} title="Export the loaded view to CSV">
            CSV View
          </button>
          <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => exportServer('csv')} title="Export the full filtered dataset to CSV">
            CSV All
          </button>
          <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => exportServer('pdf')} title="Export a PDF audit report of the full filtered dataset">
            PDF
          </button>
        </div>
      </div>

      {msg && (
        <div className={msg.type === 'error' ? 'cp-error' : 'cp-success'} onClick={() => setMsg(null)} style={{ cursor: 'pointer', marginBottom: 12 }}>
          {msg.text}
        </div>
      )}

      {submissions.length === 0 ? (
        <div className="cp-empty"><p>No submissions found.</p></div>
      ) : (
        <div className="cp-card cp-table-card" style={{ padding: 0 }}>
          <table className="cp-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Submitter</th>
                <th>Email</th>
                <th>User Type</th>
                <th>Status</th>
                <th>Ref</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {submissions.map(s => (
                <Fragment key={s.id}>
                  <tr style={{ cursor: 'pointer' }} onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{s.submitted_at ? s.submitted_at.slice(0, 16).replace('T', ' ') : '—'}</td>
                    <td>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{TYPE_LABELS[s.submission_type] || s.submission_type}</span>
                      {/* PD-2: the submitter reported that someone became unwell.
                          Shown here as well as in the Safety Queue so it is visible
                          in the list an admin already works from. The type itself is
                          never changed by the flag — that is a clinical decision. */}
                      {s.ae_task_status && (
                        <span
                          title={s.ae_task_status === 'open'
                            ? 'Reported harm — awaiting safety review'
                            : 'Reported harm — safety review closed'}
                          style={{
                            marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '1px 6px',
                            borderRadius: 10, whiteSpace: 'nowrap',
                            background: s.ae_task_status === 'open' ? '#FEE2E2' : '#F1F5F9',
                            color:      s.ae_task_status === 'open' ? '#B91C1C' : '#475569',
                          }}
                        >
                          {s.ae_task_status === 'open' ? '⚠ SAFETY REVIEW' : '✓ REVIEWED'}
                        </span>
                      )}
                    </td>
                    <td>{s.submitter_name || (s.first_name ? `${s.first_name} ${s.last_name}` : '—')}</td>
                    <td style={{ fontSize: 12 }}>{s.submitter_email || s.user_email || '—'}</td>
                    <td style={{ fontSize: 12 }}>{s.submitter_type || '—'}</td>
                    <td>
                      <span className="cp-status-badge" style={STATUS_COLORS[s.status] || {}}>
                        {STATUS_LABELS[s.status] || s.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      <div style={{ fontWeight: 500 }}>{s.reference || `CP-${String(s.id).padStart(6, '0')}`}</div>
                      {s.external_ref ? (
                        s.mims_case_url ? (
                          <a href={s.mims_case_url} target="_blank" rel="noopener noreferrer"
                             onClick={e => e.stopPropagation()}
                             style={{ color: '#2563EB', textDecoration: 'none' }}>MIMS #{s.external_ref} ↗</a>
                        ) : (
                          <span style={{ color: '#6B7280' }}>MIMS #{s.external_ref}</span>
                        )
                      ) : null}
                    </td>
                    <td>
                      <select
                        value={s.status}
                        onClick={e => e.stopPropagation()}
                        onChange={e => updateStatus(s.id, e.target.value)}
                        style={{ fontSize: 12, padding: '2px 6px', border: '1px solid var(--cp-border)', borderRadius: 4 }}
                      >
                        {Object.keys(STATUS_COLORS).map(st => <option key={st} value={st}>{st}</option>)}
                      </select>
                      {s.status === 'failed_sync' && (
                        <button onClick={e => { e.stopPropagation(); retrySync(s.id) }}
                          style={{ marginLeft: 6, fontSize: 11, padding: '2px 8px', border: '1px solid var(--cp-border)', borderRadius: 4, cursor: 'pointer', background: 'transparent' }}>
                          ↻ Retry
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded === s.id && (
                    <tr key={`${s.id}-detail`}>
                      <td colSpan={8} style={{ background: '#F9FAFB', padding: '12px 16px' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#374151' }}>Form Data</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
                          {Object.entries(parseFormData(s.form_data)).map(([k, v]) => (
                            <div key={k}>
                              <div style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k}</div>
                              <div style={{ fontSize: 13, color: '#111827', wordBreak: 'break-word' }}>{String(v) || '—'}</div>
                            </div>
                          ))}
                        </div>
                        {s.attachments && s.attachments.length > 0 && (
                          <>
                            <div style={{ fontSize: 12, fontWeight: 600, margin: '14px 0 8px', color: '#374151' }}>Attachments ({s.attachments.length})</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {s.attachments.map(a => (
                                <a key={a.id} href={`/api/admin/submissions/${clientId}/attachments/${a.id}`} target="_blank" rel="noopener noreferrer"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#2563EB', textDecoration: 'none' }}>
                                  ⬇ {a.file_name} <span style={{ color: '#9CA3AF', fontSize: 11 }}>({Math.round((a.file_size || 0) / 1024)} KB)</span>
                                </a>
                              ))}
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8 }}>Showing {submissions.length} of {total} submissions (max 200)</div>
    </AdminLayout>
  )
}
