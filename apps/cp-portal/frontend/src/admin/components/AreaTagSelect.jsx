import { useState, useEffect } from 'react'
import { adminHeaders, useAdminAuth } from '../context/AdminAuthContext'

// CPPM-122: tag a news post, document or event with one of this client's therapeutic
// areas, so doctors who work in that area see it first in "For you". Saves on change.
const areaCache = new Map()
export function loadAreas(clientId) {
  if (!areaCache.has(clientId)) {
    areaCache.set(clientId, fetch(`/api/admin/content/${clientId}/therapeutic-areas`, { headers: adminHeaders() })
      .then(r => r.ok ? r.json() : { therapeutic_areas: [] })
      .then(d => (d.therapeutic_areas || []).filter(a => a.is_active !== 0))
      .catch(() => { areaCache.delete(clientId); return [] }))
  }
  return areaCache.get(clientId)
}

export default function AreaTagSelect({ clientId, kind, item }) {
  const { canChange } = useAdminAuth()
  const [areas, setAreas] = useState([])
  const [value, setValue] = useState(item.therapeutic_area_id ?? '')
  const [state, setState] = useState('') // '', 'saving', 'saved', or an error message
  useEffect(() => { loadAreas(clientId).then(setAreas) }, [clientId])
  useEffect(() => { setValue(item.therapeutic_area_id ?? '') }, [item.therapeutic_area_id])

  async function save(next) {
    const before = value
    setValue(next); setState('saving')
    try {
      const res = await fetch(`/api/admin/area-tags/${clientId}/${kind}/${item.id}`, {
        method: 'PUT', headers: adminHeaders(), body: JSON.stringify({ therapeutic_area_id: next === '' ? null : Number(next) }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setValue(before); setState(d.error || `Not saved (error ${res.status}).`); return }
      setState('saved'); setTimeout(() => setState(s => (s === 'saved' ? '' : s)), 2000)
    } catch { setValue(before); setState('Not saved: network error.') }
  }

  const label = `Therapeutic area for ${item.title || item.name || 'this item'}`
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <select aria-label={label} value={value} disabled={!canChange(kind === 'event' ? 'content' : kind === 'news' ? 'news' : 'documents') || state === 'saving'}
        onChange={e => save(e.target.value)} style={{ maxWidth: 160 }}>
        <option value="">No area</option>
        {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      {state === 'saved' && <span role="status" style={{ fontSize: 11, color: '#16A34A' }}>Saved</span>}
      {state && state !== 'saved' && state !== 'saving' && <span role="alert" style={{ fontSize: 11, color: '#B91C1C' }}>{state}</span>}
    </span>
  )
}
