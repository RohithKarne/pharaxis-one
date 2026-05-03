import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'

export default function LoginPage() {
  const { clientCode, login, user } = usePortal()
  const navigate              = useNavigate()
  const location              = useLocation()
  const base                  = `/portal/${clientCode}`
  const returnTo              = location.state?.from || base

  // AUTH-03: redirect already-authenticated users away from the login page
  useEffect(() => {
    if (user) navigate(base, { replace: true })
  }, [user, base, navigate])

  // LOW-05: set document title
  useEffect(() => { document.title = 'Sign In | CP Portal'; return () => { document.title = 'CP Portal'; }; }, [])

  const [form, setForm]       = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  // LOW-09: show/hide password toggle
  const [showLoginPassword, setShowLoginPassword]       = useState(false)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); setError('') }

  async function handleLogin(e) {
    e.preventDefault(); setLoading(true); setError('')
    const res  = await fetch(`/api/portal/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_code: clientCode, email: form.email, password: form.password })
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) {
      setError(data.error || 'Login failed.')
      // LOW-35: clear password on failed login
      setForm(f => ({ ...f, password: '' }))
      return
    }
    login(data.user, data.token)
    navigate(returnTo, { replace: true })
  }

  return (
    <div className="pp-auth-page">
      <div className="pp-auth-card">
        {error && <div className="pp-error-msg">{error}</div>}

        <div className="pp-auth-footer" style={{ marginBottom: 16, textAlign: 'left' }}>
          Access is provisioned by administrator approval only.
        </div>

        <form onSubmit={handleLogin} className="pp-auth-form">
          <div className="pp-field">
            <label>Email Address</label>
            <input type="email" required value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@example.com" />
          </div>
          {/* LOW-09: password show/hide toggle */}
          <div className="pp-field pp-field-password">
            <label>Password</label>
            <div className="pp-input-wrapper">
              <input type={showLoginPassword ? 'text' : 'password'} required value={form.password} onChange={e => set('password', e.target.value)} placeholder="••••••••" />
              <button type="button" className="pp-password-toggle" onClick={() => setShowLoginPassword(s => !s)} aria-label={showLoginPassword ? 'Hide password' : 'Show password'}>
                {showLoginPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <button type="submit" className="pp-btn pp-btn-primary pp-btn-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
