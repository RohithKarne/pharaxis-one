/**
 * LoginPage.jsx
 * Single unified sign-in flow. Admin users authenticate the same way as
 * regular app users — role drives the navigation target.
 * Calls the Express backend API and uses AuthContext to store the session.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import { httpFetch } from '../../../shared/api/httpFetch.js'
import { hasGlobalAdminScope, isAdminUser as isAdminRole } from '../../../shared/utils/adminScope.js'

const MODULE_LOGIN_CONFIG = {
  app: {
    moduleKey: 'mims_core',
    destination: '/dashboard',
    target: '',
    title: 'Medical Information Management System',
    message: 'Access is provisioned by administrator approval only.',
  },
  admin: {
    moduleKey: 'admin_console',
    destination: '/mims-admin',
    target: 'admin',
    title: 'Administration Console',
    message: 'Use this admin login only if your account has MIMS Admin access.',
  },
  content: {
    moduleKey: 'content_mgmt',
    destination: '/content',
    target: 'content',
    title: 'Content Management Console',
    message: 'Use this CM login only if your account has admin access to Content Management.',
  },
  reports: {
    moduleKey: 'reports',
    destination: '/reports',
    target: 'reports',
    title: 'Reports Console',
    message: 'Use this Reports login only if your account has admin access to Reports.',
  },
}

const LOGIN_PROGRESS_STEPS = [
  { key: 'identify', label: 'Identify' },
  { key: 'authenticate', label: 'Authenticate' },
  { key: 'verify', label: 'Verify' },
]

export default function LoginPage({ adminMode = false, moduleMode = 'app' }) {
  const { login } = useAuth()
  const navigate = useNavigate()
  const activeMode = adminMode ? 'admin' : moduleMode
  const modeConfig = MODULE_LOGIN_CONFIG[activeMode] || MODULE_LOGIN_CONFIG.app


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

  // Login form state — prefill the last-used email so it's always there
  const [loginForm, setLoginForm] = useState({
    email: (typeof localStorage !== 'undefined' && localStorage.getItem('mims_last_email')) || '',
    password: '',
  })

  // WebAuthn / Touch ID state
  const [webauthnAvailable, setWebauthnAvailable] = useState(false)
  const [webauthnLoading, setWebauthnLoading] = useState(false)
  // When an SSO user has a passkey, we hold the SSO redirect so they can
  // choose Touch ID instead of being auto-redirected to the IdP.
  const [pendingSso, setPendingSso] = useState(null) // { redirectUrl, label }

  function showAlert(msg, type = 'error') {
    setAlert({ show: true, type, msg })
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

  function isAdminUser(data) {
    return isAdminRole(data.user)
  }

  function hasModuleAccess(data, moduleKey) {
    return hasGlobalAdminScope(data.user) || (data.modules || []).includes(moduleKey)
  }

  function hasTargetAccess(data) {
    if (activeMode === 'app') return hasModuleAccess(data, 'mims_core')
    return isAdminUser(data) && hasModuleAccess(data, modeConfig.moduleKey)
  }

  function hasMimsAppAccess(data) {
    return hasModuleAccess(data, 'mims_core')
  }

  const progressStep = twoFactor ? 3 : (loginStage === 'password' || loginStage === 'choice' ? 2 : 1)
  const progressTitle = twoFactor
    ? 'Complete secure verification'
    : loginStage === 'choice'
      ? 'Choose the right sign-in path'
      : loginStage === 'password'
        ? 'Enter password for this account'
        : 'Identify your account first'
  const progressMessage = twoFactor
    ? 'Password check is complete. Finish verification to open your workspace.'
    : loginStage === 'choice'
      ? 'Your account supports multiple sign-in providers. Pick the approved route below.'
      : loginStage === 'password'
        ? `Continue as ${loginForm.email || 'this account'} and enter the password for ${modeConfig.title}.`
        : `We will check the access path for ${modeConfig.title} before asking for a password or SSO verification.`

  function findFallbackAdminDestination(data) {
    if (isAdminUser(data) && hasModuleAccess(data, 'admin_console')) return MODULE_LOGIN_CONFIG.admin.destination
    if (isAdminUser(data) && hasModuleAccess(data, 'content_mgmt')) return MODULE_LOGIN_CONFIG.content.destination
    if (isAdminUser(data) && hasModuleAccess(data, 'reports')) return MODULE_LOGIN_CONFIG.reports.destination
    return ''
  }

  async function discardRejectedSession(data) {
    try {
      await httpFetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.token}` },
      })
    } catch { /* best effort */ }
  }

  async function finishLogin(data) {
    if (activeMode !== 'app' && !hasTargetAccess(data)) {
      await discardRejectedSession(data)
      showAlert(`This account does not have access to ${modeConfig.title}.`)
      return
    }

    if (data.rememberedDeviceToken) {
      localStorage.setItem('mims_2fa_device_token', data.rememberedDeviceToken)
    }
    // Remember the email so the username field is prefilled next time
    const signedInEmail = data.user?.email || loginForm.email
    if (signedInEmail) localStorage.setItem('mims_last_email', signedInEmail)
    login(data.user, data.token, data.modules || [], {
      orgId: data.orgId || null,
      siteId: data.siteId || null,
      orgName: data.orgName || null,
      siteName: data.siteName || null,
      allOrgs: data.allOrgs || [],
      sessionTimeout: data.sessionTimeout ?? 30,
    })
    if (activeMode !== 'app') {
      navigate(modeConfig.destination)
    } else if (hasMimsAppAccess(data)) {
      navigate('/dashboard')
    } else {
      const fallback = findFallbackAdminDestination(data)
      if (fallback) navigate(fallback)
      else navigate('/no-access')
    }
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
    setWebauthnAvailable(false)
    setPendingSso(null)
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

  // Returns true if the Touch ID login fully completed (session established),
  // false on cancel/failure so the caller can fall back to SSO/password.
  async function handleTouchIdLogin(opts = {}) {
    const email = String(opts.email || loginForm.email || '').trim()
    setWebauthnLoading(true)
    setAlert({ show: false })
    try {
      // 1. Get authentication challenge from backend
      const startRes = await httpFetch('/api/auth/webauthn/login/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const startData = await startRes.json().catch(() => ({}))
      if (!startRes.ok || !startData.webauthnAvailable) {
        setWebauthnAvailable(false)
        return false
      }

      // 2. Trigger browser WebAuthn — prompts Touch ID on Mac
      const { startAuthentication } = await import('@simplewebauthn/browser')
      const authResponse = await startAuthentication({ optionsJSON: startData.options })

      // 3. Send assertion to backend for verification
      const finishRes = await httpFetch('/api/auth/webauthn/login/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, authenticationResponse: authResponse }),
      })
      const finishData = await finishRes.json().catch(() => ({}))
      if (!finishRes.ok) {
        showAlert(finishData.error || 'Touch ID verification failed. Choose another way to sign in.')
        return false
      }

      await finishLogin(finishData)
      return true
    } catch (err) {
      // User cancelled the Touch ID prompt, or it failed
      if (err?.name === 'NotAllowedError') {
        showAlert('Touch ID was cancelled. Choose another way to sign in below.', 'info')
      } else {
        showAlert('Touch ID could not complete. Choose another way to sign in below.')
      }
      return false
    } finally {
      setWebauthnLoading(false)
    }
  }

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setAlert({ show: false })

    try {
      if (loginStage === 'email') {
        const email = loginForm.email.trim()
        if (!email) return showAlert('Email is required.')

        const res = await httpFetch('/api/auth/login/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            return_to: `${window.location.origin}/mims/auth/sso-complete${modeConfig.target ? `?target=${modeConfig.target}` : ''}`,
          })
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) return showAlert(data.error || 'Could not start sign in.')

        const hasPasskey = !!data.webauthnAvailable && typeof window.PublicKeyCredential !== 'undefined'

        // Sets the right fallback view if Touch ID is cancelled or unavailable.
        const applyOutcomeFallback = () => {
          if (data.outcome === 'sso_redirect') {
            setPendingSso({ redirectUrl: data.redirect_url, label: data.provider?.label || 'SSO' })
            setSsoChoices([])
            setLoginStage('choice')
          } else if (data.outcome === 'choice_required') {
            setSsoChoices(Array.isArray(data.options) ? data.options : [])
            setPendingSso(null)
            setLoginStage('choice')
          } else if (data.outcome === 'local_password') {
            setLoginForm(f => ({ ...f, email, password: '' }))
            setLoginStage('password')
          } else {
            showAlert(data.error || 'Unable to start sign in. Contact your administrator.')
          }
        }

        // Direct access: if this device has a passkey, fire Touch ID straight
        // away — no intermediate "Authenticate" choice screen. Fall back to the
        // normal SSO/password view only if Touch ID is cancelled or fails.
        if (hasPasskey) {
          setWebauthnAvailable(true)
          const ok = await handleTouchIdLogin({ email })
          if (!ok) applyOutcomeFallback()
          return
        }

        if (data.outcome === 'sso_redirect') {
          redirectToSso(data.redirect_url)
          return
        }
        if (data.outcome === 'choice_required') {
          setSsoChoices(Array.isArray(data.options) ? data.options : [])
          setWebauthnAvailable(false)
          setPendingSso(null)
          setLoginStage('choice')
          return
        }
        if (data.outcome === 'local_password') {
          setLoginStage('password')
          setLoginForm(f => ({ ...f, email, password: '' }))
          setWebauthnAvailable(false)
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

      await finishLogin(data)
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
      // L-02: backend no longer returns maskedEmail (account-enumeration hardening),
      // so show a generic, existence-agnostic confirmation.
      setForgotMeta(meta => ({ ...meta, maskedEmail: '' }))
      setForgotStep('code')
      showAlert('If an account exists for that email, a verification code has been sent.', 'success')
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
    <div className="login-page login-page-product">
      <section className="login-hero-panel" aria-label="MIMS product overview">
        <div className="login-hero-kicker">Powered by Pharaxis</div>
        <h1>Medical Information Management System</h1>
        <p>
          A controlled workspace for medical information intake, case operations,
          audit visibility, and administration across regulated teams.
        </p>
        <div className="login-hero-grid">
          <span className="login-hero-chip">Compliant case intake</span>
          <span className="login-hero-chip">Admin governance</span>
          <span className="login-hero-chip">Audit-ready activity</span>
          <span className="login-hero-chip">Operational visibility</span>
        </div>
      </section>
      <div className="login-card">
        <div className="login-card-header">
          <div className="login-brand-row">
            <div className="app-name">MIMS</div>
          </div>
          <div className="app-tagline">
            {modeConfig.title}
          </div>
          <div className="login-status-row">
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
          {alert.show && (
            <div className={`alert alert-${alert.type}`}>{alert.msg}</div>
          )}

          <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-muted)' }}>
            {modeConfig.message}
          </div>

          <div className="login-progress-panel">
            <div className="login-progress-header">
              <div>
                <div className="login-progress-kicker">Step {progressStep} of 3</div>
                <div className="login-progress-title">{progressTitle}</div>
              </div>
              <div className="login-progress-target">{modeConfig.title}</div>
            </div>
            <div className="login-progress-copy">{progressMessage}</div>
            <div className="login-progress-steps" aria-hidden="true">
              {LOGIN_PROGRESS_STEPS.map((step, index) => {
                const state = index + 1 < progressStep ? 'complete' : index + 1 === progressStep ? 'active' : 'idle'
                return (
                  <div key={step.key} className={`login-progress-step ${state}`}>
                    <span>{index + 1}</span>
                    <strong>{step.label}</strong>
                  </div>
                )
              })}
            </div>
          </div>

          <form onSubmit={handleLogin}>
              <div className="form-group">
                <label>Work Email / Username</label>
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
                      setWebauthnAvailable(false)
                      setPendingSso(null)
                      setForgotOpen(false)
                      resetTwoFactorState()
                    }
                  }}
                />
              </div>

              {loginStage === 'password' && !twoFactor && (
                <>
                  <div className="login-stage-card">
                    <div className="login-stage-card-label">Continuing as</div>
                    <div className="login-stage-card-value">{loginForm.email}</div>
                    <div className="login-stage-card-copy">Enter the password for this account to continue into {modeConfig.title}.</div>
                  </div>
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
                </>
              )}

              {loginStage === 'choice' && (
                <div style={{ marginTop: 12, padding: 14, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)' }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Choose how to sign in</div>

                  {webauthnAvailable && (
                    <button
                      type="button"
                      className="btn btn-primary btn-block"
                      style={{ marginBottom: 8 }}
                      disabled={webauthnLoading || loading}
                      onClick={handleTouchIdLogin}
                    >
                      {webauthnLoading ? 'Waiting for Touch ID…' : '⬡ Sign in with Touch ID'}
                    </button>
                  )}

                  {pendingSso && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-block"
                      disabled={loading || webauthnLoading}
                      onClick={() => redirectToSso(pendingSso.redirectUrl)}
                    >
                      Continue with {pendingSso.label}
                    </button>
                  )}

                  {ssoChoices.length > 0 ? (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {ssoChoices.map((choice) => (
                        <button
                          key={`${choice.org_id || choice.org?.id || 'org'}-${choice.provider?.key || choice.provider_key}`}
                          type="button"
                          className="btn btn-secondary btn-block"
                          disabled={loading || webauthnLoading}
                          onClick={() => redirectToSso(choice.redirect_url)}
                        >
                          Continue with {choice.provider?.label || choice.provider_label || 'SSO'}
                        </button>
                      ))}
                    </div>
                  ) : (!pendingSso && !webauthnAvailable) ? (
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      SSO is not fully configured for this account. Contact your administrator.
                    </div>
                  ) : null}
                  <button className="btn btn-outline btn-block mt-8" type="button" onClick={resetAppLoginToEmail} disabled={loading || webauthnLoading}>
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

              {!twoFactor && loginStage === 'password' && webauthnAvailable && (
                <button
                  type="button"
                  className="btn btn-secondary btn-block mt-8"
                  disabled={webauthnLoading || loading}
                  onClick={handleTouchIdLogin}
                >
                  {webauthnLoading ? 'Waiting for Touch ID…' : '⬡ Sign in with Touch ID'}
                </button>
              )}

              {!twoFactor && loginStage !== 'choice' && (
                <button className="btn btn-primary btn-block mt-8" type="submit" disabled={loading || webauthnLoading}>
                  {loading ? (loginStage === 'email' ? 'Checking access...' : 'Signing in...') : (loginStage === 'email' ? 'Continue' : 'Sign In')}
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
                    {loading ? 'Sending...' : 'Send Verification Code'}
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
        </div>
      </div>
    </div>
  )
}
