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
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import '../cases.css'

const API = import.meta.env.VITE_API_URL || '/api'

const TYPE_COLOR = { MI: '#2563eb', AE: '#dc2626', PC: '#d97706' }

// AE tab definitions
const AE_TABS = [
  { key: 'general',         label: 'General' },
  { key: 'ae-flex-fields',  label: 'AE Flex Fields' },
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
  { key: 'pc-flex-fields',   label: 'PC Flex Fields' },
  { key: 'patient-info',     label: 'PC Patient Info' },
  { key: 'product-info',     label: 'Product Info' },
  { key: 'return-retrieval', label: 'Return / Retrieval' },
  { key: 'replacement',      label: 'Replacement' },
  { key: 'refund-credit',    label: 'Refund / Credit' },
]

// Fetches associated documents for the CM document linked to this MI response
function CaseAssociatedDocs({ miTab, token }) {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!miTab?.document_id) { setDocs([]); return }
    setLoading(true)
    fetch(`/api/cm/documents/${miTab.document_id}/relations`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.ok ? r.json() : { relations: [] })
      .then(d => setDocs(d.relations || []))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false))
  }, [miTab?.document_id, token])

  if (!miTab?.document_id) return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No primary document linked to this MI response.</span>
  if (loading) return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading associated documents…</span>
  if (docs.length === 0) return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No associated documents for this response.</span>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {docs.map(d => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}>
          <span style={{ fontSize: 16 }}>📎</span>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 500 }}>{d.name}</span>
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>{d.doc_id} · {d.relation_type} · v{d.version_major}.{d.version_minor}</span>
          </div>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: d.status === 'Published' ? '#e6f4ee' : '#f5f5f5', color: d.status === 'Published' ? '#007a5a' : '#888', fontWeight: 600 }}>{d.status}</span>
        </div>
      ))}
    </div>
  )
}

export default function CaseFormPage() {
  const { id }        = useParams()
  const navigate      = useNavigate()
  const location      = useLocation()
  const { token }     = useAuth()
  const headers       = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  // ── Core case state ───────────────────────────────────────────────────────
  const [caseData,   setCaseData]   = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [activeTab, setActiveTab] = useState('info')
  const [saving,     setSaving]     = useState(false)
  const [savedMsg,   setSavedMsg]   = useState('')

  // Case info form (F-15)
  const [infoForm,   setInfoForm]   = useState({
    status_id: '', case_owner_id: '', priority: 'normal',
    date_received: '', description: '', internal_notes: '', intake_channel: 'manual',
  })
  const [statuses,   setStatuses]   = useState([])
  const [users,      setUsers]      = useState([])
  const [formConfig, setFormConfig] = useState(null)

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

  // Dynamic fields (Sprint 16)
  const [dynFieldValues, setDynFieldValues] = useState({})
  const [dynFieldSaving, setDynFieldSaving] = useState(false)

  // MI Responses (Sprint 16)
  const [miResponses, setMiResponses] = useState([])
  const [miRespLoading, setMiRespLoading] = useState(false)
  const [miRespModal, setMiRespModal] = useState(false)
  const [miRespForm, setMiRespForm] = useState({ response_text: '', channel: 'email', responded_at: '', follow_up_required: false })
  const [miRespSaving, setMiRespSaving] = useState(false)

  // AE Transmissions (Sprint 16)
  const [aeTransmissions, setAeTransmissions] = useState([])
  const [aeTxLoading, setAeTxLoading] = useState(false)
  const [aeTxDrawer, setAeTxDrawer] = useState(false)
  const [aeTxForm, setAeTxForm] = useState({ assigned_to_id: '', priority: 'routine', narrative: '' })
  const [aeTxSaving, setAeTxSaving] = useState(false)

  // PC Transmissions (Sprint 16)
  const [pcTransmissions, setPcTransmissions] = useState([])
  const [pcTxLoading, setPcTxLoading] = useState(false)
  const [pcTxDrawer, setPcTxDrawer] = useState(false)
  const [pcTxForm, setPcTxForm] = useState({ assigned_to_id: '', priority: 'routine', notes: '' })
  const [pcTxSaving, setPcTxSaving] = useState(false)
  const miDraftStorageKey = `mims_case_${id}_mi_response_draft`

  // Case correspondence (Inbox-linked communication timeline)
  const [correspondence, setCorrespondence] = useState([])
  const [corrLoading, setCorrLoading] = useState(false)
  const [corrError, setCorrError] = useState('')
  const [corrFilter, setCorrFilter] = useState('all')
  const [corrSearch, setCorrSearch] = useState('')
  const [corrFromDate, setCorrFromDate] = useState('')
  const [corrToDate, setCorrToDate] = useState('')
  const [activeCorrItem, setActiveCorrItem] = useState(null)
  const [corrCompose, setCorrCompose] = useState(null)
  const [corrAttachments, setCorrAttachments] = useState([])
  const [corrAttLoading, setCorrAttLoading] = useState(false)

  // Case comments + reassignment (Sprint 14 G10)
  const [comments, setComments] = useState([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentsError, setCommentsError] = useState('')
  const [commentInput, setCommentInput] = useState('')
  const [commentSaving, setCommentSaving] = useState(false)
  const [reassignForm, setReassignForm] = useState({ new_owner_id: '', reason: '' })
  const [reassignSaving, setReassignSaving] = useState(false)

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
        status_id:      c.status_id ? String(c.status_id) : '',
        case_owner_id:  c.case_owner_id ? String(c.case_owner_id) : '',
        priority:       c.priority       || 'normal',
        date_received:  c.date_received  ? c.date_received.slice(0, 10) : '',
        description:    c.description    || '',
        internal_notes: c.internal_notes || '',
        intake_channel: c.intake_channel || 'manual',
      })
      setStatuses(Array.isArray(s) ? s : [])
      setUsers(Array.isArray(u) ? u.filter(x => x.is_active) : [])
      setReassignForm(prev => ({ ...prev, new_owner_id: c.case_owner_id ? String(c.case_owner_id) : '' }))
    } catch (err) {
      console.error('loadCase error:', err)
    } finally {
      setLoading(false)
    }
  }, [id, token])

  useEffect(() => { loadCase() }, [loadCase])

  useEffect(() => {
    if (!caseData?.case_type) return

    let cancelled = false

    async function loadFormConfig() {
      try {
        const res = await fetch(`${API}/cases/form-config?case_type=${caseData.case_type}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        if (!cancelled) setFormConfig(data)
      } catch (err) {
        console.error('loadFormConfig error:', err)
      }
    }

    loadFormConfig()
    return () => { cancelled = true }
  }, [caseData?.case_type, token])

  // ── Load section data on section switch ───────────────────────────────────

  useEffect(() => {
    if (!id) return
    loadComments()
    loadContacts()
    loadCorrespondence()
    loadMI()
    loadAEVersions()
    loadPCVersions()
    loadDynFields()
  }, [id])

  useEffect(() => {
    const params = new URLSearchParams(location.search || '')
    const targetSection = params.get('section')
    const valid = ['info', 'comments', 'contacts', 'correspondence', 'mi', 'ae', 'pc']
    if (targetSection && valid.includes(targetSection)) {
      setActiveTab(targetSection)
    }
  }, [location.search])

  useEffect(() => {
    if (!id) return
    if (activeTab === 'mi') loadMiResponses()
    if (activeTab === 'ae') loadAeTransmissions()
    if (activeTab === 'pc') loadPcTransmissions()
  }, [activeTab, id])

  useEffect(() => {
    if (!miRespModal) return
    try {
      const stored = localStorage.getItem(miDraftStorageKey)
      if (!stored) return
      const parsed = JSON.parse(stored)
      if (parsed && typeof parsed === 'object') {
        setMiRespForm(prev => ({
          ...prev,
          ...parsed,
        }))
      }
    } catch {
      // no-op
    }
  }, [miRespModal, miDraftStorageKey])

  useEffect(() => {
    if (!miRespModal) return
    try {
      localStorage.setItem(miDraftStorageKey, JSON.stringify(miRespForm))
    } catch {
      // no-op
    }
  }, [miDraftStorageKey, miRespForm, miRespModal])

  function handleBackNavigation() {
    const from = location.state?.from
    if (from && typeof from === 'string') {
      navigate(from)
      return
    }
    navigate('/cases')
  }

  // ── Auto-save (F-15) — debounce 2 min ────────────────────────────────────

  function scheduleAutoSave() {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => saveInfo(true), 2 * 60 * 1000)
  }

  async function saveInfo(isAutoSave = false) {
    setSaving(true)
    try {
      const payload = {
        ...infoForm,
        status_id: infoForm.status_id ? Number(infoForm.status_id) : null,
        case_owner_id: infoForm.case_owner_id ? Number(infoForm.case_owner_id) : null,
      }
      const res  = await fetch(`${API}/cases/${id}`, {
        method: 'PUT', headers, body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCaseData(prev => ({ ...prev, ...data }))
      setInfoForm(prev => ({
        ...prev,
        status_id: data.status_id ? String(data.status_id) : '',
        case_owner_id: data.case_owner_id ? String(data.case_owner_id) : '',
      }))
      setReassignForm(prev => ({ ...prev, new_owner_id: data.case_owner_id ? String(data.case_owner_id) : '' }))

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

  // ── Comments + Reassignment (Sprint 14 G10) ───────────────────────────────

  async function loadComments() {
    setCommentsLoading(true)
    setCommentsError('')
    try {
      const res = await fetch(`${API}/cases/${id}/comments`, { headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load comments.')
      setComments(Array.isArray(data) ? data : [])
    } catch (err) {
      setComments([])
      setCommentsError(err.message || 'Failed to load comments.')
    } finally {
      setCommentsLoading(false)
    }
  }

  async function addComment() {
    const comment = commentInput.trim()
    if (!comment || commentSaving) return
    setCommentSaving(true)
    setCommentsError('')
    try {
      const res = await fetch(`${API}/cases/${id}/comments`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ comment }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add comment.')
      setComments(prev => [data, ...prev])
      setCommentInput('')
      setSavedMsg('Comment added')
      setTimeout(() => setSavedMsg(''), 2200)
    } catch (err) {
      setCommentsError(err.message || 'Failed to add comment.')
    } finally {
      setCommentSaving(false)
    }
  }

  async function reassignCase() {
    if (reassignSaving) return
    if (!reassignForm.new_owner_id) {
      alert('Select a new owner first.')
      return
    }
    setReassignSaving(true)
    try {
      const payload = {
        new_owner_id: Number(reassignForm.new_owner_id),
        reason: reassignForm.reason.trim() || undefined,
      }
      const res = await fetch(`${API}/cases/${id}/reassign`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to reassign case.')
      setCaseData(prev => ({ ...prev, ...data }))
      setInfoForm(prev => ({ ...prev, case_owner_id: data.case_owner_id ? String(data.case_owner_id) : '' }))
      setReassignForm(prev => ({ ...prev, reason: '' }))
      setSavedMsg('Case reassigned')
      setTimeout(() => setSavedMsg(''), 2500)
    } catch (err) {
      alert(err.message || 'Failed to reassign case.')
    } finally {
      setReassignSaving(false)
    }
  }

  // ── Correspondence timeline ───────────────────────────────────────────────

  async function loadCorrespondence() {
    setCorrLoading(true)
    setCorrError('')
    try {
      const res = await fetch(`${API}/inbox/case/${id}/correspondence`, { headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load correspondence.')
      setCorrespondence(Array.isArray(data.items) ? data.items : [])
    } catch (err) {
      setCorrespondence([])
      setCorrError(err.message || 'Failed to load correspondence.')
    } finally {
      setCorrLoading(false)
    }
  }

  function formatCorrDate(value) {
    if (!value) return '-'
    const dt = new Date(value)
    if (Number.isNaN(dt.getTime())) return value
    return dt.toLocaleString()
  }

  function getCorrDirection(item) {
    const source = String(item?.source_tag || '').toLowerCase()
    if (source.includes('reply') || source.includes('forward') || source.includes('sent') || source.includes('transmission')) {
      return 'outbound'
    }
    return 'inbound'
  }

  function getCorrBox(item) {
    return getCorrDirection(item) === 'outbound' ? 'sent' : 'inbox'
  }

  function getThreadRootId(item) {
    return item?.original_inquiry_id || item?.id
  }

  function openCorrCompose(mode, item) {
    const rawSubject = (item?.subject || '').trim()
    const hasPrefix = mode === 'reply'
      ? /^re:/i.test(rawSubject)
      : /^fwd:/i.test(rawSubject)
    const prefixedSubject = hasPrefix
      ? rawSubject
      : `${mode === 'reply' ? 'Re:' : 'Fwd:'} ${rawSubject || '(No Subject)'}`
    const quoted = [
      '',
      '----- Original Message -----',
      `From: ${item?.sender || '-'}`,
      `To: ${item?.recipient || '-'}`,
      `Sent: ${formatCorrDate(item?.received_at)}`,
      `Subject: ${item?.subject || '(No Subject)'}`,
      '',
      item?.body || '',
    ].join('\n')

    setCorrCompose({
      mode,
      inquiryId: item?.id,
      to: mode === 'reply' ? (item?.sender || '') : '',
      subject: prefixedSubject,
      body: quoted,
      sending: false,
      error: '',
    })
  }

  async function sendCorrCompose() {
    if (!corrCompose || corrCompose.sending) return
    const to = (corrCompose.to || '').trim()
    const subject = (corrCompose.subject || '').trim()
    const body = (corrCompose.body || '').trim()
    if (!to || !subject || !body) {
      setCorrCompose(prev => ({ ...prev, error: 'To, subject, and body are required.' }))
      return
    }
    setCorrCompose(prev => ({ ...prev, sending: true, error: '' }))
    try {
      const endpoint = corrCompose.mode === 'reply' ? 'reply' : 'forward'
      const res = await fetch(`${API}/inbox/${corrCompose.inquiryId}/${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ to, subject, body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Failed to ${corrCompose.mode}.`)
      await loadCorrespondence()
      setCorrCompose(null)
      setSavedMsg(corrCompose.mode === 'reply' ? 'Reply sent' : 'Forward sent')
      setTimeout(() => setSavedMsg(''), 2500)
    } catch (err) {
      setCorrCompose(prev => ({ ...prev, sending: false, error: err.message || 'Send failed.' }))
      return
    }
  }

  const filteredCorrespondence = correspondence.filter(item => {
    if (corrFilter !== 'all' && getCorrBox(item) !== corrFilter) return false

    const q = corrSearch.trim().toLowerCase()
    if (q) {
      const haystack = [
        item.subject,
        item.body,
        item.sender,
        item.recipient,
        item.source_tag,
        item.status,
      ].filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }

    if (corrFromDate || corrToDate) {
      const dt = item?.received_at ? new Date(item.received_at) : null
      if (!dt || Number.isNaN(dt.getTime())) return false
      if (corrFromDate) {
        const from = new Date(`${corrFromDate}T00:00:00`)
        if (dt < from) return false
      }
      if (corrToDate) {
        const to = new Date(`${corrToDate}T23:59:59`)
        if (dt > to) return false
      }
    }

    return true
  }).sort((a, b) => {
    const ra = getThreadRootId(a)
    const rb = getThreadRootId(b)
    if (ra !== rb) return ra - rb
    const ta = new Date(a?.received_at || 0).getTime()
    const tb = new Date(b?.received_at || 0).getTime()
    return ta - tb
  })

  useEffect(() => {
    async function loadCorrAttachments() {
      if (!activeCorrItem?.id) {
        setCorrAttachments([])
        return
      }
      setCorrAttLoading(true)
      try {
        const res = await fetch(`${API}/inbox/${activeCorrItem.id}/attachments`, { headers })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load attachments.')
        setCorrAttachments(Array.isArray(data.attachments) ? data.attachments : [])
      } catch (_) {
        setCorrAttachments([])
      } finally {
        setCorrAttLoading(false)
      }
    }
    loadCorrAttachments()
  }, [activeCorrItem?.id])

  async function downloadCorrAttachment(att) {
    try {
      const r = await fetch(`${API}/inbox/attachments/${att.id}/download`, { headers })
      if (!r.ok) return
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = att.filename || `attachment-${att.id}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (_) {
      // no-op
    }
  }

  async function previewCorrAttachment(att) {
    try {
      const r = await fetch(`${API}/inbox/attachments/${att.id}/download`, { headers })
      if (!r.ok) return
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (_) {
      // no-op
    }
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

  // ── Dynamic Fields (Sprint 16) ────────────────────────────────────────────

  async function loadDynFields() {
    try {
      const res = await fetch(`${API}/cases/${id}/dynamic-fields`, { headers })
      const data = await res.json()
      if (!res.ok) return
      const map = {}
      ;(Array.isArray(data) ? data : []).forEach(f => { map[f.field_definition_id] = f.value })
      setDynFieldValues(map)
    } catch { /* no-op */ }
  }

  async function saveDynFields() {
    if (dynFieldSaving || !formConfig) return
    setDynFieldSaving(true)
    try {
      const fields = Object.entries(dynFieldValues).map(([field_definition_id, value]) => ({
        field_definition_id: Number(field_definition_id),
        value: String(value ?? ''),
      }))
      const res = await fetch(`${API}/cases/${id}/dynamic-fields`, {
        method: 'POST', headers, body: JSON.stringify({ fields }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSavedMsg('Additional fields saved')
      setTimeout(() => setSavedMsg(''), 2200)
    } catch (err) { alert(err.message) }
    finally { setDynFieldSaving(false) }
  }

  // ── MI Responses (Sprint 16) ──────────────────────────────────────────────

  async function loadMiResponses() {
    setMiRespLoading(true)
    try {
      const res = await fetch(`${API}/cases/${id}/mi-responses`, { headers })
      const data = await res.json()
      setMiResponses(Array.isArray(data) ? data : [])
    } catch { setMiResponses([]) }
    finally { setMiRespLoading(false) }
  }

  async function submitMiResponse(responseStatus = 'SENT') {
    if (miRespSaving) return
    if (!miRespForm.response_text.trim()) { alert('Response text is required.'); return }
    setMiRespSaving(true)
    try {
      const payload = {
        ...miRespForm,
        responded_at: miRespForm.responded_at || new Date().toISOString().slice(0, 10),
        response_status: responseStatus,
      }
      const res = await fetch(`${API}/cases/${id}/mi-responses`, {
        method: 'POST', headers, body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMiResponses(prev => [data, ...prev])
      setMiRespModal(false)
      setMiRespForm({ response_text: '', channel: 'email', responded_at: '', follow_up_required: false })
      localStorage.removeItem(miDraftStorageKey)
      setSavedMsg(responseStatus === 'DRAFT' ? 'MI draft saved' : 'MI response recorded')
      setTimeout(() => setSavedMsg(''), 2200)
    } catch (err) { alert(err.message) }
    finally { setMiRespSaving(false) }
  }

  async function changeMiResponseStatus(responseId, responseStatus) {
    let reason = ''
    let password = ''
    if (responseStatus === 'APPROVED' || responseStatus === 'SENT') {
      reason = window.prompt(`Reason for ${responseStatus.toLowerCase()}?`) || ''
      if (!reason.trim()) return
      password = window.prompt('Electronic signature: enter your password') || ''
      if (!password) return
    }

    try {
      const res = await fetch(`${API}/cases/${id}/mi-responses/${responseId}/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          response_status: responseStatus,
          reason: reason.trim() || undefined,
          password: password || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMiResponses(prev => prev.map((item) => (item.id === responseId ? data : item)))
      setSavedMsg(`MI response moved to ${responseStatus}`)
      setTimeout(() => setSavedMsg(''), 2200)
    } catch (err) {
      alert(err.message)
    }
  }

  // ── AE Transmissions (Sprint 16) ──────────────────────────────────────────

  async function loadAeTransmissions() {
    setAeTxLoading(true)
    try {
      const res = await fetch(`${API}/cases/${id}/ae-transmissions`, { headers })
      const data = await res.json()
      setAeTransmissions(Array.isArray(data) ? data : [])
    } catch { setAeTransmissions([]) }
    finally { setAeTxLoading(false) }
  }

  async function createAeTransmission() {
    if (aeTxSaving) return
    setAeTxSaving(true)
    try {
      const res = await fetch(`${API}/cases/${id}/ae-transmissions`, {
        method: 'POST', headers, body: JSON.stringify(aeTxForm),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAeTransmissions(prev => [data, ...prev])
      setAeTxDrawer(false)
      setAeTxForm({ assigned_to_id: '', priority: 'routine', narrative: '' })
      setSavedMsg('Transmission created — PV team notified')
      setTimeout(() => setSavedMsg(''), 2500)
    } catch (err) { alert(err.message) }
    finally { setAeTxSaving(false) }
  }

  async function updateAeTxStatus(txId, status) {
    try {
      const res = await fetch(`${API}/cases/${id}/ae-transmissions/${txId}`, {
        method: 'PATCH', headers, body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAeTransmissions(prev => prev.map(t => t.id === txId ? data : t))
    } catch (err) { alert(err.message) }
  }

  // ── PC Transmissions (Sprint 16) ──────────────────────────────────────────

  async function loadPcTransmissions() {
    setPcTxLoading(true)
    try {
      const res = await fetch(`${API}/cases/${id}/pc-transmissions`, { headers })
      const data = await res.json()
      setPcTransmissions(Array.isArray(data) ? data : [])
    } catch { setPcTransmissions([]) }
    finally { setPcTxLoading(false) }
  }

  async function createPcTransmission() {
    if (pcTxSaving) return
    setPcTxSaving(true)
    try {
      const res = await fetch(`${API}/cases/${id}/pc-transmissions`, {
        method: 'POST', headers, body: JSON.stringify(pcTxForm),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPcTransmissions(prev => [data, ...prev])
      setPcTxDrawer(false)
      setPcTxForm({ assigned_to_id: '', priority: 'routine', notes: '' })
      setSavedMsg('Routed to Quality team')
      setTimeout(() => setSavedMsg(''), 2500)
    } catch (err) { alert(err.message) }
    finally { setPcTxSaving(false) }
  }

  async function updatePcTxStatus(txId, status) {
    try {
      const res = await fetch(`${API}/cases/${id}/pc-transmissions/${txId}`, {
        method: 'PATCH', headers, body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPcTransmissions(prev => prev.map(t => t.id === txId ? data : t))
    } catch (err) { alert(err.message) }
  }

  function getFieldConfig(sectionName, fieldName) {
    if (!formConfig || !Array.isArray(formConfig.sections)) return null
    const section = formConfig.sections.find(s => s.section_name === sectionName)
    if (!section || !Array.isArray(section.fields)) return null
    return section.fields.find(f => f.field_name === fieldName) || null
  }

  function getSectionVisible(sectionName) {
    if (!formConfig || !Array.isArray(formConfig.sections)) return true
    const section = formConfig.sections.find(s => s.section_name === sectionName)
    if (!section) return true
    return section.is_visible === 1
  }

  function getPicklistOptions(sectionName, fieldName) {
    if (!formConfig) return []
    const field = getFieldConfig(sectionName, fieldName)
    return Array.isArray(field?.options) ? field.options : []
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <div className="cf-form-loading">Loading case…</div>
  if (!caseData) return <div className="cf-form-error">Case not found. <button onClick={handleBackNavigation}>Back</button></div>

  const isLocked = (ver) => ver && ver.is_locked === 1

  // ── Tab definitions ───────────────────────────────────────────────────────
  const TABS = [
    { key: 'info',           label: 'Case Information',   badge: null },
    { key: 'comments',       label: 'Comments / Notes',   badge: comments.length > 0 ? comments.length : null },
    { key: 'contacts',       label: 'Contacts',           badge: contacts.length > 0 ? contacts.length : null },
    { key: 'correspondence', label: 'Correspondence',     badge: correspondence.length > 0 ? correspondence.length : null },
    { key: 'mi',             label: 'MI Component',       badge: miTabs.length > 0 ? miTabs.length : null },
    { key: 'ae',             label: 'AE Component',       badge: aeVersions.length > 0 ? aeVersions.length : null },
    { key: 'pc',             label: 'PC Component',       badge: pcVersions.length > 0 ? pcVersions.length : null },
  ]

  return (
    <MIMSLayout bodyClassName="no-scroll">
    <div className="cf-form-page">

      {/* Case header */}
      <div className="cf-form-header">
        <button className="cf-back-btn" onClick={handleBackNavigation}>← Back</button>
        <div className="cf-form-header-info">
          <span className="cf-form-case-num">
            {caseData.case_number || <span className="cf-draft-badge">DRAFT</span>}
          </span>
          {caseData.case_type && (
            <span className="cf-form-type-badge" style={{ background: TYPE_COLOR[caseData.case_type] }}>
              {caseData.case_type}
            </span>
          )}
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

      {/* ARISg-style tab bar */}
      <div className="cf-tabbar">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`cf-tabbar-btn${activeTab === t.key ? ' active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
            {t.badge != null && <span className="cf-tabbar-badge">{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="cf-tab-content">

        {/* ── Tab: Case Information ── */}
        {activeTab === 'info' && (
          <div className="cf-tab-pane">
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
              <div className="cf-reassign-panel">
                <div className="cf-reassign-title">Case Reassignment</div>
                <div className="cf-reassign-grid">
                  <div className="cf-form-field">
                    <label>New Owner</label>
                    <select
                      value={reassignForm.new_owner_id}
                      onChange={e => setReassignForm(prev => ({ ...prev, new_owner_id: e.target.value }))}
                    >
                      <option value="">— Select Owner —</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                  <div className="cf-form-field cf-form-field--full">
                    <label>Reason (Optional)</label>
                    <textarea
                      rows={2}
                      value={reassignForm.reason}
                      onChange={e => setReassignForm(prev => ({ ...prev, reason: e.target.value }))}
                      placeholder="Why is this case being reassigned?"
                    />
                  </div>
                </div>
                <div className="cf-reassign-actions">
                  <button className="cf-save-btn" onClick={reassignCase} disabled={reassignSaving}>
                    {reassignSaving ? 'Reassigning…' : 'Reassign Case'}
                  </button>
                </div>
              </div>
              {formConfig && Array.isArray(formConfig.sections) &&
                formConfig.sections.some(s => Array.isArray(s.fields) && s.fields.length > 0) && (
                <DynamicFieldsSection
                  sections={formConfig.sections}
                  values={dynFieldValues}
                  onChange={setDynFieldValues}
                  onSave={saveDynFields}
                  saving={dynFieldSaving}
                />
              )}
          </div>
        )}

        {/* ── Tab: Comments / Notes ── */}
        {activeTab === 'comments' && (
          <div className="cf-tab-pane">
              <div className="cf-comments-composer">
                <textarea
                  rows={3}
                  value={commentInput}
                  onChange={e => setCommentInput(e.target.value)}
                  placeholder="Add case note/comment…"
                />
                <div className="cf-comments-actions">
                  <button className="cf-save-btn" onClick={addComment} disabled={!commentInput.trim() || commentSaving}>
                    {commentSaving ? 'Adding…' : 'Add Comment'}
                  </button>
                </div>
              </div>
              {commentsLoading && <div className="cf-empty-msg">Loading comments…</div>}
              {!commentsLoading && commentsError && <div className="cf-corr-error">{commentsError}</div>}
              {!commentsLoading && !commentsError && comments.length === 0 && (
                <div className="cf-empty-msg">No comments yet.</div>
              )}
              {!commentsLoading && !commentsError && comments.length > 0 && (
                <div className="cf-comments-list">
                  {comments.map(item => (
                    <div key={item.id} className="cf-comment-item">
                      <div className="cf-comment-top">
                        <span className="cf-comment-author">{item.user_name || item.user_email || 'User'}</span>
                        <span className="cf-comment-time">{formatCorrDate(item.created_at)}</span>
                      </div>
                      <div className="cf-comment-text">{item.comment}</div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        )}

        {/* ── Tab: Contacts ── */}
        {activeTab === 'contacts' && (
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

        {/* ── Tab: Correspondence ── */}
        {activeTab === 'correspondence' && (
          <div className="cf-tab-pane">
              {corrLoading && <div className="cf-empty-msg">Loading correspondence…</div>}
              {!corrLoading && corrError && <div className="cf-corr-error">{corrError}</div>}
              {!corrLoading && !corrError && correspondence.length === 0 && (
                <div className="cf-empty-msg">
                  No case communication tracked yet. Email/reply/forward linked to this case will appear here.
                </div>
              )}

              {!corrLoading && !corrError && correspondence.length > 0 && (
                <>
                  <div className="cf-corr-filterbar">
                    {[
                      { key: 'all', label: `All (${correspondence.length})` },
                      { key: 'inbox', label: `Inbox (${correspondence.filter(i => getCorrBox(i) === 'inbox').length})` },
                      { key: 'sent', label: `Sent (${correspondence.filter(i => getCorrBox(i) === 'sent').length})` },
                    ].map(opt => (
                      <button
                        key={opt.key}
                        className={`cf-corr-filter ${corrFilter === opt.key ? 'active' : ''}`}
                        onClick={() => setCorrFilter(opt.key)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <div className="cf-corr-toolbar">
                    <input
                      className="cf-corr-search"
                      type="text"
                      placeholder="Search subject/body/sender/recipient..."
                      value={corrSearch}
                      onChange={e => setCorrSearch(e.target.value)}
                    />
                    <label className="cf-corr-date-field">
                      <span>From</span>
                      <input type="date" value={corrFromDate} onChange={e => setCorrFromDate(e.target.value)} />
                    </label>
                    <label className="cf-corr-date-field">
                      <span>To</span>
                      <input type="date" value={corrToDate} onChange={e => setCorrToDate(e.target.value)} />
                    </label>
                    <button
                      className="cf-cancel-btn"
                      onClick={() => { setCorrSearch(''); setCorrFromDate(''); setCorrToDate('') }}
                    >
                      Clear
                    </button>
                  </div>

                  {filteredCorrespondence.length === 0 && (
                    <div className="cf-empty-msg">No {corrFilter} items in this case yet.</div>
                  )}

                  <div className="cf-corr-list">
                    {filteredCorrespondence.map((item, index) => {
                    const dir = getCorrDirection(item)
                    const root = getThreadRootId(item)
                    const prev = filteredCorrespondence[index - 1]
                    const showGroup = !prev || getThreadRootId(prev) !== root
                    return (
                      <div key={item.id}>
                        {showGroup && (
                          <div className="cf-corr-thread-label">Thread #{root}</div>
                        )}
                      <div className={`cf-corr-card ${dir}`}>
                        <div className="cf-corr-top">
                          <span className={`cf-corr-dir ${dir}`}>{dir === 'outbound' ? 'Outbound' : 'Inbound'}</span>
                          <span className="cf-corr-source">{item.source_tag || 'Email'}</span>
                          <span className="cf-corr-time">{formatCorrDate(item.received_at)}</span>
                        </div>
                        <div className="cf-corr-subject">{item.subject || '(No subject)'}</div>
                        <div className="cf-corr-meta">
                          <span><strong>From:</strong> {item.sender || '-'}</span>
                          <span><strong>To:</strong> {item.recipient || '-'}</span>
                          <span><strong>Status:</strong> {item.status || '-'}</span>
                          <span><strong>Attachments:</strong> {item.attachments_count || 0}</span>
                          {item.original_inquiry_id ? <span><strong>Thread Root:</strong> #{item.original_inquiry_id}</span> : null}
                        </div>
                        {item.body && (
                          <div className="cf-corr-body">
                            {item.body.length > 500 ? `${item.body.slice(0, 500)}…` : item.body}
                          </div>
                        )}
                        <div className="cf-corr-actions">
                          <button className="cf-open-btn" onClick={() => setActiveCorrItem(item)}>
                            View Full Message
                          </button>
                          {getCorrDirection(item) === 'inbound' && (
                            <>
                              <button className="cf-open-btn" onClick={() => openCorrCompose('reply', item)}>
                                Reply
                              </button>
                              <button className="cf-open-btn" onClick={() => openCorrCompose('forward', item)}>
                                Forward
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      </div>
                    )
                  })}
                  </div>
                </>
              )}
          </div>
        )}

        {/* ── Tab: MI Component ── */}
        {activeTab === 'mi' && (
          <div className="cf-tab-pane">
              <div className="cf-section-header-row">
                <button className="cf-add-btn" onClick={addMITab}>+ Add MI</button>
                <button className="cf-open-btn" style={{ marginLeft: 8 }} onClick={() => setMiRespModal(true)}>📨 Record MI Response</button>
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
                    <div className="cf-form-field cf-form-field--full">
                      <label>Linked Documents</label>
                      <CaseAssociatedDocs miTab={miTabs[activeMiTab]} token={token} />
                    </div>
                    <div className="cf-form-actions">
                      <button className="cf-delete-btn" onClick={deleteMITab}>Delete MI {activeMiTab + 1}</button>
                      <button className="cf-save-btn" onClick={saveMI}>Save MI</button>
                    </div>
                  </div>
                </>
              )}

              {/* MI Response History */}
              <div className="cf-response-history">
                <div className="cf-response-history-title">📋 Response History</div>
                {miRespLoading && <div className="cf-empty-msg">Loading responses…</div>}
                {!miRespLoading && miResponses.length === 0 && (
                  <div className="cf-empty-msg">No MI responses recorded yet. Click "Record MI Response" to log one.</div>
                )}
                {!miRespLoading && miResponses.map(r => (
                  <div key={r.id} className="cf-response-card">
                    <div className="cf-response-top">
                      <span className="cf-response-channel">{r.channel}</span>
                      <span className="cf-response-date">{r.responded_at ? String(r.responded_at).slice(0, 10) : '-'}</span>
                      {r.follow_up_required ? <span className="cf-followup-badge">⚠ Follow-up Required</span> : null}
                      <span className="cf-followup-badge" style={{
                        background: r.response_status === 'SENT' ? '#dcfce7' : r.response_status === 'APPROVED' ? '#dbeafe' : '#fef3c7',
                        color: r.response_status === 'SENT' ? '#166534' : r.response_status === 'APPROVED' ? '#1d4ed8' : '#92400e',
                      }}>{r.response_status || 'SENT'}</span>
                      <span className="cf-response-meta">by {r.responded_by_name || 'User'}</span>
                    </div>
                    <div className="cf-response-text">{r.response_text}</div>
                    <div className="cf-tx-status-actions" style={{ marginTop: 10 }}>
                      {r.response_status !== 'READY' && r.response_status !== 'SENT' && (
                        <button className="cf-tx-status-btn" onClick={() => changeMiResponseStatus(r.id, 'READY')}>
                          Mark Ready
                        </button>
                      )}
                      {r.response_status !== 'APPROVED' && r.response_status !== 'SENT' && (
                        <button className="cf-tx-status-btn" onClick={() => changeMiResponseStatus(r.id, 'APPROVED')}>
                          Approve
                        </button>
                      )}
                      {r.response_status !== 'SENT' && (
                        <button className="cf-tx-status-btn active" onClick={() => changeMiResponseStatus(r.id, 'SENT')}>
                          Send
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
          </div>
        )}

        {/* ── Tab: AE Component ── */}
        {activeTab === 'ae' && (
          <div className="cf-tab-pane">
              <div className="cf-section-header-row">
                <button className="cf-add-btn" onClick={createAEVersion}>+ New Version</button>
                <button className="cf-tx-trigger-btn" onClick={() => setAeTxDrawer(p => !p)}>
                  🔬 {aeTxDrawer ? 'Cancel Transmission' : 'Transmit to PV'}
                </button>
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
                      getFieldConfig={getFieldConfig}
                      getPicklistOptions={getPicklistOptions}
                      versionId={activeAeVer?.id}
                      headers={headers}
                      onSave={saveAETab}
                    />
                  )}
                </>
              )}

              {/* AE Transmission Drawer + Tracker */}
              {aeTxDrawer && (
                <div className="cf-tx-drawer">
                  <div className="cf-tx-drawer-title">New AE Transmission → PV Team</div>
                  <div className="cf-form-grid">
                    <div className="cf-form-field">
                      <label>Assign To (PV Team)</label>
                      <select value={aeTxForm.assigned_to_id} onChange={e => setAeTxForm(p => ({ ...p, assigned_to_id: e.target.value }))}>
                        <option value="">— Select Assignee —</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </div>
                    <div className="cf-form-field">
                      <label>Priority</label>
                      <select value={aeTxForm.priority} onChange={e => setAeTxForm(p => ({ ...p, priority: e.target.value }))}>
                        <option value="routine">Routine (30 days)</option>
                        <option value="expedited">Expedited (15 days)</option>
                        <option value="urgent">Urgent (7 days)</option>
                      </select>
                    </div>
                    <div className="cf-form-field cf-form-field--full">
                      <label>Clinical Narrative</label>
                      <textarea rows={3} value={aeTxForm.narrative}
                        onChange={e => setAeTxForm(p => ({ ...p, narrative: e.target.value }))}
                        placeholder="Clinical narrative for PV team…" />
                    </div>
                  </div>
                  <div className="cf-form-actions">
                    <button className="cf-cancel-btn" onClick={() => setAeTxDrawer(false)}>Cancel</button>
                    <button className="cf-save-btn" onClick={createAeTransmission} disabled={aeTxSaving}>
                      {aeTxSaving ? 'Transmitting…' : 'Transmit to PV'}
                    </button>
                  </div>
                </div>
              )}

              <div className="cf-tx-tracker">
                <div className="cf-tx-tracker-title">AE Transmission Tracker</div>
                {aeTxLoading && <div className="cf-empty-msg">Loading transmissions…</div>}
                {!aeTxLoading && aeTransmissions.length === 0 && (
                  <div className="cf-empty-msg">No AE transmissions created yet.</div>
                )}
                {!aeTxLoading && aeTransmissions.map(tx => (
                  <div key={tx.id} className="cf-tx-card">
                    <div className="cf-tx-card-top">
                      <span className={`cf-tx-status-badge cf-tx-status--${(tx.status || '').toLowerCase().replace(/\s+/g, '-')}`}>{tx.status}</span>
                      <span className="cf-tx-meta">Priority: <strong>{tx.priority}</strong></span>
                      {tx.due_date && <span className="cf-tx-meta">Due: {String(tx.due_date).slice(0, 10)}</span>}
                      <span className="cf-tx-meta">→ {tx.assignee_name || 'Unassigned'}</span>
                    </div>
                    {tx.narrative && <div className="cf-tx-narrative">{tx.narrative}</div>}
                    <div className="cf-tx-status-actions">
                      {['Pending', 'In Review', 'Accepted', 'Closed'].map(s => (
                        <button key={s}
                          className={`cf-tx-status-btn${tx.status === s ? ' active' : ''}`}
                          onClick={() => updateAeTxStatus(tx.id, s)}
                          disabled={tx.status === s}>{s}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
          </div>
        )}

        {/* ── Tab: PC Component ── */}
        {activeTab === 'pc' && (
          <div className="cf-tab-pane">
              <div className="cf-section-header-row">
                <button className="cf-add-btn" onClick={createPCVersion}>+ New Version</button>
                <button className="cf-tx-trigger-btn" onClick={() => setPcTxDrawer(p => !p)}>
                  🧪 {pcTxDrawer ? 'Cancel Routing' : 'Route to Quality'}
                </button>
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
                      getPicklistOptions={getPicklistOptions}
                      versionId={activePcVer?.id}
                      headers={headers}
                      onSave={savePCTab}
                    />
                  )}
                </>
              )}

              {/* PC Transmission Drawer + Tracker */}
              {pcTxDrawer && (
                <div className="cf-tx-drawer">
                  <div className="cf-tx-drawer-title">New PC Routing → Quality Team</div>
                  <div className="cf-form-grid">
                    <div className="cf-form-field">
                      <label>Assign To (Quality Team)</label>
                      <select value={pcTxForm.assigned_to_id} onChange={e => setPcTxForm(p => ({ ...p, assigned_to_id: e.target.value }))}>
                        <option value="">— Select Assignee —</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </div>
                    <div className="cf-form-field">
                      <label>Priority</label>
                      <select value={pcTxForm.priority} onChange={e => setPcTxForm(p => ({ ...p, priority: e.target.value }))}>
                        <option value="routine">Routine</option>
                        <option value="expedited">Expedited</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                    <div className="cf-form-field cf-form-field--full">
                      <label>Notes for Quality Team</label>
                      <textarea rows={3} value={pcTxForm.notes}
                        onChange={e => setPcTxForm(p => ({ ...p, notes: e.target.value }))}
                        placeholder="Context and notes for quality team…" />
                    </div>
                  </div>
                  <div className="cf-form-actions">
                    <button className="cf-cancel-btn" onClick={() => setPcTxDrawer(false)}>Cancel</button>
                    <button className="cf-save-btn" onClick={createPcTransmission} disabled={pcTxSaving}>
                      {pcTxSaving ? 'Routing…' : 'Route to Quality'}
                    </button>
                  </div>
                </div>
              )}

              <div className="cf-tx-tracker">
                <div className="cf-tx-tracker-title">PC Quality Routing Tracker</div>
                {pcTxLoading && <div className="cf-empty-msg">Loading routings…</div>}
                {!pcTxLoading && pcTransmissions.length === 0 && (
                  <div className="cf-empty-msg">No PC routings created yet.</div>
                )}
                {!pcTxLoading && pcTransmissions.map(tx => (
                  <div key={tx.id} className="cf-tx-card">
                    <div className="cf-tx-card-top">
                      <span className={`cf-tx-status-badge cf-tx-status--${(tx.status || '').toLowerCase().replace(/\s+/g, '-')}`}>{tx.status}</span>
                      <span className="cf-tx-meta">Priority: <strong>{tx.priority}</strong></span>
                      <span className="cf-tx-meta">→ {tx.assignee_name || 'Unassigned'}</span>
                    </div>
                    {tx.notes && <div className="cf-tx-narrative">{tx.notes}</div>}
                    <div className="cf-tx-status-actions">
                      {['Pending', 'Under Investigation', 'Closed'].map(s => (
                        <button key={s}
                          className={`cf-tx-status-btn${tx.status === s ? ' active' : ''}`}
                          onClick={() => updatePcTxStatus(tx.id, s)}
                          disabled={tx.status === s}>{s}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
          </div>
        )}

      </div>{/* end cf-tab-content */}

      {activeCorrItem && (
        <div className="cf-corr-modal-overlay" onClick={() => setActiveCorrItem(null)}>
          <div className="cf-corr-modal" onClick={e => e.stopPropagation()}>
            <div className="cf-corr-modal-header">
              <div className="cf-corr-modal-title">{activeCorrItem.subject || '(No subject)'}</div>
              <button className="cf-corr-modal-close" onClick={() => setActiveCorrItem(null)}>✕</button>
            </div>
            <div className="cf-corr-modal-meta">
              <span><strong>From:</strong> {activeCorrItem.sender || '-'}</span>
              <span><strong>To:</strong> {activeCorrItem.recipient || '-'}</span>
              <span><strong>Direction:</strong> {getCorrDirection(activeCorrItem)}</span>
              <span><strong>Type:</strong> {activeCorrItem.source_tag || 'Email'}</span>
              <span><strong>Time:</strong> {formatCorrDate(activeCorrItem.received_at)}</span>
              <span><strong>Status:</strong> {activeCorrItem.status || '-'}</span>
            </div>
            <div className="cf-corr-modal-body">{activeCorrItem.body || '(No content)'}</div>
            <div className="cf-corr-attachments">
              <div className="cf-corr-attachments-title">Attachments</div>
              {corrAttLoading && <div className="cf-corr-attachments-empty">Loading attachments…</div>}
              {!corrAttLoading && corrAttachments.length === 0 && (
                <div className="cf-corr-attachments-empty">No attachments</div>
              )}
              {!corrAttLoading && corrAttachments.length > 0 && (
                <div className="cf-corr-attachments-list">
                  {corrAttachments.map(att => (
                    <div key={att.id} className="cf-corr-attachment-item">
                      <span className="cf-corr-attachment-name">{att.filename}</span>
                      <span className="cf-corr-attachment-meta">{att.mime_type || '-'} · {att.size_bytes || 0} bytes</span>
                      <div className="cf-corr-attachment-actions">
                        <button className="cf-open-btn" onClick={() => previewCorrAttachment(att)}>Preview</button>
                        <button className="cf-open-btn" onClick={() => downloadCorrAttachment(att)}>Download</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MI Response Modal */}
      {miRespModal && (
        <div className="cf-corr-compose-overlay" onClick={() => !miRespSaving && setMiRespModal(false)}>
          <div className="cf-corr-compose-modal" onClick={e => e.stopPropagation()}>
            <div className="cf-corr-compose-header">
              <div className="cf-corr-compose-title">📨 Record MI Response</div>
              <button className="cf-corr-modal-close" onClick={() => !miRespSaving && setMiRespModal(false)}>✕</button>
            </div>
            <div className="cf-corr-compose-body">
              <div className="cf-form-grid">
                <div className="cf-form-field">
                  <label>Channel</label>
                  <select value={miRespForm.channel} onChange={e => setMiRespForm(p => ({ ...p, channel: e.target.value }))} disabled={miRespSaving}>
                    {['email', 'phone', 'letter', 'portal', 'fax', 'in-person'].map(c => (
                      <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div className="cf-form-field">
                  <label>Response Date</label>
                  <input type="date" value={miRespForm.responded_at}
                    onChange={e => setMiRespForm(p => ({ ...p, responded_at: e.target.value }))}
                    disabled={miRespSaving} />
                </div>
                <div className="cf-form-field cf-form-field--full">
                  <label>
                    <input type="checkbox" checked={miRespForm.follow_up_required}
                      onChange={e => setMiRespForm(p => ({ ...p, follow_up_required: e.target.checked }))}
                      disabled={miRespSaving} style={{ marginRight: 6 }} />
                    Follow-up Required
                  </label>
                </div>
              </div>
              <div className="cf-form-field">
                <label>Response Text <span style={{ color: '#dc2626' }}>*</span></label>
                <textarea rows={8} value={miRespForm.response_text}
                  onChange={e => setMiRespForm(p => ({ ...p, response_text: e.target.value }))}
                  placeholder="Enter the MI response provided to the requestor…"
                  disabled={miRespSaving} />
              </div>
            </div>
            <div className="cf-form-actions" style={{ padding: '12px 14px', marginTop: 0 }}>
              <button className="cf-cancel-btn" onClick={() => !miRespSaving && setMiRespModal(false)}>Cancel</button>
              <button className="cf-open-btn" onClick={() => submitMiResponse('DRAFT')} disabled={miRespSaving}>
                {miRespSaving ? 'Saving…' : 'Save Draft'}
              </button>
              <button className="cf-save-btn" onClick={() => submitMiResponse('SENT')} disabled={miRespSaving}>
                {miRespSaving ? 'Recording…' : 'Send Response'}
              </button>
            </div>
          </div>
        </div>
      )}

      {corrCompose && (
        <div className="cf-corr-compose-overlay" onClick={() => !corrCompose.sending && setCorrCompose(null)}>
          <div className="cf-corr-compose-modal" onClick={e => e.stopPropagation()}>
            <div className="cf-corr-compose-header">
              <div className="cf-corr-compose-title">
                {corrCompose.mode === 'reply' ? 'Reply from Case Correspondence' : 'Forward from Case Correspondence'}
              </div>
              <button className="cf-corr-modal-close" onClick={() => !corrCompose.sending && setCorrCompose(null)}>✕</button>
            </div>
            <div className="cf-corr-compose-body">
              <div className="cf-form-field">
                <label>To</label>
                <input
                  type="email"
                  value={corrCompose.to}
                  onChange={e => setCorrCompose(prev => ({ ...prev, to: e.target.value }))}
                  disabled={corrCompose.sending}
                />
              </div>
              <div className="cf-form-field">
                <label>Subject</label>
                <input
                  type="text"
                  value={corrCompose.subject}
                  onChange={e => setCorrCompose(prev => ({ ...prev, subject: e.target.value }))}
                  disabled={corrCompose.sending}
                />
              </div>
              <div className="cf-form-field">
                <label>Message</label>
                <textarea
                  rows={14}
                  value={corrCompose.body}
                  onChange={e => setCorrCompose(prev => ({ ...prev, body: e.target.value }))}
                  disabled={corrCompose.sending}
                />
              </div>
              {corrCompose.error && <div className="cf-corr-error">{corrCompose.error}</div>}
            </div>
            <div className="cf-form-actions" style={{ padding: '12px 14px', marginTop: 0 }}>
              <button className="cf-cancel-btn" onClick={() => !corrCompose.sending && setCorrCompose(null)}>Cancel</button>
              <button className="cf-save-btn" onClick={sendCorrCompose} disabled={corrCompose.sending}>
                {corrCompose.sending ? 'Sending…' : (corrCompose.mode === 'reply' ? 'Send Reply' : 'Send Forward')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </MIMSLayout>
  )
}

// ── AE Tab Panel ──────────────────────────────────────────────────────────────

function AETabPanel({ tabKey, data, onChange, locked, onSave, getPicklistOptions, getFieldConfig = () => null }) {
  const d = data || {}
  const set = (key, val) => onChange({ ...d, [key]: val })

  const fieldRow = (label, key, type = 'text', sectionName = null) => {
    const displayLabel = (sectionName && getFieldConfig(sectionName, label)?.custom_label) || label
    return (
    <div key={key} className="cf-form-field">
      <label>{displayLabel}</label>
      {type === 'textarea'
        ? <textarea rows={3} value={d[key] || ''} disabled={locked} onChange={e => set(key, e.target.value)} />
        : <input type={type} value={d[key] || ''} disabled={locked} onChange={e => set(key, e.target.value)} />}
    </div>
  )
  }

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

      {tabKey === 'ae-flex-fields' && (
        <div>
          <h3 className="cf-subsection-title">AE Flex Fields</h3>
          <div className="cf-form-grid">
            {fieldRow('Additional Field 1', 'ae_flex_1')}
            {fieldRow('Additional Field 2', 'ae_flex_2')}
            {fieldRow('Additional Field 3', 'ae_flex_3')}
          </div>
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
              {getPicklistOptions('AE — Patient Information', 'Pregnant').length > 0
                ? getPicklistOptions('AE — Patient Information', 'Pregnant').map(o => <option key={o.value} value={o.value}>{o.label}</option>)
                : <option value=''>Loading...</option>}
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

function PCTabPanel({ tabKey, data, onChange, locked, onSave, getPicklistOptions }) {
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

  const selectRow = (label, key, sectionName, fieldName) => (
    <div key={key} className="cf-form-field">
      <label>{label}</label>
      <select value={d[key] ?? ''} disabled={locked} onChange={e => set(key, e.target.value)}>
        {getPicklistOptions(sectionName, fieldName).length > 0
          ? getPicklistOptions(sectionName, fieldName).map(o => <option key={o.value} value={o.value}>{o.label}</option>)
          : <option value=''>Loading...</option>}
      </select>
    </div>
  )

  return (
    <div className="cf-tab-panel">
      {tabKey === 'general' && (
        <div className="cf-form-grid">
          {fieldRow('Complaint Description', 'complaint_description', 'textarea')}
          {selectRow('PC Status',            'pc_status',          'PC — General', 'PC Status')}
          {selectRow('PC Category',          'pc_category',        'PC — General', 'PC Category')}
          {selectRow('PC Classification',    'pc_classification',  'PC — General', 'PC Classification')}
          {fieldRow('Date of Complaint',     'date_of_complaint', 'date')}
          {fieldRow('Date Received',         'date_received',     'date')}
          {fieldRow('Severity',              'severity')}
          <div className="cf-form-field cf-form-field--full">{fieldRow('Additional Info', 'additional_info', 'textarea')}</div>
        </div>
      )}

      {tabKey === 'pc-flex-fields' && (
        <div>
          <h3 className="cf-subsection-title">PC Flex Fields</h3>
          <div className="cf-form-grid">
            {fieldRow('Additional Field 1', 'pc_flex_1')}
            {fieldRow('Additional Field 2', 'pc_flex_2')}
            {fieldRow('Additional Field 3', 'pc_flex_3')}
          </div>
        </div>
      )}

      {tabKey === 'patient-info' && (
        <div className="cf-form-grid">
          {fieldRow('Age',                'age',                 'number')}
          {fieldRow('Age Unit',           'age_unit')}
          {selectRow('Gender',            'gender',              'PC — Patient Information', 'Gender')}
          {fieldRow('Weight (kg)',        'weight_kg',           'number')}
          {fieldRow('Therapy Start Date', 'therapy_start_date',  'date')}
          {fieldRow('Therapy End Date',   'therapy_end_date',    'date')}
          {fieldRow('Indication',         'indication')}
          {selectRow('Injury Experienced','injury_experienced',  'PC — Patient Information', 'Injury Experienced')}
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
          {selectRow('Return Requested',    'return_requested', 'PC — Return & Retrieval', 'Return Requested')}
          {fieldRow('Return Date',          'return_date',    'date')}
          {fieldRow('Return Method',        'return_method')}
          {boolField('Retrieval Requested', 'retrieval_requested')}
          {fieldRow('Retrieval Date',       'retrieval_date', 'date')}
          {selectRow('Retrieval Method',    'retrieval_method', 'PC — Return & Retrieval', 'Retrieval Method')}
          {fieldRow('Tracking Number',      'tracking_number')}
          <div className="cf-form-field cf-form-field--full">{fieldRow('Notes', 'notes', 'textarea')}</div>
        </div>
      )}

      {tabKey === 'replacement' && (
        <div className="cf-form-grid">
          {boolField('Replacement Requested', 'replacement_requested')}
          {selectRow('Replacement Approved',  'replacement_approved', 'PC — Replacement', 'Replacement Approved')}
          {fieldRow('Replacement Date',       'replacement_date',    'date')}
          {fieldRow('Replacement Product',    'replacement_product')}
          {fieldRow('Quantity',               'quantity',            'number')}
          <div className="cf-form-field cf-form-field--full">{fieldRow('Notes', 'notes', 'textarea')}</div>
        </div>
      )}

      {tabKey === 'refund-credit' && (
        <div className="cf-form-grid">
          {boolField('Refund Requested',  'refund_requested')}
          {selectRow('Refund Approved',   'refund_approved', 'PC — Refund & Credit', 'Refund Approved')}
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

// ── Dynamic Fields Section (Sprint 16) ────────────────────────────────────────

function DynamicFieldsSection({ sections, values, onChange, onSave, saving }) {
  const activeSections = (sections || []).filter(s => Array.isArray(s.fields) && s.fields.length > 0)
  if (activeSections.length === 0) return null

  function renderField(field) {
    const fid = field.id
    const val = values[fid] ?? ''
    const label = field.custom_label || field.field_name
    const set = (v) => onChange(prev => ({ ...prev, [fid]: v }))

    if (field.field_type === 'textarea') {
      return (
        <div key={fid} className="cf-form-field cf-form-field--full">
          <label>{label}{field.is_required ? ' *' : ''}</label>
          <textarea rows={3} value={val} placeholder={field.placeholder_text || ''} onChange={e => set(e.target.value)} />
        </div>
      )
    }
    if (field.field_type === 'number') {
      return (
        <div key={fid} className="cf-form-field">
          <label>{label}{field.is_required ? ' *' : ''}</label>
          <input type="number" value={val} placeholder={field.placeholder_text || ''} onChange={e => set(e.target.value)} />
        </div>
      )
    }
    if (field.field_type === 'date') {
      return (
        <div key={fid} className="cf-form-field">
          <label>{label}{field.is_required ? ' *' : ''}</label>
          <input type="date" value={val} onChange={e => set(e.target.value)} />
        </div>
      )
    }
    if (field.field_type === 'checkbox') {
      return (
        <div key={fid} className="cf-form-field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!val} onChange={e => set(e.target.checked)} />
            {label}{field.is_required ? ' *' : ''}
          </label>
        </div>
      )
    }
    if (field.field_type === 'dropdown') {
      return (
        <div key={fid} className="cf-form-field">
          <label>{label}{field.is_required ? ' *' : ''}</label>
          <select value={val} onChange={e => set(e.target.value)}>
            <option value="">— Select —</option>
            {(Array.isArray(field.options) ? field.options : []).map(o => (
              <option key={o.value} value={o.value}>{o.label || o.value}</option>
            ))}
          </select>
        </div>
      )
    }
    if (field.field_type === 'multi-select') {
      const selected = Array.isArray(val) ? val : (val ? String(val).split(',').filter(Boolean) : [])
      const opts = Array.isArray(field.options) ? field.options : []
      return (
        <div key={fid} className="cf-form-field">
          <label>{label}{field.is_required ? ' *' : ''}</label>
          <div className="cf-multi-select">
            {opts.map(o => (
              <label key={o.value} className="cf-multi-opt">
                <input type="checkbox" checked={selected.includes(String(o.value))}
                  onChange={e => {
                    const next = e.target.checked
                      ? [...selected, String(o.value)]
                      : selected.filter(x => x !== String(o.value))
                    set(next.join(','))
                  }} />
                {o.label || o.value}
              </label>
            ))}
          </div>
        </div>
      )
    }
    // default: text
    return (
      <div key={fid} className="cf-form-field">
        <label>{label}{field.is_required ? ' *' : ''}</label>
        <input type="text" value={val} placeholder={field.placeholder_text || ''} onChange={e => set(e.target.value)} />
      </div>
    )
  }

  return (
    <div className="cf-dyn-fields-section">
      <div className="cf-dyn-fields-title">⚙ Additional Fields (Admin-Configured)</div>
      {activeSections.map(section => (
        <div key={section.section_name} className="cf-dyn-section">
          <div className="cf-dyn-section-label">{section.section_label || section.section_name}</div>
          <div className="cf-form-grid">
            {[...section.fields]
              .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
              .map(f => renderField(f))}
          </div>
        </div>
      ))}
      <div className="cf-form-actions">
        <button className="cf-save-btn" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Additional Fields'}
        </button>
      </div>
    </div>
  )
}
