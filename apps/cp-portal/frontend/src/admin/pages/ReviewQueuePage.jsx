import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders, useAdminAuth } from '../context/AdminAuthContext'

const STATUS_STYLE = {
  review:   { background: '#FEF3C7', color: '#D97706' },
  approved: { background: '#CCFBF1', color: '#0D9488' },
}

const STATUS_LABELS = {
  review: 'Needs review',
  approved: 'Approved to publish',
}

const TYPE_STYLE = {
  news:     { background: '#DBEAFE', color: '#1D4ED8', label: 'News' },
  document: { background: '#F3E8FF', color: '#7C3AED', label: 'Document' },
}

export default function ReviewQueuePage() {
  const { clientId }         = useParams()
  const navigate             = useNavigate()
  const { canApprove, canPublish } = useAdminAuth()
  const [items, setItems]    = useState([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing]  = useState(null)  // id of item being actioned
  const [error, setError]    = useState('')

  useEffect(() => { load() }, [clientId])

  function load() {
    setLoading(true)
    fetch(`/api/admin/review-queue/${clientId}`, { headers: adminHeaders() })
      .then(r => r.json())
      .then(d => { setItems(d.items || []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  async function transition(item, newStatus) {
    setActing(item.id + item.item_type)
    setError('')
    const endpoint = item.item_type === 'news'
      ? `/api/admin/news/${clientId}/${item.id}`
      : `/api/admin/documents/${clientId}/${item.id}`
    try {
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: adminHeaders(),
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) { setError(`Failed to update "${item.title}". Please try again.`); return }
      load()
    } catch {
      setError(`Network error updating "${item.title}".`)
    } finally {
      setActing(null)
    }
  }

  function goToItem(item) {
    const path = item.item_type === 'news'
      ? `/admin/clients/${clientId}/news`
      : `/admin/clients/${clientId}/documents`
    navigate(path)
  }

  const reviewItems   = items.filter(i => i.status === 'review')
  const approvedItems = items.filter(i => i.status === 'approved')

  function Section({ title, rows }) {
    if (rows.length === 0) return null
    return (
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          {title} ({rows.length})
        </div>
        <div className="cp-card cp-table-card" style={{ padding: 0 }}>
          <table className="cp-table">
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Type</th>
                <th scope="col">Category</th>
                <th scope="col">Status</th>
                <th scope="col">Last Updated</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(item => {
                const key = item.id + item.item_type
                const ts  = TYPE_STYLE[item.item_type] || TYPE_STYLE.news
                const ss  = STATUS_STYLE[item.status]  || {}
                return (
                  <tr key={key}>
                    <td>
                      <button className="cp-link-btn" style={{ textAlign: 'left', fontWeight: 500 }} onClick={() => goToItem(item)}>
                        {item.title}
                      </button>
                    </td>
                    <td>
                      <span style={{ background: ts.background, color: ts.color, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                        {ts.label}
                      </span>
                    </td>
                    <td>{item.category || '—'}</td>
                    <td>
                      <span className="cp-status-badge" style={ss}>
                        {STATUS_LABELS[item.status] || item.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: '#6B7280' }}>
                      {item.updated_at ? new Date(item.updated_at).toLocaleString() : '—'}
                    </td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      {canApprove && item.status === 'review' && (
                        <>
                          <button
                            className="cp-btn cp-btn-sm"
                            style={{ background: '#CCFBF1', color: '#0D9488', border: '1px solid #99F6E4' }}
                            disabled={acting === key}
                            onClick={() => transition(item, 'approved')}
                          >
                            Approve
                          </button>
                          <button
                            className="cp-btn cp-btn-sm"
                            style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}
                            disabled={acting === key}
                            onClick={() => transition(item, 'draft')}
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {canPublish && item.status === 'approved' && (
                        <button
                          className="cp-btn cp-btn-sm cp-btn-primary"
                          disabled={acting === key}
                          onClick={() => transition(item, 'published')}
                        >
                          Publish
                        </button>
                      )}
                      {canPublish && (
                        <button
                          className="cp-btn cp-btn-sm cp-btn-outline"
                          disabled={acting === key}
                          onClick={() => transition(item, 'draft')}
                        >
                          Send Back
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <AdminLayout title="Review Queue">
      <div className="cp-page">
        <div className="cp-page-header">
          <div>
            <div className="cp-page-kicker">Content governance</div>
            <h1 className="cp-page-title">Review Queue</h1>
            <p className="cp-page-subtitle">Approve content before it becomes visible in the public portal.</p>
          </div>
        </div>

        {error && <div className="cp-error">{error}</div>}

        {!canApprove && !canPublish && (
          <div className="cp-card" style={{ padding: '12px 16px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, marginBottom: 16, fontSize: 13, color: '#92400E' }}>
            You have view-only access to the review queue. Contact an admin or reviewer to approve items.
          </div>
        )}

        {loading ? (
          <div className="cp-empty">Loading…</div>
        ) : items.length === 0 ? (
          <div className="cp-empty">
            <div>Review queue is empty. All content is up to date.</div>
          </div>
        ) : (
          <>
            <Section title="Awaiting Review" rows={reviewItems} />
            <Section title="Approved — Awaiting Publish" rows={approvedItems} />
          </>
        )}
      </div>
    </AdminLayout>
  )
}
