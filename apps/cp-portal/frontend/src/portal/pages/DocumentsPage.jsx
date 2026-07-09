import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'
import PdfViewerModal from '../components/PdfViewerModal'
import { SkeletonCards } from '../../shared/components/Skeleton'

function formatFileSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatRelevanceScore(score) {
  const num = Number(score)
  if (Number.isNaN(num)) return null
  const pct = num <= 1 ? Math.round(num * 100) : Math.round(num)
  const clamped = Math.max(0, Math.min(100, pct))
  return `${clamped}%`
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
  const [aiMode, setAiMode] = useState(false)
  const [aiResults, setAiResults] = useState([])
  const [viewDoc, setViewDoc] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiUnavailable, setAiUnavailable] = useState(false)

  const base = `/portal/${clientCode}`

  useEffect(() => {
    if (!user) { navigate(`${base}/login`); return }
    async function load() {
      setLoading(true)
      try {
        const [docsRes, savedRes] = await Promise.all([
          fetch(`/api/portal/documents?clientCode=${clientCode}${language && language !== 'en' ? `&lang=${language}` : ''}`, {
            headers: { 'Content-Type': 'application/json' },
          }),
          fetch(`/api/portal/saved?clientCode=${clientCode}`),
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

  function toggleAiMode() {
    if (aiMode) {
      setAiMode(false)
      setAiResults([])
      setAiError('')
      setAiLoading(false)
      return
    }
    setAiMode(true)
    setAiError('')
  }

  async function submitAiSearch() {
    if (!aiMode) return
    const q = search.trim()
    if (!q) {
      setAiResults([])
      setAiError('Please enter a query to run AI search.')
      return
    }
    setAiLoading(true)
    setAiError('')
    try {
      const res = await fetch('/api/portal/documents/ai-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientCode, query: q }),
      })
      const data = await res.json()

      if (data?.ai_unavailable) {
        setAiUnavailable(true)
        setAiMode(false)
        setAiResults([])
        setAiError('')
        return
      }

      if (!res.ok) {
        setAiResults([])
        setAiError(data?.error || 'Unable to run AI search.')
        return
      }

      setAiResults(Array.isArray(data?.results) ? data.results : [])
    } catch {
      setAiResults([])
      setAiError('Unable to run AI search.')
    } finally {
      setAiLoading(false)
    }
  }

  async function toggleSave(doc) {
    if (savingId === doc.id) return
    setSavingId(doc.id)
    const isSaved = savedIds.includes(doc.id)
    // Optimistic update, reverted below if the request fails.
    setSavedIds(prev => isSaved ? prev.filter(id => id !== doc.id) : [...prev, doc.id])
    try {
      const res = await fetch('/api/portal/saved', {
        method: isSaved ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientCode, item_type: 'document', item_id: doc.id }),
      })
      if (!res.ok) throw new Error('save failed')
    } catch {
      // Revert the optimistic change so UI stays in sync with the server.
      setSavedIds(prev => isSaved ? [...prev, doc.id] : prev.filter(id => id !== doc.id))
    } finally {
      setSavingId(null)
    }
  }

  async function handleDownload(doc) {
    if (downloading === doc.id) return
    setDownloading(doc.id)
    try {
      const res = await fetch(`/api/portal/documents/${doc.id}/download`)
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
    } catch {
      alert('Download failed. Please check your connection and try again.')
    } finally {
      setDownloading(null)
    }
  }

  function docBadges(doc) {
    const badges = []
    if (doc.created_at && (Date.now() - new Date(doc.created_at).getTime()) < 14 * 86400000) {
      badges.push(<span key="new" className="pp-badge-new">New</span>)
    }
    if (doc.expires_at) {
      const ms = new Date(doc.expires_at).getTime() - Date.now()
      if (ms < 0) badges.push(<span key="exp" className="pp-badge-exp gone">Expired</span>)
      else if (ms < 30 * 86400000) badges.push(<span key="exp" className="pp-badge-exp">Expiring</span>)
    }
    return badges
  }

  if (loading) return <div className="pp-docs-page" style={{ padding: '24px' }}><SkeletonCards count={6} /></div>
  if (error)   return <div className="pp-docs-page"><div className="pp-error-state">{error}</div></div>

  return (
    <div className="pp-docs-page">
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 20 }}>Document Library</h1>

      <div className="pp-docs-search" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          placeholder="Search documents…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => {
            if (aiMode && e.key === 'Enter') {
              e.preventDefault()
              submitAiSearch()
            }
          }}
          style={{ flex: 1 }}
        />
        {aiMode && (
          <button
            className="pp-btn pp-btn-outline pp-btn-sm"
            onClick={submitAiSearch}
            disabled={aiLoading}
          >
            {aiLoading ? 'Searching…' : 'Search'}
          </button>
        )}
        {!aiUnavailable && (
          <button
            className="pp-btn pp-btn-outline pp-btn-sm"
            onClick={toggleAiMode}
            type="button"
          >
            {aiMode ? 'Standard Search' : 'AI Search'}
          </button>
        )}
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

      {aiMode ? (
        <>
          <div style={{ fontStyle: 'italic', color: '#6B7280', marginBottom: 12 }}>
            AI-assisted results — review source documents before use
          </div>
          {aiError ? (
            <div className="pp-error-state">{aiError}</div>
          ) : aiLoading ? (
            <div className="pp-loading" role="status" aria-live="polite">Searching…</div>
          ) : aiResults.length === 0 ? (
            <div className="pp-empty-state"><span>📁</span><p>No relevant documents found for your query</p></div>
          ) : (
            <div className="pp-docs-grid">
              {aiResults.map(doc => (
                <div key={doc.id} className="pp-doc-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className={`pp-doc-type-badge ${DOC_TYPE_CLASSES[doc.doc_type] || 'other'}`}>
                      {doc.doc_type?.replace(/_/g, ' ').toUpperCase() || 'DOC'}
                    </span>
                    {formatRelevanceScore(doc.relevance_score) && (
                      <span
                        className="pp-doc-type-badge"
                        style={{ background: '#E0E7FF', color: '#3730A3' }}
                      >
                        {formatRelevanceScore(doc.relevance_score)}
                      </span>
                    )}
                  </div>
                  <div className="pp-doc-title">{doc.title}</div>
                  <div className="pp-doc-meta">
                    {doc.category && <span>{doc.category} · </span>}
                    {formatFileSize(doc.file_size)}
                  </div>
                  <div style={{ fontStyle: 'italic', color: '#6B7280', marginTop: 8 }}>
                    {doc.reason || 'Matched semantically to your query.'}
                  </div>
                  {doc.is_expiring_soon && (
                    <div style={{ color: '#B45309', marginTop: 6, fontSize: 12 }}>
                      Expiry warning: this document expires within 30 days
                    </div>
                  )}
                  <div className="pp-doc-download" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
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
        </>
      ) : filtered.length === 0 ? (
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
              <div className="pp-doc-title">{doc.title}{docBadges(doc)}</div>
              <div className="pp-doc-meta">
                {doc.category && <span>{doc.category} · </span>}
                {formatFileSize(doc.file_size)}
              </div>
              <div className="pp-doc-download" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {doc.mime_type === 'application/pdf' && (
                  <button className="pp-btn pp-btn-outline pp-btn-sm" onClick={() => setViewDoc(doc)} aria-label={`View ${doc.title}`}>
                    View
                  </button>
                )}
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
      {viewDoc && (
        <PdfViewerModal
          title={viewDoc.title}
          url={`/api/portal/documents/${viewDoc.id}/download?disposition=inline`}
          downloadUrl={`/api/portal/documents/${viewDoc.id}/download`}
          onClose={() => setViewDoc(null)}
        />
      )}
    </div>
  )
}
