/**
 * CommandPalette — Theme 4 Wave 1 Cmd+K palette.
 *
 * Global keyboard shortcut (Cmd/Ctrl+K) opens a centred search box.
 * Caller passes a list of commands; the palette handles fuzzy match + render.
 *
 * Command shape:
 *   { id, label, hint?, keywords?, group?, run: () => void }
 *
 * Usage:
 *   const commands = [
 *     { id:'new-case', label:'New Case', hint:'Create AE/PC/MI', group:'Cases',
 *       run: () => navigate('/case/new') },
 *     { id:'workflow', label:'Open Workflow Setup', group:'Admin',
 *       run: () => navigate('/admin/workflow') },
 *   ]
 *   <CommandPalette commands={commands} />
 */

import { useEffect, useMemo, useRef, useState } from 'react'

export default function CommandPalette({ commands = [], placeholder = 'Type a command or search…' }) {
  const [open, setOpen]     = useState(false)
  const [query, setQuery]   = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)

  // ── Global keyboard hook ─────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o); setQuery(''); setActive(0)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10)
  }, [open])

  // ── Filter + group ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands.slice(0, 20)
    return commands
      .map(c => {
        const haystack = [c.label, c.hint, ...(c.keywords || [])].filter(Boolean).join(' ').toLowerCase()
        if (haystack.includes(q)) return { ...c, _score: 100 - haystack.indexOf(q) }
        // simple letter-presence score
        let score = 0; let i = 0
        for (const ch of q) {
          const idx = haystack.indexOf(ch, i)
          if (idx === -1) return null
          score += 50 - (idx - i); i = idx + 1
        }
        return { ...c, _score: score }
      })
      .filter(Boolean)
      .sort((a, b) => b._score - a._score)
      .slice(0, 30)
  }, [commands, query])

  function run(cmd) {
    setOpen(false); setQuery('')
    try { cmd.run?.() } catch (err) { console.error('Command failed:', err) }
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter')     { e.preventDefault(); const c = filtered[active]; if (c) run(c) }
  }

  if (!open) return null
  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,28,42,0.55)',
        zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '12vh',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 560, maxWidth: '92vw', background: 'var(--surface,#fff)',
          borderRadius: 10, boxShadow: '0 12px 48px rgba(0,0,0,0.25)',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setActive(0) }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          style={{
            padding: '14px 18px', fontSize: 15, outline: 'none',
            border: 'none', borderBottom: '1px solid var(--border)',
            background: 'transparent',
          }}
        />
        <div style={{ maxHeight: '50vh', overflowY: 'auto', padding: '6px 0' }}>
          {filtered.length === 0 && (
            <div style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center', fontSize: 13 }}>
              No matches.
            </div>
          )}
          {filtered.map((c, idx) => (
            <div
              key={c.id || idx}
              onMouseEnter={() => setActive(idx)}
              onClick={() => run(c)}
              style={{
                padding: '8px 18px', cursor: 'pointer', display: 'flex',
                justifyContent: 'space-between', alignItems: 'center',
                background: idx === active ? 'var(--accent-soft,#eaf2ff)' : 'transparent',
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{c.label}</div>
                {c.hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{c.hint}</div>}
              </div>
              {c.group && (
                <span style={{
                  fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                  letterSpacing: 0.4, color: 'var(--text-muted)',
                }}>{c.group}</span>
              )}
            </div>
          ))}
        </div>
        <div style={{
          padding: '6px 14px', fontSize: 11, color: 'var(--text-muted)',
          background: 'var(--surface-alt,#fafafa)', borderTop: '1px solid var(--border)',
        }}>
          ↑↓ navigate · ↵ select · esc close · ⌘K toggle
        </div>
      </div>
    </div>
  )
}
