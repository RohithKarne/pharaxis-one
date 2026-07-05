import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'
import usePageTitle from '../hooks/usePageTitle'

export default function SavedItemsPage() {
  const { clientCode, user } = usePortal()
  const navigate = useNavigate()
  const [tab, setTab] = useState('news')
  const [saved, setSaved] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [unsaving, setUnsaving] = useState(null)

  const base = `/portal/${clientCode}`

  usePageTitle('Saved Items')

  useEffect(() => {
    if (!user) return
    async function load() {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(`/api/portal/saved?clientCode=${clientCode}`)
        const d = await res.json()
        setSaved(d.saved || [])
      } catch {
        setError('Unable to load saved items.')
      }
      setLoading(false)
    }
    if (clientCode) load()
  }, [clientCode, user])

  async function handleUnsave(item) {
    if (unsaving === item.id) return
    setUnsaving(item.id)
    try {
      const res = await fetch('/api/portal/saved', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientCode, item_type: item.item_type, item_id: item.item_id }),
      })
      if (!res.ok) { setError('Unable to remove item. Please try again.'); return }
      setSaved(prev => prev.filter(s => s.id !== item.id))
    } catch {
      setError('Unable to remove item. Please try again.')
    } finally {
      setUnsaving(null)
    }
  }

  if (!user) {
    return (
      <div className="pp-docs-page">
        <div className="pp-empty-state">
          <span style={{ fontSize: 32 }}>🔖</span>
          <p style={{ marginTop: 12, color: '#6B7280', fontSize: 15 }}>
            <Link to={`${base}/login`} className="pp-btn pp-btn-outline" style={{ marginLeft: 0 }}>Sign in</Link>
            {' '}to save items for quick access.
          </p>
        </div>
      </div>
    )
  }

  const newsItems     = saved.filter(s => s.item_type === 'news')
  const documentItems = saved.filter(s => s.item_type === 'document')
  const tabItems      = tab === 'news' ? newsItems : documentItems

  return (
    <div className="pp-docs-page">
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 20 }}>Saved Items</h1>

      {/* Tabs */}
      <div className="pp-news-filters" style={{ marginBottom: 20 }}>
        <button
          className={`pp-filter-btn ${tab === 'news' ? 'active' : ''}`}
          onClick={() => setTab('news')}
        >
          News ({newsItems.length})
        </button>
        <button
          className={`pp-filter-btn ${tab === 'documents' ? 'active' : ''}`}
          onClick={() => setTab('documents')}
        >
          Documents ({documentItems.length})
        </button>
      </div>

      {loading ? (
        <div className="pp-loading" role="status" aria-live="polite">Loading…</div>
      ) : error ? (
        <div className="pp-error-state">{error}</div>
      ) : tabItems.length === 0 ? (
        <div className="pp-empty-state">
          <span style={{ fontSize: 32 }}>🔖</span>
          <p style={{ marginTop: 8 }}>No saved {tab} yet.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tabItems.map(item => (
            <div key={item.id} style={{
              background: '#fff',
              border: '1px solid #E2E8F0',
              borderRadius: 10,
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
                    background: item.item_type === 'news' ? '#DBEAFE' : '#F3F4F6',
                    color: item.item_type === 'news' ? '#1D4ED8' : '#374151',
                    padding: '2px 8px', borderRadius: 99,
                  }}>
                    {item.item_type === 'news' ? '📰 News' : '📁 Document'}
                  </span>
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#1E293B', marginBottom: 2 }}>
                  {item.title || 'Untitled'}
                </div>
                <div style={{ fontSize: 12, color: '#94A3B8' }}>
                  Saved {item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                {item.item_type === 'news' ? (
                  <Link
                    to={`${base}/news/${item.item_id}`}
                    className="pp-btn pp-btn-outline pp-btn-sm"
                  >
                    Go to item →
                  </Link>
                ) : (
                  <Link
                    to={`${base}/documents`}
                    className="pp-btn pp-btn-outline pp-btn-sm"
                  >
                    Go to item →
                  </Link>
                )}
                <button
                  className="pp-btn pp-btn-outline pp-btn-sm"
                  style={{ color: '#DC2626', borderColor: '#FCA5A5' }}
                  onClick={() => handleUnsave(item)}
                  disabled={unsaving === item.id}
                  aria-label={`Remove ${item.title} from saved items`}
                >
                  {unsaving === item.id ? '…' : '🔖 Unsave'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
