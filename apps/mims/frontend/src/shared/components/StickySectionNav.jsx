/**
 * StickySectionNav — Theme 4 Wave 1.
 *
 * A floating left-side rail listing case form sections. Highlights the
 * currently-visible section while the user scrolls. Click jumps to section.
 *
 * Implementation: IntersectionObserver on each section's anchor div.
 *
 * Sections prop:
 *   [{ id: 'reporter', label: 'Reporter', count?: 12, complete?: 8 }, ...]
 */

import { useEffect, useRef, useState } from 'react'

export default function StickySectionNav({ sections = [], rootMargin = '-30% 0px -60% 0px' }) {
  const [active, setActive] = useState(sections[0]?.id || null)
  const observed = useRef(new Map())

  useEffect(() => {
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
  }, [sections, rootMargin])

  function go(id) {
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
                  color: isActive ? 'var(--accent,#1a4f9c)' : 'var(--text-secondary)',
                  background: isActive ? 'var(--accent-soft,#eaf2ff)' : 'transparent',
                  borderLeft: `3px solid ${isActive ? 'var(--accent,#1a4f9c)' : 'transparent'}`,
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
