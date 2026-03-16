import { useState, useEffect } from 'react'
import { usePortal } from '../context/PortalContext'

export default function FindMSLPage() {
  const { clientCode } = usePortal()
  const [msls, setMSLs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [region, setRegion]   = useState('')

  useEffect(() => {
    fetch(`/api/portal/content/${clientCode}/msls`)
      .then(r => r.json()).then(d => { setMSLs(d.items || []); setLoading(false) }).catch(() => setLoading(false))
  }, [clientCode])

  const regions  = [...new Set(msls.map(m => m.region).filter(Boolean))]
  const filtered = msls
    .filter(m => !region || m.region === region)
    .filter(m => !search  || m.name.toLowerCase().includes(search.toLowerCase())
      || (m.specialty || '').toLowerCase().includes(search.toLowerCase())
      || (m.territory || '').toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="pp-container pp-page-content">
      <div className="pp-page-header">
        <h1>Find a Medical Science Liaison</h1>
        <p>Connect with our MSL team for scientific exchange and medical information support.</p>
      </div>

      <div className="pp-filter-bar">
        <input className="pp-search-input" placeholder="Search by name, specialty, or territory…" value={search} onChange={e => setSearch(e.target.value)} />
        {regions.length > 0 && (
          <select value={region} onChange={e => setRegion(e.target.value)}>
            <option value="">All Regions</option>
            {regions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
      </div>

      {loading ? <div className="pp-loading">Loading…</div> : filtered.length === 0 ? (
        <div className="pp-empty-state"><span>👨‍⚕️</span><p>No MSLs found matching your search.</p></div>
      ) : (
        <div className="pp-msl-grid">
          {filtered.map(m => (
            <div key={m.id} className="pp-msl-card">
              <div className="pp-msl-avatar">{m.name.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
              <div className="pp-msl-info">
                <div className="pp-msl-name">{m.name}</div>
                {m.title     && <div className="pp-msl-title">{m.title}</div>}
                {m.specialty && <div className="pp-msl-specialty">🔬 {m.specialty}</div>}
                {m.region    && <div className="pp-msl-region">📍 {m.region}{m.territory ? ` · ${m.territory}` : ''}</div>}
                {m.email     && (
                  <a href={`mailto:${m.email}`} className="pp-msl-email">
                    ✉️ {m.email}
                  </a>
                )}
                {m.phone     && <div className="pp-msl-phone">📞 {m.phone}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
