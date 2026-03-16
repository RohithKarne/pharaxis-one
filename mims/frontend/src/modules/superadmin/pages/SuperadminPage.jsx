import { useState, useEffect, useCallback } from 'react'
import Sidebar from '../components/Sidebar'
import Topbar from '../../../shared/components/Topbar'
import { useAuth } from '../../../shared/context/AuthContext'

const MODULES = [
  { key: 'mims_core', label: 'MIMS' },
  { key: 'admin_console', label: 'Admin Console' },
  { key: 'content_mgmt', label: 'Content Management' },
  { key: 'data_visualization', label: 'Data Visualization' },
]

const PAGE_TITLES = {
  'module-access': 'Module Access',
  'audit': 'Audit Trail',
  'login-audit': 'Login Audit',
}

export default function SuperadminPage() {
  const [activePage, setActivePage] = useState('module-access')
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem('mims_sidebar_collapsed') === 'true'
  )
  const [theme, setThemeState] = useState(() =>
    localStorage.getItem('mims_theme') || 'light'
  )
  const [msg, setMsg] = useState({ text: '', type: '' })

  const { token } = useAuth()
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('mims_theme', theme)
  }, [theme])

  function flash(text, type = 'success') {
    setMsg({ text, type })
    setTimeout(() => setMsg({ text: '', type: '' }), 4000)
  }

  function toggleSidebar() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem('mims_sidebar_collapsed', next)
  }

  return (
    <div className="app-wrapper">
      <Sidebar
        collapsed={collapsed}
        onCollapse={toggleSidebar}
        theme={theme}
        setTheme={setThemeState}
        activePage={activePage}
        onNavigate={setActivePage}
      />
      <div className="main-content">
        <Topbar title={`Superadmin Console — ${PAGE_TITLES[activePage]}`} onToggleSidebar={toggleSidebar} />
        <main className="page-content">
          {msg.text && (
            <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`} style={{ display: 'block', marginBottom: 12 }}>
              {msg.text}
            </div>
          )}
          {activePage === 'module-access' && <ModuleAccessView H={H} flash={flash} />}
          {activePage === 'audit'         && <AuditView H={H} endpoint="/api/superadmin/audit" />}
          {activePage === 'login-audit'   && <LoginAuditView H={H} />}
        </main>
      </div>
    </div>
  )
}

/* ── Module Access View ─────────────────────────────────────────────────── */
function ModuleAccessView({ H, flash }) {
  const [users, setUsers] = useState([])
  const [moduleMap, setModuleMap] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadUsers() }, [])

  async function loadUsers() {
    setLoading(true)
    try {
      const res = await fetch('/api/superadmin/users', { headers: H })
      const data = await res.json()
      if (!res.ok) return flash(data.error || 'Failed to load users.', 'error')
      setUsers(data.users || [])
      const map = {}
      ;(data.users || []).forEach(u => { map[u.id] = new Set(u.modules || []) })
      setModuleMap(map)
    } catch {
      flash('Server unreachable. Please restart the backend.', 'error')
    } finally {
      setLoading(false)
    }
  }

  function toggleModule(userId, mod) {
    setModuleMap(prev => {
      const next = { ...prev }
      const set = new Set(next[userId] || [])
      if (set.has(mod)) set.delete(mod)
      else set.add(mod)
      next[userId] = set
      return next
    })
  }

  async function saveModules(userId) {
    const modules = Array.from(moduleMap[userId] || [])
    const res = await fetch(`/api/superadmin/users/${userId}/modules`, {
      method: 'PUT', headers: H, body: JSON.stringify({ modules })
    })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to save modules.', 'error')
    flash('Module access updated.')
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h3>Scope</h3></div>
        <div className="card-body" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Superadmin assigns module access per user. Access is based on these assignments.
        </div>
      </div>
      <div className="card">
        <div className="card-header"><h3>User Module Access</h3></div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                {MODULES.map(m => <th key={m.key}>{m.label}</th>)}
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={MODULES.length + 3} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>Loading…</td></tr>
              )}
              {!loading && users.length === 0 && (
                <tr><td colSpan={MODULES.length + 3} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No users found.</td></tr>
              )}
              {users.map(u => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.name}</strong>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.email}</div>
                  </td>
                  <td style={{ fontSize: 12 }}>{u.role}</td>
                  {MODULES.map(m => {
                    const checked = (moduleMap[u.id] || new Set()).has(m.key)
                    return (
                      <td key={m.key} style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleModule(u.id, m.key)}
                        />
                      </td>
                    )
                  })}
                  <td>
                    <button className="btn btn-primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => saveModules(u.id)}>
                      Save
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

/* ── Audit Trail View ───────────────────────────────────────────────────── */
function AuditView({ H, endpoint }) {
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const LIMIT = 50

  const load = useCallback(async (off = 0) => {
    setLoading(true)
    try {
      const res = await fetch(`${endpoint}?limit=${LIMIT}&offset=${off}`, { headers: H })
      const data = await res.json()
      setLogs(data.logs || [])
      setTotal(data.total || 0)
      setOffset(off)
    } finally {
      setLoading(false)
    }
  }, [endpoint])

  useEffect(() => { load(0) }, [load])

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Audit Trail</h3>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{total} record{total !== 1 ? 's' : ''}</span>
      </div>
      <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>User</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>Loading…</td></tr>
            )}
            {!loading && logs.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No audit records found.</td></tr>
            )}
            {logs.map(log => (
              <tr key={log.id}>
                <td style={{ fontSize: 11, whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{log.created_at}</td>
                <td>
                  <div style={{ fontSize: 12 }}>{log.user_name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>ID {log.user_id}</div>
                </td>
                <td><span className="badge">{log.action}</span></td>
                <td style={{ fontSize: 12 }}>{log.entity}{log.entity_id ? ` #${log.entity_id}` : ''}</td>
                <td style={{ fontSize: 11, maxWidth: 300, wordBreak: 'break-all' }}>
                  {log.details ? (typeof log.details === 'object' ? JSON.stringify(log.details) : log.details) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > LIMIT && (
        <div style={{ padding: '10px 16px', display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-secondary" style={{ fontSize: 12 }} disabled={offset === 0} onClick={() => load(offset - LIMIT)}>← Prev</button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
            {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
          </span>
          <button className="btn btn-secondary" style={{ fontSize: 12 }} disabled={offset + LIMIT >= total} onClick={() => load(offset + LIMIT)}>Next →</button>
        </div>
      )}
    </div>
  )
}

/* ── Login Audit View ───────────────────────────────────────────────────── */
function LoginAuditView({ H }) {
  const [logs, setLogs] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const LIMIT = 50

  const load = useCallback(async (off = 0, status = statusFilter) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: LIMIT, offset: off })
      if (status) params.set('status', status)
      const res = await fetch(`/api/superadmin/login-audit?${params}`, { headers: H })
      const data = await res.json()
      setLogs(data.logs || [])
      setTotal(data.total || 0)
      setOffset(off)
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { load(0) }, [load])

  function handleStatusChange(e) {
    setStatusFilter(e.target.value)
    load(0, e.target.value)
  }

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Login Audit</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{total} record{total !== 1 ? 's' : ''}</span>
          <select
            value={statusFilter}
            onChange={handleStatusChange}
            style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text)' }}
          >
            <option value="">All</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>
      <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Login Time</th>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Fail Reason</th>
              <th>Logout Time</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>Loading…</td></tr>
            )}
            {!loading && logs.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No login records found.</td></tr>
            )}
            {logs.map(log => (
              <tr key={log.id}>
                <td style={{ fontSize: 11, whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{log.login_time}</td>
                <td>
                  <div style={{ fontSize: 12 }}>{log.user_name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>ID {log.user_id}</div>
                </td>
                <td style={{ fontSize: 12 }}>{log.role || '—'}</td>
                <td>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 500,
                    background: log.status === 'success' ? 'var(--success-bg, #d4edda)' : 'var(--error-bg, #f8d7da)',
                    color: log.status === 'success' ? 'var(--success, #155724)' : 'var(--error, #721c24)',
                  }}>
                    {log.status}
                  </span>
                </td>
                <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{log.fail_reason || '—'}</td>
                <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{log.logout_time || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > LIMIT && (
        <div style={{ padding: '10px 16px', display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-secondary" style={{ fontSize: 12 }} disabled={offset === 0} onClick={() => load(offset - LIMIT)}>← Prev</button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
            {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
          </span>
          <button className="btn btn-secondary" style={{ fontSize: 12 }} disabled={offset + LIMIT >= total} onClick={() => load(offset + LIMIT)}>Next →</button>
        </div>
      )}
    </div>
  )
}
