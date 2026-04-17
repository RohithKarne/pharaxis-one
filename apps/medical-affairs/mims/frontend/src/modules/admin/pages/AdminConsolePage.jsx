/**
 * AdminConsolePage.jsx — Full Admin Console
 * Sprint 3 complete implementation covering all IMP, AUD, ACC items.
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import AdminAccessSection from '../components/AdminAccessSection'
import AdminWorkflowSection from '../components/AdminWorkflowSection'
import AdminIntegrationSection from '../components/AdminIntegrationSection'
import AdminMiscSection from '../components/AdminMiscSection'
import AdminPicklistsSection from '../components/AdminPicklistsSection'
import AdminMICategoriesSection from '../components/AdminMICategoriesSection'
import {
  ADMIN_NAV_GROUPS,
  getAdminSectionLabel,
  normalizeAdminSection,
} from '../adminConsoleConfig'

const STATUS_COLORS = {
  success: { bg: '#e6f4ee', color: '#007a5a', label: 'Success' },
  failed:  { bg: '#fde8ef', color: '#e01e5a', label: 'Failed'  },
  warning: { bg: '#fdf3d0', color: '#b8860b', label: 'Warning' },
}

function parseUtcDate(s) {
  if (!s) return null
  const str = String(s).trim()
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)) {
    const [date, time] = str.split(' ')
    const [y, m, d] = date.split('-').map(Number)
    const [hh, mm, ss] = time.split(':').map(Number)
    return new Date(Date.UTC(y, m - 1, d, hh, mm, ss))
  }
  const d = new Date(str)
  return isNaN(d) ? null : d
}

function fmtDateIST(s) {
  const d = parseUtcDate(s)
  if (!d) return s || '—'
  // Manual IST formatting to avoid browser timezone support inconsistencies
  const istMs = d.getTime() + 330 * 60 * 1000
  const ist = new Date(istMs)
  const pad = n => String(n).padStart(2, '0')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const day = pad(ist.getUTCDate())
  const mon = months[ist.getUTCMonth()]
  const year = ist.getUTCFullYear()
  const hour = pad(ist.getUTCHours())
  const min = pad(ist.getUTCMinutes())
  const sec = pad(ist.getUTCSeconds())
  return `${day} ${mon} ${year}, ${hour}:${min}:${sec} IST`
}

function ServiceLogTab({ logs, sources, filter, onFilterChange, onRefine, page, pageSize, total, totalPages, loading, onPageChange, onPageSizeChange }) {

  const pages = []
  const start = Math.max(1, page - 2)
  const end   = Math.min(totalPages, page + 2)
  for (let i = start; i <= end; i++) pages.push(i)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Filter bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', background: 'var(--surface)' }}>
        <select
          value={filter.source}
          onChange={e => onFilterChange({ source: e.target.value })}
          style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text-primary)', background: 'var(--surface)', minWidth: 160 }}
        >
          <option value="">All Sources</option>
          {sources.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          value={filter.status}
          onChange={e => onFilterChange({ status: e.target.value })}
          style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text-primary)', background: 'var(--surface)' }}
        >
          <option value="">All Statuses</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="warning">Warning</option>
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
          <span>From</span>
          <input
            type="date"
            value={filter.date_from}
            onChange={e => onFilterChange({ date_from: e.target.value })}
            style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text-primary)', background: 'var(--surface)' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
          <span>To</span>
          <input
            type="date"
            value={filter.date_to}
            onChange={e => onFilterChange({ date_to: e.target.value })}
            style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text-primary)', background: 'var(--surface)' }}
          />
        </div>

        <button
          onClick={onRefine}
          style={{ padding: '6px 18px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          Refine
        </button>

        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
          {total} record{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-muted)', fontSize: 14 }}>
            Loading...
          </div>
        ) : logs.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-muted)', gap: 8 }}>
            <div style={{ fontSize: 28 }}>📋</div>
            <div style={{ fontSize: 14 }}>No service log entries yet.</div>
            <div style={{ fontSize: 12 }}>Entries will appear here once services run.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                {['Source', 'Service Type', 'Description', 'Status', 'Date'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((row, i) => {
                const sc = STATUS_COLORS[row.status] || STATUS_COLORS.warning
                return (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--bg)' }}>
                    <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{row.source}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{row.service_type}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-primary)', maxWidth: 420 }}>{row.description}</td>
                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                      <span style={{ background: sc.bg, color: sc.color, padding: '2px 10px', borderRadius: 12, fontWeight: 600, fontSize: 11 }}>
                        {sc.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDateIST(row.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 4 }}>Rows per page:</span>
          {[10, 20, 50].map(ps => (
            <button key={ps} onClick={() => onPageSizeChange(ps)}
              style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: 'pointer', background: pageSize === ps ? 'var(--primary)' : 'var(--surface)', color: pageSize === ps ? '#fff' : 'var(--text-primary)', fontWeight: pageSize === ps ? 700 : 400 }}>
              {ps}
            </button>
          ))}

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => onPageChange(1)} disabled={page === 1}
              style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? 0.4 : 1, background: 'var(--surface)' }}>«</button>
            <button onClick={() => onPageChange(page - 1)} disabled={page === 1}
              style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? 0.4 : 1, background: 'var(--surface)' }}>‹</button>
            {pages.map(p => (
              <button key={p} onClick={() => onPageChange(p)}
                style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: 'pointer', background: p === page ? 'var(--primary)' : 'var(--surface)', color: p === page ? '#fff' : 'var(--text-primary)', fontWeight: p === page ? 700 : 400 }}>
                {p}
              </button>
            ))}
            <button onClick={() => onPageChange(page + 1)} disabled={page === totalPages}
              style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: page === totalPages ? 'default' : 'pointer', opacity: page === totalPages ? 0.4 : 1, background: 'var(--surface)' }}>›</button>
            <button onClick={() => onPageChange(totalPages)} disabled={page === totalPages}
              style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: page === totalPages ? 'default' : 'pointer', opacity: page === totalPages ? 0.4 : 1, background: 'var(--surface)' }}>»</button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>Page {page} of {totalPages}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function SystemActivityTab({
  rows,
  summary,
  filter,
  onFilterChange,
  onRefine,
  onRefresh,
  page,
  pageSize,
  total,
  totalPages,
  loading,
  onPageChange,
  onPageSizeChange
}) {
  const pages = []
  const start = Math.max(1, page - 2)
  const end   = Math.min(totalPages, page + 2)
  for (let i = start; i <= end; i++) pages.push(i)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header + Filters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={onRefresh}
            style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', fontSize: 12, cursor: 'pointer' }}
          >
            ⟳ Refresh
          </button>

          <select
            value={filter.task}
            onChange={e => onFilterChange({ task: e.target.value })}
            style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text-primary)', background: 'var(--surface)', minWidth: 160 }}
          >
            <option value="Email Import">Email Import</option>
          </select>

          <select
            value={filter.status}
            onChange={e => onFilterChange({ status: e.target.value })}
            style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text-primary)', background: 'var(--surface)' }}
          >
            <option value="">All Statuses</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="warning">Warning</option>
          </select>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
            <span>From</span>
            <input
              type="date"
              value={filter.date_from}
              onChange={e => onFilterChange({ date_from: e.target.value })}
              style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text-primary)', background: 'var(--surface)' }}
            />
          </div>

          <button
            onClick={onRefine}
            style={{ padding: '6px 18px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Refine
          </button>

          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
            {total} record{total !== 1 ? 's' : ''}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
            { label: 'Total',   value: summary.total },
            { label: 'Success', value: summary.success },
            { label: 'Failed',  value: summary.failed },
            { label: 'Warning', value: summary.warning },
          ].map(card => (
            <div key={card.label} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', background: 'var(--bg)', minWidth: 120 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{card.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{card.value ?? 0}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-muted)', fontSize: 14 }}>
            Loading...
          </div>
        ) : rows.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-muted)', gap: 8 }}>
            <div style={{ fontSize: 28 }}>🧾</div>
            <div style={{ fontSize: 14 }}>No system activity entries yet.</div>
            <div style={{ fontSize: 12 }}>Email import runs will appear here once the service runs.</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                {[
                  'Task Name', 'Status', 'Start Date', 'End Date',
                  'Total Count', 'Error Count', 'Warning Count', 'Current Count',
                  'Last Activity Date', 'Last Poll Date'
                ].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const sc = STATUS_COLORS[row.status] || STATUS_COLORS.warning
                return (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--bg)' }}>
                    <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{row.task_name || 'Email Import'}</td>
                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                      <span style={{ background: sc.bg, color: sc.color, padding: '2px 10px', borderRadius: 12, fontWeight: 600, fontSize: 11 }}>
                        {sc.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDateIST(row.start_at)}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDateIST(row.end_at)}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{row.total_count ?? '—'}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{row.error_count ?? '—'}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{row.warning_count ?? '—'}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{row.current_count ?? '—'}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDateIST(row.last_activity_at)}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDateIST(row.last_poll_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 4 }}>Rows per page:</span>
          {[10, 20, 50].map(ps => (
            <button key={ps} onClick={() => onPageSizeChange(ps)}
              style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: 'pointer', background: pageSize === ps ? 'var(--primary)' : 'var(--surface)', color: pageSize === ps ? '#fff' : 'var(--text-primary)', fontWeight: pageSize === ps ? 700 : 400 }}>
              {ps}
            </button>
          ))}

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => onPageChange(1)} disabled={page === 1}
              style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? 0.4 : 1, background: 'var(--surface)' }}>«</button>
            <button onClick={() => onPageChange(page - 1)} disabled={page === 1}
              style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: page === 1 ? 'default' : 'pointer', opacity: page === 1 ? 0.4 : 1, background: 'var(--surface)' }}>‹</button>
            {pages.map(p => (
              <button key={p} onClick={() => onPageChange(p)}
                style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: 'pointer', background: p === page ? 'var(--primary)' : 'var(--surface)', color: p === page ? '#fff' : 'var(--text-primary)', fontWeight: p === page ? 700 : 400 }}>
                {p}
              </button>
            ))}
            <button onClick={() => onPageChange(page + 1)} disabled={page === totalPages}
              style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: page === totalPages ? 'default' : 'pointer', opacity: page === totalPages ? 0.4 : 1, background: 'var(--surface)' }}>›</button>
            <button onClick={() => onPageChange(totalPages)} disabled={page === totalPages}
              style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, cursor: page === totalPages ? 'default' : 'pointer', opacity: page === totalPages ? 0.4 : 1, background: 'var(--surface)' }}>»</button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>Page {page} of {totalPages}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function SkeletonTab({ label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 36 }}>🚧</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</div>
      <div style={{ fontSize: 13 }}>This section is under construction.</div>
    </div>
  )
}

export default function AdminConsolePage() {
  const { section: urlSection } = useParams()
  const navigate = useNavigate()
  const { token } = useAuth()
  const [theme] = useState(() => localStorage.getItem('mims_theme') || 'light')
  const rawSection = String(urlSection || 'overview')
  const activeSection = normalizeAdminSection(rawSection)
  const sectionLabel = getAdminSectionLabel(rawSection)
  const contentSection =
    rawSection === 'user-security-groups'
      ? 'user-security-groups'
      : rawSection === 'contact-master' || activeSection === 'case-contacts' || activeSection === 'company-reps'
        ? 'contact-master'
        : activeSection

  // Data
  const [orgs, setOrgs] = useState([])
  const [sites, setSites] = useState({}) // keyed by org_id
  const [expandedOrg, setExpandedOrg] = useState(null)
  const [workflowStates, setWorkflowStates] = useState([])
  const [sourceTypes, setSourceTypes] = useState([])
  const [products, setProducts] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [users, setUsers] = useState([])

  // Service Log
  const [svcLogs, setSvcLogs] = useState([])
  const [svcSources, setSvcSources] = useState([])
  const [svcFilter, setSvcFilter] = useState({ source: '', status: '', date_from: '', date_to: '' })
  const [svcPage, setSvcPage] = useState(1)
  const [svcPageSize, setSvcPageSize] = useState(20)
  const [svcTotal, setSvcTotal] = useState(0)
  const [svcTotalPages, setSvcTotalPages] = useState(1)
  const [svcLoading, setSvcLoading] = useState(false)

  const [sysRows, setSysRows] = useState([])
  const [sysSummary, setSysSummary] = useState({ total: 0, success: 0, failed: 0, warning: 0 })
  const [sysFilter, setSysFilter] = useState({ task: 'Email Import', status: '', date_from: '' })
  const [sysPage, setSysPage] = useState(1)
  const [sysPageSize, setSysPageSize] = useState(20)
  const [sysTotal, setSysTotal] = useState(0)
  const [sysTotalPages, setSysTotalPages] = useState(1)
  const [sysLoading, setSysLoading] = useState(false)

  // Forms
  const [orgForm, setOrgForm] = useState({ name: '' })
  const [wfForm, setWfForm] = useState({ name: '' })
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', role: 'agent', org_id: '' })
  const [esigAction, setEsigAction] = useState(null)
  const [esigForm, setEsigForm] = useState({ password: '', reason: '' })
  const [esigError, setEsigError] = useState('')
  const [msg, setMsg] = useState({ text: '', type: '' })

  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('mims_theme', theme)
  }, [theme])

  useEffect(() => { loadAll() }, [])

  useEffect(() => {
    if (contentSection === 'service-log')       loadServiceLogs()
    if (contentSection === 'system-activity')   loadSystemActivity()
  }, [contentSection])

  async function loadAll() {
    try {
      const [o, wf, src, p, a, u] = await Promise.all([
        fetch('/api/admin/orgs', { headers: H }).then(r => r.json()).catch(() => ({ orgs: [] })),
        fetch('/api/admin/workflow-states', { headers: H }).then(r => r.json()).catch(() => ({ states: [] })),
        fetch('/api/admin/source-types', { headers: H }).then(r => r.json()).catch(() => ({ sources: [] })),
        fetch('/api/admin/products', { headers: H }).then(r => r.json()).catch(() => ({ products: [] })),
        fetch('/api/admin/audit-logs', { headers: H }).then(r => r.json()).catch(() => ({ logs: [] })),
        fetch('/api/admin/users', { headers: H }).then(r => r.json()).catch(() => ({ users: [] })),
      ])
      setOrgs(o.orgs || [])
      setWorkflowStates(wf.states || [])
      setSourceTypes(src.sources || [])
      setProducts(p.products || [])
      setAuditLogs(a.logs || [])
      setUsers(u.users || [])
    } catch (err) {
      flash('Failed to load admin data. Please refresh.', 'error')
    }
  }

  async function loadServiceLogs(overrides = {}) {
    setSvcLoading(true)
    try {
      const params = new URLSearchParams({
        ...svcFilter,
        page: overrides.page ?? svcPage,
        page_size: overrides.page_size ?? svcPageSize,
      })
      // strip empty values so API doesn't filter on them
      for (const [k, v] of [...params.entries()]) { if (!v) params.delete(k) }
      const d = await fetch(`/api/admin/service-logs?${params}`, { headers: H }).then(r => r.json())
      setSvcLogs(d.data || [])
      setSvcSources(d.sources || [])
      setSvcTotal(d.total || 0)
      setSvcTotalPages(d.total_pages || 1)
    } catch {
      /* silent — table might not exist yet on fresh DB before restart */
    } finally {
      setSvcLoading(false)
    }
  }

  async function loadSystemActivity(overrides = {}) {
    setSysLoading(true)
    try {
      const params = new URLSearchParams({
        ...sysFilter,
        page: overrides.page ?? sysPage,
        page_size: overrides.page_size ?? sysPageSize,
      })
      for (const [k, v] of [...params.entries()]) { if (!v) params.delete(k) }
      const d = await fetch(`/api/admin/system-activity?${params}`, { headers: H }).then(r => r.json())
      setSysRows(d.data || [])
      setSysSummary(d.summary || { total: 0, success: 0, failed: 0, warning: 0 })
      setSysTotal(d.total || 0)
      setSysTotalPages(d.total_pages || 1)
    } catch {
      /* silent — table might not exist yet on fresh DB before restart */
    } finally {
      setSysLoading(false)
    }
  }

  async function loadSites(orgId) {
    const d = await fetch(`/api/admin/orgs/${orgId}/sites`, { headers: H }).then(r => r.json())
    setSites(prev => ({ ...prev, [orgId]: d.sites || [] }))
  }

  function flash(text, type = 'success') {
    setMsg({ text, type })
    setTimeout(() => setMsg({ text: '', type: '' }), 5000) // Fix: extended to 5s
  }

  // ESIG-01: Trigger electronic signature modal for critical actions
  function esigConfirm(msg, entity, entityId, onConfirm) {
    setEsigForm({ password: '', reason: '' })
    setEsigError('')
    setEsigAction({ msg, entity, entityId, onConfirm })
  }

  // ─── CRUD Handlers ─────────────────────────────────────────

  async function createOrg(e) {
    e.preventDefault()
    const res = await fetch('/api/admin/orgs', { method: 'POST', headers: H, body: JSON.stringify(orgForm) })
    const d = await res.json()
    if (!res.ok) return flash(d.error, 'error')
    setOrgs(prev => [...prev, d])
    setOrgForm({ name: '' })
    flash('Organisation created.')
  }

  async function toggleExpandOrg(orgId) {
    if (expandedOrg === orgId) { setExpandedOrg(null); return }
    setExpandedOrg(orgId)
    if (!sites[orgId]) await loadSites(orgId)
  }

  async function createWf(e) {
    e.preventDefault()
    const res = await fetch('/api/admin/workflow-states', { method: 'POST', headers: H, body: JSON.stringify(wfForm) })
    const d = await res.json()
    if (!res.ok) return flash(d.error, 'error')
    setWorkflowStates(prev => [...prev, d])
    setWfForm({ name: '' })
    flash('Workflow state created.')
  }

  async function toggleWf(wf) {
    esigConfirm(`${wf.is_active ? 'Deactivate' : 'Activate'} workflow state "${wf.name}"`, 'workflow_state', wf.id, async () => {
      await fetch(`/api/admin/workflow-states/${wf.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ name: wf.name, is_active: !wf.is_active }) })
      setWorkflowStates(prev => prev.map(w => w.id === wf.id ? { ...w, is_active: w.is_active ? 0 : 1 } : w))
      flash('Status updated.')
    })
  }

  // ─── Shared UI Components ──────────────────────────────────

  function SectionHeader({ title, desc }) {
    return (
      <div className="admin-section-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2>{title}</h2>
            {desc && <p>{desc}</p>}
          </div>
        </div>
        {msg.text && <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`} style={{ display: 'block', marginTop: 8 }}>{msg.text}</div>}
      </div>
    )
  }

  function ComingSoon({ label }) {
    return (
      <div className="admin-coming-soon">
        <div className="icon">🚧</div>
        <h3>Coming Soon</h3>
        <p><strong>{label}</strong> is under development and will be available in a future release.</p>
      </div>
    )
  }

  // ─── Section Renderers ─────────────────────────────────────

  function renderContent() {
    switch (contentSection) {

      case 'overview':
        return (
          <>
            <SectionHeader title="Admin Console" desc="System configuration and management overview." />
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
              {[
                { label: 'Organisations', value: orgs.filter(o => o.is_active).length, color: 'accent' },
                { label: 'Workflow States', value: workflowStates.filter(w => w.is_active).length, color: '' },
                { label: 'Source Types', value: sourceTypes.filter(s => s.is_active).length, color: 'warning' },
                { label: 'Products', value: products.filter(p => p.is_active).length, color: 'success' },
                { label: 'Users', value: users.length, color: '' },
                { label: 'Audit Entries', value: auditLogs.length, color: 'danger' },
              ].map(s => (
                <div key={s.label} className={`stat-card ${s.color}`}>
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-value">{s.value}</div>
                  <div className="stat-sub">Active</div>
                </div>
              ))}
            </div>
          </>
        )

      case 'sites':
      case 'workflow':
      case 'source-types':
        return <AdminWorkflowSection contentSection={contentSection} H={H} flash={flash} />

      case 'products':
      case 'audit-admin':
      case 'audit-login':
      case 'email-accounts':
      case 'contact-master':
      case 'case-numbering':
        return <AdminMiscSection contentSection={contentSection} H={H} flash={flash} />

      case 'user-security':
        return <AdminAccessSection contentSection={contentSection} H={H} flash={flash} />
      case 'user-config':
        return <AdminAccessSection contentSection={contentSection} H={H} flash={flash} />
      case 'user-security-groups':
        return <AdminAccessSection contentSection={contentSection} H={H} flash={flash} />
      case 'report-access-requests':
        return <AdminAccessSection contentSection={contentSection} H={H} flash={flash} />
      case 'change-approvals':
        return <AdminAccessSection contentSection={contentSection} H={H} flash={flash} />
      case 'security-groups':
        return <AdminAccessSection contentSection={contentSection} H={H} flash={flash} />

      case 'picklists':
      case 'field-setup':
      case 'case-form-def':
        return <AdminPicklistsSection contentSection={contentSection} H={H} flash={flash} />

      case 'mi-categories':
        return <AdminMICategoriesSection H={H} />

      case 'mir-int':
      case 'crm-int':
      case 'content-int':
      case 'emir-int':
      case 'case-import':
        return <AdminIntegrationSection contentSection={contentSection} H={H} flash={flash} />

      default: {
        const found = ADMIN_NAV_GROUPS.flatMap((group) => group.items).find((item) => item.key === activeSection)
        return <ComingSoon label={found?.label || sectionLabel || activeSection} />
      }
    }
  }

  return (
    <MIMSLayout showStatStrip={false} bodyClassName="no-scroll admin-page-body">
      <div className="ac-detail-page">
        <div className="ac-detail-breadcrumb" aria-label="Admin detail breadcrumb">
          <button
            type="button"
            className="ac-detail-breadcrumb-link"
            onClick={() => navigate('/admin-console')}
          >
            Admin Console
          </button>
          <span className="ac-detail-breadcrumb-sep">&gt;</span>
          <span className="ac-detail-breadcrumb-current">{sectionLabel}</span>
        </div>
        <div className="ac-detail-stage">
          {contentSection === 'service-log' ? (
            <ServiceLogTab
              logs={svcLogs}
              sources={svcSources}
              filter={svcFilter}
              onFilterChange={f => setSvcFilter(prev => ({ ...prev, ...f }))}
              onRefine={() => { setSvcPage(1); loadServiceLogs({ page: 1 }) }}
              page={svcPage}
              pageSize={svcPageSize}
              total={svcTotal}
              totalPages={svcTotalPages}
              loading={svcLoading}
              onPageChange={p => { setSvcPage(p); loadServiceLogs({ page: p }) }}
              onPageSizeChange={ps => { setSvcPage(1); setSvcPageSize(ps); loadServiceLogs({ page: 1, page_size: ps }) }}
            />
          ) : contentSection === 'system-activity' ? (
            <SystemActivityTab
              rows={sysRows}
              summary={sysSummary}
              filter={sysFilter}
              onFilterChange={f => setSysFilter(prev => ({ ...prev, ...f }))}
              onRefine={() => { setSysPage(1); loadSystemActivity({ page: 1 }) }}
              onRefresh={() => loadSystemActivity({ page: sysPage })}
              page={sysPage}
              pageSize={sysPageSize}
              total={sysTotal}
              totalPages={sysTotalPages}
              loading={sysLoading}
              onPageChange={p => { setSysPage(p); loadSystemActivity({ page: p }) }}
              onPageSizeChange={ps => { setSysPage(1); setSysPageSize(ps); loadSystemActivity({ page: 1, page_size: ps }) }}
            />
          ) : (
            <div className="page-content" style={{ padding: 0, flex: 1, overflow: 'auto' }}>
              {renderContent()}
            </div>
          )}
        </div>
      </div>

      {/* ESIG Modal — Electronic Signature (21 CFR Part 11 ESIG-01, ESIG-02) */}
      {esigAction && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 8, padding: 28, maxWidth: 420, width: '90%', boxShadow: 'var(--shadow-md)' }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Electronic Signature Required</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>21 CFR Part 11 — This action requires your electronic signature to proceed.</div>
            <div style={{ background: 'var(--bg)', borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)', borderLeft: '3px solid var(--warning)' }}>
              {esigAction.msg}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              <input className="form-control" type="password" placeholder="Enter your password to confirm identity"
                value={esigForm.password} onChange={e => setEsigForm(f => ({ ...f, password: e.target.value }))} />
              <textarea className="form-control" placeholder="Reason / justification for this change (required)" rows={2}
                style={{ resize: 'none' }} value={esigForm.reason}
                onChange={e => setEsigForm(f => ({ ...f, reason: e.target.value }))} />
              {esigError && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{esigError}</div>}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setEsigAction(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={async () => {
                if (!esigForm.password || !esigForm.reason) { setEsigError('Both password and reason are required.'); return }
                try {
                  const r = await fetch('/api/admin/esig-verify', {
                    method: 'POST', headers: H,
                    body: JSON.stringify({ password: esigForm.password, reason: esigForm.reason, action: esigAction.msg, entity: esigAction.entity, entity_id: esigAction.entityId })
                  })
                  const d = await r.json()
                  if (!r.ok) { setEsigError(d.error || 'Signature rejected.'); return }
                  await esigAction.onConfirm()
                  setEsigAction(null)
                  setEsigForm({ password: '', reason: '' })
                  setEsigError('')
                } catch { setEsigError('Server unreachable. Please restart the backend and try again.') }
              }}>Sign & Confirm</button>
            </div>
          </div>
        </div>
      )}

    </MIMSLayout>
  )
}
