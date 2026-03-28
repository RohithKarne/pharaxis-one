/**
 * LoginPage.jsx
 * Handles Sign In and Register tabs.
 * Calls the Express backend API and uses AuthContext to store the session.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../shared/context/AuthContext'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState('login')
  const [alert, setAlert] = useState({ show: false, type: 'error', msg: '' })
  const [loading, setLoading] = useState(false)
  const [backendOnline, setBackendOnline] = useState(null)

  // Login form state
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })

  // Register form state
  const [regForm, setRegForm] = useState({ name: '', email: '', password: '', role: 'agent' })

  function showAlert(msg, type = 'error') {
    setAlert({ show: true, type, msg })
  }

  useEffect(() => {
    let cancelled = false
    async function ping() {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' })
        if (!res.ok) throw new Error('health not ok')
        if (!cancelled) setBackendOnline(true)
      } catch {
        if (!cancelled) setBackendOnline(false)
      }
    }
    ping()
    const id = setInterval(ping, 10000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setAlert({ show: false })

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      })
      const data = await res.json()

      if (!res.ok) return showAlert(data.error || 'Login failed.')

      // No org assigned — block access
      if (data.noOrgAccess) return navigate('/no-access')

      // First login — mandatory password reset
      if (data.passwordResetRequired) {
        login(data.user, data.token, [], {})
        return navigate('/reset-password')
      }

      login(
        data.user,
        data.token,
        data.modules || [],
        { orgId: data.orgId, siteId: data.siteId, orgName: data.orgName, allOrgs: data.allOrgs || [] }
      )
      navigate('/dashboard')
    } catch {
      showAlert('Cannot connect to server.')
    } finally {
      setLoading(false)
    }
  }

  async function handleRegister(e) {
    e.preventDefault()
    setLoading(true)
    setAlert({ show: false })

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regForm)
      })
      const data = await res.json()

      if (!res.ok) return showAlert(data.error || 'Registration failed.')

      showAlert('Account created! Please sign in.', 'success')
      setActiveTab('login')
      setLoginForm(f => ({ ...f, email: regForm.email }))
    } catch {
      showAlert('Cannot connect to server.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card-header">
          <div className="app-name">MIMS</div>
          <div className="app-tagline">Medical Information Management System</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
            <span>{today}</span>
            <span style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: '#1f9d55', marginRight: 6 }} />
              Frontend: On
            </span>
            <span style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: backendOnline === null ? '#999' : (backendOnline ? '#1f9d55' : '#e01e5a'), marginRight: 6 }} />
              Backend: {backendOnline === null ? 'Checking' : (backendOnline ? 'On' : 'Off')}
            </span>
          </div>
        </div>

        <div className="login-card-body">
          <div className="tab-group">
            <button className={`tab-btn ${activeTab === 'login' ? 'active' : ''}`} onClick={() => setActiveTab('login')}>
              Sign In
            </button>
            <button className={`tab-btn ${activeTab === 'register' ? 'active' : ''}`} onClick={() => setActiveTab('register')}>
              Register
            </button>
          </div>

          {alert.show && (
            <div className={`alert alert-${alert.type}`}>{alert.msg}</div>
          )}

          {activeTab === 'login' ? (
            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label>Email Address</label>
                <input className="form-control" type="email" placeholder="you@company.com" required
                  value={loginForm.email}
                  onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input className="form-control" type="password" placeholder="Enter your password" required
                  value={loginForm.password}
                  onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))} />
              </div>
              <button className="btn btn-primary btn-block mt-8" type="submit" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister}>
              <div className="form-group">
                <label>Full Name</label>
                <input className="form-control" type="text" placeholder="Your full name" required
                  value={regForm.name}
                  onChange={e => setRegForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Email Address</label>
                <input className="form-control" type="email" placeholder="you@company.com" required
                  value={regForm.email}
                  onChange={e => setRegForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Password <span className="text-muted">(min 8 characters)</span></label>
                <input className="form-control" type="password" minLength={8} required
                  value={regForm.password}
                  onChange={e => setRegForm(f => ({ ...f, password: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Role</label>
                <select className="form-control" value={regForm.role}
                  onChange={e => setRegForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="agent">Agent</option>
                  <option value="reviewer">Reviewer</option>
                  <option value="content_manager">Content Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button className="btn btn-accent btn-block mt-8" type="submit" disabled={loading}>
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
