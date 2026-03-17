import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import DOMPurify from 'dompurify'
import { usePortal } from '../context/PortalContext'

export default function NewsDetailPage() {
  const { postId }              = useParams()
  const { clientCode }          = usePortal()
  const [post, setPost]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  const base = `/portal/${clientCode}`

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const token = localStorage.getItem('cp_portal_token')
        const res = await fetch(`/api/portal/news/${postId}?clientCode=${clientCode}`, {
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        })
        const d = await res.json()
        if (!res.ok) { setError(d.error || 'Post not found.'); setLoading(false); return }
        setPost(d.post || d)
      } catch {
        setError('Unable to load article.')
      }
      setLoading(false)
    }
    if (clientCode && postId) load()
  }, [clientCode, postId])

  if (loading) return <div className="pp-article-page"><div className="pp-loading">Loading…</div></div>
  if (error)   return <div className="pp-article-page"><div className="pp-error-state">{error}</div></div>
  if (!post)   return null

  return (
    <div className="pp-article-page">
      <Link to={`${base}/news`} className="pp-article-back">← Back to News</Link>

      {post.category && <div className="pp-article-cat">{post.category}</div>}
      <h1 className="pp-article-title">{post.title}</h1>
      {post.publish_at && (
        <div className="pp-article-date">{new Date(post.publish_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</div>
      )}
      {post.thumbnail_url && (
        <img src={post.thumbnail_url} alt={post.title} className="pp-article-img" />
      )}
      {post.body_html && (
        <div className="pp-article-body" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.body_html) }} />
      )}
    </div>
  )
}
