import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import DOMPurify from 'dompurify'
import { usePortal } from '../context/PortalContext'
import usePageTitle from '../hooks/usePageTitle'
import { formatLongDate } from '../../shared/utils/datetime'

export default function NewsDetailPage() {
  const { postId }              = useParams()
  const navigate                = useNavigate()
  const { clientCode, language } = usePortal()
  const [post, setPost]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  usePageTitle(post?.title || 'News')

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const headers = { 'Content-Type': 'application/json' }
        const langParam = language && language !== 'en' ? `&lang=${language}` : ''
        const res = await fetch(`/api/portal/news/${postId}?clientCode=${clientCode}${langParam}`, { headers })
        const d = await res.json()
        if (!res.ok) { setError(d.error || 'Post not found.'); setLoading(false); return }
        setPost(d.post || d)
        // increment view count once per page load
        fetch(`/api/portal/news/${clientCode}/posts/${postId}/view`, { method: 'POST', headers }).catch(() => {})
      } catch {
        setError('Unable to load article.')
      }
      setLoading(false)
    }
    if (clientCode && postId) load()
  }, [clientCode, postId, language])

  if (loading) return <div className="pp-article-page"><div className="pp-loading">Loading…</div></div>
  if (error)   return <div className="pp-article-page"><div className="pp-error-state">{error}</div></div>
  if (!post)   return null

  return (
    <div className="pp-article-page">
      <button onClick={() => navigate(-1)} className="pp-back-btn">← Back to News</button>

      {post.category && <div className="pp-article-cat">{post.category}</div>}
      <h1 className="pp-article-title">{post.title}</h1>
      {post.publish_at && (
        <div className="pp-article-date">{formatLongDate(post.publish_at)}</div>
      )}
      {post.thumbnail_url && (
        <img src={post.thumbnail_url} alt={post.title} className="pp-article-img" loading="lazy" />
      )}
      {post.body_html && (
        <div className="pp-article-body" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.body_html) }} />
      )}
    </div>
  )
}
