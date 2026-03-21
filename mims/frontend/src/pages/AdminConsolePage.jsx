/**
 * AdminConsolePage.jsx — Full Admin Console
 * Sprint 3 complete implementation covering all IMP, AUD, ACC items.
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Sidebar from '../components/Sidebar'
import Topbar from '../components/Topbar'

const ADMIN_SECTIONS = [
  { group: 'General', items: [
    { key: 'overview',          label: 'Overview',                        active: true  },
    { key: 'sites',             label: 'Sites Setup',                     active: true  },
    { key: 'workflow',          label: 'Workflow Setup',                   active: true  },
    { key: 'source-types',      label: 'Source Types',                    active: true  },
    { key: 'picklists',         label: 'Picklists',                       active: false },
    { key: 'email-accounts',    label: 'Email Accounts',                  active: true  },
    { key: 'case-numbering',    label: 'Case Numbering',                  active: false },
    { key: 'data-protection',   label: 'Data Protection & Privacy Rules', active: false },
    { key: 'transmission-rules',label: 'Transmission Rules',              active: false },
    { key: 'other-configs',     label: 'Other Configurations',            active: false },
    { key: 'case-reporting',    label: 'Case Reporting',                  active: false },
    { key: 'help-system',       label: 'Help System',                     active: false },
    { key: 'ssp-setup',         label: 'SSP Setup',                       active: false },
  ]},
  { group: 'Product Setup', items: [
    { key: 'products',          label: 'Product Dictionary',              active: true  },
    { key: 'product-groups',    label: 'Product Groups',                  active: false },
  ]},
  { group: 'Form Configurations', items: [
    { key: 'field-setup',       label: 'Field Setup',                     active: false },
    { key: 'case-form-def',     label: 'Case Form Definition',            active: false },
    { key: 'custom-forms',      label: 'Custom Forms',                    active: false },
  ]},
  { group: 'Access Configurations', items: [
    { key: 'user-security',     label: 'User Security Groups',            active: true  },
    { key: 'user-config',       label: 'User Configuration',              active: true  },
  ]},
  { group: 'Contact Master', items: [
    { key: 'case-contacts',     label: 'Case Contacts Repository',        active: false },
    { key: 'company-reps',      label: 'Company Representatives',         active: false },
    { key: 'org-address-book',  label: 'Organisation Address Book',       active: false },
  ]},
  { group: 'Analytics', items: [
    { key: 'analytics-url',     label: 'Analytics URL',                   active: false },
    { key: 'analytics-reports', label: 'Analytics Master Reports',        active: false },
  ]},
  { group: 'Integration Setup', items: [
    { key: 'contacts-int',      label: 'Contacts Integration',            active: false },
    { key: 'mir-int',           label: 'MIR Integration',                 active: false },
    { key: 'crm-int',           label: 'CRM Integration Notification',    active: false },
    { key: 'content-int',       label: 'Content Integration',             active: false },
    { key: 'transmission-setup',label: 'Transmission Setup',              active: false },
  ]},
  { group: 'Audit Trail', items: [
    { key: 'audit-admin',       label: 'Admin Audit Trail',               active: true  },
    { key: 'audit-login',       label: 'Login Audit Trail',               active: true  },
  ]},
]

const MODULES = [
  { key: 'inbox',          label: 'Inbox' },
  { key: 'case_mgmt',      label: 'Case Management' },
  { key: 'case_query',     label: 'Case Query' },
  { key: 'utilities',      label: 'Utilities' },
  { key: 'transmissions',  label: 'Transmissions' },
  { key: 'browse_content', label: 'Browse Content' },
  { key: 'analytics',      label: 'Analytics' },
  { key: 'user_mgmt',      label: 'User Management' },
  { key: 'admin_console',  label: 'Admin Console' },
]

const ROLES = ['admin', 'agent', 'reviewer', 'content_manager']
const ROLE_LABELS = { admin: 'Administrator', agent: 'MI Agent', reviewer: 'Reviewer', content_manager: 'Content Manager' }

export default function AdminConsolePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('mims_sidebar_collapsed') === 'true')
  const [theme, setThemeState] = useState(() => localStorage.getItem('mims_theme') || 'light')
  const [activeSection, setActiveSection] = useState('overview')

  // Data
  const [orgs, setOrgs] = useState([])
  const [sites, setSites] = useState({}) // keyed by org_id
  const [expandedOrg, setExpandedOrg] = useState(null)
  const [workflowStates, setWorkflowStates] = useState([])
  const [sourceTypes, setSourceTypes] = useState([])
  const [products, setProducts] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [loginAudit, setLoginAudit] = useState([])
  const [permissions, setPermissions] = useState([])
  const [users, setUsers] = useState([])

  // Forms
  const [orgForm, setOrgForm] = useState({ name: '' })
  const [siteForm, setSiteForm] = useState({ name: '', country: '', is_primary: false })
  const [wfForm, setWfForm] = useState({ name: '' })
  const [srcForm, setSrcForm] = useState({ name: '' })
  const [productForm, setProductForm] = useState({ trade_name: '', org_id: '' })
  const [userForm, setUserForm] = useState({ name: '', email: '', password: '', role: 'agent', org_id: '' })
  const [esigAction, setEsigAction] = useState(null)
  const [esigForm, setEsigForm] = useState({ password: '', reason: '' })
  const [esigError, setEsigError] = useState('')
  const [auditFilter, setAuditFilter] = useState({ from: '', to: '', user: '', action: '' })
  const [loginFilter, setLoginFilter] = useState({ from: '', to: '', user: '' })
  const [msg, setMsg] = useState({ text: '', type: '' })

  // Email Accounts
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
  const [smtpErrorModal, setSmtpErrorModal] = useState(null) // { account_name, error, tested_at }

  const token = localStorage.getItem('mims_token')
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('mims_theme', theme)
  }, [theme])

  useEffect(() => { loadAll() }, [])

  // Fix: Auto-load audit data when section changes (no manual Search needed)
  useEffect(() => {
    if (activeSection === 'audit-login') loadLoginAudit()
    if (activeSection === 'audit-admin') loadAuditLogs()
    if (activeSection === 'email-accounts') loadEmailAccounts()
  }, [activeSection])

  async function loadAll() {
    try {
      const responses = await Promise.all([
        fetch('/api/admin/orgs', { headers: H }),
        fetch('/api/admin/workflow-states', { headers: H }),
        fetch('/api/admin/source-types', { headers: H }),
        fetch('/api/admin/products', { headers: H }),
        fetch('/api/admin/audit-logs', { headers: H }),
        fetch('/api/admin/permissions', { headers: H }),
        fetch('/api/admin/users', { headers: H }),
      ])

      // Detect expired/invalid session — 401 means the JWT expired, not empty data
      if (responses.some(r => r.status === 401)) {
        await logout()
        navigate('/login')
        return
      }

      const [o, wf, src, p, a, perm, u] = await Promise.all([
        responses[0].json().catch(() => ({ orgs: [] })),
        responses[1].json().catch(() => ({ states: [] })),
        responses[2].json().catch(() => ({ sources: [] })),
        responses[3].json().catch(() => ({ products: [] })),
        responses[4].json().catch(() => ({ logs: [] })),
        responses[5].json().catch(() => ({ permissions: [] })),
        responses[6].json().catch(() => ({ users: [] })),
      ])
      setOrgs(o.orgs || [])
      setWorkflowStates(wf.states || [])
      setSourceTypes(src.sources || [])
      setProducts(p.products || [])
      setAuditLogs(a.logs || [])
      setPermissions(perm.permissions || [])
      setUsers(u.users || [])
    } catch (err) {
      flash('Failed to load admin data. Please refresh.', 'error')
    }
  }

  async function loadSites(orgId) {
    const d = await fetch(`/api/admin/orgs/${orgId}/sites`, { headers: H }).then(r => r.json())
    setSites(prev => ({ ...prev, [orgId]: d.sites || [] }))
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

  // ─── Email Account Handlers ────────────────────────────────

  async function readJson(res) {
    // Avoid crashing on HTML/empty responses (e.g. proxy/backend down).
    const text = await res.text()
    try { return JSON.parse(text) } catch { return { error: text || `HTTP ${res.status}` } }
  }

  const EMAIL_FORM_DEFAULTS = {
    org_id: '', account_name: '', provider: 'Generic', direction: 'Both',
    is_active: true, mailbox_email: '', from_email: '', display_name: '',
    is_default_outbound: false,
    imap_host: '', imap_port: '', imap_encryption: 'SSL/TLS',
    imap_username: '', imap_password: '',
    smtp_host: '', smtp_port: '', smtp_encryption: 'SSL/TLS',
    smtp_username: '', smtp_password: '',
    polling_interval_min: 5, initial_fetch_days: 7,
    mailbox_folder: 'INBOX', ingest_attachments: false, max_attachment_mb: 10
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

  function openAddEmailModal() {
    setEmailEditTarget(null)
    setEmailForm(EMAIL_FORM_DEFAULTS)
    setEmailModal('add')
  }

  function openEditEmailModal(account) {
    setEmailEditTarget(account)
    setEmailForm({
      org_id: account.org_id, account_name: account.account_name,
      provider: account.provider, direction: account.direction,
      is_active: !!account.is_active, mailbox_email: account.mailbox_email || '',
      from_email: account.from_email || '', display_name: account.display_name || '',
      is_default_outbound: !!account.is_default_outbound,
      imap_host: account.imap_host || '', imap_port: account.imap_port || '',
      imap_encryption: account.imap_encryption || 'SSL/TLS',
      imap_username: account.imap_username || '', imap_password: '',
      smtp_host: account.smtp_host || '', smtp_port: account.smtp_port || '',
      smtp_encryption: account.smtp_encryption || 'SSL/TLS',
      smtp_username: account.smtp_username || '', smtp_password: '',
      polling_interval_min: account.polling_interval_min ?? 5,
      initial_fetch_days: account.initial_fetch_days ?? 7,
      mailbox_folder: account.mailbox_folder || 'INBOX',
      ingest_attachments: !!account.ingest_attachments,
      max_attachment_mb: account.max_attachment_mb ?? 10
    })
    setEmailModal('edit')
  }

  function applyProviderPreset(provider) {
    const presets = {
      Gmail: { imap_host: 'imap.gmail.com', imap_port: 993, imap_encryption: 'SSL/TLS', smtp_host: 'smtp.gmail.com', smtp_port: 465, smtp_encryption: 'SSL/TLS' },
      Microsoft365: { imap_host: 'outlook.office365.com', imap_port: 993, imap_encryption: 'SSL/TLS', smtp_host: 'smtp.office365.com', smtp_port: 587, smtp_encryption: 'STARTTLS' },
      Generic: {}
    }
    setEmailForm(f => ({ ...f, provider, ...(presets[provider] || {}) }))
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
    if (!res.ok) return flash(d.error || 'Request failed.', 'error')
    setEmailAccounts(prev => prev.map(a => a.id === account.id ? { ...a, is_active: d.is_active } : a))
    flash(d.message)
  }

  async function testImapConnection(account) {
    setEmailTestingId(`imap-${account.id}`)
    const res = await fetch(`/api/admin/email-accounts/${account.id}/test-imap`, { method: 'POST', headers: H })
    const d = await readJson(res)
    setEmailTestingId(null)
    await loadEmailAccounts()
    flash(d.status === 'pass' ? 'IMAP test passed.' : `IMAP test failed: ${d.error}`, d.status === 'pass' ? 'success' : 'error')
  }

  async function testSmtpConnection(account) {
    setEmailTestingId(`smtp-${account.id}`)
    const res = await fetch(`/api/admin/email-accounts/${account.id}/test-smtp`, { method: 'POST', headers: H })
    const d = await readJson(res)
    setEmailTestingId(null)
    await loadEmailAccounts()
    flash(d.status === 'pass' ? 'SMTP test passed.' : `SMTP test failed: ${d.error}`, d.status === 'pass' ? 'success' : 'error')
  }

  function openSendTestModal(account) {
    setSendTestModalId(account.id)
    setSendTestRecipient('')
  }

  async function submitSendTest(e) {
    e.preventDefault()
    setEmailTestingId(`send-${sendTestModalId}`)
    const res = await fetch(`/api/admin/email-accounts/${sendTestModalId}/send-test`, { method: 'POST', headers: H, body: JSON.stringify({ recipient: sendTestRecipient }) })
    const d = await readJson(res)
    setEmailTestingId(null)
    setSendTestModalId(null)
    await loadEmailAccounts()
    flash(d.status === 'pass' ? 'Test email sent successfully.' : `Send failed: ${d.error}`, d.status === 'pass' ? 'success' : 'error')
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

  async function toggleOrgStatus(org) {
    esigConfirm(`${org.is_active ? 'Deactivate' : 'Activate'} organisation "${org.name}"`, 'organisation', org.id, async () => {
      await fetch(`/api/admin/orgs/${org.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ name: org.name, is_active: !org.is_active }) })
      setOrgs(prev => prev.map(o => o.id === org.id ? { ...o, is_active: o.is_active ? 0 : 1 } : o))
      flash(`Organisation ${org.is_active ? 'deactivated' : 'activated'}.`)
    })
  }

  async function toggleExpandOrg(orgId) {
    if (expandedOrg === orgId) { setExpandedOrg(null); return }
    setExpandedOrg(orgId)
    if (!sites[orgId]) await loadSites(orgId)
  }

  async function createSite(orgId) {
    if (!siteForm.name) return flash('Site name required.', 'error')
    const res = await fetch(`/api/admin/orgs/${orgId}/sites`, { method: 'POST', headers: H, body: JSON.stringify({ ...siteForm, org_id: orgId }) })
    const d = await res.json()
    if (!res.ok) return flash(d.error, 'error')
    setSites(prev => ({ ...prev, [orgId]: [...(prev[orgId] || []), d] }))
    setSiteForm({ name: '', country: '', is_primary: false })
    flash('Site added.')
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

  async function createSrc(e) {
    e.preventDefault()
    const res = await fetch('/api/admin/source-types', { method: 'POST', headers: H, body: JSON.stringify(srcForm) })
    const d = await res.json()
    if (!res.ok) return flash(d.error, 'error')
    setSourceTypes(prev => [...prev, d])
    setSrcForm({ name: '' })
    flash('Source type created.')
  }

  async function toggleSrc(src) {
    esigConfirm(`${src.is_active ? 'Deactivate' : 'Activate'} source type "${src.name}"`, 'source_type', src.id, async () => {
      await fetch(`/api/admin/source-types/${src.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ name: src.name, is_active: !src.is_active }) })
      setSourceTypes(prev => prev.map(s => s.id === src.id ? { ...s, is_active: s.is_active ? 0 : 1 } : s))
      flash('Status updated.')
    })
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

  async function togglePermission(role, module, current) {
    esigConfirm(`${current ? 'Revoke' : 'Grant'} access: ${role} → ${module.replace(/_/g, ' ')}`, 'role_permission', null, async () => {
      await fetch('/api/admin/permissions', { method: 'PUT', headers: H, body: JSON.stringify({ role, module, can_access: !current }) })
      setPermissions(prev => prev.map(p => p.role === role && p.module === module ? { ...p, can_access: current ? 0 : 1 } : p))
      flash('Permission updated.')
    })
  }

  function getPermission(role, mod) {
    const p = permissions.find(p => p.role === role && p.module === mod)
    return p ? p.can_access : 0
  }

  // Fix: Parse raw JSON audit details into human-readable text
  function parseAuditDetails(detailsStr, action, entity) {
    try {
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

  function exportCSV(data, filename) {
    if (!data.length) return
    const keys = Object.keys(data[0])
    const csv = [keys.join(','), ...data.map(row => keys.map(k => `"${String(row[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click()
  }

  function toggleSidebar() {
    const next = !collapsed; setCollapsed(next); localStorage.setItem('mims_sidebar_collapsed', next)
  }

  // ─── Shared UI Components ──────────────────────────────────

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
        {msg.text && <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`} style={{ display: 'block', marginTop: 8 }}>{msg.text}</div>}
      </div>
    )
  }

  function StatusPill({ active }) {
    return <span className={`status-pill ${active ? 'active' : 'inactive'}`}>{active ? 'Active' : 'Inactive'}</span>
  }

  function InlineForm({ placeholder, value, onChange, onSubmit, btnLabel = '+ Add' }) {
    return (
      <form onSubmit={onSubmit} style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input className="form-control" placeholder={placeholder} value={value} onChange={onChange} required />
        <button className="btn btn-primary" type="submit" style={{ whiteSpace: 'nowrap' }}>{btnLabel}</button>
      </form>
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
    switch (activeSection) {

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
        return (
          <>
            <SectionHeader title="Sites Setup" desc="Manage pharma client organisations and their sites." />
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header"><h3>Add Organisation</h3></div>
              <div className="card-body">
                <InlineForm placeholder="Organisation name" value={orgForm.name}
                  onChange={e => setOrgForm({ name: e.target.value })} onSubmit={createOrg} />
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3>Organisations ({orgs.length})</h3></div>
              <div className="card-body" style={{ padding: 0 }}>
                <table className="admin-table">
                  <thead><tr><th></th><th>Name</th><th>Status</th><th>Created</th><th>Action</th></tr></thead>
                  <tbody>
                    {orgs.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No organisations yet. Add your first pharma client above.</td></tr>}
                    {orgs.map(o => (
                      <>
                        <tr key={o.id}>
                          <td style={{ width: 32, cursor: 'pointer' }} onClick={() => toggleExpandOrg(o.id)}>
                            {expandedOrg === o.id ? '▼' : '▶'}
                          </td>
                          <td><strong>{o.name}</strong></td>
                          <td><StatusPill active={o.is_active} /></td>
                          <td style={{ color: 'var(--text-muted)' }}>{new Date(o.created_at).toLocaleDateString()}</td>
                          <td>
                            <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => toggleOrgStatus(o)}>
                              {o.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          </td>
                        </tr>
                        {expandedOrg === o.id && (
                          <tr key={`sites-${o.id}`}>
                            <td></td>
                            <td colSpan={4} style={{ background: 'var(--bg)', padding: 16 }}>
                              <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 12, color: 'var(--text-muted)' }}>SITES UNDER {o.name.toUpperCase()}</div>
                              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                <input className="form-control" placeholder="Site name" value={siteForm.name} onChange={e => setSiteForm(f => ({ ...f, name: e.target.value }))} style={{ maxWidth: 180 }} />
                                <input className="form-control" placeholder="Country" value={siteForm.country} onChange={e => setSiteForm(f => ({ ...f, country: e.target.value }))} style={{ maxWidth: 140 }} />
                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                                  <input type="checkbox" checked={siteForm.is_primary} onChange={e => setSiteForm(f => ({ ...f, is_primary: e.target.checked }))} /> Primary
                                </label>
                                <button className="btn btn-accent" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => createSite(o.id)}>+ Add Site</button>
                              </div>
                              {(sites[o.id] || []).length === 0
                                ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No sites yet.</div>
                                : (sites[o.id] || []).map(s => (
                                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                                    <span>{s.name}</span>
                                    {s.country && <span style={{ color: 'var(--text-muted)' }}>— {s.country}</span>}
                                    {s.is_primary ? <span className="badge badge-new">Primary</span> : null}
                                    <StatusPill active={s.is_active} />
                                  </div>
                                ))
                              }
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )

      case 'workflow':
        return (
          <>
            <SectionHeader title="Workflow Setup" desc="Define case workflow states." />
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header"><h3>Add Workflow State</h3></div>
              <div className="card-body">
                <InlineForm placeholder="e.g. New, In Progress, Closed" value={wfForm.name}
                  onChange={e => setWfForm({ name: e.target.value })} onSubmit={createWf} />
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3>Workflow States ({workflowStates.length})</h3></div>
              <div className="card-body" style={{ padding: 0 }}>
                <table className="admin-table">
                  <thead><tr><th>State Name</th><th>Status</th><th>Action</th></tr></thead>
                  <tbody>
                    {workflowStates.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No states yet.</td></tr>}
                    {workflowStates.map(w => (
                      <tr key={w.id}>
                        <td>{w.name}</td>
                        <td><StatusPill active={w.is_active} /></td>
                        <td><button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => toggleWf(w)}>{w.is_active ? 'Deactivate' : 'Activate'}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )

      case 'source-types':
        return (
          <>
            <SectionHeader title="Source Types" desc="Define how inquiries arrive (Email, Phone, Fax, CP Portal etc.)." />
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header"><h3>Add Source Type</h3></div>
              <div className="card-body">
                <InlineForm placeholder="e.g. Email, Phone, Fax, CP Portal" value={srcForm.name}
                  onChange={e => setSrcForm({ name: e.target.value })} onSubmit={createSrc} />
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3>Source Types ({sourceTypes.length})</h3></div>
              <div className="card-body" style={{ padding: 0 }}>
                <table className="admin-table">
                  <thead><tr><th>Source Name</th><th>Status</th><th>Action</th></tr></thead>
                  <tbody>
                    {sourceTypes.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No source types yet.</td></tr>}
                    {sourceTypes.map(s => (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td><StatusPill active={s.is_active} /></td>
                        <td><button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => toggleSrc(s)}>{s.is_active ? 'Deactivate' : 'Activate'}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )

      case 'products':
        return (
          <>
            <SectionHeader title="Product Dictionary" desc="Manage drug/trade names linked to organisations." />
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
                  <thead><tr><th>Trade Name</th><th>Organisation</th><th>Status</th></tr></thead>
                  <tbody>
                    {products.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No products yet.</td></tr>}
                    {products.map(p => (
                      <tr key={p.id}><td>{p.trade_name}</td><td style={{ color: 'var(--text-muted)' }}>{p.org_name || '—'}</td><td><StatusPill active={p.is_active} /></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )

      case 'user-security':
        return (
          <>
            <SectionHeader title="User Security Groups" desc="Control which roles can access which modules. Changes apply immediately." />
            <div className="card">
              <div className="card-header"><h3>Role Permission Matrix</h3></div>
              <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Module</th>
                      {ROLES.map(r => <th key={r}>{ROLE_LABELS[r]}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {MODULES.map(mod => (
                      <tr key={mod.key}>
                        <td><strong>{mod.label}</strong></td>
                        {ROLES.map(role => {
                          const allowed = getPermission(role, mod.key)
                          return (
                            <td key={role} style={{ textAlign: 'center' }}>
                              <button
                                onClick={() => togglePermission(role, mod.key, allowed)}
                                style={{ background: 'none', border: 'none', cursor: role === 'admin' && mod.key === 'admin_console' ? 'not-allowed' : 'pointer', fontSize: 18 }}
                                title={`${allowed ? 'Revoke' : 'Grant'} ${ROLE_LABELS[role]} access to ${mod.label}`}
                                disabled={role === 'admin' && mod.key === 'admin_console'}
                              >
                                {allowed ? '✅' : '🔒'}
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
                  Click ✅ to revoke access &nbsp;|&nbsp; Click 🔒 to grant access
                  <br />
                  <span style={{ color: 'var(--warning)', fontWeight: 500 }}>⚠️ Admin → Admin Console</span> is permanently locked ON and cannot be changed.
                  This is a system safety rule — at least one role must always have admin access to prevent lockout.
                </div>
              </div>
            </div>
          </>
        )

      case 'user-config':
        return (
          <>
            <SectionHeader title="User Configuration" desc="Manage system users, roles and organisation assignments." />
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header"><h3>Add User</h3></div>
              <div className="card-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <input className="form-control" placeholder="Full name" value={userForm.name} onChange={e => setUserForm(f => ({ ...f, name: e.target.value }))} />
                  <input className="form-control" placeholder="Email" value={userForm.email} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))} />
                  <input className="form-control" type="password" placeholder="Password (min 8)" value={userForm.password} onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))} />
                  <select className="form-control" value={userForm.role} onChange={e => setUserForm(f => ({ ...f, role: e.target.value }))}>
                    {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                  <select className="form-control" value={userForm.org_id} onChange={e => setUserForm(f => ({ ...f, org_id: e.target.value }))}>
                    <option value="">Organisation (optional)</option>
                    {orgs.filter(o => o.is_active).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                  <button className="btn btn-primary" onClick={async () => {
                    const res = await fetch('/api/admin/users', { method: 'POST', headers: H, body: JSON.stringify(userForm) })
                    const d = await res.json()
                    if (!res.ok) return flash(d.error, 'error')
                    setUsers(prev => [...prev, d.user])
                    setUserForm({ name: '', email: '', password: '', role: 'agent', org_id: '' })
                    flash('User created.')
                  }}>+ Add User</button>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3>All Users ({users.length})</h3></div>
              <div className="card-body" style={{ padding: 0 }}>
                <table className="admin-table">
                  <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th></tr></thead>
                  <tbody>
                    {users.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No users yet.</td></tr>}
                    {users.map(u => (
                      <tr key={u.id}>
                        <td>{u.name}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{u.email}</td>
                        <td><span className="badge badge-new">{ROLE_LABELS[u.role] || u.role}</span></td>
                        <td><StatusPill active={u.is_active} /></td>
                        <td style={{ color: 'var(--text-muted)' }}>{new Date(u.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )

      case 'audit-admin':
        return (
          <>
            <SectionHeader title="Admin Audit Trail" desc="21 CFR Part 11 — all system changes are logged here. Read-only." onExport exportData={auditLogs} exportFile="admin-audit.csv" />
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header"><h3>Filter</h3></div>
              <div className="card-body">
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <input className="form-control" type="date" placeholder="From" value={auditFilter.from} onChange={e => setAuditFilter(f => ({ ...f, from: e.target.value }))} style={{ maxWidth: 160 }} />
                  <input className="form-control" type="date" placeholder="To" value={auditFilter.to} onChange={e => setAuditFilter(f => ({ ...f, to: e.target.value }))} style={{ maxWidth: 160 }} />
                  <input className="form-control" placeholder="User name" value={auditFilter.user} onChange={e => setAuditFilter(f => ({ ...f, user: e.target.value }))} style={{ maxWidth: 160 }} />
                  <select className="form-control" value={auditFilter.action} onChange={e => setAuditFilter(f => ({ ...f, action: e.target.value }))} style={{ maxWidth: 140 }}>
                    <option value="">All Actions</option>
                    <option value="CREATE">CREATE</option>
                    <option value="UPDATE">UPDATE</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                  <button className="btn btn-primary" onClick={loadAuditLogs} style={{ fontSize: 12 }}>Search</button>
                  <button className="btn btn-outline" onClick={() => { setAuditFilter({ from: '', to: '', user: '', action: '' }); loadAll() }} style={{ fontSize: 12 }}>Clear</button>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h3>Audit Log ({auditLogs.length} entries)</h3></div>
              <div className="card-body" style={{ padding: 0 }}>
                <table className="admin-table">
                  <thead><tr><th>Timestamp (UTC)</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
                  <tbody>
                    {auditLogs.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No audit entries yet. All admin actions will appear here.</td></tr>}
                    {auditLogs.map(l => (
                      <tr key={l.id}>
                        <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 11 }}>{l.created_at} UTC</td>
                        <td>{l.user_name}</td>
                        <td><span className="badge badge-new">{l.action}</span></td>
                        <td style={{ fontSize: 12 }}>{l.entity} #{l.entity_id}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{parseAuditDetails(l.details, l.action, l.entity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )

      case 'audit-login':
        return (
          <>
            <SectionHeader title="Login Audit Trail" desc="21 CFR Part 11 — all login and logout events. Read-only." onExport exportData={loginAudit} exportFile="login-audit.csv" />
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
                  <thead><tr><th>User</th><th>Role</th><th>Login Time</th><th>Logout Time</th><th>Status</th><th>Reason</th></tr></thead>
                  <tbody>
                    {loginAudit.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No login records yet. Click Search to load.</td></tr>}
                    {loginAudit.map(l => (
                      <tr key={l.id}>
                        <td>{l.user_name}</td>
                        <td style={{ fontSize: 11 }}>{l.role}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.login_time}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.logout_time || '—'}</td>
                        <td><span className={`status-pill ${l.status === 'success' ? 'active' : 'inactive'}`}>{l.status}</span></td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.fail_reason || '—'}</td>
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
            <SectionHeader title="Email Accounts" desc="Configure inbound and outbound email accounts per organisation." />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <button className="btn btn-primary" onClick={openAddEmailModal}>+ Add Account</button>
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
                        No email accounts configured. Add your first account above.
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
                                {account.last_smtp_test_status === 'fail' && account.last_smtp_test_error && (
                                  <button
                                    onClick={() => setSmtpErrorModal({ account_name: account.account_name, error: account.last_smtp_test_error, tested_at: account.last_smtp_test_at })}
                                    style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                                  >details</button>
                                )}
                              </span>
                            : '—'}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{account.last_ingest_at || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => openEditEmailModal(account)}>Edit</button>
                            <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => toggleEmailAccount(account)}>{account.is_active ? 'Deactivate' : 'Activate'}</button>
                            {['Inbound', 'Both'].includes(account.direction) && (
                              <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 8px' }} disabled={emailTestingId === `imap-${account.id}`} onClick={() => testImapConnection(account)}>
                                {emailTestingId === `imap-${account.id}` ? 'Testing...' : 'Test IMAP'}
                              </button>
                            )}
                            {['Outbound', 'Both'].includes(account.direction) && (
                              <>
                                <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 8px' }} disabled={emailTestingId === `smtp-${account.id}`} onClick={() => testSmtpConnection(account)}>
                                  {emailTestingId === `smtp-${account.id}` ? 'Testing...' : 'Test SMTP'}
                                </button>
                                <button className="btn btn-primary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => openSendTestModal(account)}>Send Test</button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )

      default:
        const found = ADMIN_SECTIONS.flatMap(s => s.items).find(i => i.key === activeSection)
        return <ComingSoon label={found?.label || activeSection} />
    }
  }

  return (
    <div className="app-wrapper">
      <Sidebar collapsed={collapsed} onCollapse={toggleSidebar} theme={theme} setTheme={setThemeState} />
      <div className="main-content">
        <Topbar title={`Admin Console › ${ADMIN_SECTIONS.flatMap(s => s.items).find(i => i.key === activeSection)?.label || ''}`} onToggleSidebar={toggleSidebar} />
        <div className="page-content" style={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="admin-wrapper">
            <nav className="admin-nav">
              {ADMIN_SECTIONS.map(section => (
                <div key={section.group}>
                  <div className="admin-nav-section">{section.group}</div>
                  {section.items.map(item => (
                    <div key={item.key}
                      className={`admin-nav-item ${activeSection === item.key ? 'active' : ''}`}
                      onClick={() => setActiveSection(item.key)}>
                      {item.active ? '✅ ' : ''}{item.label}
                      {!item.active && <span className="coming-badge">Soon</span>}
                    </div>
                  ))}
                </div>
              ))}
            </nav>
            <div className="admin-content">{renderContent()}</div>
          </div>
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
                    <select className="form-control" value={emailForm.org_id} onChange={e => setEmailForm(f => ({ ...f, org_id: e.target.value }))} required>
                      <option value="">— Select Org —</option>
                      {orgs.filter(o => o.is_active).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
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
  )
}
