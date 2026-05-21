import { useState, useEffect } from 'react'
import { httpFetch } from '../../../shared/api/httpFetch.js'

export default function CaseAssociatedDocs({ miTab, token }) {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!miTab?.document_id) return
    ;(async () => {
      setLoading(true)
      try {
        const d = await httpFetch(`/api/cm/documents/${miTab.document_id}/relations`, {
          headers: { Authorization: `Bearer ${token}` }
        }).then(r => r.ok ? r.json() : { relations: [] })
        setDocs(d.relations || [])
      } catch {
        setDocs([])
      } finally {
        setLoading(false)
      }
    })()
  }, [miTab?.document_id, token])

  if (!miTab?.document_id) return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No primary document linked to this MI response.</span>
  if (loading) return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading associated documents…</span>
  if (docs.length === 0) return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No associated documents for this response.</span>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {docs.map(d => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}>
          <span style={{ fontSize: 16 }}>📎</span>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 500 }}>{d.name}</span>
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>{d.doc_id} · {d.relation_type} · v{d.version_major}.{d.version_minor}</span>
          </div>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: d.status === 'Published' ? '#e6f4ee' : '#f5f5f5', color: d.status === 'Published' ? '#007a5a' : '#888', fontWeight: 600 }}>{d.status}</span>
        </div>
      ))}
    </div>
  )
}
