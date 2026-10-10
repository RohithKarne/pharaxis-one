import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { httpFetch } from '../../../shared/api/httpFetch.js'

// A case sent in by a connected portal (bridge features F1, F3, F5):
// - where it came from, with a link to the request on that portal;
// - an earlier case that may be the same report, for a person to judge;
// - questions for the person who reported. The portal picks a question up on its next
//   check, the person answers on their request page, and the answer arrives as a
//   case comment.
// Shows nothing on a case that did not come from a portal and has no duplicate flag.

function formatWhen(value) {
  if (!value) return ''
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return String(value)
  return dt.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const CANNOT_ASK = {
  reporter_erased: "The reporter's details were erased, so they cannot be asked anything.",
  reporter_not_signed_in: 'The reporter was not signed in to the portal, so they have no page to answer on. Contact them another way.',
  portal_not_ready: 'This case was sent before the portal could take questions. Contact the reporter another way.',
}

export default function CaseBridgePanel({ caseId, headers }) {
  const [info, setInfo] = useState(null)
  const [asking, setAsking] = useState(false)
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!caseId) return
    let cancelled = false
    httpFetch(`/api/cases/${caseId}/bridge`, { headers })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled) setInfo(d) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [caseId, headers?.Authorization])

  if (!info || (!info.source && !info.possible_duplicate)) return null

  async function post(url, body) {
    setBusy(true)
    setError('')
    try {
      const res = await httpFetch(url, { method: 'POST', headers, body: JSON.stringify(body || {}) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'That did not work. Try again.'); return false }
      setInfo(data)
      return true
    } catch {
      setError('That did not work. Check your connection and try again.')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function ask(e) {
    e.preventDefault()
    if (await post(`/api/cases/${caseId}/reporter-questions`, { question: question.trim() })) {
      setQuestion('')
      setAsking(false)
    }
  }

  return (
    <div className="cf-bridge-panel">
      {info.possible_duplicate && (
        <div className="cf-bridge-duplicate" role="status">
          Possibly the same report as case{' '}
          <Link to={`/cases/${info.possible_duplicate.id}`}>{info.possible_duplicate.case_number}</Link>
          : same reporter and product within 7 days. Check it, and merge them if so.
        </div>
      )}
      {info.source && (
        <div className="cf-bridge-source">
          <span>
            <span className="cf-strip-key">From</span>
            {info.source.name}{info.source.reference ? `: ${info.source.reference}` : ''}
            {info.source.link && (
              <> · <a href={info.source.link} target="_blank" rel="noopener noreferrer">Open in portal ↗</a></>
            )}
          </span>
          {info.can_ask && !asking && (
            <button type="button" className="cf-back-btn" onClick={() => { setAsking(true); setError('') }}>
              Ask the reporter a question
            </button>
          )}
          {!info.can_ask && CANNOT_ASK[info.cannot_ask_reason] && (
            <span className="cf-bridge-note">{CANNOT_ASK[info.cannot_ask_reason]}</span>
          )}
        </div>
      )}
      {asking && (
        <form className="cf-bridge-ask" onSubmit={ask}>
          <label htmlFor="cf-bridge-question">Your question for the reporter</label>
          <textarea id="cf-bridge-question" rows={3} maxLength={2000} value={question} disabled={busy}
            onChange={e => setQuestion(e.target.value)} />
          <div className="cf-bridge-note">
            They see it on their request page in the portal and get an email saying a question is waiting. Their answer arrives here as a case comment.
          </div>
          <div className="cf-bridge-actions">
            <button type="submit" className="cf-back-btn" disabled={busy || question.trim().length < 5}>{busy ? 'Sending…' : 'Send question'}</button>
            <button type="button" className="cf-back-btn" disabled={busy} onClick={() => { setAsking(false); setError('') }}>Cancel</button>
          </div>
        </form>
      )}
      {error && <div className="cf-bridge-error" role="alert">{error}</div>}
      {info.questions.length > 0 && (
        <ul className="cf-bridge-questions">
          {info.questions.map(q => (
            <li key={q.id}>
              <div className="cf-bridge-q-head">
                {q.asked_by_name || 'Someone'} asked, {formatWhen(q.asked_at)} ·{' '}
                {q.answered_at ? `Answered ${formatWhen(q.answered_at)} (see comments)`
                  : q.withdrawn_at ? `Withdrawn ${formatWhen(q.withdrawn_at)}`
                    : 'Waiting for the reporter'}
                {!q.answered_at && !q.withdrawn_at && (
                  <button type="button" className="cf-bridge-link" disabled={busy}
                    onClick={() => post(`/api/cases/${caseId}/reporter-questions/${q.id}/withdraw`)}>
                    Withdraw
                  </button>
                )}
              </div>
              <div className="cf-bridge-q-text">{q.question}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
