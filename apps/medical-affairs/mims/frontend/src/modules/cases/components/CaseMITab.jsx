import { useState, useEffect } from 'react'
import CaseAssociatedDocs from './CaseAssociatedDocs'
import toast from '../../../shared/utils/toast'
import { confirm } from '../../../shared/utils/confirm'

const API = import.meta.env.VITE_API_URL || '/api'

export default function CaseMITab({ id, token, headers, setSavedMsg, onCountChange }) {
  const miDraftStorageKey = `mims_case_${id}_mi_response_draft`

  const [miTabs,       setMiTabs]       = useState([])
  const [activeMiTab,  setActiveMiTab]  = useState(0)
  const [miForm,       setMiForm]       = useState({})
  const [miProducts,   setMiProducts]   = useState([])

  const [miResponses,    setMiResponses]    = useState([])
  const [miRespLoading,  setMiRespLoading]  = useState(false)
  const [miRespModal,    setMiRespModal]    = useState(false)
  const [miRespForm,     setMiRespForm]     = useState({ response_text: '', channel: 'email', responded_at: '', follow_up_required: false })
  const [miRespSaving,   setMiRespSaving]   = useState(false)
  const [miEsignModal,   setMiEsignModal]   = useState(null)
  const [miEsignForm,    setMiEsignForm]    = useState({ password: '', reason: '' })
  const [miEsignSaving,  setMiEsignSaving]  = useState(false)

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
        fetch(`${API}/cases/${id}/mi`, { headers }),
        fetch(`${API}/cases/mi/products`, { headers }),
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
      const res  = await fetch(`${API}/cases/${id}/mi-responses`, { headers })
      const data = await res.json()
      setMiResponses(Array.isArray(data) ? data : [])
    } catch { setMiResponses([]) }
    finally { setMiRespLoading(false) }
  }

  async function addMITab() {
    try {
      const res  = await fetch(`${API}/cases/${id}/mi`, { method: 'POST', headers, body: JSON.stringify({ status: 'Open' }) })
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
      const res  = await fetch(`${API}/cases/mi/${tab.id}`, { method: 'PUT', headers, body: JSON.stringify(miForm) })
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
      await fetch(`${API}/cases/mi/${tab.id}`, { method: 'DELETE', headers })
      const updated = miTabs.filter((_, i) => i !== activeMiTab)
      setMiTabs(updated)
      onCountChange?.(updated.length)
      const newIdx = Math.max(0, activeMiTab - 1)
      setActiveMiTab(newIdx)
      setMiForm(updated[newIdx] ? toMiForm(updated[newIdx]) : {})
    } catch { toast.error('Failed to delete MI tab') }
  }

  async function submitMiResponse(responseStatus = 'SENT') {
    if (miRespSaving) return
    if (!miRespForm.response_text.trim()) { toast.warn('Response text is required.'); return }
    setMiRespSaving(true)
    try {
      const payload = {
        ...miRespForm,
        responded_at:    miRespForm.responded_at || new Date().toISOString().slice(0, 10),
        response_status: responseStatus,
      }
      const res  = await fetch(`${API}/cases/${id}/mi-responses`, { method: 'POST', headers, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMiResponses(prev => [data, ...prev])
      setMiRespModal(false)
      setMiRespForm({ response_text: '', channel: 'email', responded_at: '', follow_up_required: false })
      localStorage.removeItem(miDraftStorageKey)
      setSavedMsg(responseStatus === 'DRAFT' ? 'MI draft saved' : 'MI response recorded')
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
      const res  = await fetch(`${API}/cases/${id}/mi-responses/${responseId}/status`, {
        method: 'PATCH', headers, body: JSON.stringify({ response_status: targetStatus, reason: `Moved to ${targetStatus}` }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMiResponses(prev => prev.map(r => r.id === responseId ? { ...r, response_status: data.response_status } : r))
      setSavedMsg(`MI Response → ${targetStatus}`); setTimeout(() => setSavedMsg(''), 2000)
    } catch (err) { toast.error(err.message) }
  }

  async function submitMiEsign() {
    if (miEsignSaving || !miEsignModal) return
    if (!miEsignForm.password.trim()) { toast.warn('Password is required for electronic signature.'); return }
    if (!miEsignForm.reason.trim())   { toast.warn('Reason is required for electronic signature.');   return }
    setMiEsignSaving(true)
    try {
      const res  = await fetch(`${API}/cases/${id}/mi-responses/${miEsignModal.responseId}/status`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ response_status: miEsignModal.targetStatus, password: miEsignForm.password, reason: miEsignForm.reason }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMiResponses(prev => prev.map(r => r.id === miEsignModal.responseId
        ? { ...r, response_status: data.response_status, approved_by: data.approved_by, approved_at: data.approved_at }
        : r))
      setMiEsignModal(null)
      setMiEsignForm({ password: '', reason: '' })
      setSavedMsg(`MI Response e-signed → ${miEsignModal.targetStatus}`)
      setTimeout(() => setSavedMsg(''), 2500)
    } catch (err) { toast.error(err.message) }
    finally { setMiEsignSaving(false) }
  }

  async function discardMiResponse(responseId) {
    if (!await confirm('Discard this draft response? This cannot be undone.')) return
    try {
      const res  = await fetch(`${API}/cases/${id}/mi-responses/${responseId}/discard`, {
        method: 'PATCH', headers, body: JSON.stringify({ reason: 'Discarded by user' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMiResponses(prev => prev.map(r => r.id === responseId ? { ...r, response_status: 'VOIDED' } : r))
      setSavedMsg('Draft discarded'); setTimeout(() => setSavedMsg(''), 2000)
    } catch (err) { toast.error(err.message) }
  }

  return (
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
                  <option value="">— None —</option>
                  {miProducts.map(p => <option key={p.id} value={p.id}>{p.trade_name}</option>)}
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

      {/* MI Response History */}
      <div className="cf-response-history">
        <div className="cf-response-history-title">📋 Response History</div>
        {miRespLoading && <div className="cf-empty-msg">Loading responses…</div>}
        {!miRespLoading && miResponses.length === 0 && (
          <div className="cf-empty-msg">No MI responses recorded yet. Click "Record MI Response" to log one.</div>
        )}
        {!miRespLoading && miResponses.map(r => {
          const st       = r.response_status || 'DRAFT'
          const isVoided = st === 'VOIDED'
          const isSent   = st === 'SENT'
          return (
            <div key={r.id} className={`cf-response-card${isVoided ? ' cf-response-voided' : ''}`}>
              <div className="cf-response-top">
                <span className={`cf-mi-status-badge cf-mi-status--${st.toLowerCase()}`}>{st}</span>
                <span className="cf-response-channel">{r.channel}</span>
                <span className="cf-response-date">{r.responded_at ? String(r.responded_at).slice(0, 10) : '-'}</span>
                {r.follow_up_required ? <span className="cf-followup-badge">⚠ Follow-up</span> : null}
                <span className="cf-response-meta">by {r.responded_by_name || 'User'}</span>
                {r.approved_by_name && <span className="cf-response-meta">• signed by {r.approved_by_name}</span>}
              </div>
              {r.response_text && <div className="cf-response-text">{r.response_text}</div>}
              {!isVoided && !isSent && (
                <div className="cf-mi-transition-row">
                  {st === 'DRAFT' && <>
                    <button className="cf-mi-trans-btn cf-mi-trans-submit" onClick={() => advanceMiStatus(r.id, 'READY')}>Submit for Review →</button>
                    <button className="cf-mi-trans-btn cf-mi-trans-discard" onClick={() => discardMiResponse(r.id)}>Discard Draft</button>
                  </>}
                  {st === 'READY'    && <button className="cf-mi-trans-btn cf-mi-trans-approve" onClick={() => advanceMiStatus(r.id, 'APPROVED')}>🔏 Approve (e-sign required)</button>}
                  {st === 'APPROVED' && <button className="cf-mi-trans-btn cf-mi-trans-send"    onClick={() => advanceMiStatus(r.id, 'SENT')}>📤 Mark Sent (e-sign required)</button>}
                </div>
              )}
              {isSent   && <div className="cf-mi-final-badge">✅ Sent — Record Immutable</div>}
              {isVoided && <div className="cf-mi-voided-label">🚫 Discarded</div>}
            </div>
          )
        })}
      </div>

      {/* MI Response Modal */}
      {miRespModal && (
        <div className="cf-corr-compose-overlay" onClick={() => !miRespSaving && setMiRespModal(false)}>
          <div className="cf-corr-compose-modal" onClick={e => e.stopPropagation()}>
            <div className="cf-corr-compose-header">
              <div className="cf-corr-compose-title">📨 Record MI Response</div>
              <button className="cf-corr-modal-close" onClick={() => !miRespSaving && setMiRespModal(false)}>✕</button>
            </div>
            <div className="cf-corr-compose-body">
              <div style={{ padding: '8px 12px', marginBottom: 14, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 12, color: '#1e40af' }}>
                ℹ️ Responses are saved as <strong>DRAFT</strong>. Use the workflow buttons in the history panel to submit for review, approve, and mark as sent (e-sign required per 21 CFR Part 11).
              </div>
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
                  <input type="date" value={miRespForm.responded_at} onChange={e => setMiRespForm(p => ({ ...p, responded_at: e.target.value }))} disabled={miRespSaving} />
                </div>
                <div className="cf-form-field cf-form-field--full">
                  <label>
                    <input type="checkbox" checked={miRespForm.follow_up_required} onChange={e => setMiRespForm(p => ({ ...p, follow_up_required: e.target.checked }))} disabled={miRespSaving} style={{ marginRight: 6 }} />
                    Follow-up Required
                  </label>
                </div>
              </div>
              <div className="cf-form-field">
                <label>Response Text <span style={{ color: '#dc2626' }}>*</span></label>
                <textarea rows={8} value={miRespForm.response_text} onChange={e => setMiRespForm(p => ({ ...p, response_text: e.target.value }))} placeholder="Enter the MI response provided to the requestor…" disabled={miRespSaving} />
              </div>
            </div>
            <div className="cf-form-actions" style={{ padding: '12px 14px', marginTop: 0 }}>
              <button className="cf-cancel-btn" onClick={() => !miRespSaving && setMiRespModal(false)}>Cancel</button>
              <button className="cf-save-btn" onClick={() => submitMiResponse('DRAFT')} disabled={miRespSaving}>
                {miRespSaving ? 'Saving…' : '💾 Save as Draft'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* E-Sign Modal (21 CFR Part 11) */}
      {miEsignModal && (
        <div className="cf-corr-compose-overlay" onClick={() => !miEsignSaving && (setMiEsignModal(null), setMiEsignForm({ password: '', reason: '' }))}>
          <div className="cf-esign-modal" onClick={e => e.stopPropagation()}>
            <div className="cf-corr-compose-header">
              <div className="cf-corr-compose-title">
                🔏 Electronic Signature — {miEsignModal.targetStatus === 'APPROVED' ? 'Approve MI Response' : 'Mark Response as Sent'}
              </div>
              <button className="cf-corr-modal-close" onClick={() => !miEsignSaving && (setMiEsignModal(null), setMiEsignForm({ password: '', reason: '' }))}>✕</button>
            </div>
            <div className="cf-corr-compose-body">
              <div className="cf-esign-notice">
                <span className="cf-esign-icon">⚠️</span>
                <span>This action requires your electronic signature per 21 CFR Part 11. Your identity will be recorded against this approval.</span>
              </div>
              <div className="cf-esign-fields">
                <div className="cf-form-field">
                  <label>Your Password <span style={{ color: '#dc2626' }}>*</span></label>
                  <input type="password" value={miEsignForm.password} onChange={e => setMiEsignForm(p => ({ ...p, password: e.target.value }))} placeholder="Enter your login password to confirm identity" disabled={miEsignSaving} autoComplete="current-password" />
                </div>
                <div className="cf-form-field">
                  <label>Reason / Justification <span style={{ color: '#dc2626' }}>*</span></label>
                  <textarea rows={3} value={miEsignForm.reason} onChange={e => setMiEsignForm(p => ({ ...p, reason: e.target.value }))}
                    placeholder={miEsignModal.targetStatus === 'APPROVED' ? 'e.g. Reviewed and approved per SOP MI-001' : 'e.g. Response transmitted to HCP via email per confirmed receipt'}
                    disabled={miEsignSaving} />
                </div>
                <div className="cf-esign-target-info">
                  <span className="cf-esign-label">Target Status:</span>
                  <span className={`cf-mi-status-badge cf-mi-status--${(miEsignModal.targetStatus || '').toLowerCase()}`}>{miEsignModal.targetStatus}</span>
                </div>
              </div>
              {miEsignSaving && <div className="cf-esign-progress">🔐 Verifying identity and recording e-signature…</div>}
            </div>
            <div className="cf-form-actions" style={{ padding: '12px 16px', marginTop: 0 }}>
              <button className="cf-cancel-btn" onClick={() => !miEsignSaving && (setMiEsignModal(null), setMiEsignForm({ password: '', reason: '' }))} disabled={miEsignSaving}>Cancel</button>
              <button
                className={`cf-save-btn cf-esign-confirm-btn ${miEsignModal.targetStatus === 'APPROVED' ? 'cf-esign-approve' : 'cf-esign-send'}`}
                onClick={submitMiEsign} disabled={miEsignSaving}
              >
                {miEsignSaving ? 'Processing…' : (miEsignModal.targetStatus === 'APPROVED' ? '🔏 Confirm Approval' : '📤 Confirm Sent')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
