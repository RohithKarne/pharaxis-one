import { useState, useEffect } from 'react'
import DOMPurify from 'dompurify'
import CaseAssociatedDocs from './CaseAssociatedDocs'
import RichTextEditor from '../../content/components/RichTextEditor'
import toast from '../../../shared/utils/toast'
import { confirm } from '../../../shared/utils/confirm'
import { httpFetch } from '../../../shared/api/httpFetch.js'

const API = import.meta.env.VITE_API_URL || '/api'

function formatProductOption(product) {
  const parts = [product.trade_name]
  if (product.family_name) parts.push(`Family: ${product.family_name}`)
  const groupNames = Object.values(product.product_groups || {})
    .flat()
    .map(group => group?.name)
    .filter(Boolean)
  if (groupNames.length) parts.push(`Groups: ${groupNames.join(', ')}`)
  return parts.filter(Boolean).join(' - ')
}

function parseJsonList(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function emptyMiRespForm(tab = null) {
  return {
    mi_tab_id: tab?.id || '',
    recipient_contact_id: '',
    recipient_email: '',
    recipient_name: '',
    product_id: tab?.product_id || '',
    template_id: '',
    response_subject: '',
    body_html: '',
    custom_text: '',
    channel: 'email',
    responded_at: '',
    follow_up_required: false,
    selected_document_ids: [],
    selected_module_ids: [],
    language: 'en',
    is_customized: false,
    customization_notes: '',
  }
}

export default function CaseMITab({ id, token, headers, setSavedMsg, onCountChange }) {
  const miDraftStorageKey = `mims_case_${id}_mi_response_draft`

  const [miTabs,       setMiTabs]       = useState([])
  const [activeMiTab,  setActiveMiTab]  = useState(0)
  const [miForm,       setMiForm]       = useState({})
  const [miProducts,   setMiProducts]   = useState([])

  const [miResponses,    setMiResponses]    = useState([])
  const [miRespLoading,  setMiRespLoading]  = useState(false)
  const [miRespModal,    setMiRespModal]    = useState(false)
  const [miRespForm,     setMiRespForm]     = useState(emptyMiRespForm())
  const [miRespSaving,   setMiRespSaving]   = useState(false)
  const [miEsignModal,   setMiEsignModal]   = useState(null)
  const [miEsignForm,    setMiEsignForm]    = useState({ password: '', reason: '' })
  const [miEsignSaving,  setMiEsignSaving]  = useState(false)
  const [builderContext, setBuilderContext] = useState(null)
  const [builderLoading, setBuilderLoading] = useState(false)
  const [builderPreview, setBuilderPreview] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => { loadMI(); loadMiResponses() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!miRespModal) return
    try {
      const stored = localStorage.getItem(miDraftStorageKey)
      if (!stored) return
      const parsed = JSON.parse(stored)
      if (parsed && typeof parsed === 'object') setMiRespForm(prev => ({ ...prev, ...parsed }))
    } catch { /* no-op */ }
  }, [miRespModal]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!miRespModal) return
    try { localStorage.setItem(miDraftStorageKey, JSON.stringify(miRespForm)) } catch { /* no-op */ }
  }, [miDraftStorageKey, miRespForm, miRespModal])

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

  async function loadMI() {
    try {
      const [tabsRes, prodsRes] = await Promise.all([
        httpFetch(`${API}/cases/${id}/mi`, { headers }),
        httpFetch(`${API}/cases/mi/products`, { headers }),
      ])
      const tabsData  = await tabsRes.json()
      const prodsData = await prodsRes.json()
      const list = Array.isArray(tabsData) ? tabsData : []
      setMiTabs(list)
      onCountChange?.(list.length)
      setMiProducts(Array.isArray(prodsData) ? prodsData : [])
      if (list.length > 0) { setActiveMiTab(0); setMiForm(toMiForm(list[0])) }
    } catch { setMiTabs([]) }
  }

  async function loadMiResponses() {
    setMiRespLoading(true)
    try {
      const res  = await httpFetch(`${API}/cases/${id}/mi-responses`, { headers })
      const data = await res.json()
      setMiResponses(Array.isArray(data) ? data : [])
    } catch { setMiResponses([]) }
    finally { setMiRespLoading(false) }
  }

  async function loadBuilderContext(formOverride = {}) {
    setBuilderLoading(true)
    try {
      const params = new URLSearchParams()
      const tabId = formOverride.mi_tab_id || miRespForm.mi_tab_id || miTabs[activeMiTab]?.id || ''
      const productId = formOverride.product_id || miRespForm.product_id || miTabs[activeMiTab]?.product_id || ''
      if (tabId) params.set('mi_tab_id', tabId)
      if (productId) params.set('product_id', productId)
      const res = await httpFetch(`${API}/cases/${id}/mi-response-builder/context?${params}`, { headers })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load response builder context.')
      setBuilderContext(data)
      const primaryRecipient = data.recipients?.[0]
      setMiRespForm(prev => ({
        ...prev,
        mi_tab_id: tabId || data.mi_tab?.id || prev.mi_tab_id,
        product_id: productId || data.mi_tab?.product_id || prev.product_id,
        recipient_contact_id: prev.recipient_contact_id || primaryRecipient?.case_contact_id || '',
        recipient_email: prev.recipient_email || primaryRecipient?.email || '',
        recipient_name: prev.recipient_name || primaryRecipient?.name || '',
      }))
    } catch (err) {
      toast.error(err.message)
      setBuilderContext(null)
    } finally {
      setBuilderLoading(false)
    }
  }

  function openResponseBuilder() {
    const tab = miTabs[activeMiTab] || null
    const nextForm = emptyMiRespForm(tab)
    setMiRespForm(nextForm)
    setBuilderPreview(null)
    setMiRespModal(true)
    loadBuilderContext(nextForm)
  }

  async function addMITab() {
    try {
      const res  = await httpFetch(`${API}/cases/${id}/mi`, { method: 'POST', headers, body: JSON.stringify({ status: 'Open' }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const updated = [...miTabs, data]
      setMiTabs(updated)
      onCountChange?.(updated.length)
      setActiveMiTab(updated.length - 1)
      setMiForm(toMiForm(data))
    } catch (err) { toast.error(err.message) }
  }

  async function saveMI() {
    const tab = miTabs[activeMiTab]
    if (!tab) return
    try {
      const res  = await httpFetch(`${API}/cases/mi/${tab.id}`, { method: 'PUT', headers, body: JSON.stringify(miForm) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMiTabs(prev => prev.map((t, i) => i === activeMiTab ? data : t))
      setSavedMsg('Saved'); setTimeout(() => setSavedMsg(''), 2000)
    } catch (err) { toast.error(err.message) }
  }

  async function deleteMITab() {
    const tab = miTabs[activeMiTab]
    if (!tab || !await confirm('Delete this MI tab?')) return
    try {
      await httpFetch(`${API}/cases/mi/${tab.id}`, { method: 'DELETE', headers })
      const updated = miTabs.filter((_, i) => i !== activeMiTab)
      setMiTabs(updated)
      onCountChange?.(updated.length)
      const newIdx = Math.max(0, activeMiTab - 1)
      setActiveMiTab(newIdx)
      setMiForm(updated[newIdx] ? toMiForm(updated[newIdx]) : {})
    } catch { toast.error('Failed to delete MI tab') }
  }

  function selectedTemplate() {
    return builderContext?.templates?.find(t => Number(t.id) === Number(miRespForm.template_id)) || null
  }

  function setRecipientFromContact(contactId) {
    const contact = builderContext?.recipients?.find(r => Number(r.case_contact_id) === Number(contactId))
    setMiRespForm(prev => ({
      ...prev,
      recipient_contact_id: contactId,
      recipient_email: contact?.email || '',
      recipient_name: contact?.name || '',
    }))
  }

  function setTemplate(templateId) {
    const tmpl = builderContext?.templates?.find(t => Number(t.id) === Number(templateId))
    setMiRespForm(prev => ({
      ...prev,
      template_id: templateId,
      response_subject: tmpl?.subject || '',
      body_html: tmpl?.body_html || '',
      is_customized: false,
    }))
    setBuilderPreview(null)
  }

  function applyBundle(bundleId) {
    const bundle = builderContext?.bundles?.find(b => Number(b.id) === Number(bundleId))
    if (!bundle) return
    const tmpl = builderContext?.templates?.find(t => Number(t.id) === Number(bundle.template_id))
    setMiRespForm(prev => ({
      ...prev,
      template_id: bundle.template_id || prev.template_id,
      response_subject: tmpl?.subject || prev.response_subject,
      body_html: tmpl?.body_html || prev.body_html,
      selected_document_ids: parseJsonList(bundle.document_ids),
      selected_module_ids: parseJsonList(bundle.module_ids),
      language: bundle.language || prev.language,
      is_customized: true,
      customization_notes: bundle.name,
    }))
    setBuilderPreview(null)
  }

  function toggleSelection(key, value) {
    const idNum = Number(value)
    setMiRespForm(prev => {
      const current = Array.isArray(prev[key]) ? prev[key].map(Number) : []
      const next = current.includes(idNum) ? current.filter(v => v !== idNum) : [...current, idNum]
      return { ...prev, [key]: next, is_customized: true }
    })
    setBuilderPreview(null)
  }

  async function previewMiResponse() {
    if (previewLoading) return null
    if (!miRespForm.template_id && !miRespForm.body_html && !miRespForm.custom_text) {
      toast.warn('Select a template or enter response body/custom text first.')
      return null
    }
    setPreviewLoading(true)
    try {
      const payload = {
        ...miRespForm,
        subject: miRespForm.response_subject,
        selected_document_ids: miRespForm.selected_document_ids,
        selected_module_ids: miRespForm.selected_module_ids,
      }
      const res = await httpFetch(`${API}/cases/${id}/mi-response-builder/preview`, {
        method: 'POST', headers, body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Preview failed.')
      setBuilderPreview(data)
      return data
    } catch (err) {
      toast.error(err.message)
      return null
    } finally {
      setPreviewLoading(false)
    }
  }

  async function submitMiResponse(responseStatus = 'DRAFT') {
    if (miRespSaving) return
    if (!miRespForm.template_id && !miRespForm.body_html && !miRespForm.custom_text) {
      toast.warn('Template, response body, or custom text is required.')
      return
    }
    setMiRespSaving(true)
    try {
      const payload = {
        ...miRespForm,
        response_channel: miRespForm.channel,
        response_date: miRespForm.responded_at || new Date().toISOString().slice(0, 10),
        response_status: responseStatus,
        response_body_html: miRespForm.body_html,
        response_subject: miRespForm.response_subject,
      }
      const res  = await httpFetch(`${API}/cases/${id}/mi-responses`, { method: 'POST', headers, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMiResponses(prev => [data, ...prev])
      setMiRespModal(false)
      setBuilderContext(null)
      setBuilderPreview(null)
      setMiRespForm(emptyMiRespForm())
      localStorage.removeItem(miDraftStorageKey)
      setSavedMsg(responseStatus === 'DRAFT' ? 'MI response draft saved' : 'MI response recorded')
      setTimeout(() => setSavedMsg(''), 2200)
    } catch (err) { toast.error(err.message) }
    finally { setMiRespSaving(false) }
  }

  async function advanceMiStatus(responseId, targetStatus) {
    if (['APPROVED', 'SENT'].includes(targetStatus)) {
      setMiEsignModal({ responseId, targetStatus })
      setMiEsignForm({ password: '', reason: '' })
      return
    }
    try {
      const res  = await httpFetch(`${API}/cases/${id}/mi-responses/${responseId}/status`, {
        method: 'PATCH', headers, body: JSON.stringify({ response_status: targetStatus, reason: `Moved to ${targetStatus}` }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMiResponses(prev => prev.map(r => r.id === responseId ? { ...r, response_status: data.response_status } : r))
      setSavedMsg(`MI Response -> ${targetStatus}`); setTimeout(() => setSavedMsg(''), 2000)
    } catch (err) { toast.error(err.message) }
  }

  async function submitMiEsign() {
    if (miEsignSaving || !miEsignModal) return
    if (!miEsignForm.password.trim()) { toast.warn('Password is required for electronic signature.'); return }
    if (!miEsignForm.reason.trim())   { toast.warn('Reason is required for electronic signature.');   return }
    setMiEsignSaving(true)
    try {
      const res  = await httpFetch(`${API}/cases/${id}/mi-responses/${miEsignModal.responseId}/status`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ response_status: miEsignModal.targetStatus, password: miEsignForm.password, reason: miEsignForm.reason }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMiResponses(prev => prev.map(r => r.id === miEsignModal.responseId
        ? { ...r, response_status: data.response_status, approved_by: data.approved_by, approved_at: data.approved_at, sent_at: data.sent_at }
        : r))
      setMiEsignModal(null)
      setMiEsignForm({ password: '', reason: '' })
      setSavedMsg(`MI Response e-signed -> ${miEsignModal.targetStatus}`)
      setTimeout(() => setSavedMsg(''), 2500)
    } catch (err) { toast.error(err.message) }
    finally { setMiEsignSaving(false) }
  }

  async function discardMiResponse(responseId) {
    if (!await confirm('Discard this draft response? This cannot be undone.')) return
    try {
      const res  = await httpFetch(`${API}/cases/${id}/mi-responses/${responseId}/discard`, {
        method: 'PATCH', headers, body: JSON.stringify({ reason: 'Discarded by user' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMiResponses(prev => prev.map(r => r.id === responseId ? { ...r, response_status: 'VOIDED' } : r))
      setSavedMsg('Draft discarded'); setTimeout(() => setSavedMsg(''), 2000)
    } catch (err) { toast.error(err.message) }
  }

  const documents = builderContext?.documents || []
  const modules = builderContext?.modules || []
  const templates = builderContext?.templates || []
  const bundles = builderContext?.bundles || []
  const chosenTemplate = selectedTemplate()

  return (
    <div className="cf-tab-pane">
      <div className="cf-section-header-row">
        <button className="cf-add-btn" onClick={addMITab}>+ Add MI</button>
        <button className="cf-open-btn" style={{ marginLeft: 8 }} onClick={openResponseBuilder}>Build MI Response</button>
      </div>

      {miTabs.length === 0 ? (
        <div className="cf-empty-msg">No MI components yet. Click "+ Add MI" to start.</div>
      ) : (
        <>
          <div className="cf-mi-tabs">
            {miTabs.map((t, i) => (
              <button key={t.id} className={`cf-mi-tab ${activeMiTab === i ? 'active' : ''}`} onClick={() => { setActiveMiTab(i); setMiForm(toMiForm(t)) }}>
                MI {i + 1} <span className={`cf-mi-status ${t.status.toLowerCase()}`}>{t.status}</span>
              </button>
            ))}
          </div>
          <div className="cf-mi-panel">
            <div className="cf-form-grid">
              {[
                { label: 'MI Category',          key: 'mi_category',           type: 'text' },
                { label: 'Subcategory',           key: 'subcategory',           type: 'text' },
                { label: 'Response Required By',  key: 'response_required_by',  type: 'date' },
                { label: 'Response Date',         key: 'response_date',         type: 'date' },
                { label: 'Response Channel',      key: 'response_channel',      type: 'text' },
              ].map(f => (
                <div key={f.key} className="cf-form-field">
                  <label>{f.label}</label>
                  <input type={f.type} value={miForm[f.key] || ''} onChange={e => setMiForm(p => ({ ...p, [f.key]: e.target.value }))} />
                </div>
              ))}
              <div className="cf-form-field">
                <label>Product</label>
                <select value={miForm.product_id || ''} onChange={e => setMiForm(p => ({ ...p, product_id: e.target.value || null }))}>
                  <option value="">- None -</option>
                  {miProducts.map(p => <option key={p.id} value={p.id}>{formatProductOption(p)}</option>)}
                </select>
              </div>
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

      <div className="cf-response-history">
        <div className="cf-response-history-title">Response History</div>
        {miRespLoading && <div className="cf-empty-msg">Loading responses...</div>}
        {!miRespLoading && miResponses.length === 0 && (
          <div className="cf-empty-msg">No MI responses recorded yet. Click "Build MI Response" to create one.</div>
        )}
        {!miRespLoading && miResponses.map(r => {
          const st = r.response_status || 'DRAFT'
          const isVoided = st === 'VOIDED'
          const isSent = st === 'SENT'
          const selectedDocs = parseJsonList(r.selected_documents)
          const bodyHtml = r.response_body_html || ''
          return (
            <div key={r.id} className={`cf-response-card${isVoided ? ' cf-response-voided' : ''}`}>
              <div className="cf-response-top">
                <span className={`cf-mi-status-badge cf-mi-status--${st.toLowerCase()}`}>{st}</span>
                <span className="cf-response-channel">{r.channel}</span>
                <span className="cf-response-date">{r.responded_at ? String(r.responded_at).slice(0, 10) : '-'}</span>
                {r.is_customized ? <span className="cf-response-customized">Customized</span> : null}
                {r.follow_up_required ? <span className="cf-followup-badge">Follow-up</span> : null}
                <span className="cf-response-meta">by {r.responded_by_name || 'User'}</span>
                {r.approved_by_name && <span className="cf-response-meta">signed by {r.approved_by_name}</span>}
              </div>
              {r.response_subject && <div className="cf-response-subject">Subject: {r.response_subject}</div>}
              {r.recipient_email && <div className="cf-response-meta-line">To: {r.recipient_name || r.recipient_email} &lt;{r.recipient_email}&gt;</div>}
              {r.template_name && <div className="cf-response-meta-line">Template: {r.template_name}</div>}
              {selectedDocs.length > 0 && <div className="cf-response-meta-line">Documents: {selectedDocs.map(d => d.name || d.doc_id || `#${d.id}`).join(', ')}</div>}
              {bodyHtml
                ? <div className="cf-response-rich" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(bodyHtml) }} />
                : r.response_text && <div className="cf-response-text">{r.response_text}</div>}
              {!isVoided && !isSent && (
                <div className="cf-mi-transition-row">
                  {st === 'DRAFT' && <>
                    <button className="cf-mi-trans-btn cf-mi-trans-submit" onClick={() => advanceMiStatus(r.id, 'READY')}>Submit for Review</button>
                    <button className="cf-mi-trans-btn cf-mi-trans-discard" onClick={() => discardMiResponse(r.id)}>Discard Draft</button>
                  </>}
                  {st === 'READY'    && <button className="cf-mi-trans-btn cf-mi-trans-approve" onClick={() => advanceMiStatus(r.id, 'APPROVED')}>Approve (e-sign required)</button>}
                  {st === 'APPROVED' && <button className="cf-mi-trans-btn cf-mi-trans-send"    onClick={() => advanceMiStatus(r.id, 'SENT')}>Send Response (e-sign required)</button>}
                </div>
              )}
              {isSent && <div className="cf-mi-final-badge">Sent - Record Immutable</div>}
              {isVoided && <div className="cf-mi-voided-label">Discarded</div>}
            </div>
          )
        })}
      </div>

      {miRespModal && (
        <div className="cf-corr-compose-overlay" onClick={() => !miRespSaving && setMiRespModal(false)}>
          <div className="cf-corr-compose-modal cf-response-builder-modal" onClick={e => e.stopPropagation()}>
            <div className="cf-corr-compose-header">
              <div className="cf-corr-compose-title">MI Response Builder</div>
              <button className="cf-corr-modal-close" onClick={() => !miRespSaving && setMiRespModal(false)}>x</button>
            </div>
            <div className="cf-corr-compose-body cf-response-builder-body">
              {builderLoading && <div className="cf-empty-msg">Loading response templates and documents...</div>}
              {!builderLoading && (
                <>
                  <div className="cf-builder-grid">
                    <div className="cf-builder-main">
                      <div className="cf-form-grid">
                        <div className="cf-form-field">
                          <label>MI Component</label>
                          <select value={miRespForm.mi_tab_id} onChange={e => { const tab = miTabs.find(t => Number(t.id) === Number(e.target.value)); const next = { mi_tab_id: e.target.value, product_id: tab?.product_id || '' }; setMiRespForm(p => ({ ...p, ...next })); loadBuilderContext(next) }} disabled={miRespSaving}>
                            {miTabs.map((tab, idx) => <option key={tab.id} value={tab.id}>MI {idx + 1} - {tab.question_summary || tab.product_name || 'Open inquiry'}</option>)}
                          </select>
                        </div>
                        <div className="cf-form-field">
                          <label>Reporter / Recipient</label>
                          <select value={miRespForm.recipient_contact_id} onChange={e => setRecipientFromContact(e.target.value)} disabled={miRespSaving}>
                            <option value="">Manual recipient</option>
                            {(builderContext?.recipients || []).map(contact => <option key={contact.case_contact_id} value={contact.case_contact_id}>{contact.name} - {contact.email || 'No email'}</option>)}
                          </select>
                        </div>
                        <div className="cf-form-field">
                          <label>Recipient Email</label>
                          <input value={miRespForm.recipient_email} onChange={e => setMiRespForm(p => ({ ...p, recipient_email: e.target.value, recipient_contact_id: '' }))} disabled={miRespSaving} />
                        </div>
                        <div className="cf-form-field">
                          <label>Product</label>
                          <select value={miRespForm.product_id || ''} onChange={e => { const next = { product_id: e.target.value || '' }; setMiRespForm(p => ({ ...p, ...next })); loadBuilderContext(next) }} disabled={miRespSaving}>
                            <option value="">- None -</option>
                            {miProducts.map(p => <option key={p.id} value={p.id}>{formatProductOption(p)}</option>)}
                          </select>
                        </div>
                        <div className="cf-form-field">
                          <label>Language</label>
                          <select value={miRespForm.language} onChange={e => setMiRespForm(p => ({ ...p, language: e.target.value, is_customized: true }))} disabled={miRespSaving}>
                            <option value="en">English</option>
                            <option value="fr">French</option>
                          </select>
                        </div>
                        <div className="cf-form-field">
                          <label>Response Channel</label>
                          <select value={miRespForm.channel} onChange={e => setMiRespForm(p => ({ ...p, channel: e.target.value }))} disabled={miRespSaving}>
                            {['email', 'phone', 'letter', 'portal', 'fax', 'in-person'].map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                          </select>
                        </div>
                      </div>

                      <div className="cf-form-grid">
                        <div className="cf-form-field cf-form-field--full">
                          <label>French / Scenario Bundle</label>
                          <select value="" onChange={e => applyBundle(e.target.value)} disabled={miRespSaving || bundles.length === 0}>
                            <option value="">Select optional bundle...</option>
                            {bundles.map(bundle => <option key={bundle.id} value={bundle.id}>{bundle.name} ({bundle.language})</option>)}
                          </select>
                        </div>
                        <div className="cf-form-field cf-form-field--full">
                          <label>Email / Response Template</label>
                          <select value={miRespForm.template_id} onChange={e => setTemplate(e.target.value)} disabled={miRespSaving}>
                            <option value="">Select template...</option>
                            {templates.map(t => <option key={t.id} value={t.id}>{t.product_group_match ? '[Product Match] ' : ''}{t.name} - {t.type}</option>)}
                          </select>
                        </div>
                        <div className="cf-form-field cf-form-field--full">
                          <label>Subject</label>
                          <input value={miRespForm.response_subject} onChange={e => setMiRespForm(p => ({ ...p, response_subject: e.target.value, is_customized: true }))} placeholder="Medical Information Response - Case {{case_number}}" disabled={miRespSaving} />
                        </div>
                      </div>

                      {chosenTemplate && <div className="cf-builder-note">Template source: {chosenTemplate.name}. Editing below customizes this response only and does not update the original template.</div>}

                      <div className="cf-form-field cf-form-field--full">
                        <label>Online Edit / Letter Body</label>
                        <RichTextEditor value={miRespForm.body_html} onChange={v => { setMiRespForm(p => ({ ...p, body_html: v, is_customized: true })); setBuilderPreview(null) }} />
                      </div>
                      <div className="cf-form-field cf-form-field--full">
                        <label>Additional Custom Text</label>
                        <textarea rows={3} value={miRespForm.custom_text} onChange={e => { setMiRespForm(p => ({ ...p, custom_text: e.target.value, is_customized: true })); setBuilderPreview(null) }} placeholder="Optional response-specific text. This will be stored only on this response." disabled={miRespSaving} />
                      </div>
                    </div>

                    <div className="cf-builder-side">
                      <div className="cf-builder-card">
                        <div className="cf-builder-card-title">Document Selection / SRL</div>
                        <div className="cf-builder-list">
                          {documents.map(doc => (
                            <label key={doc.id} className="cf-builder-check">
                              <input type="checkbox" checked={miRespForm.selected_document_ids.map(Number).includes(Number(doc.id))} onChange={() => toggleSelection('selected_document_ids', doc.id)} />
                              <span>{doc.name}<small>{doc.doc_type || 'Document'} {doc.language ? `- ${doc.language}` : ''}</small></span>
                            </label>
                          ))}
                          {documents.length === 0 && <div className="cf-empty-msg">No published documents available.</div>}
                        </div>
                      </div>
                      <div className="cf-builder-card">
                        <div className="cf-builder-card-title">Reusable Modules</div>
                        <div className="cf-builder-list">
                          {modules.map(mod => (
                            <label key={mod.id} className="cf-builder-check">
                              <input type="checkbox" checked={miRespForm.selected_module_ids.map(Number).includes(Number(mod.id))} onChange={() => toggleSelection('selected_module_ids', mod.id)} />
                              <span>{mod.name}<small>{mod.module_type || 'Module'} {mod.language ? `- ${mod.language}` : ''}</small></span>
                            </label>
                          ))}
                          {modules.length === 0 && <div className="cf-empty-msg">No published modules available.</div>}
                        </div>
                      </div>
                      <div className="cf-builder-card">
                        <div className="cf-builder-card-title">Response Controls</div>
                        <label className="cf-builder-check">
                          <input type="checkbox" checked={miRespForm.follow_up_required} onChange={e => setMiRespForm(p => ({ ...p, follow_up_required: e.target.checked }))} />
                          <span>Follow-up required</span>
                        </label>
                        <div className="cf-form-field" style={{ marginTop: 10 }}>
                          <label>Response Date</label>
                          <input type="date" value={miRespForm.responded_at} onChange={e => setMiRespForm(p => ({ ...p, responded_at: e.target.value }))} disabled={miRespSaving} />
                        </div>
                        {miRespForm.is_customized && <div className="cf-builder-customized">Customized response flag will be saved.</div>}
                      </div>
                    </div>
                  </div>

                  <div className="cf-builder-preview-actions">
                    <button className="cf-open-btn" onClick={previewMiResponse} disabled={previewLoading || miRespSaving}>{previewLoading ? 'Rendering...' : 'Preview Response Package'}</button>
                  </div>
                  {builderPreview && (
                    <div className="cf-builder-preview">
                      <div className="cf-builder-preview-top">
                        <strong>Preview:</strong> {builderPreview.rendered_subject}
                        <span>To: {builderPreview.recipient?.email || '-'}</span>
                      </div>
                      <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(builderPreview.rendered_body_html || '') }} />
                      {builderPreview.selected_documents?.length > 0 && <div className="cf-builder-enclosures">Enclosures: {builderPreview.selected_documents.map(d => d.name).join(', ')}</div>}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="cf-form-actions" style={{ padding: '12px 14px', marginTop: 0 }}>
              <button className="cf-cancel-btn" onClick={() => !miRespSaving && setMiRespModal(false)}>Cancel</button>
              <button className="cf-save-btn" onClick={() => submitMiResponse('DRAFT')} disabled={miRespSaving || builderLoading}>{miRespSaving ? 'Saving...' : 'Save Draft Response'}</button>
            </div>
          </div>
        </div>
      )}

      {miEsignModal && (
        <div className="cf-corr-compose-overlay" onClick={() => !miEsignSaving && (setMiEsignModal(null), setMiEsignForm({ password: '', reason: '' }))}>
          <div className="cf-esign-modal" onClick={e => e.stopPropagation()}>
            <div className="cf-corr-compose-header">
              <div className="cf-corr-compose-title">Electronic Signature - {miEsignModal.targetStatus === 'APPROVED' ? 'Approve MI Response' : 'Send MI Response'}</div>
              <button className="cf-corr-modal-close" onClick={() => !miEsignSaving && (setMiEsignModal(null), setMiEsignForm({ password: '', reason: '' }))}>x</button>
            </div>
            <div className="cf-corr-compose-body">
              <div className="cf-esign-notice">
                <span>This action requires your electronic signature per 21 CFR Part 11. Your identity will be recorded against this approval/send action.</span>
              </div>
              <div className="cf-esign-fields">
                <div className="cf-form-field">
                  <label>Your Password <span style={{ color: '#dc2626' }}>*</span></label>
                  <input type="password" value={miEsignForm.password} onChange={e => setMiEsignForm(p => ({ ...p, password: e.target.value }))} placeholder="Enter your login password to confirm identity" disabled={miEsignSaving} autoComplete="current-password" />
                </div>
                <div className="cf-form-field">
                  <label>Reason / Justification <span style={{ color: '#dc2626' }}>*</span></label>
                  <textarea rows={3} value={miEsignForm.reason} onChange={e => setMiEsignForm(p => ({ ...p, reason: e.target.value }))}
                    placeholder={miEsignModal.targetStatus === 'APPROVED' ? 'Reviewed and approved per SOP MI-001' : 'Response transmitted to requestor via selected channel'}
                    disabled={miEsignSaving} />
                </div>
                <div className="cf-esign-target-info">
                  <span className="cf-esign-label">Target Status:</span>
                  <span className={`cf-mi-status-badge cf-mi-status--${(miEsignModal.targetStatus || '').toLowerCase()}`}>{miEsignModal.targetStatus}</span>
                </div>
              </div>
              {miEsignSaving && <div className="cf-esign-progress">Verifying identity and recording e-signature...</div>}
            </div>
            <div className="cf-form-actions" style={{ padding: '12px 16px', marginTop: 0 }}>
              <button className="cf-cancel-btn" onClick={() => !miEsignSaving && (setMiEsignModal(null), setMiEsignForm({ password: '', reason: '' }))} disabled={miEsignSaving}>Cancel</button>
              <button className={`cf-save-btn cf-esign-confirm-btn ${miEsignModal.targetStatus === 'APPROVED' ? 'cf-esign-approve' : 'cf-esign-send'}`} onClick={submitMiEsign} disabled={miEsignSaving}>
                {miEsignSaving ? 'Processing...' : (miEsignModal.targetStatus === 'APPROVED' ? 'Confirm Approval' : 'Confirm Send')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
