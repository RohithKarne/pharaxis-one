/**
 * SlaChip — Sprint 2 #11.
 *
 * Renders a compact SLA chip showing the current state, elapsed time, and
 * remaining time. Color codes by status: green (ok), amber (warning),
 * red (breached). Polls /api/cases/:caseId/sla every 60s.
 */

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { httpFetch } from '../api/httpFetch.js'

const COLORS = {
  ok:       { bg: '#dcfce7', fg: '#15803d' },
  warning:  { bg: '#fef3c7', fg: '#92400e' },
  breached: { bg: '#fee2e2', fg: '#991b1b' },
}

export default function SlaChip({ caseId }) {
  const { token } = useAuth()
  const [t, setT] = useState(null)

  const load = useCallback(async () => {
    if (!caseId) return
    try {
      const r = await httpFetch(`/api/cases/${caseId}/sla`, { headers: { Authorization: `Bearer ${token}` } })
      const d = await r.json()
      setT(d.timing)
    } catch { /* tolerate */ }
  }, [caseId, token])

  useEffect(() => {
    const run = async () => { await load() }
    run()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [load])

  if (!t || !t.state) return null
  if (!t.sla_seconds) {
    return (
      <span style={{ ...chipStyle('ok'), background: '#f1f5f9', color: '#475569' }} title={`State: ${t.state}`}>
        {t.state}
      </span>
    )
  }
  const remaining = t.remaining_seconds
  return (
    <span style={chipStyle(t.status)} title={`State: ${t.state} · SLA ${t.sla_hours}h`}>
      ⏱ {t.state} · {remaining >= 0 ? fmtDuration(remaining) + ' left' : 'over by ' + fmtDuration(Math.abs(remaining))}
    </span>
  )
}

function chipStyle(status) {
  const c = COLORS[status] || COLORS.ok
  return {
    padding: '3px 9px', borderRadius: 11, fontSize: 11, fontWeight: 700,
    background: c.bg, color: c.fg,
    display: 'inline-flex', alignItems: 'center', gap: 4,
  }
}
function fmtDuration(sec) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h >= 24) return `${Math.floor(h/24)}d ${h%24}h`
  return `${h}h ${m}m`
}
