import { useState, useEffect } from 'react'
import { usePortal } from '../context/PortalContext'

const RESOURCE_ICONS = { publication: '📄', document: '📑', video: '🎥', link: '🔗', other: '📎' }

export default function ResourcesPage() {
  const { clientCode } = usePortal()
  const [resources, setResources] = useState([])
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState('')
  const [search, setSearch]       = useState('')

  useEffect(() => {
    fetch(`/api/portal/content/${clientCode}/resources`)
      .then(r => r.json()).then(d => { setResources(d.items || []); setLoading(false) }).catch(() => setLoading(false))
  }, [clientCode])

  const types    = [...new Set(resources.map(r => r.resource_type).filter(Boolean))]
  const filtered = resources
    .filter(r => !filter || r.resource_type === filter)
    .filter(r => !search  || r.title.toLowerCase().includes(search.toLowerCase()) || (r.description || '').toLowerCase().includes(search.toLowerCase()))

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

      {loading ? <div className="pp-loading">Loading…</div> : filtered.length === 0 ? (
        <div className="pp-empty-state"><span>📚</span><p>No resources found.</p></div>
      ) : (
        <div className="pp-resource-grid">
          {filtered.map(r => (
            <div key={r.id} className="pp-resource-card">
              <div className="pp-resource-icon">{RESOURCE_ICONS[r.resource_type] || '📎'}</div>
              <div className="pp-resource-body">
                <div className="pp-resource-type">{r.resource_type || 'Resource'}</div>
                <h3 className="pp-resource-title">{r.title}</h3>
                {r.description && <p className="pp-resource-desc">{r.description}</p>}
                {r.category    && <span className="pp-resource-year">{r.category}</span>}
              </div>
              {(r.url || r.file_path) && (
                <a href={r.url || r.file_path} target="_blank" rel="noopener noreferrer" className="pp-resource-link">
                  View →
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
