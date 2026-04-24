import { useState, useEffect, useRef } from 'react'

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

function SectionHeader({ title, desc, onExport, exportData, exportFile }) {
  return (
    <div className="admin-section-header">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2>{title}</h2>
          {desc && <p>{desc}</p>}
        </div>
        {onExport && <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => exportCSV(exportData, exportFile)}>⬇ Export CSV</button>}
      </div>
    </div>
  )
}

function StatusPill({ active }) {
  return <span className={`status-pill ${active ? 'active' : 'inactive'}`}>{active ? 'Active' : 'Inactive'}</span>
}

function exportCSV(data, filename) {
  if (!data.length) return
  const keys = Object.keys(data[0])
  const csv = [keys.join(','), ...data.map(row => keys.map(k => `"${String(row[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click()
}

// S19-P1: AuditAdminPanel — before/after diff view + per-case audit lookup
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

function AuditAdminPanel({ auditLogs, auditFilter, setAuditFilter, loadAuditLogs, loadAll, H, flash }) {
  const [diffEntry,   setDiffEntry]   = useState(null)
  const [caseId,      setCaseId]      = useState('')
  const [caseEntries, setCaseEntries] = useState(null)
  const [caseLoading, setCaseLoading] = useState(false)

  async function loadCaseAudit() {
    if (!caseId.trim()) return
    setCaseLoading(true)
    try {
      const res  = await fetch(`/api/admin/case-audit-trail/${caseId.trim()}?limit=200`, { headers: H })
      const data = await res.json()
      setCaseEntries(res.ok ? (data.entries || []) : null)
      if (!res.ok) flash(data.error || 'Failed to load case audit trail.', 'error')
    } catch { flash('Network error.', 'error') }
    finally { setCaseLoading(false) }
  }

  function exportCaseAuditCsv() {
    if (!caseEntries?.length) return
    const header = 'id,case_id,user_name,action_type,field_name,old_value,new_value,timestamp'
    const rows = caseEntries.map(e => [
      e.id, e.case_id,
      `"${(e.user_name||'').replace(/"/g,'""')}"`,
      e.action_type, e.field_name || '',
      `"${String(e.old_value||'').replace(/"/g,'""')}"`,
      `"${String(e.new_value||'').replace(/"/g,'""')}"`,
      e.timestamp
    ].join(','))
    const csv = [header, ...rows].join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv' }))
    a.download = `case-${caseId}-audit.csv`; a.click()
  }

  return (
    <>
      <SectionHeader title="Admin Audit Trail" desc="21 CFR Part 11 — all system changes. Read-only." onExport exportData={auditLogs} exportFile="admin-audit.csv" />

      {/* Per-case field audit (case_audit_trail table) */}
      <div className="card" style={{ marginBottom:16 }}>
        <div className="card-header" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <h3>Case Field-Level Audit (F-09)</h3>
          {caseEntries && <button className="btn btn-outline" style={{ fontSize:12 }} onClick={exportCaseAuditCsv}>⬇ Export CSV</button>}
        </div>
        <div className="card-body">
          <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:caseEntries ? 16 : 0 }}>
            <input className="form-control" placeholder="Enter Case ID or Case Number" value={caseId} onChange={e => setCaseId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadCaseAudit()} style={{ maxWidth:260 }} />
            <button className="btn btn-primary" onClick={loadCaseAudit} disabled={caseLoading || !caseId.trim()} style={{ fontSize:12 }}>
              {caseLoading ? 'Loading…' : 'Load Audit Trail'}
            </button>
            {caseEntries && <button className="btn btn-outline" style={{ fontSize:12 }} onClick={() => setCaseEntries(null)}>Clear</button>}
          </div>
          {caseEntries && (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Timestamp</th><th>User</th><th>Action</th><th>Field</th>
                  <th style={{ color:'#dc2626' }}>Before</th>
                  <th style={{ color:'#15803d' }}>After</th>
                </tr>
              </thead>
              <tbody>
                {caseEntries.length === 0 && <tr><td colSpan={6} style={{ textAlign:'center', color:'var(--text-muted)', padding:24 }}>No audit entries for this case.</td></tr>}
                {caseEntries.map(e => (
                  <tr key={e.id}>
                    <td style={{ fontSize:11, color:'var(--text-muted)', whiteSpace:'nowrap' }}>{fmtDateIST(e.timestamp)}</td>
                    <td style={{ fontSize:12 }}>{e.user_name || e.user_id}</td>
                    <td><span className="badge badge-new" style={{ fontSize:10 }}>{e.action_type}</span></td>
                    <td style={{ fontSize:12, fontWeight:600 }}>{e.field_name || '—'}</td>
                    <td style={{ fontSize:12, color:'#dc2626', background:'#fff5f5', padding:'4px 8px', borderRadius:4 }}>
                      {e.old_value != null ? String(e.old_value).slice(0, 80) : '—'}
                    </td>
                    <td style={{ fontSize:12, color:'#15803d', background:'#f0fdf4', padding:'4px 8px', borderRadius:4 }}>
                      {e.new_value != null ? String(e.new_value).slice(0, 80) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* System-wide audit log */}
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
                    <td>
                      <button className="btn btn-outline" style={{ fontSize:11, padding:'3px 8px' }} onClick={() => setDiffEntry(l)}>Diff</button>
                    </td>
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

export default function AdminMiscSection({ contentSection, H, flash }) {
  const [orgs, setOrgs] = useState([])

  // Products
  const [products, setProducts] = useState([])
  const [productTab, setProductTab] = useState('products')
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [productForm, setProductForm] = useState({ trade_name: '', org_id: '' })
  const [productApprovals, setProductApprovals] = useState([])
  const [productCountryAuths, setProductCountryAuths] = useState([])
  const [approvalForm, setApprovalForm] = useState({ approval_number: '', regulatory_body: '', approval_date: '', expiry_date: '', status: 'Active' })
  const [approvalModal, setApprovalModal] = useState(null)
  const [approvalEditTarget, setApprovalEditTarget] = useState(null)
  const [countryAuthForm, setCountryAuthForm] = useState({ country: '', auth_number: '', auth_date: '', status: 'Active' })
  const [countryAuthModal, setCountryAuthModal] = useState(null)
  const [countryAuthEditTarget, setCountryAuthEditTarget] = useState(null)

  // Audit
  const [auditLogs, setAuditLogs] = useState([])
  const [auditFilter, setAuditFilter] = useState({ from: '', to: '', user: '', action: '', entity: '', entity_id: '' })
  const [loginAudit, setLoginAudit] = useState([])
  const [loginFilter, setLoginFilter] = useState({ from: '', to: '', user: '' })

  // Email
  const [currentUser, setCurrentUser] = useState(null)
  const [emailAccounts, setEmailAccounts] = useState([])
  const [emailModal, setEmailModal] = useState(null)
  const [emailEditTarget, setEmailEditTarget] = useState(null)
  const [emailForm, setEmailForm] = useState({
    org_id: '', account_name: '', provider: 'Generic', direction: 'Both',
    is_active: true, mailbox_email: '', from_email: '', display_name: '',
    is_default_outbound: false,
    imap_host: '', imap_port: '', imap_encryption: 'SSL/TLS',
    imap_username: '', imap_password: '',
    smtp_host: '', smtp_port: '', smtp_encryption: 'SSL/TLS',
    smtp_username: '', smtp_password: '',
    polling_interval_min: 5, initial_fetch_days: 7,
    mailbox_folder: 'INBOX', ingest_attachments: false, max_attachment_mb: 10
  })
  const [emailTestingId, setEmailTestingId] = useState(null)
  const [sendTestModalId, setSendTestModalId] = useState(null)
  const [sendTestRecipient, setSendTestRecipient] = useState('')
  const [smtpErrorModal, setSmtpErrorModal] = useState(null)
  const [esigAction, setEsigAction] = useState(null)
  const [esigForm, setEsigForm] = useState({ password: '', reason: '' })
  const [esigError, setEsigError] = useState('')

  // Contact Master
  const [contactTab, setContactTab] = useState('contacts')
  const [contacts, setContacts] = useState([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [contactSearch, setContactSearch] = useState('')
  const [contactTypeFilter, setContactTypeFilter] = useState('')
  const [contactModal, setContactModal] = useState(null)
  const [contactEditTarget, setContactEditTarget] = useState(null)
  const [contactForm, setContactForm] = useState({ first_name: '', last_name: '', specialty: '', institution: '', email: '', phone: '', type: 'HCP', organization: '', notes: '', address: '', do_not_update_master: false })
  const [companyReps, setCompanyReps] = useState([])
  const [repsLoading, setRepsLoading] = useState(false)
  const [repSearch, setRepSearch] = useState('')
  const [repModal, setRepModal] = useState(null)
  const [repEditTarget, setRepEditTarget] = useState(null)
  const [repForm, setRepForm] = useState({ name: '', title: '', territory: '', email: '', phone: '', organization: '' })

  // Case Numbering
  const [caseNumConfigs, setCaseNumConfigs] = useState([])
  const [caseNumLoading, setCaseNumLoading] = useState(false)
  const [caseNumSaving, setCaseNumSaving] = useState(false)
  const [caseNumOrgId, setCaseNumOrgId] = useState('')
  const [caseNumForm, setCaseNumForm] = useState({ case_type: 'ALL', prefix: 'CASE', separator: '-', include_year: true, include_month: false, seq_length: 5 })
  const [caseNumPreview, setCaseNumPreview] = useState('CASE-2026-00001')

  const isSuperadmin = currentUser?.role === 'superadmin'
  const orgId = currentUser?.orgId || currentUser?.org_id || ''
  const orgName = currentUser?.orgName || currentUser?.org_name || ''

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (['products','email-accounts','case-numbering','contact-master'].includes(contentSection)) loadOrgs()
    if (contentSection === 'products') loadProducts()
    if (contentSection === 'audit-admin') loadAuditLogs()
    if (contentSection === 'audit-login') loadLoginAudit()
    if (contentSection === 'email-accounts') {
      loadCurrentUser()
      loadEmailAccounts()
    }
    if (contentSection === 'contact-master') { loadContacts(); loadCompanyReps() }
    if (contentSection === 'case-numbering') { loadCaseNumConfigs(); loadOrgs() }
  }, [contentSection])

  useEffect(() => {
    if (contentSection === 'contact-master') setContactTab('contacts')
  }, [contentSection])
  /* eslint-enable react-hooks/exhaustive-deps */

  async function loadCurrentUser() {
    try {
      const me = await fetch('/api/auth/me', { headers: H }).then(r => r.json())
      setCurrentUser(me || null)
    } catch {
      setCurrentUser(null)
    }
  }

  async function loadOrgs() {
    try {
      const d = await fetch('/api/admin/orgs', { headers: H }).then(r => r.json())
      setOrgs(d.orgs || [])
    } catch {
      setOrgs([])
    }
  }

  async function loadProducts() {
    try {
      const d = await fetch('/api/admin/products', { headers: H }).then(r => r.json())
      setProducts(d.products || [])
    } catch {
      setProducts([])
    }
  }

  async function loadAll() {
    try {
      const [o, p, a] = await Promise.all([
        fetch('/api/admin/orgs', { headers: H }).then(r => r.json()).catch(() => ({ orgs: [] })),
        fetch('/api/admin/products', { headers: H }).then(r => r.json()).catch(() => ({ products: [] })),
        fetch('/api/admin/audit-logs', { headers: H }).then(r => r.json()).catch(() => ({ logs: [] })),
      ])
      setOrgs(o.orgs || [])
      setProducts(p.products || [])
      setAuditLogs(a.logs || [])
    } catch {
      flash('Failed to load admin data. Please refresh.', 'error')
    }
  }
  async function loadCaseNumConfigs() {
    setCaseNumLoading(true)
    try {
      const d = await fetch('/api/admin/case-number-config', { headers: H }).then(r => r.json())
      setCaseNumConfigs(d.configs || [])
    } catch { flash('Failed to load case number configs.', 'error') }
    finally { setCaseNumLoading(false) }
  }

  async function saveCaseNumConfig(e) {
    e.preventDefault()
    setCaseNumSaving(true)
    try {
      const payload = { ...caseNumForm, org_id: caseNumOrgId || null }
      const res = await fetch('/api/admin/case-number-config', { method: 'POST', headers: H, body: JSON.stringify(payload) })
      const d = await res.json()
      if (!res.ok) return flash(d.error, 'error')
      flash('Case number config saved.', 'success')
      loadCaseNumConfigs()
    } catch { flash('Save failed.', 'error') }
    finally { setCaseNumSaving(false) }
  }

  async function refreshCaseNumPreview() {
    const { prefix, separator, include_year, include_month, seq_length } = caseNumForm
    const params = new URLSearchParams({ prefix, separator, include_year: include_year ? 1 : 0, include_month: include_month ? 1 : 0, seq_length })
    try {
      const d = await fetch(`/api/admin/case-number-config/preview?${params}`, { headers: H }).then(r => r.json())
      setCaseNumPreview(d.preview || '')
    } catch { /* silent */ }
  }

  async function deleteCaseNumConfig(id) {
    if (!window.confirm('Delete this configuration?')) return
    const res = await fetch(`/api/admin/case-number-config/${id}`, { method: 'DELETE', headers: H })
    if (res.ok) { flash('Deleted.', 'success'); loadCaseNumConfigs() }
    else { const d = await res.json(); flash(d.error, 'error') }
  }


  async function loadAuditLogs() {
    const params = new URLSearchParams(auditFilter).toString()
    const d = await fetch(`/api/admin/audit-logs?${params}`, { headers: H }).then(r => r.json())
    setAuditLogs(d.logs || [])
  }

  async function loadLoginAudit() {
    const params = new URLSearchParams(loginFilter).toString()
    const d = await fetch(`/api/admin/login-audit?${params}`, { headers: H }).then(r => r.json())
    setLoginAudit(d.logs || [])
  }

  async function loadContacts(search = contactSearch, type = contactTypeFilter) {
    setContactsLoading(true)
    try {
      const params = new URLSearchParams({ search, type })
      const res = await fetch(`/api/admin/contacts?${params}`, { headers: H })
      const d = await res.json()
      setContacts(d.contacts || [])
    } catch { /* silent */ } finally { setContactsLoading(false) }
  }

  async function saveContact(e) {
    e.preventDefault()
    const isEdit = contactModal === 'edit'
    const url = isEdit ? `/api/admin/contacts/${contactEditTarget.id}` : '/api/admin/contacts'
    const res = await fetch(url, { method: isEdit ? 'PUT' : 'POST', headers: H, body: JSON.stringify(contactForm) })
    const d = await res.json()
    if (!res.ok) return flash(d.error || 'Save failed.', 'error')
    await loadContacts()
    setContactModal(null)
    flash(isEdit ? 'Contact updated.' : 'Contact created.')
  }

  async function deleteContact(c) {
    const contactName = `${c.first_name || ''} ${c.last_name || ''}`.trim() || `#${c.id}`
    if (!window.confirm(`Delete contact "${contactName}"?`)) return
    const res = await fetch(`/api/admin/contacts/${c.id}`, { method: 'DELETE', headers: H })
    const d = await res.json()
    if (!res.ok) return flash(d.error || 'Delete failed.', 'error')
    setContacts(prev => prev.filter(x => x.id !== c.id))
    flash('Contact deleted.')
  }

  async function loadCompanyReps(search = repSearch) {
    setRepsLoading(true)
    try {
      const params = new URLSearchParams({ search })
      const res = await fetch(`/api/admin/company-reps?${params}`, { headers: H })
      const d = await res.json()
      setCompanyReps(d.reps || [])
    } catch { /* silent */ } finally { setRepsLoading(false) }
  }

  async function saveRep(e) {
    e.preventDefault()
    const isEdit = repModal === 'edit'
    const url = isEdit ? `/api/admin/company-reps/${repEditTarget.id}` : '/api/admin/company-reps'
    const res = await fetch(url, { method: isEdit ? 'PUT' : 'POST', headers: H, body: JSON.stringify(repForm) })
    const d = await res.json()
    if (!res.ok) return flash(d.error || 'Save failed.', 'error')
    await loadCompanyReps()
    setRepModal(null)
    flash(isEdit ? 'Rep updated.' : 'Rep created.')
  }

  async function deleteRep(r) {
    if (!window.confirm(`Delete representative "${r.name}"?`)) return
    const res = await fetch(`/api/admin/company-reps/${r.id}`, { method: 'DELETE', headers: H })
    const d = await res.json()
    if (!res.ok) return flash(d.error || 'Delete failed.', 'error')
    setCompanyReps(prev => prev.filter(x => x.id !== r.id))
    flash('Rep deleted.')
  }

  async function readJson(res) {
    // Avoid crashing on HTML/empty responses (e.g. proxy/backend down).
    const text = await res.text()
    try { return JSON.parse(text) } catch { return { error: text || `HTTP ${res.status}` } }
  }

  function esigConfirm(msg, entity, entityId, onConfirm) {
    setEsigForm({ password: '', reason: '' })
    setEsigError('')
    setEsigAction({ msg, entity, entityId, onConfirm })
  }

  function getDefaultEmailForm(overrides = {}) {
    return {
      org_id: isSuperadmin ? '' : String(orgId || ''),
      account_name: '',
      provider: 'Generic',
      direction: 'Both',
      is_active: true,
      mailbox_email: '',
      from_email: '',
      display_name: '',
      is_default_outbound: false,
      imap_host: '',
      imap_port: '',
      imap_encryption: 'SSL/TLS',
      imap_username: '',
      imap_password: '',
      smtp_host: '',
      smtp_port: '',
      smtp_encryption: 'SSL/TLS',
      smtp_username: '',
      smtp_password: '',
      polling_interval_min: 5,
      initial_fetch_days: 7,
      mailbox_folder: 'INBOX',
      ingest_attachments: false,
      max_attachment_mb: 10,
      ...overrides,
    }
  }

  async function loadEmailAccounts() {
    try {
      const res = await fetch('/api/admin/email-accounts', { headers: H })
      const d = await readJson(res)
      if (!res.ok) { setEmailAccounts([]); return }
      setEmailAccounts(d.accounts || [])
    } catch {
      setEmailAccounts([])
    }
  }

  function applyProviderPreset(provider) {
    const presets = {
      Gmail: { imap_host: 'imap.gmail.com', imap_port: 993, imap_encryption: 'SSL/TLS', smtp_host: 'smtp.gmail.com', smtp_port: 465, smtp_encryption: 'SSL/TLS' },
      Microsoft365: { imap_host: 'outlook.office365.com', imap_port: 993, imap_encryption: 'SSL/TLS', smtp_host: 'smtp.office365.com', smtp_port: 587, smtp_encryption: 'STARTTLS' },
      Generic: {}
    }
    setEmailForm(f => ({ ...f, provider, ...(presets[provider] || {}) }))
  }

  function openAddEmailModal() {
    setEmailEditTarget(null)
    setEmailForm(getDefaultEmailForm())
    setEmailModal('add')
  }

  function openEditEmailModal(account) {
    setEmailEditTarget(account)
    setEmailForm(getDefaultEmailForm({
      ...account,
      org_id: String(account.org_id || orgId || ''),
      imap_password: '',
      smtp_password: '',
    }))
    setEmailModal('edit')
  }

  async function saveEmailAccount(e) {
    e.preventDefault()
    const isEdit = emailModal === 'edit'
    const url = isEdit ? `/api/admin/email-accounts/${emailEditTarget.id}` : '/api/admin/email-accounts'
    const res = await fetch(url, { method: isEdit ? 'PUT' : 'POST', headers: H, body: JSON.stringify(emailForm) })
    const d = await readJson(res)
    if (!res.ok) return flash(d.error || 'Request failed. Is the backend running on :3000?', 'error')
    await loadEmailAccounts()
    setEmailModal(null)
    flash(isEdit ? 'Email account updated.' : 'Email account created.')
  }

  async function toggleEmailAccount(account) {
    const res = await fetch(`/api/admin/email-accounts/${account.id}/toggle`, { method: 'PATCH', headers: H })
    const d = await readJson(res)
    if (!res.ok) return flash(d.error || 'Status update failed.', 'error')
    await loadEmailAccounts()
    flash(d.message || 'Email account status updated.')
  }

  async function deleteEmailAccount(account) {
    esigConfirm(`Delete email account "${account.account_name}"? This will remove credentials from storage.`, 'email_account', account.id, async () => {
      const res = await fetch(`/api/admin/email-accounts/${account.id}`, { method: 'DELETE', headers: H })
      const d = await readJson(res)
      if (!res.ok) return flash(d.error || 'Delete failed.', 'error')
      await loadEmailAccounts()
      flash(d.message || 'Email account deleted.')
    })
  }

  async function runEmailAction(account, action) {
    const actionLabel = action === 'fetch-now'
      ? 'fetch emails now'
      : action === 'test-imap'
        ? 'run IMAP test'
        : action === 'test-smtp'
          ? 'run SMTP test'
          : `run ${action}`
    if (!window.confirm(`Confirm to ${actionLabel} for "${account.account_name}"?`)) return
    const key = `${action}-${account.id}`
    setEmailTestingId(key)
    try {
      const res = await fetch(`/api/admin/email-accounts/${account.id}/${action}`, { method: 'POST', headers: H })
      const d = await readJson(res)
      if (!res.ok) {
        if (action === 'test-smtp') {
          setSmtpErrorModal({ account_name: account.account_name, error: d.error || 'SMTP test failed.', tested_at: 'Just now' })
        }
        return flash(d.error || 'Request failed.', 'error')
      }
      await loadEmailAccounts()
      if (action === 'fetch-now') {
        flash(`Fetch complete. ${d.ingested ?? 0} email(s) ingested.`)
      } else if (d.status === 'fail') {
        if (action === 'test-smtp') {
          setSmtpErrorModal({ account_name: account.account_name, error: d.error || 'SMTP test failed.', tested_at: d.tested_at || 'Just now' })
        }
        flash(`${action === 'test-imap' ? 'IMAP' : 'SMTP'} test failed.`, 'error')
      } else {
        flash(
          action === 'test-imap'
            ? 'IMAP test passed.'
            : action === 'test-smtp'
              ? 'SMTP test passed.'
              : 'Action completed.'
        )
      }
    } finally {
      setEmailTestingId(null)
    }
  }

  async function submitSendTest(e) {
    e.preventDefault()
    if (!sendTestModalId) return
    setEmailTestingId(`send-${sendTestModalId}`)
    try {
      const res = await fetch(`/api/admin/email-accounts/${sendTestModalId}/send-test`, {
        method: 'POST',
        headers: H,
        body: JSON.stringify({ recipient: sendTestRecipient }),
      })
      const d = await readJson(res)
      if (!res.ok || d.status === 'fail') {
        const account = emailAccounts.find(a => a.id === sendTestModalId)
        setSmtpErrorModal({
          account_name: account?.account_name || 'Email account',
          error: d.error || 'Send test failed.',
          tested_at: d.tested_at || 'Just now',
        })
        return flash(d.error || 'Send test failed.', 'error')
      }
      await loadEmailAccounts()
      setSendTestModalId(null)
      setSendTestRecipient('')
      flash('Test email sent successfully.')
    } finally {
      setEmailTestingId(null)
    }
  }

  async function createProduct(e) {
    e.preventDefault()
    const res = await fetch('/api/admin/products', { method: 'POST', headers: H, body: JSON.stringify(productForm) })
    const d = await res.json()
    if (!res.ok) return flash(d.error, 'error')
    setProducts(prev => [...prev, d])
    setProductForm({ trade_name: '', org_id: '' })
    flash('Product created.')
  }

  // ─── F-07: Product Approvals handlers ────────────────────────────────────

  async function loadProductApprovals(productId) {
    try {
      const res = await fetch(`/api/admin/products/${productId}/approvals`, { headers: H })
      const d = await res.json()
      setProductApprovals(d.approvals || [])
    } catch { /* silent */ }
  }

  async function loadProductCountryAuths(productId) {
    try {
      const res = await fetch(`/api/admin/products/${productId}/country-authorizations`, { headers: H })
      const d = await res.json()
      setProductCountryAuths(d.authorizations || [])
    } catch { /* silent */ }
  }

  function selectProductForDetail(p) {
    setSelectedProduct(p)
    setProductTab('approvals')
    loadProductApprovals(p.id)
    loadProductCountryAuths(p.id)
  }

  async function saveApproval(e) {
    e.preventDefault()
    const isEdit = approvalModal === 'edit'
    const url = isEdit
      ? `/api/admin/products/approvals/${approvalEditTarget.id}`
      : `/api/admin/products/${selectedProduct.id}/approvals`
    const res = await fetch(url, { method: isEdit ? 'PUT' : 'POST', headers: H, body: JSON.stringify(approvalForm) })
    const d = await res.json()
    if (!res.ok) return flash(d.error || 'Save failed.', 'error')
    await loadProductApprovals(selectedProduct.id)
    setApprovalModal(null)
    flash(isEdit ? 'Approval updated.' : 'Approval created.')
  }

  async function deleteApproval(a) {
    if (!window.confirm(`Delete approval "${a.approval_number}"?`)) return
    await fetch(`/api/admin/products/approvals/${a.id}`, { method: 'DELETE', headers: H })
    await loadProductApprovals(selectedProduct.id)
    flash('Approval deleted.')
  }

  async function saveCountryAuth(e) {
    e.preventDefault()
    const isEdit = countryAuthModal === 'edit'
    const url = isEdit
      ? `/api/admin/products/country-authorizations/${countryAuthEditTarget.id}`
      : `/api/admin/products/${selectedProduct.id}/country-authorizations`
    const res = await fetch(url, { method: isEdit ? 'PUT' : 'POST', headers: H, body: JSON.stringify(countryAuthForm) })
    const d = await res.json()
    if (!res.ok) return flash(d.error || 'Save failed.', 'error')
    await loadProductCountryAuths(selectedProduct.id)
    setCountryAuthModal(null)
    flash(isEdit ? 'Authorization updated.' : 'Authorization created.')
  }

  async function deleteCountryAuth(a) {
    if (!window.confirm(`Delete authorization for "${a.country}"?`)) return
    await fetch(`/api/admin/products/country-authorizations/${a.id}`, { method: 'DELETE', headers: H })
    await loadProductCountryAuths(selectedProduct.id)
    flash('Authorization deleted.')
  }

  function parseAuditDetails(detailsStr, action, entity, beforeStr, afterStr) {
    try {
      if (action === 'UPDATE' && beforeStr && afterStr) {
        const before = JSON.parse(beforeStr)
        const after = JSON.parse(afterStr)
        if (before && after) {
          const diffs = Object.keys(after).filter(k => k !== 'id' && String(before[k]) !== String(after[k]))
          if (diffs.length > 0) {
            return diffs.map(k => `${k.replace(/_/g, ' ')}: ${before[k] ?? '—'} → ${after[k] ?? '—'}`).join(' | ')
          }
        }
      }
      const d = JSON.parse(detailsStr)
      if (!d) return '—'
      const entries = Object.entries(d)
        .filter(([k]) => action === 'UPDATE' ? !['id'].includes(k) : !['is_active', 'id'].includes(k))
        .map(([k, v]) => {
          if (k === 'is_active') return v ? 'status: activated' : 'status: deactivated'
          return `${k.replace(/_/g, ' ')}: ${v}`
        })
        .join(', ')
      const entityLabel = entity?.replace(/_/g, ' ')
      if (action === 'CREATE') return `Created ${entityLabel} — ${entries}`
      if (action === 'UPDATE') return `Updated ${entityLabel} — ${entries}`
      return entries || detailsStr
    } catch { return detailsStr || '—' }
  }

  switch (contentSection) {
      case 'products':
        return (
          <>
            <SectionHeader title="Product Dictionary" desc="Manage drug/trade names, regulatory approvals, and country authorizations." />

            {/* Sub-tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
              {[
                { key: 'products', label: 'Products' },
                { key: 'approvals', label: selectedProduct ? `Approvals — ${selectedProduct.trade_name}` : 'Approvals' },
                { key: 'country-auth', label: selectedProduct ? `Country Auth — ${selectedProduct.trade_name}` : 'Country Auth' },
              ].map(t => (
                <button key={t.key} onClick={() => { if (t.key !== 'products' && !selectedProduct) return; setProductTab(t.key) }}
                  style={{ padding: '10px 20px', border: 'none', borderBottom: productTab === t.key ? '2px solid var(--primary)' : '2px solid transparent', background: 'none', cursor: (t.key !== 'products' && !selectedProduct) ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: productTab === t.key ? 700 : 400, color: productTab === t.key ? 'var(--primary)' : (t.key !== 'products' && !selectedProduct) ? 'var(--text-muted)' : 'var(--text-secondary)', opacity: (t.key !== 'products' && !selectedProduct) ? 0.5 : 1 }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Products list ── */}
            {productTab === 'products' && (
              <>
                <div className="card" style={{ marginBottom: 16 }}>
                  <div className="card-header"><h3>Add Product</h3></div>
                  <div className="card-body">
                    <form onSubmit={createProduct} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <input className="form-control" placeholder="Trade name" value={productForm.trade_name} onChange={e => setProductForm(f => ({ ...f, trade_name: e.target.value }))} required style={{ flex: 1 }} />
                      <select className="form-control" value={productForm.org_id} onChange={e => setProductForm(f => ({ ...f, org_id: e.target.value }))} style={{ flex: 1 }}>
                        <option value="">Organisation (optional)</option>
                        {orgs.filter(o => o.is_active).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                      <button className="btn btn-primary" type="submit" style={{ whiteSpace: 'nowrap' }}>+ Add</button>
                    </form>
                  </div>
                </div>
                <div className="card">
                  <div className="card-header"><h3>Products ({products.length})</h3></div>
                  <div className="card-body" style={{ padding: 0 }}>
                    <table className="admin-table">
                      <thead><tr><th>Trade Name</th><th>Organisation</th><th>Status</th><th>Actions</th></tr></thead>
                      <tbody>
                        {products.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No products yet.</td></tr>}
                        {products.map(p => (
                          <tr key={p.id}>
                            <td><strong>{p.trade_name}</strong></td>
                            <td style={{ color: 'var(--text-muted)' }}>{p.org_name || '—'}</td>
                            <td><StatusPill active={p.is_active} /></td>
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => selectProductForDetail(p)}>
                                  Approvals / Auth →
                                </button>
                                <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px' }} onClick={async () => {
                                  const res = await fetch(`/api/admin/products/${p.id}/clone`, { method: 'POST', headers: H })
                                  const d = await res.json()
                                  if (!res.ok) return flash(d.error || 'Clone failed.', 'error')
                                  loadProducts()
                                  flash(`Cloned as "${d.trade_name}".`)
                                }}>⧉ Clone</button>
                                {p.is_active ? <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px', color: 'var(--warning)', borderColor: 'var(--warning)' }} onClick={async () => {
                                  const res = await fetch('/api/admin/products/bulk-deactivate', { method: 'PATCH', headers: H, body: JSON.stringify({ ids: [p.id] }) })
                                  if (!res.ok) return flash('Deactivate failed.', 'error')
                                  loadProducts(); flash('Product deactivated.')
                                }}>Deactivate</button> : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* ── Product Approvals ── */}
            {productTab === 'approvals' && selectedProduct && (
              <>
                <div className="card">
                  <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3>Regulatory Approvals — {selectedProduct.trade_name} ({productApprovals.length})</h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => { setSelectedProduct(null); setProductTab('products') }}>← Back</button>
                      <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => { setApprovalForm({ approval_number: '', regulatory_body: '', approval_date: '', expiry_date: '', status: 'Active' }); setApprovalEditTarget(null); setApprovalModal('add') }}>+ Add Approval</button>
                    </div>
                  </div>
                  <div className="card-body" style={{ padding: 0 }}>
                    <table className="admin-table">
                      <thead><tr><th>Approval Number</th><th>Regulatory Body</th><th>Approval Date</th><th>Expiry Date</th><th>Status</th><th>Actions</th></tr></thead>
                      <tbody>
                        {productApprovals.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No approvals yet.</td></tr>}
                        {productApprovals.map(a => (
                          <tr key={a.id}>
                            <td><strong>{a.approval_number}</strong></td>
                            <td style={{ color: 'var(--text-muted)' }}>{a.regulatory_body || '—'}</td>
                            <td style={{ color: 'var(--text-muted)' }}>{a.approval_date ? a.approval_date.slice(0, 10) : '—'}</td>
                            <td style={{ color: 'var(--text-muted)' }}>{a.expiry_date ? a.expiry_date.slice(0, 10) : '—'}</td>
                            <td><span className={`status-pill ${a.status === 'Active' ? 'active' : 'inactive'}`}>{a.status}</span></td>
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => { setApprovalEditTarget(a); setApprovalForm({ approval_number: a.approval_number, regulatory_body: a.regulatory_body || '', approval_date: a.approval_date ? a.approval_date.slice(0,10) : '', expiry_date: a.expiry_date ? a.expiry_date.slice(0,10) : '', status: a.status }); setApprovalModal('edit') }}>✏ Edit</button>
                                <button className="btn btn-danger" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => deleteApproval(a)}>🗑</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Approval Add/Edit Modal */}
                {approvalModal && (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                    <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 480, padding: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <h3 style={{ margin: 0 }}>{approvalModal === 'add' ? 'Add Approval' : 'Edit Approval'}</h3>
                        <button onClick={() => setApprovalModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
                      </div>
                      <form onSubmit={saveApproval}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Approval Number *</label>
                            <input className="form-control" value={approvalForm.approval_number} onChange={e => setApprovalForm(f => ({ ...f, approval_number: e.target.value }))} required />
                          </div>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Regulatory Body</label>
                            <input className="form-control" placeholder="e.g. FDA, EMA, CDSCO" value={approvalForm.regulatory_body} onChange={e => setApprovalForm(f => ({ ...f, regulatory_body: e.target.value }))} />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Approval Date</label>
                            <input className="form-control" type="date" value={approvalForm.approval_date} onChange={e => setApprovalForm(f => ({ ...f, approval_date: e.target.value }))} />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Expiry Date</label>
                            <input className="form-control" type="date" value={approvalForm.expiry_date} onChange={e => setApprovalForm(f => ({ ...f, expiry_date: e.target.value }))} />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Status</label>
                            <select className="form-control" value={approvalForm.status} onChange={e => setApprovalForm(f => ({ ...f, status: e.target.value }))}>
                              <option value="Active">Active</option>
                              <option value="Expired">Expired</option>
                              <option value="Suspended">Suspended</option>
                            </select>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                          <button type="button" className="btn btn-outline" onClick={() => setApprovalModal(null)}>Cancel</button>
                          <button type="submit" className="btn btn-primary">Save</button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── Country Authorizations ── */}
            {productTab === 'country-auth' && selectedProduct && (
              <>
                <div className="card">
                  <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3>Country Authorizations — {selectedProduct.trade_name} ({productCountryAuths.length})</h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => { setSelectedProduct(null); setProductTab('products') }}>← Back</button>
                      <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => { setCountryAuthForm({ country: '', auth_number: '', auth_date: '', status: 'Active' }); setCountryAuthEditTarget(null); setCountryAuthModal('add') }}>+ Add Authorization</button>
                    </div>
                  </div>
                  <div className="card-body" style={{ padding: 0 }}>
                    <table className="admin-table">
                      <thead><tr><th>Country</th><th>Authorization Number</th><th>Authorization Date</th><th>Status</th><th>Actions</th></tr></thead>
                      <tbody>
                        {productCountryAuths.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No authorizations yet.</td></tr>}
                        {productCountryAuths.map(a => (
                          <tr key={a.id}>
                            <td><strong>{a.country}</strong></td>
                            <td style={{ color: 'var(--text-muted)' }}>{a.auth_number || '—'}</td>
                            <td style={{ color: 'var(--text-muted)' }}>{a.auth_date ? a.auth_date.slice(0, 10) : '—'}</td>
                            <td><span className={`status-pill ${a.status === 'Active' ? 'active' : 'inactive'}`}>{a.status}</span></td>
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => { setCountryAuthEditTarget(a); setCountryAuthForm({ country: a.country, auth_number: a.auth_number || '', auth_date: a.auth_date ? a.auth_date.slice(0,10) : '', status: a.status }); setCountryAuthModal('edit') }}>✏ Edit</button>
                                <button className="btn btn-danger" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => deleteCountryAuth(a)}>🗑</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Country Auth Add/Edit Modal */}
                {countryAuthModal && (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                    <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 440, padding: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <h3 style={{ margin: 0 }}>{countryAuthModal === 'add' ? 'Add Authorization' : 'Edit Authorization'}</h3>
                        <button onClick={() => setCountryAuthModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
                      </div>
                      <form onSubmit={saveCountryAuth}>
                        <div style={{ display: 'grid', gap: 12 }}>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Country *</label>
                            <input className="form-control" placeholder="e.g. United States" value={countryAuthForm.country} onChange={e => setCountryAuthForm(f => ({ ...f, country: e.target.value }))} required />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Authorization Number</label>
                            <input className="form-control" value={countryAuthForm.auth_number} onChange={e => setCountryAuthForm(f => ({ ...f, auth_number: e.target.value }))} />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Authorization Date</label>
                            <input className="form-control" type="date" value={countryAuthForm.auth_date} onChange={e => setCountryAuthForm(f => ({ ...f, auth_date: e.target.value }))} />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Status</label>
                            <select className="form-control" value={countryAuthForm.status} onChange={e => setCountryAuthForm(f => ({ ...f, status: e.target.value }))}>
                              <option value="Active">Active</option>
                              <option value="Revoked">Revoked</option>
                              <option value="Suspended">Suspended</option>
                            </select>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                          <button type="button" className="btn btn-outline" onClick={() => setCountryAuthModal(null)}>Cancel</button>
                          <button type="submit" className="btn btn-primary">Save</button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )

      case 'audit-admin':
        return <AuditAdminPanel auditLogs={auditLogs} auditFilter={auditFilter} setAuditFilter={setAuditFilter} loadAuditLogs={loadAuditLogs} loadAll={loadAll} H={H} flash={flash} />


      case 'audit-login':
        return (
          <>
            <SectionHeader title="Login Audit Trail" desc="21 CFR Part 11 — all login and logout events. Read-only." onExport exportData={loginAudit} exportFile="login-audit.csv" />
            {/* AC-E6: Lockout Settings */}
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

      case 'email-accounts':
        return (
          <>
            <SectionHeader
              title="Email Accounts"
              desc={isSuperadmin
                ? 'Manage email accounts across organisations.'
                : `Manage email accounts for ${orgName || 'your active organisation'}. These accounts remain isolated per organisation.`}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ padding: '8px 14px', background: '#eef7ff', border: '1px solid #cfe8ff', borderRadius: 6, fontSize: 12, color: '#0b5394' }}>
                {isSuperadmin
                  ? 'SuperAdmin can manage email accounts across orgs. Org admins will only see and manage accounts for their active organisation.'
                  : 'Email account setup is managed inside MIMS and stays isolated to your active organisation.'}
              </div>
              <button className="btn btn-primary" onClick={openAddEmailModal}>+ Add Email Account</button>
            </div>
            <div className="card">
              <div className="card-header"><h3>Email Accounts ({emailAccounts.length})</h3></div>
              <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Org</th>
                      <th>Account Name</th>
                      <th>Provider</th>
                      <th>Direction</th>
                      <th>Mailbox Email</th>
                      <th>From Email</th>
                      <th>Active</th>
                      <th>Last IMAP Test</th>
                      <th>Last SMTP Test</th>
                      <th>Last Ingest</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emailAccounts.length === 0 && (
                      <tr><td colSpan={11} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                        No email accounts configured yet. Add one for the active organisation to enable inbound or outbound email flows.
                      </td></tr>
                    )}
                    {emailAccounts.map(account => (
                      <tr key={account.id}>
                        <td>{account.org_name}</td>
                        <td>
                          <strong>{account.account_name}</strong>
                          {!!account.is_default_outbound && <span style={{ marginLeft: 6, fontSize: 9, background: 'var(--primary)', color: '#fff', borderRadius: 3, padding: '1px 5px' }}>Default Out</span>}
                        </td>
                        <td>{account.provider}</td>
                        <td>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: account.direction === 'Inbound' ? '#2471a3' : account.direction === 'Outbound' ? '#17a589' : '#8e44ad', color: '#fff' }}>
                            {account.direction}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{account.mailbox_email || '—'}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{account.from_email || '—'}</td>
                        <td><StatusPill active={account.is_active} /></td>
                        <td style={{ fontSize: 11 }}>
                          {account.last_imap_test_at
                            ? <span style={{ color: account.last_imap_test_status === 'pass' ? 'var(--success)' : 'var(--danger)' }}>
                                {account.last_imap_test_status} · {account.last_imap_test_at}
                              </span>
                            : '—'}
                        </td>
                        <td style={{ fontSize: 11 }}>
                          {account.last_smtp_test_at
                            ? <span style={{ color: account.last_smtp_test_status === 'pass' ? 'var(--success)' : 'var(--danger)' }}>
                                {account.last_smtp_test_status} · {account.last_smtp_test_at}
                              </span>
                            : '—'}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{account.last_ingest_at || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button className="btn btn-outline" style={{ fontSize: 11 }} onClick={() => openEditEmailModal(account)}>Edit</button>
                            <button className="btn btn-outline" style={{ fontSize: 11 }} onClick={() => toggleEmailAccount(account)}>
                              {account.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                            {['Inbound', 'Both'].includes(account.direction) && (
                              <>
                                <button
                                  className="btn btn-outline"
                                  style={{ fontSize: 11 }}
                                  onClick={() => runEmailAction(account, 'test-imap')}
                                  disabled={emailTestingId === `test-imap-${account.id}`}
                                >
                                  {emailTestingId === `test-imap-${account.id}` ? 'Testing...' : 'Test IMAP'}
                                </button>
                                <button
                                  className="btn btn-outline"
                                  style={{ fontSize: 11 }}
                                  onClick={() => runEmailAction(account, 'fetch-now')}
                                  disabled={emailTestingId === `fetch-now-${account.id}`}
                                >
                                  {emailTestingId === `fetch-now-${account.id}` ? 'Fetching...' : 'Fetch Now'}
                                </button>
                              </>
                            )}
                            {['Outbound', 'Both'].includes(account.direction) && (
                              <>
                                <button
                                  className="btn btn-outline"
                                  style={{ fontSize: 11 }}
                                  onClick={() => runEmailAction(account, 'test-smtp')}
                                  disabled={emailTestingId === `test-smtp-${account.id}`}
                                >
                                  {emailTestingId === `test-smtp-${account.id}` ? 'Testing...' : 'Test SMTP'}
                                </button>
                                <button className="btn btn-outline" style={{ fontSize: 11 }} onClick={() => { setSendTestModalId(account.id); setSendTestRecipient('') }}>
                                  Send Test
                                </button>
                              </>
                            )}
                            <button className="btn btn-outline" style={{ fontSize: 11, color: 'var(--danger)' }} onClick={() => deleteEmailAccount(account)}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

      {esigAction && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 460, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Electronic Signature Required</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              {esigAction.msg}
            </p>
            <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
              <input className="form-control" type="password" placeholder="Your password (required)"
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

      {/* ── Email Account Add/Edit Modal ─────────────────────── */}
      {emailModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', padding: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0 }}>{emailModal === 'add' ? 'Add Email Account' : 'Edit Email Account'}</h3>
              <button onClick={() => setEmailModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>
            <form onSubmit={saveEmailAccount}>
              {/* Section 1 — Identity */}
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>Identity</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Organisation *</label>
                    {isSuperadmin ? (
                      <select className="form-control" value={emailForm.org_id} onChange={e => setEmailForm(f => ({ ...f, org_id: e.target.value }))} required>
                        <option value="">— Select Org —</option>
                        {orgs.filter(o => o.is_active).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    ) : (
                      <input className="form-control" value={orgName || 'Active Organisation'} disabled />
                    )}
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Account Name *</label>
                    <input className="form-control" value={emailForm.account_name} onChange={e => setEmailForm(f => ({ ...f, account_name: e.target.value }))} required />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Provider *</label>
                    <select className="form-control" value={emailForm.provider} onChange={e => applyProviderPreset(e.target.value)} required>
                      <option>Gmail</option>
                      <option>Microsoft365</option>
                      <option>Generic</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Direction *</label>
                    <select className="form-control" value={emailForm.direction} onChange={e => setEmailForm(f => ({ ...f, direction: e.target.value }))} required>
                      <option>Inbound</option>
                      <option>Outbound</option>
                      <option>Both</option>
                    </select>
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={emailForm.is_active} onChange={e => setEmailForm(f => ({ ...f, is_active: e.target.checked }))} />
                  Active
                </label>
              </div>

              {/* Section 2 — Address Fields */}
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>Address</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {['Inbound', 'Both'].includes(emailForm.direction) && (
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Mailbox Email *</label>
                      <input className="form-control" type="email" value={emailForm.mailbox_email} onChange={e => setEmailForm(f => ({ ...f, mailbox_email: e.target.value }))} required />
                    </div>
                  )}
                  {['Outbound', 'Both'].includes(emailForm.direction) && (
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>From Email *</label>
                      <input className="form-control" type="email" value={emailForm.from_email} onChange={e => setEmailForm(f => ({ ...f, from_email: e.target.value }))} required />
                    </div>
                  )}
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Display Name</label>
                    <input className="form-control" value={emailForm.display_name} onChange={e => setEmailForm(f => ({ ...f, display_name: e.target.value }))} />
                  </div>
                </div>
                {['Outbound', 'Both'].includes(emailForm.direction) && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 10, cursor: 'pointer' }}>
                    <input type="checkbox" checked={emailForm.is_default_outbound} onChange={e => setEmailForm(f => ({ ...f, is_default_outbound: e.target.checked }))} />
                    Default Outbound for this Org
                  </label>
                )}
              </div>

              {/* Section 3 — IMAP (inbound only) */}
              {['Inbound', 'Both'].includes(emailForm.direction) && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>Inbound (IMAP)</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>IMAP Host *</label>
                      <input className="form-control" value={emailForm.imap_host} onChange={e => setEmailForm(f => ({ ...f, imap_host: e.target.value }))} required />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>IMAP Port *</label>
                      <input className="form-control" type="number" value={emailForm.imap_port} onChange={e => setEmailForm(f => ({ ...f, imap_port: e.target.value }))} required />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Encryption *</label>
                      <select className="form-control" value={emailForm.imap_encryption} onChange={e => setEmailForm(f => ({ ...f, imap_encryption: e.target.value }))}>
                        <option>SSL/TLS</option><option>STARTTLS</option><option>None</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Username *</label>
                      <input className="form-control" value={emailForm.imap_username} onChange={e => setEmailForm(f => ({ ...f, imap_username: e.target.value }))} required />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Password {emailModal === 'edit' ? '(leave blank to keep existing)' : '*'}</label>
                      <input className="form-control" type="password" value={emailForm.imap_password} onChange={e => setEmailForm(f => ({ ...f, imap_password: e.target.value }))} required={emailModal === 'add'} />
                    </div>
                  </div>
                </div>
              )}

              {/* Section 4 — SMTP (outbound only) */}
              {['Outbound', 'Both'].includes(emailForm.direction) && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>Outbound (SMTP)</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>SMTP Host *</label>
                      <input className="form-control" value={emailForm.smtp_host} onChange={e => setEmailForm(f => ({ ...f, smtp_host: e.target.value }))} required />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>SMTP Port *</label>
                      <input className="form-control" type="number" value={emailForm.smtp_port} onChange={e => setEmailForm(f => ({ ...f, smtp_port: e.target.value }))} required />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Encryption *</label>
                      <select className="form-control" value={emailForm.smtp_encryption} onChange={e => setEmailForm(f => ({ ...f, smtp_encryption: e.target.value }))}>
                        <option>SSL/TLS</option><option>STARTTLS</option><option>None</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Username *</label>
                      <input className="form-control" value={emailForm.smtp_username} onChange={e => setEmailForm(f => ({ ...f, smtp_username: e.target.value }))} required />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Password {emailModal === 'edit' ? '(leave blank to keep existing)' : '*'}</label>
                      <input className="form-control" type="password" value={emailForm.smtp_password} onChange={e => setEmailForm(f => ({ ...f, smtp_password: e.target.value }))} required={emailModal === 'add'} />
                    </div>
                  </div>
                </div>
              )}

              {/* Section 5 — Ingestion Controls (inbound only) */}
              {['Inbound', 'Both'].includes(emailForm.direction) && (
                <div style={{ marginBottom: 20 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>Ingestion Controls</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Polling Interval (min)</label>
                      <input className="form-control" type="number" min={1} value={emailForm.polling_interval_min} onChange={e => setEmailForm(f => ({ ...f, polling_interval_min: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Initial Fetch Window (days)</label>
                      <input className="form-control" type="number" min={1} value={emailForm.initial_fetch_days} onChange={e => setEmailForm(f => ({ ...f, initial_fetch_days: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Mailbox Folder</label>
                      <input className="form-control" value={emailForm.mailbox_folder} onChange={e => setEmailForm(f => ({ ...f, mailbox_folder: e.target.value }))} />
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 10, cursor: 'pointer' }}>
                    <input type="checkbox" checked={emailForm.ingest_attachments} onChange={e => setEmailForm(f => ({ ...f, ingest_attachments: e.target.checked }))} />
                    Ingest Attachments
                  </label>
                  {emailForm.ingest_attachments && (
                    <div style={{ marginTop: 10, maxWidth: 200 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Max Attachment Size (MB)</label>
                      <input className="form-control" type="number" min={1} value={emailForm.max_attachment_mb} onChange={e => setEmailForm(f => ({ ...f, max_attachment_mb: Number(e.target.value) }))} />
                    </div>
                  )}
                </div>
              )}

              {/* Footer */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <button type="button" className="btn btn-outline" onClick={() => setEmailModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{emailModal === 'add' ? 'Create Account' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── SMTP Error Detail Modal ──────────────────────────── */}
      {smtpErrorModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 480, padding: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin: '0 0 4px', color: 'var(--danger)' }}>SMTP Test Failed</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Account: <strong>{smtpErrorModal.account_name}</strong> &nbsp;·&nbsp; {smtpErrorModal.tested_at}
            </p>
            <pre style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 14, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--danger)', margin: '0 0 20px' }}>
              {smtpErrorModal.error}
            </pre>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setSmtpErrorModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Send Test Email Mini-Modal ───────────────────────── */}
      {sendTestModalId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 400, padding: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin: '0 0 8px' }}>Send Test Email</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Account: <strong>{emailAccounts.find(a => a.id === sendTestModalId)?.account_name}</strong>
            </p>
            <form onSubmit={submitSendTest}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Recipient Email *</label>
              <input className="form-control" type="email" placeholder="test@example.com" value={sendTestRecipient} onChange={e => setSendTestRecipient(e.target.value)} required style={{ marginBottom: 16 }} />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setSendTestModalId(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={emailTestingId === `send-${sendTestModalId}`}>
                  {emailTestingId === `send-${sendTestModalId}` ? 'Sending...' : 'Send Test Email'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

            </div>
          </>
        )

      case 'contact-master': {
        return (
          <>
            <SectionHeader title="Contact Master" desc="Manage case contacts and company representatives." />

            {/* Sub-tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
              {[{ key: 'contacts', label: 'Case Contacts' }, { key: 'reps', label: 'Company Representatives' }].map(t => (
                <button
                  key={t.key}
                  onClick={() => setContactTab(t.key)}
                  style={{ padding: '10px 20px', border: 'none', borderBottom: contactTab === t.key ? '2px solid var(--primary)' : '2px solid transparent', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: contactTab === t.key ? 700 : 400, color: contactTab === t.key ? 'var(--primary)' : 'var(--text-secondary)' }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Case Contacts ── */}
            {contactTab === 'contacts' && (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
                  <input className="form-control" placeholder="Search name / email…" value={contactSearch} onChange={e => setContactSearch(e.target.value)} style={{ maxWidth: 240 }} />
                  <select className="form-control" value={contactTypeFilter} onChange={e => setContactTypeFilter(e.target.value)} style={{ maxWidth: 140 }}>
                    <option value="">All Types</option>
                    <option value="HCP">HCP</option>
                    <option value="Patient">Patient</option>
                    <option value="Other">Other</option>
                  </select>
                  <button className="btn btn-primary" onClick={() => loadContacts(contactSearch, contactTypeFilter)}>Search</button>
                  <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => { setContactForm({ first_name: '', last_name: '', specialty: '', institution: '', email: '', phone: '', type: 'HCP', organization: '', notes: '', address: '', do_not_update_master: false }); setContactEditTarget(null); setContactModal('add') }}>+ Add Contact</button>
                </div>

                <div className="card">
                  <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
                    <table className="admin-table">
                      <thead>
                        <tr>{['Name', 'Email', 'Phone', 'Type', 'Organization', 'Status', 'Actions'].map(h => <th key={h}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {contactsLoading && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>Loading…</td></tr>}
                        {!contactsLoading && contacts.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No contacts found.</td></tr>}
                        {!contactsLoading && contacts.map(c => (
                          <tr key={c.id}>
                            <td><strong>{[c.first_name, c.last_name].filter(Boolean).join(' ') || c.name || '—'}</strong></td>
                            <td style={{ color: 'var(--text-muted)' }}>{c.email || '—'}</td>
                            <td style={{ color: 'var(--text-muted)' }}>{c.phone || '—'}</td>
                            <td><span className="badge badge-new">{c.type}</span></td>
                            <td style={{ color: 'var(--text-muted)' }}>{c.organization || '—'}</td>
                            <td><span className={`status-pill ${c.is_active !== false ? 'active' : 'inactive'}`}>{c.is_active !== false ? 'Active' : 'Inactive'}</span></td>
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => {
                                  setContactEditTarget(c)
                                  setContactForm({ first_name: c.first_name || '', last_name: c.last_name || '', specialty: c.specialty || '', institution: c.institution || '', email: c.email || '', phone: c.phone || '', type: c.type || 'HCP', organization: c.organization || '', notes: c.notes || '', address: c.address || '', do_not_update_master: !!c.do_not_update_master })
                                  setContactModal('edit')
                                }}>✏ Edit</button>
                                <button className="btn btn-danger" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => deleteContact(c)}>🗑</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Contact Add/Edit Modal */}
                {contactModal && (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                    <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 520, padding: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.25)', maxHeight: '90vh', overflowY: 'auto' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <h3 style={{ margin: 0 }}>{contactModal === 'add' ? 'Add Contact' : 'Edit Contact'}</h3>
                        <button onClick={() => setContactModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
                      </div>
                      <form onSubmit={saveContact}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>First Name *</label>
                            <input className="form-control" value={contactForm.first_name} onChange={e => setContactForm(f => ({ ...f, first_name: e.target.value }))} required />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Last Name</label>
                            <input className="form-control" value={contactForm.last_name} onChange={e => setContactForm(f => ({ ...f, last_name: e.target.value }))} />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Type</label>
                            <select className="form-control" value={contactForm.type} onChange={e => setContactForm(f => ({ ...f, type: e.target.value }))}>
                              <option value="HCP">HCP</option>
                              <option value="Patient">Patient</option>
                              <option value="Reporter">Reporter</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Specialty</label>
                            <input className="form-control" placeholder="e.g. Oncology, Cardiology" value={contactForm.specialty} onChange={e => setContactForm(f => ({ ...f, specialty: e.target.value }))} />
                          </div>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Institution</label>
                            <input className="form-control" placeholder="Hospital or clinic name" value={contactForm.institution} onChange={e => setContactForm(f => ({ ...f, institution: e.target.value }))} />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Email</label>
                            <input className="form-control" type="email" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Phone</label>
                            <input className="form-control" value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} />
                          </div>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Address</label>
                            <textarea className="form-control" rows={2} style={{ resize: 'vertical' }} value={contactForm.address} onChange={e => setContactForm(f => ({ ...f, address: e.target.value }))} />
                          </div>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Notes</label>
                            <textarea className="form-control" rows={2} style={{ resize: 'vertical' }} value={contactForm.notes} onChange={e => setContactForm(f => ({ ...f, notes: e.target.value }))} />
                          </div>
                          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input type="checkbox" id="dnumd" checked={!!contactForm.do_not_update_master} onChange={e => setContactForm(f => ({ ...f, do_not_update_master: e.target.checked }))} />
                            <label htmlFor="dnumd" style={{ fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Do Not Update Master Data</label>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                          <button type="button" className="btn btn-outline" onClick={() => setContactModal(null)}>Cancel</button>
                          <button type="submit" className="btn btn-primary">Save</button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── Company Representatives ── */}
            {contactTab === 'reps' && (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
                  <input className="form-control" placeholder="Search name…" value={repSearch} onChange={e => setRepSearch(e.target.value)} style={{ maxWidth: 240 }} />
                  <button className="btn btn-primary" onClick={() => loadCompanyReps(repSearch)}>Search</button>
                  {/* AC-E9: CSV Import */}
                  <label className="btn btn-outline" style={{ fontSize: 12, cursor: 'pointer', margin: 0 }}>
                    ⬆ Import CSV
                    <input type="file" accept=".csv" style={{ display: 'none' }} onChange={async e => {
                      const file = e.target.files[0]; if (!file) return
                      const text = await file.text()
                      const lines = text.trim().split('\n')
                      const header = lines[0].toLowerCase().split(',')
                      const nameIdx = header.findIndex(h => h.includes('name'))
                      const emailIdx = header.findIndex(h => h.includes('email'))
                      const phoneIdx = header.findIndex(h => h.includes('phone'))
                      const territoryIdx = header.findIndex(h => h.includes('territory'))
                      const rows = lines.slice(1).map(line => {
                        const cols = line.split(',')
                        return { name: cols[nameIdx]?.replace(/"/g,'').trim(), email: cols[emailIdx]?.replace(/"/g,'').trim(), phone: cols[phoneIdx]?.replace(/"/g,'').trim(), territory: cols[territoryIdx]?.replace(/"/g,'').trim() }
                      }).filter(r => r.name)
                      if (!rows.length) return flash('No valid rows in CSV.', 'error')
                      const res = await fetch('/api/admin/company-reps/import', { method: 'POST', headers: H, body: JSON.stringify({ rows }) })
                      const d = await res.json()
                      if (!res.ok) return flash(d.error || 'Import failed.', 'error')
                      flash(`Imported ${d.imported} representatives.`)
                      loadCompanyReps()
                      e.target.value = ''
                    }} />
                  </label>
                  <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => { setRepForm({ name: '', title: '', territory: '', email: '', phone: '', organization: '' }); setRepEditTarget(null); setRepModal('add') }}>+ Add Rep</button>
                </div>

                <div className="card">
                  <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
                    <table className="admin-table">
                      <thead>
                        <tr>{['Name', 'Title', 'Territory', 'Email', 'Phone', 'Organization', 'Status', 'Actions'].map(h => <th key={h}>{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {repsLoading && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>Loading…</td></tr>}
                        {!repsLoading && companyReps.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No representatives found.</td></tr>}
                        {!repsLoading && companyReps.map(r => (
                          <tr key={r.id}>
                            <td><strong>{r.name}</strong></td>
                            <td style={{ color: 'var(--text-muted)' }}>{r.title || '—'}</td>
                            <td style={{ color: 'var(--text-muted)' }}>{r.territory || '—'}</td>
                            <td style={{ color: 'var(--text-muted)' }}>{r.email || '—'}</td>
                            <td style={{ color: 'var(--text-muted)' }}>{r.phone || '—'}</td>
                            <td style={{ color: 'var(--text-muted)' }}>{r.organization || '—'}</td>
                            <td><span className={`status-pill ${r.is_active !== false ? 'active' : 'inactive'}`}>{r.is_active !== false ? 'Active' : 'Inactive'}</span></td>
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => {
                                  setRepEditTarget(r)
                                  setRepForm({ name: r.name || '', title: r.title || '', territory: r.territory || '', email: r.email || '', phone: r.phone || '', organization: r.organization || '' })
                                  setRepModal('edit')
                                }}>✏ Edit</button>
                                <button className="btn btn-danger" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => deleteRep(r)}>🗑</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Rep Add/Edit Modal */}
                {repModal && (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                    <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 480, padding: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <h3 style={{ margin: 0 }}>{repModal === 'add' ? 'Add Representative' : 'Edit Representative'}</h3>
                        <button onClick={() => setRepModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
                      </div>
                      <form onSubmit={saveRep}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Name *</label>
                            <input className="form-control" value={repForm.name} onChange={e => setRepForm(f => ({ ...f, name: e.target.value }))} required />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Title</label>
                            <input className="form-control" value={repForm.title} onChange={e => setRepForm(f => ({ ...f, title: e.target.value }))} />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Territory</label>
                            <input className="form-control" placeholder="e.g. North India, APAC" value={repForm.territory} onChange={e => setRepForm(f => ({ ...f, territory: e.target.value }))} />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Email</label>
                            <input className="form-control" type="email" value={repForm.email} onChange={e => setRepForm(f => ({ ...f, email: e.target.value }))} />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Phone</label>
                            <input className="form-control" value={repForm.phone} onChange={e => setRepForm(f => ({ ...f, phone: e.target.value }))} />
                          </div>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Organization</label>
                            <select className="form-control" value={repForm.organization} onChange={e => setRepForm(f => ({ ...f, organization: e.target.value }))}>
                              <option value="">— Select org —</option>
                              {orgs.filter(o => o.is_active).map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
                            </select>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                          <button type="button" className="btn btn-outline" onClick={() => setRepModal(null)}>Cancel</button>
                          <button type="submit" className="btn btn-primary">Save</button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )
      }

      case 'case-numbering': {
        const CASE_TYPES = ['ALL', 'MI', 'AE', 'PC']
        return (
          <>
            <SectionHeader title="Case Numbering Setup" desc="Configure auto-generated case number formats per organisation and case type." />
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {/* Config form */}
              <div className="card" style={{ flex: '0 0 400px', maxWidth: 440 }}>
                <div className="card-header"><h3>Configure Format</h3></div>
                <div className="card-body">
                  <form onSubmit={saveCaseNumConfig}>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Organisation (leave blank for global default)</label>
                      <select className="form-control" value={caseNumOrgId} onChange={e => setCaseNumOrgId(e.target.value)}>
                        <option value="">— Global Default —</option>
                        {orgs.filter(o => o.is_active).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Case Type</label>
                      <select className="form-control" value={caseNumForm.case_type} onChange={e => setCaseNumForm(f => ({ ...f, case_type: e.target.value }))}>
                        {CASE_TYPES.map(t => <option key={t} value={t}>{t === 'ALL' ? 'All Case Types (Unified)' : t}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Prefix *</label>
                        <input className="form-control" placeholder="e.g. CASE, MI, AE" value={caseNumForm.prefix} required
                          onChange={e => setCaseNumForm(f => ({ ...f, prefix: e.target.value.toUpperCase() }))}
                          onBlur={refreshCaseNumPreview} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Separator</label>
                        <select className="form-control" value={caseNumForm.separator}
                          onChange={e => { setCaseNumForm(f => ({ ...f, separator: e.target.value })); setTimeout(refreshCaseNumPreview, 50) }}>
                          <option value="-">Hyphen (-)</option>
                          <option value="/">Slash (/)</option>
                          <option value=".">Dot (.)</option>
                          <option value="none">None</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Sequence Length</label>
                        <input className="form-control" type="number" min={3} max={10} value={caseNumForm.seq_length}
                          onChange={e => setCaseNumForm(f => ({ ...f, seq_length: parseInt(e.target.value, 10) }))}
                          onBlur={refreshCaseNumPreview} />
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 20 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input type="checkbox" checked={caseNumForm.include_year}
                            onChange={e => { setCaseNumForm(f => ({ ...f, include_year: e.target.checked })); setTimeout(refreshCaseNumPreview, 50) }} />
                          Include Year
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input type="checkbox" checked={caseNumForm.include_month}
                            onChange={e => { setCaseNumForm(f => ({ ...f, include_month: e.target.checked })); setTimeout(refreshCaseNumPreview, 50) }} />
                          Include Month
                        </label>
                      </div>
                    </div>
                    {/* Live preview */}
                    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Preview:</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 15, color: 'var(--primary)', letterSpacing: 1 }}>{caseNumPreview || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button type="button" className="btn btn-outline" onClick={refreshCaseNumPreview}>Refresh Preview</button>
                      <button type="submit" className="btn btn-primary" disabled={caseNumSaving}>{caseNumSaving ? 'Saving…' : 'Save Configuration'}</button>
                    </div>
                  </form>
                </div>
              </div>

              {/* Saved configs */}
              <div className="card" style={{ flex: 1, minWidth: 280 }}>
                <div className="card-header"><h3>Saved Configurations ({caseNumConfigs.length})</h3></div>
                <div className="card-body" style={{ padding: 0 }}>
                  {caseNumLoading && <div style={{ padding: 16, fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>}
                  {!caseNumLoading && caseNumConfigs.length === 0 && (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                      No configurations yet. Global default will auto-generate as <code>CASE-YYYYMMDD-NNNNN</code>.
                    </div>
                  )}
                  <table className="admin-table">
                    <tbody>
                      {caseNumConfigs.map(c => (
                        <tr key={c.id}>
                          <td>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{c.org_name || 'Global Default'}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Case Type: {c.case_type}</div>
                          </td>
                          <td>
                            <code style={{ fontSize: 13, color: 'var(--primary)' }}>{c.preview}</code>
                          </td>
                          <td style={{ width: 80 }}>
                            {c.is_locked
                              ? <span className="badge" style={{ background: 'var(--warning-light)', color: 'var(--warning)', fontSize: 10 }}>Locked</span>
                              : <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 10px', color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => deleteCaseNumConfig(c.id)}>Delete</button>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )
      }

    default:
      return null
  }
}
