import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'
import { SkeletonCards } from '../../shared/components/Skeleton'
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

      {loading ? <SkeletonCards count={4} /> : subs.length === 0 ? (
        <div className="pp-empty-state">
          <span><Icon name="inbox" size={40} /></span>
          <p>You haven't submitted any requests yet.</p>
          <Link to={`/portal/${clientCode}/submit`} className="pp-btn pp-btn-primary">Submit a Request</Link>
        </div>
      ) : (
        <div className="pp-submissions-list">
          {subs.map(s => {
            const status = STATUS_LABELS[s.status] || { label: s.status, cls: 'pp-status-pending' }
            const steps = [
              { key: 'submitted', label: 'Submitted' },
              { key: 'triage', label: 'Triage' },
              { key: 'in_review', label: 'In Review' },
              { key: 'completed', label: 'Resolved' },
            ]
            const currentStepIdx = s.status === 'completed' || s.status === 'closed' ? 3 : s.status === 'in_review' ? 2 : s.status === 'triage' ? 1 : 0

            return (
              <div key={s.id} className="pp-submission-card" style={{ padding: '20px', borderRadius: '10px', background: 'var(--pp-card-bg, #ffffff)', border: '1px solid var(--pp-border-color, #e2e8f0)', marginBottom: '16px' }}>
                <div className="pp-submission-header">
                  <div>
                    <div className="pp-submission-ref" style={{ fontWeight: 700, fontSize: '1.1rem' }}>CP-{String(s.id).padStart(6, '0')}</div>
                    <div className="pp-submission-type" style={{ color: '#64748b' }}>{TYPE_LABELS[s.submission_type] || s.submission_type}</div>
                  </div>
                  <span className={`pp-status-badge ${status.cls}`}>{status.label}</span>
                </div>
                <div className="pp-submission-meta" style={{ marginTop: '8px', color: '#64748b', fontSize: '0.85rem', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span>Submitted {formatDate(s.submitted_at)}</span>
                  {s.external_ref && <span> · MIMS Ref: {s.external_ref}</span>}
                  <span style={{ background: '#FEF3C7', color: '#92400E', padding: '2px 8px', borderRadius: 12, fontSize: '11px', fontWeight: 600 }}>
                    ⚡ SLA Target: &lt; 24h Response
                  </span>
                </div>

                {/* Milestone Progress Bar */}
                <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
                    {steps.map((st, idx) => {
                      const isDone = idx <= currentStepIdx
                      return (
                        <div key={st.key} style={{ flex: 1, textAlign: 'center', position: 'relative' }}>
                          <div style={{
                            width: '24px', height: '24px', borderRadius: '50%', margin: '0 auto 6px',
                            background: isDone ? 'var(--pp-primary, #0284c7)' : '#e2e8f0',
                            color: isDone ? '#ffffff' : '#64748b',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold'
                          }}>
                            {isDone ? '✓' : idx + 1}
                          </div>
                          <span style={{ fontSize: '12px', color: isDone ? '#0f172a' : '#94a3b8', fontWeight: isDone ? 600 : 400 }}>
                            {st.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Expandable Activity Details */}
                <details style={{ marginTop: '12px', fontSize: '0.85rem', color: '#475569' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--pp-primary, #0284c7)' }}>
                    🔍 View Request Details & Activity History
                  </summary>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', marginTop: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#334155', marginBottom: 4 }}>Submission Summary:</div>
                    <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                      {s.form_data?.inquiry_details || s.form_data?.event_description || s.form_data?.complaint_details || 'Request submitted successfully to Medical Affairs team.'}
                    </p>
                    <div style={{ marginTop: 8, fontSize: '11px', color: '#94a3b8' }}>
                      Assigned Agent: Medical Safety & Triage Specialist · Last update: {formatDate(s.submitted_at)}
                    </div>
                  </div>
                </details>

                {s.status && !['submitted', 'closed'].includes(s.status) && (
                  <div className={`pp-sync-tag pp-sync-${s.status}`} style={{ marginTop: '12px', fontSize: '0.8rem' }}>
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
