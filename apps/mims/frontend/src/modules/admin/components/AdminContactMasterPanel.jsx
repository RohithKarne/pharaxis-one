import { useState, useEffect } from 'react'
import { confirm } from '../../../shared/utils/confirm'
import { SectionHeader } from './AdminShared'

export default function AdminContactMasterPanel({ H, flash }) {
  const [orgs, setOrgs] = useState([])
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

  useEffect(() => { loadOrgs(); loadContacts(); loadCompanyReps() }, []) // eslint-disable-line

  async function loadOrgs() {
    try {
      const d = await fetch('/api/admin/orgs', { headers: H }).then(r => r.json())
      setOrgs(d.orgs || [])
    } catch { setOrgs([]) }
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
    if (!await confirm(`Delete contact "${contactName}"?`)) return
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
    if (!await confirm(`Delete representative "${r.name}"?`)) return
    const res = await fetch(`/api/admin/company-reps/${r.id}`, { method: 'DELETE', headers: H })
    const d = await res.json()
    if (!res.ok) return flash(d.error || 'Delete failed.', 'error')
    setCompanyReps(prev => prev.filter(x => x.id !== r.id))
    flash('Rep deleted.')
  }

  return (
    <>
      <SectionHeader title="Contact Master" desc="Manage case contacts and company representatives." />

      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        {[{ key: 'contacts', label: 'Case Contacts' }, { key: 'reps', label: 'Company Representatives' }].map(t => (
          <button key={t.key} onClick={() => setContactTab(t.key)}
            style={{ padding: '10px 20px', border: 'none', borderBottom: contactTab === t.key ? '2px solid var(--primary)' : '2px solid transparent', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: contactTab === t.key ? 700 : 400, color: contactTab === t.key ? 'var(--primary)' : 'var(--text-secondary)' }}>
            {t.label}
          </button>
        ))}
      </div>

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
            <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => {
              setContactForm({ first_name: '', last_name: '', specialty: '', institution: '', email: '', phone: '', type: 'HCP', organization: '', notes: '', address: '', do_not_update_master: false })
              setContactEditTarget(null); setContactModal('add')
            }}>+ Add Contact</button>
          </div>
          <div className="card">
            <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
              <table className="admin-table">
                <thead><tr>{['Name', 'Email', 'Phone', 'Type', 'Organization', 'Status', 'Actions'].map(h => <th key={h}>{h}</th>)}</tr></thead>
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
          {contactModal && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
              <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 520, padding: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.25)', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <h3 style={{ margin: 0 }}>{contactModal === 'add' ? 'Add Contact' : 'Edit Contact'}</h3>
                  <button onClick={() => setContactModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
                </div>
                <form onSubmit={saveContact}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>First Name *</label><input className="form-control" value={contactForm.first_name} onChange={e => setContactForm(f => ({ ...f, first_name: e.target.value }))} required /></div>
                    <div><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Last Name</label><input className="form-control" value={contactForm.last_name} onChange={e => setContactForm(f => ({ ...f, last_name: e.target.value }))} /></div>
                    <div><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Type</label><select className="form-control" value={contactForm.type} onChange={e => setContactForm(f => ({ ...f, type: e.target.value }))}><option value="HCP">HCP</option><option value="Patient">Patient</option><option value="Reporter">Reporter</option><option value="Other">Other</option></select></div>
                    <div><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Specialty</label><input className="form-control" placeholder="e.g. Oncology, Cardiology" value={contactForm.specialty} onChange={e => setContactForm(f => ({ ...f, specialty: e.target.value }))} /></div>
                    <div style={{ gridColumn: '1 / -1' }}><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Institution</label><input className="form-control" placeholder="Hospital or clinic name" value={contactForm.institution} onChange={e => setContactForm(f => ({ ...f, institution: e.target.value }))} /></div>
                    <div><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Email</label><input className="form-control" type="email" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} /></div>
                    <div><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Phone</label><input className="form-control" value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} /></div>
                    <div style={{ gridColumn: '1 / -1' }}><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Address</label><textarea className="form-control" rows={2} style={{ resize: 'vertical' }} value={contactForm.address} onChange={e => setContactForm(f => ({ ...f, address: e.target.value }))} /></div>
                    <div style={{ gridColumn: '1 / -1' }}><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Notes</label><textarea className="form-control" rows={2} style={{ resize: 'vertical' }} value={contactForm.notes} onChange={e => setContactForm(f => ({ ...f, notes: e.target.value }))} /></div>
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

      {contactTab === 'reps' && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            <input className="form-control" placeholder="Search name…" value={repSearch} onChange={e => setRepSearch(e.target.value)} style={{ maxWidth: 240 }} />
            <button className="btn btn-primary" onClick={() => loadCompanyReps(repSearch)}>Search</button>
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
                <thead><tr>{['Name', 'Title', 'Territory', 'Email', 'Phone', 'Organization', 'Status', 'Actions'].map(h => <th key={h}>{h}</th>)}</tr></thead>
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
          {repModal && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
              <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 480, padding: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <h3 style={{ margin: 0 }}>{repModal === 'add' ? 'Add Representative' : 'Edit Representative'}</h3>
                  <button onClick={() => setRepModal(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
                </div>
                <form onSubmit={saveRep}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ gridColumn: '1 / -1' }}><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Name *</label><input className="form-control" value={repForm.name} onChange={e => setRepForm(f => ({ ...f, name: e.target.value }))} required /></div>
                    <div><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Title</label><input className="form-control" value={repForm.title} onChange={e => setRepForm(f => ({ ...f, title: e.target.value }))} /></div>
                    <div><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Territory</label><input className="form-control" placeholder="e.g. North India, APAC" value={repForm.territory} onChange={e => setRepForm(f => ({ ...f, territory: e.target.value }))} /></div>
                    <div><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Email</label><input className="form-control" type="email" value={repForm.email} onChange={e => setRepForm(f => ({ ...f, email: e.target.value }))} /></div>
                    <div><label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Phone</label><input className="form-control" value={repForm.phone} onChange={e => setRepForm(f => ({ ...f, phone: e.target.value }))} /></div>
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
