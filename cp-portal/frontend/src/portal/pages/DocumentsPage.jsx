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
  const { clientCode, user }      = usePortal()
  const navigate                  = useNavigate()
  const [docs, setDocs]           = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [search, setSearch]       = useState('')

  const base = `/portal/${clientCode}`

  useEffect(() => {
    if (!user) { navigate(`${base}/login`); return }
    async function load() {
      setLoading(true)
      try {
        const token = localStorage.getItem('cp_portal_token')
        const res = await fetch(`/api/portal/documents?clientCode=${clientCode}`, {
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        })
        const d = await res.json()
        setDocs(d.docs || [])
        setCategories(d.categories || [])
      } catch {
        setError('Unable to load documents.')
      }
      setLoading(false)
    }
    if (clientCode) load()
  }, [clientCode, user])

  const allCategories = ['All', ...categories.map(c => (typeof c === 'string' ? c : c.name)).filter(Boolean)]

  const filtered = docs
    .filter(d => activeCategory === 'All' || d.category === activeCategory)
    .filter(d => {
      if (!search) return true
      const q = search.toLowerCase()
      return (d.title || '').toLowerCase().includes(q) || (d.doc_type || '').toLowerCase().includes(q)
    })

  function handleDownload(doc) {
    const token = localStorage.getItem('cp_portal_token')
    const url = `/api/portal/documents/${doc.id}/download?clientCode=${clientCode}${token ? `&token=${token}` : ''}`
    const a = document.createElement('a')
    a.href = url
    a.download = doc.file_name || doc.title
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  if (loading) return <div className="pp-docs-page"><div className="pp-loading">Loading…</div></div>
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

      {allCategories.length > 1 && (
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
      )}

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
              <div className="pp-doc-download">
                <button className="pp-btn pp-btn-outline pp-btn-sm" onClick={() => handleDownload(doc)}>
                  ⬇ Download
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
