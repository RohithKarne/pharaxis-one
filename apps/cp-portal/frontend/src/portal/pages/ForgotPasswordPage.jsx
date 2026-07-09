import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'
import usePageTitle from '../hooks/usePageTitle'

export default function ForgotPasswordPage() {
  const { clientCode } = usePortal()
  const navigate = useNavigate()
  const base = `/portal/${clientCode}`

  usePageTitle('Reset password')

  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState('')

  async function submit(e) {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const res = await fetch('/api/portal/auth/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_code: clientCode, email }),
      })
      // Always show the same confirmation — the API never reveals whether the email exists.
      if (!res.ok && res.status >= 500) { setError('Something went wrong. Please try again.'); return }
      setSent(true)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pp-auth-page">
      <div className="pp-auth-card">
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1A1A2E', marginBottom: 8 }}>Reset your password</h1>

        {sent ? (
          <>
            <p style={{ color: '#374151', fontSize: 14, lineHeight: 1.6 }}>
              If that email is registered, we've sent a password reset link. Check your inbox — the link expires in 1 hour.
            </p>
            <button className="pp-btn pp-btn-outline pp-btn-full" style={{ marginTop: 16 }} onClick={() => navigate(`${base}/login`)}>
              Back to Sign In
            </button>
          </>
        ) : (
          <>
            <p style={{ color: '#6B7280', fontSize: 14, marginBottom: 18 }}>
              Enter your email and we'll send you a link to reset your password.
            </p>
            {error && <div className="pp-error-msg">{error}</div>}
            <form onSubmit={submit} className="pp-auth-form">
              <div className="pp-field">
                <label>Email Address</label>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <button type="submit" className="pp-btn pp-btn-primary pp-btn-full" disabled={loading}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
            <div style={{ marginTop: 14, textAlign: 'center' }}>
              <button type="button" className="pp-link-btn" onClick={() => navigate(`${base}/login`)}>Back to Sign In</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
