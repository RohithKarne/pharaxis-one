import { useState, useEffect, useCallback } from 'react'
import toast from '../../../shared/utils/toast'
import { confirm } from '../../../shared/utils/confirm'
import { httpFetch } from '../../../shared/api/httpFetch.js'

const API = import.meta.env.VITE_API_URL || '/api'

const BLANK_CONTACT = {
  contact_id: null, contact_role: 'reporter', do_not_update_master: false,
  is_primary: false, first_name: '', last_name: '', contact_type: 'HCP',
  specialty: '', institution: '', phone: '', email: '', address: '',
}

export default function CaseContactsTab({ id, headers, onCountChange }) {
  const [contacts,       setContacts]       = useState([])
  const [contactSearch,  setContactSearch]  = useState('')
  const [contactHits,    setContactHits]    = useState([])
  const [searchLoading,  setSearchLoading]  = useState(false)
  const [addContactForm, setAddContactForm] = useState(BLANK_CONTACT)
  const [showContactAdd, setShowContactAdd] = useState(false)

  useEffect(() => { loadContacts() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadContacts() {
    try {
      const res  = await httpFetch(`${API}/cases/${id}/contacts`, { headers })
      const data = await res.json()
      const list = Array.isArray(data) ? data : []
      setContacts(list)
      onCountChange?.(list.length)
    } catch { setContacts([]) }
  }

  const searchContacts = useCallback(async (q) => {
    if (q.length < 2) { setContactHits([]); return }
    setSearchLoading(true)
    try {
      const res  = await httpFetch(`${API}/cases/contacts/search?q=${encodeURIComponent(q)}`, { headers })
      const data = await res.json()
      setContactHits(Array.isArray(data) ? data : [])
    } catch { setContactHits([]) }
    finally { setSearchLoading(false) }
  }, [headers]) // eslint-disable-line react-hooks/exhaustive-deps

  function pickContact(c) {
    setAddContactForm(p => ({
      ...p,
      contact_id:   c.id,
      first_name:   c.first_name  || '',
      last_name:    c.last_name   || '',
      contact_type: c.type        || 'HCP',
      specialty:    c.specialty   || '',
      institution:  c.institution || '',
      phone:        c.phone       || '',
      email:        c.email       || '',
      address:      c.address     || '',
      do_not_update_master: !!c.do_not_update_master,
    }))
    setContactSearch(c.first_name + ' ' + (c.last_name || ''))
    setContactHits([])
  }

  async function saveContact() {
    try {
      const res  = await httpFetch(`${API}/cases/${id}/contacts`, {
        method: 'POST', headers, body: JSON.stringify(addContactForm),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const updated = [...contacts, data]
      setContacts(updated)
      onCountChange?.(updated.length)
      setShowContactAdd(false)
      setAddContactForm(BLANK_CONTACT)
      setContactSearch('')
    } catch (err) { toast.error(err.message) }
  }

  async function removeContact(ccId) {
    if (!await confirm('Remove this contact from the case?')) return
    try {
      await httpFetch(`${API}/cases/contacts/${ccId}`, { method: 'DELETE', headers })
      const updated = contacts.filter(c => c.id !== ccId)
      setContacts(updated)
      onCountChange?.(updated.length)
    } catch { toast.error('Failed to remove contact') }
  }

  return (
    <div className="cf-tab-pane">
      <div className="cf-section-header-row">
        <button className="cf-add-btn" onClick={() => setShowContactAdd(true)}>+ Add Contact</button>
      </div>

      {contacts.length === 0 && !showContactAdd && (
        <div className="cf-empty-msg">No contacts added yet.</div>
      )}

      {contacts.map(c => (
        <div key={c.id} className={`cf-contact-card ${c.is_primary ? 'primary' : ''}`}>
          <div className="cf-contact-name">
            {c.first_name} {c.last_name}
            {c.is_primary && <span className="cf-primary-badge">Primary</span>}
            {c.do_not_update_master ? <span className="cf-dnumd-badge">DNUMD</span> : null}
          </div>
          <div className="cf-contact-meta">
            <span>{c.contact_type}</span>
            {c.specialty   && <span> · {c.specialty}</span>}
            {c.institution && <span> · {c.institution}</span>}
            {c.email       && <span> · {c.email}</span>}
            {c.phone       && <span> · {c.phone}</span>}
          </div>
          <button className="cf-remove-btn" onClick={() => removeContact(c.id)}>Remove</button>
        </div>
      ))}

      {showContactAdd && (
        <div className="cf-add-contact-form">
          <h3 className="cf-subsection-title">Add Contact</h3>
          <div className="cf-contact-search-row">
            <input
              className="cf-contact-search"
              placeholder="Search existing contacts by name, email, phone…"
              value={contactSearch}
              onChange={e => { setContactSearch(e.target.value); searchContacts(e.target.value) }}
            />
            {searchLoading && <span className="cf-search-loading">Searching…</span>}
          </div>
          {contactHits.length > 0 && (
            <div className="cf-contact-hits">
              {contactHits.map(h => (
                <div key={h.id} className="cf-contact-hit" onClick={() => pickContact(h)}>
                  <strong>{h.first_name} {h.last_name}</strong>
                  <span>{h.type} {h.specialty ? `· ${h.specialty}` : ''}</span>
                  <span>{h.email || h.phone}</span>
                </div>
              ))}
            </div>
          )}
          <div className="cf-form-grid">
            {[
              { label: 'First Name',  key: 'first_name'  },
              { label: 'Last Name',   key: 'last_name'   },
              { label: 'Email',       key: 'email'       },
              { label: 'Phone',       key: 'phone'       },
              { label: 'Specialty',   key: 'specialty'   },
              { label: 'Institution', key: 'institution' },
            ].map(f => (
              <div key={f.key} className="cf-form-field">
                <label>{f.label}</label>
                <input value={addContactForm[f.key]} onChange={e => setAddContactForm(p => ({ ...p, [f.key]: e.target.value }))} />
              </div>
            ))}
            <div className="cf-form-field">
              <label>Contact Type</label>
              <select value={addContactForm.contact_type} onChange={e => setAddContactForm(p => ({ ...p, contact_type: e.target.value }))}>
                {['HCP', 'Patient', 'Reporter', 'Other'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="cf-form-field">
              <label>Role</label>
              <select value={addContactForm.contact_role} onChange={e => setAddContactForm(p => ({ ...p, contact_role: e.target.value }))}>
                {[{v:'reporter',l:'Reporter'},{v:'patient',l:'Patient'},{v:'hcp',l:'HCP'},{v:'other',l:'Other'}].map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
              </select>
            </div>
          </div>
          <div className="cf-form-field cf-form-field--full">
            <label>Address</label>
            <textarea rows={2} value={addContactForm.address} onChange={e => setAddContactForm(p => ({ ...p, address: e.target.value }))} />
          </div>
          <div className="cf-contact-flags">
            <label><input type="checkbox" checked={addContactForm.is_primary} onChange={e => setAddContactForm(p => ({ ...p, is_primary: e.target.checked }))} /> Primary contact</label>
            <label><input type="checkbox" checked={addContactForm.do_not_update_master} onChange={e => setAddContactForm(p => ({ ...p, do_not_update_master: e.target.checked }))} /> Do Not Update Master Data</label>
          </div>
          <div className="cf-form-actions">
            <button className="cf-cancel-btn" onClick={() => setShowContactAdd(false)}>Cancel</button>
            <button className="cf-save-btn" onClick={saveContact}>Add Contact</button>
          </div>
        </div>
      )}
    </div>
  )
}
