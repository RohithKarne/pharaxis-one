import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'
import PdfViewerModal from '../components/PdfViewerModal'
import AskAboutThis from '../components/AskAboutThis'
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
  const { clientCode, user, language, authLoading, t } = usePortal()
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
  // CPPM-57: AI search is offered only where an AI service is set up for it.
  const [aiAvailable, setAiAvailable] = useState(false)
  const [aiNotice, setAiNotice] = useState('')

  const base = `/portal/${clientCode}`
  // CPPM-115: a notification links here with ?doc=<id>; open that document.
  const [docParams, setDocParams] = useSearchParams()
  const [docNotice, setDocNotice] = useState('')
  const wantedDoc = docParams.get('doc')
  useEffect(() => {
    if (!wantedDoc || !docs.length) return
    const d = docs.find(x => String(x.id) === String(wantedDoc))
    if (d) setViewDoc(d)
    else setDocNotice('That document is no longer available to you.')
    setDocParams(p => { p.delete('doc'); return p }, { replace: true })
  }, [wantedDoc, docs])

  useEffect(() => {
    if (authLoading) return // CPPM-59: not known yet whether this person is signed in
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
        setAiAvailable(Boolean(d.ai_search_available))
        setSavedIds((s.saved || []).filter(x => x.item_type === 'document').map(x => x.item_id))
      } catch {
        setError('Unable to load documents.')
      }
      setLoading(false)
    }
    if (clientCode) load()
  }, [clientCode, user, language, authLoading])

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
        // CPPM-57: say so, and give the list back. Until now the button vanished
        // without a word and the question was left in the box as a title filter,
        // so the reader saw "No documents found" for a library that had documents.
        setAiUnavailable(true)
        setAiMode(false)
        setAiResults([])
        setAiError('')
        setSearch('')
        setAiNotice('AI search is not available right now. All documents are listed below — you can still search by a word from the title.')
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
    // Show the document's real version. "v2.1" was hard-coded here, so every
    // document claimed the same version regardless of what was published.
    const version = doc.version ? (/^\d/.test(doc.version) ? `v${doc.version}` : doc.version) : null
    badges.push(
      <span key="appr" style={{ background: '#DEF7EC', color: '#03543F', fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4, marginLeft: 6 }}>
        {version ? `${version} Approved` : 'Approved'}
      </span>
    )
    if (doc.created_at && (Date.now() - new Date(doc.created_at).getTime()) < 14 * 86400000) {
      badges.push(<span key="new" className="pp-badge-new" style={{ marginLeft: 4 }}>{t('New')}</span>)
    }
    if (doc.expires_at) {
      const ms = new Date(doc.expires_at).getTime() - Date.now()
      if (ms < 0) badges.push(<span key="exp" className="pp-badge-exp gone" style={{ marginLeft: 4 }}>{t('Expired')}</span>)
      else if (ms < 30 * 86400000) badges.push(<span key="exp" className="pp-badge-exp" style={{ marginLeft: 4 }}>{t('Expiring Soon')}</span>)
      else badges.push(<span key="exp-valid" style={{ background: '#F3F4F6', color: '#4B5563', fontSize: 11, padding: '2px 6px', borderRadius: 4, marginLeft: 4 }}>Valid until {new Date(doc.expires_at).toLocaleDateString()}</span>)
    }
    return badges
  }

  if (loading) return <div className="pp-container pp-page-content"><SkeletonCards count={6} /></div>
  if (error)   return <div className="pp-container pp-page-content"><div className="pp-error-state">{error}</div></div>

  return (
    <div className="pp-container pp-page-content">
      <div className="pp-page-header"><h1>{t('Document Library')}</h1></div>
      {docNotice && <div className="pp-info-box" role="status" style={{ marginBottom: 16 }}>{docNotice}</div>}

      <div className="pp-docs-search" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          placeholder={t('Search documents…')}
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
            {aiLoading ? t('Searching…') : t('Search')}
          </button>
        )}
        {aiAvailable && !aiUnavailable && (
          <button
            className="pp-btn pp-btn-outline pp-btn-sm"
            onClick={toggleAiMode}
            type="button"
          >
            {aiMode ? 'Standard Search' : 'AI Search'}
          </button>
        )}
      </div>

      {aiNotice && (
        <div role="status" style={{ margin: '8px 0 12px', padding: '10px 14px', borderRadius: 6, background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', fontSize: 13 }}>
          {aiNotice}
        </div>
      )}

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
          <div style={{ fontStyle: 'italic', color: '#4B5563', marginBottom: 12 }}>
            {t('AI-assisted results — review source documents before use')}
          </div>
          {aiError ? (
            <div className="pp-error-state">{aiError}</div>
          ) : aiLoading ? (
            <div className="pp-loading" role="status" aria-live="polite">{t('Searching…')}</div>
          ) : aiResults.length === 0 ? (
            <div className="pp-empty-state"><p>{t('No relevant documents found for your query')}</p></div>
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
                  <div style={{ fontStyle: 'italic', color: '#4B5563', marginTop: 8 }}>
                    {doc.reason || 'Matched semantically to your query.'}
                  </div>
                  {doc.is_expiring_soon && (
                    <div style={{ color: '#B45309', marginTop: 6, fontSize: 12 }}>
                      {t('Expiry warning: this document expires within 30 days')}
                    </div>
                  )}
                  <div className="pp-doc-download" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 10 }}>
                    <button
                      className="pp-btn pp-btn-outline pp-btn-sm"
                      onClick={() => handleDownload(doc)}
                      disabled={downloading === doc.id}
                      aria-label={`Download ${doc.title}`}
                    >
                      {downloading === doc.id ? 'Downloading…' : 'Download'}
                    </button>
                    <button
                      className="pp-btn pp-btn-outline pp-btn-sm"
                      onClick={() => toggleSave(doc)}
                      disabled={savingId === doc.id}
                      aria-label={savedIds.includes(doc.id) ? `Unsave ${doc.title}` : `Save ${doc.title}`}
                      style={{
                        color: savedIds.includes(doc.id) ? '#1D4ED8' : '#4B5563',
                        borderColor: savedIds.includes(doc.id) ? '#BFDBFE' : undefined,
                        background: savedIds.includes(doc.id) ? '#EFF6FF' : undefined,
                      }}
                      title={savedIds.includes(doc.id) ? 'Unsave' : 'Save'}
                    >
                      {savingId === doc.id ? '…' : (savedIds.includes(doc.id) ? 'Unsave' : 'Save')}
                    </button>
                    <AskAboutThis about={doc.title} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : filtered.length === 0 ? (
        <div className="pp-empty-state"><p>{t('No documents found.')}</p></div>
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
              <div className="pp-doc-download" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <button className="pp-btn pp-btn-outline pp-btn-sm" onClick={() => setViewDoc(doc)} aria-label={`Quick View ${doc.title}`}>
                  {t('Quick View')}
                </button>
                <button
                  className="pp-btn pp-btn-outline pp-btn-sm"
                  onClick={() => handleDownload(doc)}
                  disabled={downloading === doc.id}
                  aria-label={`Download ${doc.title}`}
                >
                  {downloading === doc.id ? 'Downloading…' : 'Download'}
                </button>
                <button
                  className="pp-btn pp-btn-outline pp-btn-sm"
                  onClick={() => toggleSave(doc)}
                  disabled={savingId === doc.id}
                  aria-label={savedIds.includes(doc.id) ? `Unsave ${doc.title}` : `Save ${doc.title}`}
                  style={{
                    color: savedIds.includes(doc.id) ? '#1D4ED8' : '#4B5563',
                    borderColor: savedIds.includes(doc.id) ? '#BFDBFE' : undefined,
                    background: savedIds.includes(doc.id) ? '#EFF6FF' : undefined,
                  }}
                  title={savedIds.includes(doc.id) ? 'Unsave' : 'Save'}
                >
                  {savingId === doc.id ? '…' : (savedIds.includes(doc.id) ? 'Unsave' : 'Save')}
                </button>
                <AskAboutThis about={doc.title} />
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
