import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const SUPERADMIN_CREDENTIALS = {
  email: 'superadmin@pharaxis.local',
  password: 'Super@123',
}

export default function SuperadminLoginPage() {
  const appIconUrl = `${import.meta.env.BASE_URL}vault-icon.svg`
  const [form, setForm] = useState({ ...SUPERADMIN_CREDENTIALS, mfaCode: '' })
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
      navigate('/control-tower/dashboard')
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="vault-login-page">
      <div className="vault-login-card">
        <div className="vault-login-card-header">
          <div className="vault-login-brand">
            <img className="vault-app-icon" src={appIconUrl} alt="Vault" />
            <div className="vault-app-name">PHARAXIS VAULT</div>
          </div>
          <div className="vault-app-tagline">Global SuperAdmin Control Console</div>
          <div className="vault-login-health">
            <span className="vault-health-pill">Frontend: On</span>
            <span className="vault-health-pill">
              Backend: {backendOnline === null ? 'Checking' : (backendOnline ? 'On' : 'Off')}
            </span>
          </div>
        </div>

        <div className="vault-login-card-body">
          <form className="vault-login-form" onSubmit={handleSubmit}>
            <div className="panel-note">Dedicated SuperAdmin access portal</div>
            <div className="vault-form-group">
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                required
                autoComplete="email"
                placeholder="superadmin@pharaxis.local"
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
            <button className="btn-primary vault-login-btn" type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
