import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminAuth } from '../context/AdminAuthContext'

export default function LoginPage() {
  const { login } = useAdminAuth()
  const navigate = useNavigate()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

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
      if (!res.ok) { setError(data.error || 'Login failed.'); return }
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
          <span className="cp-login-icon">⚕</span>
          <h1>CP Portal</h1>
          <p>Admin Console</p>
        </div>
        <form onSubmit={handleLogin} className="cp-login-form">
          <div className="cp-field">
            <label>Username</label>
            <input type="text" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="cpadmin" autoFocus required />
          </div>
          <div className="cp-field">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required />
          </div>
          {error && <div className="cp-error">{error}</div>}
          <button type="submit" className="cp-btn cp-btn-primary" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
