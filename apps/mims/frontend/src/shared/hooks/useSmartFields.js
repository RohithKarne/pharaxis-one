/**
 * useSmartFields — Theme 2 (Wave 2).
 *
 * Wires a case-section payload to:
 *   - Smart defaults on mount (POST /api/smart-fields/defaults)
 *   - Auto-calc on every payload change (POST /api/smart-fields/recalc, debounced)
 *
 * Returns { schema, applyDefaults, recalc, lookup } so callers can also
 * power typeahead inputs from the same hook.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { httpFetch } from '../api/httpFetch.js'

export function useSmartFields(section, { onPatch } = {}) {
  const { token } = useAuth()
  const [schema, setSchema] = useState({ enabled: false, rules: [] })
  const debounceRef = useRef(null)

  useEffect(() => {
    if (!section) return
    const H = { Authorization: `Bearer ${token}` }
    httpFetch(`/api/smart-fields/schema?section=${encodeURIComponent(section)}`, { headers: H })
      .then(r => r.json()).then(setSchema).catch(() => setSchema({ enabled: false, rules: [] }))
  }, [section, token])

  const applyDefaults = useCallback(async (payload) => {
    if (!schema.enabled || !section) return {}
    const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    try {
      const r = await httpFetch('/api/smart-fields/defaults', {
        method: 'POST', headers: H,
        body: JSON.stringify({ section, payload }),
      })
      const d = await r.json()
      if (d.patch && Object.keys(d.patch).length) onPatch?.(d.patch)
      return d.patch || {}
    } catch { return {} }
  }, [schema, section, token, onPatch])

  const recalc = useCallback((payload) => {
    if (!schema.enabled || !section) return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      try {
        const r = await httpFetch('/api/smart-fields/recalc', {
          method: 'POST', headers: H,
          body: JSON.stringify({ section, payload }),
        })
        const d = await r.json()
        if (d.patch && Object.keys(d.patch).length) onPatch?.(d.patch)
      } catch {}
    }, 200)
  }, [schema, section, token, onPatch])

  const lookup = useCallback(async (source, q, filter) => {
    if (!schema.enabled) return []
    const H = { Authorization: `Bearer ${token}` }
    const params = new URLSearchParams({ source, q: q || '' })
    if (filter) params.set('filter', filter)
    try {
      const r = await httpFetch(`/api/typeahead?${params}`, { headers: H })
      const d = await r.json()
      return d.matches || []
    } catch { return [] }
  }, [schema, token])

  return { schema, enabled: schema.enabled, applyDefaults, recalc, lookup }
}

export default useSmartFields
