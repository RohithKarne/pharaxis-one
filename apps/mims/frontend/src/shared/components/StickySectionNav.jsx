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

export default function StickySectionNav({
  sections = [],
  rootMargin = '-30% 0px -60% 0px',
  activeId = null,
  onSelect = null,
  className = '',
}) {
  const controlled = typeof onSelect === 'function'
  const [active, setActive] = useState(activeId || sections[0]?.id || null)
  const observed = useRef(new Map())
  const currentActive = controlled && activeId != null ? activeId : active

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
    <nav className={`cf-sticky-nav${controlled ? ' cf-sticky-nav--controlled' : ''}${className ? ` ${className}` : ''}`}>
      <div className="cf-sticky-nav-title">Sections</div>
      <ul className="cf-sticky-nav-list">
        {sections.map(s => {
          const isActive = currentActive === s.id
          const pct = s.count ? Math.round((s.complete / s.count) * 100) : null
          const pctTone = pct == null ? '' : pct === 100 ? ' cf-sticky-nav-pct--complete' : pct >= 50 ? ' cf-sticky-nav-pct--warn' : ' cf-sticky-nav-pct--critical'
          return (
            <li key={s.id}>
              <button
                onClick={() => go(s.id)}
                type="button"
                className={`cf-sticky-nav-btn${isActive ? ' active' : ''}`}
              >
                <span>{s.label}</span>
                {pct != null && (
                  <span className={`cf-sticky-nav-pct${pctTone}`}>{pct}%</span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
