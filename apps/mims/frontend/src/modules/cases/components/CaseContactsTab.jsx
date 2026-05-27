import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from '../../../shared/utils/toast'
import { confirm } from '../../../shared/utils/confirm'
import { httpFetch } from '../../../shared/api/httpFetch.js'
import { WiredField, WiredSelect, WiredTextarea } from '../../../shared/components/WiredField'

const API = import.meta.env.VITE_API_URL || '/api'
const CONTACT_SECTION = 'Contact / Requestor'

const BLANK_CONTACT = {
  contact_id: null,
  contact_role: 'reporter',
  do_not_update_master: false,
  is_primary: false,
  prefix: '',
  first_name: '',
  last_name: '',
  contact_type: '',
  reporter_type: '',
  source: '',
  consent_status: '',
  specialty: '',
  institution: '',
  country: '',
  country_of_reporter: '',
  qualification: '',
  preferred_contact_method: '',
  language_preference: '',
  phone: '',
  email: '',
  address: '',
}

const ROLE_OPTIONS = [
  { value: 'reporter', label: 'Reporter' },
  { value: 'patient', label: 'Patient' },
  { value: 'hcp', label: 'HCP' },
  { value: 'other', label: 'Other' },
]

function toOptions(list, fallback = []) {
  if (Array.isArray(list) && list.length > 0) {
    return [{ value: '', label: '— Select —' }, ...list.map(item => ({ value: item.value, label: item.label || item.value }))]
  }
  return fallback
}

function useDraft(key, value, setValue) {
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') setValue(prev => ({ ...prev, ...parsed }))
    } catch {
      // best-effort
    }
  }, [key, setValue])

  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* no-op */ }
  }, [key, value])
}

export default function CaseContactsTab({
  id,
  headers,
  formConfig,
  getFieldConfig,
  getPicklistOptions,
  onCountChange,
}) {
  const [contacts, setContacts] = useState([])
  const [contactSearch, setContactSearch] = useState('')
  const [contactHits, setContactHits] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [addContactForm, setAddContactForm] = useState(BLANK_CONTACT)
  const [showContactAdd, setShowContactAdd] = useState(false)

  useDraft(`mims_case_${id}_contact_draft`, addContactForm, setAddContactForm)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`mims_case_${id}_contact_ui`)
      if (!raw) return
      const parsed = JSON.parse(raw)
      setShowContactAdd(!!parsed?.showContactAdd)
      setContactSearch(parsed?.contactSearch || '')
    } catch {
      // no-op
    }
  }, [id])
  useEffect(() => {
    try {
      localStorage.setItem(`mims_case_${id}_contact_ui`, JSON.stringify({ showContactAdd, contactSearch }))
    } catch {
      // no-op
    }
  }, [contactSearch, id, showContactAdd])

  useEffect(() => { loadContacts() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const isSectionVisible = useMemo(() => {
    const section = formConfig?.sections?.find(item => item.section_name === CONTACT_SECTION)
    return section ? section.is_visible !== 0 : true
  }, [formConfig])

  const fieldDef = useCallback((label) => getFieldConfig?.(CONTACT_SECTION, label) || null, [getFieldConfig])
  const visible = useCallback((label) => {
    const field = fieldDef(label)
    return field ? !field.is_hidden : true
  }, [fieldDef])
  const disabled = useCallback((label) => !!fieldDef(label)?.is_disabled, [fieldDef])
  const labelFor = useCallback((label) => fieldDef(label)?.custom_label || label, [fieldDef])
  const required = useCallback((label) => !!fieldDef(label)?.is_required, [fieldDef])

  async function loadContacts() {
    try {
      const res = await httpFetch(`${API}/cases/${id}/contacts`, { headers })
      const data = await res.json()
      const list = Array.isArray(data) ? data : []
      setContacts(list)
      onCountChange?.(list.length)
    } catch {
      setContacts([])
    }
  }

  const searchContacts = useCallback(async (q) => {
    if (q.length < 2) { setContactHits([]); return }
    setSearchLoading(true)
    try {
      const res = await httpFetch(`${API}/cases/contacts/search?q=${encodeURIComponent(q)}`, { headers })
      const data = await res.json()
      setContactHits(Array.isArray(data) ? data : [])
    } catch {
      setContactHits([])
    } finally {
      setSearchLoading(false)
    }
  }, [headers])

  function pickContact(c) {
    setAddContactForm(prev => ({
      ...prev,
      contact_id: c.id,
      first_name: c.first_name || '',
      last_name: c.last_name || '',
      contact_type: c.type || '',
      specialty: c.specialty || '',
      institution: c.institution || '',
      phone: c.phone || '',
      email: c.email || '',
      address: c.address || '',
      do_not_update_master: !!c.do_not_update_master,
    }))
    setContactSearch(`${c.first_name || ''} ${c.last_name || ''}`.trim())
    setContactHits([])
  }

  async function saveContact() {
    try {
      const res = await httpFetch(`${API}/cases/${id}/contacts`, {
        method: 'POST',
        headers,
        body: JSON.stringify(addContactForm),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const updated = [...contacts, data]
      setContacts(updated)
      onCountChange?.(updated.length)
      setShowContactAdd(false)
      setAddContactForm(BLANK_CONTACT)
      setContactSearch('')
      localStorage.removeItem(`mims_case_${id}_contact_draft`)
      localStorage.removeItem(`mims_case_${id}_contact_ui`)
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function removeContact(ccId) {
    if (!await confirm('Remove this contact from the case?')) return
    try {
      await httpFetch(`${API}/cases/contacts/${ccId}`, { method: 'DELETE', headers })
      const updated = contacts.filter(c => c.id !== ccId)
      setContacts(updated)
      onCountChange?.(updated.length)
    } catch {
      toast.error('Failed to remove contact')
    }
  }

  if (!isSectionVisible) return null

  const prefixOptions = toOptions(getPicklistOptions?.(CONTACT_SECTION, 'Prefix'))
  const contactTypeOptions = toOptions(getPicklistOptions?.(CONTACT_SECTION, 'Contact Type'), [{ value: '', label: '— Select —' }, { value: 'Healthcare Professional', label: 'Healthcare Professional' }, { value: 'Patient', label: 'Patient' }, { value: 'Consumer', label: 'Consumer' }, { value: 'Other', label: 'Other' }])
  const reporterTypeOptions = toOptions(getPicklistOptions?.(CONTACT_SECTION, 'Reporter Type'))
  const sourceOptions = toOptions(getPicklistOptions?.(CONTACT_SECTION, 'Source'))
  const consentOptions = toOptions(getPicklistOptions?.(CONTACT_SECTION, 'Consent Status'))
  const countryOptions = toOptions(getPicklistOptions?.(CONTACT_SECTION, 'Country'))
  const countryReporterOptions = toOptions(getPicklistOptions?.(CONTACT_SECTION, 'Country of Reporter'))
  const qualificationOptions = toOptions(getPicklistOptions?.(CONTACT_SECTION, 'Qualification'))
  const contactMethodOptions = toOptions(getPicklistOptions?.(CONTACT_SECTION, 'Preferred Contact Method'))
  const languageOptions = toOptions(getPicklistOptions?.(CONTACT_SECTION, 'Language Preference'))

  return (
    <div id="tab-contacts" className="cf-tab-pane">
      <div className="cf-section-header-row">
        <button className="cf-add-btn" onClick={() => setShowContactAdd(true)}>+ Add Contact</button>
      </div>

      {contacts.length === 0 && !showContactAdd && <div className="cf-empty-msg">No contacts added yet.</div>}

      {contacts.map(c => (
        <div key={c.id} className={`cf-contact-card ${c.is_primary ? 'primary' : ''}`}>
          <div className="cf-contact-name">
            {[c.prefix, c.first_name, c.last_name].filter(Boolean).join(' ')}
            {c.is_primary && <span className="cf-primary-badge">Primary</span>}
            {c.do_not_update_master ? <span className="cf-dnumd-badge">DNUMD</span> : null}
          </div>
          <div className="cf-contact-meta">
            <span>{c.contact_type || 'Contact'}</span>
            {c.reporter_type && <span> · {c.reporter_type}</span>}
            {c.specialty && <span> · {c.specialty}</span>}
            {c.institution && <span> · {c.institution}</span>}
            {c.email && <span> · {c.email}</span>}
            {c.phone && <span> · {c.phone}</span>}
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
            {visible('Prefix') && (
              <WiredSelect
                label={labelFor('Prefix')}
                section="case_contacts"
                field="prefix"
                value={addContactForm.prefix}
                onChange={v => setAddContactForm(prev => ({ ...prev, prefix: v }))}
                options={prefixOptions}
                required={required('Prefix')}
                disabled={disabled('Prefix')}
              />
            )}
            <WiredField label={labelFor('First Name')} section="case_contacts" field="first_name" value={addContactForm.first_name} onChange={v => setAddContactForm(prev => ({ ...prev, first_name: v }))} required={required('First Name')} disabled={disabled('First Name')} />
            <WiredField label={labelFor('Last Name')} section="case_contacts" field="last_name" value={addContactForm.last_name} onChange={v => setAddContactForm(prev => ({ ...prev, last_name: v }))} required={required('Last Name')} disabled={disabled('Last Name')} />
            {visible('Contact Type') && (
              <WiredSelect label={labelFor('Contact Type')} section="case_contacts" field="contact_type" value={addContactForm.contact_type} onChange={v => setAddContactForm(prev => ({ ...prev, contact_type: v }))} options={contactTypeOptions} required={required('Contact Type')} disabled={disabled('Contact Type')} />
            )}
            {visible('Reporter Type') && (
              <WiredSelect label={labelFor('Reporter Type')} section="case_contacts" field="reporter_type" value={addContactForm.reporter_type} onChange={v => setAddContactForm(prev => ({ ...prev, reporter_type: v }))} options={reporterTypeOptions} required={required('Reporter Type')} disabled={disabled('Reporter Type')} />
            )}
            <WiredSelect label="Role" section="case_contacts" field="contact_role" value={addContactForm.contact_role} onChange={v => setAddContactForm(prev => ({ ...prev, contact_role: v }))} options={ROLE_OPTIONS} />
            {visible('Source') && (
              <WiredSelect label={labelFor('Source')} section="case_contacts" field="source" value={addContactForm.source} onChange={v => setAddContactForm(prev => ({ ...prev, source: v }))} options={sourceOptions} required={required('Source')} disabled={disabled('Source')} />
            )}
            {visible('Consent Status') && (
              <WiredSelect label={labelFor('Consent Status')} section="case_contacts" field="consent_status" value={addContactForm.consent_status} onChange={v => setAddContactForm(prev => ({ ...prev, consent_status: v }))} options={consentOptions} required={required('Consent Status')} disabled={disabled('Consent Status')} />
            )}
            <WiredField label={labelFor('Email')} section="case_contacts" field="email" value={addContactForm.email} onChange={v => setAddContactForm(prev => ({ ...prev, email: v }))} required={required('Email')} disabled={disabled('Email')} />
            <WiredField label={labelFor('Phone')} section="case_contacts" field="phone" value={addContactForm.phone} onChange={v => setAddContactForm(prev => ({ ...prev, phone: v }))} required={required('Phone')} disabled={disabled('Phone')} />
            <WiredField label={labelFor('Specialty')} section="case_contacts" field="specialty" value={addContactForm.specialty} onChange={v => setAddContactForm(prev => ({ ...prev, specialty: v }))} required={required('Specialty')} disabled={disabled('Specialty')} />
            <WiredField label={labelFor('Institution')} section="case_contacts" field="institution" value={addContactForm.institution} onChange={v => setAddContactForm(prev => ({ ...prev, institution: v }))} required={required('Institution')} disabled={disabled('Institution')} />
            {visible('Country') && (
              <WiredSelect label={labelFor('Country')} section="case_contacts" field="country" value={addContactForm.country} onChange={v => setAddContactForm(prev => ({ ...prev, country: v }))} options={countryOptions} required={required('Country')} disabled={disabled('Country')} />
            )}
            {visible('Country of Reporter') && (
              <WiredSelect label={labelFor('Country of Reporter')} section="case_contacts" field="country_of_reporter" value={addContactForm.country_of_reporter} onChange={v => setAddContactForm(prev => ({ ...prev, country_of_reporter: v }))} options={countryReporterOptions} required={required('Country of Reporter')} disabled={disabled('Country of Reporter')} />
            )}
            {visible('Qualification') && (
              <WiredSelect label={labelFor('Qualification')} section="case_contacts" field="qualification" value={addContactForm.qualification} onChange={v => setAddContactForm(prev => ({ ...prev, qualification: v }))} options={qualificationOptions} required={required('Qualification')} disabled={disabled('Qualification')} />
            )}
            {visible('Preferred Contact Method') && (
              <WiredSelect label={labelFor('Preferred Contact Method')} section="case_contacts" field="preferred_contact_method" value={addContactForm.preferred_contact_method} onChange={v => setAddContactForm(prev => ({ ...prev, preferred_contact_method: v }))} options={contactMethodOptions} required={required('Preferred Contact Method')} disabled={disabled('Preferred Contact Method')} />
            )}
            {visible('Language Preference') && (
              <WiredSelect label={labelFor('Language Preference')} section="case_contacts" field="language_preference" value={addContactForm.language_preference} onChange={v => setAddContactForm(prev => ({ ...prev, language_preference: v }))} options={languageOptions} required={required('Language Preference')} disabled={disabled('Language Preference')} />
            )}
          </div>

          <WiredTextarea label="Address" section="case_contacts" field="address" rows={2} value={addContactForm.address} onChange={v => setAddContactForm(prev => ({ ...prev, address: v }))} />
          <div className="cf-contact-flags">
            <label><input type="checkbox" checked={addContactForm.is_primary} onChange={e => setAddContactForm(prev => ({ ...prev, is_primary: e.target.checked }))} /> Primary contact</label>
            <label><input type="checkbox" checked={addContactForm.do_not_update_master} onChange={e => setAddContactForm(prev => ({ ...prev, do_not_update_master: e.target.checked }))} /> Do Not Update Master Data</label>
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
