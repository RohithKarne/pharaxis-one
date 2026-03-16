import { useState, useEffect } from 'react'
import { usePortal } from '../context/PortalContext'

export default function DrugInfoPage() {
  const { clientCode } = usePortal()
  const [drugs, setDrugs]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    fetch(`/api/portal/content/${clientCode}/drugs`)
      .then(r => r.json()).then(d => { setDrugs(d.items || []); setLoading(false) }).catch(() => setLoading(false))
  }, [clientCode])

  const filtered = drugs.filter(d =>
    !search || (d.brand_name || '').toLowerCase().includes(search.toLowerCase())
      || (d.generic_name || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="pp-container pp-page-content">
      <div className="pp-page-header">
        <h1>Drug Information</h1>
        <p>Review approved prescribing information and clinical summaries for our products.</p>
      </div>

      <div className="pp-filter-bar">
        <input className="pp-search-input" placeholder="Search by brand or generic name…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? <div className="pp-loading">Loading…</div> : (
        <div className="pp-drug-layout">
          <div className="pp-drug-index">
            {filtered.length === 0 ? (
              <div className="pp-empty-state"><span>💊</span><p>No drugs found.</p></div>
            ) : filtered.map(d => (
              <button key={d.id} className={`pp-drug-index-item ${selected?.id === d.id ? 'active' : ''}`} onClick={() => setSelected(d)}>
                <div className="pp-drug-index-brand">{d.brand_name || d.generic_name}</div>
                {d.brand_name && d.generic_name && <div className="pp-drug-index-generic">{d.generic_name}</div>}
              </button>
            ))}
          </div>
          <div className="pp-drug-detail">
            {!selected ? (
              <div className="pp-ta-placeholder"><span>💊</span><p>Select a product to view details.</p></div>
            ) : (
              <div className="pp-drug-detail-content">
                <div className="pp-drug-detail-header">
                  <h2>{selected.brand_name || selected.generic_name}</h2>
                  {selected.brand_name && selected.generic_name && <p className="pp-drug-detail-generic">{selected.generic_name}</p>}
                </div>
                {selected.indication && (
                  <div className="pp-drug-section">
                    <h4>Indication</h4>
                    <p>{selected.indication}</p>
                  </div>
                )}
                {selected.dosage_info && (
                  <div className="pp-drug-section">
                    <h4>Dosage Information</h4>
                    <p>{selected.dosage_info}</p>
                  </div>
                )}
                {selected.storage_conditions && (
                  <div className="pp-drug-section">
                    <h4>Storage Conditions</h4>
                    <p>{selected.storage_conditions}</p>
                  </div>
                )}
                {selected.contraindications && (
                  <div className="pp-drug-section pp-drug-warnings">
                    <h4>⚠️ Contraindications</h4>
                    <p>{selected.contraindications}</p>
                  </div>
                )}
                {selected.side_effects && (
                  <div className="pp-drug-section pp-drug-warnings">
                    <h4>Side Effects</h4>
                    <p>{selected.side_effects}</p>
                  </div>
                )}
                {selected.prescribing_info_url && (
                  <a href={selected.prescribing_info_url} target="_blank" rel="noopener noreferrer" className="pp-btn pp-btn-primary">
                    View Full Prescribing Information →
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
