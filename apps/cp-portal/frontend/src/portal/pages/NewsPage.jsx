import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'
import { SkeletonCards } from '../../shared/components/Skeleton'
import usePageTitle from '../hooks/usePageTitle'
import { formatDate } from '../../shared/utils/datetime'

async function fetchSavedIds(clientCode) {
  try {
    // Auth rides the same-origin session cookie (fetch sends it by default);
    // there is no stored bearer token. Only called for signed-in users.
    const res = await fetch(`/api/portal/saved?clientCode=${clientCode}`)
    if (!res.ok) return []
    const d = await res.json()
    return (d.saved || []).filter(s => s.item_type === 'news').map(s => s.item_id)
  } catch { return [] }
}

function stripHtml(html) {
  if (!html) return ''
  return html
    .replace(/<\/(p|div|li|h[1-6])[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim()
}

export default function NewsPage() {
  const { clientCode, user, language } = usePortal()
  const navigate                  = useNavigate()
  const [posts, setPosts]         = useState([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [page, setPage]           = useState(1)
  const [activeCategory, setActiveCategory] = useState('All')
  const [allCategories, setAllCategories]   = useState([])
  const [search, setSearch]       = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [savedIds, setSavedIds]   = useState([])
  const [savingId, setSavingId]   = useState(null)

  const limit = 10

  usePageTitle('News')

  // Debounce the search box, and reset to page 1 whenever the query changes,
  // so search runs server-side across the whole archive (not just the loaded page).
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [search])

  // Load saved news IDs for the logged-in user
  useEffect(() => {
    if (user && clientCode) {
      fetchSavedIds(clientCode).then(ids => setSavedIds(ids))
    }
  }, [user, clientCode])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const categoryParam = activeCategory !== 'All' ? `&category=${encodeURIComponent(activeCategory)}` : ''
        const langParam = language && language !== 'en' ? `&lang=${language}` : ''
        const searchParam = debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : ''
        const res = await fetch(`/api/portal/news?clientCode=${clientCode}&page=${page}&limit=${limit}${categoryParam}${langParam}${searchParam}`, {
          headers: { 'Content-Type': 'application/json' },
        })
        const d = await res.json()
        setPosts(d.posts || [])
        setTotal(d.total || 0)
        // PERF-02: preserve allCategories across page changes — only update when response has data
        if (d.allCategories?.length) setAllCategories(d.allCategories)
      } catch {
        setError('Unable to load news.')
      }
      setLoading(false)
    }
    if (clientCode) load()
  }, [clientCode, page, activeCategory, language, debouncedSearch])

  const categories = ['All', ...allCategories]

  // Search and category are both server-side now — render what the server returned.
  const filtered = posts

  const totalPages = Math.ceil(total / limit)

  const base = `/portal/${clientCode}`

  async function toggleSave(e, post) {
    e.preventDefault()
    if (!user || savingId === post.id) return
    setSavingId(post.id)
    const isSaved = savedIds.includes(post.id)
    // Optimistic update, reverted below if the request fails.
    setSavedIds(prev => isSaved ? prev.filter(id => id !== post.id) : [...prev, post.id])
    try {
      const res = await fetch('/api/portal/saved', {
        method: isSaved ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientCode, item_type: 'news', item_id: post.id }),
      })
      if (!res.ok) throw new Error('save failed')
    } catch {
      // Revert the optimistic change so UI stays in sync with the server.
      setSavedIds(prev => isSaved ? [...prev, post.id] : prev.filter(id => id !== post.id))
    } finally {
      setSavingId(null)
    }
  }

  if (loading) return <div className="pp-news-page"><SkeletonCards count={4} /></div>
  if (error)   return <div className="pp-news-page"><div className="pp-error-state">{error}</div></div>

  return (
    <div className="pp-news-page">
      <h1 className="pp-page-header-title" style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>News &amp; Announcements</h1>

      <div className="pp-docs-search" style={{ marginBottom: 12 }}>
        <input
          placeholder="Search news…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search news"
        />
      </div>

      {categories.length > 1 && (
        <div className="pp-news-filters">
          {categories.map(cat => (
            <button
              key={cat}
              className={`pp-filter-btn ${activeCategory === cat ? 'active' : ''}`}
              aria-pressed={activeCategory === cat}
              onClick={() => { setActiveCategory(cat); setPage(1) }}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="pp-empty-state"><p>No announcements at this time.</p></div>
      ) : (
        <div className="pp-news-grid" role="list">
          {filtered.map(post => (
            <div key={post.id} style={{ position: 'relative' }} role="listitem">
              <Link
                to={`${base}/news/${post.id}`}
                className="pp-news-card"
              >
                {post.thumbnail_url
                  ? <img src={post.thumbnail_url} alt={post.title} className="pp-news-card-img" loading="lazy" />
                  : <div className="pp-news-card-img-placeholder" />
                }
                <div className="pp-news-card-body">
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    {post.is_pinned ? <span style={{ fontSize: 11, background: '#DBEAFE', color: '#1E40AF', padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>📌 Pinned</span> : null}
                    {post.category && <div className="pp-news-card-cat">{post.category}</div>}
                  </div>
                  <div className="pp-news-card-title">{post.title}</div>
                  <div className="pp-news-card-excerpt">
                    {stripHtml(post.body_html).slice(0, 150)}{stripHtml(post.body_html).length > 150 ? '…' : ''}
                  </div>
                  {post.publish_at && (
                    <div className="pp-news-card-date">
                      {formatDate(post.publish_at)}
                    </div>
                  )}
                </div>
              </Link>
              {user && (
                <button
                  style={{
                    position: 'absolute', top: 10, right: 10,
                    background: savedIds.includes(post.id) ? '#DBEAFE' : 'rgba(255,255,255,0.9)',
                    border: '1px solid #E2E8F0', borderRadius: 6,
                    padding: '4px 8px', cursor: 'pointer', fontSize: 14,
                    color: savedIds.includes(post.id) ? '#1D4ED8' : '#6B7280',
                    lineHeight: 1,
                  }}
                  onClick={e => toggleSave(e, post)}
                  disabled={savingId === post.id}
                  aria-label={savedIds.includes(post.id) ? `Unsave ${post.title}` : `Save ${post.title}`}
                  title={savedIds.includes(post.id) ? 'Unsave' : 'Save'}
                >
                  🔖
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="pp-news-pagination">
          <button className="pp-btn pp-btn-outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Previous</button>
          <span style={{ fontSize: 13, color: '#6B7280', alignSelf: 'center' }}>Page {page} of {totalPages}</span>
          <button className="pp-btn pp-btn-outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  )
}
