import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'
import { SkeletonCards } from '../../shared/components/Skeleton'
import { formatDate } from '../../shared/utils/datetime'

// CPPM-15: a module can be started when it is open (can_start); signed-out visitors
// are asked to sign in first. A signed-in doctor sees their own result per module,
// and the certificate link for a recorded pass.
export default function TrainingPage() {
  const { clientCode, user } = usePortal()
  const navigate = useNavigate()
  const base = `/portal/${clientCode}`
  const [modules, setModules] = useState([])
  const [loading, setLoading] = useState(true)
  const [attempts, setAttempts] = useState([])

  useEffect(() => {
    fetch(`/api/portal/content/${clientCode}/training`)
      .then(r => r.json())
      .then(d => { setModules(d.items || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [clientCode])

  useEffect(() => {
    if (!user) { setAttempts([]); return }
    fetch(`/api/portal/training/${clientCode}/mine`, { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : { attempts: [] })
      .then(d => setAttempts(d.attempts || []))
      .catch(() => setAttempts([]))
  }, [clientCode, user])

  function start(mod) {
    const target = `${base}/training/${mod.id}`
    if (user) navigate(target)
    else navigate(`${base}/login`, { state: { from: target } })
  }

  return (
    <div className="pp-container pp-page-content" style={{ padding: '24px 0' }}>
      <div className="pp-page-header" style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1A1A2E' }}>CME & REMS Educational Training Hub</h1>
        <p style={{ color: '#6B7280', fontSize: 14 }}>Read each module’s document, answer its questions, and download a certificate when you pass.</p>
      </div>

      {loading ? <SkeletonCards count={3} /> : modules.length === 0 ? (
        <div className="pp-empty-state"><p>No training modules currently available.</p></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {modules.map(mod => {
            const mine = attempts.filter(a => a.module_id === mod.id)
            const pass = mine.find(a => a.passed)
            const last = mine[0]
            return (
              <div key={mod.id} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 18, boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ background: '#FCE7F3', color: '#9D174D', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 12 }}>{mod.type}</span>
                  {mod.credits && <span style={{ background: '#EFF6FF', color: '#1E40AF', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 12 }}>{mod.credits}</span>}
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1A1A2E', margin: '4px 0 8px' }}>{mod.title}</h3>
                <div style={{ fontSize: 13, color: '#4B5563', marginBottom: 4 }}><strong>Duration:</strong> {mod.duration}</div>
                <div style={{ fontSize: 13, color: '#4B5563', marginBottom: 14 }}>
                  <strong>Pass mark:</strong> {mod.pass_score}%{mod.question_count > 0 && ` · ${mod.question_count} question${mod.question_count === 1 ? '' : 's'}`}
                </div>

                {pass && (
                  <div style={{ fontSize: 13, color: '#065F46', background: '#ECFDF5', borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
                    Passed on {formatDate(pass.taken_at)} with {pass.score}%.{' '}
                    <a href={`/api/portal/training/${clientCode}/certificates/${pass.reference}`} style={{ fontWeight: 600 }}>Download certificate</a>
                  </div>
                )}
                {!pass && last && (
                  <div style={{ fontSize: 13, color: '#92400E', background: '#FFFBEB', borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
                    Last attempt {formatDate(last.taken_at)}: {last.score}% — not passed.
                  </div>
                )}

                {mod.can_start ? (
                  <button className="pp-btn pp-btn-primary" onClick={() => start(mod)} style={{ width: '100%' }}>
                    {!user ? 'Sign in to start' : pass ? 'Open module' : last ? 'Try again' : 'Start module'}
                  </button>
                ) : (
                  <div style={{ fontSize: 12, color: '#6B7280' }}>Not open yet.</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
