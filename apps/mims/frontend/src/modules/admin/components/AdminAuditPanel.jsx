import { useState, useEffect } from 'react'
import { SectionHeader, fmtDateIST, exportCSV } from './AdminShared'

function parseDetails(raw) {
  if (!raw) return {}
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw } catch { return { raw } }
}

function DiffRow({ label, before, after }) {
  if (before == null && after == null) return null
  const changed = String(before ?? '') !== String(after ?? '')
  return (
    <div style={{ display:'grid', gridTemplateColumns:'120px 1fr 1fr', gap:6, padding:'5px 0', borderBottom:'1px solid #f1f5f9', fontSize:12 }}>
      <span style={{ color:'#64748b', fontWeight:600 }}>{label}</span>
      <span style={{ color: changed ? '#dc2626' : '#64748b', background: changed ? '#fee2e2' : 'transparent', padding:'1px 5px', borderRadius:4 }}>
        {before != null ? String(before) : '—'}
      </span>
      <span style={{ color: changed ? '#15803d' : '#64748b', background: changed ? '#dcfce7' : 'transparent', padding:'1px 5px', borderRadius:4 }}>
        {after != null ? String(after) : '—'}
      </span>
    </div>
  )
}

function AuditDiffModal({ entry, onClose }) {
  if (!entry) return null
  const d = parseDetails(entry.details)
  const pairs = Object.entries(d).filter(([k]) => !['entity_id','case_id','run_id'].includes(k))
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,.4)', zIndex:400, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }} onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:12, width:'100%', maxWidth:560, maxHeight:'80vh', display:'flex', flexDirection:'column', boxShadow:'0 8px 30px rgba(0,0,0,.15)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 18px', borderBottom:'1px solid #e2e8f0' }}>
          <span style={{ fontWeight:700, fontSize:14, color:'#0f172a' }}>{entry.action} — {entry.entity} #{entry.entity_id}</span>
          <button onClick={onClose} style={{ background:'#f1f5f9', border:'none', borderRadius:6, width:28, height:28, cursor:'pointer', fontSize:14, color:'#64748b' }}>✕</button>
        </div>
        <div style={{ padding:16, overflowY:'auto', flex:1, display:'flex', flexDirection:'column', gap:8 }}>
          <div style={{ display:'grid', gridTemplateColumns:'120px 1fr 1fr', gap:6, padding:'4px 0' }}>
            <span style={{ fontSize:11, fontWeight:700, color:'#94a3b8', textTransform:'uppercase' }}>Field</span>
            <span style={{ fontSize:11, fontWeight:700, color:'#dc2626', textTransform:'uppercase' }}>Before</span>
            <span style={{ fontSize:11, fontWeight:700, color:'#15803d', textTransform:'uppercase' }}>After</span>
          </div>
          {pairs.map(([k, v]) => {
            if (k === 'from_status' || k === 'to_status') return null
            if (typeof v === 'object') return <DiffRow key={k} label={k} before={JSON.stringify(v)} after={null} />
            return <DiffRow key={k} label={k} before={null} after={v} />
          })}
          {d.from_status && <DiffRow label="status" before={d.from_status} after={d.to_status} />}
          {pairs.length === 0 && <div style={{ color:'#94a3b8', fontSize:13 }}>No change details recorded.</div>}
        </div>
        <div style={{ padding:'10px 18px', borderTop:'1px solid #e2e8f0', fontSize:11, color:'#94a3b8' }}>
          By {entry.user_name} at {fmtDateIST(entry.created_at)}
        </div>
      </div>
    </div>
  )
}

export default function AdminAuditPanel({ contentSection, H, flash }) {
  const [auditLogs, setAuditLogs] = useState([])
  const [auditFilter, setAuditFilter] = useState({ from: '', to: '', user: '', action: '', entity: '', entity_id: '' })
  const [loginAudit, setLoginAudit] = useState([])
  const [loginFilter, setLoginFilter] = useState({ from: '', to: '', user: '' })
  const [diffEntry, setDiffEntry] = useState(null)

  useEffect(() => {
    if (contentSection === 'audit-admin') loadAuditLogs()
    if (contentSection === 'audit-login') loadLoginAudit()
  }, [contentSection]) // eslint-disable-line

  async function loadAuditLogs() {
    const params = new URLSearchParams(auditFilter).toString()
    const d = await fetch(`/api/admin/audit-logs?${params}`, { headers: H }).then(r => r.json())
    setAuditLogs(d.logs || [])
  }

  async function loadAll() {
    try {
      const a = await fetch('/api/admin/audit-logs', { headers: H }).then(r => r.json()).catch(() => ({ logs: [] }))
      setAuditLogs(a.logs || [])
    } catch { flash('Failed to load audit data.', 'error') }
  }

  async function loadLoginAudit() {
    const params = new URLSearchParams(loginFilter).toString()
    const d = await fetch(`/api/admin/login-audit?${params}`, { headers: H }).then(r => r.json())
    setLoginAudit(d.logs || [])
  }

  if (contentSection === 'audit-admin') {
    return (
      <>
        <SectionHeader title="Admin Audit Trail" desc="21 CFR Part 11 — all system changes. Read-only." onExport exportData={auditLogs} exportFile="admin-audit.csv" />
        <div className="card" style={{ marginBottom:16 }}>
          <div className="card-header"><h3>Filter</h3></div>
          <div className="card-body">
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              <input className="form-control" type="date" placeholder="From" value={auditFilter.from} onChange={e => setAuditFilter(f => ({ ...f, from: e.target.value }))} style={{ maxWidth:160 }} />
              <input className="form-control" type="date" placeholder="To" value={auditFilter.to} onChange={e => setAuditFilter(f => ({ ...f, to: e.target.value }))} style={{ maxWidth:160 }} />
              <input className="form-control" placeholder="User name" value={auditFilter.user} onChange={e => setAuditFilter(f => ({ ...f, user: e.target.value }))} style={{ maxWidth:160 }} />
              <input className="form-control" placeholder="Entity (e.g., case)" value={auditFilter.entity} onChange={e => setAuditFilter(f => ({ ...f, entity: e.target.value }))} style={{ maxWidth:160 }} />
              <input className="form-control" placeholder="Entity ID" value={auditFilter.entity_id} onChange={e => setAuditFilter(f => ({ ...f, entity_id: e.target.value }))} style={{ maxWidth:120 }} />
              <select className="form-control" value={auditFilter.action} onChange={e => setAuditFilter(f => ({ ...f, action: e.target.value }))} style={{ maxWidth:140 }}>
                <option value="">All Actions</option>
                <option value="CREATE">CREATE</option>
                <option value="UPDATE">UPDATE</option>
                <option value="DELETE">DELETE</option>
              </select>
              <button className="btn btn-primary" onClick={loadAuditLogs} style={{ fontSize:12 }}>Search</button>
              <button className="btn btn-outline" onClick={() => { setAuditFilter({ from:'', to:'', user:'', action:'', entity:'', entity_id:'' }); loadAll() }} style={{ fontSize:12 }}>Clear</button>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><h3>System Audit Log ({auditLogs.length} entries)</h3></div>
          <div className="card-body" style={{ padding:0 }}>
            <table className="admin-table">
              <thead><tr><th>Timestamp (IST)</th><th>User</th><th>Action</th><th>Entity</th><th>Summary</th><th></th></tr></thead>
              <tbody>
                {auditLogs.length === 0 && <tr><td colSpan={6} style={{ textAlign:'center', color:'var(--text-muted)', padding:24 }}>No entries. Use filters above and click Search.</td></tr>}
                {auditLogs.map(l => {
                  const d = parseDetails(l.details)
                  const summary = d.from_status ? `${d.from_status} → ${d.to_status}` : Object.entries(d).slice(0,2).map(([k,v])=>`${k}: ${v}`).join(' | ') || '—'
                  return (
                    <tr key={l.id}>
                      <td style={{ color:'var(--text-muted)', whiteSpace:'nowrap', fontSize:11 }}>{fmtDateIST(l.created_at)}</td>
                      <td style={{ fontSize:12 }}>{l.user_name}</td>
                      <td><span className="badge badge-new">{l.action}</span></td>
                      <td style={{ fontSize:12 }}>{l.entity} #{l.entity_id}</td>
                      <td style={{ color:'var(--text-muted)', fontSize:11 }}>{summary}</td>
                      <td><button className="btn btn-outline" style={{ fontSize:11, padding:'3px 8px' }} onClick={() => setDiffEntry(l)}>Diff</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        <AuditDiffModal entry={diffEntry} onClose={() => setDiffEntry(null)} />
      </>
    )
  }

  return (
    <>
      <SectionHeader title="Login Audit Trail" desc="21 CFR Part 11 — all login and logout events. Read-only." onExport exportData={loginAudit} exportFile="login-audit.csv" />
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h3>Account Lockout Settings</h3></div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Failed Attempts Threshold</label>
              <input className="form-control" type="number" min={1} max={20} defaultValue={5} id="lockout-threshold" style={{ maxWidth: 100 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Lockout Duration (minutes)</label>
              <input className="form-control" type="number" min={1} max={1440} defaultValue={30} id="lockout-minutes" style={{ maxWidth: 100 }} />
            </div>
            <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={async () => {
              const threshold = document.getElementById('lockout-threshold')?.value || 5
              const minutes = document.getElementById('lockout-minutes')?.value || 30
              await Promise.all([
                fetch('/api/admin/system-config', { method: 'POST', headers: H, body: JSON.stringify({ key: 'login_lockout_threshold', value: String(threshold) }) }).catch(() => {}),
                fetch('/api/admin/system-config', { method: 'POST', headers: H, body: JSON.stringify({ key: 'login_lockout_minutes', value: String(minutes) }) }).catch(() => {})
              ])
              flash('Lockout settings saved.')
            }}>Save Lockout Settings</button>
          </div>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h3>Filter</h3></div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: 10 }}>
            <input className="form-control" type="date" value={loginFilter.from} onChange={e => setLoginFilter(f => ({ ...f, from: e.target.value }))} style={{ maxWidth: 160 }} />
            <input className="form-control" type="date" value={loginFilter.to} onChange={e => setLoginFilter(f => ({ ...f, to: e.target.value }))} style={{ maxWidth: 160 }} />
            <input className="form-control" placeholder="User" value={loginFilter.user} onChange={e => setLoginFilter(f => ({ ...f, user: e.target.value }))} style={{ maxWidth: 160 }} />
            <button className="btn btn-primary" onClick={loadLoginAudit} style={{ fontSize: 12 }}>Search</button>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-header"><h3>Login History ({loginAudit.length} entries)</h3></div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="admin-table">
            <thead><tr><th>User</th><th>Role</th><th>Login Time</th><th>Logout Time</th><th>Status</th><th>Reason</th><th>Actions</th></tr></thead>
            <tbody>
              {loginAudit.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No login records yet. Click Search to load.</td></tr>}
              {loginAudit.map(l => (
                <tr key={l.id}>
                  <td>{l.user_name}</td>
                  <td style={{ fontSize: 11 }}>{l.role}</td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.login_time}</td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.logout_time || '—'}</td>
                  <td><span className={`status-pill ${l.status === 'success' ? 'active' : 'inactive'}`}>{l.status}</span></td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.fail_reason || l.auth_event || '—'}</td>
                  <td>
                    {l.status === 'failed' && l.user_id && (
                      <button className="btn btn-outline" style={{ fontSize: 11, padding: '2px 8px' }} onClick={async () => {
                        const res = await fetch('/api/auth/unlock-user', { method: 'POST', headers: H, body: JSON.stringify({ user_id: l.user_id }) })
                        const d = await res.json()
                        flash(res.ok ? 'Account unlocked.' : (d.error || 'Unlock failed.'), res.ok ? 'success' : 'error')
                      }}>🔓 Unlock</button>
                    )}
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
