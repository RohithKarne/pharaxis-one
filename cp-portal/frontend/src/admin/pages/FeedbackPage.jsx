import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'

function Stars({ rating }) {
  return (
    <span aria-label={`${rating} out of 5`}>
      {[1,2,3,4,5].map(n => (
        <span key={n} style={{ color: n <= rating ? '#F59E0B' : '#D1D5DB', fontSize: 16 }}>★</span>
      ))}
    </span>
  )
}

export default function FeedbackPage() {
  const { clientId }              = useParams()
  const [items, setItems]         = useState([])
  const [avgRating, setAvgRating] = useState(null)
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [loading, setLoading]     = useState(true)
  const LIMIT = 20

  useEffect(() => { load() }, [clientId, page])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/feedback/${clientId}?page=${page}&limit=${LIMIT}`, { headers: adminHeaders() })
      const d   = await res.json()
      setItems(d.feedback || [])
      setAvgRating(d.avg_rating)
      setTotal(d.total || 0)
    } catch { /* ignore */ }
    setLoading(false)
  }

  async function handleDelete(id) {
    if (!confirm('Delete this feedback entry?')) return
    await fetch(`/api/admin/feedback/${clientId}/${id}`, { method: 'DELETE', headers: adminHeaders() })
    load()
  }

  const totalPages = Math.ceil(total / LIMIT)

  if (loading) return <AdminLayout><div className="cp-loading">Loading…</div></AdminLayout>

  return (
    <AdminLayout>
      <div className="cp-section-header">
        <h2>Feedback</h2>
        {avgRating && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Stars rating={Math.round(avgRating)} />
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1A1A2E' }}>{avgRating}</span>
            <span style={{ fontSize: 13, color: '#6B7280' }}>avg · {total} response{total !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="cp-empty"><p>No feedback submitted yet.</p></div>
      ) : (
        <div className="cp-card" style={{ padding: 0 }}>
          <table className="cp-table">
            <thead>
              <tr>
                <th>Rating</th>
                <th>Message</th>
                <th>User</th>
                <th>Page</th>
                <th>Submitted</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map(f => (
                <tr key={f.id}>
                  <td><Stars rating={f.rating} /></td>
                  <td style={{ maxWidth: 320, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{f.message || <span style={{ color: '#9CA3AF' }}>—</span>}</td>
                  <td>{f.user_email || <span style={{ color: '#9CA3AF' }}>Anonymous</span>}</td>
                  <td style={{ fontSize: 12, color: '#6B7280', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.page_url || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{f.submitted_at ? new Date(f.submitted_at).toLocaleString() : '—'}</td>
                  <td>
                    <button className="cp-btn cp-btn-sm cp-btn-outline" style={{ color: '#DC2626' }} onClick={() => handleDelete(f.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 8, padding: '12px 16px', alignItems: 'center' }}>
              <button className="cp-btn cp-btn-sm cp-btn-outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
              <span style={{ fontSize: 12, color: 'var(--cp-text-muted)' }}>Page {page} of {totalPages}</span>
              <button className="cp-btn cp-btn-sm cp-btn-outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  )
}
