import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'

export default function ClarificationPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const { clientCode, t } = usePortal()

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [reporterName, setReporterName] = useState('')
  const [answer, setAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!token) {
      setError('No verification token provided. Please check the link from your email.')
      setLoading(false)
      return
    }

    fetch(`/api/portal/clarifications/${encodeURIComponent(token)}`)
      .then(async res => {
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Unable to retrieve clinical question.')
        setData(json)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [token])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!answer.trim() || answer.trim().length < 5) return

    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`/api/portal/clarifications/${encodeURIComponent(token)}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answer: answer.trim(),
          reporter_name: reporterName.trim() || 'Reporting Physician',
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Submission failed.')
      setSubmitted(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="pp-container pp-page-content" style={{ maxWidth: 760, margin: '40px auto' }}>
      <div className="pp-page-header" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1E293B' }}>Clinical Clarification Request</h1>
        <p style={{ color: '#64748B', marginTop: 4 }}>
          Medical Affairs has requested clinical clarification regarding your recent medical report.
        </p>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>
          Loading clarification request...
        </div>
      ) : error ? (
        <div style={{ background: '#FEE2E2', border: '1px solid #DC2626', color: '#B91C1C', padding: 16, borderRadius: 8, marginBottom: 20 }}>
          <p style={{ fontWeight: 600 }}>Unable to load request</p>
          <p style={{ fontSize: 14, marginTop: 4 }}>{error}</p>
          <div style={{ marginTop: 12 }}>
            <Link to={clientCode ? `/portal/${clientCode}` : '/'} className="pp-btn pp-btn-secondary" style={{ fontSize: 13 }}>
              Return to Portal
            </Link>
          </div>
        </div>
      ) : submitted ? (
        <div style={{ background: '#ECFDF5', border: '1px solid #10B981', color: '#065F46', padding: 24, borderRadius: 8 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>✓</span> Clinical Clarification Received
          </h2>
          <p style={{ marginTop: 8, fontSize: 14 }}>
            Thank you for providing the requested details. Your reply has been securely linked to case <strong>{data?.case_number}</strong> and transmitted directly to the Medical Affairs team.
          </p>
          <div style={{ marginTop: 16 }}>
            <Link to={clientCode ? `/portal/${clientCode}` : '/'} className="pp-btn pp-btn-primary">
              Return to Portal
            </Link>
          </div>
        </div>
      ) : data?.is_expired ? (
        <div style={{ background: '#FFFBEB', border: '1px solid #F59E0B', color: '#92400E', padding: 20, borderRadius: 8 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>Request Expired</h2>
          <p style={{ marginTop: 6, fontSize: 14 }}>
            This clarification link expired after 72 hours. To submit additional information regarding case <strong>{data?.case_number}</strong>, please contact Medical Affairs directly or submit a follow-up inquiry through the portal.
          </p>
        </div>
      ) : data?.is_answered ? (
        <div style={{ background: '#F8FAFC', border: '1px solid #CBD5E1', padding: 20, borderRadius: 8 }}>
          <span style={{ background: '#10B981', color: '#fff', fontSize: 12, padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
            Answered
          </span>
          <h3 style={{ marginTop: 12, fontSize: 16, fontWeight: 600, color: '#1E293B' }}>Question:</h3>
          <p style={{ background: '#fff', border: '1px solid #E2E8F0', padding: 12, borderRadius: 6, marginTop: 6 }}>
            {data?.question}
          </p>
          <h3 style={{ marginTop: 16, fontSize: 16, fontWeight: 600, color: '#1E293B' }}>Your Submitted Response:</h3>
          <p style={{ background: '#fff', border: '1px solid #E2E8F0', padding: 12, borderRadius: 6, marginTop: 6, whiteSpace: 'pre-wrap' }}>
            {data?.answer_text}
          </p>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: 14, marginBottom: 18 }}>
            <div>
              <span style={{ fontSize: 12, color: '#64748B', textTransform: 'uppercase', fontWeight: 600 }}>Case Reference</span>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>{data?.case_number}</div>
            </div>
            {data?.product_name && (
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 12, color: '#64748B', textTransform: 'uppercase', fontWeight: 600 }}>Product</span>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#0F172A' }}>{data?.product_name}</div>
              </div>
            )}
          </div>

          <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: 16, borderRadius: 6, marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1E40AF', marginBottom: 4 }}>
              Medical Affairs Inquiry:
            </label>
            <div style={{ fontSize: 15, color: '#1E293B', lineHeight: 1.5 }}>
              {data?.question}
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="clarification-name" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                Your Name & Title (Optional)
              </label>
              <input
                id="clarification-name"
                type="text"
                value={reporterName}
                onChange={e => setReporterName(e.target.value)}
                placeholder="e.g. Dr. Jane Smith, MD"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 14 }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label htmlFor="clarification-response" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                Clinical Details / Response <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <textarea
                id="clarification-response"
                rows={5}
                required
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                placeholder="Provide clinical details such as exact dosage, dates, concomitant therapies, lab results, or dechallenge outcomes..."
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 14, fontFamily: 'inherit' }}
              />
              <span style={{ fontSize: 12, color: '#64748B' }}>
                Secure transmission directly linked to case record. Minimum 5 characters.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                type="submit"
                disabled={submitting || answer.trim().length < 5}
                className="pp-btn pp-btn-primary"
                style={{ padding: '10px 20px', fontWeight: 600 }}
              >
                {submitting ? 'Transmitting Response...' : 'Submit Clarification'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
