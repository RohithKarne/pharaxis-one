import { useEffect, useRef } from 'react'

/**
 * useFocusTrap — trap keyboard focus within a dialog while it's open (CP-16).
 *
 * - Moves focus into the container when it opens.
 * - Loops Tab / Shift+Tab within the focusable children (no escaping to the page).
 * - Calls onEscape() when Esc is pressed.
 * - Restores focus to the previously-focused element when it closes.
 *
 * Usage:
 *   const ref = useFocusTrap(isOpen, onClose)
 *   <div ref={ref} role="dialog" aria-modal="true"> … </div>
 */
export function useFocusTrap(active, onEscape) {
  const containerRef = useRef(null)
  const previousFocus = useRef(null)
  const escRef = useRef(onEscape)
  escRef.current = onEscape // keep latest callback without re-running the effect

  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return

    previousFocus.current = document.activeElement

    const getFocusable = () => Array.from(
      container.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter(el => el.offsetParent !== null)

    // Focus the first control (or the dialog itself) on open.
    const initial = getFocusable()
    ;(initial[0] || container).focus?.()

    function onKeyDown(e) {
      if (e.key === 'Escape') { e.stopPropagation(); escRef.current?.(); return }
      if (e.key !== 'Tab') return
      const items = getFocusable()
      if (items.length === 0) { e.preventDefault(); return }
      const first = items[0], last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }

    container.addEventListener('keydown', onKeyDown)
    return () => {
      container.removeEventListener('keydown', onKeyDown)
      previousFocus.current?.focus?.() // restore focus on close
    }
  }, [active])

  return containerRef
}
