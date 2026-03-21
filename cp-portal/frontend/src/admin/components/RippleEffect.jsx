import { useEffect } from 'react'

/**
 * RippleEffect — spawns a pulse circle at the cursor on every mouseover.
 * Throttled to one ripple per 120ms. Purely cosmetic, never blocks interaction.
 * Mount once inside AdminLayout.
 */
export default function RippleEffect() {
  useEffect(() => {
    let last = 0

    function onMouseOver(e) {
      const now = Date.now()
      if (now - last < 120) return
      last = now

      const el = document.createElement('div')
      el.style.cssText = `
        position: fixed;
        left: ${e.clientX - 14}px;
        top:  ${e.clientY - 14}px;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: rgba(107, 63, 160, 0.25);
        pointer-events: none;
        z-index: 99999;
        animation: cp-ripple 0.55s ease-out forwards;
      `
      document.body.appendChild(el)
      setTimeout(() => el.remove(), 560)
    }

    document.addEventListener('mouseover', onMouseOver)
    return () => document.removeEventListener('mouseover', onMouseOver)
  }, [])

  return (
    <style>{`
      @keyframes cp-ripple {
        0%   { transform: scale(0);   opacity: 0.6; }
        100% { transform: scale(2.8); opacity: 0;   }
      }
    `}</style>
  )
}
