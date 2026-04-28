import { useState, useEffect } from 'react'
import { _registerConfirm } from '../utils/confirm'
import './mims-dialogs.css'

export default function ConfirmModal() {
  const [state, setState] = useState(null)

  useEffect(() => {
    _registerConfirm((message, title) => new Promise(resolve => {
      setState({ message, title, resolve })
    }))
    return () => _registerConfirm(null)
  }, [])

  function handle(val) {
    state?.resolve(val)
    setState(null)
  }

  if (!state) return null

  return (
    <div className="mims-confirm-overlay" onClick={() => handle(false)}>
      <div className="mims-confirm-modal" onClick={e => e.stopPropagation()}>
        {state.title && <div className="mims-confirm-title">{state.title}</div>}
        <div className="mims-confirm-msg">{state.message}</div>
        <div className="mims-confirm-actions">
          <button className="mims-confirm-btn mims-confirm-cancel" onClick={() => handle(false)}>Cancel</button>
          <button className="mims-confirm-btn mims-confirm-ok" onClick={() => handle(true)}>Confirm</button>
        </div>
      </div>
    </div>
  )
}
