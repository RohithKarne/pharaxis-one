import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'

function stripHtml(html) {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, '')
}

export default function NewsPage() {
  const { clientCode }            = usePortal()
  const navigate                  = useNavigate()
  const [posts, setPosts]         = useState([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [page, setPage]           = useState(1)
  const [activeCategory, setActiveCategory] = useState('All')

  const limit = 10

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const token = localStorage.getItem('cp_portal_token')
        const res = await fetch(`/api/portal/news?clientCode=${clientCode}&page=${page}&limit=${limit}`, {
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        })
        const d = await res.json()
        setPosts(d.posts || [])
        setTotal(d.total || 0)
      } catch {
        setError('Unable to load news.')
      }
      setLoading(false)
    }
    if (clientCode) load()
  }, [clientCode, page])

  const categories = ['All', ...Array.from(new Set(posts.map(p => p.category).filter(Boolean)))]

  const filtered = activeCategory === 'All'
    ? posts
    : posts.filter(p => p.category === activeCategory)

  const totalPages = Math.ceil(total / limit)

  const base = `/portal/${clientCode}`

  if (loading) return <div className="pp-news-page"><div className="pp-loading">Loading…</div></div>
  if (error)   return <div className="pp-news-page"><div className="pp-error-state">{error}</div></div>

  return (
    <div className="pp-news-page">
      <h1 className="pp-page-header-title" style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>News &amp; Announcements</h1>

      {categories.length > 1 && (
        <div className="pp-news-filters">
          {categories.map(cat => (
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
        <div className="pp-empty-state"><p>No announcements at this time.</p></div>
      ) : (
        <div className="pp-news-grid">
          {filtered.map(post => (
            <Link
              key={post.id}
              to={`${base}/news/${post.id}`}
              className="pp-news-card"
            >
              {post.thumbnail_url
                ? <img src={post.thumbnail_url} alt={post.title} className="pp-news-card-img" />
                : <div className="pp-news-card-img-placeholder" />
              }
              <div className="pp-news-card-body">
                {post.category && <div className="pp-news-card-cat">{post.category}</div>}
                <div className="pp-news-card-title">{post.title}</div>
                <div className="pp-news-card-excerpt">
                  {stripHtml(post.body_html).slice(0, 150)}{stripHtml(post.body_html).length > 150 ? '…' : ''}
                </div>
                {post.publish_at && (
                  <div className="pp-news-card-date">
                    {new Date(post.publish_at).toLocaleDateString()}
                  </div>
                )}
              </div>
            </Link>
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
