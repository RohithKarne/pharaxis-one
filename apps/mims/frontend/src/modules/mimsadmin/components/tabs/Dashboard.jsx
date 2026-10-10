/**
 * Dashboard.jsx — MIMS Admin home / landing tab
 *
 * Platform-level KPIs + readiness + recent audit/login activity.
 * Platform admin dashboard. Canonical backend endpoint
 * is `/api/admin/platform/dashboard`.
 */

import { lazy, Suspense, useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch.js'
import { isPlatformAdmin } from '../../../../shared/utils/adminScope.js'
import { useAdminTenant } from '../../utils/AdminTenantContext'

const MentionsInbox = lazy(() => import('../../../../shared/components/collab/MentionsInbox'))
const RecentPinnedWidget = lazy(() => import('../../../../shared/components/caseActions/RecentPinnedWidget'))
const PcSignalsWidget = lazy(() => import('../../../../shared/components/PcSignalsWidget'))

// Where a failed setup check is fixed, when the admin console has a screen for it.
const CHECK_SCREENS = {
  workflow:  'sys-setup-workflow',
  numbering: 'sys-setup-case-numbering',
}

// The admin home opened on one empty "PC Signals" box for an organisation's admin
// (MIMS screen review, row 7). It now leads with the organisation's setup checks —
// the ones run when it was created — recent admin changes and the common settings.
function AdminHome({ onNavigateTab, commonSettings }) {
  const { token, user } = useAuth()
  const { tenantId, tenants } = useAdminTenant()
  const platform = isPlatformAdmin(user)
  const [readiness, setReadiness] = useState(null)
  const [readinessError, setReadinessError] = useState('')
  const [changes, setChanges] = useState(null)

  useEffect(() => {
    if (!tenantId) return undefined
    let cancelled = false
    const H = { Authorization: `Bearer ${token}` }
    httpFetch(`/api/admin/orgs/${tenantId}/readiness`, { headers: H })
      .then(async r => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.error || `Could not load setup checks (${r.status}).`)
        if (!cancelled) { setReadiness(data); setReadinessError('') }
      })
      .catch(err => { if (!cancelled) { setReadiness(null); setReadinessError(err.message) } })
    httpFetch('/api/admin/audit-logs?page_size=10&named_only=1', { headers: H })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(data => { if (!cancelled) setChanges((data.logs || []).slice(0, 5)) })
      .catch(() => { if (!cancelled) setChanges([]) })
    return () => { cancelled = true }
  }, [tenantId, token])

  const orgName = readiness?.org_name || tenants.find(t => String(t.id) === String(tenantId))?.name || 'this organisation'
  const openSystem = value => onNavigateTab?.('system', 'system', value)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginBottom: 14 }}>
      <div className="card">
        <div className="card-header"><h3 style={{ margin: 0, fontSize: 15 }}>Setup checks for {orgName}</h3></div>
        <div className="card-body">
          {!readiness && !readinessError && <div style={{ color: 'var(--text-muted)' }}>Loading…</div>}
          {readinessError && <div style={{ color: '#b91c1c' }}>{readinessError}</div>}
          {readiness && (
            <>
              <div style={{ marginBottom: 8 }}>
                {readiness.ready ? 'All checks pass.' : `${readiness.blockers.length} of ${readiness.checks.length} checks need attention.`}
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
                {readiness.checks.map(check => (
                  <li key={check.key} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <span role="img" aria-label={check.ok ? 'Passes' : 'Needs attention'} style={{ color: check.ok ? '#15803d' : '#b91c1c', fontWeight: 'bold' }}>{check.ok ? '✓' : '✕'}</span>
                    <span>
                      {CHECK_SCREENS[check.key]
                        ? <a href="#" onClick={e => { e.preventDefault(); openSystem(CHECK_SCREENS[check.key]) }}>{check.label}</a>
                        : check.label}
                      <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>{check.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3 style={{ margin: 0, fontSize: 15 }}>{platform ? 'Recent changes, all organisations' : 'Recent changes'}</h3></div>
        <div className="card-body">
          {changes === null && <div style={{ color: 'var(--text-muted)' }}>Loading…</div>}
          {changes?.length === 0 && <div style={{ color: 'var(--text-muted)' }}>No changes recorded yet.</div>}
          {changes?.map(log => (
            <div key={log.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13 }}>{log.action} {log.entity}{log.entity_id ? ` #${log.entity_id}` : ''}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{log.user_name || 'Unknown user'} · {log.created_at ? new Date(log.created_at).toLocaleString() : ''}</div>
            </div>
          ))}
        </div>
      </div>

      {commonSettings?.length > 0 && (
        <div className="card">
          <div className="card-header"><h3 style={{ margin: 0, fontSize: 15 }}>Common settings</h3></div>
          <div className="card-body">
            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
              {commonSettings.map(leaf => (
                <li key={leaf.value}>
                  <a href="#" onClick={e => { e.preventDefault(); onNavigateTab?.(leaf.tab, leaf.key, leaf.value) }}>{leaf.label}</a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

function SecondarySectionLoader({ label = 'Loading insights...' }) {
  return (
    <div className="card" style={{ minHeight: 168 }}>
      <div className="card-body" style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 168 }}>
        {label}
      </div>
    </div>
  )
}

export default function Dashboard({ onNavigateTab, commonSettings }) {
  const { token, user } = useAuth()
  const navigate = useNavigate()
  const H = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])

  // Platform Health is platform-wide (all orgs, all users). An org admin was
  // sent to the platform-only endpoint, got a 403 banner and every tile read 0
  // (T10 / M-34) — the card is now for platform admins only, and a failed load
  // says so instead of showing zeros.
  const platform = isPlatformAdmin(user)
  const [summary, setSummary] = useState(null)
  const [summaryError, setSummaryError] = useState('')
  const [loading, setLoading] = useState(true)
  const [activity, setActivity] = useState([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [secondaryReady, setSecondaryReady] = useState(false)
  const load = useCallback(async () => {
    if (!platform) { setLoading(false); return }
    setLoading(true)
    setSummaryError('')
    try {
      const res  = await httpFetch('/api/admin/platform/dashboard', { headers: H })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Could not load platform health (${res.status}).`)
      setSummary(data)
    } catch (err) {
      setSummary(null)
      setSummaryError(err.message || 'Could not load platform health.')
    } finally {
      setLoading(false)
    }
  }, [H, platform])

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
    let cancelled = false
    const onIdle = () => {
      if (!cancelled) setSecondaryReady(true)
    }
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(onIdle, { timeout: 1200 })
      return () => {
        cancelled = true
        if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleId)
      }
    }
    const timeoutId = window.setTimeout(onIdle, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [])

  useEffect(() => {
    if (!secondaryReady || !platform) return undefined
    loadActivity()
    const id = setInterval(loadActivity, 45_000)
    return () => clearInterval(id)
  }, [loadActivity, secondaryReady, platform])

  const kpis      = summary?.kpis      || {}
  const readiness = summary?.readiness || {}

  // Each card optionally navigates to another tab when clicked
  const cards = [
    { label: 'Organisations',        value: kpis.organisations?.total || 0, note: `${kpis.organisations?.active || 0} active`, tab: 'organizations' },
    { label: 'Users',                value: kpis.users?.total || 0,         note: `${kpis.users?.active || 0} active`,         tab: 'system', systemItem: 'sys-sec-users' },
    { label: 'Failed Logins 24h',    value: kpis.failedLogins24h || 0,      note: 'Security watch',                            tab: null },
    { label: 'Locked 2FA Users',     value: kpis.lockedUsers || 0,          note: 'Needs review',                              tab: 'system', systemItem: 'sys-sec-users' },
    { label: 'Unread Notifications', value: kpis.unreadNotifications || 0,  note: 'In-app queue',                              tab: null },
    { label: 'Alert Events 24h',     value: kpis.alertEvents24h || 0,       note: 'Platform alerts',                           tab: null },
    { label: 'Ready Orgs',           value: readiness.readyOrgs || 0,       note: `${readiness.attentionOrgs || 0} need attention`, tab: 'organizations' },
    { label: 'Average Readiness',    value: readiness.averageScore == null ? '—' : `${readiness.averageScore}%`, note: `${readiness.totalBlockers || 0} active blockers`, tab: 'organizations' },
  ]

  function openCase(caseId) {
    if (!caseId) return
    navigate(`/cases/${caseId}`)
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
      
      {/* No role "modes": the Compliance / Operations / IT-Security views were
          fixed sentences shown as data ("E-signature chains 100% intact", "All
          users have 2FA enabled", "Active sessions: 142") — none read anything,
          and some were false. Removed (T10, 2026-09-29); this page shows only
          what it loads. */}

      <AdminHome onNavigateTab={onNavigateTab} commonSettings={commonSettings} />

      {/* Platform Health card */}
      {platform && (
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
        {!loading && summaryError && <div className="card-body" style={{ color: '#b91c1c' }}>{summaryError}</div>}
        {!loading && !summaryError && (
          <table className="admin-table mims-queue-table">
            <tbody>
              {cards.map(card => (
                <tr key={card.label}>
                  <td>
                    {card.tab
                      ? <a href="#" onClick={e => { e.preventDefault(); onNavigateTab?.(card.tab, card.systemItem ? 'system' : null, card.systemItem || '') }}>{card.label}</a>
                      : card.label}
                  </td>
                  <td className="num">{card.value}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{card.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      )}

      {/* Wave 4 + Sprint 2 widgets — mentions inbox, recent/pinned cases, PC signals */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12, marginBottom: 14 }}>
        {secondaryReady ? (
          <Suspense fallback={<><SecondarySectionLoader /><SecondarySectionLoader /><SecondarySectionLoader /></>}>
            <MentionsInbox onOpen={(m) => openCase(m.case_id)} />
            <RecentPinnedWidget onOpen={(cid) => openCase(cid)} />
            <PcSignalsWidget />
          </Suspense>
        ) : (
          <>
            <SecondarySectionLoader label="Loading mentions..." />
            <SecondarySectionLoader label="Loading pinned cases..." />
            <SecondarySectionLoader label="Loading PC signals..." />
          </>
        )}
      </div>

      {/* Three side-by-side panels — platform summary data, platform admins only (M-34) */}
      {platform && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>

        {/* Org Readiness */}
        <div className="card">
          <div className="card-header"><h3 style={{ margin: 0, fontSize: 15 }}>Org Readiness</h3></div>
          <div className="card-body">
            {loading && <div style={{ color: 'var(--text-muted)' }}>Loading…</div>}
            {!loading && (
              <div style={{ display: 'grid', gap: 10 }}>
                <div>
                  Ready: <b>{readiness.readyOrgs || 0}</b> · Need attention: <b>{readiness.attentionOrgs || 0}</b> · Average score: <b>{readiness.averageScore == null ? '—' : `${readiness.averageScore}%`}</b>
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
      )}

      {/* Recent Platform Activity — live feed across audit + login + case audit + transmissions.
          Spans every organisation, so platform admins only (M-34). */}
      {platform && (
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>
            Recent Platform Activity {activityLoading && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>· refreshing…</span>}
          </h3>
          <button className="btn btn-outline" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => {
            if (!secondaryReady) setSecondaryReady(true)
            loadActivity()
          }}>Refresh</button>
        </div>
        <div className="card-body" tabIndex={0} role="region" aria-label="Recent platform activity" style={{ maxHeight: 360, overflowY: 'auto', padding: 0 }}>
          {!secondaryReady && (
            <div style={{ padding: 18, color: 'var(--text-muted)', fontSize: 13 }}>Secondary activity loads after the main dashboard settles.</div>
          )}
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
      )}

    </div>
  )
}
