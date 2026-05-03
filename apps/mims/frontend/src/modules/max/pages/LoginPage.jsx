/**
 * LoginPage.jsx
 * Handles sign-in flows for app and superadmin access.
 * Calls the Express backend API and uses AuthContext to store the session.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import { httpFetch } from '../../../shared/api/httpFetch.js'

const SUPERADMIN_CREDENTIALS = {
  email: 'superadmin',
  password: 'Manager@123',
}

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState('app')
  const [alert, setAlert] = useState({ show: false, type: 'error', msg: '' })
  const [loading, setLoading] = useState(false)
  const [backendOnline, setBackendOnline] = useState(null)
  const [twoFactor, setTwoFactor] = useState(null)
  const [twoFactorMethod, setTwoFactorMethod] = useState('email')
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const [backupCode, setBackupCode] = useState('')
  const [rememberDevice, setRememberDevice] = useState(true)
  const [emailCodeSent, setEmailCodeSent] = useState(false)
  const [totpSetup, setTotpSetup] = useState(null)
  const [postLoginData, setPostLoginData] = useState(null)
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotStep, setForgotStep] = useState('email')
  const [forgotForm, setForgotForm] = useState({ email: '', code: '', newPassword: '', confirm: '' })
  const [forgotMeta, setForgotMeta] = useState({ maskedEmail: '', resetToken: '' })
  const [loginStage, setLoginStage] = useState('email')
  const [ssoChoices, setSsoChoices] = useState([])

  // Login form state
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })

  function showAlert(msg, type = 'error') {
    setAlert({ show: true, type, msg })
  }

  function switchMode(nextMode) {
    setMode(nextMode)
    setAlert({ show: false, type: 'error', msg: '' })
    setLoginForm(nextMode === 'superadmin' ? SUPERADMIN_CREDENTIALS : { email: '', password: '' })
    setLoginStage('email')
    setSsoChoices([])
    resetTwoFactorState()
    resetForgotPasswordState()
  }

  function resetTwoFactorState() {
    setTwoFactor(null)
    setTwoFactorMethod('email')
    setTwoFactorCode('')
    setBackupCode('')
    setRememberDevice(true)
    setEmailCodeSent(false)
    setTotpSetup(null)
    setPostLoginData(null)
  }

  function resetForgotPasswordState() {
    setForgotOpen(false)
    setForgotStep('email')
    setForgotForm({ email: '', code: '', newPassword: '', confirm: '' })
    setForgotMeta({ maskedEmail: '', resetToken: '' })
  }

  function finishLogin(data) {
    if (data.rememberedDeviceToken) {
      localStorage.setItem('mims_2fa_device_token', data.rememberedDeviceToken)
    }
    login(data.user, data.token, data.modules || [], {
      orgId: data.orgId || null,
      siteId: data.siteId || null,
      orgName: data.orgName || null,
      siteName: data.siteName || null,
      allOrgs: data.allOrgs || [],
      sessionTimeout: data.sessionTimeout ?? 30,
    })
    navigate(data.user?.role === 'superadmin' && mode === 'superadmin' ? '/superadmin' : '/dashboard')
  }

  useEffect(() => {
    let cancelled = false
    async function ping() {
      try {
        const res = await httpFetch('/api/health', { cache: 'no-store' })
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

  function resetAppLoginToEmail() {
    setLoginStage('email')
    setSsoChoices([])
    setLoginForm(f => ({ ...f, password: '' }))
    setAlert({ show: false, type: 'error', msg: '' })
    resetTwoFactorState()
    resetForgotPasswordState()
  }

  function redirectToSso(url) {
    if (!url) {
      showAlert('SSO is not configured for this account. Contact your administrator.')
      return
    }
    window.location.href = url
  }

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setAlert({ show: false })

    try {
      if (mode === 'app' && loginStage === 'email') {
        const email = loginForm.email.trim()
        if (!email) return showAlert('Email is required.')

        const res = await httpFetch('/api/auth/login/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            return_to: `${window.location.origin}/mims/auth/sso-complete`,
          })
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) return showAlert(data.error || 'Could not start sign in.')

        if (data.outcome === 'sso_redirect') {
          redirectToSso(data.redirect_url)
          return
        }
        if (data.outcome === 'choice_required') {
          setSsoChoices(Array.isArray(data.options) ? data.options : [])
          setLoginStage('choice')
          return
        }
        if (data.outcome === 'local_password') {
          setLoginStage('password')
          setLoginForm(f => ({ ...f, email, password: '' }))
          return
        }
        return showAlert(data.error || 'Unable to start sign in. Contact your administrator.')
      }

      const res = await httpFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...loginForm,
          rememberedDeviceToken: localStorage.getItem('mims_2fa_device_token') || '',
        })
      })
      const data = await res.json()

      if (!res.ok) return showAlert(data.error || 'Login failed.')

      if (data.noOrgAccess) {
        return showAlert('No organisation assigned to your account. Contact your administrator.')
      }

      if (mode === 'superadmin' && data.user?.role !== 'superadmin') {
        return showAlert('Superadmin access required.')
      }

      if (data.passwordResetRequired) {
        // Store reset token in AuthContext so ResetPasswordPage can use useAuth().token
        login(data.user, data.token, [], {})
        return navigate('/reset-password')
      }

      if (data.twoFactorRequired || data.twoFactorSetupAvailable) {
        setTwoFactor(data)
        setTwoFactorMethod(data.preferredMethod || data.availableMethods?.[0] || 'email')
        setRememberDevice(true)
        setTwoFactorCode('')
        setBackupCode('')
        setEmailCodeSent(false)
        setTotpSetup(null)
        return
      }

      finishLogin(data)
    } catch {
      showAlert('Cannot connect to server.')
    } finally {
      setLoading(false)
    }
  }

  async function sendEmailCode() {
    if (!twoFactor?.challengeToken) return
    setLoading(true)
    setAlert({ show: false })
    try {
      const res = await httpFetch('/api/auth/2fa/send-email-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeToken: twoFactor.challengeToken }),
      })
      const data = await res.json()
      if (!res.ok) return showAlert(data.error || 'Could not send verification code.')
      setEmailCodeSent(true)
      showAlert(`Verification code sent to ${data.maskedEmail}.`, 'success')
    } catch {
      showAlert('Cannot connect to server.')
    } finally {
      setLoading(false)
    }
  }

  async function startTotpSetup() {
    if (!twoFactor?.challengeToken) return
    setLoading(true)
    setAlert({ show: false })
    try {
      const res = await httpFetch('/api/auth/2fa/setup/totp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeToken: twoFactor.challengeToken }),
      })
      const data = await res.json()
      if (!res.ok) return showAlert(data.error || 'Could not start authenticator setup.')
      setTotpSetup(data)
    } catch {
      showAlert('Cannot connect to server.')
    } finally {
      setLoading(false)
    }
  }

  async function verifyTwoFactor(e) {
    e.preventDefault()
    if (!twoFactor?.challengeToken) return
    setLoading(true)
    setAlert({ show: false })
    try {
      const res = await httpFetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeToken: twoFactor.challengeToken,
          method: backupCode ? undefined : twoFactorMethod,
          code: twoFactorCode,
          backupCode,
          rememberDevice,
        }),
      })
      const data = await res.json()
      if (!res.ok) return showAlert(data.error || '2FA verification failed.')
      if (data.backupCodes?.length) {
        setPostLoginData(data)
        showAlert('2FA enabled. Save your backup codes before continuing.', 'success')
        return
      }
      resetTwoFactorState()
      finishLogin(data)
    } catch {
      showAlert('Cannot connect to server.')
    } finally {
      setLoading(false)
    }
  }

  async function skipTwoFactorSetup() {
    if (!twoFactor?.challengeToken) return
    setLoading(true)
    setAlert({ show: false })
    try {
      const res = await httpFetch('/api/auth/2fa/skip-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeToken: twoFactor.challengeToken }),
      })
      const data = await res.json()
      if (!res.ok) return showAlert(data.error || 'Could not skip setup.')
      resetTwoFactorState()
      finishLogin(data)
    } catch {
      showAlert('Cannot connect to server.')
    } finally {
      setLoading(false)
    }
  }

  async function sendForgotPasswordCode() {
    if (!forgotForm.email.trim()) return showAlert('Enter your email first.')
    setLoading(true)
    setAlert({ show: false })
    try {
      const res = await httpFetch('/api/auth/forgot-password/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotForm.email.trim() }),
      })
      const data = await res.json()
      if (!res.ok) return showAlert(data.error || 'Could not send forgot-password code.')
      setForgotMeta(meta => ({ ...meta, maskedEmail: data.maskedEmail || '' }))
      setForgotStep('code')
      showAlert(`Verification code sent to ${data.maskedEmail}.`, 'success')
    } catch {
      showAlert('Cannot connect to server.')
    } finally {
      setLoading(false)
    }
  }

  async function verifyForgotPasswordCode() {
    if (!forgotForm.code.trim()) return showAlert('Enter the verification code.')
    setLoading(true)
    setAlert({ show: false })
    try {
      const res = await httpFetch('/api/auth/forgot-password/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotForm.email.trim(), code: forgotForm.code.trim() }),
      })
      const data = await res.json()
      if (!res.ok) return showAlert(data.error || 'Could not verify code.')
      setForgotMeta(meta => ({ ...meta, resetToken: data.resetToken }))
      setForgotStep('reset')
      showAlert('Code verified. Set your new password.', 'success')
    } catch {
      showAlert('Cannot connect to server.')
    } finally {
      setLoading(false)
    }
  }

  async function completeForgotPasswordReset() {
    if (forgotForm.newPassword !== forgotForm.confirm) return showAlert('Passwords do not match.')
    if (forgotForm.newPassword.length < 8) return showAlert('Password must be at least 8 characters.')
    setLoading(true)
    setAlert({ show: false })
    try {
      const res = await httpFetch('/api/auth/forgot-password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetToken: forgotMeta.resetToken, newPassword: forgotForm.newPassword }),
      })
      const data = await res.json()
      if (!res.ok) return showAlert(data.error || 'Could not reset password.')
      showAlert(data.message || 'Password updated successfully. Please sign in again.', 'success')
      setLoginForm(f => ({ ...f, email: forgotForm.email.trim(), password: '' }))
      setTimeout(() => resetForgotPasswordState(), 1200)
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
          <div className="login-brand-row">
            <div className="app-name">MIMS</div>
            {mode === 'app' ? (
              <button className="superadmin-switch" type="button" onClick={() => switchMode('superadmin')}>
                Superadmin
              </button>
            ) : null}
          </div>
          <div className="app-tagline">{mode === 'superadmin' ? 'Superadmin Console' : 'Medical Information Management System'}</div>
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
          {mode === 'superadmin' ? (
            <>
              {alert.show && (
                <div className={`alert alert-${alert.type}`}>{alert.msg}</div>
              )}
              <form onSubmit={handleLogin}>
                <div className="form-group">
                  <label>Email / Username</label>
                  <input className="form-control" type="text" placeholder="superadmin" required
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
                <button className="btn btn-secondary btn-block mt-8" type="button" onClick={() => switchMode('app')} disabled={loading}>
                  Back to App Login
                </button>
              </form>
            </>
          ) : (
          <>
          {alert.show && (
            <div className={`alert alert-${alert.type}`}>{alert.msg}</div>
          )}

          <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-muted)' }}>
            Access is provisioned by administrator approval only.
          </div>

            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label>Email / Username</label>
                <input
                  className="form-control"
                  type="text"
                  placeholder="you@company.com"
                  required
                  value={loginForm.email}
                  onChange={e => {
                    setLoginForm(f => ({ ...f, email: e.target.value }))
                    if (loginStage !== 'email') {
                      setLoginStage('email')
                      setSsoChoices([])
                      setForgotOpen(false)
                      resetTwoFactorState()
                    }
                  }}
                />
              </div>

              {loginStage === 'password' && !twoFactor && (
                <div className="form-group">
                  <label>Password</label>
                  <input
                    className="form-control"
                    type="password"
                    placeholder="Enter your password"
                    required
                    value={loginForm.password}
                    onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
                  />
                  <div style={{ marginTop: 8, textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn btn-link"
                      style={{ padding: 0, fontSize: 12 }}
                      onClick={() => {
                        resetTwoFactorState()
                        setForgotOpen(true)
                        setForgotStep('email')
                        setForgotForm(f => ({ ...f, email: loginForm.email }))
                      }}
                    >
                      Forgot Password?
                    </button>
                  </div>
                </div>
              )}

              {loginStage === 'choice' && (
                <div style={{ marginTop: 12, padding: 14, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)' }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Choose SSO Provider</div>
                  {ssoChoices.length > 0 ? (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {ssoChoices.map((choice) => (
                        <button
                          key={`${choice.org_id || choice.org?.id || 'org'}-${choice.provider?.key || choice.provider_key}`}
                          type="button"
                          className="btn btn-secondary btn-block"
                          disabled={loading}
                          onClick={() => redirectToSso(choice.redirect_url)}
                        >
                          Continue with {choice.provider?.label || choice.provider_label || 'SSO'}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      SSO is not fully configured for this account. Contact your administrator.
                    </div>
                  )}
                  <button className="btn btn-outline btn-block mt-8" type="button" onClick={resetAppLoginToEmail} disabled={loading}>
                    Back
                  </button>
                </div>
              )}

              {twoFactor && (
                <div style={{ marginTop: 16, padding: 16, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)' }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>
                    {postLoginData?.backupCodes?.length
                      ? 'Backup Codes'
                      : twoFactor.twoFactorRequired
                        ? 'Two-Factor Verification'
                        : 'Optional Two-Factor Setup'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                    {postLoginData?.backupCodes?.length
                      ? 'Save these backup codes now. Each code works once if you lose access to email or your authenticator app.'
                      : twoFactor.twoFactorRequired
                        ? 'Password is correct. Complete 2FA below to finish signing in.'
                        : 'This organisation allows 2FA. You can enable it now or skip and continue.'}
                  </div>

                  {postLoginData?.backupCodes?.length ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                        {postLoginData.backupCodes.map(code => (
                          <div key={code} style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'monospace', fontWeight: 700 }}>
                            {code}
                          </div>
                        ))}
                      </div>
                      <button type="button" className="btn btn-primary btn-block" onClick={() => {
                        const data = postLoginData
                        resetTwoFactorState()
                        finishLogin(data)
                      }}>
                        Continue to Dashboard
                      </button>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                        {twoFactor.availableMethods?.map(method => (
                          <button
                            key={method}
                            type="button"
                            className={`btn ${twoFactorMethod === method ? 'btn-primary' : 'btn-outline'}`}
                            style={{ fontSize: 12 }}
                            onClick={() => {
                              setTwoFactorMethod(method)
                              setTwoFactorCode('')
                              setBackupCode('')
                            }}
                          >
                            {method === 'email' ? 'Email OTP' : 'Authenticator App'}
                          </button>
                        ))}
                      </div>

                      {twoFactorMethod === 'email' && (
                        <div style={{ marginBottom: 12 }}>
                          <button type="button" className="btn btn-outline" style={{ fontSize: 12, marginBottom: 10 }} onClick={sendEmailCode} disabled={loading}>
                            {emailCodeSent ? 'Resend Email Code' : `Send Code to ${twoFactor.maskedEmail}`}
                          </button>
                          <input
                            className="form-control"
                            type="text"
                            placeholder="Enter 6-digit email code"
                            value={twoFactorCode}
                            onChange={e => setTwoFactorCode(e.target.value)}
                          />
                        </div>
                      )}

                      {twoFactorMethod === 'totp' && (
                        <div style={{ marginBottom: 12 }}>
                          {!twoFactor.twoFactorRequired && !totpSetup && (
                            <button type="button" className="btn btn-outline" style={{ fontSize: 12, marginBottom: 10 }} onClick={startTotpSetup} disabled={loading}>
                              Generate Authenticator Setup
                            </button>
                          )}
                          {totpSetup && (
                            <div style={{ marginBottom: 10 }}>
                              <img src={totpSetup.qrUrl} alt="2FA QR code" style={{ width: 180, height: 180, border: '1px solid var(--border)', borderRadius: 8, background: '#fff', padding: 8, marginBottom: 10 }} />
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                                If QR scan does not work, enter this secret manually:
                              </div>
                              <div style={{ fontFamily: 'monospace', fontWeight: 700, wordBreak: 'break-all', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, background: '#fff' }}>
                                {totpSetup.secret}
                              </div>
                            </div>
                          )}
                          <input
                            className="form-control"
                            type="text"
                            placeholder="Enter 6-digit authenticator code"
                            value={twoFactorCode}
                            onChange={e => setTwoFactorCode(e.target.value)}
                          />
                        </div>
                      )}

                      {twoFactor.twoFactorRequired && (
                        <div className="form-group" style={{ marginTop: 8 }}>
                          <label>Backup Code</label>
                          <input
                            className="form-control"
                            type="text"
                            placeholder="Use a backup code instead"
                            value={backupCode}
                            onChange={e => setBackupCode(e.target.value.toUpperCase())}
                          />
                        </div>
                      )}

                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 12, cursor: 'pointer' }}>
                        <input type="checkbox" checked={rememberDevice} onChange={e => setRememberDevice(e.target.checked)} />
                        Remember this device for {twoFactor.rememberDays} days
                      </label>

                      <button className="btn btn-primary btn-block" type="button" onClick={verifyTwoFactor} disabled={loading}>
                        {loading ? 'Processing...' : (twoFactor.twoFactorRequired ? 'Verify and Sign In' : 'Enable 2FA and Continue')}
                      </button>
                      {!twoFactor.twoFactorRequired && (
                        <button className="btn btn-outline btn-block mt-8" type="button" onClick={skipTwoFactorSetup} disabled={loading}>
                          Skip for Now
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {!twoFactor && loginStage !== 'choice' && (
                <button className="btn btn-primary btn-block mt-8" type="submit" disabled={loading}>
                  {loading ? (loginStage === 'email' ? 'Checking...' : 'Signing in...') : (loginStage === 'email' ? 'Submit' : 'Sign In')}
                </button>
              )}
              {!twoFactor && loginStage === 'password' && (
                <button className="btn btn-outline btn-block mt-8" type="button" onClick={resetAppLoginToEmail} disabled={loading}>
                  Back
                </button>
              )}
            </form>

          {forgotOpen && (
            <div style={{ marginTop: 16, padding: 16, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)' }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Forgot Password</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                {forgotStep === 'email' && 'Enter your email to receive a verification code.'}
                {forgotStep === 'code' && `Enter the verification code sent to ${forgotMeta.maskedEmail || 'your email'}.`}
                {forgotStep === 'reset' && 'Verification complete. Set your new password.'}
              </div>

              {forgotStep === 'email' && (
                <>
                  <input
                    className="form-control"
                    type="text"
                    placeholder="Enter your email"
                    value={forgotForm.email}
                    onChange={e => setForgotForm(f => ({ ...f, email: e.target.value }))}
                  />
                  <button className="btn btn-primary btn-block mt-8" type="button" onClick={sendForgotPasswordCode} disabled={loading}>
                    {loading ? 'Sending...' : 'Send 2FA Code'}
                  </button>
                </>
              )}

              {forgotStep === 'code' && (
                <>
                  <input
                    className="form-control"
                    type="text"
                    placeholder="Enter 6-digit verification code"
                    value={forgotForm.code}
                    onChange={e => setForgotForm(f => ({ ...f, code: e.target.value }))}
                  />
                  <button className="btn btn-primary btn-block mt-8" type="button" onClick={verifyForgotPasswordCode} disabled={loading}>
                    {loading ? 'Verifying...' : 'Verify Code'}
                  </button>
                  <button className="btn btn-outline btn-block mt-8" type="button" onClick={sendForgotPasswordCode} disabled={loading}>
                    Resend Code
                  </button>
                </>
              )}

              {forgotStep === 'reset' && (
                <>
                  <div className="form-group">
                    <label>New Password</label>
                    <input
                      className="form-control"
                      type="password"
                      minLength={8}
                      value={forgotForm.newPassword}
                      onChange={e => setForgotForm(f => ({ ...f, newPassword: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>Confirm Password</label>
                    <input
                      className="form-control"
                      type="password"
                      minLength={8}
                      value={forgotForm.confirm}
                      onChange={e => setForgotForm(f => ({ ...f, confirm: e.target.value }))}
                    />
                  </div>
                  <button className="btn btn-primary btn-block mt-8" type="button" onClick={completeForgotPasswordReset} disabled={loading}>
                    {loading ? 'Updating...' : 'Update Password'}
                  </button>
                </>
              )}

              <button className="btn btn-secondary btn-block mt-8" type="button" onClick={resetForgotPasswordState} disabled={loading}>
                Back to Sign In
              </button>
            </div>
          )}
          </>
          )}
        </div>
      </div>
    </div>
  )
}
