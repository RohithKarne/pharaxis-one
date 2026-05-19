import { useEffect, useState } from 'react'
import { httpFetch } from '../api/httpFetch.js'
import { useAuth } from '../context/AuthContext'

const LABELS = { reporter: 'Reporter', patient: 'Patient', product: 'Product', event: 'Adverse Event' }

export default function CaseValidityPanel({ caseId, onNavigate }) {
  const { token } = useAuth()
  const [validity, setValidity] = useState(null)
  useEffect(() => {
    if (!caseId || !token) return
    let cancelled = false
    async function load() {
      try {
        const res = await httpFetch(`/api/cases/${caseId}/validity`, { headers: { Authorization: `Bearer ${token}` } })
        const data = await res.json()
        if (!cancelled) setValidity(data)
      } catch { if (!cancelled) setValidity(null) }
    }
    load()
    const timer = setInterval(load, 2000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [caseId, token])
  if (!validity?.elements) return null
  return <div className="cf-validity-panel" title={`ICH validity score ${validity.score}/4`}>
    <strong>Validity {validity.score}/4</strong>
    {validity.elements.map(e => <button key={e.key} type="button" className={`cf-validity-item ${e.satisfied ? 'ok' : 'missing'}`} title={`${e.reason || ''}${e.source ? ` Source: ${e.source}` : ''}`} onClick={() => !e.satisfied && onNavigate?.(e.key)}>
      <span>{e.satisfied ? '✓' : '✕'}</span>{LABELS[e.key] || e.key}
    </button>)}
  </div>
}
