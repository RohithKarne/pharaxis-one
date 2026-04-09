import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'

function exportCSV(rows, filename) {
  if (!rows || rows.length === 0) return
  const headers = Object.keys(rows[0])
  const lines = [
    headers.join(','),
    ...rows.map(r => headers.map(h => {
      const v = r[h] ?? ''
      return String(v).includes(',') ? `"${String(v).replace(/"/g, '""')}"` : String(v)
    }).join(','))
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function ReportFilterPanel({ filters, onChange, onApply }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>Date Range:</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="date" style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }}
          value={filters.date_from} onChange={e => onChange({ ...filters, date_from: e.target.value })} />
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>to</span>
        <input type="date" style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }}
          value={filters.date_to} onChange={e => onChange({ ...filters, date_to: e.target.value })} />
      </div>
      <button onClick={onApply} style={{ padding: '5px 14px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Apply</button>
      <button onClick={() => { onChange({ date_from: '', date_to: '' }); onApply() }} style={{ padding: '5px 10px', background: 'none', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}>Clear</button>
    </div>
  )
}

function ReportTable({ title, description, endpoint, filters, token, filename }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const H = { Authorization: `Bearer ${token}` }

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    if (filters.date_from) params.set('date_from', filters.date_from)
    if (filters.date_to) params.set('date_to', filters.date_to)
    const url = `/api/reports/${endpoint}?${params.toString()}`
    fetch(url, { headers: H })
      .then(r => r.json())
      .then(d => setData(d.data || d.rows || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [endpoint, filters.date_from, filters.date_to, token])

  useEffect(() => { load() }, [load])

  const columns = data.length > 0 ? Object.keys(data[0]) : []

  function fmtHeader(key) {
    return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1000 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700 }}>{title}</h2>
          {description && <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{description}</p>}
        </div>
        <button
          disabled={data.length === 0}
          onClick={() => exportCSV(data, filename || `${endpoint}.csv`)}
          style={{ padding: '7px 16px', background: data.length > 0 ? 'var(--primary)' : '#ccc', color: '#fff', border: 'none', borderRadius: 4, cursor: data.length > 0 ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', marginLeft: 16 }}
        >
          ⬇ Export CSV
        </button>
      </div>
      <div style={{ marginTop: 20, overflowX: 'auto' }}>
        {loading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>}
        {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>Error: {error}</p>}
        {!loading && !error && data.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No data for selected period.</p>
        )}
        {!loading && data.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface)', borderBottom: '2px solid var(--border)' }}>
                {columns.map(c => (
                  <th key={c} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 }}>{fmtHeader(c)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                  {columns.map(c => (
                    <td key={c} style={{ padding: '9px 12px', color: 'var(--text-primary)' }}>{row[c] ?? '—'}</td>
                  ))}
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

const REPORT_GROUPS = [
  {
    key: 'operational',
    label: 'Case Operational',
    reports: [
      { key: 'case-volume',         label: 'Case Volume by Date',       endpoint: 'case-volume',         desc: 'Daily case creation counts across the selected period.' },
      { key: 'case-type',           label: 'Cases by Type',             endpoint: 'case-type',           desc: 'Breakdown of cases by type (MI, AE, PC).' },
      { key: 'case-status',         label: 'Cases by Status',           endpoint: 'case-status',         desc: 'Distribution of cases by current workflow status.' },
      { key: 'case-priority',       label: 'Cases by Priority',         endpoint: 'case-priority',       desc: 'Count of cases grouped by priority level.' },
      { key: 'case-assignee',       label: 'Cases by Assignee',         endpoint: 'case-assignee',       desc: 'Case load per assigned user.' },
      { key: 'case-intake-channel', label: 'Cases by Intake Channel',   endpoint: 'case-intake-channel', desc: 'How cases entered the system (email, manual, import, etc.).' },
      { key: 'case-age',            label: 'Case Age',                  endpoint: 'case-age',            desc: 'Age distribution of open cases.' },
      { key: 'case-ae-summary',     label: 'Adverse Event Summary',     endpoint: 'case-ae-summary',     desc: 'Summary statistics for adverse event cases.' },
    ],
  },
  {
    key: 'detail',
    label: 'Case Detail',
    reports: [
      { key: 'case-source',         label: 'Cases by Source',           endpoint: 'case-source',         desc: 'Case origin sources.' },
      { key: 'case-duplicates',     label: 'Duplicate Cases',           endpoint: 'case-duplicates',     desc: 'Potential duplicate case pairs within the selected period.' },
      { key: 'case-audit-trail',    label: 'Case Audit Trail',          endpoint: 'case-audit-trail',    desc: 'Audit events on cases for the selected period.' },
    ],
  },
  {
    key: 'compliance',
    label: 'Case Compliance',
    reports: [
      { key: 'regulatory-readiness', label: 'Regulatory Readiness',    endpoint: 'regulatory-readiness', desc: 'Cases reviewed for regulatory submission readiness.' },
      { key: 'case-monthly-trend',   label: 'Monthly Case Trend',       endpoint: 'case-monthly-trend',  desc: 'Month-on-month case volume for compliance trending.' },
      { key: 'case-closure-rate',    label: 'Case Closure Rate',        endpoint: 'case-closure-rate',   desc: 'Percentage of cases closed within SLA targets.' },
      { key: 'case-by-org',          label: 'Cases by Organisation',    endpoint: 'case-by-org',         desc: 'Case volume per organisation (SuperAdmin view).' },
    ],
  },
  {
    key: 'platform',
    label: 'Platform Analytics',
    reports: [
      { key: 'user-activity',   label: 'User Activity',         endpoint: 'user-activity',   desc: 'Login frequency and active users over the period.' },
      { key: 'module-usage',    label: 'Module Usage',          endpoint: 'module-usage',    desc: 'Which platform modules are being accessed most.' },
      { key: 'org-activity',    label: 'Organisation Activity', endpoint: 'org-activity',    desc: 'Case and login activity per organisation.' },
      { key: 'user-roles',      label: 'User Roles',            endpoint: 'user-roles',      desc: 'Distribution of users across roles.' },
      { key: 'content-usage',   label: 'Content Usage',         endpoint: 'content-usage',   desc: 'Document and FAQ access frequency.' },
    ],
  },
  {
    key: 'deep-analytics',
    label: 'Platform Deep Analytics',
    reports: [
      { key: 'security-events',  label: 'Security Events',     endpoint: 'security-events',  desc: 'Failed logins, IP changes, 2FA events.' },
      { key: 'integration-sync', label: 'Integration Sync',    endpoint: 'integration-sync', desc: 'Vault, MIR, CRM sync outcomes.' },
      { key: 'audit-summary',    label: 'Audit Summary',       endpoint: 'audit-summary',    desc: 'Summary of all audit trail events.' },
      { key: 'system-health',    label: 'System Health',       endpoint: 'system-health',    desc: 'Background jobs, scheduler runs, error rates.' },
      { key: 'field-usage',      label: 'Field Usage',         endpoint: 'field-usage',      desc: 'Which case form fields are most populated.' },
    ],
  },
]

export default function ReportsPage() {
  const { token } = useAuth()
  const [activeGroup, setActiveGroup] = useState('operational')
  const [activeReport, setActiveReport] = useState('case-volume')
  const [filters, setFilters] = useState({ date_from: '', date_to: '' })
  const [appliedFilters, setAppliedFilters] = useState({ date_from: '', date_to: '' })

  const currentGroup = REPORT_GROUPS.find(g => g.key === activeGroup)
  const currentReport = currentGroup?.reports.find(r => r.key === activeReport)

  function handleGroupClick(groupKey) {
    setActiveGroup(groupKey)
    const grp = REPORT_GROUPS.find(g => g.key === groupKey)
    if (grp && grp.reports.length > 0) {
      setActiveReport(grp.reports[0].key)
    }
  }

  return (
    <MIMSLayout>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Reports</h2>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Operational, compliance, and platform analytics</span>
        </div>
        <ReportFilterPanel
          filters={filters}
          onChange={setFilters}
          onApply={() => setAppliedFilters({ ...filters })}
        />
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--surface)' }}>
            {REPORT_GROUPS.map(group => (
              <div key={group.key}>
                <div
                  style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', cursor: 'pointer', background: activeGroup === group.key ? 'rgba(var(--primary-rgb, 79,70,229),0.07)' : 'transparent' }}
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
                key={currentReport.key}
                title={currentReport.label}
                description={currentReport.desc}
                endpoint={currentReport.endpoint}
                filters={appliedFilters}
                token={token}
                filename={`${currentReport.endpoint}.csv`}
              />
            )}
          </div>
        </div>
      </div>
    </MIMSLayout>
  )
}
