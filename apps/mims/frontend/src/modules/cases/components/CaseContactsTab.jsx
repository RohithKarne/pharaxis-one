import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from '../../../shared/utils/toast'
import { confirm } from '../../../shared/utils/confirm'
import { httpFetch } from '../../../shared/api/httpFetch.js'
import { WiredField, WiredSelect, WiredTextarea } from '../../../shared/components/WiredField'
import { useAuth } from '../../../shared/context/AuthContext'
import { isAdminUser } from '../../../shared/utils/adminScope.js'

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
      const raw = sessionStorage.getItem(key)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') setValue(prev => ({ ...prev, ...parsed }))
    } catch {
      // best-effort
    }
  }, [key, setValue])

  useEffect(() => {
    try { sessionStorage.setItem(key, JSON.stringify(value)) } catch { /* no-op */ }
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
  // A case contact can be edited in place; it could only be removed and added
  // again, e.g. to give the reporter a missing email (M-104).
  const [editingId, setEditingId] = useState(null)
  // Bridge row 10: an administrator can erase the reporter's identity on this case.
  const { user } = useAuth()
  const [erasing, setErasing] = useState(false)
  // What an erasure here would touch, and whether the reporter's details sit only on the
  // intake record (no contact card) — about a fifth of cases, which had no way to erase.
  const [erasure, setErasure] = useState(null)
  async function loadErasure() {
    if (!isAdminUser(user)) return
    try {
      const res = await httpFetch(`${API}/cases/${id}/erase-reporter/preview`, { headers })
      setErasure(res.ok ? await res.json() : null)
    } catch { setErasure(null) }
  }
  useEffect(() => { loadErasure() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useDraft(`mims_case_${id}_contact_draft`, addContactForm, setAddContactForm)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`mims_case_${id}_contact_ui`)
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
      sessionStorage.setItem(`mims_case_${id}_contact_ui`, JSON.stringify({ showContactAdd, contactSearch }))
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

  function startEdit(c) {
    const form = { ...BLANK_CONTACT }
    for (const key of Object.keys(BLANK_CONTACT)) {
      if (c[key] !== undefined && c[key] !== null) form[key] = typeof BLANK_CONTACT[key] === 'boolean' ? !!c[key] : c[key]
    }
    setAddContactForm(form)
    setEditingId(c.id)
    setContactSearch('')
    setContactHits([])
    setShowContactAdd(true)
  }

  function closeContactForm() {
    setShowContactAdd(false)
    setEditingId(null)
    setAddContactForm(BLANK_CONTACT)
  }

  async function saveContact() {
    try {
      const res = await httpFetch(editingId ? `${API}/cases/contacts/${editingId}` : `${API}/cases/${id}/contacts`, {
        method: editingId ? 'PUT' : 'POST',
        headers,
        body: JSON.stringify(addContactForm),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (editingId) {
        setContacts(prev => prev.map(c => (c.id === editingId ? { ...c, ...data } : c)))
        closeContactForm()
        return
      }
      const updated = [...contacts, data]
      setContacts(updated)
      onCountChange?.(updated.length)
      setShowContactAdd(false)
      setAddContactForm(BLANK_CONTACT)
      setContactSearch('')
      sessionStorage.removeItem(`mims_case_${id}_contact_draft`)
      sessionStorage.removeItem(`mims_case_${id}_contact_ui`)
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
        <button className="cf-add-btn" onClick={() => { setEditingId(null); setAddContactForm(BLANK_CONTACT); setShowContactAdd(true) }}>+ Add Contact</button>
      </div>

      {contacts.length === 0 && !showContactAdd && <div className="cf-empty-msg">No contacts added yet.</div>}

      {contacts.map(c => (
        <div key={c.id} className={`cf-contact-card ${c.is_primary ? 'primary' : ''}`}>
          <div className="cf-contact-name">
            <span className="cf-contact-name-text">{[c.prefix, c.first_name, c.last_name].filter(Boolean).join(' ')}</span>
            {/* is_primary is 0/1 from MySQL: `0 && …` printed a stray "0" after every name (M-42) */}
            {c.is_primary ? <span className="cf-primary-badge">Primary</span> : null}
            {c.do_not_update_master ? <span className="cf-dnumd-badge">DNUMD</span> : null}
          </div>
          <div className="cf-contact-meta">
            <span>{c.contact_type || 'Contact'}</span>
            {c.reporter_type && c.reporter_type !== c.contact_type && <span> · {c.reporter_type}</span>}
            {c.specialty && <span> · {c.specialty}</span>}
            {c.institution && <span> · {c.institution}</span>}
            {c.email && <span> · {c.email}</span>}
            {c.phone && <span> · {c.phone}</span>}
          </div>
          <button className="cf-remove-btn" onClick={() => startEdit(c)}>Edit</button>
          <button className="cf-remove-btn" onClick={() => removeContact(c.id)}>Remove</button>
          {c.contact_role === 'reporter' && hasIdentity(c) && isAdminUser(user) && (
            <button className="cf-remove-btn" onClick={() => setErasing(true)}>Erase identity</button>
          )}
          {c.contact_role === 'reporter' && !hasIdentity(c) && (
            <span className="cf-dnumd-badge" style={{ marginLeft: 6 }}>Identity erased</span>
          )}
        </div>
      ))}
      {erasure?.intake_identity && !contacts.some(c => c.contact_role === 'reporter' && hasIdentity(c)) && (
        <div className="cf-contact-card">
          <div className="cf-contact-meta"><span>The reporter's details are on the intake record only (no contact card).</span></div>
          <button className="cf-remove-btn" onClick={() => setErasing(true)}>Erase identity</button>
        </div>
      )}
      {erasure?.erased_at && !erasure?.intake_identity && !contacts.some(c => c.contact_role === 'reporter') && (
        <div className="cf-empty-msg"><span className="cf-dnumd-badge">Identity erased</span></div>
      )}
      {erasing && (
        <ReporterErasureModal caseId={id} headers={headers} preview={erasure}
          onDone={() => { setErasing(false); loadContacts(); loadErasure() }} onCancel={() => setErasing(false)} />
      )}

      {showContactAdd && (
        <div className="cf-add-contact-form">
          <h3 className="cf-subsection-title">{editingId ? 'Edit Contact' : 'Add Contact'}</h3>
          {!editingId && <div className="cf-contact-search-row">
            <input
              className="cf-contact-search"
              placeholder="Search existing contacts by name, email, phone…"
              value={contactSearch}
              onChange={e => { setContactSearch(e.target.value); searchContacts(e.target.value) }}
            />
            {searchLoading && <span className="cf-search-loading">Searching…</span>}
          </div>}
          {!editingId && contactHits.length > 0 && (
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
            <button className="cf-cancel-btn" onClick={closeContactForm}>Cancel</button>
            <button className="cf-save-btn" onClick={saveContact}>{editingId ? 'Save Changes' : 'Add Contact'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

function hasIdentity(c) {
  return [c.first_name, c.last_name, c.email, c.phone, c.address, c.institution].some(v => v && String(v).trim())
}

// Bridge row 10: erasing the reporter cannot be undone, so it takes a reason and the
// user's password, and says plainly what goes and what stays.
function ReporterErasureModal({ caseId, headers, preview, onDone, onCancel }) {
  const [reason, setReason] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const res = await httpFetch(`${API}/cases/${caseId}/erase-reporter`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ reason, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Could not erase the reporter\'s identity.'); return }
      const kept = data.shared_contacts_kept?.length
        ? ` The shared contact list entry is used by other cases, so it was kept — erase it there if the person asked.` : ''
      toast.success(`The reporter's identity was erased from this case.${kept}`, kept ? 8000 : 3000)
      onDone()
    } catch {
      setError('Could not erase the reporter\'s identity. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(20,28,42,0.55)', zIndex: 9990, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit}
        style={{ width: 480, maxWidth: '92vw', background: 'var(--surface,#fff)', borderRadius: 10, boxShadow: '0 12px 48px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <strong>Erase the reporter's identity</strong>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            Removes the reporter's name, email, phone, organisation, address and institution from this case.
            The case itself, the reporter type and the country stay. If the case came from a portal, the portal removes them from its copy too.
            This cannot be undone.
          </div>
          {preview && (preview.portal_notes > 0 || preview.shared_contacts_blanked > 0 || preview.shared_contacts_kept?.length > 0) && (
            <ul style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 0', paddingLeft: 18 }}>
              {preview.portal_notes > 0 && <li>The reporter's name, email and phone are also removed from {preview.portal_notes} note(s) they sent through the portal. The rest of each note stays.</li>}
              {preview.shared_contacts_blanked > 0 && <li>The reporter's entry in the shared contact list is used only by this case, so it is blanked too.</li>}
              {preview.shared_contacts_kept?.map(k => (
                <li key={k.id}><strong>The reporter's entry in the shared contact list is used by {k.other_cases} other case(s), so it stays.</strong> Erase it there too if the person asked.</li>
              ))}
            </ul>
          )}
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Reason
            <textarea autoFocus rows={2} value={reason} onChange={e => setReason(e.target.value)}
              placeholder="For example: erasure request received by email on 2 October"
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Your password (electronic signature)
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password"
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, marginTop: 4 }} />
          </label>
          {error && <div style={{ color: '#b91c1c', fontSize: 12 }}>{error}</div>}
        </div>
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-outline" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy || reason.trim().length < 3 || !password}>{busy ? 'Erasing…' : 'Sign and erase'}</button>
        </div>
      </form>
    </div>
  )
}
