import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'
import { clientPortalUrl } from '../../shared/utils/portalUrl'

// ── Config Sections ───────────────────────────────────────────────────────────
const CONFIG_GROUPS = [
  {
    key: 'experience',
    label: 'Branding & Experience',
    desc: 'Portal identity, visual design, and AI configuration',
    sectionIcon: '🎨',
    cards: [
      { path: 'branding',  icon: '🎨', label: 'Branding & Theme',    desc: 'Logo, colors, fonts, and portal name',              cta: 'Configure', primary: true },
      { path: 'features',  icon: '⚙️', label: 'Features',             desc: 'Enable or disable portal sections',                 cta: 'Configure' },
      { path: 'gate',      icon: '🚪', label: 'User Gate',            desc: 'User type confirmation and access control',         cta: 'Configure' },
      { path: 'chatbox',   icon: '🤖', label: 'Chatbox AI',           desc: 'AI provider and system prompt',                    cta: 'Configure' },
    ],
  },
  {
    key: 'content',
    label: 'Content & Publishing',
    desc: 'All content published and visible in the portal',
    sectionIcon: '📄',
    cards: [
      { path: 'content',   icon: '📄', label: 'Content Library',      desc: 'Therapeutic areas, drugs, events, and resources',   cta: 'Open',      primary: true },
      { path: 'news',      icon: '📰', label: 'News & Announcements',  desc: 'Publish news posts and updates',                    cta: 'Open'      },
      { path: 'safety',    icon: '⚠️', label: 'Safety Alerts',         desc: 'Drug safety communications and recalls',            cta: 'Review'    },
      { path: 'documents', icon: '📁', label: 'Document Library',      desc: 'Upload and manage clinical documents',              cta: 'Open'      },
      { path: 'msls',      icon: '👤', label: 'MSL Directory',         desc: 'Medical Science Liaisons',                         cta: 'Open'      },
    ],
  },
  {
    key: 'compliance',
    label: 'Compliance & Governance',
    desc: 'Regulatory requirements and form configuration',
    sectionIcon: '🔒',
    cards: [
      { path: 'compliance', icon: '🔒', label: 'Compliance',           desc: 'Consent, cookie policy, and regulatory settings',   cta: 'Configure', primary: true },
      { path: 'forms',      icon: '📝', label: 'Form Builder',         desc: 'Submission form fields per inquiry type',           cta: 'Configure' },
    ],
  },
  {
    key: 'operations',
    label: 'Operations & Monitoring',
    desc: 'Users, submissions, integrations, and audit',
    sectionIcon: '📡',
    cards: [
      { path: 'users',       icon: '👥', label: 'Portal Users',        desc: 'Manage registered portal users',                    cta: 'Open',      primary: true },
      { path: 'submissions', icon: '📨', label: 'Submissions',         desc: 'View and manage form submissions',                  cta: 'Open'      },
      { path: 'integration', icon: '🔗', label: 'Integration',         desc: 'MIMS or third-party system connection',             cta: 'Configure' },
      { path: 'audit',       icon: '📋', label: 'Audit Trail',         desc: 'Full admin activity log',                          cta: 'Review'    },
      { path: 'analytics',   icon: '📊', label: 'Analytics',           desc: 'Portal usage, downloads, and submission trends',    cta: 'View'      },
    ],
  },
]

// ── Health Score ──────────────────────────────────────────────────────────────
function computeHealthScore(data, submissionStats) {
  const { branding, features } = data || {}
  const enabledCount = features?.filter(f => f.is_enabled).length || 0
  let score = 0
  if (branding?.logo_url)    score += 20
  if (branding?.portal_name) score += 15
  if (enabledCount >= 3)     score += 20
  else if (enabledCount > 0) score += 10
  score += 15 // compliance always set up
  score += 10 // MSLs seeded
  if ((submissionStats?.total || 0) > 0)            score += 10
  if (branding?.primary_color && branding.primary_color !== '#2563EB') score += 10
  return Math.min(100, score)
}

function healthMeta(score) {
  if (score >= 75) return { label: 'Healthy',         color: '#15803D', bg: '#DCFCE7', ring: '#16A34A' }
  if (score >= 40) return { label: 'Needs Attention', color: '#D97706', bg: '#FEF3C7', ring: '#F59E0B' }
  return                  { label: 'Not Launched',    color: '#DC2626', bg: '#FEE2E2', ring: '#EF4444' }
}

// ── Badges ────────────────────────────────────────────────────────────────────
const BADGE_STYLES = {
  success:   { background: '#DCFCE7', color: '#16A34A' },
  warning:   { background: '#FEF3C7', color: '#B45309' },
  danger:    { background: '#FEE2E2', color: '#DC2626' },
  info:      { background: '#DBEAFE', color: '#1D4ED8' },
  attention: { background: '#FEF9C3', color: '#92400E' },
}

function getBadge(path, data, submissionStats, integrationData) {
  const { branding, features } = data || {}
  const n = features?.filter(f => f.is_enabled).length || 0
  if (path === 'branding')    return branding?.logo_url && branding?.portal_name ? { label: 'Ready',          s: 'success'   } : { label: 'Needs setup',    s: 'warning'   }
  if (path === 'features')    return n > 0  ? { label: `${n} active`,      s: 'info'      } : { label: 'Not configured', s: 'danger'    }
  if (path === 'compliance')  return           { label: 'Ready',            s: 'success'   }
  if (path === 'gate')        return           { label: 'Ready',            s: 'success'   }
  if (path === 'chatbox')     return           { label: 'Not configured',   s: 'warning'   }
  if (path === 'content')     return           { label: 'Ready',            s: 'success'   }
  if (path === 'news')        return           { label: 'No recent',        s: 'attention' }
  if (path === 'safety')      return           { label: 'No alerts',        s: 'attention' }
  if (path === 'documents')   return           { label: 'Ready',            s: 'success'   }
  if (path === 'msls')        return           { label: 'Ready',            s: 'success'   }
  if (path === 'forms')       return           { label: 'Ready',            s: 'success'   }
  if (path === 'analytics')   return           { label: 'View',             s: 'info'      }
  if (path === 'integration') {
    const integrations = integrationData?.integrations || []
    if (integrations.length === 0) return { label: 'Not configured', s: 'warning' }
    if (integrations.some(i => i.last_sync_status === 'failure'))  return { label: 'Sync failed',    s: 'danger'  }
    if (integrations.some(i => i.last_sync_status === 'success'))  return { label: 'Connected',      s: 'success' }
    return { label: 'Not tested', s: 'attention' }
  }
  if (path === 'audit')       return           { label: 'Active',           s: 'info'      }
  if (path === 'users')       return           { label: 'Active',           s: 'info'      }
  if (path === 'submissions' && submissionStats) {
    return submissionStats.total > 0
      ? { label: `${submissionStats.total} total`, s: 'info' }
      : { label: 'None yet', s: 'attention' }
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
  branding: '🎨', news: '📰', safety_alert: '⚠️', document: '📁',
  feature: '⚙️', compliance: '🔒', msl: '👤', integration: '🔗',
  portal_user: '👥', client: '🏢', chatbox: '🤖', gate: '🚪',
  submission: '📨', submissions: '📨',
}

function activityIcon(entity) { return ENTITY_ICONS[entity] || '📋' }

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
  const [data, setData]               = useState(null)
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [submissionStats, setSubmissionStats] = useState(null)
  const [readiness, setReadiness]     = useState(null)
  const [integrationData, setIntegrationData] = useState(null)
  const [recentActivity, setRecentActivity]   = useState([])
  const [urlCopied, setUrlCopied]     = useState(false)

  async function copyPortalUrl(code) {
    try {
      await navigator.clipboard.writeText(clientPortalUrl(code))
      setUrlCopied(true)
      setTimeout(() => setUrlCopied(false), 1500)
    } catch { /* clipboard blocked — link is still openable */ }
  }

  useEffect(() => {
    fetch(`/api/admin/clients/${clientId}`, { headers: adminHeaders() })
      .then(r => r.json()).then(d => setData(d))
      .catch(() => {}).finally(() => setLoading(false))
    fetch(`/api/admin/submissions/${clientId}`, { headers: adminHeaders() })
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
  const healthScore  = computeHealthScore(data, submissionStats)
  const health       = healthMeta(healthScore)
  const urgentIssues = getUrgentIssues(data, integrationData)

  const checklist     = readiness?.checks || []
  const checklistDone = readiness?.done   || 0


  function matchesSearch(card) {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return card.label.toLowerCase().includes(q) || card.desc.toLowerCase().includes(q)
  }

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
          </div>
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
          {client.contact_email && (
            <div className="ck-stat">
              <span className="ck-stat-label">Owner</span>
              <span className="ck-stat-value">{client.contact_email}</span>
            </div>
          )}
        </div>

        <div className="ck-health-block">
          <div className="ck-health-ring" style={{ color: health.color, background: health.bg, boxShadow: `0 0 0 3px ${health.ring}30, inset 0 2px 6px rgba(0,0,0,.08)` }}>
            {healthScore}
          </div>
          <div className="ck-health-label" style={{ color: health.color }}>{health.label}</div>
          <div className="ck-health-sub">Health Score</div>
        </div>

      </div>

      {/* ── SEARCH ───────────────────────────────────────────────────── */}
      <div className="cp-config-search-bar">
        <span className="cp-config-search-icon">🔍</span>
        <input
          type="text"
          className="cp-config-search-input"
          placeholder="Search configuration sections…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && <button className="cp-config-search-clear" onClick={() => setSearch('')}>✕</button>}
      </div>

      {/* ── BODY ─────────────────────────────────────────────────────── */}
      <div className="ck-body">

        {/* ── LEFT: Config Groups ─────────────────────────────────── */}
        <div className="ck-groups">
          {CONFIG_GROUPS.map(group => {
            const filtered  = group.cards.filter(matchesSearch)
            if (filtered.length === 0 && search.trim()) return null
            const primary   = filtered.find(c => c.primary)
            const secondary = filtered.filter(c => !c.primary)
            return (
              <div key={group.key} className="ck-group" data-key={group.key}>

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
                            <span className="ck-card-primary-icon">{primary.icon}</span>
                            <div>
                              <div className="ck-card-primary-label">{primary.label}</div>
                              <div className="ck-card-primary-desc">{primary.desc}</div>
                            </div>
                          </div>
                          <div className="ck-card-primary-right">
                            {badge && (
                              <span className="ck-badge" style={BADGE_STYLES[badge.s] || {}}>{badge.label}</span>
                            )}
                            <span className="ck-card-cta">{primary.cta} →</span>
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
                                <span className="ck-sub-icon">{card.icon}</span>
                                {badge && (
                                  <span className="ck-badge ck-badge-sm" style={BADGE_STYLES[badge.s] || {}}>{badge.label}</span>
                                )}
                              </div>
                              <div className="ck-sub-label">{card.label}</div>
                              <div className="ck-sub-cta">{card.cta} →</div>
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
                <span style={{ fontSize: 18, color: '#16A34A' }}>✓</span>
                <span style={{ color: '#16A34A', fontWeight: 600, fontSize: 12 }}>No issues detected</span>
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
                    <span className="ck-issue-arrow">→</span>
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
                <div style={{ fontSize: 12, color: '#9CA3AF', padding: '4px 0' }}>No activity yet.</div>
              ) : recentActivity.map((item, i) => (
                <div key={i} className="ck-activity-item">
                  <span className="ck-activity-icon">{activityIcon(item.entity)}</span>
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
              View full audit trail →
            </button>
          </div>

          {/* Setup Checklist */}
          <div className="ck-panel-block">
            <div className="ck-panel-title">
              <span>Setup Checklist</span>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                color: checklistDone === checklist.length ? '#16A34A' : '#D97706',
              }}>
                {checklistDone}/{checklist.length}
              </span>
            </div>
            <div className="ck-checklist">
              {checklist.map((item, i) => (
                <div key={i} className={`ck-check-item${item.done ? ' done' : ''}`} title={!item.done && item.hint ? item.hint : undefined}>
                  <span className="ck-check-icon">{item.done ? '✓' : '○'}</span>
                  <span className="ck-check-label">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

        </aside>
      </div>
    </AdminLayout>
  )
}
