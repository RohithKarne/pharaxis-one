/**
 * Dashboard.jsx — MIMS Admin home / landing tab
 *
 * Platform-level KPIs + readiness + recent audit/login activity.
 * Migrated from superadmin/DashboardView. Backend endpoint
 * `/api/superadmin/dashboard` now accepts admin role.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch.js'

export default function Dashboard({ onNavigateTab }) {
  const { token } = useAuth()
  const H = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])

  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activity, setActivity] = useState([])
  const [activityLoading, setActivityLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await httpFetch('/api/superadmin/dashboard', { headers: H })
      const data = await res.json()
      setSummary(data)
    } finally {
      setLoading(false)
    }
  }, [H])

  const loadActivity = useCallback(async () => {
    setActivityLoading(true)
    try {
      const res  = await httpFetch('/api/admin/dashboard/activity?limit=50', { headers: H })
      const data = await res.json()
      setActivity(data.activity || [])
    } catch {
      setActivity([])
    } finally {
      setActivityLoading(false)
    }
  }, [H])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    loadActivity()
    const id = setInterval(loadActivity, 30_000)  // refresh every 30s
    return () => clearInterval(id)
  }, [loadActivity])

  const kpis      = summary?.kpis      || {}
  const readiness = summary?.readiness || {}

  // Each card optionally navigates to another tab when clicked
  const cards = [
    { label: 'Organisations',        value: kpis.organisations?.total || 0, note: `${kpis.organisations?.active || 0} active`, tab: 'organizations' },
    { label: 'Users',                value: kpis.users?.total || 0,         note: `${kpis.users?.active || 0} active`,         tab: null },
    { label: 'Failed Logins 24h',    value: kpis.failedLogins24h || 0,      note: 'Security watch',                            tab: null },
    { label: 'Locked 2FA Users',     value: kpis.lockedUsers || 0,          note: 'Needs review',                              tab: null },
    { label: 'Unread Notifications', value: kpis.unreadNotifications || 0,  note: 'In-app queue',                              tab: null },
    { label: 'Alert Events 24h',     value: kpis.alertEvents24h || 0,       note: 'Platform alerts',                           tab: null },
    { label: 'Ready Orgs',           value: readiness.readyOrgs || 0,       note: `${readiness.attentionOrgs || 0} need attention`, tab: 'organizations' },
    { label: 'Average Readiness',    value: `${readiness.averageScore || 0}%`, note: `${readiness.totalBlockers || 0} active blockers`, tab: 'organizations' },
  ]

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>

      {/* Platform Health card */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Platform Health</h3>
          <button
            className="btn btn-outline"
            style={{ fontSize: 12, padding: '5px 12px' }}
            onClick={load}
          >Refresh</button>
        </div>
        {loading && <div className="card-body" style={{ color: 'var(--text-muted)' }}>Loading dashboard…</div>}
        {!loading && (
          <div
            className="card-body"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}
          >
            {cards.map(card => (
              <div
                key={card.label}
                onClick={() => card.tab && onNavigateTab?.(card.tab)}
                style={{
                  border: '1px solid var(--border)', borderRadius: 10, padding: 16,
                  background: 'var(--surface)',
                  cursor: card.tab ? 'pointer' : 'default',
                  transition: 'box-shadow 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => {
                  if (!card.tab) return
                  e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.10)'
                  e.currentTarget.style.borderColor = 'var(--accent)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.boxShadow = ''
                  e.currentTarget.style.borderColor = 'var(--border)'
                }}
              >
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{card.label}</div>
                <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>{card.value}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{card.note}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Three side-by-side panels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>

        {/* Org Readiness */}
        <div className="card">
          <div className="card-header"><h3 style={{ margin: 0, fontSize: 15 }}>Org Readiness</h3></div>
          <div className="card-body">
            {loading && <div style={{ color: 'var(--text-muted)' }}>Loading…</div>}
            {!loading && (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Ready</div>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>{readiness.readyOrgs || 0}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Need attention</div>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>{readiness.attentionOrgs || 0}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Avg score</div>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>{readiness.averageScore || 0}%</div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Activation depends on workflow, help, content, numbering, sites, and case data readiness.
                </div>
                <div>
                  <button
                    className="btn btn-outline"
                    style={{ fontSize: 12, padding: '5px 12px' }}
                    onClick={() => onNavigateTab?.('organizations')}
                  >Review Organisations</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Recent Audit */}
        <div className="card">
          <div className="card-header"><h3 style={{ margin: 0, fontSize: 15 }}>Recent Audit Activity</h3></div>
          <div className="card-body">
            {loading && <div style={{ color: 'var(--text-muted)' }}>Loading…</div>}
            {!loading && !(summary?.recentAudit || []).length && (
              <div style={{ color: 'var(--text-muted)' }}>No audit activity yet.</div>
            )}
            {!loading && (summary?.recentAudit || []).map(log => (
              <div key={log.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {log.action} on {log.entity}{log.entity_id ? ` #${log.entity_id}` : ''}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {log.user_name || 'Unknown user'} · {log.created_at}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Login */}
        <div className="card">
          <div className="card-header"><h3 style={{ margin: 0, fontSize: 15 }}>Recent Login Activity</h3></div>
          <div className="card-body">
            {loading && <div style={{ color: 'var(--text-muted)' }}>Loading…</div>}
            {!loading && !(summary?.recentLogins || []).length && (
              <div style={{ color: 'var(--text-muted)' }}>No login activity yet.</div>
            )}
            {!loading && (summary?.recentLogins || []).map(log => (
              <div key={log.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {log.user_name || 'Unknown user'} · {log.status}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {log.auth_event || log.fail_reason || 'login'} · {log.login_time}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Platform Activity — live feed across audit + login + case audit + transmissions */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>
            Recent Platform Activity {activityLoading && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>· refreshing…</span>}
          </h3>
          <button className="btn btn-outline" style={{ fontSize: 12, padding: '5px 12px' }} onClick={loadActivity}>Refresh</button>
        </div>
        <div className="card-body" style={{ maxHeight: 360, overflowY: 'auto', padding: 0 }}>
          {activity.length === 0 && !activityLoading && (
            <div style={{ padding: 18, color: 'var(--text-muted)', fontSize: 13 }}>No activity yet.</div>
          )}
          {activity.map((evt, idx) => (
            <div key={`${evt.source}-${evt.source_id}-${idx}`} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em',
                padding: '2px 7px', borderRadius: 4, flexShrink: 0, marginTop: 2,
                background: evt.source === 'audit' ? '#dbeafe'
                          : evt.source === 'login' ? '#fef3c7'
                          : evt.source === 'case_audit' ? '#dcfce7'
                          : '#fce7f3',
                color: evt.source === 'audit' ? '#1e40af'
                     : evt.source === 'login' ? '#92400e'
                     : evt.source === 'case_audit' ? '#166534'
                     : '#9d174d',
              }}>{evt.source.replace('_', ' ')}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {evt.action} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>on</span> {evt.entity}{evt.entity_id ? ` #${evt.entity_id}` : ''}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {evt.who} · {evt.ts ? new Date(evt.ts).toLocaleString() : ''}
                </div>
                {evt.detail && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {evt.detail}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
