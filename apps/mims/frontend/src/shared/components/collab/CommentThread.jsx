/**
 * CommentThread — Theme 5 (Wave 4) comment list + composer.
 *
 * Loads /api/cases/:caseId/comments (optionally scoped to a section/field).
 * Posts via MentionInput. Resolve / delete are owner-or-admin actions.
 *
 * Props:
 *   caseId   — required
 *   section? — scope thread to a section
 *   field?   — scope thread to a single field
 *   compact? — small mode
 */

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useFeatureFlag } from '../../context/FeatureFlagsContext'
import { httpFetch } from '../../api/httpFetch.js'
import MentionInput from './MentionInput'

export default function CommentThread({ caseId, section = null, field = null, compact = false }) {
  const { token, user } = useAuth()
  const enabled = useFeatureFlag('cf.theme5_realtime_collab')
  const [items, setItems] = useState([])
  const [body, setBody]   = useState('')
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (section) params.set('section', section)
      if (field)   params.set('field', field)
      const r = await httpFetch(`/api/cases/${caseId}/comments?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const d = await r.json()
      setItems(d.comments || [])
    } catch { setItems([]) } finally { setLoading(false) }
  }, [caseId, section, field, token])

  useEffect(() => { if (enabled && caseId) load() }, [enabled, caseId, load])

  async function post() {
    if (!body.trim()) return
    setPosting(true)
    try {
      const r = await httpFetch(`/api/cases/${caseId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ body, section, field }),
      })
      if (r.ok) { setBody(''); load() }
    } finally { setPosting(false) }
  }

  async function resolve(id) {
    await httpFetch(`/api/cases/${caseId}/comments/${id}/resolve`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}` },
    })
    load()
  }
  async function del(id) {
    if (!confirm('Delete comment?')) return
    await httpFetch(`/api/cases/${caseId}/comments/${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    })
    load()
  }

  if (!enabled) {
    return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
      Comments require the <strong>cf.theme5_realtime_collab</strong> flag.
    </div>
  }

  return (
    <div style={{ padding: compact ? 6 : 10 }}>
      {loading && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>}
      {!loading && items.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
          No comments yet{field ? ` on ${field}` : ''}.
        </div>
      )}
      {items.map(c => (
        <div key={c.id} style={{
          padding: '8px 10px', marginBottom: 6, borderRadius: 6,
          background: c.resolved ? 'var(--surface-alt,#fafafa)' : 'var(--surface,#fff)',
          border: '1px solid var(--border)',
          opacity: c.resolved ? 0.6 : 1,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)' }}>
            <strong>{c.author_name || c.author_email || `User ${c.author_id}`}</strong>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {new Date(c.created_at).toLocaleString()}
            </span>
          </div>
          <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
            {renderMentions(c.body_md)}
          </div>
          <div style={{ marginTop: 6, display: 'flex', gap: 8, fontSize: 11 }}>
            {!c.resolved && (
              <button onClick={() => resolve(c.id)} style={linkBtn('#1a7a3f')}>✓ Resolve</button>
            )}
            {c.author_id === user?.userId && (
              <button onClick={() => del(c.id)} style={linkBtn('#b91c1c')}>Delete</button>
            )}
            {c.field_name && (
              <span style={{ color: 'var(--text-muted)' }}>· field: {c.field_name}</span>
            )}
          </div>
        </div>
      ))}
      <div style={{ marginTop: 8 }}>
        <MentionInput value={body} onChange={setBody} rows={compact ? 2 : 3} />
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

function linkBtn(color) {
  return { padding: 0, background: 'transparent', border: 'none', color, cursor: 'pointer', fontWeight: 600 }
}

// Very light @mention highlighting (no markdown lib dependency)
function renderMentions(text) {
  if (!text) return null
  const out = []
  const re = /@"([^"]+)"|@([A-Za-z0-9._-]{2,40})/g
  let last = 0; let m
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(<mark key={m.index} style={{ background: '#eaf2ff', color: '#1a4f9c', padding: '0 3px', borderRadius: 3 }}>
      @{m[1] || m[2]}
    </mark>)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
