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

function statusTone(statusName) {
  const text = String(statusName || '').toLowerCase()
  if (text.length === 0) return 'neutral'
  if (text.startsWith('closed')) return 'success'
  if (text.includes('progress')) return 'info'
  if (text.includes('review') || text.includes('pending')) return 'warning'
  return 'neutral'
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { token, user } = useAuth()
  const headers = useMemo(
    () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
    [token]
  )

  const [summary, setSummary] = useState({
    stats: {
      total_cases: 0,
      open_cases: 0,
      my_cases: 0,
      unassigned_cases: 0,
      priority_cases: 0,
    },
    recentCases: [],
    alerts: [],
  })
  const [sessions, setSessions] = useState({
    sessionTimeoutMinutes: 30,
    activeSessionCount: 0,
    currentSession: null,
  })
  const [observability, setObservability] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadDashboard = useCallback(async () => {
    if (token == null) return
    setLoading(true)
    setError('')

    async function safeJson(res) {
      try { return await res.json() } catch { return {} }
    }

    try {
      const [summaryRes, sessionsRes] = await Promise.all([
        fetch(`${API}/cases/dashboard-summary`, { headers }),
        fetch(`${API}/auth/sessions`, { headers }),
      ])

      const [summaryData, sessionsData] = await Promise.all([
        safeJson(summaryRes),
        safeJson(sessionsRes),
      ])

      if (!summaryRes.ok) throw new Error(summaryData.error || 'Failed to load dashboard summary.')
      if (!sessionsRes.ok) throw new Error(sessionsData.error || 'Failed to load session details.')

      setSummary({
        stats: summaryData.stats || {},
        recentCases: Array.isArray(summaryData.recentCases) ? summaryData.recentCases : [],
        alerts: Array.isArray(summaryData.alerts) ? summaryData.alerts : [],
      })

      setSessions({
        sessionTimeoutMinutes: Number(sessionsData.sessionTimeoutMinutes || 30),
        activeSessionCount: Number(sessionsData.activeSessionCount || 0),
        currentSession: sessionsData.currentSession || null,
      })

      if (user?.role === 'admin' || user?.role === 'superadmin') {
        const obsRes = await fetch(`${API}/admin/observability/summary`, { headers })
        const obsData = await safeJson(obsRes)
        if (obsRes.ok) setObservability(obsData)
      }
    } catch (err) {
      setError(err.message || 'Unable to load dashboard.')
    } finally {
      setLoading(false)
    }
  }, [headers, token, user?.role])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  function openAlert(alert) {
    if (alert == null || alert.link_url == null || alert.link_url === '') return
    const link = String(alert.link_url)
    if (link.startsWith('http://') || link.startsWith('https://')) {
      window.open(link, '_blank', 'noopener,noreferrer')
      return
    }
    navigate(link)
  }

  const firstName = user?.name?.split(' ')[0] || 'there'

  return (
    <MIMSLayout showStatStrip={false} bodyClassName="mims-home-page-body">
      <div className="mims-home-wrap">
        <div className="mims-home-hero">
          <div>
            <h1>Welcome back, {firstName}</h1>
            <p>Home dashboard with case stats, recent activity, alerts, and session status.</p>
          </div>
          <div className="mims-home-hero-actions">
            <button className="btn btn-outline" onClick={loadDashboard} disabled={loading}>Refresh</button>
            <button className="btn btn-primary" onClick={() => navigate('/cases')}>Open Case Management</button>
          </div>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

        <div className="mims-home-stats-grid">
          <article className="mims-home-stat-card">
            <span>Total Cases</span>
            <strong>{Number(summary.stats.total_cases || 0)}</strong>
            <small>All active cases</small>
          </article>
          <article className="mims-home-stat-card accent">
            <span>Open Cases</span>
            <strong>{Number(summary.stats.open_cases || 0)}</strong>
            <small>Needs action</small>
          </article>
          <article className="mims-home-stat-card warning">
            <span>My Cases</span>
            <strong>{Number(summary.stats.my_cases || 0)}</strong>
            <small>Assigned to you</small>
          </article>
          <article className="mims-home-stat-card success">
            <span>Unassigned</span>
            <strong>{Number(summary.stats.unassigned_cases || 0)}</strong>
            <small>Awaiting owner</small>
          </article>
        </div>

        {(user?.role === 'admin' || user?.role === 'superadmin') && observability && (
          <section className="card" style={{ marginTop: 12 }}>
            <div className="card-header">
              <h3>Observability Snapshot (24h)</h3>
              <button className="btn btn-outline" onClick={() => navigate('/exceptions')}>Open Exception Logs</button>
            </div>
            <div className="card-body">
              <div className="mims-home-stats-grid">
                <article className="mims-home-stat-card">
                  <span>Server Errors</span>
                  <strong>{Number(observability.process_summary_24h?.server_errors || 0)}</strong>
                  <small>HTTP 5xx events</small>
                </article>
                <article className="mims-home-stat-card warning">
                  <span>Client Errors</span>
                  <strong>{Number(observability.process_summary_24h?.client_errors || 0)}</strong>
                  <small>HTTP 4xx + runtime</small>
                </article>
                <article className="mims-home-stat-card danger">
                  <span>Failed Service Logs</span>
                  <strong>{Number(observability.service_summary?.failed_logs || 0)}</strong>
                  <small>Background + API failures</small>
                </article>
                <article className="mims-home-stat-card">
                  <span>Avg API Latency</span>
                  <strong>{Math.round(Number(observability.process_summary_24h?.avg_duration_ms || 0))} ms</strong>
                  <small>Across tracked process logs</small>
                </article>
              </div>
            </div>
          </section>
        )}

        <div className="mims-home-grid">
          <section className="card">
            <div className="card-header">
              <h3>Recent Cases</h3>
              <button className="btn btn-outline" onClick={() => navigate('/cases')}>View all</button>
            </div>
            <div className="card-body">
              {loading ? (
                <div className="mims-home-empty">Loading recent cases…</div>
              ) : summary.recentCases.length === 0 ? (
                <div className="mims-home-empty">No case activity yet.</div>
              ) : (
                <div className="mims-home-list">
                  {summary.recentCases.map((item) => (
                    <button
                      key={item.id}
                      className="mims-home-list-item"
                      onClick={() => navigate(`/cases/${item.id}`)}
                    >
                      <div className="mims-home-list-main">
                        <div className="mims-home-list-title">{item.case_number || `Case #${item.id}`}</div>
                        <div className="mims-home-list-sub">
                          {item.case_type || '—'} • {item.owner_name || 'Unassigned'} • {formatDateTime(item.updated_at || item.created_at)}
                        </div>
                      </div>
                      <span className={`mims-status-pill ${statusTone(item.status_name)}`}>
                        {item.status_name || 'New'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <h3>Alerts</h3>
              <button className="btn btn-outline" onClick={() => navigate('/session-management')}>Session Mgmt</button>
            </div>
            <div className="card-body">
              {loading ? (
                <div className="mims-home-empty">Loading alerts…</div>
              ) : summary.alerts.length === 0 ? (
                <div className="mims-home-empty">No alerts right now.</div>
              ) : (
                <div className="mims-home-list">
                  {summary.alerts.map((alert) => (
                    <button
                      key={alert.id}
                      className={`mims-home-list-item ${alert.is_read ? '' : 'unread'}`}
                      onClick={() => openAlert(alert)}
                    >
                      <div className="mims-home-list-main">
                        <div className="mims-home-list-title">{alert.title || 'Alert'}</div>
                        <div className="mims-home-list-sub">
                          {(alert.category || 'general').toUpperCase()} • {formatDateTime(alert.created_at)}
                        </div>
                        <div className="mims-home-list-text">{alert.message || 'No details provided.'}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        <section className="card">
          <div className="card-header">
            <h3>Session Overview</h3>
            <button className="btn btn-outline" onClick={() => navigate('/session-management')}>
              Open Session Management
            </button>
          </div>
          <div className="card-body">
            <div className="mims-home-session-grid">
              <div className="mims-home-session-tile">
                <span>Idle Timeout</span>
                <strong>{Number(sessions.sessionTimeoutMinutes || 30)} min</strong>
              </div>
              <div className="mims-home-session-tile">
                <span>Active Sessions</span>
                <strong>{Number(sessions.activeSessionCount || 0)}</strong>
              </div>
              <div className="mims-home-session-tile wide">
                <span>Current Session Expires</span>
                <strong>{sessions.currentSession?.expires_at ? formatDateTime(sessions.currentSession.expires_at) : 'Not tracked yet'}</strong>
              </div>
            </div>
          </div>
        </section>
      </div>
    </MIMSLayout>
  )
}
