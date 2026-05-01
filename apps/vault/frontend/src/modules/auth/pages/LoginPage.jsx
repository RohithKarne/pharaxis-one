import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const SUPERADMIN_CREDENTIALS = {
  email: 'superadmin@pharaxis.local',
  password: 'Super@123',
}

export default function LoginPage() {
  const appIconUrl = `${import.meta.env.BASE_URL}vault-icon.svg`
  const [mode, setMode] = useState('app')
  const [form, setForm] = useState({ email: '', password: '', orgSlug: '', mfaCode: '' })
  const [superadminForm, setSuperadminForm] = useState({ ...SUPERADMIN_CREDENTIALS, mfaCode: '' })
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const [backendOnline, setBackendOnline] = useState(null)
  const [mfaChallengeToken, setMfaChallengeToken] = useState('')
  const [superadminMfaChallengeToken, setSuperadminMfaChallengeToken] = useState('')
  const [ssoDiscovery, setSsoDiscovery] = useState(null)
  const navigate = useNavigate()

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value })
  const handleSuperadminChange = e => setSuperadminForm(current => ({ ...current, [e.target.name]: e.target.value }))

  function switchMode(nextMode) {
    setMode(nextMode)
    setError('')
    setInfo('')
    setMfaChallengeToken('')
    setSuperadminMfaChallengeToken('')
    if (nextMode === 'superadmin') {
      setSuperadminForm({ ...SUPERADMIN_CREDENTIALS, mfaCode: '' })
    }
  }

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
      localStorage.removeItem('vault_token')
      localStorage.setItem('vault_user', JSON.stringify(data.user))
      navigate('/vault')
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  const handleSuperadminSubmit = async e => {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)
    try {
      const res = await fetch('/api/superadmin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: superadminForm.email,
          password: superadminForm.password,
          mfa_code: superadminForm.mfaCode || undefined,
          mfa_challenge_token: superadminMfaChallengeToken || undefined
        })
      })
      const data = await res.json()
      if (res.status === 202 && data.mfa_required) {
        setSuperadminMfaChallengeToken(data.mfa_challenge_token || '')
        setInfo(data.dev_code ? `MFA required. Dev code: ${data.dev_code}` : 'MFA required. Enter the 6-digit code.')
        setLoading(false)
        return
      }
      if (!res.ok) { setError(data.error || 'Login failed'); setLoading(false); return }
      localStorage.removeItem('vault_superadmin_token')
      localStorage.setItem('vault_superadmin', JSON.stringify(data.superadmin))
      navigate('/control-tower/dashboard')
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
            {mode === 'app' ? (
              <button className="vault-superadmin-switch" type="button" onClick={() => switchMode('superadmin')}>
                Superadmin
              </button>
            ) : null}
          </div>
          <div className="vault-app-tagline">
            {mode === 'superadmin' ? 'Global SuperAdmin Control Console' : 'Regulated Content Management Platform'}
          </div>
          <div className="vault-login-health">
            <span className="vault-health-pill">Frontend: On</span>
            <span className="vault-health-pill">
              Backend: {backendOnline === null ? 'Checking' : (backendOnline ? 'On' : 'Off')}
            </span>
          </div>
        </div>

        <div className="vault-login-card-body">
          {mode === 'superadmin' ? (
          <form className="vault-login-form" onSubmit={handleSuperadminSubmit}>
            <div className="panel-note">Superadmin access for global platform control.</div>
            <div className="vault-form-group">
              <label htmlFor="superadminEmail">Email Address</label>
              <input
                id="superadminEmail"
                name="email"
                type="email"
                value={superadminForm.email}
                onChange={handleSuperadminChange}
                required
                autoComplete="username"
                placeholder="superadmin@pharaxis.local"
              />
            </div>

            <div className="vault-form-group">
              <label htmlFor="superadminPassword">Password</label>
              <input
                id="superadminPassword"
                name="password"
                type="password"
                value={superadminForm.password}
                onChange={handleSuperadminChange}
                required
                autoComplete="current-password"
                placeholder="Enter your password"
              />
            </div>

            {superadminMfaChallengeToken ? (
              <div className="vault-form-group">
                <label htmlFor="superadminMfaCode">MFA Code</label>
                <input
                  id="superadminMfaCode"
                  name="mfaCode"
                  value={superadminForm.mfaCode}
                  onChange={handleSuperadminChange}
                  placeholder="6-digit code"
                />
              </div>
            ) : null}

            {error ? <div className="auth-error">{error}</div> : null}
            {info ? <div className="upload-success">{info}</div> : null}
            <button className="btn-primary vault-login-btn" type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
            <button className="btn-secondary vault-login-btn" type="button" onClick={() => switchMode('app')} disabled={loading}>
              Back to App Login
            </button>
          </form>
          ) : (
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
          )}
        </div>
      </div>
    </div>
  )
}
