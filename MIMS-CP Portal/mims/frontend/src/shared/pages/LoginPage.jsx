/**
 * LoginPage.jsx (shared)
 * Reusable login page for all modules.
 * Pass `redirectTo` prop to control where to go after login (default: '/dashboard')
 * Pass `appName` and `appTagline` to customise the header per module.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function LoginPage({ redirectTo = '/dashboard', appName = 'MIMS', appTagline = 'Medical Information Management System', allowUsername = false }) {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [alert, setAlert] = useState({ show: false, type: 'error', msg: '' })
  const [loading, setLoading] = useState(false)
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })

  function showAlert(msg, type = 'error') {
    setAlert({ show: true, type, msg })
  }

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
      login(data.user, data.token, data.modules || [])
      navigate(redirectTo)
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
          <div className="app-name">{appName}</div>
          <div className="app-tagline">{appTagline}</div>
        </div>
        <div className="login-card-body">
          {alert.show && (
            <div className={`alert alert-${alert.type}`}>{alert.msg}</div>
          )}
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>{allowUsername ? 'User ID' : 'Email Address'}</label>
              <input
                className="form-control"
                type={allowUsername ? 'text' : 'email'}
                placeholder={allowUsername ? 'Enter user id' : 'you@company.com'}
                required
                value={loginForm.email}
                onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))}
              />
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
        </div>
      </div>
    </div>
  )
}
