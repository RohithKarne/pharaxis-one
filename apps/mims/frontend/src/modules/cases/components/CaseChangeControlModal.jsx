import { useEffect, useState } from 'react'

/**
 * Asks for what the organisation's change-control rules require before a case is
 * closed or reopened: a reason, or the user's password as an electronic signature.
 * The server refuses the save with REASON_REQUIRED / PASSWORD_REQUIRED; without this
 * the screen could only say "Save failed", so no case could be closed or reopened
 * once an organisation switched those rules on.
 */
export default function CaseChangeControlModal({ ask, onSubmit, onCancel }) {
  const [value, setValue] = useState('')
  useEffect(() => { setValue('') }, [ask])
  if (!ask) return null
  const isPassword = ask.needs === 'password'

  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, background: 'rgba(20,28,42,0.55)', zIndex: 9990,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <form
        onClick={e => e.stopPropagation()}
        onSubmit={e => { e.preventDefault(); if (value.trim()) onSubmit(isPassword ? { password: value } : { reason: value.trim() }) }}
        style={{ width: 460, maxWidth: '92vw', background: 'var(--surface,#fff)', borderRadius: 10, boxShadow: '0 12px 48px rgba(0,0,0,0.25)', overflow: 'hidden' }}
      >
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <strong>{isPassword ? 'Electronic signature required' : 'Reason required'}</strong>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{ask.message}</div>
        </div>
        <div style={{ padding: 16 }}>
          {isPassword ? (
            <input type="password" autoFocus value={value} onChange={e => setValue(e.target.value)}
              placeholder="Your password" autoComplete="current-password"
              style={{ width: '100%', padding: '8px 10px', fontSize: 13 }} />
          ) : (
            <textarea autoFocus rows={3} value={value} onChange={e => setValue(e.target.value)}
              placeholder="Why is this change being made?"
              style={{ width: '100%', padding: '8px 10px', fontSize: 13 }} />
          )}
        </div>
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!value.trim()}>{isPassword ? 'Sign and save' : 'Save with reason'}</button>
        </div>
      </form>
    </div>
  )
}
