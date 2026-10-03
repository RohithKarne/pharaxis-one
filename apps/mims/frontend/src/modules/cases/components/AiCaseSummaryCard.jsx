// PARKED (MIPM-28, 2 Oct 2026): not shown anywhere in MIMS — it was taken off the case
// screen in the 29 Jul 2026 release (the AI pieces because the AI suite gave canned output).
// Whether to bring it back or delete it is Rohith's decision; until then it stays unmounted.
import { useState, useEffect, useMemo } from 'react'
import { httpFetch } from '../../../shared/api/httpFetch.js'

export default function AiCaseSummaryCard({ caseId, headers }) {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState(false)
  const [error, setError] = useState(null)

  const requestHeaders = useMemo(() => ({
    ...(headers?.Authorization ? { Authorization: headers.Authorization } : {}),
    ...(headers?.['Content-Type'] ? { 'Content-Type': headers['Content-Type'] } : {}),
  }), [headers])

  const fetchSummary = async () => {
    setLoading(true)
    setError(null)
    try {
      // MIPM-28: the route is POST; a GET always failed and fell through to the text below.
      const res = await httpFetch(`/api/cases/${caseId}/ai/summarize`, { method: 'POST', headers: requestHeaders })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No AI summary is available for this case.')
      setSummary(data.suggestion || data)
    } catch (err) {
      // MIPM-28: never show text that did not come from the case. This used to invent a
      // clinical narrative ("the patient experienced unexpected effects after taking the
      // suspect drug…") and call it an AI summary.
      setSummary(null)
      setError(err.message || 'No AI summary is available for this case.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSummary()
  }, [caseId, requestHeaders])

  if (dismissed) return null

  return (
    <div className="cf-ai-summary-card">
      <div className="cf-ai-summary-header">
        <div className="cf-ai-summary-title">
          <strong>AI Case Summary</strong>
        </div>
        <div className="cf-ai-summary-actions">
          <button type="button" onClick={fetchSummary} className="cf-ai-refresh-btn" disabled={loading}>
            Refresh Summary
          </button>
          <button type="button" onClick={() => setDismissed(true)} className="cf-ai-dismiss-btn">
            Dismiss
          </button>
        </div>
      </div>
      
      {loading ? (
        <div className="cf-ai-summary-loading">
          <div className="skeleton-line" style={{ width: '100%' }}></div>
          <div className="skeleton-line" style={{ width: '90%' }}></div>
          <div className="skeleton-line" style={{ width: '80%' }}></div>
        </div>
      ) : (
        <div className="cf-ai-summary-content">
          {error && <p className="cf-ai-summary-narrative" role="status">{error}</p>}
          <p className="cf-ai-summary-narrative">{summary?.narrative}</p>
          <div className="cf-ai-summary-tags">
            {summary?.riskFlags?.length > 0 && (
              <div className="cf-ai-risk-flags">
                {summary.riskFlags.map((flag, idx) => (
                  <span key={`risk-${idx}`} className="cf-ai-risk-chip">{flag}</span>
                ))}
              </div>
            )}
            {summary?.keyFacts?.length > 0 && (
              <div className="cf-ai-key-facts">
                {summary.keyFacts.map((fact, idx) => (
                  <span key={`fact-${idx}`} className="cf-ai-fact-pill">{fact}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
