import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import AdminLayout, { menuSections } from '../components/AdminLayout'
import AlertsPanel from '../components/AlertsPanel'
import { adminHeaders, useAdminAuth } from '../context/AdminAuthContext'
import { clientPortalUrl } from '../../shared/utils/portalUrl'
import Icon from '../../shared/components/Icon'
import QRCode from 'qrcode'
import { activityActor } from '../../shared/utils/activityActor'

// ── To do today ───────────────────────────────────────────────────────────────
// Phase 3 row 14 (CP ease-of-use plan): the sidebar is now the one map of screens,
// so the Overview no longer repeats it as cards. It lists what is waiting instead,
// from the same counts the sidebar shows, and only for screens this person's menu
// offers. A count that could not be read is named, never shown as "nothing waiting".
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
const WAITING = [
  { key: 'safety',      path: 'safety-queue',    sev: 'red',   check: 'side-effect reports',  text: n => `${plural(n, 'side-effect report', 'side-effect reports')} to review`, hint: 'Someone reported becoming unwell' },
  { key: 'failed',      path: 'sync-health',     sev: 'red',   check: 'deliveries to MIMS',   text: n => `${plural(n, 'submission', 'submissions')} did not reach MIMS`, hint: 'Send them again from Sync Health' },
  { key: 'access',      path: 'access-requests', sev: 'amber', check: 'access requests',      text: n => `${plural(n, 'doctor', 'doctors')} waiting for an account` },
  { key: 'review',      path: 'review-queue',    sev: 'amber', check: 'approvals',            text: n => `${plural(n, 'item', 'items')} waiting for approval` },
  { key: 'data',        path: 'data-requests',   sev: 'amber', check: 'personal data requests', text: n => `${plural(n, 'personal data request', 'personal data requests')} to answer` },
  { key: 'submissions', path: 'submissions',     sev: 'blue',  check: 'new submissions',      text: n => `${plural(n, 'new submission', 'new submissions')}` },
]

// ── Readiness ─────────────────────────────────────────────────────────────────
// CPPM-136: the hero shows the server's eight readiness checks (the Setup Checklist
// below), the same score as the dashboard. It used to add its own points, some given
// without checking anything.
function readinessMeta(label) {
  if (label === 'Ready')        return { label: 'Ready to launch', color: '#15803D', bg: '#DCFCE7', ring: '#16A34A' }
  if (label === 'Almost Ready') return { label: 'Almost ready',    color: '#92400E', bg: '#FEF3C7', ring: '#F59E0B' }
  return                               { label: 'Not ready',       color: '#B91C1C', bg: '#FEE2E2', ring: '#EF4444' }
}

// ── Urgent Issues ─────────────────────────────────────────────────────────────
function getUrgentIssues(data, integrationData) {
  const { branding, features } = data || {}
  const n = features?.filter(f => f.is_enabled).length || 0
  const issues = []
  if (!branding?.logo_url)    issues.push({ sev: 'red',   text: 'No logo uploaded',           path: 'branding' })
  if (!branding?.portal_name) issues.push({ sev: 'amber', text: 'Portal name not set',        path: 'branding' })
  if (n === 0)                issues.push({ sev: 'red',   text: 'No features enabled',        path: 'features' })
  if (!branding?.primary_color || branding.primary_color === '#2563EB')
                              issues.push({ sev: 'amber', text: 'Brand colors not customised', path: 'branding' })
  const integrations = integrationData?.integrations || []
  if (integrations.some(i => i.last_sync_status === 'failure'))
                              issues.push({ sev: 'red',   text: 'Integration sync failed',     path: 'integration' })
  return issues
}

const ENTITY_ICONS = {
  branding: 'palette', news: 'news', safety_alert: 'shield', document: 'folder',
  feature: 'sliders', compliance: 'lock', msl: 'user', integration: 'link',
  portal_user: 'users', client: 'building', chatbox: 'message', gate: 'gate',
  submission: 'inbox', submissions: 'inbox',
}

function activityIcon(entity) { return ENTITY_ICONS[entity] || 'list' }

function activityText(action, entity) {
  const e = entity.replace(/_/g, ' ')
  if (action === 'CREATE')  return `${e} created`
  if (action === 'UPDATE')  return `${e} updated`
  if (action === 'DELETE')  return `${e} deleted`
  if (action === 'ENABLE')  return `${e} enabled`
  if (action === 'DISABLE') return `${e} disabled`
  if (action === 'UPLOAD')  return `${e} uploaded`
  return `${action.toLowerCase()} ${e}`
}

function relativeTime(ts) {
  if (!ts) return ''
  const utc  = ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z'
  const diff = Date.now() - new Date(utc).getTime()
  const m    = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d}d ago`
  return `${Math.floor(d / 7)}w ago`
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ClientDetailPage() {
  const { clientId } = useParams()
  const navigate     = useNavigate()
  const { hasRole, canChange } = useAdminAuth()
  const [data, setData]               = useState(null)
  const [loading, setLoading]         = useState(true)
  const [submissionStats, setSubmissionStats] = useState(null)
  const [readiness, setReadiness]     = useState(null)
  const [integrationData, setIntegrationData] = useState(null)
  const [recentActivity, setRecentActivity]   = useState([])
  const [openAlerts, setOpenAlerts]           = useState([])
  const [waiting, setWaiting]                 = useState({})
  const [urlCopied, setUrlCopied]     = useState(false)
  const [qrDataUrl, setQrDataUrl]     = useState('')

  async function copyPortalUrl(code) {
    try {
      await navigator.clipboard.writeText(clientPortalUrl(code))
      setUrlCopied(true)
      setTimeout(() => setUrlCopied(false), 1500)
    } catch { /* clipboard blocked — link is still openable */ }
  }

  async function toggleQr(code) {
    if (qrDataUrl) { setQrDataUrl(''); return }
    try {
      const dataUrl = await QRCode.toDataURL(clientPortalUrl(code), { width: 160, margin: 1 })
      setQrDataUrl(dataUrl)
    } catch { /* QR generation failed — non-critical */ }
  }

  useEffect(() => {
    fetch(`/api/admin/clients/${clientId}`, { headers: adminHeaders() })
      .then(r => r.json()).then(d => setData(d))
      .catch(() => {}).finally(() => setLoading(false))
    fetch(`/api/admin/submissions/${clientId}?limit=1`, { headers: adminHeaders() })
      .then(r => r.json()).then(d => setSubmissionStats({ total: d.total, counts: d.counts || [] }))
      .catch(() => {})
    fetch(`/api/admin/clients/${clientId}/readiness`, { headers: adminHeaders() })
      .then(r => r.json()).then(d => setReadiness(d))
      .catch(() => {})
    fetch(`/api/admin/integration/${clientId}`, { headers: adminHeaders() })
      .then(r => r.json()).then(d => setIntegrationData(d))
      .catch(() => {})
    const count = (url, pick) => fetch(url, { headers: adminHeaders() })
      .then(r => r.ok ? r.json() : null).then(d => d ? pick(d) : undefined).catch(() => undefined)
    Promise.all([
      count(`/api/admin/submissions/${clientId}?limit=1&status=submitted`, d => d.matched),
      count(`/api/admin/ae-review/${clientId}/count`, d => d.count),
      count(`/api/admin/review-queue/${clientId}/count`, d => d.count),
      count(`/api/admin/users/${clientId}/access-requests/count`, d => d.count),
      count(`/api/admin/submissions/${clientId}?limit=1&status=failed_sync`, d => d.matched),
      count(`/api/admin/data-requests/${clientId}`, d => d.requests?.filter(r => r.status === 'pending').length),
    ]).then(([submissions, safety, review, access, failed, data]) => setWaiting({ submissions, safety, review, access, failed, data, done: true }))
  }, [clientId])

  // MIMS retries filled Recent Activity, each labelled "Admin" (CP screen review, 10 Oct 2026).
  // People's actions by default; the automatic ones on request.
  const [includeSystem, setIncludeSystem] = useState(false)
  useEffect(() => {
    fetch(`/api/admin/audit/${clientId}?limit=5${includeSystem ? '' : '&people=1'}`, { headers: adminHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.records) setRecentActivity(d.records) })
      .catch(() => {})
  }, [clientId, includeSystem])

  if (loading) return <AdminLayout title="Client"><div className="cp-loading">Loading…</div></AdminLayout>
  if (!data?.client) return <AdminLayout title="Client"><div className="cp-error">Client not found.</div></AdminLayout>

  const { client, branding, features } = data
  const enabledCount = features?.filter(f => f.is_enabled).length || 0
  const health       = readinessMeta(readiness?.label)
  // Bridge row 2: open alerts belong in the to-do list — it said "No issues
  // detected" while reports were failing to reach MIMS.
  const alertIssues = ['integration', 'safety'].flatMap(aud => {
    const n = openAlerts.filter(a => a.audience === aud).length
    if (!n) return []
    return [{ sev: 'red', text: `${n} ${aud} alert${n === 1 ? '' : 's'} open`, path: aud === 'safety' ? 'safety-queue' : 'sync-health' }]
  })
  const shownPaths = new Set(menuSections({ hasRole, canChange }).flatMap(sec => sec.tabs.map(t => t.path)))
  const waitingRows = WAITING.filter(w => shownPaths.has(w.path))
  const todo = [
    ...alertIssues,
    ...waitingRows.filter(w => waiting[w.key] > 0).map(w => ({ sev: w.sev, text: w.text(waiting[w.key]), hint: w.hint, path: w.path })),
    ...getUrgentIssues(data, integrationData),
  ].filter(item => shownPaths.has(item.path))
  const unread  = waitingRows.filter(w => waiting.done && waiting[w.key] === undefined).map(w => w.check)
  const checked = waitingRows.filter(w => waiting[w.key] !== undefined).map(w => w.check)

  const checklist     = readiness?.checks || []
  const checklistDone = readiness?.done   || 0

  return (
    <AdminLayout title={client.name}>

      {/* ── PREMIUM HERO ─────────────────────────────────────────────── */}
      <div className="ck-hero">

        <div className="ck-hero-identity">
          <div className="ck-hero-name-row">
            <h2 className="ck-hero-name">{client.name}</h2>
            <code className="ck-hero-code">{client.code}</code>
            <span className={`cp-badge ${client.is_active ? 'badge-active' : 'badge-inactive'}`}>
              {client.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div className="ck-hero-url-row">
            <span className="ck-hero-url-label">Portal URL</span>
            <a
              className="ck-hero-url-val"
              href={clientPortalUrl(client.code)}
              target="_blank"
              rel="noopener noreferrer"
              title="Open portal in a new tab"
            >{clientPortalUrl(client.code)}</a>
            <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => copyPortalUrl(client.code)} style={{ marginLeft: 8 }}>
              {urlCopied ? 'Copied!' : 'Copy'}
            </button>
            <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => toggleQr(client.code)} style={{ marginLeft: 6 }}>
              {qrDataUrl ? 'Hide QR' : 'QR'}
            </button>
          </div>
          {qrDataUrl && (
            <div style={{ marginTop: 10 }}>
              <img src={qrDataUrl} alt="Portal URL QR code" width={160} height={160} style={{ border: '1px solid var(--cp-border)', borderRadius: 8, background: '#fff' }} />
            </div>
          )}
        </div>

        <div className="ck-hero-stats">
          <div className="ck-stat">
            <span className="ck-stat-label">Features</span>
            <span className="ck-stat-value">{enabledCount} active</span>
          </div>
          <div className="ck-stat">
            <span className="ck-stat-label">Portal Name</span>
            <span className="ck-stat-value">{branding?.portal_name || '—'}</span>
          </div>
          <div className="ck-stat">
            <span className="ck-stat-label">Submissions</span>
            <span className="ck-stat-value">{submissionStats?.total ?? '—'}</span>
          </div>
          <div className="ck-stat">
            <span className="ck-stat-label">Last Updated</span>
            <span className="ck-stat-value">
              {client.updated_at ? new Date(client.updated_at).toLocaleDateString() : '—'}
            </span>
          </div>
        </div>

        <div className="ck-health-block">
          <div className="ck-health-ring" style={{ color: health.color, background: health.bg, boxShadow: `0 0 0 3px ${health.ring}30, inset 0 2px 6px rgba(0,0,0,.08)` }}>
            {/* The ring said "50" while the checklist said 4/8 — one measure now (CP screen review, 10 Oct 2026). */}
            {readiness ? `${checklistDone} of ${checklist.length} steps done` : '—'}
          </div>
          <div className="ck-health-label" style={{ color: health.color }}>{readiness ? `${health.label},` : ''}</div>
          <button type="button" className="cp-link-btn ck-health-sub"
            onClick={() => document.getElementById('ck-setup-checklist')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            Setup
          </button>
        </div>

      </div>

      <AlertsPanel clientId={clientId} onOpenAlerts={setOpenAlerts} />

      {/* ── BODY ─────────────────────────────────────────────────────── */}
      <div className="ck-body">

        {/* ── LEFT: To do today ───────────────────────────────────── */}
        <section className="ck-panel-block ck-todo" aria-labelledby="ck-todo-title">
          <h2 className="ck-panel-title" id="ck-todo-title">
            <span>To do today</span>
            {todo.length > 0 && <span className="ck-issue-count">{todo.length}</span>}
          </h2>
          {!waiting.done ? (
            <div className="ck-panel-empty">Checking what is waiting…</div>
          ) : todo.length === 0 ? (
            <div className="ck-panel-empty">
              <span style={{ color: '#166534', display: 'inline-flex' }}><Icon name="check" size={18} /></span>
              <span style={{ color: '#166534', fontWeight: 600 }}>Nothing is waiting for you.</span>
            </div>
          ) : (
            <ul className="ck-issues-list ck-todo-list">
              {todo.map((item, i) => (
                <li key={i}>
                  <button type="button" className={`ck-issue ck-issue-${item.sev}`}
                    onClick={() => navigate(`/admin/clients/${clientId}/${item.path}`)}>
                    <span className="ck-issue-dot" />
                    <span className="ck-issue-text">
                      {item.text}
                      {item.hint && <span className="ck-todo-hint">{item.hint}</span>}
                    </span>
                    <span className="ck-issue-arrow">Open</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {waiting.done && (
            <p className="ck-todo-checked">
              {unread.length > 0 && <span role="alert" className="ck-todo-unread">Could not check {unread.join(', ')}. Look on {unread.length === 1 ? 'that screen' : 'those screens'} directly. </span>}
              {checked.length > 0 && `Checked ${checked.join(', ')}. `}Every screen is in the menu on the left.
            </p>
          )}
        </section>

        {/* ── RIGHT: Decision Panel ───────────────────────────────── */}
        <aside className="ck-panel">

          {/* Recent Activity */}
          <div className="ck-panel-block">
            <div className="ck-panel-title">
              <span>Recent Activity</span>
              <label style={{ fontSize: 11, fontWeight: 400, textTransform: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input type="checkbox" checked={includeSystem} onChange={e => setIncludeSystem(e.target.checked)} />
                Include automatic actions
              </label>
            </div>
            <div className="ck-activity-list">
              {recentActivity.length === 0 ? (
                <div style={{ fontSize: 12, color: '#5F6B7A', padding: '4px 0' }}>No activity yet.</div>
              ) : recentActivity.map((item, i) => (
                <div key={i} className="ck-activity-item">
                  <span className="ck-activity-icon"><Icon name={activityIcon(item.entity)} size={14} /></span>
                  <div className="ck-activity-body">
                    <div className="ck-activity-text">{activityText(item.action, item.entity)}</div>
                    <div className="ck-activity-meta">{activityActor(item)} · {relativeTime(item.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
            <button
              className="cp-link-btn"
              style={{ fontSize: 12, marginTop: 12 }}
              onClick={() => navigate(`/admin/clients/${clientId}/audit`)}
            >
              View full audit trail
            </button>
          </div>

          {/* Setup Checklist */}
          <div className="ck-panel-block" id="ck-setup-checklist">
            <div className="ck-panel-title">
              <span>Setup Checklist</span>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                color: checklistDone === checklist.length ? '#166534' : '#92400E',
              }}>
                {checklistDone}/{checklist.length}
              </span>
            </div>
            <div className="ck-checklist">
              {checklist.map((item, i) => (
                <div key={i} className={`ck-check-item${item.done ? ' done' : ''}`} title={!item.done && item.hint ? item.hint : undefined}>
                  <span className="ck-check-icon">{item.done ? 'Done' : 'To do'}</span>
                  <span className="ck-check-label">{item.label}</span>
                  {!item.done && item.path && (
                    <button
                      className="cp-link-btn"
                      style={{ marginLeft: 'auto', fontSize: 11, whiteSpace: 'nowrap' }}
                      onClick={() => navigate(`/admin/clients/${clientId}/${item.path}`)}
                      title={item.hint}
                    >Fix</button>
                  )}
                </div>
              ))}
            </div>
          </div>

        </aside>
      </div>
    </AdminLayout>
  )
}
