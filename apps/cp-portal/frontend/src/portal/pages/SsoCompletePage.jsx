import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'
import usePageTitle from '../hooks/usePageTitle'

// Friendly copy for the error codes the SSO callback can redirect back with.
const SSO_ERRORS = {
  no_account:          'No portal account was found for that email. Access is provisioned by an administrator — please contact them to be added.',
  domain_not_allowed:  'Your email domain is not permitted to sign in to this portal.',
  email_unverified:    'Your identity provider has not verified this email address, so it cannot be used to sign in.',
  verification_failed: 'We could not verify your sign-in with the identity provider. Please try again.',
  expired:             'This sign-in request expired. Please try signing in again.',
  invalid_request:     'That sign-in request was invalid. Please try again.',
  idp_declined:        'Sign-in was cancelled at the identity provider.',
  sso_disabled:        'Single sign-on is not enabled for this portal.',
  portal_unavailable:  'This portal is currently unavailable.',
  server_error:        'Something went wrong completing your sign-in. Please try again.',
}

export default function SsoCompletePage() {
  const { clientCode, login } = usePortal()
  const navigate  = useNavigate()
  const [params]  = useSearchParams()
  const base      = `/portal/${clientCode}`
  const errorCode = params.get('error')
  const returnTo  = params.get('return_to')

  usePageTitle('Signing in…')

  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    if (errorCode) { setError(SSO_ERRORS[errorCode] || SSO_ERRORS.server_error); return }

    // The callback already set the httpOnly session cookie; hydrate the user from it.
    ;(async () => {
      try {
        const res = await fetch('/api/portal/auth/me', { credentials: 'include' })
        if (cancelled) return
        if (!res.ok) { setError(SSO_ERRORS.server_error); return }
        const data = await res.json().catch(() => ({}))
        if (data?.user) {
          login(data.user)
          const dest = returnTo && returnTo.startsWith(base) ? returnTo : base
          navigate(dest, { replace: true })
        } else {
          setError(SSO_ERRORS.server_error)
        }
      } catch {
        if (!cancelled) setError(SSO_ERRORS.server_error)
      }
    })()

    return () => { cancelled = true }
  }, [errorCode, returnTo, base, login, navigate])

  return (
    <div className="pp-auth-page">
      <div className="pp-auth-card">
        {error ? (
          <>
            <div className="pp-error-msg" role="alert">{error}</div>
            <button type="button" className="pp-btn pp-btn-primary pp-btn-full" style={{ marginTop: 16 }} onClick={() => navigate(`${base}/login`, { replace: true })}>
              Back to sign in
            </button>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div className="pp-spinner" aria-hidden="true" />
            <p style={{ marginTop: 12 }}>Completing your sign-in…</p>
          </div>
        )}
      </div>
    </div>
  )
}
