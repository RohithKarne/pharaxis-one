/**
 * CaseFormPage.jsx — Full Case Form
 * F-15: Case Information section + auto-save (Vivek)
 * F-14: Contact/Requestor section (Bhavya)
 * F-16: MI Component — multiple tabs (Vivek)
 * F-17: AE Component — version-controlled, 8 tabs (Bhavya)
 * F-18: PC Component — version-controlled, 6 tabs (Vivek)
 * CSS namespace: cf-
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import '../cases.css'

const API = 'http://localhost:3000/api'

const TYPE_COLOR = { MI: '#2563eb', AE: '#dc2626', PC: '#d97706' }

// AE tab definitions
const AE_TABS = [
  { key: 'general',         label: 'General' },
  { key: 'events',          label: 'Events' },
  { key: 'patient-info',    label: 'AE Patient Info' },
  { key: 'lab-results',     label: 'Lab Results' },
  { key: 'lab-notes',       label: 'Lab Notes' },
  { key: 'medical-history', label: 'Medical History' },
  { key: 'medical-notes',   label: 'Medical Notes' },
  { key: 'product-info',    label: 'Product Info' },
]

// PC tab definitions
const PC_TABS = [
  { key: 'general',          label: 'General' },
  { key: 'patient-info',     label: 'PC Patient Info' },
  { key: 'product-info',     label: 'Product Info' },
  { key: 'return-retrieval', label: 'Return / Retrieval' },
  { key: 'replacement',      label: 'Replacement' },
  { key: 'refund-credit',    label: 'Refund / Credit' },
]

export default function CaseFormPage() {
  const { id }        = useParams()
  const navigate      = useNavigate()
  const { token }     = useAuth()
  const headers       = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  // ── Core case state ───────────────────────────────────────────────────────
  const [caseData,   setCaseData]   = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [section,    setSection]    = useState('info')  // info | contacts | mi | ae | pc
  const [saving,     setSaving]     = useState(false)
  const [savedMsg,   setSavedMsg]   = useState('')

  // Case info form (F-15)
  const [infoForm,   setInfoForm]   = useState({
    status_id: '', case_owner_id: '', priority: 'normal',
    date_received: '', description: '', internal_notes: '', intake_channel: 'manual',
  })
  const [statuses,   setStatuses]   = useState([])
  const [users,      setUsers]      = useState([])

  // Contacts (F-14)
  const [contacts,      setContacts]      = useState([])
  const [contactSearch, setContactSearch] = useState('')
  const [contactHits,   setContactHits]   = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [addContactForm, setAddContactForm] = useState({
    contact_id: null, contact_role: 'reporter', do_not_update_master: false,
    is_primary: false, first_name: '', last_name: '', contact_type: 'HCP',
    specialty: '', institution: '', phone: '', email: '', address: '',
  })
  const [showContactAdd, setShowContactAdd] = useState(false)

  // MI component (F-16)
  const [miTabs,      setMiTabs]      = useState([])
  const [activeMiTab, setActiveMiTab] = useState(0)
  const [miForm,      setMiForm]      = useState({})

  // AE component (F-17)
  const [aeVersions,   setAeVersions]   = useState([])
  const [activeAeVer,  setActiveAeVer]  = useState(null)
  const [activeAeTab,  setActiveAeTab]  = useState('general')
  const [aeTabData,    setAeTabData]    = useState({})
  const [aeTabLoading, setAeTabLoading] = useState(false)

  // PC component (F-18)
  const [pcVersions,   setPcVersions]   = useState([])
  const [activePcVer,  setActivePcVer]  = useState(null)
  const [activePcTab,  setActivePcTab]  = useState('general')
  const [pcTabData,    setPcTabData]    = useState({})
  const [pcTabLoading, setPcTabLoading] = useState(false)

  // Auto-save ref (F-15)
  const autoSaveTimer = useRef(null)

  // ── Load core case data ───────────────────────────────────────────────────

  const loadCase = useCallback(async () => {
    try {
      const [cRes, sRes, uRes] = await Promise.all([
        fetch(`${API}/cases/${id}`, { headers }),
        fetch(`${API}/admin/workflow-states`, { headers }),
        fetch(`${API}/users`, { headers }),
      ])
      const [c, s, u] = await Promise.all([cRes.json(), sRes.json(), uRes.json()])
      setCaseData(c)
      setInfoForm({
        status_id:      c.status_id      || '',
        case_owner_id:  c.case_owner_id  || '',
        priority:       c.priority       || 'normal',
        date_received:  c.date_received  ? c.date_received.slice(0, 10) : '',
        description:    c.description    || '',
        internal_notes: c.internal_notes || '',
        intake_channel: c.intake_channel || 'manual',
      })
      setStatuses(Array.isArray(s) ? s : [])
      setUsers(Array.isArray(u) ? u.filter(x => x.is_active) : [])
    } catch (err) {
      console.error('loadCase error:', err)
    } finally {
      setLoading(false)
    }
  }, [id, token])

  useEffect(() => { loadCase() }, [loadCase])

  // ── Load section data on section switch ───────────────────────────────────

  useEffect(() => {
    if (!id) return
    if (section === 'contacts') loadContacts()
    if (section === 'mi')       loadMI()
    if (section === 'ae')       loadAEVersions()
    if (section === 'pc')       loadPCVersions()
  }, [section, id])

  // ── Auto-save (F-15) — debounce 2 min ────────────────────────────────────

  function scheduleAutoSave() {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => saveInfo(true), 2 * 60 * 1000)
  }

  async function saveInfo(isAutoSave = false) {
    setSaving(true)
    try {
      const res  = await fetch(`${API}/cases/${id}`, {
        method: 'PUT', headers, body: JSON.stringify(infoForm)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCaseData(prev => ({ ...prev, ...data }))

      // Assign case number on first manual save if not yet assigned
      if (!isAutoSave && !data.case_number) {
        const nRes  = await fetch(`${API}/cases/${id}/assign-number`, { method: 'POST', headers })
        const nData = await nRes.json()
        if (nData.case_number) setCaseData(prev => ({ ...prev, case_number: nData.case_number }))
      }
      setSavedMsg(isAutoSave ? 'Auto-saved' : 'Saved')
      setTimeout(() => setSavedMsg(''), 2500)
    } catch (err) {
      setSavedMsg('Save failed')
      setTimeout(() => setSavedMsg(''), 3000)
    } finally {
      setSaving(false)
    }
  }

  // ── Contacts (F-14) ───────────────────────────────────────────────────────

  async function loadContacts() {
    try {
      const res  = await fetch(`${API}/cases/${id}/contacts`, { headers })
      const data = await res.json()
      setContacts(Array.isArray(data) ? data : [])
    } catch { setContacts([]) }
  }

  const searchContacts = useCallback(async (q) => {
    if (q.length < 2) { setContactHits([]); return }
    setSearchLoading(true)
    try {
      const res  = await fetch(`${API}/cases/contacts/search?q=${encodeURIComponent(q)}`, { headers })
      const data = await res.json()
      setContactHits(Array.isArray(data) ? data : [])
    } catch { setContactHits([]) }
    finally { setSearchLoading(false) }
  }, [token])

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
      const res  = await fetch(`${API}/cases/${id}/contacts`, {
        method: 'POST', headers, body: JSON.stringify(addContactForm)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setContacts(prev => [...prev, data])
      setShowContactAdd(false)
      setAddContactForm({
        contact_id: null, contact_role: 'reporter', do_not_update_master: false,
        is_primary: false, first_name: '', last_name: '', contact_type: 'HCP',
        specialty: '', institution: '', phone: '', email: '', address: '',
      })
      setContactSearch('')
    } catch (err) { alert(err.message) }
  }

  async function removeContact(ccId) {
    if (!window.confirm('Remove this contact from the case?')) return
    try {
      await fetch(`${API}/cases/contacts/${ccId}`, { method: 'DELETE', headers })
      setContacts(prev => prev.filter(c => c.id !== ccId))
    } catch { alert('Failed to remove contact') }
  }

  // ── MI Component (F-16) ───────────────────────────────────────────────────

  async function loadMI() {
    try {
      const res  = await fetch(`${API}/cases/${id}/mi`, { headers })
      const data = await res.json()
      setMiTabs(Array.isArray(data) ? data : [])
      if (data.length > 0) {
        setActiveMiTab(0)
        setMiForm(toMiForm(data[0]))
      }
    } catch { setMiTabs([]) }
  }

  function toMiForm(tab) {
    return {
      mi_category:          tab.mi_category          || '',
      subcategory:          tab.subcategory           || '',
      product_id:           tab.product_id            || '',
      question_summary:     tab.question_summary      || '',
      detailed_question:    tab.detailed_question     || '',
      response_required_by: tab.response_required_by  ? tab.response_required_by.slice(0, 10) : '',
      response_provided:    tab.response_provided     || '',
      response_date:        tab.response_date         ? tab.response_date.slice(0, 10) : '',
      response_channel:     tab.response_channel      || '',
      status:               tab.status               || 'Open',
    }
  }

  async function addMITab() {
    try {
      const res  = await fetch(`${API}/cases/${id}/mi`, {
        method: 'POST', headers,
        body: JSON.stringify({ status: 'Open' })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const updated = [...miTabs, data]
      setMiTabs(updated)
      setActiveMiTab(updated.length - 1)
      setMiForm(toMiForm(data))
    } catch (err) { alert(err.message) }
  }

  async function saveMI() {
    const tab = miTabs[activeMiTab]
    if (!tab) return
    try {
      const res  = await fetch(`${API}/cases/mi/${tab.id}`, {
        method: 'PUT', headers, body: JSON.stringify(miForm)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMiTabs(prev => prev.map((t, i) => i === activeMiTab ? data : t))
      setSavedMsg('Saved')
      setTimeout(() => setSavedMsg(''), 2000)
    } catch (err) { alert(err.message) }
  }

  async function deleteMITab() {
    const tab = miTabs[activeMiTab]
    if (!tab || !window.confirm('Delete this MI tab?')) return
    try {
      await fetch(`${API}/cases/mi/${tab.id}`, { method: 'DELETE', headers })
      const updated = miTabs.filter((_, i) => i !== activeMiTab)
      setMiTabs(updated)
      const newIdx = Math.max(0, activeMiTab - 1)
      setActiveMiTab(newIdx)
      setMiForm(updated[newIdx] ? toMiForm(updated[newIdx]) : {})
    } catch { alert('Failed to delete MI tab') }
  }

  // ── AE Component (F-17) ───────────────────────────────────────────────────

  async function loadAEVersions() {
    try {
      const res  = await fetch(`${API}/cases/${id}/ae/versions`, { headers })
      const data = await res.json()
      setAeVersions(Array.isArray(data) ? data : [])
      if (data.length > 0) {
        setActiveAeVer(data[data.length - 1])
        loadAETab(data[data.length - 1].id, 'general')
      }
    } catch { setAeVersions([]) }
  }

  async function loadAETab(versionId, tabKey) {
    setAeTabLoading(true)
    try {
      const res  = await fetch(`${API}/cases/ae/versions/${versionId}/${tabKey}`, { headers })
      const data = await res.json()
      setAeTabData(prev => ({ ...prev, [`${versionId}_${tabKey}`]: data }))
    } catch {}
    finally { setAeTabLoading(false) }
  }

  function switchAETab(tabKey) {
    setActiveAeTab(tabKey)
    if (activeAeVer) loadAETab(activeAeVer.id, tabKey)
  }

  async function createAEVersion() {
    try {
      const res  = await fetch(`${API}/cases/${id}/ae/versions`, { method: 'POST', headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const updated = [...aeVersions.map(v => v.id === (aeVersions[aeVersions.length-1]?.id) ? { ...v, is_locked: 1 } : v), data]
      setAeVersions(updated)
      setActiveAeVer(data)
      setActiveAeTab('general')
      loadAETab(data.id, 'general')
    } catch (err) { alert(err.message) }
  }

  async function saveAETab() {
    if (!activeAeVer || activeAeVer.is_locked) return
    const tabData = aeTabData[`${activeAeVer.id}_${activeAeTab}`] || {}
    try {
      const res = await fetch(`${API}/cases/ae/versions/${activeAeVer.id}/${activeAeTab}`, {
        method: 'PUT', headers, body: JSON.stringify(tabData)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAeTabData(prev => ({ ...prev, [`${activeAeVer.id}_${activeAeTab}`]: data }))
      setSavedMsg('Saved')
      setTimeout(() => setSavedMsg(''), 2000)
    } catch (err) { alert(err.message) }
  }

  // ── PC Component (F-18) ───────────────────────────────────────────────────

  async function loadPCVersions() {
    try {
      const res  = await fetch(`${API}/cases/${id}/pc/versions`, { headers })
      const data = await res.json()
      setPcVersions(Array.isArray(data) ? data : [])
      if (data.length > 0) {
        setActivePcVer(data[data.length - 1])
        loadPCTab(data[data.length - 1].id, 'general')
      }
    } catch { setPcVersions([]) }
  }

  async function loadPCTab(versionId, tabKey) {
    setPcTabLoading(true)
    try {
      const res  = await fetch(`${API}/cases/pc/versions/${versionId}/${tabKey}`, { headers })
      const data = await res.json()
      setPcTabData(prev => ({ ...prev, [`${versionId}_${tabKey}`]: data }))
    } catch {}
    finally { setPcTabLoading(false) }
  }

  function switchPCTab(tabKey) {
    setActivePcTab(tabKey)
    if (activePcVer) loadPCTab(activePcVer.id, tabKey)
  }

  async function createPCVersion() {
    try {
      const res  = await fetch(`${API}/cases/${id}/pc/versions`, { method: 'POST', headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const updated = [...pcVersions.map(v => v.id === (pcVersions[pcVersions.length-1]?.id) ? { ...v, is_locked: 1 } : v), data]
      setPcVersions(updated)
      setActivePcVer(data)
      setActivePcTab('general')
      loadPCTab(data.id, 'general')
    } catch (err) { alert(err.message) }
  }

  async function savePCTab() {
    if (!activePcVer || activePcVer.is_locked) return
    const tabData = pcTabData[`${activePcVer.id}_${activePcTab}`] || {}
    try {
      const res = await fetch(`${API}/cases/pc/versions/${activePcVer.id}/${activePcTab}`, {
        method: 'PUT', headers, body: JSON.stringify(tabData)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPcTabData(prev => ({ ...prev, [`${activePcVer.id}_${activePcTab}`]: data }))
      setSavedMsg('Saved')
      setTimeout(() => setSavedMsg(''), 2000)
    } catch (err) { alert(err.message) }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <div className="cf-form-loading">Loading case…</div>
  if (!caseData) return <div className="cf-form-error">Case not found. <button onClick={() => navigate('/cases')}>Back</button></div>

  const isLocked = (ver) => ver && ver.is_locked === 1

  return (
    <div className="cf-form-page">

      {/* Case header */}
      <div className="cf-form-header">
        <button className="cf-back-btn" onClick={() => navigate('/cases')}>← Cases</button>
        <div className="cf-form-header-info">
          <span className="cf-form-case-num">
            {caseData.case_number || <span className="cf-draft-badge">DRAFT</span>}
          </span>
          <span className="cf-form-type-badge" style={{ background: TYPE_COLOR[caseData.case_type] }}>
            {caseData.case_type}
          </span>
          <span className="cf-form-org">{caseData.org_name}</span>
          <span className="cf-form-sep">›</span>
          <span className="cf-form-site">{caseData.site_name}</span>
        </div>
        <div className="cf-form-header-right">
          {savedMsg && <span className="cf-saved-msg">{savedMsg}</span>}
          <button className="cf-save-btn" onClick={() => saveInfo(false)} disabled={saving}>
            {saving ? 'Saving…' : 'Save Case'}
          </button>
        </div>
      </div>

      {/* Accordion body — SciMax prototype layout */}
      <div className="cf-accordion-body">

        {/* ── Accordion: Case Information ── */}
        <div className="cf-acc-section">
          <button className="cf-acc-header" onClick={() => setSection(s => s === 'info' ? '' : 'info')}>
            <span className="cf-acc-title">Case Information</span>
            <span className="cf-acc-header-right">
              {(infoForm.status_id || infoForm.description || infoForm.case_owner_id) && <span className="cf-acc-filled">● Filled</span>}
              <span className="cf-acc-arrow">{section === 'info' ? '▲' : '▼'}</span>
            </span>
          </button>
          {section === 'info' && (
            <div className="cf-acc-content">
              <div className="cf-form-grid">
                <div className="cf-form-field">
                  <label>Status</label>
                  <select value={infoForm.status_id} onChange={e => { setInfoForm(p => ({ ...p, status_id: e.target.value })); scheduleAutoSave() }}>
                    <option value="">— No Status —</option>
                    {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="cf-form-field">
                  <label>Case Owner</label>
                  <select value={infoForm.case_owner_id} onChange={e => { setInfoForm(p => ({ ...p, case_owner_id: e.target.value })); scheduleAutoSave() }}>
                    <option value="">— Unassigned —</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div className="cf-form-field">
                  <label>Priority</label>
                  <select value={infoForm.priority} onChange={e => { setInfoForm(p => ({ ...p, priority: e.target.value })); scheduleAutoSave() }}>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div className="cf-form-field">
                  <label>Intake Channel</label>
                  <select value={infoForm.intake_channel} onChange={e => { setInfoForm(p => ({ ...p, intake_channel: e.target.value })); scheduleAutoSave() }}>
                    <option value="manual">Manual</option>
                    <option value="email">Email</option>
                    <option value="web_form">Web Form</option>
                  </select>
                </div>
                <div className="cf-form-field">
                  <label>Date Received</label>
                  <input type="date" value={infoForm.date_received} onChange={e => { setInfoForm(p => ({ ...p, date_received: e.target.value })); scheduleAutoSave() }} />
                </div>
              </div>
              <div className="cf-form-field cf-form-field--full">
                <label>Description</label>
                <textarea
                  rows={4} value={infoForm.description}
                  onChange={e => { setInfoForm(p => ({ ...p, description: e.target.value })); scheduleAutoSave() }}
                  placeholder="Case description…"
                />
              </div>
              <div className="cf-form-field cf-form-field--full">
                <label>Internal Notes</label>
                <textarea
                  rows={3} value={infoForm.internal_notes}
                  onChange={e => { setInfoForm(p => ({ ...p, internal_notes: e.target.value })); scheduleAutoSave() }}
                  placeholder="Internal notes (not visible externally)…"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Accordion: Contact / Requestor ── */}
        <div className="cf-acc-section">
          <button className="cf-acc-header" onClick={() => setSection(s => s === 'contacts' ? '' : 'contacts')}>
            <span className="cf-acc-title">Contact / Requestor</span>
            <span className="cf-acc-header-right">
              {contacts.length > 0 && <span className="cf-acc-filled">{contacts.length} contact{contacts.length > 1 ? 's' : ''}</span>}
              <span className="cf-acc-arrow">{section === 'contacts' ? '▲' : '▼'}</span>
            </span>
          </button>
          {section === 'contacts' && (
            <div className="cf-acc-content">
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
                    {c.specialty    && <span> · {c.specialty}</span>}
                    {c.institution  && <span> · {c.institution}</span>}
                    {c.email        && <span> · {c.email}</span>}
                    {c.phone        && <span> · {c.phone}</span>}
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
                      { label: 'First Name', key: 'first_name' },
                      { label: 'Last Name',  key: 'last_name'  },
                      { label: 'Email',      key: 'email'      },
                      { label: 'Phone',      key: 'phone'      },
                      { label: 'Specialty',  key: 'specialty'  },
                      { label: 'Institution',key: 'institution'},
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
          )}
        </div>

        {/* ── Accordion: MI Component ── */}
        {caseData.case_type === 'MI' && (
        <div className="cf-acc-section">
          <button className="cf-acc-header" onClick={() => setSection(s => s === 'mi' ? '' : 'mi')}>
            <span className="cf-acc-title">MI Component</span>
            <span className="cf-acc-header-right">
              {miTabs.length > 0 && <span className="cf-acc-filled">{miTabs.length} MI</span>}
              <span className="cf-acc-arrow">{section === 'mi' ? '▲' : '▼'}</span>
            </span>
          </button>
          {section === 'mi' && (
            <div className="cf-acc-content">
              <div className="cf-section-header-row">
                <button className="cf-add-btn" onClick={addMITab}>+ Add MI</button>
              </div>

              {miTabs.length === 0 ? (
                <div className="cf-empty-msg">No MI components yet. Click "+ Add MI" to start.</div>
              ) : (
                <>
                  <div className="cf-mi-tabs">
                    {miTabs.map((t, i) => (
                      <button
                        key={t.id}
                        className={`cf-mi-tab ${activeMiTab === i ? 'active' : ''}`}
                        onClick={() => { setActiveMiTab(i); setMiForm(toMiForm(t)) }}
                      >
                        MI {i + 1} <span className={`cf-mi-status ${t.status.toLowerCase()}`}>{t.status}</span>
                      </button>
                    ))}
                  </div>
                  <div className="cf-mi-panel">
                    <div className="cf-form-grid">
                      {[
                        { label: 'MI Category',    key: 'mi_category',       type: 'text' },
                        { label: 'Subcategory',     key: 'subcategory',       type: 'text' },
                        { label: 'Response Required By', key: 'response_required_by', type: 'date' },
                        { label: 'Response Date',   key: 'response_date',     type: 'date' },
                        { label: 'Response Channel',key: 'response_channel',  type: 'text' },
                      ].map(f => (
                        <div key={f.key} className="cf-form-field">
                          <label>{f.label}</label>
                          <input type={f.type} value={miForm[f.key] || ''} onChange={e => setMiForm(p => ({ ...p, [f.key]: e.target.value }))} />
                        </div>
                      ))}
                      <div className="cf-form-field">
                        <label>Status</label>
                        <select value={miForm.status || 'Open'} onChange={e => setMiForm(p => ({ ...p, status: e.target.value }))}>
                          {['Open', 'Pending', 'Closed'].map(s => <option key={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="cf-form-field cf-form-field--full">
                      <label>Question Summary</label>
                      <textarea rows={2} value={miForm.question_summary || ''} onChange={e => setMiForm(p => ({ ...p, question_summary: e.target.value }))} />
                    </div>
                    <div className="cf-form-field cf-form-field--full">
                      <label>Detailed Question</label>
                      <textarea rows={4} value={miForm.detailed_question || ''} onChange={e => setMiForm(p => ({ ...p, detailed_question: e.target.value }))} />
                    </div>
                    <div className="cf-form-field cf-form-field--full">
                      <label>Response Provided</label>
                      <textarea rows={4} value={miForm.response_provided || ''} onChange={e => setMiForm(p => ({ ...p, response_provided: e.target.value }))} />
                    </div>
                    <div className="cf-form-actions">
                      <button className="cf-delete-btn" onClick={deleteMITab}>Delete MI {activeMiTab + 1}</button>
                      <button className="cf-save-btn" onClick={saveMI}>Save MI</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        )}

        {/* ── Accordion: AE Component ── */}
        {caseData.case_type === 'AE' && (
        <div className="cf-acc-section">
          <button className="cf-acc-header" onClick={() => setSection(s => s === 'ae' ? '' : 'ae')}>
            <span className="cf-acc-title">AE Component</span>
            <span className="cf-acc-header-right">
              {aeVersions.length > 0 && <span className="cf-acc-filled">{aeVersions.length} version{aeVersions.length > 1 ? 's' : ''}</span>}
              <span className="cf-acc-arrow">{section === 'ae' ? '▲' : '▼'}</span>
            </span>
          </button>
          {section === 'ae' && (
            <div className="cf-acc-content">
              <div className="cf-section-header-row">
                <button className="cf-add-btn" onClick={createAEVersion}>+ New Version</button>
              </div>

              {aeVersions.length === 0 ? (
                <div className="cf-empty-msg">No AE versions yet. Click "+ New Version" to start.</div>
              ) : (
                <>
                  {/* Version selector */}
                  <div className="cf-version-bar">
                    {aeVersions.map(v => (
                      <button
                        key={v.id}
                        className={`cf-version-btn ${activeAeVer?.id === v.id ? 'active' : ''} ${v.is_locked ? 'locked' : ''}`}
                        onClick={() => { setActiveAeVer(v); loadAETab(v.id, activeAeTab) }}
                      >
                        V{v.version_number}
                        {v.is_locked && <span className="cf-lock-icon">🔒</span>}
                        <span className={`cf-ver-status ${v.status.toLowerCase()}`}>{v.status}</span>
                      </button>
                    ))}
                  </div>

                  {isLocked(activeAeVer) && (
                    <div className="cf-locked-notice">This version is locked (read-only). Create a new version to continue editing.</div>
                  )}

                  {/* 8 tab bar */}
                  <div className="cf-tab-bar">
                    {AE_TABS.map(t => (
                      <button
                        key={t.key}
                        className={`cf-tab-btn ${activeAeTab === t.key ? 'active' : ''}`}
                        onClick={() => switchAETab(t.key)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {aeTabLoading ? (
                    <div className="cf-tab-loading">Loading…</div>
                  ) : (
                    <AETabPanel
                      tabKey={activeAeTab}
                      data={aeTabData[`${activeAeVer?.id}_${activeAeTab}`] || {}}
                      onChange={d => setAeTabData(prev => ({ ...prev, [`${activeAeVer?.id}_${activeAeTab}`]: d }))}
                      locked={isLocked(activeAeVer)}
                      versionId={activeAeVer?.id}
                      headers={headers}
                      onSave={saveAETab}
                    />
                  )}
                </>
              )}
            </div>
          )}
        </div>
        )}

        {/* ── Accordion: PC Component ── */}
        {caseData.case_type === 'PC' && (
        <div className="cf-acc-section">
          <button className="cf-acc-header" onClick={() => setSection(s => s === 'pc' ? '' : 'pc')}>
            <span className="cf-acc-title">PC Component</span>
            <span className="cf-acc-header-right">
              {pcVersions.length > 0 && <span className="cf-acc-filled">{pcVersions.length} version{pcVersions.length > 1 ? 's' : ''}</span>}
              <span className="cf-acc-arrow">{section === 'pc' ? '▲' : '▼'}</span>
            </span>
          </button>
          {section === 'pc' && (
            <div className="cf-acc-content">
              <div className="cf-section-header-row">
                <button className="cf-add-btn" onClick={createPCVersion}>+ New Version</button>
              </div>

              {pcVersions.length === 0 ? (
                <div className="cf-empty-msg">No PC versions yet. Click "+ New Version" to start.</div>
              ) : (
                <>
                  <div className="cf-version-bar">
                    {pcVersions.map(v => (
                      <button
                        key={v.id}
                        className={`cf-version-btn ${activePcVer?.id === v.id ? 'active' : ''} ${v.is_locked ? 'locked' : ''}`}
                        onClick={() => { setActivePcVer(v); loadPCTab(v.id, activePcTab) }}
                      >
                        V{v.version_number}
                        {v.is_locked && <span className="cf-lock-icon">🔒</span>}
                        <span className={`cf-ver-status ${v.status.toLowerCase()}`}>{v.status}</span>
                      </button>
                    ))}
                  </div>

                  {isLocked(activePcVer) && (
                    <div className="cf-locked-notice">This version is locked (read-only). Create a new version to continue editing.</div>
                  )}

                  <div className="cf-tab-bar">
                    {PC_TABS.map(t => (
                      <button
                        key={t.key}
                        className={`cf-tab-btn ${activePcTab === t.key ? 'active' : ''}`}
                        onClick={() => switchPCTab(t.key)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {pcTabLoading ? (
                    <div className="cf-tab-loading">Loading…</div>
                  ) : (
                    <PCTabPanel
                      tabKey={activePcTab}
                      data={pcTabData[`${activePcVer?.id}_${activePcTab}`] || {}}
                      onChange={d => setPcTabData(prev => ({ ...prev, [`${activePcVer?.id}_${activePcTab}`]: d }))}
                      locked={isLocked(activePcVer)}
                      versionId={activePcVer?.id}
                      headers={headers}
                      onSave={savePCTab}
                    />
                  )}
                </>
              )}
            </div>
          )}
        </div>
        )}

      </div>
    </div>
  )
}

// ── AE Tab Panel ──────────────────────────────────────────────────────────────

function AETabPanel({ tabKey, data, onChange, locked, onSave }) {
  const d = data || {}
  const set = (key, val) => onChange({ ...d, [key]: val })

  const fieldRow = (label, key, type = 'text') => (
    <div key={key} className="cf-form-field">
      <label>{label}</label>
      {type === 'textarea'
        ? <textarea rows={3} value={d[key] || ''} disabled={locked} onChange={e => set(key, e.target.value)} />
        : <input type={type} value={d[key] || ''} disabled={locked} onChange={e => set(key, e.target.value)} />}
    </div>
  )

  return (
    <div className="cf-tab-panel">
      {tabKey === 'general' && (
        <div className="cf-form-grid">
          {fieldRow('Report Type',               'report_type')}
          {fieldRow('Date of Onset',             'date_of_onset',           'date')}
          {fieldRow('Date of Report',            'date_of_report',          'date')}
          {fieldRow('Reporter Awareness Date',   'reporter_awareness_date', 'date')}
          <div className="cf-form-field cf-form-field--full">{fieldRow('Additional Info', 'additional_info', 'textarea')}</div>
        </div>
      )}

      {tabKey === 'events' && (
        <div>
          <p className="cf-tab-note">ICH E2B R3 — seriousness criteria stored as individual fields for regulatory export.</p>
          <div className="cf-form-grid">
            {fieldRow('Event Description', 'event_description', 'textarea')}
            {fieldRow('Outcome',           'outcome')}
            {fieldRow('Start Date',        'start_date', 'date')}
            {fieldRow('End Date',          'end_date',   'date')}
          </div>
          <div className="cf-seriousness-grid">
            <span className="cf-seriousness-label">Seriousness Criteria:</span>
            {[
              ['is_serious',                  'Serious'],
              ['is_death',                    'Death'],
              ['is_life_threatening',         'Life-Threatening'],
              ['is_hospitalization',          'Hospitalization'],
              ['is_disability',               'Disability / Incapacity'],
              ['is_congenital_anomaly',       'Congenital Anomaly'],
              ['is_other_medically_important','Other Medically Important'],
            ].map(([key, label]) => (
              <label key={key} className="cf-seriousness-check">
                <input type="checkbox" checked={!!d[key]} disabled={locked} onChange={e => set(key, e.target.checked ? 1 : 0)} />
                {label}
              </label>
            ))}
          </div>
        </div>
      )}

      {tabKey === 'patient-info' && (
        <div className="cf-form-grid">
          {fieldRow('Age',            'age',       'number')}
          {fieldRow('Age Unit',       'age_unit')}
          {fieldRow('Sex',            'sex')}
          {fieldRow('Weight (kg)',    'weight_kg', 'number')}
          {fieldRow('Height (cm)',    'height_cm', 'number')}
          {fieldRow('Ethnicity',      'ethnicity')}
          {fieldRow('Last Menstrual Date', 'last_menstrual_date', 'date')}
          <div className="cf-form-field">
            <label>Pregnant</label>
            <select value={d.pregnant ?? ''} disabled={locked} onChange={e => set('pregnant', e.target.value === '' ? null : parseInt(e.target.value))}>
              <option value="">Unknown</option>
              <option value="1">Yes</option>
              <option value="0">No</option>
            </select>
          </div>
          <div className="cf-form-field cf-form-field--full">{fieldRow('Additional Info', 'additional_info', 'textarea')}</div>
        </div>
      )}

      {(tabKey === 'lab-results' || tabKey === 'medical-history' || tabKey === 'product-info') && (
        <div className="cf-tab-list-note">
          Multi-row data for this tab is managed via the API. Inline row editing coming in the next UI iteration.
        </div>
      )}

      {(tabKey === 'lab-notes' || tabKey === 'medical-notes') && (
        <div className="cf-form-field cf-form-field--full">
          <label>Notes</label>
          <textarea rows={8} value={d.notes || ''} disabled={locked} onChange={e => set('notes', e.target.value)} />
        </div>
      )}

      {!locked && (
        <div className="cf-form-actions">
          <button className="cf-save-btn" onClick={onSave}>Save</button>
        </div>
      )}
    </div>
  )
}

// ── PC Tab Panel ──────────────────────────────────────────────────────────────

function PCTabPanel({ tabKey, data, onChange, locked, onSave }) {
  const d = data || {}
  const set = (key, val) => onChange({ ...d, [key]: val })

  const fieldRow = (label, key, type = 'text') => (
    <div key={key} className="cf-form-field">
      <label>{label}</label>
      {type === 'textarea'
        ? <textarea rows={3} value={d[key] || ''} disabled={locked} onChange={e => set(key, e.target.value)} />
        : <input type={type} value={d[key] || ''} disabled={locked} onChange={e => set(key, e.target.value)} />}
    </div>
  )

  const boolField = (label, key) => (
    <label key={key} className="cf-bool-field">
      <input type="checkbox" checked={!!d[key]} disabled={locked} onChange={e => set(key, e.target.checked ? 1 : 0)} />
      {label}
    </label>
  )

  return (
    <div className="cf-tab-panel">
      {tabKey === 'general' && (
        <div className="cf-form-grid">
          {fieldRow('Complaint Description', 'complaint_description', 'textarea')}
          {fieldRow('PC Category',           'pc_category')}
          {fieldRow('Date of Complaint',     'date_of_complaint', 'date')}
          {fieldRow('Date Received',         'date_received',     'date')}
          {fieldRow('Severity',              'severity')}
          <div className="cf-form-field cf-form-field--full">{fieldRow('Additional Info', 'additional_info', 'textarea')}</div>
        </div>
      )}

      {tabKey === 'patient-info' && (
        <div className="cf-form-grid">
          {fieldRow('Age',                'age',                 'number')}
          {fieldRow('Age Unit',           'age_unit')}
          {fieldRow('Sex',                'sex')}
          {fieldRow('Weight (kg)',        'weight_kg',           'number')}
          {fieldRow('Therapy Start Date', 'therapy_start_date',  'date')}
          {fieldRow('Therapy End Date',   'therapy_end_date',    'date')}
          {fieldRow('Indication',         'indication')}
          <div className="cf-form-field cf-form-field--full">{fieldRow('Additional Info', 'additional_info', 'textarea')}</div>
        </div>
      )}

      {tabKey === 'product-info' && (
        <div className="cf-form-grid">
          {fieldRow('Product Name',    'product_name')}
          {fieldRow('Lot Number',      'lot_number')}
          {fieldRow('Expiry Date',     'expiry_date', 'date')}
          {boolField('Product Sample Available', 'quantity_available')}
          <div className="cf-form-field cf-form-field--full">{fieldRow('Storage Conditions', 'storage_conditions', 'textarea')}</div>
          <div className="cf-form-field cf-form-field--full">{fieldRow('Additional Info', 'additional_info', 'textarea')}</div>
        </div>
      )}

      {tabKey === 'return-retrieval' && (
        <div className="cf-form-grid">
          {boolField('Return Requested',    'return_requested')}
          {fieldRow('Return Date',          'return_date',    'date')}
          {fieldRow('Return Method',        'return_method')}
          {boolField('Retrieval Requested', 'retrieval_requested')}
          {fieldRow('Retrieval Date',       'retrieval_date', 'date')}
          {fieldRow('Retrieval Method',     'retrieval_method')}
          {fieldRow('Tracking Number',      'tracking_number')}
          <div className="cf-form-field cf-form-field--full">{fieldRow('Notes', 'notes', 'textarea')}</div>
        </div>
      )}

      {tabKey === 'replacement' && (
        <div className="cf-form-grid">
          {boolField('Replacement Requested', 'replacement_requested')}
          {boolField('Replacement Approved',  'replacement_approved')}
          {fieldRow('Replacement Date',       'replacement_date',    'date')}
          {fieldRow('Replacement Product',    'replacement_product')}
          {fieldRow('Quantity',               'quantity',            'number')}
          <div className="cf-form-field cf-form-field--full">{fieldRow('Notes', 'notes', 'textarea')}</div>
        </div>
      )}

      {tabKey === 'refund-credit' && (
        <div className="cf-form-grid">
          {boolField('Refund Requested',  'refund_requested')}
          {boolField('Refund Approved',   'refund_approved')}
          {fieldRow('Refund Amount',      'refund_amount',  'number')}
          {boolField('Credit Requested',  'credit_requested')}
          {boolField('Credit Approved',   'credit_approved')}
          {fieldRow('Credit Amount',      'credit_amount',  'number')}
          <div className="cf-form-field cf-form-field--full">{fieldRow('Notes', 'notes', 'textarea')}</div>
        </div>
      )}

      {!locked && (
        <div className="cf-form-actions">
          <button className="cf-save-btn" onClick={onSave}>Save</button>
        </div>
      )}
    </div>
  )
}
