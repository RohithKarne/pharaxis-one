import { useEffect, useMemo, useState } from 'react'
import { httpFetch } from '../../../shared/api/httpFetch.js'

function countFor(group, key) {
  return Number(group?.[key] || 0)
}

function QueueCard({ label, value, tone = 'default', onClick }) {
  const palette = {
    default: { bg: '#f8fafc', border: '#e2e8f0', value: '#0f172a' },
    warning: { bg: '#fff7ed', border: '#fdba74', value: '#c2410c' },
    danger: { bg: '#fef2f2', border: '#fca5a5', value: '#b91c1c' },
    success: { bg: '#f0fdf4', border: '#86efac', value: '#166534' },
  }[tone]

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${palette.border}`,
        background: palette.bg,
        borderRadius: 14,
        padding: '16px 18px',
        textAlign: 'left',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: palette.value }}>{value}</div>
    </button>
  )
}

export default function ContentOperationsSection({ token, onNavigate }) {
  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token])
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await httpFetch('/api/cm/overview', { headers: authHeaders })
        const data = await res.json().catch(() => ({}))
        if (!cancelled && res.ok) setOverview(data)
      } catch {
        if (!cancelled) setOverview(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [authHeaders])

  if (loading) {
    return <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Loading content operations…</p>
  }

  const expiringDocuments = overview?.queues?.expiring_documents || []
  const checkedOutDocuments = overview?.queues?.checked_out_documents || []
  // Periodic review and overdue review tasks had no queue: the reminder went
  // to one person and nobody else could see what was falling behind.
  const dueForReview = overview?.queues?.due_for_review || []
  const overdueReviews = overview?.queues?.overdue_reviews || []
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <QueueCard label="Docs Pending Review" value={countFor(overview?.counts?.documents, 'Pending')} tone="warning" onClick={() => onNavigate?.('documents')} />
        <QueueCard label="Docs Ready to Publish" value={countFor(overview?.counts?.documents, 'Approved')} tone="success" onClick={() => onNavigate?.('documents')} />
        <QueueCard label="FAQs Pending Review" value={countFor(overview?.counts?.faqs, 'Pending')} tone="warning" onClick={() => onNavigate?.('faqs')} />
        <QueueCard label="Checked Out Docs" value={countFor(overview?.counts?.documents, 'CheckedOut')} tone="danger" onClick={() => onNavigate?.('documents')} />
        <QueueCard label="Templates Ready to Publish" value={countFor(overview?.counts?.templates, 'Approved')} tone="success" onClick={() => onNavigate?.('templates')} />
        <QueueCard label="Due for Periodic Review" value={dueForReview.length} tone={dueForReview.some(d => String(d.review_due).slice(0, 10) < today) ? 'danger' : 'warning'} />
        <QueueCard label="Overdue Review Tasks" value={overdueReviews.length} tone="danger" />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <button className="cm-btn cm-btn-secondary" onClick={() => onNavigate?.('documents')}>Open Documents</button>
        <button className="cm-btn cm-btn-secondary" onClick={() => onNavigate?.('faqs')}>Open FAQs</button>
        <button className="cm-btn cm-btn-secondary" onClick={() => onNavigate?.('templates')}>Open Templates</button>
        <button className="cm-btn cm-btn-secondary" onClick={() => onNavigate?.('settings')}>Open Settings</button>
      </div>

      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <section className="cm-card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Expiring in 30 Days</h3>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{expiringDocuments.length} item(s)</span>
          </div>
          {expiringDocuments.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>No upcoming expiries in the next 30 days.</p>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {expiringDocuments.map((doc) => (
                <div key={doc.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 600 }}>{doc.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{doc.doc_id || 'No ID'} · {doc.folder_name || 'No folder'} · {doc.status}</div>
                  <div style={{ fontSize: 12, color: '#b45309', marginTop: 6 }}>Expires {new Date(doc.expiry_date).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="cm-card" style={{ padding: 18 }} data-testid="due-for-review">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Due for Periodic Review</h3>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{dueForReview.length} item(s)</span>
          </div>
          {dueForReview.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>No published document is due for its periodic review in the next 30 days.</p>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {dueForReview.map((doc) => {
                const due = String(doc.review_due).slice(0, 10)
                return (
                  <div key={doc.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                    <div style={{ fontWeight: 600 }}>{doc.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{doc.doc_id || 'No ID'} · {doc.folder_name || 'No folder'} · every {doc.review_cycle_days} days</div>
                    <div style={{ fontSize: 12, color: due < today ? '#b91c1c' : '#b45309', marginTop: 6 }}>{due < today ? 'Review was due' : 'Review due'} {new Date(`${due}T00:00:00`).toLocaleDateString()}</div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="cm-card" style={{ padding: 18 }} data-testid="overdue-reviews">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Overdue Review Tasks</h3>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{overdueReviews.length} item(s)</span>
          </div>
          {overdueReviews.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>No review is past its planned end date.</p>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {overdueReviews.map((r) => (
                <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 600 }}>{r.document_name || r.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{r.title} · started by {r.owner_name || '—'}</div>
                  <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 6 }}>Was due {new Date(`${r.planned_end_date}T00:00:00`).toLocaleDateString()} · waiting on {r.waiting_on || '—'}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="cm-card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Checked Out Documents</h3>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{checkedOutDocuments.length} item(s)</span>
          </div>
          {checkedOutDocuments.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>No documents are currently checked out.</p>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {checkedOutDocuments.map((doc) => (
                <div key={doc.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 600 }}>{doc.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{doc.doc_id || 'No ID'} · {doc.folder_name || 'No folder'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                    Checked out by {doc.checked_out_by_name || 'Unknown'}
                    {doc.checkout_expires_at ? ` · Auto-release ${new Date(doc.checkout_expires_at).toLocaleString()}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
