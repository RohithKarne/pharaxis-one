import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import { httpFetch } from '../../../shared/api/httpFetch.js'

function mapSsoError(code) {
  const key = String(code || '').trim().toLowerCase()
  const messages = {
    invalid_state: 'The SSO session could not be validated. Start the sign-in flow again.',
    provider_declined: 'The identity provider sign-in was cancelled or declined.',
    provider_not_configured: 'That SSO provider is not configured in this environment yet.',
    no_account: 'No MIMS account is linked to that external identity yet. Ask an admin to provision or link your account.',
    inactive_account: 'Your MIMS account is inactive. Contact your administrator.',
    no_org_access: 'Your MIMS account exists but has no active organisation access.',
    sso_failed: 'SSO sign-in failed before the app session could be created.',
    user_not_found: 'The current app user could not be found for account linking.',
  }
  return messages[key] || 'SSO could not be completed.'
}

const TARGET_CONFIG = {
  admin: { moduleKey: 'admin_console', destination: '/mims-admin?standalone=1', loginPath: '/mims-admin/login', label: 'MIMS Admin' },
  content: { moduleKey: 'content_mgmt', destination: '/content?standalone=1', loginPath: '/content/login', label: 'Content Management' },
  reports: { moduleKey: 'reports', destination: '/reports?standalone=1', loginPath: '/reports/login', label: 'Reports' },
}

export default function SsoCompletePage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [searchParams] = useSearchParams()
  const [message, setMessage] = useState('Finalizing secure sign-in…')
  const [failed, setFailed] = useState(false)

  const errorCode = useMemo(() => searchParams.get('sso_error') || '', [searchParams])
  const target = useMemo(() => searchParams.get('target') || '', [searchParams])

  useEffect(() => {
    let cancelled = false

    async function finalizeSso() {
      if (errorCode) {
        if (!cancelled) {
          setFailed(true)
          setMessage(mapSsoError(errorCode))
        }
        return
      }

      try {
        const res = await httpFetch('/api/auth/me', { cache: 'no-store' })
        const payload = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(payload.error || 'Unable to restore app session after SSO.')

        if (cancelled) return
        const isAdminUser = payload.user?.role === 'admin' || payload.user?.role === 'superadmin'
        const hasMimsAppAccess = payload.user?.role === 'superadmin' || (payload.modules || []).includes('mims_core')
        const targetConfig = TARGET_CONFIG[target] || null
        const hasTargetAccess = !targetConfig || (isAdminUser && (payload.user?.role === 'superadmin' || (payload.modules || []).includes(targetConfig.moduleKey)))
        if (!hasTargetAccess) {
          await httpFetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
          setFailed(true)
          setMessage(`This account does not have access to ${targetConfig.label}.`)
          return
        }

        login(payload.user, payload.token || '', payload.modules || [], {
          orgId: payload.orgId || null,
          siteId: payload.siteId || null,
          orgName: payload.orgName || null,
          siteName: payload.siteName || null,
          allOrgs: payload.allOrgs || [],
          sessionTimeout: payload.sessionTimeout ?? 30,
        })
        if (targetConfig) {
          navigate(targetConfig.destination, { replace: true })
        } else if (hasMimsAppAccess) {
          navigate('/dashboard', { replace: true })
        } else {
          const fallback = Object.values(TARGET_CONFIG).find(config =>
            isAdminUser && (payload.user?.role === 'superadmin' || (payload.modules || []).includes(config.moduleKey))
          )
          navigate(fallback?.destination || '/no-access', { replace: true })
        }
      } catch (err) {
        if (!cancelled) {
          setFailed(true)
          setMessage(err.message || 'Unable to restore app session after SSO.')
        }
      }
    }

    finalizeSso()
    return () => { cancelled = true }
  }, [errorCode, login, navigate, target])

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card-header">
          <div className="app-name">MIMS</div>
          <div className="app-tagline">Single Sign-On</div>
        </div>
        <div className="login-card-body">
          <div style={{ padding: '18px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 14, marginBottom: 10 }}>{message}</div>
            {failed && (
              <button className="btn btn-primary" type="button" onClick={() => navigate(TARGET_CONFIG[target]?.loginPath || '/login', { replace: true })}>
                Back to Sign In
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
