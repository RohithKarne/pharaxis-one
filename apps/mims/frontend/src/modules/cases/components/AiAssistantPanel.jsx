import { useState } from 'react'
import { httpFetch } from '../../../shared/api/httpFetch'

const CONTEXT_MAP = {
  overview: {
    title: 'Case overview assistant',
    subtitle: 'Use AI for classification, extraction, narrative drafting, and case-level QA.',
    actions: ['classify', 'extract', 'summarize', 'quality-check', 'similar'],
  },
  people: {
    title: 'People and identity assistant',
    subtitle: 'Use AI to extract reporter or patient details and flag missing contact context.',
    actions: ['extract', 'summarize', 'quality-check'],
  },
  communications: {
    title: 'Communications assistant',
    subtitle: 'Use AI for thread summaries, response support, and communication QA.',
    actions: ['summarize', 'suggest-response', 'quality-check', 'similar'],
  },
  mi: {
    title: 'MI response assistant',
    subtitle: 'Use AI for inquiry summarization, response drafting, and precedent checks.',
    actions: ['summarize', 'suggest-response', 'similar', 'quality-check'],
  },
  ae: {
    title: 'AE assessment assistant',
    subtitle: 'Use AI for extraction, coding support, and clinical QA.',
    actions: ['extract', 'quality-check', 'similar', 'summarize'],
  },
  pc: {
    title: 'PC investigation assistant',
    subtitle: 'Use AI for complaint extraction, investigation QA, and similar-case lookup.',
    actions: ['extract', 'quality-check', 'similar', 'summarize'],
  },
}

function formatActionLabel(action) {
  if (action === 'quality-check') return 'Quality Check'
  if (action === 'suggest-response') return 'Suggest Response'
  if (action === 'similar') return 'Similar Cases'
  if (action === 'summarize') return 'Narrative'
  return action.charAt(0).toUpperCase() + action.slice(1)
}

export default function AiAssistantPanel({ caseId, headers, activeTab = 'overview' }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [result, setResult] = useState(null)
  const config = CONTEXT_MAP[activeTab] || CONTEXT_MAP.overview

  async function run(action) {
    setBusy(action)
    setResult(null)
    try {
      const res = await httpFetch(`/api/cases/${caseId}/ai/${action}`, { method: 'POST', headers, body: JSON.stringify({}) })
      const data = await res.json()
      setResult(data)
    } catch (err) {
      setResult({ error: err.message })
    } finally {
      setBusy('')
    }
  }

  return (
    <div className={`ai-case-panel${open ? ' open' : ''}`}>
      <button type="button" className="ai-case-toggle" onClick={() => setOpen(v => !v)}>AI Case Assistant</button>
      {open && (
        <div className="ai-case-drawer">
          <div className="ai-case-head">
            <h3>{config.title}</h3>
            <button type="button" onClick={() => setOpen(false)}>Close</button>
          </div>
          <p>{config.subtitle} Controlled suggestions only. Agents must review and accept before use.</p>
          <div className="ai-case-actions">
            {config.actions.map(action => (
              <button key={action} type="button" onClick={() => run(action)} disabled={!!busy}>
                {formatActionLabel(action)}
              </button>
            ))}
          </div>
          {busy && <div className="ai-case-status">Running {busy}...</div>}
          {result && <pre className="ai-case-result">{JSON.stringify(result, null, 2)}</pre>}
        </div>
      )}
    </div>
  )
}
