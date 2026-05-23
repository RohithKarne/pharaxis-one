/**
 * CommandPalette.jsx — global "jump to" overlay (Cmd/Ctrl-K).
 *
 * Combines static navigation destinations (filtered by module access) with a
 * live case lookup so power users can reach any case or page without clicking
 * through the nav. Keyboard-first: ↑/↓ to move, Enter to go, Esc to close.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isAdminUser } from '../utils/adminScope.js'
import { httpFetch } from '../api/httpFetch.js'
import Icon from './Icon'

const DESTINATIONS = [
  { label: 'Overview', to: '/dashboard', icon: 'overview', module: 'mims_core' },
  { label: 'Inbox', to: '/inbox', icon: 'inbox', module: 'mims_core' },
  { label: 'My Cases', to: '/cases?tab=my', icon: 'folder', module: 'mims_core' },
  { label: 'Unassigned Cases', to: '/cases?tab=unassigned', icon: 'folder', module: 'mims_core' },
  { label: 'Case Query', to: '/case-query', icon: 'search', module: 'mims_core' },
  { label: 'Transmissions', to: '/transmissions', icon: 'transmissions', module: 'transmissions' },
  { label: 'Browse Content', to: '/browse-content', icon: 'browse', module: 'content_mgmt' },
  { label: 'Content Management', to: '/content', icon: 'content', module: 'content_mgmt', adminOnly: true },
  { label: 'Reports', to: '/reports', icon: 'reports', module: 'reports', adminOnly: true },
  { label: 'Response Log', to: '/response-log', icon: 'content' },
  { label: 'MIMS Admin', to: '/mims-admin', icon: 'admin', module: 'admin_console', adminOnly: true },
]

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate()
  const { hasModuleAccess, user, token } = useAuth()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [cases, setCases] = useState([])
  const inputRef = useRef(null)

  const isAdmin = isAdminUser(user?.role)

  const destinations = useMemo(() => DESTINATIONS.filter((d) => {
    if (d.adminOnly && !isAdmin) return false
    if (d.module && hasModuleAccess && !hasModuleAccess(d.module)) return false
    return true
  }), [hasModuleAccess, isAdmin])

  const filteredDestinations = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return destinations
    return destinations.filter((d) => d.label.toLowerCase().includes(q))
  }, [destinations, query])

  // Reset state each time it opens, and focus the input.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    setCases([])
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [open])

  // Debounced case lookup.
  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 2) { setCases([]); return }
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const res = await httpFetch(`/api/cases?search=${encodeURIComponent(q)}&limit=6`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setCases(Array.isArray(data?.cases) ? data.cases : [])
      } catch { /* lookup is best-effort */ }
    }, 220)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query, open, token])

  const items = useMemo(() => ([
    ...filteredDestinations.map((d) => ({ kind: 'nav', label: d.label, icon: d.icon, to: d.to })),
    ...cases.map((c) => ({
      kind: 'case',
      label: `${c.case_number || `Case #${c.id}`}${c.title ? ` — ${c.title}` : ''}`,
      icon: 'folder',
      to: `/cases/${c.id}`,
    })),
  ]), [filteredDestinations, cases])

  useEffect(() => { setActive(0) }, [items.length])

  if (!open) return null

  function go(item) {
    if (!item) return
    onClose?.()
    navigate(item.to)
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') { e.preventDefault(); onClose?.() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); go(items[active]) }
  }

  return (
    <div
      onMouseDown={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' }}
    >
      <div
        role="dialog"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ width: 'min(560px, 92vw)', background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-md)', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          <Icon name="search" size={18} style={{ color: 'var(--text-muted)' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a page or search cases…"
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, fontFamily: 'var(--font)', background: 'transparent', color: 'var(--text-primary)' }}
          />
          <kbd style={{ fontSize: 11, color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px' }}>Esc</kbd>
        </div>
        <div style={{ maxHeight: '50vh', overflowY: 'auto', padding: 6 }}>
          {items.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No matches</div>
          )}
          {items.map((item, i) => (
            <div
              key={`${item.kind}-${item.to}-${i}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(item)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                background: i === active ? 'var(--bg)' : 'transparent', color: 'var(--text-primary)', fontSize: 14,
              }}
            >
              <Icon name={item.icon} size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
              {item.kind === 'case' && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>Case</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
