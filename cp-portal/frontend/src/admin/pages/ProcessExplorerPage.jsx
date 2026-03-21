/**
 * ProcessExplorerPage.jsx
 * Personal learning module — shows every API action captured from admin + portal,
 * with animated sequence diagrams for each one.
 *
 * Two tabs:
 *   Live Feed   — real captured API calls from cp_process_logs, newest first
 *   Flow Library — browse all 25+ pre-defined flow diagrams
 */

import { useState, useEffect, useCallback } from 'react'
import AdminLayout from '../components/AdminLayout'
import FlowDiagram from '../components/FlowDiagram'
import { adminHeaders } from '../context/AdminAuthContext'
import { FLOW_TEMPLATES, matchTemplate, generateFlow } from '../utils/flowTemplates'

// ── IST timestamp helper ──────────────────────────────────────────────────────
function toIST(ts) {
  if (!ts) return ''
  // SQLite datetime('now') stores UTC without a Z — append Z so JS parses it as UTC
  const utc = ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z'
  return new Date(utc).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true }) + ' IST'
}

// ── Method badge colours ───────────────────────────────────────────────────────
const METHOD_STYLES = {
  GET:    { bg: '#DCFCE7', fg: '#15803D' },
  POST:   { bg: '#DBEAFE', fg: '#1D4ED8' },
  PUT:    { bg: '#FEF9C3', fg: '#854D0E' },
  PATCH:  { bg: '#FEF9C3', fg: '#854D0E' },
  DELETE: { bg: '#FEE2E2', fg: '#DC2626' },
}

function MethodBadge({ method }) {
  const s = METHOD_STYLES[method] || { bg: '#F1F5F9', fg: '#475569' }
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 5px', borderRadius: 3,
      background: s.bg, color: s.fg, letterSpacing: '0.03em', flexShrink: 0 }}>
      {method}
    </span>
  )
}

function StatusBadge({ code }) {
  if (!code) return null
  const ok = code < 400
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 5px', borderRadius: 3,
      background: ok ? '#DCFCE7' : '#FEE2E2', color: ok ? '#15803D' : '#DC2626', flexShrink: 0 }}>
      {code}
    </span>
  )
}

// ── Flow library card ─────────────────────────────────────────────────────────
function FlowCard({ flow, isSelected, onClick }) {
  return (
    <div onClick={onClick} style={{
      padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
      border: `1.5px solid ${isSelected ? '#6B3FA0' : '#E2E8F0'}`,
      background: isSelected ? '#F9F5FF' : '#fff',
      transition: 'all 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
          background: flow.source === 'portal' ? '#DBEAFE' : '#F3E8FF',
          color:      flow.source === 'portal' ? '#1D4ED8' : '#6B3FA0' }}>
          {flow.source === 'portal' ? 'PORTAL' : 'ADMIN'}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#1E293B' }}>{flow.title}</span>
      </div>
      <p style={{ margin: 0, fontSize: 11, color: '#64748B', lineHeight: 1.4 }}>
        {flow.description.slice(0, 80)}{flow.description.length > 80 ? '…' : ''}
      </p>
      <div style={{ marginTop: 5, fontSize: 10, color: '#94A3B8' }}>
        {flow.swimlanes.join(' → ')} · {flow.steps.length} steps
      </div>
    </div>
  )
}

// ── Live log entry row ─────────────────────────────────────────────────────────
function LogRow({ log, isSelected, onClick }) {
  const templateKey = matchTemplate(log.method, log.path)
  const template    = FLOW_TEMPLATES[templateKey]
  const isPortal    = log.source === 'portal'
  const isError     = log.status_code >= 400

  return (
    <div onClick={onClick} style={{
      padding: '8px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 3,
      border: `1.5px solid ${isSelected ? '#6B3FA0' : '#E2E8F0'}`,
      background: isSelected ? '#F9F5FF' : isError ? '#FFF5F5' : '#fff',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
          background: isPortal ? '#DBEAFE' : '#F3E8FF',
          color:      isPortal ? '#1D4ED8' : '#6B3FA0', flexShrink: 0 }}>
          {isPortal ? 'PORTAL' : 'ADMIN'}
        </span>
        <MethodBadge method={log.method} />
        <span style={{ fontSize: 11, color: '#334155', fontFamily: 'monospace',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
          {log.path}
        </span>
        <StatusBadge code={log.status_code} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
        <span style={{ fontSize: 10, color: '#94A3B8' }}>
          {toIST(log.created_at)}
        </span>
        {log.duration_ms != null && (
          <span style={{ fontSize: 10, color: '#94A3B8' }}>{log.duration_ms}ms</span>
        )}
        {template && (
          <span style={{ fontSize: 10, color: '#6B3FA0', fontWeight: 600 }}>→ {template.title}</span>
        )}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function ProcessExplorerPage() {
  const [tab,          setTab]          = useState('live')       // 'live' | 'library'
  const [logs,         setLogs]         = useState([])
  const [totalLogs,    setTotalLogs]    = useState(0)
  const [loadingLogs,  setLoadingLogs]  = useState(false)
  const [filterSource, setFilterSource] = useState('all')
  const [filterMethod, setFilterMethod] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterRange,  setFilterRange]  = useState('all')  // 'today' | 'week' | 'all'
  const [search,       setSearch]       = useState('')
  const [selectedLog,  setSelectedLog]  = useState(null)
  const [selectedFlow, setSelectedFlow] = useState(null)
  const [libSearch,    setLibSearch]    = useState('')
  const [autoRefresh,  setAutoRefresh]  = useState(false)
  const [clearing,     setClearing]     = useState(false)
  const [retention,    setRetention]    = useState(30)    // days to keep
  const [showHandoff,  setShowHandoff]  = useState(false)
  const [leftOpen,     setLeftOpen]     = useState(true)

  // Active diagram + log entry shown on the right.
  // Error responses get a dedicated error flow template.
  // For success responses: use specific template if one exists, otherwise auto-generate.
  const activeFlow = (() => {
    if (tab === 'library') return selectedFlow
    if (!selectedLog) return null
    const code = selectedLog.status_code
    // Route to a specific error template for known error codes
    if (code === 401) return FLOW_TEMPLATES['error_401_unauthorized']
    if (code === 403) return FLOW_TEMPLATES['error_403_forbidden']
    if (code === 404) return FLOW_TEMPLATES['error_404_not_found']
    if (code === 422) return FLOW_TEMPLATES['error_422_validation']
    if (code >= 500)  return FLOW_TEMPLATES['error_500_server']
    const key      = matchTemplate(selectedLog.method, selectedLog.path)
    const specific = FLOW_TEMPLATES[key]
    if (specific && key !== 'generic_admin' && key !== 'generic_portal') return specific
    return generateFlow(selectedLog.method, selectedLog.path)
  })()
  const activeLogEntry = tab === 'live' ? selectedLog : null

  // ── Fetch logs ──────────────────────────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true)
    try {
      const params = new URLSearchParams({ limit: 200 })
      if (filterSource !== 'all') params.set('source', filterSource)
      if (filterMethod !== 'all') params.set('method', filterMethod)
      if (filterStatus !== 'all') params.set('status', filterStatus)
      if (filterRange  !== 'all') params.set('range',  filterRange)
      if (search.trim())          params.set('search', search.trim())
      const res  = await fetch(`/api/admin/process-logs?${params}`, { headers: adminHeaders() })
      const data = await res.json()
      setLogs(data.logs || [])
      setTotalLogs(data.total || 0)
    } catch { /* ignore */ }
    setLoadingLogs(false)
  }, [filterSource, filterMethod, filterStatus, filterRange, search])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  // Auto-refresh every 5s when enabled
  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(fetchLogs, 5000)
    return () => clearInterval(id)
  }, [autoRefresh, fetchLogs])

  async function clearLogs() {
    if (!window.confirm('Clear all captured logs?')) return
    setClearing(true)
    await fetch('/api/admin/process-logs', { method: 'DELETE', headers: adminHeaders() })
    setLogs([]); setTotalLogs(0); setSelectedLog(null)
    setClearing(false)
  }

  async function purgeOldLogs() {
    if (!window.confirm(`Delete logs older than ${retention} days?`)) return
    await fetch(`/api/admin/process-logs/purge?days=${retention}`, { method: 'DELETE', headers: adminHeaders() })
    fetchLogs()
  }

  // Filtered flow library
  const libraryEntries = Object.entries(FLOW_TEMPLATES).filter(([, f]) => {
    if (!libSearch.trim()) return true
    const q = libSearch.toLowerCase()
    return f.title.toLowerCase().includes(q) || f.description.toLowerCase().includes(q) || f.source.includes(q)
  })

  const adminFlows  = libraryEntries.filter(([, f]) => f.source === 'admin')
  const portalFlows = libraryEntries.filter(([, f]) => f.source === 'portal')

  return (
    <AdminLayout>
      <div style={{ display: 'flex', height: 'calc(100vh - 110px)', gap: 0, overflow: 'hidden' }}>

        {/* ── LEFT PANEL ── */}
        {leftOpen && (
          <div style={{ width: 285, flexShrink: 0, display: 'flex', flexDirection: 'column',
            borderRight: '1px solid #E2E8F0', background: '#FAFAFA' }}>

          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid #E2E8F0' }}>
            {['live', 'library'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer', fontSize: 12,
                fontWeight: tab === t ? 700 : 400,
                borderBottom: tab === t ? '2px solid #6B3FA0' : '2px solid transparent',
                background: 'transparent', color: tab === t ? '#6B3FA0' : '#64748B',
              }}>
                {t === 'live' ? `🔴 Live Feed` : '📚 Flow Library'}
              </button>
            ))}
          </div>

          {/* ── Live Feed panel ── */}
          {tab === 'live' && (
            <>
              <div style={{ padding: '8px 10px', borderBottom: '1px solid #E2E8F0' }}>
                <input
                  placeholder="Search path…"
                  value={search} onChange={e => setSearch(e.target.value)}
                  style={{ width: '100%', padding: '5px 8px', borderRadius: 6,
                    border: '1px solid #E2E8F0', fontSize: 12, boxSizing: 'border-box', marginBottom: 6 }}
                />
                <div style={{ display: 'flex', gap: 4 }}>
                  <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
                    style={selStyle}>
                    <option value="all">All sources</option>
                    <option value="admin">Admin</option>
                    <option value="portal">Portal</option>
                  </select>
                  <select value={filterMethod} onChange={e => setFilterMethod(e.target.value)}
                    style={selStyle}>
                    <option value="all">All methods</option>
                    {['GET','POST','PUT','DELETE','PATCH'].map(m =>
                      <option key={m} value={m}>{m}</option>
                    )}
                  </select>
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                    style={selStyle}>
                    <option value="all">All status</option>
                    <option value="success">Success</option>
                    <option value="error">Error</option>
                  </select>
                  <select value={filterRange} onChange={e => setFilterRange(e.target.value)}
                    style={selStyle}>
                    <option value="all">All time</option>
                    <option value="today">Today</option>
                    <option value="week">This week</option>
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: '#94A3B8' }}>
                    {loadingLogs ? 'Loading…' : `${totalLogs} captured`}
                  </span>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <label style={{ fontSize: 11, color: '#64748B', display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                      <input type="checkbox" checked={autoRefresh}
                        onChange={e => setAutoRefresh(e.target.checked)} style={{ width: 12, height: 12 }} />
                      Auto
                    </label>
                    <button onClick={fetchLogs} style={miniBtn('#EFF6FF', '#1D4ED8')}>↻ Refresh</button>
                    <button onClick={clearLogs} disabled={clearing} style={miniBtn('#FEE2E2', '#DC2626')}>
                      🗑 Clear
                    </button>
                  </div>
                </div>
                {/* Retention row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 5,
                  paddingTop: 5, borderTop: '1px solid #F1F5F9' }}>
                  <span style={{ fontSize: 10, color: '#94A3B8' }}>Keep:</span>
                  <select value={retention} onChange={e => setRetention(Number(e.target.value))}
                    style={{ ...selStyle, flex: 'none', width: 90 }}>
                    <option value={7}>7 days</option>
                    <option value={14}>14 days</option>
                    <option value={30}>30 days</option>
                    <option value={60}>60 days</option>
                    <option value={90}>90 days</option>
                  </select>
                  <button onClick={purgeOldLogs} style={miniBtn('#FEF3C7', '#92400E')}>
                    🧹 Purge old
                  </button>
                </div>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
                {logs.length === 0 && !loadingLogs && (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94A3B8' }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📡</div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>No logs yet</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                      Any action you take in the admin console or portal will appear here.
                    </div>
                  </div>
                )}
                {logs.map(log => (
                  <LogRow key={log.id} log={log}
                    isSelected={selectedLog?.id === log.id}
                    onClick={() => { setSelectedLog(log); setTab('live') }}
                  />
                ))}
              </div>
            </>
          )}

          {/* ── Flow Library panel ── */}
          {tab === 'library' && (
            <>
              <div style={{ padding: '8px 10px', borderBottom: '1px solid #E2E8F0' }}>
                <input
                  placeholder="Search flows…"
                  value={libSearch} onChange={e => setLibSearch(e.target.value)}
                  style={{ width: '100%', padding: '5px 8px', borderRadius: 6,
                    border: '1px solid #E2E8F0', fontSize: 12, boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: '#94A3B8' }}>
                    {libraryEntries.length} flows · {adminFlows.length} admin · {portalFlows.length} portal
                  </span>
                  <button onClick={() => setShowHandoff(true)} style={{
                    background: '#F3E8FF', color: '#6B3FA0', border: 'none', borderRadius: 4,
                    padding: '3px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                  }}>
                    📋 Handoff Doc
                  </button>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
                {adminFlows.length > 0 && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em',
                    textTransform: 'uppercase', padding: '4px 2px 6px' }}>Admin Flows</div>
                )}
                {adminFlows.map(([key, flow]) => (
                  <FlowCard key={key} flowKey={key} flow={flow}
                    isSelected={selectedFlow === flow}
                    onClick={() => setSelectedFlow(flow)}
                  />
                ))}
                {portalFlows.length > 0 && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em',
                    textTransform: 'uppercase', padding: '8px 2px 6px' }}>Portal Flows</div>
                )}
                {portalFlows.map(([key, flow]) => (
                  <FlowCard key={key} flowKey={key} flow={flow}
                    isSelected={selectedFlow === flow}
                    onClick={() => setSelectedFlow(flow)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
        )}

        {/* ── RIGHT PANEL — Diagram ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
            borderBottom: '1px solid #E2E8F0', background: '#fff', flexShrink: 0 }}>
            <button onClick={() => setLeftOpen(o => !o)} style={{
              background: '#F1F5F9', border: '1px solid #E2E8F0', color: '#334155',
              borderRadius: 6, padding: '4px 8px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>
              {leftOpen ? '⟨⟨ Hide Panel' : '⟩⟩ Show Panel'}
            </button>
          </div>
          {activeFlow ? (
            <FlowDiagram
              flow={activeFlow}
              logEntry={activeLogEntry}
              onClose={tab === 'live' ? () => setSelectedLog(null) : () => setSelectedFlow(null)}
            />
          ) : (
            <EmptyState tab={tab} />
          )}
        </div>
      </div>
      {showHandoff && <HandoffModal onClose={() => setShowHandoff(false)} />}
    </AdminLayout>
  )
}

function EmptyState({ tab }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', color: '#94A3B8', padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>
        {tab === 'live' ? '📡' : '📐'}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#64748B', marginBottom: 8 }}>
        {tab === 'live' ? 'Select a log entry' : 'Select a flow'}
      </div>
      <div style={{ fontSize: 13, maxWidth: 340 }}>
        {tab === 'live'
          ? 'Click any captured API call on the left to see its animated sequence diagram — every layer explained step by step.'
          : 'Browse the flow library on the left. Click any workflow to see its full animated sequence diagram with detailed explanations.'}
      </div>
      {tab === 'live' && (
        <div style={{ marginTop: 20, padding: '10px 16px', borderRadius: 8, background: '#F8FAFC',
          border: '1px solid #E2E8F0', fontSize: 12, color: '#64748B', textAlign: 'left', maxWidth: 360 }}>
          <strong>How it works:</strong> Every action you take in the admin console or portal is
          automatically captured in the Live Feed. Navigate to any page, click any button, and a
          new log entry will appear here — click it to see the exact flow behind that action.
        </div>
      )}
    </div>
  )
}

const selStyle = {
  flex: 1, padding: '4px 6px', borderRadius: 5, border: '1px solid #E2E8F0',
  fontSize: 11, background: '#fff',
}

function miniBtn(bg, fg) {
  return { background: bg, color: fg, border: 'none', borderRadius: 4, padding: '3px 8px',
    fontSize: 10, fontWeight: 600, cursor: 'pointer' }
}

// ── Handoff document text ──────────────────────────────────────────────────────
const HANDOFF_TEXT = `# Process Explorer — Flow Template Enrichment Handoff
Generated: March 2026 | For: Rajeev / Narasimha / Vanaja

## STATUS: 3 of 47 flows fully enriched
✅ admin_login          — 7 steps, all 12 fields complete
✅ admin_create_news    — 9 steps, all 12 fields complete
✅ error_401_unauthorized — 6 steps, all 12 fields complete

❌ 44 flows remaining — need enrichment (see list below)

─────────────────────────────────────────────────────────
## WHAT NEEDS TO BE ADDED (12 fields per step)

In /frontend/src/admin/utils/flowTemplates.js, each step object inside
a flow's steps[] array should have these fields added:

  concept        — emoji + category shown on diagram arrow
                   REQUIRED FOR ALL STEPS. Pick from:
                   '🖥 UI Action'       (user clicks / page renders)
                   '🔐 Authentication'  (login, token, cookie)
                   '🔄 Middleware'      (rate limit, CORS, session check)
                   '💾 DB Read'         (SELECT query)
                   '💾 DB Write'        (INSERT / UPDATE / DELETE)
                   '📧 Email'           (SMTP / notification)
                   '🌐 External API'    (Gmail, MIMS, third-party)
                   '⚡ Processing'      (business logic, validation)

  apiRoute       — HTTP method + path  e.g. 'POST /api/admin/news'
  requestBody    — what the frontend sends  e.g. '{ title, content, status }'
  responseBody   — what the backend returns e.g. '{ id, title, created_at }'
  statusMeaning  — what 200/201/401/etc means in plain English
  dbQuery        — SQL run e.g. 'INSERT INTO cp_news_posts ...'
  whyItExists    — one sentence: why this step is needed at all
  whatCouldGoWrong — most likely failure e.g. 'Token expired → 401'
  securityNote   — security mechanism at this step
  beforeAfter    — state before vs after  e.g. 'Draft → Published'
  beginnerTip    — simple analogy / plain English explanation
  commonMistake  — dev mistake often made here

─────────────────────────────────────────────────────────
## WHERE TO PUT IT (code example)

BEFORE (unenriched step):
  {
    from: 'Frontend', to: 'Backend',
    label: 'POST /api/admin/news',
    note: 'Sends title, body, status'
  }

AFTER (fully enriched step):
  {
    from: 'Frontend', to: 'Backend',
    label: 'POST /api/admin/news',
    note: 'Sends title, body, status',
    concept: '⚡ Processing',
    apiRoute: 'POST /api/admin/news',
    requestBody: '{ title, content, client_id, status }',
    responseBody: '{ id, title, created_at }',
    statusMeaning: '201 Created — the news post was saved successfully',
    dbQuery: 'INSERT INTO cp_news_posts (client_id, title, content, status) VALUES (?, ?, ?, ?)',
    whyItExists: 'Persists the new post to the database so it can be retrieved later.',
    whatCouldGoWrong: 'Missing required field → 422 Validation Error',
    securityNote: 'Admin JWT is verified before any write is allowed',
    beforeAfter: 'No post existed → Post saved as draft/published in DB',
    beginnerTip: 'Like filling in a form and clicking Submit — your data travels from the browser to the server.',
    commonMistake: 'Forgetting to set client_id causes the post to be invisible on the portal'
  }

─────────────────────────────────────────────────────────
## PRIORITY ORDER

Priority 1 — concept tags (MANDATORY — shows on diagram arrows)
Priority 2 — whyItExists + beginnerTip (most educational)
Priority 3 — apiRoute + requestBody + responseBody (technical layer)
Priority 4 — whatCouldGoWrong + securityNote + dbQuery (deep learning)
Priority 5 — beforeAfter + statusMeaning + commonMistake (finishing)

─────────────────────────────────────────────────────────
## 44 REMAINING FLOWS (with step counts)

ADMIN FLOWS (17 remaining):
  admin_update_news           — ~3 steps
  admin_delete_news           — ~3 steps
  admin_bulk_action_news      — ~4 steps
  admin_upload_document       — ~5 steps
  admin_update_document       — ~3 steps
  admin_create_portal_user    — ~5 steps
  admin_delete_portal_user    — ~3 steps
  admin_trigger_reconsent     — ~4 steps
  admin_update_branding       — ~4 steps
  admin_toggle_feature        — ~3 steps
  admin_create_client         — ~4 steps
  admin_add_msl               — ~4 steps
  admin_update_booking        — ~4 steps
  admin_create_safety_alert   — ~4 steps
  admin_create_faq            — ~3 steps
  admin_view_audit_trail      — ~3 steps
  admin_send_expiry_alerts    — ~5 steps

PORTAL FLOWS (18 remaining):
  portal_login                — ~6 steps
  portal_register             — ~7 steps
  portal_email_verify         — ~5 steps
  portal_logout               — ~3 steps
  portal_fetch_documents      — ~4 steps
  portal_fetch_news           — ~3 steps
  portal_fetch_news_detail    — ~3 steps
  portal_submit_inquiry       — ~5 steps
  portal_request_msl          — ~4 steps
  portal_feedback             — ~4 steps
  portal_save_item            — ~3 steps
  portal_accept_consent       — ~4 steps
  portal_load_config          — ~3 steps
  portal_fetch_notifications  — ~3 steps
  portal_fetch_faq            — ~3 steps
  portal_safety_alerts        — ~4 steps
  portal_view_submissions     — ~3 steps
  portal_update_preferences   — ~3 steps

ERROR FLOWS (4 remaining):
  error_403_forbidden         — ~4 steps
  error_404_not_found         — ~3 steps
  error_500_server            — ~4 steps
  error_422_validation        — ~4 steps

UTILITY (2 remaining):
  content_scheduler           — ~4 steps
  admin_manage_submissions    — ~4 steps
  admin_review_queue          — ~5 steps

─────────────────────────────────────────────────────────
## FILE TO EDIT
  cp-portal/frontend/src/admin/utils/flowTemplates.js

## REFERENCE (completed examples)
  admin_login (line ~91), admin_create_news (line ~181),
  error_401_unauthorized (line ~1319)

## VERIFICATION
  After adding concept to a flow, open Flow Library in Process Explorer
  and click that flow — the emoji pill should appear on each arrow.
  Click a step to open the detail drawer and verify all 12 fields show.
`

function HandoffModal({ onClose }) {
  const [copied, setCopied] = useState(false)

  function copyToClipboard() {
    navigator.clipboard.writeText(HANDOFF_TEXT).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px',
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 12, width: '100%', maxWidth: 760,
        maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid #E2E8F0' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1E293B' }}>
              Flow Template Enrichment — Handoff Document
            </div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
              3 of 47 done · 44 remaining · Share with Rajeev / Narasimha / Vanaja
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={copyToClipboard} style={{
              background: copied ? '#DCFCE7' : '#6B3FA0', color: copied ? '#15803D' : '#fff',
              border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 12,
              fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
            }}>
              {copied ? '✓ Copied!' : 'Copy All'}
            </button>
            <button onClick={onClose} style={{
              background: '#F1F5F9', color: '#64748B', border: 'none',
              borderRadius: 6, padding: '7px 12px', fontSize: 13, cursor: 'pointer',
            }}>✕</button>
          </div>
        </div>
        {/* Content */}
        <pre style={{
          flex: 1, overflowY: 'auto', margin: 0, padding: '16px 20px',
          fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, lineHeight: 1.65,
          color: '#1E293B', background: '#F8FAFC', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {HANDOFF_TEXT}
        </pre>
      </div>
    </div>
  )
}
