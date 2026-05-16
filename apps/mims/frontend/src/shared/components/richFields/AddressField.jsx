/**
 * AddressField — Theme 1 Rich Field (Wave 3).
 *
 * 6-line address with reverse-geocode chip. As the user types in line1,
 * we debounce-call /api/geocode to pull a single best suggestion. Picking
 * a suggestion populates city/state/postal/country/lat/lng in one click.
 *
 * Value shape:
 *   { line1, line2, city, state, postal_code, country, lat, lng, formatted }
 */

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { httpFetch } from '../../api/httpFetch.js'

export default function AddressField({ value = {}, onChange, label, readOnly }) {
  const { token } = useAuth()
  const [suggestions, setSugs] = useState([])
  const [busy, setBusy] = useState(false)
  const debounceRef = useRef(null)

  function patch(k, v) { onChange?.({ ...value, [k]: v }) }

  useEffect(() => {
    if (readOnly) return
    clearTimeout(debounceRef.current)
    const q = (value.line1 || '').trim()
    if (q.length < 4) { setSugs([]); return }
    debounceRef.current = setTimeout(async () => {
      setBusy(true)
      try {
        const url = `/api/geocode?text=${encodeURIComponent(q)}${value.country ? `&country=${value.country}` : ''}`
        const r = await httpFetch(url, { headers: { Authorization: `Bearer ${token}` } })
        const d = await r.json()
        setSugs(d.result ? [d.result] : [])
      } catch { setSugs([]) }
      finally { setBusy(false) }
    }, 350)
    return () => clearTimeout(debounceRef.current)
  }, [value.line1, value.country, token, readOnly])

  function applySug(s) {
    onChange?.({
      ...value,
      formatted: s.formatted,
      lat: s.lat, lng: s.lng,
      city:        s.components?.locality       || s.components?.city       || value.city,
      state:       s.components?.administrative_area_level_1 || s.components?.region || value.state,
      postal_code: s.components?.postal_code    || value.postal_code,
      country:     s.components?.country_short  || s.components?.country    || value.country,
    })
    setSugs([])
  }

  return (
    <div>
      {label && <div style={lblStyle}>{label}</div>}
      <input placeholder="Street address" value={value.line1 || ''} onChange={e => patch('line1', e.target.value)} disabled={readOnly} style={ipt} />
      {suggestions.length > 0 && (
        <div style={{
          marginTop: 4, padding: '6px 10px', borderRadius: 4,
          background: 'var(--accent-soft,#eaf2ff)', fontSize: 12,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>📍 {suggestions[0].formatted}</span>
          <button onClick={() => applySug(suggestions[0])} style={pickBtn}>Use</button>
        </div>
      )}
      {busy && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>Looking up address…</div>}
      <input placeholder="Apartment / suite (optional)" value={value.line2 || ''} onChange={e => patch('line2', e.target.value)} disabled={readOnly} style={{ ...ipt, marginTop: 6 }} />
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <input placeholder="City" value={value.city || ''} onChange={e => patch('city', e.target.value)} disabled={readOnly} style={{ ...ipt, flex: 2 }} />
        <input placeholder="State" value={value.state || ''} onChange={e => patch('state', e.target.value)} disabled={readOnly} style={{ ...ipt, flex: 1 }} />
        <input placeholder="Postal" value={value.postal_code || ''} onChange={e => patch('postal_code', e.target.value)} disabled={readOnly} style={{ ...ipt, flex: 1 }} />
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <input placeholder="Country (ISO-2)" maxLength={2}
          value={value.country || ''} onChange={e => patch('country', e.target.value.toUpperCase())}
          disabled={readOnly} style={{ ...ipt, flex: 1, textTransform: 'uppercase' }} />
        {value.lat && value.lng && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>
            📍 {Number(value.lat).toFixed(4)}, {Number(value.lng).toFixed(4)}
          </span>
        )}
      </div>
    </div>
  )
}

const lblStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }
const ipt = { width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6 }
const pickBtn = {
  padding: '3px 9px', border: '1px solid #1a4f9c', borderRadius: 4,
  fontSize: 11, fontWeight: 600, color: '#1a4f9c', background: '#fff', cursor: 'pointer',
}
