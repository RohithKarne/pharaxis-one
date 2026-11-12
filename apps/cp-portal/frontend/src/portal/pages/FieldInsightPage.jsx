import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'

const PRODUCTS = [
  'Rosucal 10',
  'Glucalder M 2',
  'Telcal 40',
  'Azicald 500',
  'Montecal LC',
  'Pantocal 40',
  'Telcal AM',
  'Sitacal M 50/500',
  'Other / Pipeline Compound',
]

const INSIGHT_TYPES = [
  { value: 'off_label_inquiry', label: 'Off-Label Clinical Question' },
  { value: 'real_world_evidence', label: 'Real-World Evidence / Efficacy Feedback' },
  { value: 'safety_perception', label: 'Safety / Tolerability Perception' },
  { value: 'competitor_observation', label: 'Competitor Clinical Data Observation' },
  { value: 'trial_interest', label: 'Investigator-Initiated Trial (IIT) Interest' },
]

const VENUES = [
  'Medical Congress / Symposia',
  'Advisory Board',
  'Hospital / Clinic Field Visit',
  'Virtual Scientific Exchange',
  'Other Professional Meeting',
]

export default function FieldInsightPage() {
  const { clientCode } = usePortal()
  const [formData, setFormData] = useState({
    reporter_name: '',
    reporter_email: '',
    hcp_specialty: '',
    institution: '',
    product_name: 'Rosucal 10',
    insight_type: 'off_label_inquiry',
    interaction_venue: 'Medical Congress / Symposia',
    content: '',
    urgency: 'normal',
    follow_up_requested: false,
  })

  const [savedLocally, setSavedLocally] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // Load offline draft on mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem('cp_field_insight_draft')
      if (cached) {
        setFormData(JSON.parse(cached))
        setSavedLocally(true)
      }
    } catch (_) {}
  }, [])

  function handleChange(field, value) {
    setFormData(prev => {
      const next = { ...prev, [field]: value }
      try {
        localStorage.setItem('cp_field_insight_draft', JSON.stringify(next))
        setSavedLocally(true)
      } catch (_) {}
      return next
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!formData.reporter_name || !formData.content) return

    setSubmitting(true)
    setErrorMsg('')
    setSuccessMsg('')

    try {
      const res = await fetch('/api/portal/field-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, client_code: clientCode }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to submit field insight.')

      setSuccessMsg(data.message || 'Insight submitted successfully!')
      localStorage.removeItem('cp_field_insight_draft')
      setSavedLocally(false)
      setFormData({
        reporter_name: '',
        reporter_email: '',
        hcp_specialty: '',
        institution: '',
        product_name: 'Rosucal 10',
        insight_type: 'off_label_inquiry',
        interaction_venue: 'Medical Congress / Symposia',
        content: '',
        urgency: 'normal',
        follow_up_requested: false,
      })
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="pp-container pp-page-content" style={{ maxWidth: 720, margin: '30px auto', padding: '0 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', margin: 0 }}>
            Field Medical Insight Capture
          </h1>
          <p style={{ fontSize: 13, color: '#64748B', marginTop: 4, marginBottom: 0 }}>
            Capture unsolicited HCP inquiries and clinical feedback from congresses and field visits.
          </p>
        </div>
        {savedLocally && (
          <span style={{ fontSize: 11, background: '#F1F5F9', color: '#475569', padding: '4px 8px', borderRadius: 4 }}>
            💾 Draft saved offline
          </span>
        )}
      </div>

      {successMsg ? (
        <div style={{ background: '#ECFDF5', border: '1px solid #10B981', color: '#065F46', padding: 20, borderRadius: 8, marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px 0' }}>✓ Field Insight Logged</h2>
          <p style={{ fontSize: 14, margin: '0 0 14px 0' }}>{successMsg}</p>
          <button
            type="button"
            className="pp-btn pp-btn-primary"
            onClick={() => setSuccessMsg('')}
            style={{ fontSize: 13 }}
          >
            Log Another Insight
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          {errorMsg && (
            <div style={{ background: '#FEE2E2', border: '1px solid #DC2626', color: '#B91C1C', padding: 12, borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
              {errorMsg}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label htmlFor="fi-hcp-name" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                HCP Name & Degree <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <input
                id="fi-hcp-name"
                type="text"
                required
                value={formData.reporter_name}
                onChange={e => handleChange('reporter_name', e.target.value)}
                placeholder="e.g. Dr. Arthur Vance, MD"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 13 }}
              />
            </div>
            <div>
              <label htmlFor="fi-hcp-email" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                HCP Email (for follow-up)
              </label>
              <input
                id="fi-hcp-email"
                type="email"
                value={formData.reporter_email}
                onChange={e => handleChange('reporter_email', e.target.value)}
                placeholder="e.g. avance@stmaryshospital.org"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 13 }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label htmlFor="fi-specialty" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                Medical Specialty
              </label>
              <input
                id="fi-specialty"
                type="text"
                value={formData.hcp_specialty}
                onChange={e => handleChange('hcp_specialty', e.target.value)}
                placeholder="e.g. Cardiology, Oncology"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 13 }}
              />
            </div>
            <div>
              <label htmlFor="fi-institution" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                Institution / Hospital
              </label>
              <input
                id="fi-institution"
                type="text"
                value={formData.institution}
                onChange={e => handleChange('institution', e.target.value)}
                placeholder="e.g. Johns Hopkins, NHS Trust"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 13 }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label htmlFor="fi-product" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                Product / Compound <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <select
                id="fi-product"
                value={formData.product_name}
                onChange={e => handleChange('product_name', e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 13, background: '#fff' }}
              >
                {PRODUCTS.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="fi-venue" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                Interaction Venue
              </label>
              <select
                id="fi-venue"
                value={formData.interaction_venue}
                onChange={e => handleChange('interaction_venue', e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 13, background: '#fff' }}
              >
                {VENUES.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label htmlFor="fi-type" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              Insight Category <span style={{ color: '#DC2626' }}>*</span>
            </label>
            <select
              id="fi-type"
              value={formData.insight_type}
              onChange={e => handleChange('insight_type', e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 13, background: '#fff' }}
            >
              {INSIGHT_TYPES.map(it => (
                <option key={it.value} value={it.value}>{it.label}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label htmlFor="fi-content" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              Clinical Observation / Question Narrative <span style={{ color: '#DC2626' }}>*</span>
            </label>
            <textarea
              id="fi-content"
              rows={4}
              required
              value={formData.content}
              onChange={e => handleChange('content', e.target.value)}
              placeholder="Record the unsolicited clinical inquiry, physician perception, or scientific discussion points..."
              style={{ width: '100%', padding: '10px', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid #F1F5F9', marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#1E293B', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.follow_up_requested}
                onChange={e => handleChange('follow_up_requested', e.target.checked)}
              />
              <strong>Route to Medical Information for formal response</strong>
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label htmlFor="fi-urgency" style={{ fontSize: 12, color: '#64748B' }}>Urgency:</label>
              <select
                id="fi-urgency"
                value={formData.urgency}
                onChange={e => handleChange('urgency', e.target.value)}
                style={{ padding: '4px 8px', border: '1px solid #CBD5E1', borderRadius: 4, fontSize: 12 }}
              >
                <option value="normal">Routine</option>
                <option value="high">High Priority</option>
                <option value="expedited">Expedited (Safety/Regulatory)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="submit"
              disabled={submitting || !formData.reporter_name || !formData.content}
              className="pp-btn pp-btn-primary"
              style={{ padding: '8px 18px', fontWeight: 600 }}
            >
              {submitting ? 'Submitting...' : 'Log Field Insight'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
