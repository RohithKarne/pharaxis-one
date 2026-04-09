import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * PageLoader — full-screen overlay with spinner.
 * Triggers automatically on every route/tab change.
 * Also exported as showPageLoader() for manual use on edit/action clicks.
 */

// Global trigger — call showPageLoader() from any component to show the overlay
const listeners = new Set()
export function showPageLoader(duration = 800) {
  listeners.forEach(fn => fn(duration))
}

export default function PageLoader() {
  const location          = useLocation()
  const [visible, setVisible] = useState(false)

  // Auto-trigger on route change
  useEffect(() => {
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 700)
    return () => clearTimeout(t)
  }, [location.pathname])

  // Manual trigger via showPageLoader()
  useEffect(() => {
    function handler(duration) {
      setVisible(true)
      setTimeout(() => setVisible(false), duration)
    }
    listeners.add(handler)
    return () => listeners.delete(handler)
  }, [])

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'transparent',
      zIndex: 99999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'pl-fade-in 0.15s ease',
      pointerEvents: 'none',
    }}>
      <div style={{
        width: 56, height: 56,
        border: '5px solid rgba(107, 63, 160, 0.2)',
        borderTopColor: '#6B3FA0',
        borderRadius: '50%',
        animation: 'pl-spin 0.75s linear infinite',
      }} />
      <style>{`
        @keyframes pl-spin    { to { transform: rotate(360deg); } }
        @keyframes pl-fade-in { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  )
}
