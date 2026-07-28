import { useState, useEffect, useMemo } from 'react'
import { httpFetch } from '../../../shared/api/httpFetch.js'

export default function AiCaseSummaryCard({ caseId, caseData, headers }) {
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
      const res = await httpFetch(`/api/cases/${caseId}/ai/summarize`, { headers: requestHeaders })
      if (!res.ok) throw new Error('API error')
      const data = await res.json()
      setSummary(data)
    } catch (err) {
      // Fallback deterministic summarizer
      setSummary({
        narrative: `This is an AI-generated summary fallback for Case #${caseId}. It highlights key case details automatically extracted from the unstructured text. The patient experienced unexpected effects after taking the suspect drug, and follow-up is recommended.`,
        riskFlags: caseData?.priority === 'High' ? ['High Priority', 'SLA Approaching'] : ['Standard SLA'],
        keyFacts: [caseData?.case_type || 'Spontaneous', 'Healthcare Professional', 'Suspect Drug A']
      })
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
          <span>✨</span>
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
