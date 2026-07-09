import { createContext, useContext, useState, useCallback, useRef } from 'react'

/**
 * Toast — lightweight, dependency-free notification system (CP-33).
 * Replaces scattered inline success/error banners with transient, accessible
 * toasts. Wrap the app in <ToastProvider> and call useToast().
 *
 *   const toast = useToast()
 *   toast.success('Saved.')  |  toast.error('Something went wrong.')
 */

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const dismiss = useCallback((id) => setToasts(t => t.filter(x => x.id !== id)), [])

  const push = useCallback((type, message, ttl = 4000) => {
    const id = ++idRef.current
    setToasts(t => [...t, { id, type, message }])
    if (ttl) setTimeout(() => dismiss(id), ttl)
    return id
  }, [dismiss])

  const api = useRef({
    success: (m, ttl) => push('success', m, ttl),
    error:   (m, ttl) => push('error', m, ttl),
    info:    (m, ttl) => push('info', m, ttl),
  }).current

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pp-toast-stack" role="region" aria-label="Notifications" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`pp-toast pp-toast-${t.type}`} role="status">
            <span className="pp-toast-msg">{t.message}</span>
            <button className="pp-toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// Safe no-op fallback if a component renders outside the provider.
const NOOP = { success: () => {}, error: () => {}, info: () => {} }
export function useToast() { return useContext(ToastContext) || NOOP }
