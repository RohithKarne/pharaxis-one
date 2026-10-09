import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'

export default function VerifyEmailPage() {
  const { clientCode, login, t } = usePortal()
  const navigate = useNavigate()
  const location = useLocation()
  const [status, setStatus] = useState('verifying') // 'verifying' | 'success' | 'error' | 'expired'
  const [message, setMessage] = useState('')

  useEffect(() => {
    const fragmentParams = new URLSearchParams(location.hash.replace(/^#/, ''))
    const queryParams = new URLSearchParams(location.search)
    const token = fragmentParams.get('token') || queryParams.get('token')
    if (!token) { setStatus('error'); setMessage('No verification token found.'); return }
    verify(token)
  }, [location.hash, location.search])

  async function verify(token) {
    try {
      const res  = await fetch('/api/portal/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (res.ok) {
        login(data.user, data.token)
        setStatus('success')
        setTimeout(() => navigate(`/portal/${clientCode}`, { replace: true }), 2000)
      } else {
        setStatus(data.expired ? 'expired' : 'error')
        setMessage(data.error || 'Verification failed.')
      }
    } catch {
      setStatus('error')
      setMessage('Network error. Please try again.')
    }
  }

  async function resend() {
    const email = prompt('Enter your registered email address to receive a new verification link:')
    if (!email) return
    try {
      const res = await fetch(`/api/portal/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_code: clientCode, email }),
      })
      if (!res.ok) { alert('Unable to send a new verification link. Please try again later.'); return }
      alert('If that email is registered and unverified, a new link has been sent.')
    } catch {
      alert('Network error. Please check your connection and try again.')
    }
  }

  return (
    <div className="pp-auth-page">
      <div className="pp-auth-card" style={{ textAlign: 'center', padding: '40px 32px' }}>
        {status === 'verifying' && (
          <>
            <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>{t('Verifying your email…')}</h2>
            <p style={{ color: '#4B5563', fontSize: 14 }}>{t('Please wait a moment.')}</p>
          </>
        )}
        {status === 'success' && (
          <>
            <h2 style={{ margin: '0 0 8px', fontSize: 20, color: '#166534' }}>{t('Email Verified!')}</h2>
            <p style={{ color: '#4B5563', fontSize: 14 }}>{t('Your account is active. Redirecting you now…')}</p>
          </>
        )}
        {(status === 'error' || status === 'expired') && (
          <>
            <h2 style={{ margin: '0 0 8px', fontSize: 20, color: '#B91C1C' }}>{t('Verification Failed')}</h2>
            <p style={{ color: '#4B5563', fontSize: 14, marginBottom: 20 }}>{message}</p>
            <button className="pp-btn pp-btn-primary" onClick={resend}>
              {t('Resend Verification Email')}
            </button>
            <p style={{ marginTop: 16, fontSize: 13 }}>
              <button className="pp-link-btn" onClick={() => navigate(`/portal/${clientCode}/login`)}>{t('Back to Sign In')}</button>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
