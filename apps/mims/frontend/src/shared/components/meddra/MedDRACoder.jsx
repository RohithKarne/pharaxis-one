import { useCallback, useEffect, useState } from 'react'
import { httpFetch } from '../../api/httpFetch.js'

export default function MedDRACoder({ caseId, headers }) {
  const [events, setEvents] = useState([])
  const [codes, setCodes] = useState([])
  const [selected, setSelected] = useState(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [message, setMessage] = useState('')
  const load = useCallback(async () => {
    const res = await httpFetch(`/api/cases/${caseId}/meddra`, { headers })
    const data = await res.json()
    setEvents(data.events || [])
    setCodes(data.codes || [])
    setSelected((data.events || [])[0] || null)
  }, [caseId, headers])
  useEffect(() => {
    if (!caseId) return
    let cancelled = false
    ;(async () => {
      const res = await httpFetch(`/api/cases/${caseId}/meddra`, { headers })
      const data = await res.json()
      if (cancelled) return
      setEvents(data.events || [])
      setCodes(data.codes || [])
      setSelected((data.events || [])[0] || null)
    })()
    return () => { cancelled = true }
  }, [caseId, headers])
  useEffect(() => {
    if (!query || query.length < 3) return
    let cancelled = false
    const t = setTimeout(async () => {
      const res = await httpFetch(`/api/meddra/search?q=${encodeURIComponent(query)}&level=PT`, { headers })
      const data = await res.json()
      if (!cancelled) setResults(data.results || [])
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query, headers])
  async function approve(term) {
    if (!selected || !term) return
    const res = await httpFetch(`/api/cases/${caseId}/meddra/approve`, { method: 'POST', headers, body: JSON.stringify({ ae_event_id: selected.id, verbatim: selected.event_description, term_id: term.id }) })
    setMessage(res.ok ? 'MedDRA coding approved' : 'Approval failed')
    load()
  }
  return <div className="cf-meddra-coder">
    <aside>{events.map(e => <button key={e.id} type="button" className={selected?.id === e.id ? 'active' : ''} onClick={() => { setSelected(e); setQuery(e.event_description || '') }}>{e.event_description || `Event #${e.id}`}</button>)}</aside>
    <main>
      <h3>MedDRA Coding</h3>
      <input value={query} onChange={e => { const next = e.target.value; setQuery(next); if (!next || next.length < 3) setResults([]) }} placeholder="Type 3+ chars to search PT terms" />
      <div className="cf-meddra-results">{results.map(r => <button key={r.id} type="button" onClick={() => approve(r)}><strong>{r.term}</strong><span>{r.code} · {r.level}</span></button>)}</div>
      {message && <div className="cf-inline-note">{message}</div>}
      <h4>Approved Coding</h4>
      {codes.map(c => <div key={c.id} className="cf-meddra-code-row">{c.verbatim_text || 'Reaction'} → <strong>{c.term || c.approved_term_id}</strong> {c.code}</div>)}
    </main>
  </div>
}
