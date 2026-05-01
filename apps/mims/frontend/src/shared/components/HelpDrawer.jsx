/**
 * HelpDrawer.jsx — In-App Help Slide-Over Drawer (S21-2)
 *
 * Features:
 *  - Slides in from the right over the page content
 *  - Contextual: fetches articles for the current feature_key via useHelpKey
 *  - Search bar (debounced 300ms) — switches to search results; clear returns to contextual
 *  - Each article expands inline (accordion)
 *  - CSS namespace: hd-
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import DOMPurify from 'dompurify'
import useHelpKey from '../hooks/useHelpKey'
import './HelpDrawer.css'
import { httpFetch } from '../api/httpFetch.js'

const API = '/api'

function useToken() {
  try {
    const storageKeys = ['mims_token', 'mimsdev_token', 'cp_token']
    for (const k of storageKeys) {
      const t = localStorage.getItem(k)
      if (t) return t
    }
  } catch (_) {}
  return null
}

function stripHtml(html) {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

// ── Single Article accordion item ────────────────────────────────────────────
function ArticleItem({ article }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className={`hd-article${expanded ? ' hd-article--open' : ''}`}>
      <button
        className="hd-article-header"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
      >
        <span className="hd-article-title">{article.title}</span>
        <span className="hd-article-chevron">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div
          className="hd-article-body"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.content_html || '') }}
        />
      )}
    </div>
  )
}

// ── Main Drawer ───────────────────────────────────────────────────────────────
export default function HelpDrawer({ open, onClose }) {
  const { featureKey, featureGroup } = useHelpKey()
  const token = useToken()

  const [articles, setArticles]   = useState([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [query, setQuery]         = useState('')
  const [searchResults, setSearchResults] = useState(null) // null = not searching
  const [searchLoading, setSearchLoading] = useState(false)

  const debounceRef = useRef(null)

  // ── Fetch contextual articles ─────────────────────────────────────────────
  const fetchContextual = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (featureKey)   params.set('feature_key', featureKey)
      if (featureGroup) params.set('feature_group', featureGroup)
      const res = await httpFetch(`${API}/help?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to load help content.')
      const data = await res.json()
      setArticles(data.articles || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [featureKey, featureGroup, token])

  useEffect(() => {
    if (open) {
      setQuery('')
      setSearchResults(null)
      fetchContextual()
    }
  }, [open, fetchContextual])

  // ── Debounced search ──────────────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!query.trim()) {
      setSearchResults(null)
      return
    }

    debounceRef.current = setTimeout(async () => {
      if (!token) return
      setSearchLoading(true)
      try {
        const res = await httpFetch(`${API}/help/search?q=${encodeURIComponent(query)}&limit=10`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const data = await res.json()
        setSearchResults(data.articles || [])
      } catch (_) {
        setSearchResults([])
      } finally {
        setSearchLoading(false)
      }
    }, 300)

    return () => clearTimeout(debounceRef.current)
  }, [query, token])

  const displayArticles = searchResults !== null ? searchResults : articles
  const isSearching     = searchResults !== null

  if (!open) return null

  return (
    <>
      <div className="hd-overlay" onClick={onClose} aria-hidden="true" />
      <aside className="hd-drawer" role="dialog" aria-label="Help" aria-modal="true">
        {/* Header */}
        <div className="hd-header">
          <div className="hd-header-left">
            <span className="hd-help-icon">❓</span>
            <span className="hd-header-title">Help</span>
          </div>
          <button className="hd-close" onClick={onClose} aria-label="Close help">✕</button>
        </div>

        {/* Context label */}
        <div className="hd-context-label">
          {isSearching
            ? `Search results for "${query}"`
            : featureKey
              ? `Showing help for: ${featureKey.replace(/\./g, ' › ')}`
              : 'General help'
          }
        </div>

        {/* Search bar */}
        <div className="hd-search-wrap">
          <input
            className="hd-search"
            type="text"
            placeholder="Search help articles…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Search help"
          />
          {query && (
            <button className="hd-search-clear" onClick={() => setQuery('')} aria-label="Clear search">
              ✕
            </button>
          )}
        </div>

        {/* Body */}
        <div className="hd-body">
          {(loading || searchLoading) && (
            <div className="hd-loading">Loading…</div>
          )}
          {error && !loading && (
            <div className="hd-error">{error}</div>
          )}
          {!loading && !searchLoading && !error && displayArticles.length === 0 && (
            <div className="hd-empty">
              {isSearching
                ? 'No articles found. Try different keywords.'
                : 'No help articles available for this section yet.'
              }
            </div>
          )}
          {!loading && !searchLoading && displayArticles.map(art => (
            <ArticleItem key={art.id} article={art} />
          ))}
        </div>

        {/* Footer */}
        <div className="hd-footer">
          <span className="hd-footer-text">
            Can't find what you need? Contact your admin.
          </span>
        </div>
      </aside>
    </>
  )
}
