import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminAuth } from '../context/AdminAuthContext'

const SUPERADMIN_CREDENTIALS = {
  email: 'cpadmin',
  password: 'Admin@123',
}

export default function LoginPage() {
  const { login, admin } = useAdminAuth()
  const navigate = useNavigate()

  // AUTH-04: redirect already-authenticated admins away from the login page
  useEffect(() => {
    if (admin) navigate('/admin', { replace: true })
  }, [admin, navigate])
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [mode, setMode] = useState('admin')

  function switchMode(nextMode) {
    setMode(nextMode)
    setError('')
    setEmail(nextMode === 'superadmin' ? SUPERADMIN_CREDENTIALS.email : '')
    setPassword(nextMode === 'superadmin' ? SUPERADMIN_CREDENTIALS.password : '')
  }

  async function handleLogin(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res  = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Login failed.')
        setPassword(mode === 'superadmin' ? SUPERADMIN_CREDENTIALS.password : '')
        return
      }
      if (mode === 'superadmin' && data.admin?.role !== 'superadmin') {
        setError('Superadmin access required.')
        setPassword(SUPERADMIN_CREDENTIALS.password)
        return
      }
      login(data.token, data.admin)
      navigate('/admin')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="cp-login-page">
      <div className="cp-login-card">
        <div className="cp-login-brand">
          <div className="cp-login-brand-row">
            <span className="cp-login-icon">&#9877;</span>
            {mode === 'admin' ? (
              <button className="cp-superadmin-switch" type="button" onClick={() => switchMode('superadmin')}>
                Superadmin
              </button>
            ) : null}
          </div>
          <h1>CP Portal</h1>
          <p>{mode === 'superadmin' ? 'Superadmin Console' : 'Admin Console'}</p>
        </div>
        <form onSubmit={handleLogin} className="cp-login-form">
          <div className="cp-field">
            <label>Username</label>
            <input type="text" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="cpadmin" autoFocus required />
          </div>
          <div className="cp-field cp-field-password">
            <label>Password</label>
            <div className="cp-input-wrapper" style={{ position: 'relative' }}>
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required />
              <button
                type="button"
                className="cp-password-toggle"
                style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer' }}
                onClick={() => setShowPassword(s => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          {error && <div className="cp-error">{error}</div>}
          <button type="submit" className="cp-btn cp-btn-primary" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
          {mode === 'superadmin' ? (
            <button type="button" className="cp-btn cp-btn-secondary" onClick={() => switchMode('admin')} disabled={loading}>
              Back to App Login
            </button>
          ) : null}
        </form>
      </div>
    </div>
  )
}
