import { useState, useEffect } from 'react'
import toast from '../utils/toast'
import './mims-dialogs.css'

export default function ToastContainer() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    return toast._subscribe(entry => {
      setToasts(prev => [...prev, entry])
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
          <button className="mims-toast-close" onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}>×</button>
        </div>
      ))}
    </div>
  )
}
