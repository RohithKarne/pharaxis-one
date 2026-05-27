import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import { httpFetch } from '../../../shared/api/httpFetch.js'

const API = '/api'

function formatDateTime(value) {
  if (value == null || value === '') return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return value
  return dt.toLocaleString()
}

function minutesToLabel(minutes) {
  const n = Number(minutes || 0)
  if (!Number.isFinite(n) || n <= 0) return '—'
  return `${n} min`
}

export default function SessionManagementPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { token, logout } = useAuth()
  const headers = useMemo(
    () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
    [token]
  )

  const [data, setData] = useState({
    sessionTimeoutMinutes: 30,
    activeSessionCount: 0,
    currentSession: null,
    sessions: [],
    recentLogins: [],
  })
  const [loading, setLoading] = useState(true)
  const [busySessionId, setBusySessionId] = useState(null)
  const [revokingOthers, setRevokingOthers] = useState(false)
  const [error, setError] = useState('')
  const [providers, setProviders] = useState([])
  const [linkedAccounts, setLinkedAccounts] = useState([])
  const [busyProviderKey, setBusyProviderKey] = useState('')
  const [webauthnCredentials, setWebauthnCredentials] = useState([])
  const [webauthnLoading, setWebauthnLoading] = useState(false)
  const [removingCredId, setRemovingCredId] = useState(null)

  const loadSessions = useCallback(async () => {
    if (token == null) return
    setLoading(true)
    setError('')
    try {
      const res = await httpFetch(`${API}/auth/sessions`, { headers })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Failed to load session management data.')
      setData({
        sessionTimeoutMinutes: Number(payload.sessionTimeoutMinutes || 30),
        activeSessionCount: Number(payload.activeSessionCount || 0),
        currentSession: payload.currentSession || null,
        sessions: Array.isArray(payload.sessions) ? payload.sessions : [],
        recentLogins: Array.isArray(payload.recentLogins) ? payload.recentLogins : [],
      })
    } catch (err) {
      setError(err.message || 'Unable to load sessions.')
    } finally {
      setLoading(false)
    }
  }, [headers, token])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  useEffect(() => {
    let cancelled = false

    async function loadSsoData() {
      try {
        const [providersRes, linkedRes] = await Promise.all([
          httpFetch(`${API}/auth/sso/providers`, { headers }),
          httpFetch(`${API}/auth/sso/linked-accounts`, { headers }),
        ])
        const providersPayload = await providersRes.json().catch(() => ({}))
        const linkedPayload = await linkedRes.json().catch(() => ({}))
        if (!cancelled) {
          setProviders(Array.isArray(providersPayload.providers) ? providersPayload.providers : [])
          setLinkedAccounts(Array.isArray(linkedPayload.linkedAccounts) ? linkedPayload.linkedAccounts : [])
        }
      } catch {
        if (!cancelled) {
          setProviders([])
          setLinkedAccounts([])
        }
      }
    }

    if (token != null) loadSsoData()
    return () => { cancelled = true }
  }, [headers, token])

  // Load WebAuthn / Touch ID credentials
  useEffect(() => {
    async function loadWebauthnCredentials() {
      if (!token) return
      try {
        const res = await httpFetch(`${API}/auth/webauthn/credentials`, { headers })
        if (!res.ok) return
        const payload = await res.json().catch(() => ({}))
        setWebauthnCredentials(Array.isArray(payload.credentials) ? payload.credentials : [])
      } catch { /* non-critical */ }
    }
    loadWebauthnCredentials()
  }, [headers, token])

  async function removeWebauthnCredential(credId) {
    setRemovingCredId(credId)
    try {
      const res = await httpFetch(`${API}/auth/webauthn/credentials/${encodeURIComponent(credId)}`, {
        method: 'DELETE',
        headers,
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        setError(payload.error || 'Failed to remove Touch ID device.')
        return
      }
      setWebauthnCredentials(prev => prev.filter(c => c.credential_id !== credId))
    } catch (err) {
      setError(err.message || 'Failed to remove Touch ID device.')
    } finally {
      setRemovingCredId(null)
    }
  }

  async function registerWebauthnDevice() {
    if (typeof window.PublicKeyCredential === 'undefined') {
      setError('Your browser does not support Touch ID login.')
      return
    }
    setWebauthnLoading(true)
    try {
      const startRes = await httpFetch(`${API}/auth/webauthn/register/start`, { method: 'POST', headers })
      const startData = await startRes.json().catch(() => ({}))
      if (!startRes.ok) throw new Error(startData.error || 'Could not start Touch ID setup.')

      const { startRegistration } = await import('@simplewebauthn/browser')
      const regResponse = await startRegistration({ optionsJSON: startData.options })

      const finishRes = await httpFetch(`${API}/auth/webauthn/register/finish`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          registrationResponse: regResponse,
          deviceName: `${navigator.platform || 'Mac'} — Touch ID`,
        }),
      })
      const finishData = await finishRes.json().catch(() => ({}))
      if (!finishRes.ok) throw new Error(finishData.error || 'Touch ID registration failed.')

      // Reload list
      const listRes = await httpFetch(`${API}/auth/webauthn/credentials`, { headers })
      if (listRes.ok) {
        const listData = await listRes.json().catch(() => ({}))
        setWebauthnCredentials(Array.isArray(listData.credentials) ? listData.credentials : [])
      }
      localStorage.setItem('mims_webauthn_setup_dismissed', '1')
    } catch (err) {
      if (err?.name !== 'NotAllowedError') {
        setError(err.message || 'Touch ID setup failed.')
      }
    } finally {
      setWebauthnLoading(false)
    }
  }

  async function revokeOthers() {
    setRevokingOthers(true)
    setError('')
    try {
      const res = await httpFetch(`${API}/auth/sessions/revoke-others`, { method: 'POST', headers })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Failed to revoke other sessions.')
      await loadSessions()
    } catch (err) {
      setError(err.message || 'Failed to revoke sessions.')
    } finally {
      setRevokingOthers(false)
    }
  }

  async function revokeSession(session) {
    if (session == null || session.id == null) return
    setBusySessionId(session.id)
    setError('')
    try {
      const res = await httpFetch(`${API}/auth/sessions/${session.id}/revoke`, { method: 'POST', headers })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Failed to revoke session.')

      if (payload.revokedCurrent) {
        await logout()
        navigate('/login', { replace: true })
        return
      }

      await loadSessions()
    } catch (err) {
      setError(err.message || 'Failed to revoke session.')
    } finally {
      setBusySessionId(null)
    }
  }

  function startLink(provider) {
    const returnTo = `${window.location.origin}/mims/session-management`
    window.location.href = `${provider.linkPath}?return_to=${encodeURIComponent(returnTo)}`
  }

  async function unlinkProvider(providerKey) {
    setBusyProviderKey(providerKey)
    setError('')
    try {
      const res = await httpFetch(`${API}/auth/sso/linked-accounts/${providerKey}`, {
        method: 'DELETE',
        headers,
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error || 'Failed to unlink account.')
      const linkedRes = await httpFetch(`${API}/auth/sso/linked-accounts`, { headers })
      const linkedPayload = await linkedRes.json().catch(() => ({}))
      setLinkedAccounts(Array.isArray(linkedPayload.linkedAccounts) ? linkedPayload.linkedAccounts : [])
    } catch (err) {
      setError(err.message || 'Failed to unlink external account.')
    } finally {
      setBusyProviderKey('')
    }
  }

  const linkSuccess = new URLSearchParams(location.search).get('sso') === 'linked'

  return (
    <MIMSLayout showStatStrip={false} bodyClassName="mims-session-page-body" surfaceVariant="workspace" compact>
      <div className="mims-session-wrap">
        <div className="mims-session-header">
          <div>
            <h1>Session Management</h1>
            <p>Monitor current session, revoke other sessions, and review recent login history.</p>
          </div>
          <div className="mims-session-header-actions">
            <button className="btn btn-outline" onClick={loadSessions} disabled={loading}>Refresh</button>
            <button className="btn btn-primary" onClick={revokeOthers} disabled={loading || revokingOthers || data.sessions.length <= 1}>
              {revokingOthers ? 'Revoking…' : 'Revoke Other Sessions'}
            </button>
          </div>
        </div>

        {linkSuccess && <div className="alert alert-success">External SSO account linked successfully.</div>}
        {error && <div className="alert alert-error">{error}</div>}

        <div className="mims-session-summary-grid">
          <article className="mims-session-summary-card">
            <span>Idle Timeout</span>
            <strong>{minutesToLabel(data.sessionTimeoutMinutes)}</strong>
          </article>
          <article className="mims-session-summary-card accent">
            <span>Active Sessions</span>
            <strong>{Number(data.activeSessionCount || 0)}</strong>
          </article>
          <article className="mims-session-summary-card wide">
            <span>Current Session Expires</span>
            <strong>{formatDateTime(data.currentSession?.expires_at)}</strong>
          </article>
        </div>

        <section className="card" style={{ marginTop: 14 }}>
          <div className="card-header">
            <h3>Linked SSO Accounts</h3>
          </div>
          <div className="card-body">
            {providers.length === 0 ? (
              <div className="mims-session-empty">No external SSO providers are configured in this environment yet.</div>
            ) : (
              <div className="mims-session-table-wrap">
                <table className="mims-session-table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Linked Account</th>
                      <th>Linked At</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providers.map((provider) => {
                      const linked = linkedAccounts.find((item) => item.provider_key === provider.key) || null
                      return (
                        <tr key={provider.key}>
                          <td>{provider.label}</td>
                          <td>{linked ? (linked.provider_email || linked.provider_name || 'Linked') : 'Not linked'}</td>
                          <td>{linked ? formatDateTime(linked.created_at) : '—'}</td>
                          <td>
                            {linked ? (
                              <button className="mims-session-revoke-btn" onClick={() => unlinkProvider(provider.key)} disabled={busyProviderKey === provider.key}>
                                {busyProviderKey === provider.key ? 'Updating…' : 'Unlink'}
                              </button>
                            ) : (
                              <button className="mims-session-revoke-btn" onClick={() => startLink(provider)} disabled={!!busyProviderKey}>
                                Link Account
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="card" style={{ marginTop: 14 }}>
          <div className="card-header">
            <h3>Tracked Sessions</h3>
          </div>
          <div className="card-body">
            {loading ? (
              <div className="mims-session-empty">Loading sessions…</div>
            ) : data.sessions.length === 0 ? (
              <div className="mims-session-empty">No tracked sessions found yet. Sign in again to start tracking.</div>
            ) : (
              <div className="mims-session-table-wrap">
                <table className="mims-session-table">
                  <thead>
                    <tr>
                      <th>Session</th>
                      <th>Started</th>
                      <th>Expires</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sessions.map((session) => (
                      <tr key={session.id}>
                        <td>
                          <span className={`mims-session-badge ${session.is_current ? 'current' : ''}`}>
                            {session.is_current ? 'Current Session' : `Session #${session.id}`}
                          </span>
                        </td>
                        <td>{formatDateTime(session.created_at)}</td>
                        <td>{formatDateTime(session.expires_at)}</td>
                        <td>{session.is_expired ? 'Expired' : 'Active'}</td>
                        <td>
                          <button
                            className="mims-session-revoke-btn"
                            onClick={() => revokeSession(session)}
                            disabled={busySessionId === session.id}
                          >
                            {busySessionId === session.id ? 'Revoking…' : (session.is_current ? 'Log Out' : 'Revoke')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="card" style={{ marginTop: 14 }}>
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3>Touch ID / Passkey Devices</h3>
            {typeof window.PublicKeyCredential !== 'undefined' && (
              <button
                className="btn btn-outline"
                style={{ fontSize: 13 }}
                onClick={registerWebauthnDevice}
                disabled={webauthnLoading}
              >
                {webauthnLoading ? 'Setting up…' : '+ Register This Device'}
              </button>
            )}
          </div>
          <div className="card-body">
            {webauthnCredentials.length === 0 ? (
              <div className="mims-session-empty">
                No Touch ID devices registered.
                {typeof window.PublicKeyCredential !== 'undefined' && (
                  <> Click <strong>Register This Device</strong> to enable Touch ID login.</>
                )}
              </div>
            ) : (
              <ul className="mims-session-activity-list">
                {webauthnCredentials.map(cred => (
                  <li key={cred.credential_id} className="mims-session-activity-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <strong>{cred.device_name || 'Unknown device'}</strong>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        Registered: {formatDateTime(cred.created_at)}
                        {cred.last_used_at && <> · Last used: {formatDateTime(cred.last_used_at)}</>}
                      </div>
                    </div>
                    <button
                      className="mims-session-revoke-btn"
                      onClick={() => removeWebauthnCredential(cred.credential_id)}
                      disabled={removingCredId === cred.credential_id}
                    >
                      {removingCredId === cred.credential_id ? 'Removing…' : 'Remove'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="card" style={{ marginTop: 14 }}>
          <div className="card-header">
            <h3>Recent Login Activity</h3>
          </div>
          <div className="card-body">
            {loading ? (
              <div className="mims-session-empty">Loading login activity…</div>
            ) : data.recentLogins.length === 0 ? (
              <div className="mims-session-empty">No login history found.</div>
            ) : (
              <ul className="mims-session-activity-list">
                {data.recentLogins.map((row) => (
                  <li key={row.id} className="mims-session-activity-item">
                    <div>
                      <strong>{String(row.status || 'unknown').toUpperCase()}</strong>
                      <span> • Login: {formatDateTime(row.login_time)}</span>
                    </div>
                    <div>
                      <span>Logout: {formatDateTime(row.logout_time)}</span>
                      {row.fail_reason ? <em> • {row.fail_reason}</em> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </MIMSLayout>
  )
}
