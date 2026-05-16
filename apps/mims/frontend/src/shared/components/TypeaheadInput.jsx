/**
 * TypeaheadInput — Theme 2 (Wave 2) autocomplete input.
 *
 * Debounced calls to /api/typeahead?source=…&q=… via useSmartFields.lookup.
 * Renders a dropdown with keyboard navigation.
 *
 * Props:
 *   source      — required, registered in smartFieldsService (products|contacts|users|picklists|…)
 *   value       — current value object {value,label} or raw string
 *   onSelect    — (match) => void
 *   lookup      — pass useSmartFields().lookup
 *   placeholder — optional
 *   filter      — optional JSON-string filter ({ "type": "ae_severity" })
 *
 * Falls back to a plain <input> when source is empty.
 */

import { useEffect, useRef, useState } from 'react'

export default function TypeaheadInput({
  source, value, onSelect, lookup, placeholder,
  filter = null, autoFocus = false,
}) {
  const [q, setQ]        = useState(typeof value === 'string' ? value : (value?.label || ''))
  const [matches, setMs] = useState([])
  const [open, setOpen]  = useState(false)
  const [active, setAct] = useState(0)
  const debounceRef = useRef(null)
  const blurRef     = useRef(null)

  useEffect(() => {
    if (!source) return
    if (q.length < 1) { setMs([]); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const ms = await (lookup ? lookup(source, q, filter) : [])
      setMs(ms || [])
      setOpen(true); setAct(0)
    }, 180)
    return () => clearTimeout(debounceRef.current)
  }, [q, source, filter, lookup])

  function pick(m) {
    setQ(m.label || ''); setOpen(false)
    onSelect?.(m)
  }
  function onKeyDown(e) {
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setAct(a => Math.min(a + 1, matches.length - 1)) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setAct(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && matches[active]) { e.preventDefault(); pick(matches[active]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        autoFocus={autoFocus}
        value={q}
        placeholder={placeholder}
        onChange={e => setQ(e.target.value)}
        onFocus={() => matches.length && setOpen(true)}
        onBlur={() => { blurRef.current = setTimeout(() => setOpen(false), 120) }}
        onKeyDown={onKeyDown}
        style={{
          width: '100%', padding: '7px 10px', fontSize: 13,
          border: '1px solid var(--border)', borderRadius: 6,
          background: 'var(--surface)',
        }}
      />
      {open && matches.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30,
          marginTop: 4, background: 'var(--surface,#fff)', borderRadius: 6,
          border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          maxHeight: 260, overflowY: 'auto',
        }}>
          {matches.map((m, i) => (
            <div
              key={m.value ?? i}
              onMouseDown={e => { e.preventDefault(); clearTimeout(blurRef.current); pick(m) }}
              onMouseEnter={() => setAct(i)}
              style={{
                padding: '7px 10px', cursor: 'pointer',
                background: i === active ? 'var(--accent-soft,#eaf2ff)' : 'transparent',
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 600 }}>{m.label}</div>
              {m.meta && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.meta}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
