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

  useEffect(() => { load() }, [clientId, typeFilter, statusFilter, search])

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (typeFilter)   params.set('type', typeFilter)
      if (statusFilter) params.set('status', statusFilter)
      if (search)       params.set('search', search)
      const res = await fetch(`/api/admin/submissions/${clientId}?${params}`, { headers: adminHeaders() })
      const d   = await res.json()
      setSubmissions(d.submissions || [])
      setCounts(d.counts || [])
      setTotal(d.total || 0)
    } catch { /* ignore */ }
    setLoading(false)
  }

  async function updateStatus(id, status) {
    await fetch(`/api/admin/submissions/${clientId}/${id}`, {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify({ status }),
    })
    load()
  }

  function parseFormData(raw) {
    try { return JSON.parse(raw) } catch { return {} }
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
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          className="cp-select"
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid var(--cp-border)', borderRadius: 4, fontSize: 13 }}
        >
          <option value="">All Types</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select
          className="cp-select"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid var(--cp-border)', borderRadius: 4, fontSize: 13 }}
        >
          <option value="">All Statuses</option>
          {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, email, ref…"
          style={{ padding: '6px 10px', border: '1px solid var(--cp-border)', borderRadius: 4, fontSize: 13, minWidth: 220 }}
        />
        {(typeFilter || statusFilter || search) && (
          <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => { setTypeFilter(''); setStatusFilter(''); setSearch('') }}>
            Clear
          </button>
        )}
      </div>

      {submissions.length === 0 ? (
        <div className="cp-empty"><p>No submissions found.</p></div>
      ) : (
        <div className="cp-card" style={{ padding: 0 }}>
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
                    </td>
                    <td>{s.submitter_name || (s.first_name ? `${s.first_name} ${s.last_name}` : '—')}</td>
                    <td style={{ fontSize: 12 }}>{s.submitter_email || s.user_email || '—'}</td>
                    <td style={{ fontSize: 12 }}>{s.submitter_type || '—'}</td>
                    <td>
                      <span style={{ ...(STATUS_COLORS[s.status] || {}), padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                        {s.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{s.external_ref || '—'}</td>
                    <td>
                      <select
                        value={s.status}
                        onClick={e => e.stopPropagation()}
                        onChange={e => updateStatus(s.id, e.target.value)}
                        style={{ fontSize: 12, padding: '2px 6px', border: '1px solid var(--cp-border)', borderRadius: 4 }}
                      >
                        {Object.keys(STATUS_COLORS).map(st => <option key={st} value={st}>{st}</option>)}
                      </select>
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
