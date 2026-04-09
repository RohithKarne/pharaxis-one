import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'

function formatFileSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const DOC_TYPE_CLASSES = {
  smpc:             'smpc',
  pil:              'pil',
  ifu:              'ifu',
  clinical_summary: 'clinical_summary',
  other:            'other',
}

export default function DocumentsPage() {
  const { clientCode, user, language } = usePortal()
  const navigate                  = useNavigate()
  const [docs, setDocs]           = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [search, setSearch]       = useState('')
  const [downloading, setDownloading] = useState(null)
  const [savedIds, setSavedIds]   = useState([])
  const [savingId, setSavingId]   = useState(null)

  const base = `/portal/${clientCode}`

  useEffect(() => {
    if (!user) { navigate(`${base}/login`); return }
    async function load() {
      setLoading(true)
      try {
        const token = localStorage.getItem('cp_portal_token')
        const [docsRes, savedRes] = await Promise.all([
          fetch(`/api/portal/documents?clientCode=${clientCode}${language && language !== 'en' ? `&lang=${language}` : ''}`, {
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/portal/saved?clientCode=${clientCode}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ])
        const d = await docsRes.json()
        const s = await savedRes.json()
        setDocs(d.documents || [])
        setCategories(d.categories || [])
        setSavedIds((s.saved || []).filter(x => x.item_type === 'document').map(x => x.item_id))
      } catch {
        setError('Unable to load documents.')
      }
      setLoading(false)
    }
    if (clientCode) load()
  }, [clientCode, user, language])

  const allCategories = ['All', ...categories.map(c => (typeof c === 'string' ? c : c.name)).filter(Boolean)]

  const filtered = docs
    .filter(d => activeCategory === 'All' || d.category === activeCategory)
    .filter(d => {
      if (!search) return true
      const q = search.toLowerCase()
      return (d.title || '').toLowerCase().includes(q) || (d.doc_type || '').toLowerCase().includes(q)
    })

  async function toggleSave(doc) {
    if (savingId === doc.id) return
    setSavingId(doc.id)
    const token = localStorage.getItem('cp_portal_token')
    const isSaved = savedIds.includes(doc.id)
    try {
      if (isSaved) {
        await fetch('/api/portal/saved', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ clientCode, item_type: 'document', item_id: doc.id }),
        })
        setSavedIds(prev => prev.filter(id => id !== doc.id))
      } else {
        await fetch('/api/portal/saved', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ clientCode, item_type: 'document', item_id: doc.id }),
        })
        setSavedIds(prev => [...prev, doc.id])
      }
    } catch { /* silently fail */ }
    setSavingId(null)
  }

  async function handleDownload(doc) {
    if (downloading === doc.id) return
    setDownloading(doc.id)
    try {
      const token = localStorage.getItem('cp_portal_token')
      const res = await fetch(`/api/portal/documents/${doc.id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) { alert('Download failed. Please sign in and try again.'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = doc.file_name || doc.title
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(null)
    }
  }

  if (loading) return <div className="pp-docs-page"><div className="pp-loading" role="status" aria-live="polite">Loading…</div></div>
  if (error)   return <div className="pp-docs-page"><div className="pp-error-state">{error}</div></div>

  return (
    <div className="pp-docs-page">
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 20 }}>Document Library</h1>

      <div className="pp-docs-search">
        <input
          placeholder="Search documents…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="pp-news-filters" style={{ marginBottom: 16 }}>
        {allCategories.map(cat => (
          <button
            key={cat}
            className={`pp-filter-btn ${activeCategory === cat ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="pp-empty-state"><span>📁</span><p>No documents found.</p></div>
      ) : (
        <div className="pp-docs-grid">
          {filtered.map(doc => (
            <div key={doc.id} className="pp-doc-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span className={`pp-doc-type-badge ${DOC_TYPE_CLASSES[doc.doc_type] || 'other'}`}>
                  {doc.doc_type?.replace(/_/g, ' ').toUpperCase() || 'DOC'}
                </span>
              </div>
              <div className="pp-doc-title">{doc.title}</div>
              <div className="pp-doc-meta">
                {doc.category && <span>{doc.category} · </span>}
                {formatFileSize(doc.file_size)}
              </div>
              <div className="pp-doc-download" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  className="pp-btn pp-btn-outline pp-btn-sm"
                  onClick={() => handleDownload(doc)}
                  disabled={downloading === doc.id}
                  aria-label={`Download ${doc.title}`}
                >
                  {downloading === doc.id ? 'Downloading…' : '⬇ Download'}
                </button>
                <button
                  className="pp-btn pp-btn-outline pp-btn-sm"
                  onClick={() => toggleSave(doc)}
                  disabled={savingId === doc.id}
                  aria-label={savedIds.includes(doc.id) ? `Unsave ${doc.title}` : `Save ${doc.title}`}
                  style={{
                    color: savedIds.includes(doc.id) ? '#1D4ED8' : '#6B7280',
                    borderColor: savedIds.includes(doc.id) ? '#BFDBFE' : undefined,
                    background: savedIds.includes(doc.id) ? '#EFF6FF' : undefined,
                  }}
                  title={savedIds.includes(doc.id) ? 'Unsave' : 'Save'}
                >
                  {savingId === doc.id ? '…' : '🔖'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
