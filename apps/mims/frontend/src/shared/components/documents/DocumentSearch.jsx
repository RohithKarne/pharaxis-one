/**
 * DocumentSearch — Theme 6 (Wave 3) full-text search across all uploads.
 *
 * Calls /api/documents/search with a query. Shows ranked hits with
 * snippet preview. Click → open PreviewModal.
 *
 * Props:
 *   compact?       — small mode (single search bar + dropdown)
 *   entityType?, entityId? — scope to a single entity
 *   defaultMime?   — optional mime filter (e.g. 'application/pdf')
 */

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useFeatureFlag } from '../../context/FeatureFlagsContext'
import { httpFetch } from '../../api/httpFetch.js'
import PreviewModal from './PreviewModal'

export default function DocumentSearch({
  compact = false, entityType, entityId, defaultMime,
}) {
  const { token } = useAuth()
  const enabled = useFeatureFlag('cf.theme6_documents')
  const [q, setQ] = useState('')
  const [mime, setMime] = useState(defaultMime || '')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(null)

  const search = useCallback(async (query) => {
    if (!enabled) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (query) params.set('q', query)
      if (mime)  params.set('mime', mime)
      if (entityType) params.set('entity_type', entityType)
      if (entityId)   params.set('entity_id', String(entityId))
      const r = await httpFetch(`/api/documents/search?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const d = await r.json()
      setResults(d.matches || [])
    } catch { setResults([]) } finally { setLoading(false) }
  }, [enabled, mime, entityType, entityId, token])

  useEffect(() => {
    if (!enabled) return
    const t = setTimeout(() => search(q), 250)
    return () => clearTimeout(t)
  }, [q, search, enabled])

  if (!enabled) {
    return (
      <div style={{ padding: 10, fontSize: 12, color: 'var(--text-muted)' }}>
        Document search isn't enabled. Toggle <strong>cf.theme6_documents</strong> in Feature Flags.
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <input
          autoFocus
          placeholder="Search documents by name or OCR text…"
          value={q} onChange={e => setQ(e.target.value)}
          style={{ flex: 1, padding: '8px 12px', fontSize: 13,
            border: '1px solid var(--border)', borderRadius: 6 }}
        />
        <select value={mime} onChange={e => setMime(e.target.value)}
          style={{ padding: '8px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6 }}>
          <option value="">All types</option>
          <option value="application/pdf">PDF</option>
          <option value="image/">Images</option>
          <option value="application/vnd.openxmlformats-officedocument.wordprocessingml">Word docs</option>
          <option value="application/vnd.openxmlformats-officedocument.spreadsheetml">Excel</option>
        </select>
      </div>
      {loading && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Searching…</div>}
      {!loading && results.length === 0 && q && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No matches.</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {results.map(r => (
          <div key={r.id} onClick={() => setOpen(r)}
            style={{
              padding: 10, cursor: 'pointer', borderRadius: 6,
              border: '1px solid var(--border)', background: 'var(--surface,#fff)',
            }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong style={{ fontSize: 13 }}>{r.original_name}</strong>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {r.mime_type} · {r.entity_type} #{r.entity_id}
                {r.field_name ? ` · ${r.field_name}` : ''}
              </span>
            </div>
            {r.snippet && (
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                {highlight(r.snippet, q)}
              </div>
            )}
            {!compact && r.uploaded_at && (
              <div style={{ marginTop: 3, fontSize: 11, color: 'var(--text-muted)' }}>
                Uploaded {new Date(r.uploaded_at).toLocaleString()}
              </div>
            )}
          </div>
        ))}
      </div>
      <PreviewModal attachment={open} onClose={() => setOpen(null)} />
    </div>
  )
}

function highlight(text, q) {
  if (!q) return text
  const pat = new RegExp(`(${escapeReg(q)})`, 'ig')
  const parts = String(text).split(pat)
  return parts.map((p, i) =>
    p.toLowerCase() === q.toLowerCase()
      ? <mark key={i} style={{ background: '#ffe082' }}>{p}</mark>
      : p
  )
}
function escapeReg(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
