import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'
import Icon from '../../shared/components/Icon'

const FORM_TYPES = [
  { key: 'medical_inquiry',     label: 'Medical Information Request', desc: 'Request for medical/scientific information about our products or therapeutic areas.' },
  { key: 'adverse_event',       label: 'Report Adverse Event',        desc: 'Report a suspected adverse event or side effect related to our products.' },
  { key: 'product_complaint',   label: 'Report Product Complaint',    desc: 'Report a quality complaint or issue with a product.' },
  { key: 'other_inquiry',       label: 'Other Request',               desc: 'General inquiry or request not covered by the above categories.' },
]

// The choices a select, radio or multiselect field offers: a JSON array, newline
// text, or a JSON array encoded twice by the old form builder (CPPM-95).
export function optionList(raw) {
  if (Array.isArray(raw)) return raw.map(o => String(o).trim()).filter(Boolean)
  let s = String(raw ?? '').trim()
  for (let i = 0; i < 2 && (s.startsWith('[') || s.startsWith('"')); i++) {
    try {
      const v = JSON.parse(s)
      if (Array.isArray(v)) return v.map(o => String(o).trim()).filter(Boolean)
      s = String(v).trim()
    } catch { break }
  }
  return s.split('\n').map(o => o.trim()).filter(Boolean)
}

export default function SubmitPage() {
  const { clientCode, portalHeaders, isFeatureEnabled, portalConfig, user, t } = usePortal()
  const slaText = portalConfig?.branding?.sla_response_text || 'Our medical affairs team will review your submission and respond within 5–7 business days.'
  const [params, setParams] = useSearchParams()
  // ?type=adverse_event (e.g. from the Contact page) opens that form directly.
  const requestedType = ['medical_inquiry', 'adverse_event', 'product_complaint', 'other_inquiry'].includes(params.get('type')) ? params.get('type') : null
  const [selectedType, setSelectedTypeState] = useState(requestedType)
  // CPPM-151 walk: the chosen form lives in the address (?type=…), so a refresh
  // reopens it with its draft instead of showing the four tiles again.
  function setSelectedType(key) {
    setSelectedTypeState(key)
    setParams(key ? { type: key } : {}, { replace: true })
  }
  const [formFields, setFormFields]     = useState([])
  const [formValues, setFormValues]     = useState({})
  const [submitting, setSubmitting]     = useState(false)
  const [submitted, setSubmitted]       = useState(null)
  const [submittedType, setSubmittedType] = useState(null)
  const [error, setError]               = useState('')
  const [fieldErrors, setFieldErrors]   = useState({})
  const [fieldsLoading, setFieldsLoading] = useState(false)
  const [attachments, setAttachments]   = useState([])
  const [attachError, setAttachError]   = useState('')
  // CPPM-88: true once the person has typed or restored something of their own, so
  // the "draft saved" note never appears for details we filled in for them.
  const [dirty, setDirty]               = useState(false)
  // CPPM-112: side effect reports and complaints show every answer once before Send.
  const [reviewing, setReviewing]       = useState(false)

  const ATTACH_MAX = 10 * 1024 * 1024
  // CPPM-12: legacy .doc is no longer accepted — macros cannot be separated out of it.
  const ATTACH_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  function handleFiles(e) {
    setAttachError('')
    const picked = Array.from(e.target.files || [])
    const next = [...attachments]
    for (const f of picked) {
      if (!ATTACH_TYPES.includes(f.type)) { setAttachError(`"${f.name}" is not an allowed type (PDF, JPG, PNG, DOCX).`); continue }
      if (f.size > ATTACH_MAX) { setAttachError(`"${f.name}" exceeds the 10MB limit.`); continue }
      if (next.length >= 5) { setAttachError('You can attach up to 5 files.'); break }
      if (!next.some(x => x.name === f.name && x.size === f.size)) next.push(f)
    }
    setAttachments(next)
    e.target.value = ''
  }
  function removeAttachment(i) { setAttachments(a => a.filter((_, idx) => idx !== i)) }

  useEffect(() => {
    setReviewing(false)
    if (!selectedType) return
    setFieldsLoading(true)
    fetch(`/api/portal/content/${clientCode}/forms/${selectedType}`)
      .then(r => r.json())
      .then(d => {
        setFormFields(d.fields || [])
        // Restore an auto-saved draft for this form type, if any. CPPM-84: kept in
        // sessionStorage, so it lasts only while this tab is open, and Sign Out wipes it.
        let draft = {}
        try { draft = JSON.parse(sessionStorage.getItem(`cp_draft_${clientCode}_${selectedType}`) || '{}') } catch { draft = {} }
        draft = draft && typeof draft === 'object' ? draft : {}
        setDirty(Object.keys(draft).length > 0)
        // CPPM-88: a signed-in person is not asked to type their own name and email.
        // Only empty answers are filled, and they can still change them.
        const keys = new Set((d.fields || []).map(f => f.field_key))
        const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ')
        const mine = {
          first_name: user?.first_name, last_name: user?.last_name, email: user?.email,
          reporter_name: fullName, reporter_email: user?.email, name: fullName, full_name: fullName,
          reporter_contact: user?.email,
        }
        const filled = { ...draft }
        for (const [k, v] of Object.entries(mine)) if (keys.has(k) && v && !filled[k]) filled[k] = v
        // CPPM-110: "Ask about this" brings the product and the item it was pressed on.
        if (selectedType === requestedType) {
          const product = (params.get('product') || '').slice(0, 200)
          const about = (params.get('about') || '').slice(0, 200)
          if (product) for (const k of ['product', 'product_name', 'suspect_product']) if (keys.has(k) && !filled[k]) filled[k] = product
          const textBox = (d.fields || []).find(f => f.field_type === 'textarea' && !f.system_managed)
          if (about && textBox && !filled[textBox.field_key]) filled[textBox.field_key] = `About "${about}": `
        }
        setFormValues(filled)
        setFieldErrors({})
      })
      .catch(() => {})
      .finally(() => setFieldsLoading(false))
  }, [selectedType, clientCode, user?.id])

  // Auto-save the in-progress form for this tab so nothing is lost on refresh/navigation.
  useEffect(() => {
    if (!selectedType || !dirty) return
    const key = `cp_draft_${clientCode}_${selectedType}`
    if (Object.keys(formValues).length > 0) sessionStorage.setItem(key, JSON.stringify(formValues))
  }, [formValues, selectedType, clientCode, dirty])

  function clearDraft() {
    if (selectedType) sessionStorage.removeItem(`cp_draft_${clientCode}_${selectedType}`)
  }

  // A field may declare show_when: { field, equals } and is only rendered when
  // the controlling field holds that value. Used by the AE screening detail box,
  // which appears only after the visitor answers "Yes".
  function isVisible(field, values = formValues) {
    if (field.field_type === 'hidden') return false // CPPM-85: never shown to the person
    const cond = field.show_when
    if (!cond || !cond.field) return true
    return String(values[cond.field] || '') === String(cond.equals)
  }

  function handleFieldChange(key, value) {
    setDirty(true)
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
      const v = formValues[f.field_key]
      if (!v || (Array.isArray(v) ? v.length === 0 : String(v).trim() === '')) {
        errors[f.field_key] = `${f.field_label || f.label} is required.`
      }
    })
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const CHECK_FIRST = ['adverse_event', 'product_complaint']

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return
    if (CHECK_FIRST.includes(selectedType) && !reviewing) {
      setReviewing(true); setError('')
      window.scrollTo?.({ top: 0 })
      return
    }
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
      if (!res.ok) {
        setReviewing(false) // back to the form, where the refused answers are marked
        setError(data.error || 'Submission failed. Please try again.')
        // CPPM-85: the server names each answer it refused, and why.
        if (data.field_errors) setFieldErrors(data.field_errors)
        // CPPM-7: the server names the required fields it found empty.
        else if (Array.isArray(data.fields)) {
          setFieldErrors(Object.fromEntries(data.fields.map(k => {
            const f = formFields.find(x => x.field_key === k)
            return [k, `${f?.field_label || f?.label || k} is required.`]
          })))
        }
        return
      }
      clearDraft()
      setSubmittedType(selectedType)
      setSubmitted(data)
    } catch {
      setError('Submission failed. Please check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const SUBMISSION_KEYS = ['medical_inquiry', 'adverse_event', 'product_complaint', 'other_inquiry']
  if (SUBMISSION_KEYS.some(k => isFeatureEnabled(k) === null)) return <div className="pp-loading">{t('Loading…')}</div>
  const anyEnabled = SUBMISSION_KEYS.some(k => isFeatureEnabled(k))
  if (!anyEnabled) {
    return <div className="pp-container pp-page-content"><div className="pp-info-box">{t('Submission forms are not available for this portal.')}</div></div>
  }
  // Filter form types to only show enabled ones
  const availableTypes = FORM_TYPES.filter(t => isFeatureEnabled(t.key))
  if (selectedType && !isFeatureEnabled(selectedType)) {
    return <div className="pp-container pp-page-content"><div className="pp-info-box">{t('This form is not available on this portal.')} <Link to={`/portal/${clientCode}/submit`}>{t('See the forms that are')}</Link>.</div></div>
  }

  if (submitted) {
    return (
      <div className="pp-container pp-page-content">
        <div className="pp-success-card">
          <h2>{t('Submission Received')}</h2>
          <p>{t('Your reference number is')} <strong>{submitted.reference}</strong></p>
          {submitted.attachments_blocked?.length > 0 && (
            /* CPPM-39: the report went through; the infected file did not. */
            <p className="pp-success-sub" role="alert" style={{ color: '#B91C1C' }}>
              We did not keep {submitted.attachments_blocked.map(f => `"${f}"`).join(', ')} because it contains a known virus.
              Your report itself was received.
            </p>
          )}
          {/* CPPM-94: a side effect report is not a question with a reply time. */}
          <p className="pp-success-sub">
            {submittedType === 'adverse_event'
              ? 'Our drug safety team will review your report and may contact you for more details.'
              : slaText}
          </p>
          <div className="pp-success-actions">
            <button className="pp-btn pp-btn-outline" onClick={() => { setSubmitted(null); setSelectedType(null) }}>{t('Submit Another')}</button>
            <Link to={`/portal/${clientCode}`} className="pp-btn pp-btn-primary">{t('Back to Home')}</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pp-container pp-page-content">
      <div className="pp-page-header">
        <h1>{t('Submit a Request')}</h1>
        <p>{t('Select the type of request you would like to submit.')}</p>
      </div>

      {!selectedType ? (
        <div className="pp-form-type-grid">
          {availableTypes.map(t => (
            <button key={t.key} className="pp-form-type-card" onClick={() => setSelectedType(t.key)}>
              <div className="pp-form-type-label">{t.label}</div>
              <div className="pp-form-type-desc">{t.desc}</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="pp-form-wrapper">
          <div className="pp-form-header">
            <button className="pp-back-btn" onClick={() => setSelectedType(null)}>{t('Back')}</button>
            <h2>{FORM_TYPES.find(t => t.key === selectedType)?.label}</h2>
          </div>

          {error && <div className="pp-error-msg">{error}</div>}

          {dirty && Object.keys(formValues).length > 0 && (
            <div style={{ padding: '10px 14px', borderRadius: '6px', background: '#f0f9ff', border: '1px solid #bae6fd', color: '#0369a1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', fontSize: '0.85rem' }}>
              <span><strong>{t('Draft Auto-Saved')}</strong> {t('— Your entries are kept while this tab is open. Signing out clears them.')}</span>
              <button type="button" onClick={() => { clearDraft(); setFormValues({}); setDirty(false) }} style={{ background: 'none', border: 'none', color: '#0284c7', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.85rem' }}>{t('Clear draft')}</button>
            </div>
          )}

          {fieldsLoading ? (
            <div className="pp-loading">{t('Loading form…')}</div>
          ) : formFields.length === 0 ? (
            <div className="pp-info-box">{t('No form fields have been configured for this submission type. Please contact your administrator.')}</div>
          ) : (
            <form onSubmit={handleSubmit} className="pp-submission-form">
              {reviewing ? (
                <CheckAnswers fields={formFields.filter(f => isVisible(f))} values={formValues} attachments={attachments} />
              ) : <>
              {formFields.filter(f => isVisible(f)).map(field => (
                <div key={field.field_key} className={`pp-field${fieldErrors[field.field_key] ? ' pp-field-error' : ''}`}>
                  {/* CPPM-105: the label is tied to its box (a radio group, tick-box group
                      or single tick box carries the name itself), and the help text is
                      read out with the field. */}
                  <label htmlFor={['radio', 'multiselect', 'checkbox'].includes(field.field_type) ? undefined : `f-${field.field_key}`}>
                    {field.label}
                    {field.is_required ? <span className="pp-required" aria-hidden="true"> *</span> : null}
                  </label>
                  {/* CPPM-87: help text the client writes appears under every field,
                      not only under the built-in screening question. */}
                  {field.help_text
                    ? <span id={`f-${field.field_key}-help`} className="pp-field-help">{field.help_text}</span> : null}
                  {field.field_type === 'radio' ? (
                    /* Radio, not a dropdown: for a safety question the question and
                       both answers must be visible without interaction. A select
                       shows "-- Select --" and reads as furniture to scroll past. */
                    <div className="pp-radio-group" role="radiogroup" aria-label={field.label} aria-describedby={field.help_text ? `f-${field.field_key}-help` : undefined}>
                      {optionList(field.options).map(o => (
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
                      id={`f-${field.field_key}`}
                      aria-describedby={field.help_text ? `f-${field.field_key}-help` : undefined}
                      rows={4}
                      value={formValues[field.field_key] || ''}
                      onChange={e => handleFieldChange(field.field_key, e.target.value)}
                      placeholder={field.placeholder || ''}
                    />
                  ) : field.field_type === 'select' ? (
                    <select
                      id={`f-${field.field_key}`}
                      aria-describedby={field.help_text ? `f-${field.field_key}-help` : undefined}
                      value={formValues[field.field_key] || ''}
                      onChange={e => handleFieldChange(field.field_key, e.target.value)}>
                      <option value="">{t('-- Select --')}</option>
                      {optionList(field.options).map(o => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  ) : field.field_type === 'multiselect' ? (
                    /* CPPM-85: tick boxes, one per choice — not a text box. */
                    <div className="pp-radio-group" role="group" aria-label={field.label}>
                      {optionList(field.options).map(o => {
                        const picked = Array.isArray(formValues[field.field_key]) ? formValues[field.field_key] : []
                        return (
                          <label key={o} className="pp-radio-label">
                            <input
                              type="checkbox"
                              checked={picked.includes(o)}
                              onChange={e => handleFieldChange(field.field_key, e.target.checked ? [...picked, o] : picked.filter(x => x !== o))}
                            />
                            <span>{o}</span>
                          </label>
                        )
                      })}
                    </div>
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
                      id={`f-${field.field_key}`}
                      aria-describedby={field.help_text ? `f-${field.field_key}-help` : undefined}
                      type={{ email: 'email', phone: 'tel', date: 'date', number: 'number' }[field.field_type] || 'text'}
                      inputMode={field.field_type === 'number' ? 'decimal' : undefined}
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
                <label className="pp-attach-label">{t('Attachments')} <span>{t('(optional — PDF, JPG, PNG, DOCX · max 10MB each · up to 5 files · no macros)')}</span></label>
                <label className="pp-attach-drop">
                  <Icon name="file" size={17} /> {t('Choose files')}
                  <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.docx" onChange={handleFiles} style={{ display: 'none' }} />
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
              </>}
              <div className="pp-form-disclaimer">
                <small>{t('By submitting this form, you confirm that the information provided is accurate to the best of your knowledge. This portal is intended for medical information purposes only and does not provide medical advice.')}</small>
              </div>
              <div className="pp-form-actions">
                <button type="submit" className="pp-btn pp-btn-primary" disabled={submitting}>
                  {submitting ? t('Submitting…') : reviewing ? t('Send') : CHECK_FIRST.includes(selectedType) ? t('Check your answers') : t('Submit')}
                </button>
                {reviewing
                  ? <button type="button" className="pp-btn pp-btn-outline" disabled={submitting} onClick={() => setReviewing(false)}>{t('Edit answers')}</button>
                  : <button type="button" className="pp-btn pp-btn-outline" onClick={() => setSelectedType(null)}>{t('Cancel')}</button>}
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

// CPPM-112: every answer the person can see, on one screen, before Send.
function CheckAnswers({ fields, values, attachments }) {
  const { t } = usePortal()
  const shown = v => Array.isArray(v) ? (v.length ? v.join(', ') : '—')
    : v === true ? t('Yes') : v === false || v == null || String(v).trim() === '' ? '—' : String(v)
  return (
    <section aria-labelledby="pp-check-title">
      <h3 id="pp-check-title" style={{ margin: '0 0 4px' }}>{t('Check your answers')}</h3>
      <p style={{ margin: '0 0 16px', color: 'var(--pp-text-muted, #6B7280)' }}>{t('Nothing has been sent yet. Press Send when everything is right, or Edit answers to change something.')}</p>
      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'minmax(140px, 34%) 1fr', gap: '10px 16px' }}>
        {fields.map(f => (
          <div key={f.field_key} style={{ display: 'contents' }}>
            <dt style={{ fontWeight: 600 }}>{f.label}</dt>
            <dd style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{f.field_type === 'checkbox' ? (values[f.field_key] ? t('Yes') : t('No')) : shown(values[f.field_key])}</dd>
          </div>
        ))}
        <dt style={{ fontWeight: 600 }}>{t('Attachments')}</dt>
        <dd style={{ margin: 0 }}>{attachments.length ? attachments.map(a => a.name).join(', ') : 'None'}</dd>
      </dl>
    </section>
  )
}
