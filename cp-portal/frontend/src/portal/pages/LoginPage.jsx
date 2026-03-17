import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
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

  const [tab, setTab]         = useState('login')
  const [form, setForm]       = useState({ email: '', password: '', first_name: '', last_name: '', user_type: 'hcp', country: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  // LOW-09: show/hide password toggle
  const [showLoginPassword, setShowLoginPassword]       = useState(false)
  const [showRegisterPassword, setShowRegisterPassword] = useState(false)

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

  async function handleRegister(e) {
    e.preventDefault(); setError('')
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.'); return
    }
    if (!/[A-Z]/.test(form.password)) {
      setError('Password must contain at least one uppercase letter.'); return
    }
    if (!/[0-9]/.test(form.password)) {
      setError('Password must contain at least one number.'); return
    }
    setLoading(true)
    const res  = await fetch(`/api/portal/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, client_code: clientCode })
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error || 'Registration failed.'); return }
    login(data.user, data.token)
    navigate(returnTo, { replace: true })
  }

  return (
    <div className="pp-auth-page">
      <div className="pp-auth-card">
        <div className="pp-auth-tabs">
          <button className={`pp-auth-tab ${tab === 'login' ? 'active' : ''}`} onClick={() => setTab('login')}>Sign In</button>
          <button className={`pp-auth-tab ${tab === 'register' ? 'active' : ''}`} onClick={() => setTab('register')}>Register</button>
        </div>

        {error && <div className="pp-error-msg">{error}</div>}

        {tab === 'login' ? (
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
            <p className="pp-auth-footer">Don't have an account? <button type="button" className="pp-link-btn" onClick={() => setTab('register')}>Register here</button></p>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="pp-auth-form">
            <div className="pp-field-row">
              <div className="pp-field">
                <label>First Name *</label>
                <input required value={form.first_name} onChange={e => set('first_name', e.target.value)} />
              </div>
              <div className="pp-field">
                <label>Last Name *</label>
                <input required value={form.last_name} onChange={e => set('last_name', e.target.value)} />
              </div>
            </div>
            <div className="pp-field">
              <label>Email Address *</label>
              <input type="email" required value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
            {/* LOW-09: password show/hide toggle for register */}
            <div className="pp-field pp-field-password">
              <label>Password *</label>
              <div className="pp-input-wrapper">
                <input type={showRegisterPassword ? 'text' : 'password'} required minLength={8} value={form.password} onChange={e => set('password', e.target.value)} placeholder="Min. 8 characters, 1 uppercase, 1 number" />
                <button type="button" className="pp-password-toggle" onClick={() => setShowRegisterPassword(s => !s)} aria-label={showRegisterPassword ? 'Hide password' : 'Show password'}>
                  {showRegisterPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <div className="pp-field-row">
              <div className="pp-field">
                <label>User Type *</label>
                <select value={form.user_type} onChange={e => set('user_type', e.target.value)}>
                  <option value="hcp">Healthcare Professional (HCP)</option>
                  <option value="physician">Physician</option>
                  <option value="patient">Patient</option>
                  <option value="non_hcp">Non-HCP</option>
                  <option value="other">Other</option>
                </select>
              </div>
              {/* LOW-21: country select dropdown */}
              <div className="pp-field">
                <label>Country</label>
                <select value={form.country} onChange={e => set('country', e.target.value)}>
                  <option value="">Select country…</option>
                  <option value="United States">United States</option>
                  <option value="United Kingdom">United Kingdom</option>
                  <option value="Canada">Canada</option>
                  <option value="Australia">Australia</option>
                  <option value="Germany">Germany</option>
                  <option value="France">France</option>
                  <option value="India">India</option>
                  <option value="Japan">Japan</option>
                  <option value="Brazil">Brazil</option>
                  <option value="Mexico">Mexico</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <button type="submit" className="pp-btn pp-btn-primary pp-btn-full" disabled={loading}>
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
            <p className="pp-auth-footer">Already have an account? <button type="button" className="pp-link-btn" onClick={() => setTab('login')}>Sign in</button></p>
          </form>
        )}
      </div>
    </div>
  )
}
