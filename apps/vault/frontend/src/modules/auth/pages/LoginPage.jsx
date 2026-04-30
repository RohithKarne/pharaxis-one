import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function LoginPage() {
  const appIconUrl = `${import.meta.env.BASE_URL}vault-icon.svg`
  const [form, setForm] = useState({ email: '', password: '', orgSlug: '', mfaCode: '' })
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const [backendOnline, setBackendOnline] = useState(null)
  const [mfaChallengeToken, setMfaChallengeToken] = useState('')
  const [ssoDiscovery, setSsoDiscovery] = useState(null)
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
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          orgSlug: form.orgSlug,
          mfa_code: form.mfaCode || undefined,
          mfa_challenge_token: mfaChallengeToken || undefined
        })
      })
      const data = await res.json()
      if (res.status === 202 && data.mfa_required) {
        setMfaChallengeToken(data.mfa_challenge_token || '')
        setInfo('MFA required. Enter the 6-digit code and sign in again.')
        if (data.dev_code) setInfo(`MFA required. Dev code: ${data.dev_code}`)
        setLoading(false)
        return
      }
      if (!res.ok) { setError(data.error || 'Login failed'); setLoading(false); return }
      localStorage.setItem('vault_token', data.token)
      localStorage.setItem('vault_user', JSON.stringify(data.user))
      navigate('/vault')
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  async function discoverSso(orgSlug) {
    const trimmed = String(orgSlug || '').trim()
    if (!trimmed) {
      setSsoDiscovery(null)
      return
    }
    try {
      const res = await fetch(`/api/auth/sso/discovery/${encodeURIComponent(trimmed)}`)
      if (!res.ok) {
        setSsoDiscovery(null)
        return
      }
      const payload = await res.json()
      setSsoDiscovery(payload)
    } catch {
      setSsoDiscovery(null)
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
          <div className="vault-app-tagline">Regulated Content Management Platform</div>
          <div className="vault-login-health">
            <span className="vault-health-pill">Frontend: On</span>
            <span className="vault-health-pill">
              Backend: {backendOnline === null ? 'Checking' : (backendOnline ? 'On' : 'Off')}
            </span>
          </div>
        </div>

        <div className="vault-login-card-body">
          <form className="vault-login-form" onSubmit={handleSubmit}>
            <div className="vault-form-group">
              <label htmlFor="orgSlug">Organization Slug</label>
              <input
                id="orgSlug"
                name="orgSlug"
                value={form.orgSlug}
                onChange={event => {
                  handleChange(event)
                  discoverSso(event.target.value)
                }}
                required
                placeholder="e.g. novartis"
              />
            </div>

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
                placeholder="you@company.com"
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

            {ssoDiscovery?.sso_enabled ? (
              <div className="panel-note">
                SSO available: {ssoDiscovery.sso_provider || 'Configured'} ({ssoDiscovery.org_name})
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
