import { lazy, Suspense, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import { useAuth } from '../../../shared/context/AuthContext'
import { httpFetch } from '../../../shared/api/httpFetch.js'
import '../cases.css'

const CaseMITab = lazy(() => import('../components/CaseMITab'))

// MI response screen. The wizard captures the enquiry; this screen answers it,
// building the response document from Content Management (locked with Rohith
// 2026-07-28). It renders the response half of CaseMITab — the capture half
// stays in the wizard, so there is one implementation of the builder, not two.

export default function CaseResponsePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { token } = useAuth()

  const [caseData, setCaseData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savedMsg, setSavedMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await httpFetch(`/api/cases/${id}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Case not found.')
        if (!cancelled) setCaseData(data)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  if (loading) return <div className="cf-form-loading">Loading response workspace…</div>

  if (error || !caseData) {
    return (
      <MIMSLayout showStatStrip={false} surfaceVariant="workspace" compact>
        <div className="cf-form-error">
          {error || 'Case not found.'} <button onClick={() => navigate(`/cases/${id}`)}>Back to case</button>
        </div>
      </MIMSLayout>
    )
  }

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  return (
    <MIMSLayout showStatStrip={false} surfaceVariant="workspace" compact>
      <div className="cf-form-page">
        <div className="cf-form-header">
          <button className="cf-back-btn" onClick={() => navigate(`/cases/${id}`)}>← Back to case</button>
          <div className="cf-form-header-info">
            <span className="cf-form-case-num">{caseData.case_number || `Case ${id}`}</span>
            <span className="cf-form-type-badge" style={{ background: '#2563eb' }}>MI</span>
            <span className="cf-form-org">Response</span>
          </div>
          <div className="cf-form-header-right">
            {savedMsg && <span className="cf-saved-msg">{savedMsg}</span>}
          </div>
        </div>

        <div className="cf-handoff-body">
          {caseData.case_type !== 'MI' ? (
            <div className="cf-handoff-note cf-handoff-note--warn">
              The response builder applies to medical information cases. This case is {caseData.case_type} —
              use the Transmission screen instead.
            </div>
          ) : (
            <Suspense fallback={<div className="cf-tab-loading">Loading response builder…</div>}>
              <CaseMITab
                view="response"
                id={id}
                token={token}
                headers={headers}
                setSavedMsg={setSavedMsg}
                caseType="MI"
              />
            </Suspense>
          )}
        </div>
      </div>
    </MIMSLayout>
  )
}
