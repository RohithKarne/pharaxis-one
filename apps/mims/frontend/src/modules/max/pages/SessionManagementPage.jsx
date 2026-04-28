import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'

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

  const loadSessions = useCallback(async () => {
    if (token == null) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API}/auth/sessions`, { headers })
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

  async function revokeOthers() {
    setRevokingOthers(true)
    setError('')
    try {
      const res = await fetch(`${API}/auth/sessions/revoke-others`, { method: 'POST', headers })
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
      const res = await fetch(`${API}/auth/sessions/${session.id}/revoke`, { method: 'POST', headers })
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

  return (
    <MIMSLayout showStatStrip={false} bodyClassName="mims-session-page-body">
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
