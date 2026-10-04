import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import AdminLayout, { menuSections } from '../components/AdminLayout'
import AlertsPanel from '../components/AlertsPanel'
import { adminHeaders, useAdminAuth } from '../context/AdminAuthContext'
import { clientPortalUrl } from '../../shared/utils/portalUrl'
import Icon from '../../shared/components/Icon'
import QRCode from 'qrcode'

// ── Cards ─────────────────────────────────────────────────────────────────────
// CPPM-135: the cards follow the menu's main screens and tabs (menuSections), so
// the Overview and the sidebar never disagree. This only adds a line of help and an
// icon to each screen.
const CARD_INFO = {
  submissions:     { icon: 'inbox',   desc: 'Questions and reports sent from the portal' },
  'safety-queue':  { icon: 'shield',  desc: 'Someone reported becoming unwell' },
  'review-queue':  { icon: 'search',  desc: 'News and documents waiting for approval' },
  'access-requests': { icon: 'users', desc: 'Doctors asking for an account' },
  feedback:        { icon: 'message', desc: 'Ratings and comments from visitors' },
  'chat-records':  { icon: 'message', desc: 'Chat box conversations' },
  'data-requests': { icon: 'shield',  desc: 'Requests to export or delete personal data' },
  content:         { icon: 'file',    desc: 'Therapeutic areas, drugs, events, and resources' },
  news:            { icon: 'news',    desc: 'Publish news posts and updates' },
  documents:       { icon: 'folder',  desc: 'Upload and manage clinical documents' },
  safety:          { icon: 'shield',  desc: 'Drug safety communications and recalls' },
  trials:          { icon: 'beaker',  desc: 'Studies shown on the portal' },
  training:        { icon: 'book',    desc: 'Modules, attempts, and certificates' },
  msls:            { icon: 'users',   desc: 'Medical Science Liaisons' },
  faq:             { icon: 'help',    desc: 'Questions and answers on the portal' },
  branding:        { icon: 'palette', desc: 'Logo, colors, fonts, and portal name' },
  features:        { icon: 'sliders', desc: 'Turn portal pages on and off' },
  gate:            { icon: 'gate',    desc: 'User type confirmation and access control' },
  forms:           { icon: 'form',    desc: 'Submission form fields per inquiry type' },
  'email-settings': { icon: 'mail',   desc: 'Mail server, sender, and the email outbox' },
  chatbox:         { icon: 'message', desc: 'AI provider and system prompt' },
  users:           { icon: 'users',   desc: 'Doctors and other registered portal users' },
  'admin-users':   { icon: 'key',     desc: 'Staff accounts and roles' },
  integration:     { icon: 'link',    desc: 'MIMS or third-party system connection' },
  'sync-health':   { icon: 'chart',   desc: 'Deliveries to MIMS, failures, and retries' },
  sso:             { icon: 'lock',    desc: 'OIDC login with Microsoft or Google' },
  analytics:       { icon: 'chart',   desc: 'Portal usage, downloads, and submission trends' },
  audit:           { icon: 'list',    desc: 'Full admin activity log' },
  'safety-confirmations': { icon: 'shield', desc: 'Who has confirmed each high and critical letter' },
  compliance:      { icon: 'lock',    desc: 'Consent, cookie policy, and regulatory settings' },
}
const SECTION_DESC = {
  inbox:       'Everything waiting for someone to act',
  content:     'Everything published on the portal',
  setup:       'How the portal looks and behaves',
  people:      'Portal users and staff accounts',
  connections: 'MIMS, deliveries, and single sign-on',
  reports:     'Usage, audit, safety confirmations, and compliance',
}

// ── Readiness ─────────────────────────────────────────────────────────────────
// CPPM-136: the hero shows the server's eight readiness checks (the Setup Checklist
// below), the same score as the dashboard. It used to add its own points, some given
// without checking anything.
function readinessMeta(label) {
  if (label === 'Ready')        return { label: 'Ready to launch', color: '#15803D', bg: '#DCFCE7', ring: '#16A34A' }
  if (label === 'Almost Ready') return { label: 'Almost ready',    color: '#92400E', bg: '#FEF3C7', ring: '#F59E0B' }
  return                               { label: 'Not ready',       color: '#B91C1C', bg: '#FEE2E2', ring: '#EF4444' }
}

// ── Badges ────────────────────────────────────────────────────────────────────
const BADGE_STYLES = {
  success:   { background: '#DCFCE7', color: '#166534' },
  warning:   { background: '#FEF3C7', color: '#B45309' },
  danger:    { background: '#FEE2E2', color: '#B91C1C' },
  info:      { background: '#DBEAFE', color: '#1D4ED8' },
  attention: { background: '#FEF9C3', color: '#92400E' },
}

// CPPM-136: a badge only where it comes from real data. Fixed labels such as "No
// active alerts" (shown while alerts were active) and "Ready to use" were removed.
function getBadge(path, data, submissionStats, integrationData) {
  const { branding, features } = data || {}
  const n = features?.filter(f => f.is_enabled).length || 0
  if (path === 'branding')    return branding?.logo_url && branding?.portal_name ? { label: 'Ready to use',    s: 'success'   } : { label: 'Needs setup',    s: 'warning'   }
  if (path === 'features')    return n > 0  ? { label: `${n} active`,      s: 'info'      } : { label: 'Not configured', s: 'danger'    }
  if (path === 'integration') {
    const integrations = integrationData?.integrations || []
    if (integrations.length === 0) return { label: 'Not configured', s: 'warning' }
    if (integrations.some(i => i.last_sync_status === 'failure'))  return { label: 'Sync failed',    s: 'danger'  }
    if (integrations.some(i => i.last_sync_status === 'success'))  return { label: 'Connected',      s: 'success' }
    return { label: 'Not tested', s: 'attention' }
  }
  if (path === 'submissions' && submissionStats) {
    return submissionStats.total > 0
      ? { label: `${submissionStats.total} total`, s: 'info' }
      : { label: 'No queue yet', s: 'attention' }
  }
  return null
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
    fetch(`/api/admin/audit/${clientId}?limit=5`, { headers: adminHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.records) setRecentActivity(d.records) })
      .catch(() => {})
  }, [clientId])

  if (loading) return <AdminLayout title="Client"><div className="cp-loading">Loading…</div></AdminLayout>
  if (!data?.client) return <AdminLayout title="Client"><div className="cp-error">Client not found.</div></AdminLayout>

  const { client, branding, features } = data
  const enabledCount = features?.filter(f => f.is_enabled).length || 0
  const health       = readinessMeta(readiness?.label)
  // Bridge row 2: open alerts belong in "Attention Required" — it said "No issues
  // detected" while reports were failing to reach MIMS.
  const alertIssues = ['integration', 'safety'].flatMap(aud => {
    const n = openAlerts.filter(a => a.audience === aud).length
    if (!n) return []
    return [{ sev: 'red', text: `${n} ${aud} alert${n === 1 ? '' : 's'} open`, path: aud === 'safety' ? 'safety-queue' : 'sync-health' }]
  })
  const urgentIssues = [...alertIssues, ...getUrgentIssues(data, integrationData)]

  const checklist     = readiness?.checks || []
  const checklistDone = readiness?.done   || 0


  // CPPM-135: one group per main screen of this person's menu (Overview itself aside);
  // the first tab is the wide card. "Go to…" in the top bar replaces the old search.
  const groups = menuSections({ hasRole, canChange }).filter(sec => sec.key !== 'overview').map(sec => ({
    key: sec.key, label: sec.label, desc: SECTION_DESC[sec.key], sectionIcon: sec.icon,
    cards: sec.tabs.map((t, i) => ({ path: t.path, label: t.label, ...CARD_INFO[t.path], cta: 'Open', primary: i === 0 })),
  }))

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
            {readiness ? readiness.score : '—'}
          </div>
          <div className="ck-health-label" style={{ color: health.color }}>{readiness ? health.label : ''}</div>
          <div className="ck-health-sub">Readiness</div>
        </div>

      </div>

      <AlertsPanel clientId={clientId} onOpenAlerts={setOpenAlerts} />

      {/* ── BODY ─────────────────────────────────────────────────────── */}
      <div className="ck-body">

        {/* ── LEFT: Config Groups ─────────────────────────────────── */}
        <div className="ck-groups">
          {groups.map(group => {
            const primary   = group.cards.find(c => c.primary)
            const secondary = group.cards.filter(c => !c.primary)
            return (
              <div key={group.key} className="ck-group" data-key={group.key}>
                <div className="ck-group-hdr">
                  <span className="ck-group-hdr-icon"><Icon name={group.sectionIcon} size={17} /></span>
                  <span className="ck-group-hdr-text">
                    <span className="ck-group-hdr-label">{group.label}</span>
                    <span className="ck-group-hdr-desc">{group.desc}</span>
                  </span>
                </div>

                <div className="ck-group-body">

                    {/* Primary card — full-width, landscape */}
                    {primary && (() => {
                      const badge = getBadge(primary.path, data, submissionStats, integrationData)
                      return (
                        <div
                          className="ck-card-primary"
                          onClick={() => navigate(`/admin/clients/${clientId}/${primary.path}`)}
                        >
                          <div className="ck-card-primary-left">
                            <span className="ck-card-primary-icon"><Icon name={primary.icon} size={22} /></span>
                            <div>
                              <div className="ck-card-primary-label">{primary.label}</div>
                              <div className="ck-card-primary-desc">{primary.desc}</div>
                            </div>
                          </div>
                          <div className="ck-card-primary-right">
                            {badge && (
                              <span className="ck-badge" style={BADGE_STYLES[badge.s] || {}}>{badge.label}</span>
                            )}
                            <span className="ck-card-cta">{primary.cta}</span>
                          </div>
                        </div>
                      )
                    })()}

                    {/* Secondary cards — compact grid */}
                    {secondary.length > 0 && (
                      <div className="ck-sub-grid">
                        {secondary.map(card => {
                          const badge = getBadge(card.path, data, submissionStats, integrationData)
                          return (
                            <div
                              key={card.path}
                              className="ck-card-sub"
                              onClick={() => navigate(`/admin/clients/${clientId}/${card.path}`)}
                            >
                              <div className="ck-sub-top">
                                <span className="ck-sub-icon"><Icon name={card.icon} size={17} /></span>
                                {badge && (
                                  <span className="ck-badge ck-badge-sm" style={BADGE_STYLES[badge.s] || {}}>{badge.label}</span>
                                )}
                              </div>
                              <div className="ck-sub-label">{card.label}</div>
                              <div className="ck-sub-cta">{card.cta}</div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                  </div>

              </div>
            )
          })}
        </div>

        {/* ── RIGHT: Decision Panel ───────────────────────────────── */}
        <aside className="ck-panel">

          {/* Urgent Issues */}
          <div className="ck-panel-block ck-panel-block--urgent">
            <div className="ck-panel-title">
              <span>Attention Required</span>
              {urgentIssues.length > 0 && (
                <span className="ck-issue-count">{urgentIssues.length}</span>
              )}
            </div>
            {urgentIssues.length === 0 ? (
              <div className="ck-panel-empty">
                <span style={{ color: '#166534', display: 'inline-flex' }}><Icon name="check" size={18} /></span>
                <span style={{ color: '#166534', fontWeight: 600, fontSize: 12 }}>No issues detected</span>
              </div>
            ) : (
              <div className="ck-issues-list">
                {urgentIssues.map((issue, i) => (
                  <div
                    key={i}
                    className={`ck-issue ck-issue-${issue.sev}`}
                    onClick={() => navigate(`/admin/clients/${clientId}/${issue.path}`)}
                  >
                    <span className="ck-issue-dot" />
                    <span className="ck-issue-text">{issue.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="ck-panel-block">
            <div className="ck-panel-title"><span>Recent Activity</span></div>
            <div className="ck-activity-list">
              {recentActivity.length === 0 ? (
                <div style={{ fontSize: 12, color: '#5F6B7A', padding: '4px 0' }}>No activity yet.</div>
              ) : recentActivity.map((item, i) => (
                <div key={i} className="ck-activity-item">
                  <span className="ck-activity-icon"><Icon name={activityIcon(item.entity)} size={14} /></span>
                  <div className="ck-activity-body">
                    <div className="ck-activity-text">{activityText(item.action, item.entity)}</div>
                    <div className="ck-activity-meta">{item.admin_email || 'Admin'} · {relativeTime(item.created_at)}</div>
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
          <div className="ck-panel-block">
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
