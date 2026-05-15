import { useState } from 'react'
import { httpFetch } from '../../../shared/api/httpFetch'

export default function AiAssistantPanel({ caseId, headers }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState('')
  const [result, setResult] = useState(null)

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
            <h3>AI Case Assistant</h3>
            <button type="button" onClick={() => setOpen(false)}>Close</button>
          </div>
          <p>Controlled suggestions only. Agents must review and accept before use.</p>
          <div className="ai-case-actions">
            <button type="button" onClick={() => run('classify')} disabled={!!busy}>Classify</button>
            <button type="button" onClick={() => run('extract')} disabled={!!busy}>Extract</button>
            <button type="button" onClick={() => run('summarize')} disabled={!!busy}>Narrative</button>
            <button type="button" onClick={() => run('similar')} disabled={!!busy}>Similar Cases</button>
            <button type="button" onClick={() => run('quality-check')} disabled={!!busy}>Quality Check</button>
            <button type="button" onClick={() => run('suggest-response')} disabled={!!busy}>Suggest Response</button>
          </div>
          {busy && <div className="ai-case-status">Running {busy}...</div>}
          {result && <pre className="ai-case-result">{JSON.stringify(result, null, 2)}</pre>}
        </div>
      )}
    </div>
  )
}
