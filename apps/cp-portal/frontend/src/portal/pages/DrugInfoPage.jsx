import { useState, useEffect } from 'react'
import { usePortal } from '../context/PortalContext'
import Icon from '../../shared/components/Icon'

const COMPARE_ROWS = [
  { key: 'indication',         label: 'Indication' },
  { key: 'dosage_info',        label: 'Dosage' },
  { key: 'contraindications',  label: 'Contraindications' },
  { key: 'side_effects',       label: 'Side effects' },
  { key: 'storage_conditions', label: 'Storage' },
]

export default function DrugInfoPage() {
  const { clientCode } = usePortal()
  const [drugs, setDrugs]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState(null)
  const [compareList, setCompareList] = useState([])
  const [showCompare, setShowCompare] = useState(false)

  function toggleCompare(id) {
    setCompareList(prev => prev.includes(id) ? prev.filter(x => x !== id) : (prev.length >= 3 ? prev : [...prev, id]))
  }
  const compareDrugs = drugs.filter(d => compareList.includes(d.id))

  // LOW-05: set document title
  useEffect(() => { document.title = 'Drug Information | CP Portal'; return () => { document.title = 'CP Portal'; }; }, [])

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

      {compareList.length > 0 && (
        <div className="pp-compare-bar">
          <span><strong>{compareList.length}</strong> selected to compare{compareList.length < 2 ? ' (pick at least 2)' : ''}</span>
          <button className="pp-btn pp-btn-primary pp-btn-sm" onClick={() => setShowCompare(true)} disabled={compareList.length < 2}>Compare</button>
          <button className="pp-btn pp-btn-outline pp-btn-sm" onClick={() => setCompareList([])}>Clear</button>
        </div>
      )}

      {loading ? <div className="pp-loading">Loading…</div> : (
        <div className="pp-drug-layout">
          <div className="pp-drug-index">
            {filtered.length === 0 ? (
              <div className="pp-empty-state"><span><Icon name="pill" size={40} /></span><p>No drugs found.</p></div>
            ) : filtered.map(d => (
              <div key={d.id} className="pp-drug-index-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={compareList.includes(d.id)}
                  onChange={() => toggleCompare(d.id)}
                  disabled={!compareList.includes(d.id) && compareList.length >= 3}
                  aria-label={`Add ${d.brand_name || d.generic_name} to comparison`}
                  title="Add to comparison"
                  style={{ flex: 'none' }}
                />
                <button className={`pp-drug-index-item ${selected?.id === d.id ? 'active' : ''}`} onClick={() => setSelected(d)} style={{ flex: 1, textAlign: 'left' }}>
                  <div className="pp-drug-index-brand">{d.brand_name || d.generic_name}</div>
                  {d.brand_name && d.generic_name && <div className="pp-drug-index-generic">{d.generic_name}</div>}
                </button>
              </div>
            ))}
          </div>
          <div className="pp-drug-detail">
            {!selected ? (
              <div className="pp-ta-placeholder"><span><Icon name="pill" size={40} /></span><p>Select a product to view details, or tick products to compare.</p></div>
            ) : (
              <div className="pp-drug-detail-content">
                {selected.image_url && <img src={selected.image_url} alt={selected.brand_name} className="pp-drug-image" loading="lazy" />}
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

      {showCompare && compareDrugs.length >= 2 && (
        <div className="pp-pdf-overlay" onClick={() => setShowCompare(false)} role="dialog" aria-modal="true" aria-label="Compare products">
          <div className="pp-compare-modal" onClick={e => e.stopPropagation()}>
            <div className="pp-compare-head">
              <b>Compare products</b>
              <button type="button" onClick={() => setShowCompare(false)}>Close</button>
            </div>
            <div className="pp-compare-scroll">
              <table className="pp-compare-table">
                <thead>
                  <tr>
                    <th className="pp-compare-attr"></th>
                    {compareDrugs.map(d => (
                      <th key={d.id}>
                        {d.brand_name || d.generic_name}
                        {d.brand_name && d.generic_name && <div className="pp-compare-generic">{d.generic_name}</div>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPARE_ROWS.map(row => (
                    <tr key={row.key}>
                      <th className="pp-compare-attr">{row.label}</th>
                      {compareDrugs.map(d => <td key={d.id}>{d[row.key] || '—'}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
