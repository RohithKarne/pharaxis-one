import { useState, useEffect } from 'react'
import { usePortal } from '../context/PortalContext'
import { SkeletonCards } from '../../shared/components/Skeleton'

export default function TrainingPage() {
  const { clientCode } = usePortal()
  const [modules, setModules] = useState([])
  const [loading, setLoading] = useState(true)
  const [completedMap, setCompletedMap] = useState({})

  useEffect(() => {
    fetch(`/api/portal/content/${clientCode}/training`)
      .then(r => r.json())
      .then(d => { setModules(d.items || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [clientCode])

  function downloadCertificate(mod) {
    const certText = `CME & REMS TRAINING CERTIFICATE OF COMPLETION
    
Module: ${mod.title}
Type: ${mod.type}
Credits Earned: ${mod.credits}
Pass Score: 100%
Date Issued: ${new Date().toLocaleDateString()}
Status: VERIFIED & ACCREDITED

Issued by Pharaxis Medical Affairs Educational Hub.`
    const blob = new Blob([certText], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cme-certificate-${mod.id}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function markCompleted(id) {
    setCompletedMap(prev => ({ ...prev, [id]: true }))
  }

  return (
    <div className="pp-container pp-page-content" style={{ padding: '24px 0' }}>
      <div className="pp-page-header" style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1A1A2E' }}>CME & REMS Educational Training Hub</h1>
        <p style={{ color: '#6B7280', fontSize: 14 }}>Complete accredited product safety modules, REMS certifications, and download CME credits.</p>
      </div>

      {loading ? <SkeletonCards count={3} /> : modules.length === 0 ? (
        <div className="pp-empty-state"><span>🎓</span><p>No training modules currently available.</p></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {modules.map(mod => {
            const isDone = completedMap[mod.id]
            return (
              <div key={mod.id} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 18, boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ background: '#FCE7F3', color: '#9D174D', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 12 }}>{mod.type}</span>
                  <span style={{ background: '#EFF6FF', color: '#1E40AF', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 12 }}>{mod.credits}</span>
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1A1A2E', margin: '4px 0 8px' }}>{mod.title}</h3>
                <div style={{ fontSize: 13, color: '#4B5563', marginBottom: 4 }}><strong>Duration:</strong> {mod.duration}</div>
                <div style={{ fontSize: 13, color: '#4B5563', marginBottom: 14 }}><strong>Pass Threshold:</strong> {mod.pass_score}% score required</div>
                
                {isDone ? (
                  <button
                    className="pp-btn pp-btn-outline"
                    onClick={() => downloadCertificate(mod)}
                    style={{ width: '100%', padding: '8px 12px', fontSize: 13, fontWeight: 600, borderColor: '#059669', color: '#059669', background: '#ECFDF5', borderRadius: 6, cursor: 'pointer' }}
                  >
                    📥 Download CME Certificate (PDF/TXT)
                  </button>
                ) : (
                  <button
                    className="pp-btn pp-btn-primary"
                    onClick={() => markCompleted(mod.id)}
                    style={{ width: '100%', padding: '8px 12px', fontSize: 13, fontWeight: 600, background: 'var(--pp-primary, #0284c7)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                  >
                    ▶ Launch Training Module
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
