/**
 * StickySectionNav — left-side section rail. Two modes:
 *
 * 1. Scroll-spy (default): highlights the section currently in view via
 *    IntersectionObserver; click smooth-scrolls to the section anchor.
 *
 * 2. Controlled (pass `onSelect`): the rail drives a panel switcher instead of
 *    scrolling — used where sub-sections are nested tabs (only one mounted at a
 *    time), e.g. the AE/PC workspaces. Highlight follows `activeId`; click calls
 *    `onSelect(id)`. No observer is attached.
 *
 * Sections prop:
 *   [{ id: 'reporter', label: 'Reporter', count?: 12, complete?: 8 }, ...]
 */

import { useEffect, useRef, useState } from 'react'

export default function StickySectionNav({ sections = [], rootMargin = '-30% 0px -60% 0px', activeId = null, onSelect = null }) {
  const controlled = typeof onSelect === 'function'
  const [active, setActive] = useState(activeId || sections[0]?.id || null)
  const observed = useRef(new Map())

  // In controlled mode, mirror the externally-owned active section.
  useEffect(() => {
    if (controlled && activeId != null) setActive(activeId)
  }, [controlled, activeId])

  useEffect(() => {
    if (controlled) return // no scroll-spy when the rail drives a panel switcher
    if (typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver((entries) => {
      const visible = entries
        .filter(e => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (visible) setActive(visible.target.id)
    }, { rootMargin, threshold: [0, 0.25, 0.5, 0.75, 1] })

    for (const s of sections) {
      const el = document.getElementById(s.id)
      if (el) { obs.observe(el); observed.current.set(s.id, el) }
    }
    return () => obs.disconnect()
  }, [sections, rootMargin, controlled])

  function go(id) {
    if (controlled) { onSelect(id); setActive(id); return }
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActive(id)
  }

  return (
    <nav style={{
      position: 'sticky', top: 90, alignSelf: 'flex-start',
      width: 200, padding: '10px 8px', fontSize: 13,
      borderRight: '1px solid var(--border)',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
        textTransform: 'uppercase', color: 'var(--text-muted)',
        padding: '4px 8px',
      }}>Sections</div>
      <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0' }}>
        {sections.map(s => {
          const isActive = active === s.id
          const pct = s.count ? Math.round((s.complete / s.count) * 100) : null
          return (
            <li key={s.id}>
              <button
                onClick={() => go(s.id)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  width: '100%', padding: '7px 10px', textAlign: 'left',
                  fontSize: 12, fontWeight: isActive ? 700 : 500,
                  color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                  background: isActive ? 'rgba(var(--primary-rgb,29,53,87),0.08)' : 'transparent',
                  borderLeft: `3px solid ${isActive ? 'var(--primary)' : 'transparent'}`,
                  border: 'none', cursor: 'pointer', borderRadius: 4,
                }}
              >
                <span>{s.label}</span>
                {pct != null && (
                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    color: pct === 100 ? '#1a7a3f' : pct >= 50 ? '#c08300' : '#b91c1c',
                  }}>{pct}%</span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
