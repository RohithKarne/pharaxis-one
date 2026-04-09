import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'

export default function TherapeuticAreasPage() {
  const { clientCode } = usePortal()
  const [areas, setAreas]   = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [drugs, setDrugs]   = useState([])
  const [drugsLoading, setDrugsLoading] = useState(false)

  // LOW-05: set document title
  useEffect(() => { document.title = 'Therapeutic Areas | CP Portal'; return () => { document.title = 'CP Portal'; }; }, [])

  useEffect(() => {
    fetch(`/api/portal/content/${clientCode}/therapeutic-areas`)
      .then(r => r.json()).then(d => { setAreas(d.items || []); setLoading(false) }).catch(() => setLoading(false))
  }, [clientCode])

  async function selectArea(area) {
    setSelected(area)
    setDrugsLoading(true)
    const res = await fetch(`/api/portal/content/${clientCode}/drugs?therapeutic_area_id=${area.id}`)

    const d   = await res.json()
    setDrugs(d.items || [])
    setDrugsLoading(false)
  }

  return (
    <div className="pp-container pp-page-content">
      <div className="pp-page-header">
        <h1>Therapeutic Areas</h1>
        <p>Explore our scientific and medical focus areas.</p>
      </div>

      {loading ? <div className="pp-loading">Loading…</div> : areas.length === 0 ? (
        <div className="pp-empty-state"><span>🧬</span><p>No therapeutic areas published yet.</p></div>
      ) : (
        <div className="pp-ta-layout">
          <div className="pp-ta-list">
            {areas.map(a => (
              <button key={a.id} className={`pp-ta-item ${selected?.id === a.id ? 'pp-ta-item-active' : ''}`} onClick={() => selectArea(a)}>
                <div className="pp-ta-item-title">{a.name}</div>
                {a.description && <div className="pp-ta-item-desc">{a.description.slice(0, 80)}{a.description.length > 80 ? '…' : ''}</div>}
              </button>
            ))}
          </div>
          <div className="pp-ta-detail">
            {!selected ? (
              <div className="pp-ta-placeholder"><span>🧬</span><p>Select a therapeutic area to explore.</p></div>
            ) : (
              <>
                {selected.image_url && <img src={selected.image_url} alt={selected.name} className="pp-ta-image" loading="lazy" />}
                <h2 className="pp-ta-detail-title">{selected.name}</h2>
                {selected.description && <p className="pp-ta-detail-desc">{selected.description}</p>}
                {selected.overview    && <div className="pp-ta-overview">{selected.overview}</div>}
                {drugsLoading ? <div className="pp-loading">Loading products…</div> : drugs.length > 0 && (
                  <div className="pp-ta-drugs">
                    <h3>Products in this area</h3>
                    <div className="pp-drug-cards">
                      {drugs.map(d => (
                        <div key={d.id} className="pp-drug-card">
                          <div className="pp-drug-name">{d.brand_name || d.generic_name}</div>
                          {d.brand_name && d.generic_name && <div className="pp-drug-generic">{d.generic_name}</div>}
                          {d.indication && <p className="pp-drug-indication">{d.indication}</p>}
                          {d.approval_status && <span className="pp-drug-badge">{d.approval_status}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
