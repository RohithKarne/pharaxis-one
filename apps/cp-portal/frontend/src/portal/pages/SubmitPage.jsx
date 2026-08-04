import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'
import Icon from '../../shared/components/Icon'

const FORM_TYPES = [
  { key: 'medical_inquiry',     label: 'Medical Information Request', icon: '📋', desc: 'Request for medical/scientific information about our products or therapeutic areas.' },
  { key: 'adverse_event',       label: 'Report Adverse Event',        icon: '⚠️',  desc: 'Report a suspected adverse event or side effect related to our products.' },
  { key: 'product_complaint',   label: 'Report Product Complaint',    icon: '📦', desc: 'Report a quality complaint or issue with a product.' },
  { key: 'other_inquiry',       label: 'Other Request',               icon: '✉️',  desc: 'General inquiry or request not covered by the above categories.' },
]

export default function SubmitPage() {
  const { clientCode, portalHeaders, isFeatureEnabled, portalConfig } = usePortal()
  const slaText = portalConfig?.branding?.sla_response_text || 'Our medical affairs team will review your submission and respond within 5–7 business days.'
  const [selectedType, setSelectedType] = useState(null)
  const [formFields, setFormFields]     = useState([])
  const [formValues, setFormValues]     = useState({})
  const [submitting, setSubmitting]     = useState(false)
  const [submitted, setSubmitted]       = useState(null)
  const [error, setError]               = useState('')
  const [fieldErrors, setFieldErrors]   = useState({})
  const [fieldsLoading, setFieldsLoading] = useState(false)
  const [attachments, setAttachments]   = useState([])
  const [attachError, setAttachError]   = useState('')

  const ATTACH_MAX = 10 * 1024 * 1024
  const ATTACH_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  function handleFiles(e) {
    setAttachError('')
    const picked = Array.from(e.target.files || [])
    const next = [...attachments]
    for (const f of picked) {
      if (!ATTACH_TYPES.includes(f.type)) { setAttachError(`"${f.name}" is not an allowed type (PDF, JPG, PNG, DOC, DOCX).`); continue }
      if (f.size > ATTACH_MAX) { setAttachError(`"${f.name}" exceeds the 10MB limit.`); continue }
      if (next.length >= 5) { setAttachError('You can attach up to 5 files.'); break }
      if (!next.some(x => x.name === f.name && x.size === f.size)) next.push(f)
    }
    setAttachments(next)
    e.target.value = ''
  }
  function removeAttachment(i) { setAttachments(a => a.filter((_, idx) => idx !== i)) }

  useEffect(() => {
    if (!selectedType) return
    setFieldsLoading(true)
    fetch(`/api/portal/content/${clientCode}/forms/${selectedType}`)
      .then(r => r.json())
      .then(d => {
        setFormFields(d.fields || [])
        // Restore an auto-saved draft for this form type, if any.
        let draft = {}
        try { draft = JSON.parse(localStorage.getItem(`cp_draft_${clientCode}_${selectedType}`) || '{}') } catch { draft = {} }
        setFormValues(draft && typeof draft === 'object' ? draft : {})
        setFieldErrors({})
      })
      .catch(() => {})
      .finally(() => setFieldsLoading(false))
  }, [selectedType, clientCode])

  // Auto-save the in-progress form to localStorage so nothing is lost on refresh/navigation.
  useEffect(() => {
    if (!selectedType) return
    const key = `cp_draft_${clientCode}_${selectedType}`
    if (Object.keys(formValues).length > 0) localStorage.setItem(key, JSON.stringify(formValues))
  }, [formValues, selectedType, clientCode])

  function clearDraft() {
    if (selectedType) localStorage.removeItem(`cp_draft_${clientCode}_${selectedType}`)
  }

  // A field may declare show_when: { field, equals } and is only rendered when
  // the controlling field holds that value. Used by the AE screening detail box,
  // which appears only after the visitor answers "Yes".
  function isVisible(field, values = formValues) {
    const cond = field.show_when
    if (!cond || !cond.field) return true
    return String(values[cond.field] || '') === String(cond.equals)
  }

  function handleFieldChange(key, value) {
    setFormValues(v => {
      const next = { ...v, [key]: value }
      // Clear anything this change has just hidden. Otherwise a visitor who
      // answers Yes, types what happened, then switches to No would still submit
      // the narrative alongside a "No" — a contradiction in a safety record.
      formFields.forEach(f => {
        if (f.show_when?.field === key && !isVisible(f, next)) delete next[f.field_key]
      })
      return next
    })
    if (fieldErrors[key]) setFieldErrors(prev => ({ ...prev, [key]: undefined }))
  }

  function validate() {
    const errors = {}
    // Only validate what the visitor can actually see. A required-but-hidden
    // field would block submission with no visible cause and no way to fix it.
    formFields.filter(f => f.is_required && isVisible(f)).forEach(f => {
      if (!formValues[f.field_key] || String(formValues[f.field_key]).trim() === '') {
        errors[f.field_key] = `${f.field_label || f.label} is required.`
      }
    })
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true); setError('')
    const fd = new FormData()
    fd.append('form_data', JSON.stringify(formValues))
    attachments.forEach(f => fd.append('attachments', f))
    try {
      const res  = await fetch(`/api/portal/submit/${clientCode}/${selectedType}`, {
        method: 'POST',
        credentials: 'include', // multipart upload; auth rides the session cookie, browser sets Content-Type
        body: fd,
      })
      // A 413 / proxy error may return non-JSON (HTML) — parse defensively.
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Submission failed. Please try again.'); return }
      clearDraft()
      setSubmitted(data)
    } catch {
      setError('Submission failed. Please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const SUBMISSION_KEYS = ['medical_inquiry', 'adverse_event', 'product_complaint', 'other_inquiry']
  const anyEnabled = SUBMISSION_KEYS.some(k => isFeatureEnabled(k))
  if (!anyEnabled) {
    return <div className="pp-container pp-page-content"><div className="pp-info-box">Submission forms are not available for this portal.</div></div>
  }
  // Filter form types to only show enabled ones
  const availableTypes = FORM_TYPES.filter(t => isFeatureEnabled(t.key))

  if (submitted) {
    return (
      <div className="pp-container pp-page-content">
        <div className="pp-success-card">
          <div className="pp-success-icon">✓</div>
          <h2>Submission Received</h2>
          <p>Your reference number is <strong>{submitted.reference}</strong></p>
          <p className="pp-success-sub">{slaText}</p>
          <div className="pp-success-actions">
            <button className="pp-btn pp-btn-outline" onClick={() => { setSubmitted(null); setSelectedType(null) }}>Submit Another</button>
            <Link to={`/portal/${clientCode}`} className="pp-btn pp-btn-primary">Back to Home</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pp-container pp-page-content">
      <div className="pp-page-header">
        <h1>Submit a Request</h1>
        <p>Select the type of request you would like to submit.</p>
      </div>

      {!selectedType ? (
        <div className="pp-form-type-grid">
          {availableTypes.map(t => (
            <button key={t.key} className="pp-form-type-card" onClick={() => setSelectedType(t.key)}>
              <div className="pp-form-type-icon">{t.icon}</div>
              <div className="pp-form-type-label">{t.label}</div>
              <div className="pp-form-type-desc">{t.desc}</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="pp-form-wrapper">
          <div className="pp-form-header">
            <button className="pp-back-btn" onClick={() => setSelectedType(null)}>← Back</button>
            <h2>{FORM_TYPES.find(t => t.key === selectedType)?.label}</h2>
          </div>

          {error && <div className="pp-error-msg">{error}</div>}

          {Object.keys(formValues).length > 0 && (
            <div style={{ padding: '10px 14px', borderRadius: '6px', background: '#f0f9ff', border: '1px solid #bae6fd', color: '#0369a1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', fontSize: '0.85rem' }}>
              <span>💾 <strong>Draft Auto-Saved</strong> — Your in-progress form entries are saved locally.</span>
              <button type="button" onClick={() => { clearDraft(); setFormValues({}) }} style={{ background: 'none', border: 'none', color: '#0284c7', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.85rem' }}>Clear draft</button>
            </div>
          )}

          {fieldsLoading ? (
            <div className="pp-loading">Loading form…</div>
          ) : formFields.length === 0 ? (
            <div className="pp-info-box">No form fields have been configured for this submission type. Please contact your administrator.</div>
          ) : (
            <form onSubmit={handleSubmit} className="pp-submission-form">
              {formFields.filter(f => isVisible(f)).map(field => (
                <div key={field.field_key} className={`pp-field${fieldErrors[field.field_key] ? ' pp-field-error' : ''}`}>
                  <label>
                    {field.label}
                    {field.is_required ? <span className="pp-required" aria-hidden="true"> *</span> : null}
                  </label>
                  {/* Scoped to system-managed fields deliberately. help_text is
                      configurable on every field but has never been rendered
                      anywhere in the portal — fixing that generally is a separate
                      change, not one to bundle into a safety feature. For the AE
                      screening question the help text is the mitigation, so it
                      has to appear. */}
                  {field.system_managed && field.help_text
                    ? <span className="pp-field-help">{field.help_text}</span> : null}
                  {field.field_type === 'radio' ? (
                    /* Radio, not a dropdown: for a safety question the question and
                       both answers must be visible without interaction. A select
                       shows "-- Select --" and reads as furniture to scroll past. */
                    <div className="pp-radio-group" role="radiogroup" aria-label={field.label}>
                      {String(field.options || '').split('\n').map(o => o.trim()).filter(Boolean).map(o => (
                        <label key={o} className="pp-radio-label">
                          <input
                            type="radio"
                            name={field.field_key}
                            value={o}
                            checked={formValues[field.field_key] === o}
                            onChange={e => handleFieldChange(field.field_key, e.target.value)}
                          />
                          <span>{o}</span>
                        </label>
                      ))}
                    </div>
                  ) : field.field_type === 'textarea' ? (
                    <textarea
                      rows={4}
                      value={formValues[field.field_key] || ''}
                      onChange={e => handleFieldChange(field.field_key, e.target.value)}
                      placeholder={field.placeholder || ''}
                    />
                  ) : field.field_type === 'select' ? (
                    <select
                      value={formValues[field.field_key] || ''}
                      onChange={e => handleFieldChange(field.field_key, e.target.value)}>
                      <option value="">-- Select --</option>
                      {(() => {
                        // Options may be stored as a JSON array (e.g. ["HCP","Patient"])
                        // or as newline-separated text. Handle both, else the whole
                        // array renders as a single broken option.
                        const raw = String(field.options || '').trim()
                        let opts = []
                        if (raw.startsWith('[')) { try { opts = JSON.parse(raw) } catch { opts = [] } }
                        if (!opts.length) opts = raw.split('\n')
                        return opts.map(o => String(o).trim()).filter(Boolean)
                      })().map(o => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  ) : field.field_type === 'checkbox' ? (
                    <label className="pp-checkbox-label">
                      <input
                        type="checkbox"
                        checked={!!formValues[field.field_key]}
                        onChange={e => handleFieldChange(field.field_key, e.target.checked)}
                      />
                      <span>{field.placeholder || field.label}</span>
                    </label>
                  ) : (
                    <input
                      type={field.field_type === 'email' ? 'email' : field.field_type === 'phone' ? 'tel' : 'text'}
                      value={formValues[field.field_key] || ''}
                      onChange={e => handleFieldChange(field.field_key, e.target.value)}
                      placeholder={field.placeholder || ''}
                    />
                  )}
                  {fieldErrors[field.field_key] && (
                    <span className="pp-field-error-msg">{fieldErrors[field.field_key]}</span>
                  )}
                </div>
              ))}
              <div className="pp-attach">
                <label className="pp-attach-label">Attachments <span>(optional — PDF, JPG, PNG, DOC, DOCX · max 10MB each · up to 5 files)</span></label>
                <label className="pp-attach-drop">
                  <Icon name="file" size={17} /> Choose files
                  <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={handleFiles} style={{ display: 'none' }} />
                </label>
                {attachError && <span className="pp-field-error-msg">{attachError}</span>}
                {attachments.length > 0 && (
                  <ul className="pp-attach-list">
                    {attachments.map((f, i) => (
                      <li key={i}>
                        <Icon name="file" size={15} />
                        <span className="pp-attach-name">{f.name}</span>
                        <span className="pp-attach-size">{(f.size / 1024).toFixed(0)} KB</span>
                        <button type="button" onClick={() => removeAttachment(i)} aria-label={`Remove ${f.name}`}>✕</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="pp-form-disclaimer">
                <small>By submitting this form, you confirm that the information provided is accurate to the best of your knowledge. This portal is intended for medical information purposes only and does not provide medical advice.</small>
              </div>
              <div className="pp-form-actions">
                <button type="submit" className="pp-btn pp-btn-primary" disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit'}
                </button>
                <button type="button" className="pp-btn pp-btn-outline" onClick={() => setSelectedType(null)}>Cancel</button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
