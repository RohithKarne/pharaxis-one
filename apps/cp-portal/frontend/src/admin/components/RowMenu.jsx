import { useState, useEffect, useRef } from 'react'

// A row's actions behind one "Actions" button (CP ease-of-use plan, phase 3 row 17):
// Portal Users had three or four buttons on each of 300 rows.
// items: [{ label, onClick, danger }]; falsy items are skipped.
export default function RowMenu({ label = 'Actions', name, items }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const shown = items.filter(Boolean)

  useEffect(() => {
    if (!open) return
    const close = e => { if (e.type === 'keydown' ? e.key === 'Escape' : !ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open])

  if (shown.length === 0) return null
  return (
    <div className="cp-row-menu" ref={ref}>
      <button type="button" className="cp-btn cp-btn-sm cp-btn-outline" aria-haspopup="menu" aria-expanded={open}
        aria-label={name ? `${label} for ${name}` : label} onClick={() => setOpen(o => !o)}>
        {label} ▾
      </button>
      {open && (
        <div className="cp-row-menu-list" role="menu">
          {shown.map(it => (
            <button key={it.label} type="button" role="menuitem" className={it.danger ? 'danger' : ''}
              onClick={() => { setOpen(false); it.onClick() }}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
