import { useState, useEffect, useRef } from 'react'
import React from 'react'
import { guardedFetch } from '../utils/guardedFetch'

const API_BASE = '/api/admin/platform'

export default function OrganisationsView({ H, flash }) {
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [showOrgForm, setShowOrgForm] = useState(false)
  const [orgForm, setOrgForm] = useState({ name: '' })
  const [editingOrg, setEditingOrg] = useState(null)
  const [editOrgName, setEditOrgName] = useState('')
  const [showSiteForm, setShowSiteForm] = useState(null)
  const [siteForm, setSiteForm] = useState({ name: '', country: '', is_primary: false })
  const [editingTimeout, setEditingTimeout] = useState(null)
  const [timeoutValue, setTimeoutValue]     = useState(30)
  const [selectedOrgIds, setSelectedOrgIds] = useState(new Set())
  const [editingSite, setEditingSite] = useState(null)
  const [siteEditForm, setSiteEditForm] = useState({ name: '', country: '' })
  const [orgLogos, setOrgLogos] = useState({})
  const logoInputRefs = useRef({})
  const [pendingOrgAction, setPendingOrgAction] = useState(null)

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    try {
      const res = await guardedFetch(`${API_BASE}/orgs`, { headers: H })
      const data = await res.json()
      const orgsData = data.orgs || []
      setOrgs(orgsData)
      const logoMap = {}
      orgsData.forEach(org => { if (org.logo_url) logoMap[org.id] = org.logo_url })
      setOrgLogos(prev => ({ ...prev, ...logoMap }))
    } catch { flash('Failed to load organisations.', 'error') }
    finally { setLoading(false) }
  }

  async function createOrg(e) {
    e.preventDefault()
    if (!orgForm.name.trim()) return flash('Organisation name is required.', 'error')
    const res = await guardedFetch(`${API_BASE}/orgs`, { method: 'POST', headers: H, body: JSON.stringify(orgForm) })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to create.', 'error')
    flash('Organisation created.')
    setShowOrgForm(false)
    setOrgForm({ name: '' })
    load()
  }

  async function saveOrgEdit() {
    if (!editingOrg || !editOrgName.trim()) return flash('Organisation name is required.', 'error')
    const res = await guardedFetch(`${API_BASE}/orgs/${editingOrg.id}`, {
      method: 'PUT',
      headers: H,
      body: JSON.stringify({
        name: editOrgName.trim(),
        is_active: editingOrg.is_active,
        session_timeout_minutes: editingOrg.session_timeout_minutes || 30,
      })
    })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to update organisation.', 'error')
    flash('Organisation updated.')
    setEditingOrg(null)
    setEditOrgName('')
    load()
  }

  async function toggleOrg(org) {
    const res = await guardedFetch(`${API_BASE}/orgs/${org.id}`, {
      method: 'PUT', headers: H,
      body: JSON.stringify({ name: org.name, is_active: org.is_active ? 0 : 1 })
    })
    if (!res.ok) return flash('Failed to update.', 'error')
    flash(`Organisation ${org.is_active ? 'deactivated' : 'activated'}.`)
    load()
  }

  async function toggleSite(site) {
    const res = await guardedFetch(`${API_BASE}/sites/${site.id}`, {
      method: 'PUT', headers: H,
      body: JSON.stringify({ name: site.name, country: site.country, is_primary: site.is_primary, is_active: site.is_active ? 0 : 1 })
    })
    if (!res.ok) return flash('Failed to update site.', 'error')
    flash(`Site "${site.name}" ${site.is_active ? 'deactivated' : 'activated'}.`)
    load()
  }

  async function createSite(e) {
    e.preventDefault()
    if (!siteForm.name.trim()) return flash('Site name is required.', 'error')
    const res = await guardedFetch(`${API_BASE}/orgs/${showSiteForm}/sites`, {
      method: 'POST', headers: H, body: JSON.stringify(siteForm)
    })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to create site.', 'error')
    flash('Site created.')
    setShowSiteForm(null)
    setSiteForm({ name: '', country: '', is_primary: false })
    load()
  }

  async function saveSiteEdit() {
    if (!editingSite) return
    if (!siteEditForm.name.trim()) return flash('Site name is required.', 'error')
    const res = await guardedFetch(`${API_BASE}/sites/${editingSite.id}`, {
      method: 'PUT',
      headers: H,
      body: JSON.stringify({
        name: siteEditForm.name.trim(),
        country: siteEditForm.country.trim(),
        is_primary: editingSite.is_primary,
        is_active: editingSite.is_active,
      }),
    })
    const data = await res.json()
    if (!res.ok) return flash(data.error || 'Failed to update site.', 'error')
    flash(`Site "${siteEditForm.name.trim()}" updated.`)
    setEditingSite(null)
    setSiteEditForm({ name: '', country: '' })
    load()
  }

  async function uploadOrgLogo(orgId, file) {
    if (!file) return
    const formData = new FormData()
    formData.append('logo', file)
    try {
      const res = await guardedFetch(`${API_BASE}/orgs/${orgId}/logo`, {
        method: 'POST',
        headers: { Authorization: H.Authorization },
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) return flash(data.error || 'Failed to upload logo.', 'error')
      setOrgLogos(prev => ({ ...prev, [orgId]: data.logo_url }))
      flash('Logo uploaded successfully.')
    } catch {
      flash('Failed to upload logo.', 'error')
    }
  }

  function toggleSelectOrg(orgId) {
    setSelectedOrgIds(prev => {
      const next = new Set(prev)
      if (next.has(orgId)) next.delete(orgId)
      else next.add(orgId)
      return next
    })
  }

  async function bulkToggleOrgs(activate) {
    const ids = Array.from(selectedOrgIds)
    if (!ids.length) return flash('Select at least one organisation.', 'error')
    for (const id of ids) {
      const org = orgs.find(o => o.id === id)
      if (!org) continue
      await guardedFetch(`${API_BASE}/orgs/${id}`, {
        method: 'PUT', headers: H,
        body: JSON.stringify({ name: org.name, is_active: activate ? 1 : 0 }),
      })
    }
    flash(`${ids.length} organisation${ids.length !== 1 ? 's' : ''} ${activate ? 'activated' : 'deactivated'}.`)
    setSelectedOrgIds(new Set())
    load()
  }

  async function saveTimeout(org) {
    const mins = parseInt(timeoutValue)
    if (isNaN(mins) || mins < 30) return flash('Minimum session timeout is 30 minutes.', 'error')
    const res = await guardedFetch(`${API_BASE}/orgs/${org.id}`, {
      method: 'PUT', headers: H,
      body: JSON.stringify({ name: org.name, is_active: org.is_active, session_timeout_minutes: mins })
    })
    if (!res.ok) return flash('Failed to update timeout.', 'error')
    flash(`Session timeout updated to ${mins} minutes for ${org.name}.`)
    setEditingTimeout(null)
    load()
  }

  async function runOrgAction(orgId, action, successMessage) {
    setPendingOrgAction(`${action}-${orgId}`)
    try {
      const res = await guardedFetch(`${API_BASE}/orgs/${orgId}/${action}`, {
        method: 'POST',
        headers: H,
      })
      const data = await res.json()
      if (!res.ok) return flash(data.error || `Failed to ${action}.`, 'error')
      flash(successMessage || data.message || 'Completed.')
      load()
    } catch {
      flash(`Failed to ${action}.`, 'error')
    } finally {
      setPendingOrgAction(null)
    }
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h3>Organisations & Sites</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {selectedOrgIds.size > 0 && (
              <>
                <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => bulkToggleOrgs(true)}>Activate Selected ({selectedOrgIds.size})</button>
                <button className="btn btn-outline" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => bulkToggleOrgs(false)}>Deactivate Selected ({selectedOrgIds.size})</button>
              </>
            )}
            <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setShowOrgForm(v => !v)}>
              + New Organisation
            </button>
          </div>
        </div>
        {showOrgForm && (
          <div className="card-body" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
            <form onSubmit={createOrg} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div>
                <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Organisation Name *</label>
                <input className="form-control" style={{ fontSize: 13 }} value={orgForm.name}
                  onChange={e => setOrgForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Pfizer India" />
              </div>
              <button className="btn btn-primary" type="submit" style={{ fontSize: 12 }}>Create</button>
              <button className="btn btn-secondary" type="button" style={{ fontSize: 12 }} onClick={() => setShowOrgForm(false)}>Cancel</button>
            </form>
          </div>
        )}
      </div>

      {loading && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>}
      {!loading && orgs.map(org => (
        <div key={org.id} className="card" style={{ marginBottom: 8 }}>
          {(() => {
            const readiness = org.readiness || {}
            const ready = !!readiness.ready
            const score = readiness.score || 0
            return (
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            onClick={() => setExpanded(e => e === org.id ? null : org.id)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                checked={selectedOrgIds.has(org.id)}
                onClick={e => e.stopPropagation()}
                onChange={() => toggleSelectOrg(org.id)}
                style={{ flexShrink: 0 }}
              />
              {orgLogos[org.id] ? (
                <img
                  src={orgLogos[org.id]}
                  alt={`${org.name} logo`}
                  style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'contain', border: '1px solid var(--border)', background: '#fff', flexShrink: 0 }}
                />
              ) : null}
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                ref={el => { logoInputRefs.current[org.id] = el }}
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) uploadOrgLogo(org.id, file)
                  e.target.value = ''
                }}
              />
            <div>
              <strong style={{ fontSize: 14 }}>{org.name}</strong>
              <span style={{ fontSize: 11, marginLeft: 10, color: 'var(--text-muted)' }}>
                {(org.sites || []).length} site{(org.sites || []).length !== 1 ? 's' : ''}
              </span>
              <span style={{
                fontSize: 11, marginLeft: 8, padding: '1px 7px', borderRadius: 10,
                background: ready ? '#d4edda' : '#fff3cd',
                color: ready ? '#155724' : '#7a4f01',
              }}>{ready ? 'Ready' : 'Needs Setup'}</span>
              <span style={{ fontSize: 11, marginLeft: 8, color: ready ? '#155724' : '#7a4f01' }}>
                {score}% readiness
              </span>
              <span style={{
                fontSize: 11, marginLeft: 8, padding: '1px 7px', borderRadius: 10,
                background: org.is_active ? '#d4edda' : '#f8d7da',
                color: org.is_active ? '#155724' : '#721c24',
              }}>{org.is_active ? 'Active' : 'Inactive'}</span>
              <span style={{ fontSize: 11, marginLeft: 8, color: 'var(--text-muted)' }}>
                ⏱ {org.session_timeout_minutes || 30} min timeout
              </span>
              <span style={{ fontSize: 11, marginLeft: 8, color: org.two_factor_enabled ? '#155724' : 'var(--text-muted)' }}>
                🔐 2FA {org.two_factor_enabled ? 'On' : 'Off'}
              </span>
            </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                className="btn btn-outline"
                style={{ fontSize: 11, padding: '3px 10px' }}
                onClick={e => {
                  e.stopPropagation()
                  setEditingOrg(org)
                  setEditOrgName(org.name)
                }}
              >
                Edit
              </button>
              <button
                className="btn btn-outline"
                style={{ fontSize: 11, padding: '3px 10px' }}
                title="Upload logo"
                onClick={e => {
                  e.stopPropagation()
                  logoInputRefs.current[org.id]?.click()
                }}
              >
                📷 Logo
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{org.is_active ? 'Active' : 'Inactive'}</span>
              <div
                onClick={e => { e.stopPropagation(); toggleOrg(org) }}
                style={{
                  width: 36, height: 20, borderRadius: 10, cursor: 'pointer',
                  background: org.is_active ? '#28a745' : '#ccc',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0
                }}>
                <div style={{
                  width: 14, height: 14, borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: 3,
                  left: org.is_active ? 19 : 3,
                  transition: 'left 0.2s'
                }} />
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{expanded === org.id ? '▲' : '▼'}</span>
            </div>
          </div>
            )
          })()}
          {expanded === org.id && (
            <div className="card-body" style={{ paddingTop: 8 }}>
              <div style={{
                marginBottom: 12,
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: 12,
                background: '#fff',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Readiness Score</div>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>{org.readiness?.score || 0}%</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-outline"
                      style={{ fontSize: 12 }}
                      disabled={pendingOrgAction === `bootstrap-${org.id}`}
                      onClick={() => runOrgAction(org.id, 'bootstrap', `Bootstrap completed for ${org.name}.`)}
                    >
                      {pendingOrgAction === `bootstrap-${org.id}` ? 'Bootstrapping…' : 'Run Bootstrap'}
                    </button>
                    <button
                      className="btn btn-outline"
                      style={{ fontSize: 12 }}
                      disabled={pendingOrgAction === `repair-${org.id}`}
                      onClick={() => runOrgAction(org.id, 'repair', `Repair completed for ${org.name}.`)}
                    >
                      {pendingOrgAction === `repair-${org.id}` ? 'Repairing…' : 'Repair Data'}
                    </button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginTop: 12 }}>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Workflow</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{org.readiness?.counts?.workflowStates || 0}</div>
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Help Coverage</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{org.readiness?.counts?.helpCoverage || 0}/{org.readiness?.counts?.helpTotal || 0}</div>
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Content Pack</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{org.readiness?.counts?.folders || 0}/{org.readiness?.counts?.modules || 0}/{org.readiness?.counts?.documents || 0}</div>
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Data Quality</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{org.readiness?.counts?.missingCaseNumbers || 0}/{org.readiness?.counts?.missingStatusLinks || 0}</div>
                  </div>
                </div>
                {!!org.readiness?.blockers?.length && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#7a1f1f', marginBottom: 6 }}>Blockers</div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {org.readiness.blockers.map((item) => (
                        <div key={item} style={{ fontSize: 12, color: '#7a1f1f', background: '#fff5f5', border: '1px solid #f5c2c7', borderRadius: 8, padding: '8px 10px' }}>
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!!org.readiness?.warnings?.length && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#7a4f01', marginBottom: 6 }}>Warnings</div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {org.readiness.warnings.map((item) => (
                        <div key={item} style={{ fontSize: 12, color: '#7a4f01', background: '#fffaf0', border: '1px solid #ffe69c', borderRadius: 8, padding: '8px 10px' }}>
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <table className="admin-table" style={{ marginBottom: 8 }}>
                <thead>
                  <tr><th>Site</th><th>Country</th><th>Primary</th><th>Status</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {(org.sites || []).length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No sites yet.</td></tr>
                  )}
                  {(org.sites || []).map(s => (
                    <React.Fragment key={s.id}>
                      <tr>
                        <td style={{ fontSize: 13 }}>{s.name}</td>
                        <td style={{ fontSize: 12 }}>{s.country || '—'}</td>
                        <td style={{ fontSize: 12 }}>{s.is_primary ? 'Yes' : 'No'}</td>
                        <td><span style={{
                          fontSize: 11, padding: '1px 7px', borderRadius: 10,
                          background: s.is_active ? '#d4edda' : '#f8d7da',
                          color: s.is_active ? '#155724' : '#721c24',
                        }}>{s.is_active ? 'Active' : 'Inactive'}</span></td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <button
                              className="btn btn-outline"
                              style={{ fontSize: 11, padding: '2px 8px' }}
                              title="Edit site"
                              onClick={() => {
                                if (editingSite?.id === s.id) {
                                  setEditingSite(null)
                                  setSiteEditForm({ name: '', country: '' })
                                } else {
                                  setEditingSite(s)
                                  setSiteEditForm({ name: s.name, country: s.country || '' })
                                }
                              }}
                            >✏</button>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.is_active ? 'Active' : 'Inactive'}</span>
                            <div onClick={() => toggleSite(s)} style={{
                              width: 36, height: 20, borderRadius: 10, cursor: 'pointer',
                              background: s.is_active ? '#28a745' : '#ccc',
                              position: 'relative', transition: 'background 0.2s', flexShrink: 0
                            }}>
                              <div style={{
                                width: 14, height: 14, borderRadius: '50%', background: '#fff',
                                position: 'absolute', top: 3,
                                left: s.is_active ? 19 : 3,
                                transition: 'left 0.2s'
                              }} />
                            </div>
                          </div>
                        </td>
                      </tr>
                      {editingSite?.id === s.id && (
                        <tr>
                          <td colSpan={5} style={{ background: 'var(--bg-secondary)', padding: '10px 12px', borderBottom: '2px solid var(--primary)' }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', marginBottom: 3 }}>Site Name</label>
                                <input
                                  className="form-control"
                                  style={{ fontSize: 13, minWidth: 180 }}
                                  value={siteEditForm.name}
                                  onChange={e => setSiteEditForm(f => ({ ...f, name: e.target.value }))}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: 11, display: 'block', marginBottom: 3 }}>Country</label>
                                <input
                                  className="form-control"
                                  style={{ fontSize: 13, minWidth: 140 }}
                                  value={siteEditForm.country}
                                  onChange={e => setSiteEditForm(f => ({ ...f, country: e.target.value }))}
                                  placeholder="e.g. India"
                                />
                              </div>
                              <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={saveSiteEdit}>Save</button>
                              <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => { setEditingSite(null); setSiteEditForm({ name: '', country: '' }) }}>Cancel</button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
              <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Session Timeout:</span>
                {editingTimeout === org.id ? (
                  <>
                    <select className="form-control" style={{ fontSize: 12, width: 'auto' }}
                      value={timeoutValue} onChange={e => setTimeoutValue(e.target.value)}>
                      <option value={30}>30 minutes</option>
                      <option value={45}>45 minutes</option>
                      <option value={60}>60 minutes</option>
                      <option value={90}>90 minutes</option>
                      <option value={120}>120 minutes</option>
                    </select>
                    <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => saveTimeout(org)}>Save</button>
                    <button className="btn btn-secondary" style={{ fontSize: 11 }} onClick={() => setEditingTimeout(null)}>Cancel</button>
                  </>
                ) : (
                  <button className="btn btn-secondary" style={{ fontSize: 11 }}
                    onClick={() => { setEditingTimeout(org.id); setTimeoutValue(org.session_timeout_minutes || 30) }}>
                    Edit Timeout
                  </button>
                )}
              </div>
              {showSiteForm === org.id ? (
                <form onSubmit={createSite} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div>
                    <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Site Name *</label>
                    <input className="form-control" style={{ fontSize: 13 }} value={siteForm.name}
                      onChange={e => setSiteForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Mumbai HQ" />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Country</label>
                    <input className="form-control" style={{ fontSize: 13 }} value={siteForm.country}
                      onChange={e => setSiteForm(f => ({ ...f, country: e.target.value }))} placeholder="India" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 2 }}>
                    <input type="checkbox" id={`primary-${org.id}`} checked={siteForm.is_primary}
                      onChange={e => setSiteForm(f => ({ ...f, is_primary: e.target.checked }))} />
                    <label htmlFor={`primary-${org.id}`} style={{ fontSize: 12 }}>Primary site</label>
                  </div>
                  <button className="btn btn-primary" type="submit" style={{ fontSize: 12 }}>Add Site</button>
                  <button className="btn btn-secondary" type="button" style={{ fontSize: 12 }}
                    onClick={() => { setShowSiteForm(null); setSiteForm({ name: '', country: '', is_primary: false }) }}>Cancel</button>
                </form>
              ) : (
                <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setShowSiteForm(org.id)}>
                  + Add Site
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {editingOrg && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 24
        }}>
          <div style={{
            width: '100%', maxWidth: 420, background: '#fff', borderRadius: 12,
            border: '1px solid #ddd', padding: 20, boxShadow: '0 10px 30px rgba(0,0,0,0.15)'
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Edit Organisation</div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>
              Update organisation name. Status, timeout, 2FA, and sites remain in their own controls.
            </div>
            <div className="form-group">
              <label>Organisation Name</label>
              <input
                className="form-control"
                value={editOrgName}
                onChange={e => setEditOrgName(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary" type="button" onClick={saveOrgEdit}>Save</button>
              <button className="btn btn-secondary" type="button" onClick={() => { setEditingOrg(null); setEditOrgName('') }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
