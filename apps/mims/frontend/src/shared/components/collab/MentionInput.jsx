/**
 * MentionInput — Theme 5 (Wave 4) textarea with @-mention autocomplete.
 *
 * Uses /api/typeahead?source=users (Theme 2 lookup) to resolve mentions.
 * When the user types '@' followed by chars, a dropdown surfaces matching
 * users; pressing Enter inserts `@username` (or `@"Full Name"` if the
 * username contains spaces).
 *
 * Props:
 *   value, onChange  — controlled textarea
 *   placeholder
 *   rows?            — default 3
 */

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { httpFetch } from '../../api/httpFetch.js'

export default function MentionInput({ value, onChange, placeholder = 'Write a comment… use @ to mention', rows = 3 }) {
  const { token } = useAuth()
  const taRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState([])
  const [active, setActive] = useState(0)
  const debounceRef = useRef(null)

  // Detect @token at the caret on every change
  function handleChange(e) {
    const v = e.target.value
    onChange?.(v)
    const caret = e.target.selectionStart
    const before = v.slice(0, caret)
    const m = before.match(/(^|\s)@([A-Za-z0-9._-]{0,40})$/)
    if (m) {
      setOpen(true); setQuery(m[2]); setActive(0)
    } else {
      setOpen(false); setQuery('')
    }
  }

  // Lookup
  useEffect(() => {
    if (!open) return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await httpFetch(`/api/typeahead?source=users&q=${encodeURIComponent(query)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const d = await r.json()
        setMatches((d.matches || []).slice(0, 6))
      } catch { setMatches([]) }
    }, 150)
  }, [open, query, token])

  function applyPick(user) {
    const ta = taRef.current; if (!ta) return
    const caret = ta.selectionStart
    const before = value.slice(0, caret)
    const after  = value.slice(caret)
    // Replace the trailing @partial token
    const newBefore = before.replace(/@([A-Za-z0-9._-]*)$/,
      user.label && user.label.includes(' ') ? `@"${user.label}"` : `@${user.label || user.value}`)
    const next = newBefore + ' ' + after
    onChange?.(next)
    setOpen(false)
    requestAnimationFrame(() => {
      ta.focus()
      const pos = newBefore.length + 1
      ta.setSelectionRange(pos, pos)
    })
  }

  function onKeyDown(e) {
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, matches.length - 1)) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && matches[active]) {
      e.preventDefault(); applyPick(matches[active])
    } else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={taRef}
        value={value || ''}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        rows={rows}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '8px 10px', fontSize: 13, resize: 'vertical',
          border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'inherit',
        }}
      />
      {open && matches.length > 0 && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, marginBottom: 4, zIndex: 30,
          width: 240, background: 'var(--surface,#fff)',
          border: '1px solid var(--border)', borderRadius: 6,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        }}>
          {matches.map((m, i) => (
            <div key={m.value}
              onMouseDown={e => { e.preventDefault(); applyPick(m) }}
              onMouseEnter={() => setActive(i)}
              style={{
                padding: '6px 10px', cursor: 'pointer', fontSize: 13,
                background: i === active ? 'var(--accent-soft,#eaf2ff)' : 'transparent',
              }}>
              <div style={{ fontWeight: 600 }}>{m.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.meta}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
