import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import { httpFetch } from '../../../shared/api/httpFetch.js'
import { formatAdminRoleLabel, isAdminUser } from '../../../shared/utils/adminScope.js'
import { prefetchRoutePath } from '../../../shared/utils/routePrefetch.js'

const API = '/api'

function roleLabel(role) {
  if (isAdminUser(role)) return formatAdminRoleLabel(role)
  if (role === 'reviewer') return 'Reviewer'
  if (role === 'content_manager') return 'Content Manager'
  return 'Case Operator'
}

function buildFocusCards({ user, summary, sessions, canSeeObservability }) {
  const isAdmin = isAdminUser(user)
  if (isAdmin) {
    return [
      {
        title: 'Unassigned intake',
        value: Number(summary.stats.unassigned_cases || 0),
        body: 'Claim new work quickly so the queue does not age without an owner.',
        actionLabel: 'Open unassigned queue',
        actionTo: '/cases?tab=unassigned',
        tone: 'warning',
      },
      {
        title: 'Approval queue',
        value: Number(summary.mi_stats.pending_approval || 0),
        body: 'Keep approval bottlenecks visible before they turn into SLA misses.',
        actionLabel: 'Open response log',
        actionTo: '/response-log',
        tone: 'accent',
      },
      {
        title: canSeeObservability ? 'Platform watch' : 'Session watch',
        value: canSeeObservability ? Number(summary.alerts.length || 0) : Number(sessions.activeSessionCount || 0),
        body: canSeeObservability
          ? 'Review alerts, errors, and service health from the same working session.'
          : 'Review active sessions and confirm access is healthy for today’s work.',
        actionLabel: canSeeObservability ? 'Open exception logs' : 'Open session management',
        actionTo: canSeeObservability ? '/exceptions' : '/session-management',
        tone: canSeeObservability ? 'danger' : 'success',
      },
    ]
  }

  return [
    {
      title: 'My queue',
      value: Number(summary.stats.my_cases || 0),
      body: 'Jump directly into the cases already assigned to you.',
      actionLabel: 'Open my cases',
      actionTo: '/cases?tab=my',
      tone: 'accent',
    },
    {
      title: 'Response work',
      value: Number(summary.mi_stats.pending_responses || 0),
      body: 'Track draft and ready responses without searching through the full queue.',
      actionLabel: 'Open response log',
      actionTo: '/response-log',
      tone: 'warning',
    },
    {
      title: 'Session health',
      value: Number(sessions.activeSessionCount || 0),
      body: 'Confirm the current session window before longer drafting or review work.',
      actionLabel: 'Open session management',
      actionTo: '/session-management',
      tone: 'success',
    },
  ]
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { token, user, orgName, hasModuleAccess } = useAuth()
  const canSeeObservability = isAdminUser(user)
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showWebauthnBanner, setShowWebauthnBanner] = useState(false)
  const [webauthnSetupLoading, setWebauthnSetupLoading] = useState(false)
  const [webauthnSetupError, setWebauthnSetupError] = useState('')

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
    } catch (err) {
      setError(err.message || 'Unable to load dashboard.')
    } finally {
      setLoading(false)
    }
  }, [headers, token])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  // Touch ID setup banner — shown when the user has no passkey on this device.
  // "Not now" snoozes for the current session only (sessionStorage), so the
  // nudge returns next login until they actually set it up. We intentionally do
  // NOT use a permanent localStorage flag — that hid the banner forever before.
  useEffect(() => {
    async function checkWebauthnSetup() {
      if (!token) return
      if (typeof window.PublicKeyCredential === 'undefined') return
      if (sessionStorage.getItem('mims_webauthn_snoozed')) return
      try {
        const res = await httpFetch('/api/auth/webauthn/credentials', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const data = await res.json().catch(() => ({}))
        if (!Array.isArray(data.credentials) || data.credentials.length === 0) {
          setShowWebauthnBanner(true)
        }
      } catch { /* non-critical — swallow */ }
    }
    checkWebauthnSetup()
  }, [token])

  async function handleSetupTouchId() {
    setWebauthnSetupLoading(true)
    setWebauthnSetupError('')
    try {
      const startRes = await httpFetch('/api/auth/webauthn/register/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      })
      const startData = await startRes.json().catch(() => ({}))
      if (!startRes.ok) throw new Error(startData.error || 'Could not start Touch ID setup.')

      const { startRegistration } = await import('@simplewebauthn/browser')
      const regResponse = await startRegistration({ optionsJSON: startData.options })

      const finishRes = await httpFetch('/api/auth/webauthn/register/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          registrationResponse: regResponse,
          deviceName: `${navigator.platform || 'Mac'} — Touch ID`,
        }),
      })
      const finishData = await finishRes.json().catch(() => ({}))
      if (!finishRes.ok) throw new Error(finishData.error || 'Touch ID registration failed.')

      // Credential now exists — banner won't show again (credential check skips it)
      setShowWebauthnBanner(false)
    } catch (err) {
      if (err?.name === 'NotAllowedError') {
        // User cancelled the Touch ID prompt — snooze for this session
        sessionStorage.setItem('mims_webauthn_snoozed', '1')
        setShowWebauthnBanner(false)
      } else {
        // Surface the real reason so it's not a silent failure
        setWebauthnSetupError(err.message || 'Touch ID setup failed. Please try again.')
      }
    } finally {
      setWebauthnSetupLoading(false)
    }
  }

  function dismissWebauthnBanner() {
    sessionStorage.setItem('mims_webauthn_snoozed', '1')
    setShowWebauthnBanner(false)
  }

  const firstName = user?.name?.split(' ')[0] || 'there'
  const roleName = roleLabel(user?.role)
  const focusCards = buildFocusCards({ user, summary, sessions, canSeeObservability })
  const canAccessModule = (moduleKey) => (hasModuleAccess ? hasModuleAccess(moduleKey) : false)
  const moduleLaunchers = [
    {
      key: 'cases',
      title: 'Case Management',
      body: 'Triage, assign, and progress operational case work from one queue.',
      to: '/cases',
      enabled: canAccessModule('mims_core') || canAccessModule('case_mgmt'),
    },
    {
      key: 'inbox',
      title: 'Inbox',
      body: 'Stay close to inbound requests, assignments, and coordination updates.',
      to: '/inbox',
      enabled: canAccessModule('mims_core'),
    },
    {
      key: 'browse',
      title: 'Browse Content',
      body: 'Find approved knowledge assets without leaving the main operating flow.',
      to: '/browse-content',
      enabled: canAccessModule('browse_content') || canAccessModule('content_mgmt'),
    },
    {
      key: 'content',
      title: 'Content Management',
      body: 'Author, govern, and publish controlled content in the same product shell.',
      to: '/content',
      enabled: canSeeObservability && canAccessModule('content_mgmt'),
    },
    {
      key: 'reports',
      title: 'Reports Workspace',
      body: 'Move from dashboards to governed exports and scheduled delivery cleanly.',
      to: '/reports',
      enabled: canSeeObservability && canAccessModule('reports'),
    },
    {
      key: 'admin',
      title: 'MIMS Admin',
      body: 'Manage access, configuration, service oversight, and audit-ready controls.',
      to: '/mims-admin',
      enabled: canSeeObservability && canAccessModule('admin_console'),
    },
  ].filter((item) => item.enabled)

  return (
    <MIMSLayout showStatStrip={false} bodyClassName="mims-home-page-body" surfaceVariant="workspace" compact>
      <div className="mims-home-wrap">

        {showWebauthnBanner && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', marginBottom: 16,
            background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 10, gap: 12, flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Set up Touch ID for faster sign-in</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Sign in to MIMS with your fingerprint instead of a password on this device.
              </div>
              {webauthnSetupError && (
                <div style={{ fontSize: 12, color: 'var(--danger, #c0392b)', marginTop: 6, fontWeight: 500 }}>
                  {webauthnSetupError}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button
                className="btn btn-primary"
                style={{ fontSize: 13 }}
                disabled={webauthnSetupLoading}
                onClick={handleSetupTouchId}
              >
                {webauthnSetupLoading ? 'Setting up…' : 'Set Up Touch ID'}
              </button>
              <button
                className="btn btn-outline"
                style={{ fontSize: 13 }}
                disabled={webauthnSetupLoading}
                onClick={dismissWebauthnBanner}
              >
                Not now
              </button>
            </div>
          </div>
        )}

        <div className="mims-home-hero">
          <div className="mims-home-hero-copy">
            <div className="mims-home-eyebrow">{roleName} Workspace</div>
            <h1>Welcome back, {firstName}</h1>
            <p>
              {canSeeObservability
                ? 'Track work ownership, approvals, and platform health from one operating view.'
                : 'See your active workload and response activity without jumping across modules.'}
            </p>
            <div className="mims-home-meta">
              <span className="mims-home-meta-pill strong">{roleName}</span>
              {orgName && <span className="mims-home-meta-pill">{orgName}</span>}
            </div>
          </div>
          <div className="mims-home-hero-actions">
              <button className="btn btn-outline" onClick={loadDashboard} disabled={loading}>Refresh</button>
            <button className="btn btn-primary" onMouseEnter={() => prefetchRoutePath('/cases')} onFocus={() => prefetchRoutePath('/cases')} onClick={() => navigate('/cases')}>Open Case Management</button>
          </div>
        </div>

        <section className="mims-home-focus-grid" aria-label="Today focus">
          {focusCards.map((item) => (
            <article key={item.title} className={`mims-home-focus-card ${item.tone || ''}`}>
              <div className="mims-home-focus-top">
                <div>
                  <div className="mims-home-focus-title">{item.title}</div>
                  <div className="mims-home-focus-body">{item.body}</div>
                </div>
                <strong>{item.value}</strong>
              </div>
              <button className="btn btn-outline" style={{ fontSize: 12 }} onMouseEnter={() => prefetchRoutePath(item.actionTo)} onFocus={() => prefetchRoutePath(item.actionTo)} onClick={() => navigate(item.actionTo)}>
                {item.actionLabel}
              </button>
            </article>
          ))}
        </section>

        {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

        <section className="mims-workbench-grid" aria-label="Workspace launchpad" style={{ gridTemplateColumns: '1fr' }}>
          <article className="card mims-workbench-panel">
            <div className="card-header">
              <h3>Workspace Launchpad</h3>
              <span className="mims-workbench-panel-note">Open the module you need and get to work.</span>
            </div>
            <div className="card-body">
              <div className="mims-workbench-card-grid">
                {moduleLaunchers.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className="mims-workbench-card"
                    onMouseEnter={() => prefetchRoutePath(item.to)}
                    onFocus={() => prefetchRoutePath(item.to)}
                    onClick={() => navigate(item.to)}
                  >
                    <strong>{item.title}</strong>
                    <span>{item.body}</span>
                    <small>Open workspace</small>
                  </button>
                ))}
              </div>
            </div>
          </article>
        </section>
      </div>
    </MIMSLayout>
  )
}
