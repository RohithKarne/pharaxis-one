import { useEffect, useState } from 'react'
import { httpFetch } from '../../../shared/api/httpFetch'

export default function PvSignalPanel({ headers }) {
  const [signals, setSignals] = useState([])
  const [periodic, setPeriodic] = useState([])
  const [msg, setMsg] = useState('')

  async function load() {
    const [sRes, pRes] = await Promise.all([
      httpFetch('/api/admin/pv/signals', { headers }),
      httpFetch('/api/admin/pv/periodic-reports', { headers }),
    ])
    setSignals((await sRes.json().catch(() => ({ rows: [] }))).rows || [])
    setPeriodic((await pRes.json().catch(() => ({ rows: [] }))).rows || [])
  }
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [sRes, pRes] = await Promise.all([
        httpFetch('/api/admin/pv/signals', { headers }),
        httpFetch('/api/admin/pv/periodic-reports', { headers }),
      ])
      if (cancelled) return
      setSignals((await sRes.json().catch(() => ({ rows: [] }))).rows || [])
      setPeriodic((await pRes.json().catch(() => ({ rows: [] }))).rows || [])
    })()
    return () => { cancelled = true }
  }, [headers])

  async function runSignals() {
    const res = await httpFetch('/api/admin/pv/signals/run', { method: 'POST', headers, body: JSON.stringify({}) })
    const data = await res.json().catch(() => ({}))
    setMsg(res.ok ? `Signal detection created ${data.created?.length || 0} review item(s).` : data.error)
    load()
  }

  return (
    <div className="cf-pv-panel">
      <div className="cf-pv-head"><h3>PV Signals + Periodic Reports</h3><button type="button" onClick={runSignals}>Run Signal Detection</button></div>
      {msg && <p>{msg}</p>}
      <h4>Signals to Review</h4>
      {signals.length === 0 ? <p>No signal reviews yet.</p> : signals.map(s => <div key={s.id} className="cf-pv-row"><b>{s.product_name}</b><span>{s.reaction_term}</span><span>PRR {s.prr} / ROR {s.ror}</span></div>)}
      <h4>PSUR / DSUR Drafts</h4>
      {periodic.length === 0 ? <p>No periodic reports yet.</p> : periodic.map(p => <div key={p.id} className="cf-pv-row"><b>{p.product_name}</b><span>{p.report_type}</span><span>{p.status}</span></div>)}
    </div>
  )
}
