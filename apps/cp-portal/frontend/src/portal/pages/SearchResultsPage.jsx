import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'

const TYPE_ICON = { news: '📰', safety: '⚠️', faq: '❓', ta: '🧬', drug: '💊', resource: '📚', document: '📁' }

export default function SearchResultsPage() {
  const { clientCode } = usePortal()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const q = params.get('q') || ''
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [typeFilter, setTypeFilter] = useState('all')

  useEffect(() => {
    document.title = 'Search | CP Portal'
    return () => { document.title = 'CP Portal' }
  }, [])

  useEffect(() => {
    if (!clientCode || q.trim().length < 2) { setResults([]); return }
    setLoading(true)
    fetch(`/api/portal/search?clientCode=${clientCode}&q=${encodeURIComponent(q)}`)
      .then(r => r.ok ? r.json() : { results: [] })
      .then(d => setResults(d.results || []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }, [clientCode, q])

  const base = `/portal/${clientCode}`

  // Facets: distinct types present in the results, with counts.
  const facets = []
  const seen = {}
  results.forEach(r => {
    if (!seen[r.type]) { seen[r.type] = { type: r.type, label: r.label, count: 0 }; facets.push(seen[r.type]) }
    seen[r.type].count++
  })
  const filtered = typeFilter === 'all' ? results : results.filter(r => r.type === typeFilter)

  return (
    <div className="pp-container" style={{ maxWidth: 760, paddingTop: 32, paddingBottom: 60 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Search</h1>
      <p style={{ color: '#6B7280', fontSize: 14, marginBottom: 20 }}>
        {q ? <>Results for “<strong>{q}</strong>”</> : 'Enter a search term.'}
      </p>

      {loading ? <div className="pp-loading">Searching…</div> : (
        results.length === 0 ? (
          <div style={{ color: '#6B7280', fontSize: 14 }}>{q.trim().length >= 2 ? 'No results found.' : 'Type at least 2 characters.'}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {facets.length > 1 && (
              <div className="pp-sev-filter" role="group" aria-label="Filter results by type">
                <button className={`pp-sev-chip${typeFilter === 'all' ? ' on' : ''}`} onClick={() => setTypeFilter('all')}>All ({results.length})</button>
                {facets.map(f => (
                  <button key={f.type} className={`pp-sev-chip${typeFilter === f.type ? ' on' : ''}`} onClick={() => setTypeFilter(f.type)}>{f.label} ({f.count})</button>
                ))}
              </div>
            )}
            {filtered.map((r, i) => (
              <button
                key={`${r.type}-${r.id}-${i}`}
                onClick={() => navigate(`${base}/${r.path}`)}
                style={{
                  textAlign: 'left', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10,
                  padding: '14px 16px', cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'flex-start',
                }}
              >
                <span style={{ fontSize: 20 }}>{TYPE_ICON[r.type] || '🔎'}</span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--pp-primary, #6B3FA0)', fontWeight: 700 }}>{r.label}</span>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: 15, color: '#1A1A2E', margin: '2px 0' }}>{r.title}</span>
                  {r.snippet && <span style={{ display: 'block', fontSize: 13, color: '#6B7280' }}>{r.snippet}</span>}
                </span>
              </button>
            ))}
          </div>
        )
      )}
    </div>
  )
}
