import { useState, useEffect } from 'react'
import { confirm } from '../../../shared/utils/confirm'
import { SectionHeader, StatusPill } from './AdminShared'
import { httpFetch } from '../../../shared/api/httpFetch.js'
import { hasGlobalAdminScope } from '../../../shared/utils/adminScope.js'

export default function AdminEmailAccountsPanel({ H, flash }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [orgs, setOrgs] = useState([])
  const [emailAccounts, setEmailAccounts] = useState([])
  const [emailModal, setEmailModal] = useState(null)
  const [emailEditTarget, setEmailEditTarget] = useState(null)
  const [emailForm, setEmailForm] = useState(getDefaultEmailFormBase())
  const [emailTestingId, setEmailTestingId] = useState(null)
  const [sendTestModalId, setSendTestModalId] = useState(null)
  const [sendTestRecipient, setSendTestRecipient] = useState('')
  const [smtpErrorModal, setSmtpErrorModal] = useState(null)
  const [esigAction, setEsigAction] = useState(null)
  const [esigForm, setEsigForm] = useState({ password: '', reason: '' })
  const [esigError, setEsigError] = useState('')

  const isPlatformAdmin = hasGlobalAdminScope(currentUser?.user || currentUser)
  const orgId = currentUser?.orgId || currentUser?.org_id || ''
  const orgName = currentUser?.orgName || currentUser?.org_name || ''

  useEffect(() => {
    loadCurrentUser()
    loadOrgs()
    loadEmailAccounts()
  }, []) // eslint-disable-line

  async function readJson(res) {
    const text = await res.text()
    try { return JSON.parse(text) } catch { return { error: text || `HTTP ${res.status}` } }
  }

  async function loadCurrentUser() {
    try {
      const me = await httpFetch('/api/auth/me', { headers: H }).then(r => r.json())
      setCurrentUser(me || null)
    } catch { setCurrentUser(null) }
  }

  async function loadOrgs() {
    try {
      const d = await httpFetch('/api/admin/orgs', { headers: H }).then(r => r.json())
      setOrgs(d.orgs || [])
    } catch { setOrgs([]) }
  }

  async function loadEmailAccounts() {
    try {
      const res = await httpFetch('/api/admin/email-accounts', { headers: H })
      const d = await readJson(res)
      if (!res.ok) { setEmailAccounts([]); return }
      setEmailAccounts(d.accounts || [])
    } catch { setEmailAccounts([]) }
  }

  function getDefaultEmailForm(overrides = {}) {
    return {
      org_id: isPlatformAdmin ? '' : String(orgId || ''),
      account_name: '', provider: 'Generic', direction: 'Both',
      is_active: true, mailbox_email: '', from_email: '', display_name: '',
      is_default_outbound: false,
      imap_host: '', imap_port: '', imap_encryption: 'SSL/TLS',
      imap_username: '', imap_password: '',
      smtp_host: '', smtp_port: '', smtp_encryption: 'SSL/TLS',
      smtp_username: '', smtp_password: '',
      polling_interval_min: 5, initial_fetch_days: 7,
      mailbox_folder: 'INBOX', ingest_attachments: false, max_attachment_mb: 10,
      ...overrides,
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
    setEmailForm(getDefaultEmailForm({ ...account, org_id: String(account.org_id || orgId || ''), imap_password: '', smtp_password: '' }))
    setEmailModal('edit')
  }

  function esigConfirm(msg, entity, entityId, onConfirm) {
    setEsigForm({ password: '', reason: '' })
    setEsigError('')
    setEsigAction({ msg, entity, entityId, onConfirm })
  }

  async function saveEmailAccount(e) {
    e.preventDefault()
    const isEdit = emailModal === 'edit'
    const url = isEdit ? `/api/admin/email-accounts/${emailEditTarget.id}` : '/api/admin/email-accounts'
    const res = await httpFetch(url, { method: isEdit ? 'PUT' : 'POST', headers: H, body: JSON.stringify(emailForm) })
    const d = await readJson(res)
    if (!res.ok) return flash(d.error || 'Request failed. Is the backend running on :3000?', 'error')
    await loadEmailAccounts()
    setEmailModal(null)
    flash(isEdit ? 'Email account updated.' : 'Email account created.')
  }

  async function toggleEmailAccount(account) {
    const res = await httpFetch(`/api/admin/email-accounts/${account.id}/toggle`, { method: 'PATCH', headers: H })
    const d = await readJson(res)
    if (!res.ok) return flash(d.error || 'Status update failed.', 'error')
    await loadEmailAccounts()
    flash(d.message || 'Email account status updated.')
  }

  async function deleteEmailAccount(account) {
    esigConfirm(`Delete email account "${account.account_name}"? This will remove credentials from storage.`, 'email_account', account.id, async () => {
      const res = await httpFetch(`/api/admin/email-accounts/${account.id}`, { method: 'DELETE', headers: H })
      const d = await readJson(res)
      if (!res.ok) return flash(d.error || 'Delete failed.', 'error')
      await loadEmailAccounts()
      flash(d.message || 'Email account deleted.')
    })
  }

  async function runEmailAction(account, action) {
    const actionLabel = action === 'fetch-now' ? 'fetch emails now' : action === 'test-imap' ? 'run IMAP test' : action === 'test-smtp' ? 'run SMTP test' : `run ${action}`
    if (!await confirm(`Confirm to ${actionLabel} for "${account.account_name}"?`)) return
    const key = `${action}-${account.id}`
    setEmailTestingId(key)
    try {
      const res = await httpFetch(`/api/admin/email-accounts/${account.id}/${action}`, { method: 'POST', headers: H })
      const d = await readJson(res)
      if (!res.ok) {
        if (action === 'test-smtp') setSmtpErrorModal({ account_name: account.account_name, error: d.error || 'SMTP test failed.', tested_at: 'Just now' })
        return flash(d.error || 'Request failed.', 'error')
      }
      await loadEmailAccounts()
      if (action === 'fetch-now') {
        flash(`Fetch complete. ${d.ingested ?? 0} email(s) ingested.`)
      } else if (d.status === 'fail') {
        if (action === 'test-smtp') setSmtpErrorModal({ account_name: account.account_name, error: d.error || 'SMTP test failed.', tested_at: d.tested_at || 'Just now' })
        flash(`${action === 'test-imap' ? 'IMAP' : 'SMTP'} test failed.`, 'error')
      } else {
        flash(action === 'test-imap' ? 'IMAP test passed.' : action === 'test-smtp' ? 'SMTP test passed.' : 'Action completed.')
      }
    } finally { setEmailTestingId(null) }
  }

  async function submitSendTest(e) {
    e.preventDefault()
    if (!sendTestModalId) return
    setEmailTestingId(`send-${sendTestModalId}`)
    try {
      const res = await httpFetch(`/api/admin/email-accounts/${sendTestModalId}/send-test`, { method: 'POST', headers: H, body: JSON.stringify({ recipient: sendTestRecipient }) })
      const d = await readJson(res)
      if (!res.ok || d.status === 'fail') {
        const account = emailAccounts.find(a => a.id === sendTestModalId)
        setSmtpErrorModal({ account_name: account?.account_name || 'Email account', error: d.error || 'Send test failed.', tested_at: d.tested_at || 'Just now' })
        return flash(d.error || 'Send test failed.', 'error')
      }
      await loadEmailAccounts()
      setSendTestModalId(null)
      setSendTestRecipient('')
      flash('Test email sent successfully.')
    } finally { setEmailTestingId(null) }
  }

  return (
    <>
      <SectionHeader
        title="Email Accounts"
        desc={isPlatformAdmin ? 'Manage email accounts across organisations as a platform admin.' : `Manage email accounts for ${orgName || 'your active organisation'}. These accounts remain isolated per organisation.`}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ padding: '8px 14px', background: '#eef7ff', border: '1px solid #cfe8ff', borderRadius: 6, fontSize: 12, color: '#0b5394' }}>
          {isPlatformAdmin ? 'Platform admins can manage email accounts across organisations. Org admins will only see and manage accounts for their active organisation.' : 'Email account setup is managed inside MIMS and stays isolated to your active organisation.'}
        </div>
        <button className="btn btn-primary" onClick={openAddEmailModal}>+ Add Email Account</button>
      </div>
      <div className="card">
        <div className="card-header"><h3>Email Accounts ({emailAccounts.length})</h3></div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Org</th><th>Account Name</th><th>Provider</th><th>Direction</th>
                <th>Mailbox Email</th><th>From Email</th><th>Active</th>
                <th>Last IMAP Test</th><th>Last SMTP Test</th><th>Last Ingest</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {emailAccounts.length === 0 && (
                <tr><td colSpan={11} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No email accounts configured yet. Add one for the active organisation to enable inbound or outbound email flows.</td></tr>
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
                    {account.last_imap_test_at ? <span style={{ color: account.last_imap_test_status === 'pass' ? 'var(--success)' : 'var(--danger)' }}>{account.last_imap_test_status} · {account.last_imap_test_at}</span> : '—'}
                  </td>
                  <td style={{ fontSize: 11 }}>
                    {account.last_smtp_test_at ? <span style={{ color: account.last_smtp_test_status === 'pass' ? 'var(--success)' : 'var(--danger)' }}>{account.last_smtp_test_status} · {account.last_smtp_test_at}</span> : '—'}
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{account.last_ingest_at || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn btn-outline" style={{ fontSize: 11 }} onClick={() => openEditEmailModal(account)}>Edit</button>
                      <button className="btn btn-outline" style={{ fontSize: 11 }} onClick={() => toggleEmailAccount(account)}>{account.is_active ? 'Deactivate' : 'Activate'}</button>
                      {['Inbound', 'Both'].includes(account.direction) && (
                        <>
                          <button className="btn btn-outline" style={{ fontSize: 11 }} onClick={() => runEmailAction(account, 'test-imap')} disabled={emailTestingId === `test-imap-${account.id}`}>
                            {emailTestingId === `test-imap-${account.id}` ? 'Testing...' : 'Test IMAP'}
                          </button>
                          <button className="btn btn-outline" style={{ fontSize: 11 }} onClick={() => runEmailAction(account, 'fetch-now')} disabled={emailTestingId === `fetch-now-${account.id}`}>
                            {emailTestingId === `fetch-now-${account.id}` ? 'Fetching...' : 'Fetch Now'}
                          </button>
                        </>
                      )}
                      {['Outbound', 'Both'].includes(account.direction) && (
                        <>
                          <button className="btn btn-outline" style={{ fontSize: 11 }} onClick={() => runEmailAction(account, 'test-smtp')} disabled={emailTestingId === `test-smtp-${account.id}`}>
                            {emailTestingId === `test-smtp-${account.id}` ? 'Testing...' : 'Test SMTP'}
                          </button>
                          <button className="btn btn-outline" style={{ fontSize: 11 }} onClick={() => { setSendTestModalId(account.id); setSendTestRecipient('') }}>Send Test</button>
                        </>
                      )}
                      <button className="btn btn-outline" style={{ fontSize: 11, color: 'var(--danger)' }} onClick={() => deleteEmailAccount(account)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {esigAction && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 460, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Electronic Signature Required</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>{esigAction.msg}</p>
            <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
              <input className="form-control" type="password" placeholder="Your password (required)" value={esigForm.password} onChange={e => setEsigForm(f => ({ ...f, password: e.target.value }))} />
              <textarea className="form-control" placeholder="Reason / justification for this change (required)" rows={2} style={{ resize: 'none' }} value={esigForm.reason} onChange={e => setEsigForm(f => ({ ...f, reason: e.target.value }))} />
              {esigError && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{esigError}</div>}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setEsigAction(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={async () => {
                if (!esigForm.password || !esigForm.reason) { setEsigError('Both password and reason are required.'); return }
                try {
                  const r = await httpFetch('/api/admin/esig-verify', { method: 'POST', headers: H, body: JSON.stringify({ password: esigForm.password, reason: esigForm.reason, action: esigAction.msg, entity: esigAction.entity, entity_id: esigAction.entityId }) })
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

      {emailModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', padding: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0 }}>{emailModal === 'add' ? 'Add Email Account' : 'Edit Email Account'}</h3>
              <button onClick={() => setEmailModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>
            <form onSubmit={saveEmailAccount}>
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>Identity</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Organisation *</label>
                    {isPlatformAdmin ? (
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
                      <option>Gmail</option><option>Microsoft365</option><option>Generic</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Direction *</label>
                    <select className="form-control" value={emailForm.direction} onChange={e => setEmailForm(f => ({ ...f, direction: e.target.value }))} required>
                      <option>Inbound</option><option>Outbound</option><option>Both</option>
                    </select>
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={emailForm.is_active} onChange={e => setEmailForm(f => ({ ...f, is_active: e.target.checked }))} />
                  Active
                </label>
              </div>

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

              {['Inbound', 'Both'].includes(emailForm.direction) && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>Inbound (IMAP)</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>IMAP Host *</label><input className="form-control" value={emailForm.imap_host} onChange={e => setEmailForm(f => ({ ...f, imap_host: e.target.value }))} required /></div>
                    <div><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>IMAP Port *</label><input className="form-control" type="number" value={emailForm.imap_port} onChange={e => setEmailForm(f => ({ ...f, imap_port: e.target.value }))} required /></div>
                    <div><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Encryption *</label><select className="form-control" value={emailForm.imap_encryption} onChange={e => setEmailForm(f => ({ ...f, imap_encryption: e.target.value }))}><option>SSL/TLS</option><option>STARTTLS</option><option>None</option></select></div>
                    <div><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Username *</label><input className="form-control" value={emailForm.imap_username} onChange={e => setEmailForm(f => ({ ...f, imap_username: e.target.value }))} required /></div>
                    <div style={{ gridColumn: '1 / -1' }}><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Password {emailModal === 'edit' ? '(leave blank to keep existing)' : '*'}</label><input className="form-control" type="password" value={emailForm.imap_password} onChange={e => setEmailForm(f => ({ ...f, imap_password: e.target.value }))} required={emailModal === 'add'} /></div>
                  </div>
                </div>
              )}

              {['Outbound', 'Both'].includes(emailForm.direction) && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>Outbound (SMTP)</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>SMTP Host *</label><input className="form-control" value={emailForm.smtp_host} onChange={e => setEmailForm(f => ({ ...f, smtp_host: e.target.value }))} required /></div>
                    <div><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>SMTP Port *</label><input className="form-control" type="number" value={emailForm.smtp_port} onChange={e => setEmailForm(f => ({ ...f, smtp_port: e.target.value }))} required /></div>
                    <div><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Encryption *</label><select className="form-control" value={emailForm.smtp_encryption} onChange={e => setEmailForm(f => ({ ...f, smtp_encryption: e.target.value }))}><option>SSL/TLS</option><option>STARTTLS</option><option>None</option></select></div>
                    <div><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Username *</label><input className="form-control" value={emailForm.smtp_username} onChange={e => setEmailForm(f => ({ ...f, smtp_username: e.target.value }))} required /></div>
                    <div style={{ gridColumn: '1 / -1' }}><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Password {emailModal === 'edit' ? '(leave blank to keep existing)' : '*'}</label><input className="form-control" type="password" value={emailForm.smtp_password} onChange={e => setEmailForm(f => ({ ...f, smtp_password: e.target.value }))} required={emailModal === 'add'} /></div>
                  </div>
                </div>
              )}

              {['Inbound', 'Both'].includes(emailForm.direction) && (
                <div style={{ marginBottom: 20 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>Ingestion Controls</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Polling Interval (min)</label><input className="form-control" type="number" min={1} value={emailForm.polling_interval_min} onChange={e => setEmailForm(f => ({ ...f, polling_interval_min: Number(e.target.value) }))} /></div>
                    <div><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Initial Fetch Window (days)</label><input className="form-control" type="number" min={1} value={emailForm.initial_fetch_days} onChange={e => setEmailForm(f => ({ ...f, initial_fetch_days: Number(e.target.value) }))} /></div>
                    <div><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Mailbox Folder</label><input className="form-control" value={emailForm.mailbox_folder} onChange={e => setEmailForm(f => ({ ...f, mailbox_folder: e.target.value }))} /></div>
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

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <button type="button" className="btn btn-outline" onClick={() => setEmailModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{emailModal === 'add' ? 'Create Account' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {smtpErrorModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 480, padding: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin: '0 0 4px', color: 'var(--danger)' }}>SMTP Test Failed</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Account: <strong>{smtpErrorModal.account_name}</strong> &nbsp;·&nbsp; {smtpErrorModal.tested_at}</p>
            <pre style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 14, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--danger)', margin: '0 0 20px' }}>{smtpErrorModal.error}</pre>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn btn-outline" onClick={() => setSmtpErrorModal(null)}>Close</button></div>
          </div>
        </div>
      )}

      {sendTestModalId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 400, padding: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin: '0 0 8px' }}>Send Test Email</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Account: <strong>{emailAccounts.find(a => a.id === sendTestModalId)?.account_name}</strong></p>
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
    </>
  )
}

function getDefaultEmailFormBase() {
  return {
    org_id: '', account_name: '', provider: 'Generic', direction: 'Both',
    is_active: true, mailbox_email: '', from_email: '', display_name: '',
    is_default_outbound: false,
    imap_host: '', imap_port: '', imap_encryption: 'SSL/TLS',
    imap_username: '', imap_password: '',
    smtp_host: '', smtp_port: '', smtp_encryption: 'SSL/TLS',
    smtp_username: '', smtp_password: '',
    polling_interval_min: 5, initial_fetch_days: 7,
    mailbox_folder: 'INBOX', ingest_attachments: false, max_attachment_mb: 10,
  }
}
