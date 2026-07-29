import { useState, useEffect } from 'react'
import toast from '../utils/toast'
import { Link } from 'react-router-dom'
import './mims-dialogs.css'

const MAX_VISIBLE = 3

export default function ToastContainer() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    return toast._subscribe(entry => {
      // Cap the stack. A burst of notifications arriving together covered the
      // header and the org switcher, so the UI underneath became unusable until
      // they timed out. Oldest drop off; the newest are the ones worth reading.
      setToasts(prev => [...prev, entry].slice(-MAX_VISIBLE))
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== entry.id))
      }, entry.duration)
    })
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="mims-toast-stack">
      {toasts.map(t => (
        <div key={t.id} className={`mims-toast mims-toast--${t.type}`}>
          <span className="mims-toast-icon">
            {t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : t.type === 'warn' ? '⚠' : 'ℹ'}
          </span>
          <span className="mims-toast-msg">{t.msg}</span>
          {t.action && (
            <Link to={t.action.url} className="mims-toast-action" onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}>
              {t.action.label}
            </Link>
          )}
          <button className="mims-toast-close" onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}>×</button>
        </div>
      ))}
    </div>
  )
}
