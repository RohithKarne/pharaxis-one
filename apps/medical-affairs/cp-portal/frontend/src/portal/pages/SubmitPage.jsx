import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'

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

  useEffect(() => {
    if (!selectedType) return
    setFieldsLoading(true)
    fetch(`/api/portal/content/${clientCode}/forms/${selectedType}`)
      .then(r => r.json())
      .then(d => {
        setFormFields(d.fields || [])
        setFormValues({})
        setFieldErrors({})
      })
      .catch(() => {})
      .finally(() => setFieldsLoading(false))
  }, [selectedType, clientCode])

  function handleFieldChange(key, value) {
    setFormValues(v => ({ ...v, [key]: value }))
    if (fieldErrors[key]) setFieldErrors(prev => ({ ...prev, [key]: undefined }))
  }

  function validate() {
    const errors = {}
    formFields.filter(f => f.is_required).forEach(f => {
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
    const res  = await fetch(`/api/portal/submit/${clientCode}/${selectedType}`, {
      method: 'POST',
      headers: portalHeaders(),
      body: JSON.stringify({ form_data: formValues })
    })
    const data = await res.json()
    setSubmitting(false)
    if (!res.ok) { setError(data.error || 'Submission failed. Please try again.'); return }
    setSubmitted(data)
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

          {fieldsLoading ? (
            <div className="pp-loading">Loading form…</div>
          ) : formFields.length === 0 ? (
            <div className="pp-info-box">No form fields have been configured for this submission type. Please contact your administrator.</div>
          ) : (
            <form onSubmit={handleSubmit} className="pp-submission-form">
              {formFields.map(field => (
                <div key={field.field_key} className={`pp-field${fieldErrors[field.field_key] ? ' pp-field-error' : ''}`}>
                  <label>
                    {field.label}
                    {field.is_required ? <span className="pp-required" aria-hidden="true"> *</span> : null}
                  </label>
                  {field.field_type === 'textarea' ? (
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
                      {(field.options || '').split('\n').filter(Boolean).map(o => (
                        <option key={o.trim()} value={o.trim()}>{o.trim()}</option>
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
