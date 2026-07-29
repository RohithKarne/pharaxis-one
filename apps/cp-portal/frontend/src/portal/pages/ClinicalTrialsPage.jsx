import { useState, useEffect } from 'react'
import { usePortal } from '../context/PortalContext'
import { SkeletonCards } from '../../shared/components/Skeleton'

export default function ClinicalTrialsPage() {
  const { clientCode } = usePortal()
  const [trials, setTrials]   = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [referredId, setReferredId] = useState(null)

  useEffect(() => {
    fetch(`/api/portal/content/${clientCode}/trials`)
      .then(r => r.json())
      .then(d => { setTrials(d.items || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [clientCode])

  const filtered = trials.filter(t =>
    !search || t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.indication.toLowerCase().includes(search.toLowerCase()) ||
    t.nct_id.toLowerCase().includes(search.toLowerCase())
  )

  function handleReferral(trial) {
    setReferredId(trial.id)
    setTimeout(() => setReferredId(null), 3000)
  }

  return (
    <div className="pp-container pp-page-content" style={{ padding: '24px 0' }}>
      <div className="pp-page-header" style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1A1A2E' }}>Clinical Trials & Real-World Evidence</h1>
        <p style={{ color: '#6B7280', fontSize: 14 }}>Browse active clinical trials, eligibility criteria, and submit patient referrals directly to study sites.</p>
      </div>

      <div className="pp-filter-bar" style={{ marginBottom: 20 }}>
        <input
          className="pp-search-input"
          placeholder="Search by trial NCT ID, indication, or title…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', maxWidth: 480, padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E7EB' }}
        />
      </div>

      {loading ? <SkeletonCards count={3} /> : filtered.length === 0 ? (
        <div className="pp-empty-state"><span>🔬</span><p>No active clinical trials match your query.</p></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {filtered.map(trial => (
            <div key={trial.id} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 18, boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ background: '#E0E7FF', color: '#3730A3', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 12 }}>{trial.phase}</span>
                <span style={{ background: trial.status === 'Recruiting' ? '#DEF7EC' : '#F3F4F6', color: trial.status === 'Recruiting' ? '#03543F' : '#374151', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 12 }}>
                  {trial.status}
                </span>
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1A1A2E', margin: '4px 0 8px' }}>{trial.title}</h3>
              <div style={{ fontSize: 13, color: '#4B5563', marginBottom: 4 }}><strong>NCT ID:</strong> {trial.nct_id}</div>
              <div style={{ fontSize: 13, color: '#4B5563', marginBottom: 4 }}><strong>Indication:</strong> {trial.indication}</div>
              <div style={{ fontSize: 13, color: '#4B5563', marginBottom: 4 }}><strong>Locations:</strong> {trial.site_location}</div>
              <div style={{ fontSize: 13, color: '#4B5563', marginBottom: 14 }}><strong>Principal Investigator:</strong> {trial.pi}</div>
              
              <button
                className="pp-btn pp-btn-primary"
                onClick={() => handleReferral(trial)}
                style={{ width: '100%', padding: '8px 12px', fontSize: 13, fontWeight: 600, background: 'var(--pp-primary, #0284c7)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
              >
                {referredId === trial.id ? '✓ Patient Referral Initiated' : '1-Click Patient Referral'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
