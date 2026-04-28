import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import { httpFetch } from '../../../shared/api/httpFetch.js'

const API = '/api'
const DASHBOARD_SECTION_DEFAULTS = Object.freeze({
  miResponseActivity: false,
  observabilitySnapshot: false,
  recentCases: false,
  alerts: false,
  sessionOverview: false,
})

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

function normalizeSectionPrefs(value, canSeeObservability) {
  const next = {
    ...DASHBOARD_SECTION_DEFAULTS,
    ...(value && typeof value === 'object' ? value : {}),
  }
  if (!canSeeObservability) next.observabilitySnapshot = false
  return next
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { token, user } = useAuth()
  const canSeeObservability = user?.role === 'admin' || user?.role === 'superadmin'
  const headers = useMemo(
    () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
    [token]
  )
  const dashboardPrefsKey = useMemo(
    () => `mims_dashboard_sections_${user?.id || user?.email || 'guest'}`,
    [user?.email, user?.id]
  )

  const [summary, setSummary] = useState({
    stats: {
      total_cases: 0,
      open_cases: 0,
      my_cases: 0,
      unassigned_cases: 0,
      priority_cases: 0,
    },
    mi_stats: {
      pending_responses: 0,
      pending_approval: 0,
      sent_today: 0,
      sla_breached: 0,
    },
    recentCases: [],
    alerts: [],
  })
  const [sessions, setSessions] = useState({
    sessionTimeoutMinutes: 30,
    activeSessionCount: 0,
    currentSession: null,
  })
  const [sectionPrefs, setSectionPrefs] = useState(DASHBOARD_SECTION_DEFAULTS)
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [observability, setObservability] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(dashboardPrefsKey) || '{}')
      setSectionPrefs(normalizeSectionPrefs(saved, canSeeObservability))
    } catch {
      setSectionPrefs(normalizeSectionPrefs({}, canSeeObservability))
    }
  }, [dashboardPrefsKey, canSeeObservability])

  useEffect(() => {
    localStorage.setItem(
      dashboardPrefsKey,
      JSON.stringify(normalizeSectionPrefs(sectionPrefs, canSeeObservability))
    )
  }, [dashboardPrefsKey, sectionPrefs, canSeeObservability])

  const loadDashboard = useCallback(async () => {
    if (token == null) return
    setLoading(true)
    setError('')

    async function safeJson(res) {
      try { return await res.json() } catch { return {} }
    }

    try {
      const [summaryRes, sessionsRes] = await Promise.all([
        httpFetch(`${API}/cases/dashboard-summary`, { headers }),
        httpFetch(`${API}/auth/sessions`, { headers }),
      ])

      const [summaryData, sessionsData] = await Promise.all([
        safeJson(summaryRes),
        safeJson(sessionsRes),
      ])

      if (!summaryRes.ok) throw new Error(summaryData.error || 'Failed to load dashboard summary.')
      if (!sessionsRes.ok) throw new Error(sessionsData.error || 'Failed to load session details.')

      setSummary({
        stats: summaryData.stats || {},
        mi_stats: summaryData.mi_stats || { pending_responses: 0, pending_approval: 0, sent_today: 0, sla_breached: 0 },
        recentCases: Array.isArray(summaryData.recentCases) ? summaryData.recentCases : [],
        alerts: Array.isArray(summaryData.alerts) ? summaryData.alerts : [],
      })

      setSessions({
        sessionTimeoutMinutes: Number(sessionsData.sessionTimeoutMinutes || 30),
        activeSessionCount: Number(sessionsData.activeSessionCount || 0),
        currentSession: sessionsData.currentSession || null,
      })

      if (canSeeObservability && sectionPrefs.observabilitySnapshot) {
        const obsRes = await httpFetch(`${API}/admin/observability/summary`, { headers })
        const obsData = await safeJson(obsRes)
        if (obsRes.ok) setObservability(obsData)
      } else {
        setObservability(null)
      }
    } catch (err) {
      setError(err.message || 'Unable to load dashboard.')
    } finally {
      setLoading(false)
    }
  }, [canSeeObservability, headers, sectionPrefs.observabilitySnapshot, token])

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
  const visibleOptionalSections =
    Number(sectionPrefs.miResponseActivity) +
    Number(sectionPrefs.observabilitySnapshot && canSeeObservability) +
    Number(sectionPrefs.recentCases) +
    Number(sectionPrefs.alerts) +
    Number(sectionPrefs.sessionOverview)

  function setSectionEnabled(key, enabled) {
    setSectionPrefs(prev => normalizeSectionPrefs({ ...prev, [key]: enabled }, canSeeObservability))
  }

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
            <button className="btn btn-outline" onClick={() => setPrefsOpen(true)}>Customize Sections</button>
            <button className="btn btn-primary" onClick={() => navigate('/cases')}>Open Case Management</button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Optional sections enabled: {visibleOptionalSections}
          </div>
          <button
            className="btn btn-outline"
            style={{ fontSize: 12 }}
            onClick={() => setSectionPrefs(normalizeSectionPrefs({}, canSeeObservability))}
          >
            Disable Optional Sections
          </button>
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

        {sectionPrefs.miResponseActivity && (
          <section className="card" style={{ marginTop: 12 }}>
            <div className="card-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <h3>MI Response Activity</h3>
              <button className="btn btn-outline" style={{ fontSize:12 }} onClick={() => navigate('/response-log')}>View Response Log →</button>
            </div>
            <div className="card-body">
              <div className="mims-home-stats-grid">
                <article className="mims-home-stat-card">
                  <span>In Progress</span>
                  <strong>{Number(summary.mi_stats.pending_responses || 0)}</strong>
                  <small>Draft / Ready</small>
                </article>
                <article className="mims-home-stat-card warning">
                  <span>Pending Approval</span>
                  <strong>{Number(summary.mi_stats.pending_approval || 0)}</strong>
                  <small>Awaiting e-sign</small>
                </article>
                <article className="mims-home-stat-card success">
                  <span>Sent Today</span>
                  <strong>{Number(summary.mi_stats.sent_today || 0)}</strong>
                  <small>Delivered to HCP</small>
                </article>
                <article className="mims-home-stat-card" style={{ borderLeft: summary.mi_stats.sla_breached > 0 ? '4px solid #dc2626' : undefined }}>
                  <span style={{ color: summary.mi_stats.sla_breached > 0 ? '#dc2626' : undefined }}>SLA Breached</span>
                  <strong style={{ color: summary.mi_stats.sla_breached > 0 ? '#dc2626' : undefined }}>{Number(summary.mi_stats.sla_breached || 0)}</strong>
                  <small>Past response deadline</small>
                </article>
              </div>
            </div>
          </section>
        )}

        {sectionPrefs.observabilitySnapshot && canSeeObservability && observability && (
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

        {(sectionPrefs.recentCases || sectionPrefs.alerts) ? (
          <div className="mims-home-grid">
            {sectionPrefs.recentCases && (
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
            )}

            {sectionPrefs.alerts && (
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
            )}
          </div>
        ) : null}

        {sectionPrefs.sessionOverview && (
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
        )}

        {visibleOptionalSections === 0 && (
          <section className="card" style={{ marginTop: 12 }}>
            <div className="card-body">
              <div className="mims-home-empty">
                Optional dashboard sections are disabled. Use <strong>Customize Sections</strong> to turn on the widgets you need.
              </div>
            </div>
          </section>
        )}
      </div>

      {prefsOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          zIndex: 9999,
        }}>
          <div
            className="card"
            style={{ width: '100%', maxWidth: 520, maxHeight: '85vh', overflow: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-header">
              <h3>Dashboard Section Preferences</h3>
              <button className="btn btn-outline" onClick={() => setPrefsOpen(false)}>Close</button>
            </div>
            <div className="card-body" style={{ display: 'grid', gap: 12 }}>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>
                Enable only the dashboard sections you want to see. All optional sections are off by default for each user.
              </p>

              <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 12, border: '1px solid var(--border)', borderRadius: 10 }}>
                <input type="checkbox" checked={sectionPrefs.miResponseActivity} onChange={(e) => setSectionEnabled('miResponseActivity', e.target.checked)} />
                <span>
                  <strong style={{ display: 'block' }}>MI Response Activity</strong>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Pending responses, approvals, sent-today count, and SLA breaches.</span>
                </span>
              </label>

              {canSeeObservability && (
                <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 12, border: '1px solid var(--border)', borderRadius: 10 }}>
                  <input type="checkbox" checked={sectionPrefs.observabilitySnapshot} onChange={(e) => setSectionEnabled('observabilitySnapshot', e.target.checked)} />
                  <span>
                    <strong style={{ display: 'block' }}>Observability Snapshot</strong>
                    <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Technical health metrics for admins and superadmins.</span>
                  </span>
                </label>
              )}

              <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 12, border: '1px solid var(--border)', borderRadius: 10 }}>
                <input type="checkbox" checked={sectionPrefs.recentCases} onChange={(e) => setSectionEnabled('recentCases', e.target.checked)} />
                <span>
                  <strong style={{ display: 'block' }}>Recent Cases</strong>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Quick access to the latest case activity.</span>
                </span>
              </label>

              <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 12, border: '1px solid var(--border)', borderRadius: 10 }}>
                <input type="checkbox" checked={sectionPrefs.alerts} onChange={(e) => setSectionEnabled('alerts', e.target.checked)} />
                <span>
                  <strong style={{ display: 'block' }}>Alerts</strong>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>User notifications and alert-driven shortcuts.</span>
                </span>
              </label>

              <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: 12, border: '1px solid var(--border)', borderRadius: 10 }}>
                <input type="checkbox" checked={sectionPrefs.sessionOverview} onChange={(e) => setSectionEnabled('sessionOverview', e.target.checked)} />
                <span>
                  <strong style={{ display: 'block' }}>Session Overview</strong>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Idle timeout, session count, and current expiry information.</span>
                </span>
              </label>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
                <button className="btn btn-outline" onClick={() => setSectionPrefs(normalizeSectionPrefs({}, canSeeObservability))}>
                  Reset To Default
                </button>
                <button className="btn btn-primary" onClick={() => setPrefsOpen(false)}>
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </MIMSLayout>
  )
}
