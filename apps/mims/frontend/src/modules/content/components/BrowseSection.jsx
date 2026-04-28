import { useState, useEffect } from 'react'
import { httpFetch } from '../../../shared/api/httpFetch.js'

export default function BrowseSection({ token }) {
  const authHeaders = { Authorization: `Bearer ${token}` }
  const [contentType, setContentType] = useState('documents')
  const [search, setSearch] = useState('')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [bookmarks, setBookmarks] = useState([])
  const authHeadersJson = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  async function loadBookmarks() {
    try {
      const res = await httpFetch('/api/cm/folders/bookmarks', { headers: authHeaders })
      if (res.ok) setBookmarks((await res.json()).bookmarks || [])
    } catch { /* silent */ }
  }

  async function toggleBookmark(item) {
    const entityType = contentType === 'documents' ? 'document' : 'faq'
    const existing = bookmarks.find(b => b.entity_type === entityType && b.entity_id === item.id)
    if (existing) {
      await httpFetch(`/api/cm/folders/bookmarks/${existing.id}`, { method: 'DELETE', headers: authHeaders }).catch(() => {})
    } else {
      await httpFetch('/api/cm/folders/bookmarks', { method: 'POST', headers: authHeadersJson, body: JSON.stringify({ entity_type: entityType, entity_id: item.id }) }).catch(() => {})
    }
    loadBookmarks()
  }

  useEffect(() => { loadBookmarks() }, [token]) // eslint-disable-line

  useEffect(() => {
    setSelectedItem(null)
    setItems([])
    setLoading(true)
    const endpoint = contentType === 'documents'
      ? `/api/cm/documents?status=Published&search=${encodeURIComponent(search)}&limit=50`
      : `/api/cm/faqs?status=Published&search=${encodeURIComponent(search)}&limit=50`
    httpFetch(endpoint, { headers: authHeaders })
      .then(r => r.json())
      .then(d => setItems(d.documents || d.faqs || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [contentType, search])

  async function openItem(item) {
    setDetailLoading(true)
    setSelectedItem({ ...item, _loading: true })
    const endpoint = contentType === 'documents'
      ? `/api/cm/documents/${item.id}`
      : `/api/cm/faqs/${item.id}`
    const r = await httpFetch(endpoint, { headers: authHeaders }).then(x => x.json()).catch(() => item)
    setSelectedItem(r.document || r.faq || r)
    setDetailLoading(false)
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{ width: selectedItem ? 340 : '100%', flexShrink: 0, borderRight: selectedItem ? '1px solid var(--border)' : 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
            {[{ key: 'documents', label: 'Documents' }, { key: 'faqs', label: 'FAQs' }].map(t => (
              <button key={t.key}
                onClick={() => { setContentType(t.key); setShowBookmarks(false) }}
                style={{ padding: '6px 14px', border: 'none', background: contentType === t.key && !showBookmarks ? 'var(--primary)' : '#fff', color: contentType === t.key && !showBookmarks ? '#fff' : 'var(--text-primary)', cursor: 'pointer', fontSize: 13, fontWeight: contentType === t.key && !showBookmarks ? 600 : 400 }}
              >{t.label}</button>
            ))}
            <button onClick={() => { setShowBookmarks(b => !b); if (!showBookmarks) loadBookmarks() }}
              style={{ padding: '6px 14px', border: 'none', background: showBookmarks ? 'var(--warning, #f59e0b)' : '#fff', color: showBookmarks ? '#fff' : 'var(--text-primary)', cursor: 'pointer', fontSize: 13, fontWeight: showBookmarks ? 600 : 400 }}>
              ★ Bookmarks {bookmarks.length > 0 && `(${bookmarks.length})`}
            </button>
          </div>
          <input
            style={{ flex: 1, minWidth: 160, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}
            placeholder="Search published content…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {showBookmarks ? (
            bookmarks.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No bookmarks yet. Click ★ next to any item to bookmark it.</div>
            ) : bookmarks.map(b => (
              <div key={b.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 8 }}>[{b.entity_type}]</span>
                  <span style={{ fontWeight: 500 }}>{b.entity_name || `ID ${b.entity_id}`}</span>
                </div>
                <button onClick={async () => { await httpFetch(`/api/cm/folders/bookmarks/${b.id}`, { method: 'DELETE', headers: authHeaders }); loadBookmarks() }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--warning, #f59e0b)' }}>★</button>
              </div>
            ))
          ) : loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
          ) : items.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No published {contentType} found.</div>
          ) : (
            items.map(item => (
              <div key={item.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 8, background: selectedItem && selectedItem.id === item.id ? 'var(--primary-light, #f0f4ff)' : 'transparent' }}>
                <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => openItem(item)}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{item.title || item.question || '(Untitled)'}</div>
                {contentType === 'documents' && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {item.doc_type && <span style={{ marginRight: 8 }}>{item.doc_type}</span>}
                    {item.folder_name && <span>📁 {item.folder_name}</span>}
                  </div>
                )}
                {contentType === 'faqs' && item.tags && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Tags: {item.tags}</div>
                )}
                {item.expiry_date && (
                  <div style={{ fontSize: 11, color: new Date(item.expiry_date) < new Date() ? 'var(--danger)' : 'var(--text-muted)', marginTop: 2 }}>
                    Expires: {new Date(item.expiry_date).toLocaleDateString()}
                  </div>
                )}
                </div>
                <button onClick={e => { e.stopPropagation(); toggleBookmark(item) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: bookmarks.find(b => b.entity_id === item.id) ? 'var(--warning, #f59e0b)' : 'var(--border)', flexShrink: 0, alignSelf: 'center' }}>
                  {bookmarks.find(b => b.entity_id === item.id) ? '★' : '☆'}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
      {selectedItem && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)' }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>{selectedItem.title || selectedItem.question || '(Untitled)'}</h3>
            <button onClick={() => setSelectedItem(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-muted)' }}>✕</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
            {detailLoading ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>
            ) : (
              <>
                {contentType === 'documents' && (
                  <>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16, fontSize: 13, color: 'var(--text-muted)' }}>
                      {selectedItem.doc_type && <span><strong>Type:</strong> {selectedItem.doc_type}</span>}
                      {selectedItem.status && <span><strong>Status:</strong> {selectedItem.status}</span>}
                      {selectedItem.version_major != null && <span><strong>Version:</strong> v{selectedItem.version_major}.{selectedItem.version_minor ?? 0}</span>}
                      {selectedItem.expiry_date && <span><strong>Expires:</strong> {new Date(selectedItem.expiry_date).toLocaleDateString()}</span>}
                    </div>
                    {selectedItem.description && (
                      <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)' }}>{selectedItem.description}</div>
                    )}
                    {selectedItem.content && (
                      <div dangerouslySetInnerHTML={{ __html: selectedItem.content }} style={{ lineHeight: 1.7, fontSize: 14 }} />
                    )}
                    {selectedItem.file_path && (
                      <div style={{ marginTop: 20 }}>
                        <a href={`/api/cm/documents/${selectedItem.id}/download`} target="_blank" rel="noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--primary)', color: '#fff', borderRadius: 6, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
                          Download File
                        </a>
                      </div>
                    )}
                  </>
                )}
                {contentType === 'faqs' && (
                  <>
                    <div style={{ marginBottom: 16 }}>
                      <h4 style={{ margin: '0 0 8px', color: 'var(--text-muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Question</h4>
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>{selectedItem.question}</p>
                    </div>
                    <div>
                      <h4 style={{ margin: '0 0 8px', color: 'var(--text-muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Answer</h4>
                      <div dangerouslySetInnerHTML={{ __html: selectedItem.answer }} style={{ lineHeight: 1.7, fontSize: 14 }} />
                    </div>
                    {selectedItem.tags && (
                      <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>
                        <strong>Tags:</strong> {selectedItem.tags}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
