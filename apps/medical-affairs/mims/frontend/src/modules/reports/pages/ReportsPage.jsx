import { useState, useEffect, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'

// F3: PRESET_STORAGE_KEY kept for legacy migration only — presets now persisted to backend
const PRESET_STORAGE_KEY = 'mims_reports_presets_v1'

function exportCSV(rows, filename) {
  if (!rows || rows.length === 0) return
  const visibleRows = rows.map((row) => Object.fromEntries(
    Object.entries(row).filter(([key]) => !key.startsWith('__'))
  ))
  const headers = Object.keys(visibleRows[0] || {})
  const lines = [
    headers.join(','),
    ...visibleRows.map((row) => headers.map((header) => {
      const value = row[header] ?? ''
      return String(value).includes(',') ? `"${String(value).replace(/"/g, '""')}"` : String(value)
    }).join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function formatTimestamp(value) {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return value
  return dt.toLocaleString()
}

function ReportFilterPanel({ filters, onChange, onApply, onSavePreset }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>Date Range:</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="date"
          style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }}
          value={filters.date_from}
          onChange={e => onChange({ ...filters, date_from: e.target.value })}
        />
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>to</span>
        <input
          type="date"
          style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }}
          value={filters.date_to}
          onChange={e => onChange({ ...filters, date_to: e.target.value })}
        />
      </div>
      <button onClick={onApply} style={{ padding: '5px 14px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Apply</button>
      <button
        onClick={() => {
          const cleared = { date_from: '', date_to: '' }
          onChange(cleared)
          onApply(cleared)
        }}
        style={{ padding: '5px 10px', background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}
      >
        Clear
      </button>
      <button onClick={onSavePreset} style={{ padding: '5px 10px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 4, cursor: 'pointer', fontSize: 13, color: '#1d4ed8', fontWeight: 600 }}>
        Save Preset
      </button>
    </div>
  )
}

function PresetPanel({ presets, currentReport, onApply, onDelete }) {
  return (
    <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: '#fff' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Saved Presets</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Presets store the active report and date filter combination.</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {presets.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No saved presets yet.</div>}
        {presets.map((preset) => (
          <div key={preset.id} style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', borderRadius: 999, background: preset.reportKey === currentReport ? 'rgba(37,99,235,0.08)' : '#f8fafc', padding: '6px 8px 6px 12px' }}>
            <button onClick={() => onApply(preset)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{preset.name}</button>
            <button onClick={() => onDelete(preset.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, color: '#b91c1c' }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function RunLedgerPanel({ runs, loading, onRefresh }) {
  return (
    <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: '#f8fafc' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Recent Report Runs</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Manual and scheduled runs recorded in the Sprint 18 command center ledger.</div>
        </div>
        <button onClick={onRefresh} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: 12 }}>Refresh</button>
      </div>
      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 10 }}>
        {loading && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading recent runs…</div>}
        {!loading && runs.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No report ledger entries yet.</div>}
        {!loading && runs.map((run) => (
          <div key={run.id} style={{ border: '1px solid var(--border)', borderRadius: 10, background: '#fff', padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{run.report_name}</div>
              <span style={{ fontSize: 11, fontWeight: 700, color: run.status === 'failed' ? '#b91c1c' : '#15803d', textTransform: 'uppercase' }}>{run.status}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{run.run_mode} • {run.row_count} rows • {formatTimestamp(run.created_at)}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{run.triggered_by_name || 'System'}{run.delivery_method ? ` • ${run.delivery_method}` : ''}</div>
            {run.error_message && <div style={{ marginTop: 6, fontSize: 12, color: '#b91c1c' }}>{run.error_message}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

function ReportTable({ title, description, reportKey, endpoint, filters, token, filename, onDrill, onRunLogged }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    const requestHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    if (filters.date_from) params.set('date_from', filters.date_from)
    if (filters.date_to) params.set('date_to', filters.date_to)
    try {
      const url = `/api/reports/${endpoint}?${params.toString()}`
      const response = await fetch(url, { headers: requestHeaders })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Failed to load report')
      const rows = payload.data || payload.rows || []
      setData(rows)
      fetch('/api/reports/run-log', {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({
          report_key: reportKey,
          report_name: title,
          filters,
          timezone_name: Intl.DateTimeFormat().resolvedOptions().timeZone,
          row_count: rows.length,
          status: 'success',
        }),
      }).catch(() => {})
      if (typeof onRunLogged === 'function') onRunLogged()
    } catch (err) {
      setData([])
      setError(err.message)
      fetch('/api/reports/run-log', {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({
          report_key: reportKey,
          report_name: title,
          filters,
          timezone_name: Intl.DateTimeFormat().resolvedOptions().timeZone,
          row_count: 0,
          status: 'failed',
          error_message: err.message,
        }),
      }).catch(() => {})
    } finally {
      setLoading(false)
    }
  }, [endpoint, filters, onRunLogged, reportKey, title, token])

  useEffect(() => { load() }, [load])

  const columns = data.length > 0
    ? Object.keys(data[0]).filter((key) => !key.startsWith('__'))
    : []

  function fmtHeader(key) {
    return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1180 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700 }}>{title}</h2>
          {description && <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{description}</p>}
        </div>
        <button
          disabled={data.length === 0}
          onClick={() => exportCSV(data, filename || `${endpoint}.csv`)}
          style={{ padding: '7px 16px', background: data.length > 0 ? 'var(--primary)' : '#ccc', color: '#fff', border: 'none', borderRadius: 4, cursor: data.length > 0 ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}
        >
          Export CSV
        </button>
      </div>
      <div style={{ marginTop: 20, overflowX: 'auto' }}>
        {loading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>}
        {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>Error: {error}</p>}
        {!loading && !error && data.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No data for selected period.</p>}
        {!loading && data.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface)', borderBottom: '2px solid var(--border)' }}>
                {columns.map((column) => (
                  <th key={column} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 }}>{fmtHeader(column)}</th>
                ))}
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, index) => (
                <tr key={`${reportKey}-${index}`} style={{ borderBottom: '1px solid var(--border)', background: index % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                  {columns.map((column) => (
                    <td key={column} style={{ padding: '9px 12px', color: 'var(--text-primary)' }}>{row[column] ?? '—'}</td>
                  ))}
                  <td style={{ padding: '9px 12px' }}>
                    {row.__drill_route ? (
                      <button
                        onClick={() => onDrill(row.__drill_route, row.__drill_state || null)}
                        style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                      >
                        Open
                      </button>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>{data.length} row{data.length !== 1 ? 's' : ''}</div>
    </div>
  )
}

const SCHEDULEABLE_REPORTS = [
  { key: 'daily-operations-pack', label: 'Daily Operations Pack' },
  { key: 'daily-case-openings', label: 'Daily Case Openings' },
  { key: 'daily-case-closures', label: 'Daily Case Closures' },
  { key: 'daily-case-summary', label: 'Daily Case Summary' },
  { key: 'inbox-performance', label: 'Inbox Performance' },
  { key: 'inbox-sla', label: 'Inbox SLA' },
  { key: 'transmission-sla', label: 'Transmission SLA' },
]

function ScheduledReportsPanel({ configs, loading, form, onChange, onCreate, onDelete, saving }) {
  return (
    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: '#f8fafc' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Scheduled Reports</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Timezone-aware report jobs with DST-safe execution.</div>
        </div>
      </div>

      {/* F4: delivery_method added — was hardcoded to 'email' */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 0.75fr 0.75fr 1fr 0.85fr 1.1fr auto', gap: 10, marginTop: 12, alignItems: 'end' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>Report</div>
          <select
            value={form.report_key}
            onChange={(e) => {
              const nextKey = e.target.value
              const picked = SCHEDULEABLE_REPORTS.find((report) => report.key === nextKey)
              onChange({ ...form, report_key: nextKey, export_name: picked?.label || form.export_name })
            }}
            style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1px solid var(--border)' }}
          >
            {SCHEDULEABLE_REPORTS.map((report) => <option key={report.key} value={report.key}>{report.label}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>Name</div>
          <input value={form.export_name} onChange={(e) => onChange({ ...form, export_name: e.target.value })} style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1px solid var(--border)' }} />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>Frequency</div>
          <select value={form.schedule_frequency} onChange={(e) => onChange({ ...form, schedule_frequency: e.target.value })} style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1px solid var(--border)' }}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>Time</div>
          <input type="time" value={form.schedule_time_local} onChange={(e) => onChange({ ...form, schedule_time_local: e.target.value })} style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1px solid var(--border)' }} />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>Timezone</div>
          <input value={form.timezone_name} onChange={(e) => onChange({ ...form, timezone_name: e.target.value })} style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1px solid var(--border)' }} />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>Delivery</div>
          <select value={form.delivery_method} onChange={(e) => onChange({ ...form, delivery_method: e.target.value })} style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1px solid var(--border)' }}>
            <option value="email">Email</option>
            <option value="in_app">In-App</option>
            <option value="both">Both</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
            Email To {(form.delivery_method === 'in_app') && <span style={{ color: '#94a3b8' }}>(optional)</span>}
          </div>
          <input value={form.delivery_target} onChange={(e) => onChange({ ...form, delivery_target: e.target.value })} placeholder="team@example.com" style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1px solid var(--border)' }} />
        </div>
        <button onClick={onCreate} disabled={saving} style={{ padding: '8px 14px', border: 'none', borderRadius: 6, background: 'var(--primary)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
          {saving ? 'Saving…' : 'Create'}
        </button>
      </div>

      <div style={{ marginTop: 14 }}>
        {loading && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading scheduled jobs…</div>}
        {!loading && configs.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No scheduled report jobs yet.</div>}
        {!loading && configs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {configs.map((config) => (
              <div key={config.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{config.export_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {config.report_key} • {config.schedule_frequency} • {config.schedule_time_local} • {config.timezone_name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    Next run: {config.next_run_at_utc ? new Date(config.next_run_at_utc).toLocaleString() : 'Pending'}
                    {config.last_run_status ? ` • Last: ${config.last_run_status}` : ''}
                  </div>
                </div>
                <button onClick={() => onDelete(config.id)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff5f5', color: '#b91c1c', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const REPORT_GROUPS = [
  {
    key: 'command-center',
    label: 'Command Center',
    reports: [
      { key: 'daily-operations-pack', label: 'Daily Operations Pack', endpoint: 'daily-operations-pack', desc: 'Leadership pack for case openings, closures, backlog, and inbox operational risk.' },
      { key: 'report-run-ledger', label: 'Report Run Ledger', endpoint: 'report-run-ledger', desc: 'Manual and scheduled report execution ledger with status, row count, and trigger source.' },
    ],
  },
  {
    key: 'inbox-operations',
    label: 'Inbox Operations',
    reports: [
      { key: 'inbox-performance', label: 'Inbox Performance', endpoint: 'inbox-performance', desc: 'Queue and assignee workload, conversion, closure, and breach metrics.' },
      { key: 'inbox-sla', label: 'Inbox SLA', endpoint: 'inbox-sla', desc: 'Detailed first-touch and response SLA tracking for inbox items.' },
    ],
  },
  {
    key: 'operational',
    label: 'Case Operational',
    reports: [
      { key: 'daily-case-summary', label: 'Daily Case Summary', endpoint: 'daily-case-summary', desc: 'Openings, closures, and backlog summary for the selected day or range.' },
      { key: 'case-volume', label: 'Case Volume by Date', endpoint: 'case-volume', desc: 'Daily case creation counts across the selected period.' },
      { key: 'case-type', label: 'Cases by Type', endpoint: 'case-type', desc: 'Breakdown of cases by type (MI, AE, PC).' },
      { key: 'case-status', label: 'Cases by Status', endpoint: 'case-status', desc: 'Distribution of cases by current workflow status.' },
      { key: 'case-priority', label: 'Cases by Priority', endpoint: 'case-priority', desc: 'Count of cases grouped by priority level.' },
      { key: 'case-assignee', label: 'Cases by Assignee', endpoint: 'case-assignee', desc: 'Case load per assigned user.' },
      { key: 'case-intake-channel', label: 'Cases by Intake Channel', endpoint: 'case-intake-channel', desc: 'How cases entered the system (email, manual, import, etc.).' },
      { key: 'case-age', label: 'Case Age', endpoint: 'case-age', desc: 'Age distribution of open cases.' },
      { key: 'case-ae-summary', label: 'Adverse Event Summary', endpoint: 'case-ae-summary', desc: 'Summary statistics for adverse event cases.' },
    ],
  },
  {
    key: 'detail',
    label: 'Case Detail',
    reports: [
      { key: 'daily-case-openings', label: 'Daily Case Openings', endpoint: 'daily-case-openings', desc: 'Detailed list of cases opened in the selected day or range.' },
      { key: 'daily-case-closures', label: 'Daily Case Closures', endpoint: 'daily-case-closures', desc: 'Detailed list of cases closed in the selected day or range.' },
      { key: 'case-source', label: 'Cases by Source', endpoint: 'case-source', desc: 'Case origin sources.' },
      { key: 'case-duplicates', label: 'Duplicate Cases', endpoint: 'case-duplicates', desc: 'Potential duplicate case pairs within the selected period.' },
      { key: 'case-audit-trail', label: 'Case Audit Trail', endpoint: 'case-audit-trail', desc: 'Audit events on cases for the selected period.' },
    ],
  },
  {
    key: 'compliance',
    label: 'Case Compliance',
    reports: [
      { key: 'transmission-sla', label: 'Transmission SLA', endpoint: 'transmission-sla', desc: 'Open AE and PC transmissions with current SLA state and escalation level.' },
      { key: 'regulatory-readiness', label: 'Regulatory Readiness', endpoint: 'regulatory-readiness', desc: 'Cases reviewed for regulatory submission readiness.' },
      { key: 'case-monthly-trend', label: 'Monthly Case Trend', endpoint: 'case-monthly-trend', desc: 'Month-on-month case volume for compliance trending.' },
      { key: 'case-closure-rate', label: 'Case Closure Rate', endpoint: 'case-closure-rate', desc: 'Percentage of cases closed within SLA targets.' },
      { key: 'case-by-org', label: 'Cases by Organisation', endpoint: 'case-by-org', desc: 'Case volume per organisation (SuperAdmin view).' },
    ],
  },
  {
    key: 'platform',
    label: 'Platform Analytics',
    reports: [
      { key: 'user-activity', label: 'User Activity', endpoint: 'user-activity', desc: 'Login frequency and active users over the period.' },
      { key: 'module-usage', label: 'Module Usage', endpoint: 'module-usage', desc: 'Which platform modules are being accessed most.' },
      { key: 'org-activity', label: 'Organisation Activity', endpoint: 'org-activity', desc: 'Case and login activity per organisation.' },
      { key: 'user-roles', label: 'User Roles', endpoint: 'user-roles', desc: 'Distribution of users across roles.' },
      { key: 'content-usage', label: 'Content Usage', endpoint: 'content-usage', desc: 'Document and FAQ access frequency.' },
    ],
  },
  {
    key: 'deep-analytics',
    label: 'Platform Deep Analytics',
    reports: [
      { key: 'security-events', label: 'Security Events', endpoint: 'security-events', desc: 'Failed logins, IP changes, 2FA events.' },
      { key: 'integration-sync', label: 'Integration Sync', endpoint: 'integration-sync', desc: 'Vault, MIR, CRM sync outcomes.' },
      { key: 'audit-summary', label: 'Audit Summary', endpoint: 'audit-summary', desc: 'Summary of all audit trail events.' },
      { key: 'system-health', label: 'System Health', endpoint: 'system-health', desc: 'Background jobs, scheduler runs, error rates.' },
      { key: 'field-usage', label: 'Field Usage', endpoint: 'field-usage', desc: 'Which case form fields are most populated.' },
    ],
  },
]

export default function ReportsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = useAuth()
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  const [activeGroup, setActiveGroup] = useState('command-center')
  const [activeReport, setActiveReport] = useState('daily-operations-pack')
  const [filters, setFilters] = useState({ date_from: '', date_to: '' })
  const [appliedFilters, setAppliedFilters] = useState({ date_from: '', date_to: '' })
  const [scheduledConfigs, setScheduledConfigs] = useState([])
  const [scheduledLoading, setScheduledLoading] = useState(false)
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [recentRuns, setRecentRuns] = useState([])
  const [recentRunsLoading, setRecentRunsLoading] = useState(false)
  const [presets, setPresets] = useState([])
  const [scheduleForm, setScheduleForm] = useState({
    report_key: 'daily-operations-pack',
    export_name: 'Daily Operations Pack',
    schedule_frequency: 'daily',
    schedule_time_local: '08:00',
    timezone_name: 'America/New_York',
    delivery_method: 'email',   // F4: was hardcoded, now a form field
    delivery_target: '',
  })

  const currentGroup = REPORT_GROUPS.find(group => group.key === activeGroup)
  const currentReport = currentGroup?.reports.find(report => report.key === activeReport)

  const loadScheduledConfigs = useCallback(async () => {
    if (!token) return
    setScheduledLoading(true)
    try {
      const res = await fetch('/api/admin/exports/scheduled', { headers })
      const data = await res.json()
      setScheduledConfigs(Array.isArray(data.configs) ? data.configs : [])
    } catch (_) {
      setScheduledConfigs([])
    } finally {
      setScheduledLoading(false)
    }
  }, [token])

  const loadRecentRuns = useCallback(async () => {
    if (!token) return
    setRecentRunsLoading(true)
    try {
      const res = await fetch('/api/reports/report-run-ledger?limit=8', { headers })
      const data = await res.json()
      setRecentRuns(Array.isArray(data.data) ? data.data : [])
    } catch (_) {
      setRecentRuns([])
    } finally {
      setRecentRunsLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadScheduledConfigs()
    loadRecentRuns()
    // F3: Load presets from backend (migrate any localStorage presets on first load)
    async function loadPresets() {
      try {
        const res = await fetch('/api/reports/presets', { headers })
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data) && data.length > 0) {
            setPresets(data)
          } else {
            // Migrate from localStorage if backend is empty
            const saved = JSON.parse(window.localStorage.getItem(PRESET_STORAGE_KEY) || '[]')
            if (Array.isArray(saved) && saved.length > 0) {
              setPresets(saved)
              // Migrate each to backend silently
              saved.forEach(p => {
                fetch('/api/reports/presets', {
                  method: 'POST', headers,
                  body: JSON.stringify({ name: p.name, group_key: p.groupKey, report_key: p.reportKey, filters: p.filters }),
                }).catch(() => {})
              })
              window.localStorage.removeItem(PRESET_STORAGE_KEY)
            }
          }
        }
      } catch (_) {
        try {
          const saved = JSON.parse(window.localStorage.getItem(PRESET_STORAGE_KEY) || '[]')
          setPresets(Array.isArray(saved) ? saved : [])
        } catch (__) { setPresets([]) }
      }
    }
    loadPresets()
  }, [loadRecentRuns, loadScheduledConfigs])

  // F2: Read drill state from URL query params (survives refresh + tab duplicate)
  useEffect(() => {
    const state = location.state || {}
    const params = new URLSearchParams(location.search || '')
    const grp = state.activeGroup   || params.get('activeGroup')
    const rpt = state.activeReport  || params.get('activeReport')
    let flt  = state.appliedFilters
    if (!flt && params.get('appliedFilters')) {
      try { flt = JSON.parse(params.get('appliedFilters')) } catch (_) {}
    }
    if (grp) setActiveGroup(grp)
    if (rpt) setActiveReport(rpt)
    if (flt) { setFilters(flt); setAppliedFilters(flt) }
  }, [location.state, location.search])

  async function createScheduledReport() {
    const isEmail = scheduleForm.delivery_method === 'email' || scheduleForm.delivery_method === 'both'
    if (!scheduleForm.export_name.trim()) { alert('Report name is required.'); return }
    if (isEmail && !scheduleForm.delivery_target.trim()) { alert('Delivery email is required for email delivery.'); return }
    setScheduleSaving(true)
    try {
      const res = await fetch('/api/admin/exports/scheduled', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          export_name:         scheduleForm.export_name.trim(),
          report_key:          scheduleForm.report_key,
          schedule_frequency:  scheduleForm.schedule_frequency,
          schedule_time_local: scheduleForm.schedule_time_local,
          timezone_name:       scheduleForm.timezone_name.trim() || 'UTC',
          delivery_method:     scheduleForm.delivery_method,   // F4: no longer hardcoded
          delivery_target:     scheduleForm.delivery_target.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create scheduled report')
      await Promise.all([loadScheduledConfigs(), loadRecentRuns()])
    } catch (err) {
      alert(err.message || 'Failed to create scheduled report')
    } finally {
      setScheduleSaving(false)
    }
  }

  async function deleteScheduledReport(id) {
    if (!window.confirm('Delete this scheduled report?')) return
    try {
      const res = await fetch(`/api/admin/exports/scheduled/${id}`, { method: 'DELETE', headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete scheduled report')
      await loadScheduledConfigs()
    } catch (err) {
      alert(err.message || 'Failed to delete scheduled report')
    }
  }

  function handleGroupClick(groupKey) {
    setActiveGroup(groupKey)
    const group = REPORT_GROUPS.find(entry => entry.key === groupKey)
    if (group?.reports?.length) {
      setActiveReport(group.reports[0].key)
    }
  }

  // F3: savePreset — backend API (no more localStorage)
  async function savePreset() {
    const name = window.prompt('Preset name')
    if (!name || !name.trim()) return
    try {
      const res = await fetch('/api/reports/presets', {
        method: 'POST', headers,
        body: JSON.stringify({ name: name.trim(), group_key: activeGroup, report_key: activeReport, filters: appliedFilters }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPresets(prev => [data, ...prev.filter(p => p.name !== data.name)].slice(0, 20))
    } catch (err) { alert(err.message || 'Failed to save preset') }
  }

  function applyPreset(preset) {
    setActiveGroup(preset.group_key || preset.groupKey)
    setActiveReport(preset.report_key || preset.reportKey)
    const flt = preset.filters || { date_from: '', date_to: '' }
    setFilters(flt)
    setAppliedFilters(flt)
  }

  // F3: deletePreset — backend API
  async function deletePreset(id) {
    try {
      await fetch(`/api/reports/presets/${id}`, { method: 'DELETE', headers })
      setPresets(prev => prev.filter(p => p.id !== id))
    } catch (err) { alert('Failed to delete preset') }
  }

  // F2: handleDrill — URL query params instead of React Router state (survives refresh)
  function handleDrill(route, state) {
    if (route === '/reports') {
      if (state?.activeGroup) setActiveGroup(state.activeGroup)
      if (state?.activeReport) setActiveReport(state.activeReport)
      if (state?.appliedFilters) { setFilters(state.appliedFilters); setAppliedFilters(state.appliedFilters) }
      return
    }
    if (state && typeof state === 'object') {
      const params = new URLSearchParams()
      Object.entries(state).forEach(([k, v]) => {
        if (v !== null && v !== undefined) {
          params.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
        }
      })
      const qs = params.toString()
      navigate(`${route}${qs ? `?${qs}` : ''}`)
    } else {
      navigate(route)
    }
  }

  return (
    <MIMSLayout>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Reports</h2>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Sprint 18 command center for reports, inbox operations, and audit-ready run tracking</span>
        </div>

        <ScheduledReportsPanel
          configs={scheduledConfigs}
          loading={scheduledLoading}
          form={scheduleForm}
          onChange={setScheduleForm}
          onCreate={createScheduledReport}
          onDelete={deleteScheduledReport}
          saving={scheduleSaving}
        />

        <RunLedgerPanel runs={recentRuns} loading={recentRunsLoading} onRefresh={loadRecentRuns} />
        <PresetPanel presets={presets} currentReport={activeReport} onApply={applyPreset} onDelete={deletePreset} />

        <ReportFilterPanel
          filters={filters}
          onChange={setFilters}
          onApply={(nextFilters = filters) => setAppliedFilters({ ...nextFilters })}
          onSavePreset={savePreset}
        />

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div style={{ width: 240, flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--surface)' }}>
            {REPORT_GROUPS.map(group => (
              <div key={group.key}>
                <div
                  style={{
                    padding: '10px 14px',
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    background: activeGroup === group.key ? 'rgba(var(--primary-rgb, 79,70,229),0.07)' : 'transparent',
                  }}
                  onClick={() => handleGroupClick(group.key)}
                >
                  {group.label}
                </div>
                {activeGroup === group.key && group.reports.map(report => (
                  <div
                    key={report.key}
                    onClick={() => setActiveReport(report.key)}
                    style={{
                      padding: '8px 14px 8px 22px',
                      fontSize: 13,
                      cursor: 'pointer',
                      color: activeReport === report.key ? 'var(--primary)' : 'var(--text-primary)',
                      background: activeReport === report.key ? 'rgba(var(--primary-rgb, 79,70,229),0.1)' : 'transparent',
                      fontWeight: activeReport === report.key ? 600 : 400,
                      borderLeft: activeReport === report.key ? '3px solid var(--primary)' : '3px solid transparent',
                    }}
                  >
                    {report.label}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {currentReport && token && (
              <ReportTable
                key={`${currentReport.key}-${appliedFilters.date_from}-${appliedFilters.date_to}`}
                title={currentReport.label}
                description={currentReport.desc}
                reportKey={currentReport.key}
                endpoint={currentReport.endpoint}
                filters={appliedFilters}
                token={token}
                filename={`${currentReport.endpoint}.csv`}
                onDrill={handleDrill}
                onRunLogged={loadRecentRuns}
              />
            )}
          </div>
        </div>
      </div>
    </MIMSLayout>
  )
}
