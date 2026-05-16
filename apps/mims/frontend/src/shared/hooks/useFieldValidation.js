/**
 * useFieldValidation — Theme 3 inline validation (Wave 1).
 *
 * Loads the per-section validation schema from /api/validation/schema and
 * exposes a `validate(field, value, payload?)` helper that runs the same
 * rules the server enforces. The server is the source of truth (re-validates
 * on save); this hook just gives the UI instant feedback.
 *
 * Behind cf.theme3_inline_validation. If the flag is off, validate() always
 * returns null.
 *
 * Usage:
 *   const { validate, errors, setErrors, schema } = useFieldValidation('reporter');
 *   onChange={e => {
 *     const err = validate('reporter_name', e.target.value, formState);
 *     setErrors(es => ({ ...es, reporter_name: err }));
 *   }}
 */

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { httpFetch } from '../api/httpFetch.js'

export function useFieldValidation(section) {
  const { token } = useAuth()
  const [schema, setSchema] = useState(null)
  const [errors, setErrors] = useState({})
  const [warnings, setWarnings] = useState({})

  // ── Load schema once per section ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    if (!section) return
    const H = { Authorization: `Bearer ${token}` }
    httpFetch(`/api/validation/schema?section=${encodeURIComponent(section)}`, { headers: H })
      .then(r => r.json())
      .then(d => { if (!cancelled) setSchema(d) })
      .catch(() => { if (!cancelled) setSchema({ enabled: false, fields: [] }) })
    return () => { cancelled = true }
  }, [section, token])

  // ── Build a {field_name: rule} map for fast lookup ──────────────────────
  const byField = useMemo(() => {
    const m = new Map()
    for (const f of schema?.fields || []) m.set(f.field_name, f)
    return m
  }, [schema])

  // ── Pure client-side rule check (mirrors validationEngine.js) ───────────
  const validate = useCallback((field, value, payload = {}) => {
    if (!schema?.enabled) return null
    const r = byField.get(field)
    if (!r) return null

    const isEmpty = value == null || value === '' || (Array.isArray(value) && value.length === 0)
    if (r.is_required && isEmpty) return `Required`
    if (isEmpty) return null

    if (r.min_length && String(value).length < r.min_length) return `Min ${r.min_length} chars`
    if (r.max_length && String(value).length > r.max_length) return `Max ${r.max_length} chars`

    if (r.min_value != null || r.max_value != null) {
      const n = Number(value)
      if (Number.isFinite(n)) {
        if (r.min_value != null && n < Number(r.min_value)) return `Must be ≥ ${r.min_value}`
        if (r.max_value != null && n > Number(r.max_value)) return `Must be ≤ ${r.max_value}`
      }
    }

    if (r.regex) {
      try {
        const re = new RegExp(r.regex)
        if (!re.test(String(value))) return r.regex_message || `Invalid format`
      } catch { /* invalid regex on the server side — ignore */ }
    }
    return null
  }, [schema, byField])

  // ── Duplicate probe (debounced; caller invokes on blur) ─────────────────
  const checkDuplicate = useCallback(async (field, value, opts = {}) => {
    if (!schema?.enabled) return null
    const r = byField.get(field)
    if (!r || !r.duplicate) return null
    const params = new URLSearchParams({
      section, field, value: String(value ?? ''),
    })
    if (opts.entityId)   params.set('entity_id', opts.entityId)
    if (opts.entityType) params.set('entity_type', opts.entityType)
    const H = { Authorization: `Bearer ${token}` }
    try {
      const d = await httpFetch(`/api/validation/duplicates?${params}`, { headers: H }).then(r2 => r2.json())
      return d.matches?.[0]?.message || null
    } catch { return null }
  }, [schema, byField, section, token])

  // ── Server-side full check on save (caller hits POST /api/validation/check) ─
  const checkServer = useCallback(async ({ payload, phase, entityId, entityType = 'case' }) => {
    if (!schema?.enabled) return { ok: true, errors: {}, warnings: {} }
    const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    try {
      const r = await httpFetch('/api/validation/check', {
        method: 'POST', headers: H,
        body: JSON.stringify({ section, payload, phase, entity_id: entityId, entity_type: entityType }),
      })
      const d = await r.json()
      setErrors(d.errors || {})
      setWarnings(d.warnings || {})
      return d
    } catch (err) {
      return { ok: false, errors: { _network: err.message }, warnings: {} }
    }
  }, [schema, section, token])

  return {
    schema,
    enabled: !!schema?.enabled,
    byField,
    validate,
    checkDuplicate,
    checkServer,
    errors,
    setErrors,
    warnings,
    setWarnings,
  }
}

export default useFieldValidation
