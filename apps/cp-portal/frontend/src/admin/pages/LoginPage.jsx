import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAdminAuth } from '../context/AdminAuthContext'

export default function LoginPage() {
  const { login, admin } = useAdminAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = location.state?.from || '/admin'

  // AUTH-04: redirect already-authenticated admins away from the login page
  useEffect(() => {
    if (admin) navigate(returnTo, { replace: true })
  }, [admin, navigate, returnTo])
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [mode, setMode] = useState('admin')

  // Two-step sign-in (Rohith's sign-in Tier 1, 12 Oct 2026): after the password,
  // a code from email or an authenticator app. Set up on the first sign-in.
  const [twoFactor, setTwoFactor] = useState(null)
  const [method, setMethod] = useState('email')
  const [code, setCode] = useState('')
  const [backupCode, setBackupCode] = useState('')
  const [rememberDevice, setRememberDevice] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [totpSetup, setTotpSetup] = useState(null)
  const [backupCodes, setBackupCodes] = useState(null)
  const [finished, setFinished] = useState(null)

  function switchMode(nextMode) {
    setMode(nextMode)
    setError('')
    setEmail('')
    setPassword('')
    setTwoFactor(null)
  }

  async function post(url, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    return { res, data }
  }

  async function finish(data) {
    if (mode === 'superadmin' && data.admin?.role !== 'superadmin') {
      // The server has already signed this person in; end that session, or the
      // refusal on screen is not a refusal at all — the next page load is signed in.
      await fetch('/api/admin/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {})
      setError('Superadmin access required.')
      setPassword('')
      setTwoFactor(null)
      return
    }
    login(data.token, data.admin)
    navigate(returnTo, { replace: true })
  }

  async function handleLogin(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const { res, data } = await post('/api/admin/auth/login', { email, password })
      if (!res.ok) {
        setError(data.error || 'Login failed.')
        setPassword('')
        return
      }
      if (data.challengeToken) {
        setTwoFactor(data)
        setMethod(data.preferredMethod || data.availableMethods?.[0] || 'totp')
        setCode(''); setBackupCode(''); setEmailSent(false); setTotpSetup(null); setRememberDevice(false)
        return
      }
      await finish(data)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function sendEmailCode() {
    setError(''); setLoading(true)
    try {
      const { res, data } = await post('/api/admin/auth/2fa/send-email-code', { challengeToken: twoFactor.challengeToken })
      if (!res.ok) return setError(data.error || 'Could not send the code.')
      setEmailSent(true)
    } catch { setError('Network error. Please try again.') } finally { setLoading(false) }
  }

  async function startTotpSetup() {
    setError(''); setLoading(true)
    try {
      const { res, data } = await post('/api/admin/auth/2fa/setup/totp', { challengeToken: twoFactor.challengeToken })
      if (!res.ok) return setError(data.error || 'Could not start the set-up.')
      setTotpSetup(data)
    } catch { setError('Network error. Please try again.') } finally { setLoading(false) }
  }

  async function verifyTwoFactor(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const { res, data } = await post('/api/admin/auth/2fa/verify', {
        challengeToken: twoFactor.challengeToken, method: backupCode ? undefined : method, code, backupCode, rememberDevice,
      })
      if (!res.ok) {
        setError(data.error || 'Verification failed.')
        setCode('')
        if (res.status === 423 || res.status === 401 && /Start again/.test(data.error || '')) setTwoFactor(null)
        return
      }
      if (data.backupCodes?.length) { setBackupCodes(data.backupCodes); setFinished(data); return }
      await finish(data)
    } catch { setError('Network error. Please try again.') } finally { setLoading(false) }
  }

  const setup = twoFactor && !twoFactor.twoFactorRequired

  return (
    <div className="cp-login-page">
      <div className="cp-login-card">
        <div className="cp-login-brand">
          <div className="cp-login-brand-row">
            <span className="cp-login-icon">&#9877;</span>
            {mode === 'admin' && !twoFactor ? (
              <button className="cp-superadmin-switch" type="button" onClick={() => switchMode('superadmin')}>
                Superadmin
              </button>
            ) : null}
          </div>
          <h1>CP Portal</h1>
          <p>{mode === 'superadmin' ? 'Superadmin Console' : 'Admin Console'}</p>
        </div>

        {backupCodes ? (
          <div className="cp-login-form" data-testid="backup-codes">
            <h2 style={{ fontSize: 16, margin: '0 0 6px' }}>Save your backup codes</h2>
            <p style={{ fontSize: 13, color: 'var(--cp-text-muted, #555)', margin: '0 0 12px' }}>
              Each code signs you in once if you lose your phone or your mailbox. Keep them somewhere safe; they are shown only now.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              {backupCodes.map(c => <code key={c} style={{ padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6, fontWeight: 700 }}>{c}</code>)}
            </div>
            <button type="button" className="cp-btn cp-btn-primary" onClick={() => finish(finished)}>I have saved them, continue</button>
          </div>
        ) : twoFactor ? (
          <form onSubmit={verifyTwoFactor} className="cp-login-form" data-testid="two-factor">
            <h2 style={{ fontSize: 16, margin: '0 0 6px' }}>{setup ? 'Set up two-step sign-in' : 'Two-step sign-in'}</h2>
            <p style={{ fontSize: 13, color: 'var(--cp-text-muted, #555)', margin: '0 0 12px' }}>
              {setup
                ? 'Every administrator signs in with a password and a second step. Choose how you will get your code.'
                : 'Password accepted. Enter the code to finish signing in.'}
            </p>
            {twoFactor.availableMethods?.length > 1 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {twoFactor.availableMethods.map(m => (
                  <button key={m} type="button" className={`cp-btn ${method === m ? 'cp-btn-primary' : 'cp-btn-secondary'}`}
                    style={{ flex: 1 }} onClick={() => { setMethod(m); setCode(''); setBackupCode('') }}>
                    {m === 'email' ? 'Email code' : 'Authenticator app'}
                  </button>
                ))}
              </div>
            )}
            {method === 'email' && (
              <div className="cp-field">
                <button type="button" className="cp-btn cp-btn-secondary" onClick={sendEmailCode} disabled={loading} style={{ marginBottom: 8 }}>
                  {emailSent ? 'Send the code again' : `Send a code to ${twoFactor.maskedEmail}`}
                </button>
                <label>Code from the email</label>
                <input type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} placeholder="6-digit code" aria-label="Code from the email" />
              </div>
            )}
            {method === 'totp' && (
              <div className="cp-field">
                {setup && !totpSetup && (
                  <button type="button" className="cp-btn cp-btn-secondary" onClick={startTotpSetup} disabled={loading} style={{ marginBottom: 8 }}>
                    Show the QR code for my authenticator app
                  </button>
                )}
                {totpSetup && (
                  <div style={{ marginBottom: 10 }}>
                    <img src={totpSetup.qrUrl} alt="Authenticator QR code" style={{ width: 180, height: 180, border: '1px solid #ccc', borderRadius: 8, background: '#fff', padding: 6, display: 'block', marginBottom: 8 }} />
                    <div style={{ fontSize: 12, color: '#555', marginBottom: 4 }}>Or type this key into the app:</div>
                    <code data-testid="totp-secret" style={{ display: 'block', padding: '6px 8px', border: '1px solid #ccc', borderRadius: 6, wordBreak: 'break-all' }}>{totpSetup.secret}</code>
                  </div>
                )}
                <label>Code from the app</label>
                <input type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} placeholder="6-digit code" aria-label="Code from the app" />
              </div>
            )}
            {!setup && (
              <div className="cp-field">
                <label>Or a backup code</label>
                <input type="text" value={backupCode} onChange={e => setBackupCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX" aria-label="Backup code" />
              </div>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, margin: '4px 0 12px', cursor: 'pointer' }}>
              <input type="checkbox" checked={rememberDevice} onChange={e => setRememberDevice(e.target.checked)} />
              Remember this device for {twoFactor.rememberDays} days
            </label>
            {error && <div className="cp-error">{error}</div>}
            <button type="submit" className="cp-btn cp-btn-primary" disabled={loading}>
              {loading ? 'Checking…' : (setup ? 'Turn on and sign in' : 'Verify and sign in')}
            </button>
            <button type="button" className="cp-btn cp-btn-secondary" onClick={() => { setTwoFactor(null); setError(''); setPassword('') }} disabled={loading}>
              Back
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="cp-login-form">
            <div className="cp-field">
              <label>Username</label>
              <input type="text" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="Enter username or email" autoFocus required />
            </div>
            <div className="cp-field cp-field-password">
              <label>Password</label>
              <div className="cp-input-wrapper" style={{ position: 'relative' }}>
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required />
                <button
                  type="button"
                  className="cp-password-toggle"
                  style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', minHeight: 24, minWidth: 24 }}
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
        )}
      </div>
    </div>
  )
}
