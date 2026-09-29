/**
 * CommentThread — case comment list + composer.
 *
 * Loads and posts /api/cases/:caseId/comments, answered by routes/cases.js:
 * GET returns an array (newest first) of { id, user_name, user_email, comment,
 * created_at }; POST takes { comment } and is refused (403) when the user has
 * no access to the case. The deployed table has no section/field scoping,
 * resolve or soft-delete, so this thread offers none of them.
 *
 * Props:
 *   caseId   — required
 *   compact? — small mode
 */

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { httpFetch } from '../../api/httpFetch.js'

export default function CommentThread({ caseId, compact = false }) {
  const { token } = useAuth()
  const [items, setItems] = useState([])
  const [body, setBody]   = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await httpFetch(`/api/cases/${caseId}/comments`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Could not load comments.')
      setItems(Array.isArray(d) ? d : [])
      setError('')
    } catch (err) {
      setItems([])
      setError(err.message || 'Could not load comments.')
    } finally { setLoading(false) }
  }, [caseId, token])

  useEffect(() => { if (caseId) load() }, [caseId, load])

  async function post() {
    if (!body.trim()) return
    setPosting(true)
    try {
      const r = await httpFetch(`/api/cases/${caseId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ comment: body }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Comment was not saved.')
      setBody('')
      load()
    } catch (err) {
      setError(`Comment was not saved — ${err.message}`)
    } finally { setPosting(false) }
  }

  return (
    <div style={{ padding: compact ? 6 : 10 }}>
      {error && <div className="cf-corr-error" style={{ marginBottom: 8 }}>{error}</div>}
      {loading && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>}
      {!loading && !error && items.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
          No comments yet.
        </div>
      )}
      {items.map(c => (
        <div key={c.id} style={{
          padding: '8px 10px', marginBottom: 6, borderRadius: 6,
          background: 'var(--surface,#fff)',
          border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)' }}>
            <strong>{c.user_name || c.user_email || 'System'}</strong>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {new Date(c.created_at).toLocaleString()}
            </span>
          </div>
          <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
            {c.comment}
          </div>
        </div>
      ))}
      <div style={{ marginTop: 8 }}>
        <textarea
          value={body} onChange={e => setBody(e.target.value)} rows={compact ? 2 : 3}
          placeholder="Write a comment…" maxLength={4000}
          style={{ width: '100%', boxSizing: 'border-box' }}
        />
        <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={post} disabled={posting || !body.trim()}
            style={{
              padding: '6px 14px', fontSize: 12, fontWeight: 600,
              background: '#1a4f9c', color: '#fff', border: 'none',
              borderRadius: 4, cursor: 'pointer',
              opacity: (posting || !body.trim()) ? 0.55 : 1,
            }}>
            {posting ? 'Posting…' : 'Post comment'}
          </button>
        </div>
      </div>
    </div>
  )
}
