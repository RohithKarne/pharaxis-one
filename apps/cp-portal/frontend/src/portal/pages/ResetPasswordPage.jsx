import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'
import usePageTitle from '../hooks/usePageTitle'

export default function ResetPasswordPage() {
  const { clientCode, t } = usePortal()
  const navigate = useNavigate()
  const base = `/portal/${clientCode}`

  usePageTitle(t('Set a new password'))

  const [token, setToken]       = useState('')
  const [pwd, setPwd]           = useState('')
  const [confirm, setConfirm]   = useState('')
  const [show, setShow]         = useState(false)
  const [loading, setLoading]   = useState(false)
  const [done, setDone]         = useState(false)
  const [error, setError]       = useState('')

  // The email link delivers the token in the URL hash (#token=…), matching the
  // verify-email flow, so it never lands in server logs or the Referer header.
  useEffect(() => {
    const m = (window.location.hash || '').match(/token=([^&]+)/)
    if (m) setToken(decodeURIComponent(m[1]))
  }, [])

  async function submit(e) {
    e.preventDefault(); setError('')
    if (pwd.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (pwd !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/portal/auth/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: pwd }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Unable to reset password.'); return }
      setDone(true)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pp-auth-page">
      <div className="pp-auth-card">
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1A1A2E', marginBottom: 8 }}>{t('Set a new password')}</h1>

        {done ? (
          <>
            <p style={{ color: '#166534', fontSize: 14 }}>{t('Your password has been reset.')}</p>
            <button className="pp-btn pp-btn-primary pp-btn-full" style={{ marginTop: 16 }} onClick={() => navigate(`${base}/login`)}>
              {t('Go to Sign In')}
            </button>
          </>
        ) : !token ? (
          <>
            <p style={{ color: '#B91C1C', fontSize: 14 }}>{t('This reset link is missing or invalid. Please request a new one.')}</p>
            <button className="pp-btn pp-btn-outline pp-btn-full" style={{ marginTop: 16 }} onClick={() => navigate(`${base}/forgot-password`)}>
              {t('Request a new link')}
            </button>
          </>
        ) : (
          <>
            {error && <div className="pp-error-msg">{error}</div>}
            <form onSubmit={submit} className="pp-auth-form">
              <div className="pp-field pp-field-password">
                <label>{t('New password')} <span style={{ fontSize: 11, color: '#4B5563' }}>{t('(min 8 characters)')}</span></label>
                <div className="pp-input-wrapper">
                  <input type={show ? 'text' : 'password'} required value={pwd} onChange={e => setPwd(e.target.value)} placeholder="••••••••" />
                  <button type="button" className="pp-password-toggle" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
                    {show ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              <div className="pp-field">
                <label>{t('Confirm new password')}</label>
                <input type={show ? 'text' : 'password'} required value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="••••••••" />
              </div>
              <button type="submit" className="pp-btn pp-btn-primary pp-btn-full" disabled={loading}>
                {loading ? 'Resetting…' : 'Reset password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
