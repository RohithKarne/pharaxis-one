import { useEffect, useState } from 'react'
import { httpFetch } from '../api/httpFetch.js'
import { useAuth } from '../context/AuthContext'

export default function HaClockBar({ caseId }) {
  const { token } = useAuth()
  const [clocks, setClocks] = useState([])
  useEffect(() => {
    if (!caseId || !token) return
    let cancelled = false
    async function load() {
      try {
        const res = await httpFetch(`/api/cases/${caseId}/ha-clocks`, { headers: { Authorization: `Bearer ${token}` } })
        const data = await res.json()
        if (!cancelled) setClocks(Array.isArray(data.clocks) ? data.clocks : [])
      } catch { if (!cancelled) setClocks([]) }
    }
    load()
    const timer = setInterval(load, 30000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [caseId, token])
  if (!clocks.length) return null
  return <div className="cf-ha-clock-bar" aria-label="Health authority reporting clocks">
    {clocks.map(c => <span key={c.ha_code} className={`cf-ha-clock-chip ${c.status || 'unknown'}`} title={`${c.name || c.ha_code} due ${c.due_at ? String(c.due_at).slice(0, 10) : 'not started'}`}>
      <strong>{c.ha_code}</strong> {c.submission_window_days || 15}d {c.satisfied_at ? '✓' : '⏱'} {c.days_remaining == null ? 'not started' : `${c.days_remaining}d left`}{c.is_expedited ? ' · expedited' : ''}
    </span>)}
  </div>
}
