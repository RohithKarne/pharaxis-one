import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'
import usePageTitle from '../hooks/usePageTitle'

export default function LoginPage() {
  const { clientCode, login, user, portalConfig, t } = usePortal()
  const navigate              = useNavigate()
  const location              = useLocation()
  const base                  = `/portal/${clientCode}`
  const returnTo              = location.state?.from || base

  usePageTitle(t('Sign In'))

  // AUTH-03: redirect already-authenticated users away from the login page
  useEffect(() => {
    if (user) navigate(base, { replace: true })
  }, [user, base, navigate])

  const [form, setForm]       = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  // LOW-09: show/hide password toggle
  const [showLoginPassword, setShowLoginPassword]       = useState(false)
  // CPPM-113: a doctor with no account can ask for one.
  const [requesting, setRequesting] = useState(false)
  // Two-step sign-in (row 6 of the 27 Oct review): set once the password passes on a
  // portal that asks for an emailed code.
  const [challenge, setChallenge] = useState(null)

  // SSO: which OIDC providers this portal offers, and whether local password
  // login is still allowed (a portal may be configured sso_only).
  const [ssoProviders, setSsoProviders] = useState([])
  const [localAllowed, setLocalAllowed] = useState(true)

  useEffect(() => {
    if (!clientCode) return
    let cancelled = false
    fetch(`/api/portal/auth/sso/providers?client_code=${encodeURIComponent(clientCode)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d) return
        setSsoProviders(Array.isArray(d.providers) ? d.providers : [])
        setLocalAllowed(d.local_login_allowed !== false)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [clientCode])

  function startSso(provider) {
    const rt = returnTo && returnTo !== base ? `&return_to=${encodeURIComponent(returnTo)}` : ''
    window.location.href = `/api/portal/auth/sso/${provider.key}/start?client_code=${encodeURIComponent(clientCode)}${rt}`
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); setError('') }

  async function handleLogin(e) {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const res  = await fetch(`/api/portal/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_code: clientCode, email: form.email, password: form.password })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Login failed.')
        // LOW-35: clear password on failed login
        setForm(f => ({ ...f, password: '' }))
        return
      }
      if (data.twoStep) { setChallenge(data); setForm(f => ({ ...f, password: '' })); return }
      login(data.user, data.token)
      navigate(returnTo, { replace: true })
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pp-auth-page">
      <div className="pp-auth-card">
        {error && <div className="pp-error-msg" id="pp-login-error" role="alert">{error}</div>}

        {challenge ? (
          <SignInCode challenge={challenge} onBack={() => { setChallenge(null); setError('') }}
            onDone={u => { login(u); navigate(returnTo, { replace: true }) }} />
        ) : requesting ? (
          <RequestAccess clientCode={clientCode} userTypes={portalConfig?.gate?.userTypes} onBack={() => setRequesting(false)} />
        ) : (<>
        <div className="pp-auth-footer" style={{ marginBottom: 16, textAlign: 'left' }}>
          Accounts are approved by the portal team.{' '}
          {localAllowed && <button type="button" className="pp-link-btn" onClick={() => { setRequesting(true); setError('') }}>{t('No account? Request access')}</button>}
        </div>

        {/* SSO: single sign-on with the portal's configured identity providers */}
        {ssoProviders.length > 0 && (
          <div className="pp-sso-group">
            {ssoProviders.map(p => (
              <button key={p.key} type="button" className="pp-sso-btn" onClick={() => startSso(p)}>
                Continue with {p.label}
              </button>
            ))}
            {localAllowed && <div className="pp-sso-divider"><span>{t('or')}</span></div>}
          </div>
        )}

        {localAllowed && (
        <form onSubmit={handleLogin} className="pp-auth-form">
          {/* CPPM-105: each label is tied to its box, so a screen reader names the
              field and clicking the label puts the cursor in it. */}
          <div className="pp-field">
            <label htmlFor="pp-login-email">{t('Email Address')}</label>
            <input id="pp-login-email" type="email" required value={form.email} onChange={e => set('email', e.target.value)} placeholder={t('you@example.com')} aria-invalid={!!error} aria-describedby={error ? 'pp-login-error' : undefined} />
          </div>
          {/* LOW-09: password show/hide toggle */}
          <div className="pp-field pp-field-password">
            <label htmlFor="pp-login-password">{t('Password')}</label>
            <div className="pp-input-wrapper">
              <input id="pp-login-password" type={showLoginPassword ? 'text' : 'password'} required value={form.password} onChange={e => set('password', e.target.value)} placeholder="••••••••" />
              <button type="button" className="pp-password-toggle" onClick={() => setShowLoginPassword(s => !s)} aria-label={showLoginPassword ? 'Hide password' : 'Show password'}>
                {showLoginPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <button type="submit" className="pp-btn pp-btn-primary pp-btn-full" disabled={loading}>
            {loading ? t('Signing in…') : t('Sign In')}
          </button>
          <div style={{ marginTop: 14, textAlign: 'center' }}>
            <button type="button" className="pp-link-btn" onClick={() => navigate(`${base}/forgot-password`)}>
              {t('Forgot your password?')}
            </button>
          </div>
        </form>
        )}
        </>)}
      </div>
    </div>
  )
}

// Step two: the six-digit code from the email.
function SignInCode({ challenge, onBack, onDone }) {
  const { t } = usePortal()
  const [code, setCode] = useState('')
  const [remember, setRemember] = useState(false) // E5: unticked unless the doctor chooses it
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  async function post(path, body) {
    const res = await fetch(`/api/portal/auth/login/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken: challenge.challengeToken, ...body }),
    })
    return { res, data: await res.json().catch(() => ({})) }
  }

  async function verify(e) {
    e.preventDefault(); setBusy(true); setError(''); setNote('')
    try {
      const { res, data } = await post('verify', { code, rememberBrowser: remember })
      if (!res.ok) { setError(data.error || t('That code is not right.')); setCode(''); return }
      onDone(data.user)
    } catch { setError('Network error. Please check your connection and try again.') } finally { setBusy(false) }
  }

  async function resend() {
    setError(''); setNote('')
    try {
      const { res, data } = await post('resend', {})
      if (!res.ok) { setError(data.error || 'Could not send a new code.'); return }
      setNote(t('A new code is on its way. Earlier codes no longer work.'))
    } catch { setError('Network error. Please check your connection and try again.') }
  }

  return (
    <form onSubmit={verify} className="pp-auth-form" aria-labelledby="pp-code-title">
      <h2 id="pp-code-title" style={{ fontSize: 18, margin: '0 0 4px' }}>{t('Enter your sign-in code')}</h2>
      <p style={{ margin: '0 0 14px', fontSize: 14, color: 'var(--pp-text-muted, #6B7280)' }}>
        {t('We emailed a six-digit code to')} {challenge.maskedEmail}. {t('It works for')} {challenge.expiresInMinutes} {t('minutes.')}
      </p>
      {error && <div className="pp-error-msg" role="alert" id="pp-code-error">{error}</div>}
      {note && <div className="pp-success-msg" role="status">{note}</div>}
      <div className="pp-field">
        <label htmlFor="pp-login-code">{t('Code from the email')}</label>
        <input id="pp-login-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus
          value={code} onChange={e => { setCode(e.target.value.replace(/\D/g, '')); setError('') }}
          aria-invalid={!!error} aria-describedby={error ? 'pp-code-error' : undefined} />
      </div>
      <div className="pp-field">
        <label className="pp-checkbox-label">
          <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
          <span>{t('Remember this browser for 7 days. Do not tick this on a shared computer.')}</span>
        </label>
      </div>
      <button type="submit" className="pp-btn pp-btn-primary pp-btn-full" disabled={busy || code.length !== 6}>
        {busy ? t('Signing in…') : t('Sign In')}
      </button>
      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between' }}>
        <button type="button" className="pp-link-btn" onClick={resend}>{t('Send a new code')}</button>
        <button type="button" className="pp-link-btn" onClick={onBack}>{t('Back to sign in')}</button>
      </div>
    </form>
  )
}

// The roles a portal always knows (see the server's DEFAULT_TYPES); a portal with the
// identity gate on lists its own instead.
const ROLE_CHOICES = [
  { type_key: 'hcp',       label: 'Healthcare professional' },
  { type_key: 'physician', label: 'Physician or specialist' },
  { type_key: 'patient',   label: 'Patient or caregiver' },
  { type_key: 'non_hcp',   label: 'Other healthcare-related role' },
  { type_key: 'other',     label: 'Other' },
]

function RequestAccess({ clientCode, userTypes, onBack }) {
  const { t } = usePortal()
  const roles = Array.isArray(userTypes) && userTypes.length ? userTypes : ROLE_CHOICES
  const [f, setF] = useState({ first_name: '', last_name: '', email: '', user_type: '', country: '', weekly_email: false, license_number: '', registry_type: 'npi' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const set = (k, v) => { setF(x => ({ ...x, [k]: v })); setError('') }

  async function send(e) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const res = await fetch('/api/portal/auth/request-access', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_code: clientCode, ...f }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error || 'Your request could not be sent. Please try again.'); return }
      setDone(d.message)
    } catch { setError('Network error. Please check your connection and try again.') } finally { setBusy(false) }
  }

  if (done) {
    return (
      <div role="status">
        <h2 style={{ fontSize: 18, margin: '0 0 8px' }}>{t('Request sent')}</h2>
        <p style={{ margin: '0 0 16px' }}>{done}</p>
        <button type="button" className="pp-btn pp-btn-outline pp-btn-full" onClick={onBack}>{t('Back to sign in')}</button>
      </div>
    )
  }
  return (
    <form onSubmit={send} className="pp-auth-form" aria-labelledby="pp-request-title">
      <h2 id="pp-request-title" style={{ fontSize: 18, margin: '0 0 4px' }}>{t('Request access')}</h2>
      <p style={{ margin: '0 0 14px', fontSize: 14, color: 'var(--pp-text-muted, #6B7280)' }}>{t('The portal team reviews each request. Once approved, you get an email to set your password.')}</p>
      {error && <div className="pp-error-msg" role="alert">{error}</div>}
      <div className="pp-field"><label htmlFor="ra-first">{t('First name')}</label><input id="ra-first" required maxLength={255} value={f.first_name} onChange={e => set('first_name', e.target.value)} autoComplete="given-name" /></div>
      <div className="pp-field"><label htmlFor="ra-last">{t('Last name')}</label><input id="ra-last" required maxLength={255} value={f.last_name} onChange={e => set('last_name', e.target.value)} autoComplete="family-name" /></div>
      <div className="pp-field"><label htmlFor="ra-email">{t('Work email')}</label><input id="ra-email" type="email" required maxLength={254} value={f.email} onChange={e => set('email', e.target.value)} autoComplete="email" /></div>
      <div className="pp-field"><label htmlFor="ra-role">{t('Your role')}</label>
        <select id="ra-role" required value={f.user_type} onChange={e => set('user_type', e.target.value)}>
          <option value="">{t('-- Select --')}</option>
          {roles.map(r => <option key={r.type_key} value={r.type_key}>{r.label}</option>)}
        </select>
      </div>
      {['hcp', 'physician', 'doctor'].includes(f.user_type) && (
        <>
          <div className="pp-field">
            <label htmlFor="ra-registry">{t('Medical Registry')}</label>
            <select id="ra-registry" value={f.registry_type || 'npi'} onChange={e => set('registry_type', e.target.value)}>
              <option value="npi">US National Provider Identifier (NPI)</option>
              <option value="gmc">UK General Medical Council (GMC)</option>
              <option value="national_license">Other National Medical License</option>
            </select>
          </div>
          <div className="pp-field">
            <label htmlFor="ra-license">{t('Medical Registration / License Number')}</label>
            <input
              id="ra-license"
              required
              value={f.license_number || ''}
              onChange={e => set('license_number', e.target.value)}
              placeholder={f.registry_type === 'gmc' ? '7-digit GMC number' : '10-digit NPI number'}
            />
            <div style={{ fontSize: 12, color: 'var(--pp-text-muted, #6B7280)', marginTop: 4 }}>
              {t('Verified medical registration is required to access Continuing Medical Education (CME) and clinical materials.')}
            </div>
          </div>
        </>
      )}
      <div className="pp-field"><label htmlFor="ra-country">{t('Country')}</label><input id="ra-country" required maxLength={100} value={f.country} onChange={e => set('country', e.target.value)} autoComplete="country-name" /></div>
      {/* CPPM-101: the reader's own yes to the weekly email, never ticked for them. */}
      <div className="pp-field">
        <label className="pp-checkbox-label">
          <input type="checkbox" checked={f.weekly_email} onChange={e => set('weekly_email', e.target.checked)} />
          <span>{t('Email me a weekly update of new content. You can switch it off at any time in your preferences.')}</span>
        </label>
      </div>
      <button type="submit" className="pp-btn pp-btn-primary pp-btn-full" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
      <div style={{ marginTop: 14, textAlign: 'center' }}>
        <button type="button" className="pp-link-btn" onClick={onBack}>{t('Back to sign in')}</button>
      </div>
    </form>
  )
}
