import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch.js'
import VirtualizedTable from '../../../../shared/components/VirtualizedTable.jsx'
import { fmtDateIST } from '../../../admin/components/AdminShared'
import CaseAuditTrailPage from '../../../audittrail/pages/CaseAuditTrailPage'
import CMAuditTrailPage from '../../../audittrail/pages/CMAuditTrailPage'
import TransmissionAuditTrailPage from '../../../transmissions/pages/TransmissionAuditTrailPage'

const VIEW_OPTIONS = [
  { key: 'admin', label: 'Admin Audit Trail', description: 'System configuration and data changes' },
  { key: 'login', label: 'Login Audit Trail', description: 'Login, logout, and authentication events' },
  { key: 'case', label: 'Case Audit Trail', description: 'Field-level change history across medical cases' },
  { key: 'cm', label: 'CM Audit Trail', description: 'Document and content-governance change history' },
  { key: 'transmission', label: 'Transmission Audit Trail', description: 'Outbound transmission history by case and target system' },
]

const ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'ESIG']
const LOGIN_STATUSES = ['success', 'failed']

function safeJson(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return { raw: String(raw) } }
}

function valueText(value) {
  if (value == null || value === '') return '-'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

function statusColor(status) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'success') return { bg: '#e6f4ee', color: '#007a5a' }
  if (normalized === 'failed') return { bg: '#fde8ef', color: '#e01e5a' }
  return { bg: '#fdf3d0', color: '#b8860b' }
}

function Field({ label, value, mono = false }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', padding: '10px 12px', minWidth: 0 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, overflowWrap: 'anywhere', fontFamily: mono ? 'monospace' : undefined }}>{valueText(value)}</div>
    </div>
  )
}

function FullModal({ type, row, onClose }) {
  if (!row) return null
  const details = safeJson(row.details || row.metadata)
  const title = type === 'admin'
    ? `${row.action || 'Audit'} - ${row.entity || 'entity'} ${row.entity_id ? `#${row.entity_id}` : ''}`
    : `${row.auth_event || row.status || 'Login event'} - ${row.user_name || 'Unknown user'}`

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1600, background: 'rgba(15,23,42,.46)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 22 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(980px, 96vw)', maxHeight: '90vh', overflow: 'hidden', background: 'var(--surface)', borderRadius: 14, boxShadow: '0 24px 60px rgba(15,23,42,.28)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>
              {type === 'admin' ? 'Admin Audit Trail Details' : 'Login Audit Trail Details'}
            </div>
            <h2 style={{ margin: 0, fontSize: 20, color: 'var(--text-primary)' }}>{title}</h2>
          </div>
          <button onClick={onClose} style={{ padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text-primary)', cursor: 'pointer' }}>Close</button>
        </div>

        <div style={{ padding: 20, overflow: 'auto' }}>
          {type === 'admin' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 16 }}>
              <Field label="Timestamp" value={fmtDateIST(row.created_at)} />
              <Field label="User" value={row.user_name} />
              <Field label="Action" value={row.action} />
              <Field label="Entity" value={row.entity} />
              <Field label="Entity ID" value={row.entity_id} mono />
              <Field label="User ID" value={row.user_id} mono />
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 16 }}>
              <Field label="User" value={row.user_name} />
              <Field label="Role" value={row.role} />
              <Field label="Status" value={row.status} />
              <Field label="Auth Event" value={row.auth_event} />
              <Field label="Login Time" value={fmtDateIST(row.login_time)} />
              <Field label="Logout Time" value={fmtDateIST(row.logout_time)} />
            </div>
          )}

          {type === 'login' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 16 }}>
              <Field label="Failure Reason" value={row.fail_reason} />
              <Field label="IP Address" value={row.ip_address} mono />
              <Field label="Location" value={row.location} />
            </div>
          )}

          {type === 'admin' && (row.before_value || row.after_value || row.change_reason) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 16 }}>
              <Field label="Before Value" value={row.before_value} />
              <Field label="After Value" value={row.after_value} />
              <Field label="Change Reason" value={row.change_reason} />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ padding: 12, background: 'var(--bg)', borderRight: '1px solid var(--border)', fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Field</div>
            <div style={{ padding: 12, background: 'var(--bg)', fontSize: 12, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Value</div>
            {Object.entries(details).length === 0 ? (
              <>
                <div style={{ padding: 12, borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>Details</div>
                <div style={{ padding: 12, borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>No detailed payload recorded.</div>
              </>
            ) : Object.entries(details).map(([key, value]) => (
              <div key={key} style={{ display: 'contents' }}>
                <div style={{ padding: 12, borderTop: '1px solid var(--border)', color: 'var(--text-secondary)', fontWeight: 600, overflowWrap: 'anywhere' }}>{key}</div>
                <pre style={{ margin: 0, padding: 12, borderTop: '1px solid var(--border)', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12, fontFamily: 'monospace' }}>{valueText(value)}</pre>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ViewData({ selectedItem = 'admin', onSelect }) {
  const { token } = useAuth()
  const [activeView, setActiveView] = useState(selectedItem || 'admin')
  const [adminRows, setAdminRows] = useState([])
  const [loginRows, setLoginRows] = useState([])
  const [adminFilter, setAdminFilter] = useState({ from: '', to: '', user: '', action: '', search: '' })
  const [loginFilter, setLoginFilter] = useState({ from: '', to: '', user: '', status: '', search: '' })
  const [adminPage, setAdminPage] = useState(1)
  const [loginPage, setLoginPage] = useState(1)
  const [adminPageSize, setAdminPageSize] = useState(20)
  const [loginPageSize, setLoginPageSize] = useState(20)
  const [adminMeta, setAdminMeta] = useState({ total: 0, total_pages: 1 })
  const [loginMeta, setLoginMeta] = useState({ total: 0, total_pages: 1 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)

  const H = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])
  const activeOption = VIEW_OPTIONS.find(option => option.key === activeView) || VIEW_OPTIONS[0]
  const rows = activeView === 'admin' ? adminRows : loginRows
  const meta = activeView === 'admin' ? adminMeta : loginMeta
  const page = activeView === 'admin' ? adminPage : loginPage
  const pageSize = activeView === 'admin' ? adminPageSize : loginPageSize
  const truncateCellStyle = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }

  useEffect(() => {
    if (selectedItem) setActiveView(selectedItem)
  }, [selectedItem])

  function selectView(nextView) {
    setActiveView(nextView)
    onSelect?.(nextView)
  }

  useEffect(() => {
    if (activeView === 'admin' && adminRows.length === 0) {
      loadAdmin(1, adminFilter, adminPageSize)
      return
    }
    if (activeView === 'login' && loginRows.length === 0) {
      loadLogin(1, loginFilter, loginPageSize)
    }
  }, [activeView, token]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchRows(path, params) {
    const qs = new URLSearchParams(params)
    for (const [key, value] of [...qs.entries()]) if (!value) qs.delete(key)
    const res = await httpFetch(`${path}?${qs}`, { headers: H })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to load audit data.')
    return data
  }

  async function loadAdmin(nextPage = adminPage, nextFilter = adminFilter, nextPageSize = adminPageSize) {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const data = await fetchRows('/api/admin/audit-logs', { ...nextFilter, page: nextPage, page_size: nextPageSize })
      setAdminRows(data.logs || [])
      setAdminMeta({ total: data.total || (data.logs || []).length, total_pages: data.total_pages || 1 })
      setAdminPage(data.page || nextPage)
    } catch (err) {
      setError(err.message || 'Failed to load admin audit trail.')
    } finally {
      setLoading(false)
    }
  }

  async function loadLogin(nextPage = loginPage, nextFilter = loginFilter, nextPageSize = loginPageSize) {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const data = await fetchRows('/api/admin/login-audit', { ...nextFilter, page: nextPage, page_size: nextPageSize })
      setLoginRows(data.logs || [])
      setLoginMeta({ total: data.total || (data.logs || []).length, total_pages: data.total_pages || 1 })
      setLoginPage(data.page || nextPage)
    } catch (err) {
      setError(err.message || 'Failed to load login audit trail.')
    } finally {
      setLoading(false)
    }
  }

  function refine() {
    if (activeView === 'admin') loadAdmin(1, adminFilter, pageSize)
    else loadLogin(1, loginFilter, pageSize)
  }

  function resetFilters() {
    if (activeView === 'admin') {
      const next = { from: '', to: '', user: '', action: '', search: '' }
      setAdminFilter(next)
      loadAdmin(1, next, pageSize)
    } else {
      const next = { from: '', to: '', user: '', status: '', search: '' }
      setLoginFilter(next)
      loadLogin(1, next, pageSize)
    }
  }

  function changePage(nextPage) {
    if (activeView === 'admin') loadAdmin(nextPage, adminFilter, pageSize)
    else loadLogin(nextPage, loginFilter, pageSize)
  }

  function changePageSize(nextPageSize) {
    if (activeView === 'admin') {
      setAdminPageSize(nextPageSize)
      loadAdmin(1, adminFilter, nextPageSize)
      return
    }
    setLoginPageSize(nextPageSize)
    loadLogin(1, loginFilter, nextPageSize)
  }

  const embeddedView = activeView === 'case'
    ? <CaseAuditTrailPage embedded />
    : activeView === 'cm'
      ? <CMAuditTrailPage embedded />
      : activeView === 'transmission'
        ? <TransmissionAuditTrailPage embedded />
        : null

  const start = Math.max(1, page - 2)
  const end = Math.min(meta.total_pages || 1, page + 2)
  const pages = []
  for (let i = start; i <= end; i++) pages.push(i)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '250px minmax(0, 1fr)', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
      <aside style={{ borderRight: '1px solid var(--border)', background: 'var(--surface)', padding: 18, overflow: 'auto' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>System / View Data</div>
        <h2 style={{ margin: '0 0 14px', fontSize: 18, color: 'var(--text-primary)' }}>Audit Trails</h2>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>Select audit trail</label>
        <select value={activeView} onChange={e => selectView(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text-primary)', marginBottom: 12 }}>
          {VIEW_OPTIONS.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
        </select>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {VIEW_OPTIONS.map(option => (
            <button key={option.key} onClick={() => selectView(option.key)} style={{ textAlign: 'left', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 9, background: activeView === option.key ? '#eef2ff' : 'var(--surface)', color: 'var(--text-primary)', cursor: 'pointer' }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{option.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{option.description}</div>
            </button>
          ))}
        </div>
      </aside>

      <section style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {embeddedView ? (
          <>
            <div style={{ padding: '16px 20px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 4 }}>View Data</div>
                <h1 style={{ margin: 0, fontSize: 20, color: 'var(--text-primary)' }}>{activeOption.label}</h1>
                <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>{activeOption.description}.</p>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {embeddedView}
            </div>
          </>
        ) : (
          <>
        <div style={{ padding: '16px 20px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 4 }}>View Data</div>
            <h1 style={{ margin: 0, fontSize: 20, color: 'var(--text-primary)' }}>{activeOption.label}</h1>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 13 }}>{activeOption.description}. Read-only audit data with full row details.</p>
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', background: 'var(--bg)', minWidth: 130 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Total Records</div>
            <div style={{ fontSize: 22, color: 'var(--text-primary)', fontWeight: 800 }}>{meta.total || 0}</div>
          </div>
        </div>

        <div style={{ padding: '12px 20px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="date" value={activeView === 'admin' ? adminFilter.from : loginFilter.from} onChange={e => activeView === 'admin' ? setAdminFilter(f => ({ ...f, from: e.target.value })) : setLoginFilter(f => ({ ...f, from: e.target.value }))} style={{ padding: '7px 9px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)' }} />
          <input type="date" value={activeView === 'admin' ? adminFilter.to : loginFilter.to} onChange={e => activeView === 'admin' ? setAdminFilter(f => ({ ...f, to: e.target.value })) : setLoginFilter(f => ({ ...f, to: e.target.value }))} style={{ padding: '7px 9px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)' }} />
          <input placeholder="User" value={activeView === 'admin' ? adminFilter.user : loginFilter.user} onChange={e => activeView === 'admin' ? setAdminFilter(f => ({ ...f, user: e.target.value })) : setLoginFilter(f => ({ ...f, user: e.target.value }))} style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, minWidth: 150, background: 'var(--surface)' }} />
          {activeView === 'admin' ? (
            <select value={adminFilter.action} onChange={e => setAdminFilter(f => ({ ...f, action: e.target.value }))} style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)' }}>
              <option value="">All Actions</option>
              {ACTIONS.map(action => <option key={action} value={action}>{action}</option>)}
            </select>
          ) : (
            <select value={loginFilter.status} onChange={e => setLoginFilter(f => ({ ...f, status: e.target.value }))} style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)' }}>
              <option value="">All Statuses</option>
              {LOGIN_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
            </select>
          )}
          <input placeholder="Search" value={activeView === 'admin' ? adminFilter.search : loginFilter.search} onChange={e => activeView === 'admin' ? setAdminFilter(f => ({ ...f, search: e.target.value })) : setLoginFilter(f => ({ ...f, search: e.target.value }))} style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, minWidth: 220, background: 'var(--surface)' }} />
          <button onClick={refine} style={{ padding: '7px 18px', border: 'none', borderRadius: 7, background: 'var(--primary)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Refine</button>
          <button onClick={resetFilters} style={{ padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)', color: 'var(--text-primary)', cursor: 'pointer' }}>Reset</button>
        </div>

        {error && <div style={{ margin: '12px 20px 0', padding: '10px 12px', background: '#fee2e2', color: '#b91c1c', borderRadius: 8, fontSize: 13 }}>{error}</div>}

        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading audit data...</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 34, color: 'var(--text-muted)', textAlign: 'center' }}>No audit records found for the selected filters.</div>
          ) : activeView === 'admin' ? (
            <VirtualizedTable
              rows={adminRows}
              colSpan={6}
              rowHeight={68}
              minWidth={1050}
              tableStyle={{ tableLayout: 'fixed' }}
              header={<thead><tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>{['Timestamp', 'User', 'Action', 'Entity', 'Summary', 'Details'].map(h => <th key={h} style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-secondary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>)}</tr></thead>}
              renderRow={(row, index) => {
                const details = safeJson(row.details)
                const summary = details.from_status ? `${details.from_status} -> ${details.to_status}` : Object.entries(details).slice(0, 2).map(([k, v]) => `${k}: ${valueText(v)}`).join(' | ') || '-'
                return (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--border)', background: index % 2 === 0 ? 'var(--surface)' : 'var(--bg)' }}>
                    <td style={{ padding: '10px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDateIST(row.created_at)}</td>
                    <td title={row.user_name || '-'} style={{ padding: '10px 12px', color: 'var(--text-primary)', ...truncateCellStyle }}>{row.user_name || '-'}</td>
                    <td style={{ padding: '10px 12px' }}><span style={{ padding: '2px 9px', borderRadius: 12, background: '#eef2ff', color: '#3730a3', fontSize: 11, fontWeight: 800 }}>{row.action || '-'}</span></td>
                    <td title={`${row.entity || '-'} ${row.entity_id ? `#${row.entity_id}` : ''}`.trim()} style={{ padding: '10px 12px', color: 'var(--text-primary)', ...truncateCellStyle }}>{row.entity || '-'} {row.entity_id ? `#${row.entity_id}` : ''}</td>
                    <td title={summary} style={{ padding: '10px 12px', color: 'var(--text-muted)', ...truncateCellStyle }}>{summary}</td>
                    <td style={{ padding: '10px 12px' }}><button onClick={() => setSelected({ type: 'admin', row })} style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', cursor: 'pointer' }}>Open</button></td>
                  </tr>
                )
              }}
            />
          ) : (
            <VirtualizedTable
              rows={loginRows}
              colSpan={8}
              rowHeight={60}
              minWidth={1050}
              tableStyle={{ tableLayout: 'fixed' }}
              header={<thead><tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>{['User', 'Role', 'Status', 'Event', 'Login Time', 'Logout Time', 'Reason', 'Details'].map(h => <th key={h} style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-secondary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>)}</tr></thead>}
              renderRow={(row, index) => {
                const sc = statusColor(row.status)
                return (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--border)', background: index % 2 === 0 ? 'var(--surface)' : 'var(--bg)' }}>
                    <td title={row.user_name || '-'} style={{ padding: '10px 12px', color: 'var(--text-primary)', ...truncateCellStyle }}>{row.user_name || '-'}</td>
                    <td title={row.role || '-'} style={{ padding: '10px 12px', color: 'var(--text-secondary)', ...truncateCellStyle }}>{row.role || '-'}</td>
                    <td style={{ padding: '10px 12px' }}><span style={{ padding: '2px 9px', borderRadius: 12, background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 800 }}>{row.status || '-'}</span></td>
                    <td title={row.auth_event || '-'} style={{ padding: '10px 12px', color: 'var(--text-primary)', ...truncateCellStyle }}>{row.auth_event || '-'}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDateIST(row.login_time)}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDateIST(row.logout_time)}</td>
                    <td title={row.fail_reason || '-'} style={{ padding: '10px 12px', color: 'var(--text-muted)', ...truncateCellStyle }}>{row.fail_reason || '-'}</td>
                    <td style={{ padding: '10px 12px' }}><button onClick={() => setSelected({ type: 'login', row })} style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', cursor: 'pointer' }}>Open</button></td>
                  </tr>
                )
              }}
            />
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Rows per page:</span>
          {[10, 20, 50].map(size => <button key={size} onClick={() => changePageSize(size)} style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 4, background: pageSize === size ? 'var(--primary)' : 'var(--surface)', color: pageSize === size ? '#fff' : 'var(--text-primary)', cursor: 'pointer' }}>{size}</button>)}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
            <button onClick={() => changePage(1)} disabled={page <= 1} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, opacity: page <= 1 ? .4 : 1 }}>First</button>
            <button onClick={() => changePage(page - 1)} disabled={page <= 1} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, opacity: page <= 1 ? .4 : 1 }}>Prev</button>
            {pages.map(p => <button key={p} onClick={() => changePage(p)} style={{ padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 4, background: page === p ? 'var(--primary)' : 'var(--surface)', color: page === p ? '#fff' : 'var(--text-primary)', cursor: 'pointer' }}>{p}</button>)}
            <button onClick={() => changePage(page + 1)} disabled={page >= meta.total_pages} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, opacity: page >= meta.total_pages ? .4 : 1 }}>Next</button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>Page {page} of {meta.total_pages || 1}</span>
          </div>
        </div>
          </>
        )}
      </section>

      <FullModal type={selected?.type} row={selected?.row} onClose={() => setSelected(null)} />
    </div>
  )
}
