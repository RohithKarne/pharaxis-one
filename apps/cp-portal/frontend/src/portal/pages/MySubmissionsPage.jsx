import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'
import Icon from '../../shared/components/Icon'
import { formatDateTime } from '../../shared/utils/datetime'

const STATUS_LABELS = {
  pending:    { label: 'Pending',     cls: 'pp-status-pending'    },
  in_review:  { label: 'In Review',   cls: 'pp-status-in-review'  },
  completed:  { label: 'Completed',   cls: 'pp-status-completed'  },
  closed:     { label: 'Closed',      cls: 'pp-status-closed'     },
}

const TYPE_LABELS = {
  medical_inquiry:   'Medical Inquiry',
  adverse_event:     'Adverse Event',
  product_complaint: 'Product Complaint',
  other_inquiry:     'Other',
}

export default function MySubmissionsPage() {
  const { clientCode, user, portalHeaders } = usePortal()
  const navigate     = useNavigate()
  const [subs, setSubs]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { navigate(`/portal/${clientCode}/login`); return }
    fetch(`/api/portal/auth/me`, { headers: portalHeaders() })
      .then(r => r.json()).then(d => { setSubs(d.submissions || []); setLoading(false) }).catch(() => setLoading(false))
  }, [user, clientCode])

  // Submitted timestamps are shown with date + time in the viewer's local zone.
  const formatDate = (str) => formatDateTime(str)

  function exportSummary() {
    const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`
    const header = ['Reference', 'Type', 'Status', 'Submitted', 'External Ref']
    const rows = subs.map(s => [
      `CP-${String(s.id).padStart(6, '0')}`,
      TYPE_LABELS[s.submission_type] || s.submission_type,
      STATUS_LABELS[s.status]?.label || s.status,
      formatDate(s.submitted_at),
      s.external_ref || '',
    ].map(esc).join(','))
    const csv = [header.map(esc).join(','), ...rows].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `my-submissions-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  return (
    <div className="pp-container pp-page-content">
      <div className="pp-page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1>My Submissions</h1>
          <p>Track the status of your submitted requests.</p>
        </div>
        {subs.length > 0 && (
          <button className="pp-btn pp-btn-outline pp-btn-sm" onClick={exportSummary} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <Icon name="file" size={15} /> Download summary
          </button>
        )}
      </div>

      {loading ? <div className="pp-loading">Loading…</div> : subs.length === 0 ? (
        <div className="pp-empty-state">
          <span><Icon name="inbox" size={40} /></span>
          <p>You haven't submitted any requests yet.</p>
          <Link to={`/portal/${clientCode}/submit`} className="pp-btn pp-btn-primary">Submit a Request</Link>
        </div>
      ) : (
        <div className="pp-submissions-list">
          {subs.map(s => {
            const status = STATUS_LABELS[s.status] || { label: s.status, cls: 'pp-status-pending' }
            return (
              <div key={s.id} className="pp-submission-card">
                <div className="pp-submission-header">
                  <div>
                    <div className="pp-submission-ref">CP-{String(s.id).padStart(6, '0')}</div>
                    <div className="pp-submission-type">{TYPE_LABELS[s.submission_type] || s.submission_type}</div>
                  </div>
                  <span className={`pp-status-badge ${status.cls}`}>{status.label}</span>
                </div>
                <div className="pp-submission-meta">
                  <span>Submitted {formatDate(s.submitted_at)}</span>
                  {s.external_ref && <span>· Ref: {s.external_ref}</span>}
                </div>
                {s.status && !['submitted', 'closed'].includes(s.status) && (
                  <div className={`pp-sync-tag pp-sync-${s.status}`}>
                    {s.status === 'synced' ? '✓ Synced to system' : s.status === 'pending_sync' ? '⏳ Sync pending' : s.status === 'failed_sync' ? '⚠️ Sync failed' : ''}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
