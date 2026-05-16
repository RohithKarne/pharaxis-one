/**
 * CompletenessBar — Theme 4 Wave 1.
 *
 * Renders a thin progress bar at the top of the case form showing the % of
 * non-empty required fields. Updates live as the user types. Color-codes:
 *   <40% red, <80% amber, ≥80% green.
 *
 * Inputs:
 *   fields   — array of { name, required } (typically derived from the
 *              field setup or validation schema)
 *   payload  — current case payload
 *   section  — optional label shown when fewer than 3 required fields
 *
 * Usage (only render when cf.theme4_visual_polish enabled):
 *   {flags['cf.theme4_visual_polish'] && (
 *     <CompletenessBar fields={fields} payload={state} />
 *   )}
 */

import { useMemo } from 'react'

export default function CompletenessBar({ fields = [], payload = {}, label = 'Completeness' }) {
  const stats = useMemo(() => {
    const required = fields.filter(f => f.required)
    if (!required.length) return { pct: 100, done: 0, total: 0 }
    const done = required.filter(f => !isEmpty(payload[f.name])).length
    return { pct: Math.round((done / required.length) * 100), done, total: required.length }
  }, [fields, payload])

  const color = stats.pct >= 80 ? '#1a7a3f' : stats.pct >= 40 ? '#c08300' : '#b91c1c'

  return (
    <div style={{
      padding: '6px 14px', background: 'var(--surface-alt,#fafafa)',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
        {label}
      </span>
      <div style={{
        flex: 1, height: 6, background: '#e6e8ec', borderRadius: 3, overflow: 'hidden',
      }}>
        <div style={{
          width: `${stats.pct}%`, height: '100%', background: color,
          transition: 'width 0.25s ease-out',
        }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 64, textAlign: 'right' }}>
        {stats.pct}% · {stats.done}/{stats.total}
      </span>
    </div>
  )
}

function isEmpty(v) {
  return v == null || v === '' || (Array.isArray(v) && v.length === 0)
}
