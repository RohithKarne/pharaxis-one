import { useState, useEffect } from 'react'
import { usePortal } from '../context/PortalContext'
import { SkeletonCards } from '../../shared/components/Skeleton'
import usePageTitle from '../hooks/usePageTitle'

// LOW-15: resource_type icon map (extended)
const TYPE_ICON = {
  pdf: '📄',
  video: '🎬',
  link: '🔗',
  document: '📝',
  presentation: '📊',
  image: '🖼️',
  publication: '📄',
  other: '📎',
}

export default function ResourcesPage() {
  const { clientCode } = usePortal()
  const [resources, setResources] = useState([])
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState('')
  const [search, setSearch]       = useState('')

  usePageTitle('Resources')

  useEffect(() => {
    fetch(`/api/portal/content/${clientCode}/resources`)
      .then(r => r.json()).then(d => { setResources(d.items || []); setLoading(false) }).catch(() => setLoading(false))
  }, [clientCode])

  const types    = [...new Set(resources.map(r => r.resource_type).filter(Boolean))]
  const filtered = resources
    .filter(r => !filter || r.resource_type === filter)
    .filter(r => !search  || (r.title || '').toLowerCase().includes(search.toLowerCase()) || (r.description || '').toLowerCase().includes(search.toLowerCase()))

  // LOW-36: group by category, null/empty → 'General'
  const grouped = filtered.reduce((acc, r) => {
    const cat = r.category || 'General'
    ;(acc[cat] = acc[cat] || []).push(r)
    return acc
  }, {})
  const groupKeys = Object.keys(grouped).sort((a, b) => {
    if (a === 'General') return 1
    if (b === 'General') return -1
    return a.localeCompare(b)
  })

  return (
    <div className="pp-container pp-page-content">
      <div className="pp-page-header">
        <h1>Resources</h1>
        <p>Access approved publications, clinical data, and educational materials.</p>
      </div>

      <div className="pp-filter-bar">
        <input className="pp-search-input" placeholder="Search resources…" value={search} onChange={e => setSearch(e.target.value)} />
        <select value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">All Types</option>
          {types.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
        </select>
      </div>

      {loading ? <SkeletonCards count={4} /> : filtered.length === 0 ? (
        <div className="pp-empty-state"><span>📚</span><p>No resources found.</p></div>
      ) : (
        groupKeys.map(cat => (
          <div key={cat} className="pp-resource-group">
            <h2 className="pp-resource-group-heading">{cat}</h2>
            <div className="pp-resource-grid">
              {grouped[cat].map(r => (
                <div key={r.id} className="pp-resource-card">
                  {/* LOW-15: resource_type icon */}
                  <span className="pp-resource-icon">{TYPE_ICON[r.resource_type?.toLowerCase()] || '📎'}</span>
                  <div className="pp-resource-body">
                    <div className="pp-resource-type">{r.resource_type || 'Resource'}</div>
                    <h3 className="pp-resource-title">{r.title}</h3>
                    {r.description && <p className="pp-resource-desc">{r.description}</p>}
                  </div>
                  {(r.url || r.file_path) && (
                    <a href={r.url || r.file_path} target="_blank" rel="noopener noreferrer" className="pp-resource-link">
                      View →
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
