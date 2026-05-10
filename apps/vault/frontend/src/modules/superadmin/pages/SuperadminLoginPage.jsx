import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function SuperadminLoginPage() {
  const appIconUrl = `${import.meta.env.BASE_URL}vault-icon.svg`
  const [form, setForm] = useState({ email: '', password: '', mfaCode: '' })
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const [backendOnline, setBackendOnline] = useState(null)
  const [mfaChallengeToken, setMfaChallengeToken] = useState('')
  const navigate = useNavigate()

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value })

  useEffect(() => {
    let cancelled = false
    async function ping() {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' })
        if (!res.ok) throw new Error('health failed')
        if (!cancelled) setBackendOnline(true)
      } catch {
        if (!cancelled) setBackendOnline(false)
      }
    }
    ping()
    const id = setInterval(ping, 10000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)
    try {
      const res = await fetch('/api/superadmin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          mfa_code: form.mfaCode || undefined,
          mfa_challenge_token: mfaChallengeToken || undefined
        })
      })
      const data = await res.json()
      if (res.status === 202 && data.mfa_required) {
        setMfaChallengeToken(data.mfa_challenge_token || '')
        setInfo(data.dev_code ? `MFA required. Dev code: ${data.dev_code}` : 'MFA required. Enter the 6-digit code.')
        setLoading(false)
        return
      }
      if (!res.ok) { setError(data.error || 'Login failed'); setLoading(false); return }
      localStorage.setItem('vault_superadmin_token', data.token)
      localStorage.setItem('vault_superadmin', JSON.stringify(data.superadmin))
      navigate('/dashboard')
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="vault-login-page" style={{ background: 'linear-gradient(135deg, #1a1f2e 0%, #2d3548 100%)' }}>
      <div className="vault-login-card" style={{ borderTop: '4px solid #e8a020' }}>
        <div className="vault-login-card-header" style={{ background: 'linear-gradient(135deg, #1a1f2e 0%, #2d3548 100%)' }}>
          <div className="vault-login-brand">
            <img className="vault-app-icon" src={appIconUrl} alt="Admin" />
            <div className="vault-app-name" style={{ color: '#e8a020', letterSpacing: '0.12em' }}>PHARAXIS ADMIN</div>
          </div>
          <div className="vault-app-tagline" style={{ color: 'rgba(255,255,255,0.6)' }}>Internal Control Tower — Restricted Access</div>
          <div className="vault-login-health">
            <span className="vault-health-pill">Frontend: On</span>
            <span className="vault-health-pill">
              Backend: {backendOnline === null ? 'Checking' : (backendOnline ? 'On' : 'Off')}
            </span>
          </div>
        </div>

        <div className="vault-login-card-body">
          <form className="vault-login-form" onSubmit={handleSubmit}>
            <div className="panel-note" style={{ background: '#fff8ed', border: '1px solid #e8a020', color: '#7a4f00', borderRadius: '6px', padding: '0.5rem 0.75rem', marginBottom: '1rem' }}>
              Pharaxis internal use only. Unauthorised access is prohibited.
            </div>
            <div className="vault-form-group">
              <label htmlFor="email">Username</label>
              <input
                id="email"
                name="email"
                type="text"
                value={form.email}
                onChange={handleChange}
                required
                autoComplete="username"
                placeholder="Enter superadmin email"
              />
            </div>

            <div className="vault-form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                value={form.password}
                onChange={handleChange}
                required
                autoComplete="current-password"
                placeholder="Enter your password"
              />
            </div>

            {mfaChallengeToken ? (
              <div className="vault-form-group">
                <label htmlFor="mfaCode">MFA Code</label>
                <input
                  id="mfaCode"
                  name="mfaCode"
                  value={form.mfaCode}
                  onChange={handleChange}
                  placeholder="6-digit code"
                />
              </div>
            ) : null}

            {error ? <div className="auth-error">{error}</div> : null}
            {info ? <div className="upload-success">{info}</div> : null}
            <button
              className="btn-primary vault-login-btn"
              type="submit"
              disabled={loading}
              style={{ background: loading ? '#9b6e1a' : '#e8a020', borderColor: '#e8a020' }}
            >
              {loading ? 'Signing in...' : 'Sign In to Admin'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
