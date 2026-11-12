import { useEffect, useState } from 'react'
import { httpFetch } from '../../../shared/api/httpFetch.js'

// S1 (Rohith, 2026-11-12): an AE case missing one of the four validity criteria
// is kept, not refused. This banner names what is missing at the top of the case,
// so the agent follows up. It reads the same check that blocks Transmit to PV
// (/validity), and asks again after each save, so it clears on its own.
const LABELS = { reporter: 'reporter (email or phone)', patient: 'patient', product: 'suspect product', event: 'adverse event description' }

export default function CaseValidityBanner({ caseId, caseType, headers, savedAt }) {
  const [missing, setMissing] = useState([])

  useEffect(() => {
    if (!caseId || caseType !== 'AE') return
    let cancelled = false
    httpFetch(`/api/cases/${caseId}/validity?fresh=1`, { headers })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled) setMissing((d?.elements || []).filter(e => !e.satisfied).map(e => e.key)) })
      .catch(() => {})
    return () => { cancelled = true }
    // Keyed on the token, not the headers object (rebuilt each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, caseType, savedAt, headers?.Authorization])

  if (caseType !== 'AE' || !missing.length) return null
  return (
    <div role="alert" data-testid="ae-validity-banner"
      style={{ background: '#FEF3C7', border: '1px solid #B45309', color: '#92400E', padding: '10px 14px', borderRadius: 4, fontWeight: 600, margin: '8px 0' }}>
      Not yet a valid report — follow up for: {missing.map(k => LABELS[k] || k).join(', ')}.
      <span style={{ fontWeight: 400 }}> Transmit to PV stays blocked until all four are recorded.</span>
    </div>
  )
}
