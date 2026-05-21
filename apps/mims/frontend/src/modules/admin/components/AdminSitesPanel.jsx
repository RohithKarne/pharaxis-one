import { useState, useEffect, useCallback } from 'react'
import { confirm } from '../../../shared/utils/confirm'
import { StatusPill } from './AdminShared'
import { httpFetch } from '../../../shared/api/httpFetch.js'

const SITE_TABS = [
  { key: 'general',   label: 'General' },
  { key: 'email',     label: 'Email Accounts' },
  { key: 'response',  label: 'Response' },
  { key: 'rtf',       label: 'Right To Forget' },
  { key: 'alerts',    label: 'Alerts Configuration' },
]

const EMAIL_PURPOSES = [
  { key: 'response',       label: 'Response Emails',  required: true  },
  { key: 'transmissions',  label: 'Transmissions',     required: true  },
  { key: 'correspondence', label: 'Correspondence',    required: true  },
  { key: 'fax',            label: 'Fax',              required: false },
]

export default function AdminSitesPanel({ H, flash }) {
  const [orgs, setOrgs] = useState([])
  const [emailAccounts, setEmailAccounts] = useState([])
  const [sitesList, setSitesList] = useState([])
  const [sitesLoading, setSitesLoading] = useState(false)
  const [sitesSearch, setSitesSearch] = useState('')
  const [showNewSiteForm, setShowNewSiteForm] = useState(false)
  const [newSiteForm, setNewSiteForm] = useState({ org_id: '', name: '', abbreviation: '', country: '', is_primary: false })
  const [newSiteSaving, setNewSiteSaving] = useState(false)
  const [selectedSite, setSelectedSite] = useState(null)
  const [siteMainTab, setSiteMainTab] = useState('general')
  const [siteGeneralForm, setSiteGeneralForm] = useState({ name: '', abbreviation: '', country: '', is_primary: false, is_active: true })
  const [siteGeneralSaving, setSiteGeneralSaving] = useState(false)
  const [siteEmailPurposes, setSiteEmailPurposes] = useState({ response: [], transmissions: [], correspondence: [], fax: [] })
  const [siteEmailPurposeSaving, setSiteEmailPurposeSaving] = useState(false)
  const [siteResponseTemplate, setSiteResponseTemplate] = useState({ subject: '', body_html: '' })
  const [siteRetentionRules, setSiteRetentionRules] = useState([])
  const [siteRetentionForm, setSiteRetentionForm] = useState({ retention_days: 2555, regulation: 'GDPR', auto_delete_enabled: false, notes: '' })
  const [siteAlerts, setSiteAlerts] = useState([])
  const [siteAlertForm, setSiteAlertForm] = useState({ alert_type: 'Case Volume Spike', threshold_value: 10, notify_emails: '' })
  const [siteTabLoading, setSiteTabLoading] = useState(false)

  async function readJson(res) {
    const text = await res.text()
    try { return JSON.parse(text) } catch { return { error: text || `HTTP ${res.status}` } }
  }

  const loadOrgs = useCallback(async () => {
    try { const d = await httpFetch('/api/admin/orgs', { headers: H }).then(r => r.json()); setOrgs(d.orgs || []) }
    catch { setOrgs([]) }
  }, [H])

  const loadEmailAccounts = useCallback(async () => {
    try {
      const res = await httpFetch('/api/admin/email-accounts', { headers: H })
      const d = await readJson(res)
      setEmailAccounts(res.ok ? (d.accounts || []) : [])
    } catch { setEmailAccounts([]) }
  }, [H])

  const loadAllSites = useCallback(async () => {
    setSitesLoading(true)
    try { const d = await httpFetch('/api/admin/sites', { headers: H }).then(r => r.json()); setSitesList(d.sites || []) }
    catch { flash('Failed to load sites.', 'error') } finally { setSitesLoading(false) }
  }, [H, flash])

  useEffect(() => {
    loadAllSites()
    loadOrgs()
    loadEmailAccounts()
  }, [loadAllSites, loadEmailAccounts, loadOrgs])

  async function createNewSite(e) {
    e.preventDefault()
    setNewSiteSaving(true)
    try {
      const res = await httpFetch('/api/admin/sites', { method: 'POST', headers: H, body: JSON.stringify(newSiteForm) })
      const d = await res.json()
      if (!res.ok) return flash(d.error || 'Create failed.', 'error')
      flash('Site created.', 'success')
      setShowNewSiteForm(false)
      setNewSiteForm({ org_id: '', name: '', abbreviation: '', country: '', is_primary: false })
      await loadAllSites()
    } catch { flash('Save failed.', 'error') } finally { setNewSiteSaving(false) }
  }

  async function selectSiteForConfig(site) {
    setSelectedSite(site)
    setSiteMainTab('general')
    setSiteGeneralForm({ name: site.name || '', abbreviation: site.abbreviation || '', country: site.country || '', is_primary: !!site.is_primary, is_active: site.is_active !== undefined ? !!site.is_active : true })
    await loadSiteEmailPurposes(site.id)
    loadSiteTab('response', site.id)
    loadSiteTab('retention', site.id)
    loadSiteTab('alerts', site.id)
  }

  async function loadSiteTab(tab, siteId) {
    setSiteTabLoading(true)
    try {
      if (tab === 'response') {
        const d = await httpFetch(`/api/admin/sites/${siteId}/response-template`, { headers: H }).then(r => r.json())
        setSiteResponseTemplate(d.template || { subject: '', body_html: '' })
      } else if (tab === 'retention') {
        const d = await httpFetch(`/api/admin/sites/${siteId}/data-retention`, { headers: H }).then(r => r.json())
        setSiteRetentionRules(d.rules || [])
      } else if (tab === 'alerts') {
        const d = await httpFetch(`/api/admin/sites/${siteId}/alerts`, { headers: H }).then(r => r.json())
        setSiteAlerts(d.alerts || [])
      }
    } catch { /* silent */ } finally { setSiteTabLoading(false) }
  }

  async function loadSiteEmailPurposes(siteId) {
    try {
      const d = await httpFetch(`/api/admin/sites/${siteId}/email-purpose`, { headers: H }).then(r => r.json())
      const map = { response: [], transmissions: [], correspondence: [], fax: [] }
      for (const row of (d.purposes || [])) {
        if (map[row.purpose] !== undefined) map[row.purpose].push(row.email_account_id)
      }
      setSiteEmailPurposes(map)
    } catch { /* silent */ }
  }

  async function saveSiteGeneral(e) {
    e.preventDefault()
    if (!selectedSite) return
    setSiteGeneralSaving(true)
    try {
      const res = await httpFetch(`/api/admin/sites/${selectedSite.id}`, { method: 'PUT', headers: H, body: JSON.stringify(siteGeneralForm) })
      const d = await res.json()
      if (!res.ok) return flash(d.error || 'Save failed.', 'error')
      flash('Site updated.', 'success')
      await loadAllSites()
      setSelectedSite(prev => ({ ...prev, ...siteGeneralForm }))
    } catch { flash('Save failed.', 'error') } finally { setSiteGeneralSaving(false) }
  }

  async function saveSiteEmailPurposes() {
    if (!selectedSite) return
    setSiteEmailPurposeSaving(true)
    try {
      const assignments = Object.entries(siteEmailPurposes).map(([purpose, ids]) => ({ purpose, email_account_ids: ids }))
      const res = await httpFetch(`/api/admin/sites/${selectedSite.id}/email-purpose`, { method: 'PUT', headers: H, body: JSON.stringify({ assignments }) })
      const d = await res.json()
      if (!res.ok) return flash(d.error || 'Save failed.', 'error')
      flash('Email account assignments saved.', 'success')
    } catch { flash('Save failed.', 'error') } finally { setSiteEmailPurposeSaving(false) }
  }

  async function saveSiteResponseTemplate(e) {
    e.preventDefault()
    if (!selectedSite) return
    const res = await httpFetch(`/api/admin/sites/${selectedSite.id}/response-template`, { method: 'PUT', headers: H, body: JSON.stringify(siteResponseTemplate) })
    const d = await res.json()
    if (!res.ok) return flash(d.error, 'error')
    setSiteResponseTemplate(d.template)
    flash('Response template saved.', 'success')
  }

  async function saveSiteRetention(e) {
    e.preventDefault()
    if (!selectedSite) return
    const res = await httpFetch(`/api/admin/sites/${selectedSite.id}/data-retention`, { method: 'PUT', headers: H, body: JSON.stringify(siteRetentionForm) })
    const d = await res.json()
    if (!res.ok) return flash(d.error, 'error')
    setSiteRetentionRules(d.rules)
    flash('Data retention rule saved.', 'success')
  }

  async function addSiteAlert(e) {
    e.preventDefault()
    if (!selectedSite) return
    const res = await httpFetch(`/api/admin/sites/${selectedSite.id}/alerts`, { method: 'POST', headers: H, body: JSON.stringify(siteAlertForm) })
    const d = await res.json()
    if (!res.ok) return flash(d.error, 'error')
    setSiteAlerts(prev => [...prev, d.alert])
    setSiteAlertForm({ alert_type: 'Case Volume Spike', threshold_value: 10, notify_emails: '' })
    flash('Alert added.', 'success')
  }

  async function deleteSiteAlert(alertId) {
    if (!selectedSite || !await confirm('Delete this site alert?')) return
    const res = await httpFetch(`/api/admin/sites/${selectedSite.id}/alerts/${alertId}`, { method: 'DELETE', headers: H })
    if (res.ok) { setSiteAlerts(prev => prev.filter(a => a.id !== alertId)); flash('Deleted.', 'success') }
  }

  const filteredSites = sitesList.filter(s =>
    !sitesSearch ||
    s.name?.toLowerCase().includes(sitesSearch.toLowerCase()) ||
    (s.abbreviation || '').toLowerCase().includes(sitesSearch.toLowerCase())
  )

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }} />
        <input className="form-control" placeholder="Search by site name or abbreviation…" value={sitesSearch} onChange={e => setSitesSearch(e.target.value)} style={{ maxWidth: 260, fontSize: 13 }} />
        <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => { setShowNewSiteForm(v => !v); setSelectedSite(null) }}>+ Add New</button>
      </div>

      {showNewSiteForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h3>New Site</h3></div>
          <div className="card-body">
            <form onSubmit={createNewSite}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="form-group" style={{ margin: 0, minWidth: 180 }}>
                  <label>Organisation *</label>
                  <select className="form-control" required value={newSiteForm.org_id} onChange={e => setNewSiteForm(f => ({ ...f, org_id: e.target.value }))}>
                    <option value="">— Select Org —</option>
                    {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0, minWidth: 200 }}>
                  <label>Site Name *</label>
                  <input className="form-control" required placeholder="e.g. North America" value={newSiteForm.name} onChange={e => setNewSiteForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="form-group" style={{ margin: 0, minWidth: 120 }}>
                  <label>Abbreviation</label>
                  <input className="form-control" placeholder="e.g. NA" value={newSiteForm.abbreviation} onChange={e => setNewSiteForm(f => ({ ...f, abbreviation: e.target.value }))} />
                </div>
                <div className="form-group" style={{ margin: 0, minWidth: 160 }}>
                  <label>Country</label>
                  <input className="form-control" placeholder="e.g. United States" value={newSiteForm.country} onChange={e => setNewSiteForm(f => ({ ...f, country: e.target.value }))} />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, paddingBottom: 2 }}>
                  <input type="checkbox" checked={newSiteForm.is_primary} onChange={e => setNewSiteForm(f => ({ ...f, is_primary: e.target.checked }))} />
                  Primary Site
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="btn btn-primary" style={{ fontSize: 13 }} disabled={newSiteSaving}>{newSiteSaving ? 'Saving…' : 'Save Site'}</button>
                  <button type="button" className="btn btn-outline" style={{ fontSize: 13 }} onClick={() => setShowNewSiteForm(false)}>Cancel</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: selectedSite ? 16 : 0 }}>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="admin-table">
            <thead>
              <tr><th>Site Name</th><th>Organisation</th><th>Abbreviation</th><th>Country</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {sitesLoading && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>Loading…</td></tr>}
              {!sitesLoading && filteredSites.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                  {sitesSearch ? 'No sites match your search.' : 'No sites configured yet. Click + Add New to create one.'}
                </td></tr>
              )}
              {filteredSites.map(s => (
                <tr key={s.id} style={{ cursor: 'pointer', background: selectedSite?.id === s.id ? 'var(--primary-light, #e8f0fe)' : undefined }}
                  onClick={() => { if (selectedSite?.id === s.id) { setSelectedSite(null); return } selectSiteForConfig(s); setShowNewSiteForm(false) }}>
                  <td>
                    <span style={{ fontWeight: 600, color: selectedSite?.id === s.id ? 'var(--primary)' : undefined }}>{s.name}</span>
                    {s.is_primary ? <span className="badge badge-new" style={{ marginLeft: 6, fontSize: 10 }}>Primary</span> : null}
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{s.org_name || '—'}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{s.abbreviation || '—'}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{s.country || '—'}</td>
                  <td><StatusPill active={s.is_active} /></td>
                  <td style={{ textAlign: 'right' }}><span style={{ fontSize: 11, color: 'var(--primary)' }}>{selectedSite?.id === s.id ? '▲ Close' : 'Configure ▼'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedSite && (
        <div className="card" style={{ border: '1px solid var(--primary)' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{selectedSite.name}</div>
            {selectedSite.abbreviation && <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>({selectedSite.abbreviation})</span>}
            {selectedSite.org_name && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>— {selectedSite.org_name}</span>}
            <button className="btn btn-outline" style={{ marginLeft: 'auto', fontSize: 11, padding: '3px 12px' }} onClick={() => setSelectedSite(null)}>✕ Close</button>
          </div>

          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
            {SITE_TABS.map(tab => (
              <button key={tab.key} type="button"
                style={{ padding: '10px 20px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: siteMainTab === tab.key ? 700 : 400, color: siteMainTab === tab.key ? 'var(--primary)' : 'var(--text-muted)', borderBottom: siteMainTab === tab.key ? '2px solid var(--primary)' : '2px solid transparent', transition: 'all 0.15s' }}
                onClick={() => {
                  setSiteMainTab(tab.key)
                  if (tab.key === 'email') loadSiteEmailPurposes(selectedSite.id)
                  else if (tab.key === 'response') loadSiteTab('response', selectedSite.id)
                  else if (tab.key === 'rtf') loadSiteTab('retention', selectedSite.id)
                  else if (tab.key === 'alerts') loadSiteTab('alerts', selectedSite.id)
                }}>
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ padding: 24 }}>
            {siteMainTab === 'general' && (
              <form onSubmit={saveSiteGeneral}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Site Name *</label>
                    <input className="form-control" required value={siteGeneralForm.name} onChange={e => setSiteGeneralForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Abbreviation</label>
                    <input className="form-control" value={siteGeneralForm.abbreviation} onChange={e => setSiteGeneralForm(f => ({ ...f, abbreviation: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Country</label>
                    <input className="form-control" value={siteGeneralForm.country} onChange={e => setSiteGeneralForm(f => ({ ...f, country: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Status</label>
                    <select className="form-control" value={siteGeneralForm.is_active ? 'active' : 'inactive'} onChange={e => setSiteGeneralForm(f => ({ ...f, is_active: e.target.value === 'active' }))}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 20, cursor: 'pointer', width: 'fit-content' }}>
                  <input type="checkbox" checked={siteGeneralForm.is_primary} onChange={e => setSiteGeneralForm(f => ({ ...f, is_primary: e.target.checked }))} />
                  Mark as Primary Site for this Organisation
                </label>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="submit" className="btn btn-primary" disabled={siteGeneralSaving}>{siteGeneralSaving ? 'Saving…' : 'Save Changes'}</button>
                </div>
              </form>
            )}

            {siteMainTab === 'email' && (
              <>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
                  Assign email accounts to each communication purpose for this site. Select from email accounts configured in Email Accounts setup.
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 20 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                      <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, width: 200 }}>Purpose</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, width: 100 }}>Required</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Email Accounts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {EMAIL_PURPOSES.map((p, i) => (
                      <tr key={p.key} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--bg)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>{p.label}</td>
                        <td style={{ padding: '12px 16px' }}>
                          {p.required
                            ? <span style={{ background: '#e8f5e9', color: '#2e7d32', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>Mandatory</span>
                            : <span style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: 12, fontSize: 11 }}>Optional</span>
                          }
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {emailAccounts.length === 0
                            ? <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No email accounts found. Configure them in Email Accounts setup first.</span>
                            : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {emailAccounts.map(ea => {
                                  const checked = (siteEmailPurposes[p.key] || []).includes(ea.id)
                                  return (
                                    <label key={ea.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '5px 10px', border: `1px solid ${checked ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 6, cursor: 'pointer', background: checked ? 'var(--primary-light, #e8f0fe)' : 'var(--surface)', color: checked ? 'var(--primary)' : 'var(--text-primary)', userSelect: 'none' }}>
                                      <input type="checkbox" checked={checked} style={{ display: 'none' }}
                                        onChange={ev => setSiteEmailPurposes(prev => ({ ...prev, [p.key]: ev.target.checked ? [...(prev[p.key] || []), ea.id] : (prev[p.key] || []).filter(id => id !== ea.id) }))} />
                                      <span style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${checked ? 'var(--primary)' : 'var(--border)'}`, background: checked ? 'var(--primary)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        {checked && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span>}
                                      </span>
                                      <span>{ea.account_name || ea.mailbox_email}</span>
                                      {ea.mailbox_email && ea.account_name && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({ea.mailbox_email})</span>}
                                    </label>
                                  )
                                })}
                              </div>
                            )
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn btn-primary" onClick={saveSiteEmailPurposes} disabled={siteEmailPurposeSaving}>{siteEmailPurposeSaving ? 'Saving…' : 'Save Email Assignments'}</button>
                </div>
              </>
            )}

            {siteMainTab === 'response' && (
              <form onSubmit={saveSiteResponseTemplate}>
                {siteTabLoading && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>}
                {!siteTabLoading && (
                  <>
                    <div className="form-group">
                      <label>Email Subject</label>
                      <input className="form-control" placeholder="e.g. Thank you for your inquiry — {{case_number}}" value={siteResponseTemplate?.subject || ''} onChange={e => setSiteResponseTemplate(t => ({ ...t, subject: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label>Email Body <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(HTML supported)</span></label>
                      <textarea className="form-control" rows={8} placeholder="Your inquiry has been received. Case number: {{case_number}}" value={siteResponseTemplate?.body_html || ''} onChange={e => setSiteResponseTemplate(t => ({ ...t, body_html: e.target.value }))} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button type="submit" className="btn btn-primary">Save Template</button>
                    </div>
                  </>
                )}
              </form>
            )}

            {siteMainTab === 'rtf' && (
              <>
                {siteTabLoading && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>}
                {!siteTabLoading && (
                  <>
                    <form onSubmit={saveSiteRetention} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Regulation</label>
                        <select className="form-control" value={siteRetentionForm.regulation} onChange={e => setSiteRetentionForm(f => ({ ...f, regulation: e.target.value }))}>
                          <option value="GDPR">GDPR</option>
                          <option value="HIPAA">HIPAA</option>
                          <option value="LOCAL">Local</option>
                        </select>
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Retention (days)</label>
                        <input className="form-control" type="number" min={30} value={siteRetentionForm.retention_days} onChange={e => setSiteRetentionForm(f => ({ ...f, retention_days: parseInt(e.target.value, 10) }))} style={{ maxWidth: 120 }} />
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, paddingBottom: 2 }}>
                        <input type="checkbox" checked={siteRetentionForm.auto_delete_enabled} onChange={e => setSiteRetentionForm(f => ({ ...f, auto_delete_enabled: e.target.checked }))} />
                        Auto-Delete Enabled
                      </label>
                      <button type="submit" className="btn btn-primary">Save Rule</button>
                    </form>
                    {siteRetentionRules.length === 0
                      ? <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No retention rules configured for this site.</div>
                      : (
                        <table className="admin-table">
                          <thead><tr><th>Regulation</th><th>Retention (days)</th><th>Auto-Delete</th></tr></thead>
                          <tbody>
                            {siteRetentionRules.map(r => (
                              <tr key={r.id}>
                                <td style={{ fontWeight: 600 }}>{r.regulation}</td>
                                <td>{r.retention_days}</td>
                                <td>{r.auto_delete_enabled
                                  ? <span style={{ background: '#fde8ef', color: '#c0392b', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>ON</span>
                                  : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Off</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )
                    }
                  </>
                )}
              </>
            )}

            {siteMainTab === 'alerts' && (
              <>
                {siteTabLoading && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>}
                {!siteTabLoading && (
                  <>
                    <form onSubmit={addSiteAlert} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Alert Type</label>
                        <select className="form-control" value={siteAlertForm.alert_type} onChange={e => setSiteAlertForm(f => ({ ...f, alert_type: e.target.value }))}>
                          <option>Case Volume Spike</option>
                          <option>SLA Breach</option>
                          <option>AE Serious Flag</option>
                          <option>Overdue Cases</option>
                        </select>
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Threshold</label>
                        <input className="form-control" type="number" min={1} value={siteAlertForm.threshold_value} onChange={e => setSiteAlertForm(f => ({ ...f, threshold_value: parseInt(e.target.value, 10) }))} style={{ maxWidth: 100 }} />
                      </div>
                      <div className="form-group" style={{ margin: 0, minWidth: 200 }}>
                        <label>Notify Emails</label>
                        <input className="form-control" placeholder="a@b.com, c@d.com" value={siteAlertForm.notify_emails} onChange={e => setSiteAlertForm(f => ({ ...f, notify_emails: e.target.value }))} />
                      </div>
                      <button type="submit" className="btn btn-accent">+ Add Alert</button>
                    </form>
                    {siteAlerts.length === 0
                      ? <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No alerts configured for this site.</div>
                      : (
                        <table className="admin-table">
                          <thead><tr><th>Alert Type</th><th>Threshold</th><th>Notify Emails</th><th>Status</th><th></th></tr></thead>
                          <tbody>
                            {siteAlerts.map(a => (
                              <tr key={a.id}>
                                <td style={{ fontWeight: 600 }}>{a.alert_type}</td>
                                <td>{a.threshold_value}</td>
                                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.notify_emails || '—'}</td>
                                <td><StatusPill active={a.is_active} /></td>
                                <td><button className="btn btn-outline" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => deleteSiteAlert(a.id)}>Remove</button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )
                    }
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
