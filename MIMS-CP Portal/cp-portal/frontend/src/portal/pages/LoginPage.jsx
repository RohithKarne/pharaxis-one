import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'

export default function LoginPage() {
  const { clientCode, login } = usePortal()
  const navigate              = useNavigate()
  const base                  = `/portal/${clientCode}`
  const [tab, setTab]         = useState('login')
  const [form, setForm]       = useState({ email: '', password: '', first_name: '', last_name: '', user_type: 'hcp', country: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); setError('') }

  async function handleLogin(e) {
    e.preventDefault(); setLoading(true); setError('')
    const res  = await fetch(`/api/portal/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_code: clientCode, email: form.email, password: form.password })
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error || 'Login failed.'); return }
    login(data.user, data.token)
    navigate(base)
  }

  async function handleRegister(e) {
    e.preventDefault(); setLoading(true); setError('')
    const res  = await fetch(`/api/portal/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, client_code: clientCode })
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error || 'Registration failed.'); return }
    login(data.user, data.token)
    navigate(base)
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
            <div className="pp-field">
              <label>Password</label>
              <input type="password" required value={form.password} onChange={e => set('password', e.target.value)} placeholder="••••••••" />
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
            <div className="pp-field">
              <label>Password *</label>
              <input type="password" required minLength={6} value={form.password} onChange={e => set('password', e.target.value)} placeholder="Min. 6 characters" />
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
              <div className="pp-field">
                <label>Country</label>
                <input value={form.country} onChange={e => set('country', e.target.value)} placeholder="e.g. United States" />
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
