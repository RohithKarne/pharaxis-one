import { useState, useEffect, useCallback } from 'react'
import { guardedFetch } from '../utils/guardedFetch'

export default function DashboardView({ H, setActivePage }) {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await guardedFetch('/api/superadmin/dashboard', { headers: H })
      const data = await res.json()
      setSummary(data)
    } finally {
      setLoading(false)
    }
  }, [H.Authorization]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const kpis = summary?.kpis || {}
  const readiness = summary?.readiness || {}
  const cards = [
    { label: 'Organisations', value: kpis.organisations?.total || 0, note: `${kpis.organisations?.active || 0} active`, page: 'organizations' },
    { label: 'Users', value: kpis.users?.total || 0, note: `${kpis.users?.active || 0} active`, page: 'users' },
    { label: 'Failed Logins 24h', value: kpis.failedLogins24h || 0, note: 'Security watch', page: 'login-audit' },
    { label: 'Locked 2FA Users', value: kpis.lockedUsers || 0, note: 'Needs review', page: 'users' },
    { label: 'Unread Notifications', value: kpis.unreadNotifications || 0, note: 'In-app queue', page: 'notifications' },
    { label: 'Alert Events 24h', value: kpis.alertEvents24h || 0, note: `SMTP: ${kpis.smtpStatus || 'unknown'}`, page: 'alerts' },
    { label: 'Ready Orgs', value: readiness.readyOrgs || 0, note: `${readiness.attentionOrgs || 0} need attention`, page: 'organizations' },
    { label: 'Average Readiness', value: `${readiness.averageScore || 0}%`, note: `${readiness.totalBlockers || 0} active blockers`, page: 'organizations' },
  ]

  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Platform Health</h3>
          <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={load}>Refresh</button>
        </div>
        {loading && <div className="card-body" style={{ color: 'var(--text-muted)' }}>Loading dashboard…</div>}
        {!loading && (
          <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {cards.map(card => (
              <div
                key={card.label}
                onClick={() => setActivePage(card.page)}
                style={{
                  border: '1px solid var(--border)', borderRadius: 10, padding: 16,
                  background: 'var(--surface)', cursor: 'pointer', transition: 'box-shadow 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.12)'; e.currentTarget.style.borderColor = 'var(--primary)' }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.borderColor = 'var(--border)' }}
              >
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{card.label}</div>
                <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>{card.value}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{card.note}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
        <div className="card">
          <div className="card-header"><h3>Org Readiness</h3></div>
          <div className="card-body">
            {loading && <div style={{ color: 'var(--text-muted)' }}>Loading…</div>}
            {!loading && (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Ready organisations</div>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>{readiness.readyOrgs || 0}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Needs attention</div>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>{readiness.attentionOrgs || 0}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Average score</div>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>{readiness.averageScore || 0}%</div>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Org activation now depends on workflow, help, content, numbering, sites, and case data quality readiness.
                </div>
                <div>
                  <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => setActivePage('organizations')}>
                    Review Organisations
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3>Recent Audit Activity</h3></div>
          <div className="card-body">
            {loading && <div style={{ color: 'var(--text-muted)' }}>Loading…</div>}
            {!loading && !(summary?.recentAudit || []).length && <div style={{ color: 'var(--text-muted)' }}>No audit activity yet.</div>}
            {!loading && (summary?.recentAudit || []).map(log => (
              <div key={log.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{log.action} on {log.entity}{log.entity_id ? ` #${log.entity_id}` : ''}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{log.user_name || 'Unknown user'} • {log.created_at}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3>Recent Login Activity</h3></div>
          <div className="card-body">
            {loading && <div style={{ color: 'var(--text-muted)' }}>Loading…</div>}
            {!loading && !(summary?.recentLogins || []).length && <div style={{ color: 'var(--text-muted)' }}>No login activity yet.</div>}
            {!loading && (summary?.recentLogins || []).map(log => (
              <div key={log.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{log.user_name || 'Unknown user'} • {log.status}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{log.auth_event || log.fail_reason || 'login'} • {log.login_time}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
