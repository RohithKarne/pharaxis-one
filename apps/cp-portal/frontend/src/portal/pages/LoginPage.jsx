import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'
import usePageTitle from '../hooks/usePageTitle'

export default function LoginPage() {
  const { clientCode, login, user } = usePortal()
  const navigate              = useNavigate()
  const location              = useLocation()
  const base                  = `/portal/${clientCode}`
  const returnTo              = location.state?.from || base

  usePageTitle('Sign In')

  // AUTH-03: redirect already-authenticated users away from the login page
  useEffect(() => {
    if (user) navigate(base, { replace: true })
  }, [user, base, navigate])

  const [form, setForm]       = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  // LOW-09: show/hide password toggle
  const [showLoginPassword, setShowLoginPassword]       = useState(false)

  // SSO: which OIDC providers this portal offers, and whether local password
  // login is still allowed (a portal may be configured sso_only).
  const [ssoProviders, setSsoProviders] = useState([])
  const [localAllowed, setLocalAllowed] = useState(true)

  useEffect(() => {
    if (!clientCode) return
    let cancelled = false
    fetch(`/api/portal/auth/sso/providers?client_code=${encodeURIComponent(clientCode)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d) return
        setSsoProviders(Array.isArray(d.providers) ? d.providers : [])
        setLocalAllowed(d.local_login_allowed !== false)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [clientCode])

  function startSso(provider) {
    const rt = returnTo && returnTo !== base ? `&return_to=${encodeURIComponent(returnTo)}` : ''
    window.location.href = `/api/portal/auth/sso/${provider.key}/start?client_code=${encodeURIComponent(clientCode)}${rt}`
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); setError('') }

  async function handleLogin(e) {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const res  = await fetch(`/api/portal/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_code: clientCode, email: form.email, password: form.password })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Login failed.')
        // LOW-35: clear password on failed login
        setForm(f => ({ ...f, password: '' }))
        return
      }
      login(data.user, data.token)
      navigate(returnTo, { replace: true })
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pp-auth-page">
      <div className="pp-auth-card">
        {error && <div className="pp-error-msg" id="pp-login-error" role="alert">{error}</div>}

        <div className="pp-auth-footer" style={{ marginBottom: 16, textAlign: 'left' }}>
          Access is provisioned by administrator approval only.
        </div>

        {/* SSO: single sign-on with the portal's configured identity providers */}
        {ssoProviders.length > 0 && (
          <div className="pp-sso-group">
            {ssoProviders.map(p => (
              <button key={p.key} type="button" className="pp-sso-btn" onClick={() => startSso(p)}>
                Continue with {p.label}
              </button>
            ))}
            {localAllowed && <div className="pp-sso-divider"><span>or</span></div>}
          </div>
        )}

        {localAllowed && (
        <form onSubmit={handleLogin} className="pp-auth-form">
          <div className="pp-field">
            <label>Email Address</label>
            <input type="email" required value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@example.com" aria-invalid={!!error} aria-describedby={error ? 'pp-login-error' : undefined} />
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
          <div style={{ marginTop: 14, textAlign: 'center' }}>
            <button type="button" className="pp-link-btn" onClick={() => navigate(`${base}/forgot-password`)}>
              Forgot your password?
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  )
}
