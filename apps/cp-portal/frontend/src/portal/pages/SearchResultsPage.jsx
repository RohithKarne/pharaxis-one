import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'
import usePageTitle from '../hooks/usePageTitle'

export default function SearchResultsPage() {
  const { clientCode, user, t } = usePortal()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const q = params.get('q') || ''
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [typeFilter, setTypeFilter] = useState('all')

  usePageTitle(t('Search'))

  useEffect(() => {
    // CPPM-25: search is for signed-in users only, so results can respect audience.
    if (!user || !clientCode || q.trim().length < 2) { setResults([]); return }
    setLoading(true)
    fetch(`/api/portal/search?clientCode=${clientCode}&q=${encodeURIComponent(q)}`)
      .then(r => r.ok ? r.json() : { results: [] })
      .then(d => setResults(d.results || []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false))
  }, [clientCode, q, user])

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
    <div className="pp-container pp-page-content pp-page-narrow">
      <div className="pp-page-header">
        <h1>{t('Search')}</h1>
        <p>{q ? <>{t('Results for “')}<strong>{q}</strong>”</> : 'Enter a search term.'}</p>
      </div>

      {!user ? (
        <div className="pp-empty-state" style={{ textAlign: 'left' }}>
          <p style={{ marginBottom: 12 }}>{t('Sign in to search medical information, documents and news.')}</p>
          <Link to={`${base}/login`} className="pp-btn pp-btn-primary">{t('Sign In')}</Link>
        </div>
      ) : loading ? <div className="pp-loading">{t('Searching…')}</div> : (
        results.length === 0 ? (
          <div style={{ color: '#4B5563', fontSize: 14 }}>{q.trim().length >= 2 ? 'No results found.' : 'Type at least 2 characters.'}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {facets.length > 1 && (
              <div className="pp-sev-filter" role="group" aria-label={t('Filter results by type')}>
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
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--pp-primary, #6B3FA0)', fontWeight: 700 }}>{r.label}</span>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: 15, color: '#1A1A2E', margin: '2px 0' }}>{r.title}</span>
                  {r.snippet && <span style={{ display: 'block', fontSize: 13, color: '#4B5563' }}>{r.snippet}</span>}
                </span>
              </button>
            ))}
          </div>
        )
      )}
    </div>
  )
}
