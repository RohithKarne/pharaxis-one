import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { usePortal } from '../context/PortalContext'
import PdfViewerModal from '../components/PdfViewerModal'
import { formatDateTime } from '../../shared/utils/datetime'

// CPPM-15: read the module's document, answer every question, submit. The server
// marks the answers and records the attempt; a pass links to the certificate.
export default function TrainingModulePage() {
  const { clientCode, portalFetch, t } = usePortal()
  const { moduleId } = useParams()
  const base = `/portal/${clientCode}`
  const [data, setData]         = useState(null)
  const [error, setError]       = useState('')
  const [answers, setAnswers]   = useState({})
  const [result, setResult]     = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [showDoc, setShowDoc]   = useState(false)

  function load() {
    return portalFetch(`/api/portal/training/${clientCode}/modules/${moduleId}`)
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || 'This module could not be opened.')
        setData(d)
      })
      .catch(e => setError(e.message))
  }

  useEffect(() => { load() }, [clientCode, moduleId])

  async function submit(e) {
    e.preventDefault()
    setSubmitting(true); setError('')
    try {
      const r = await portalFetch(`/api/portal/training/${clientCode}/modules/${moduleId}/attempts`, {
        method: 'POST', body: JSON.stringify({ answers }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Your answers could not be submitted.')
      setResult(d)
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  function retake() {
    setResult(null); setAnswers({})
    window.scrollTo(0, 0)
  }

  if (error && !data) {
    return (
      <div className="pp-container pp-page-content pp-page-narrow">
        <div className="pp-error-msg" role="alert">{error}</div>
        <Link to={`${base}/training`}>{t('Back to training')}</Link>
      </div>
    )
  }
  if (!data) return <div className="pp-loading">{t('Loading…')}</div>

  const { module, document: doc, questions, attempts } = data
  const certificateUrl = ref => `/api/portal/training/${clientCode}/certificates/${ref}`
  const allAnswered = questions.every(q => answers[q.id] !== undefined)
  const isPdf = doc.mime_type === 'application/pdf'
  const docUrl = `/api/portal/documents/${doc.id}/download`

  return (
    <div className="pp-container pp-page-content pp-page-narrow">
      <Link to={`${base}/training`} style={{ fontSize: 13 }}>{t('All training modules')}</Link>
      <h1 className="pp-page-title" style={{ marginTop: 10 }}>{module.title}</h1>
      <p style={{ color: '#4B5563', fontSize: 14, marginBottom: 20 }}>
        {module.type} · {module.duration} · Pass mark {module.pass_score}% · Version {module.version}
      </p>

      <section style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 18, marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{t('1. Read the module')}</h2>
        <p style={{ fontSize: 14, color: '#4B5563', marginBottom: 10 }}>{doc.title}</p>
        {isPdf
          ? <button type="button" className="pp-btn pp-btn-outline" onClick={() => setShowDoc(true)}>{t('Open the document')}</button>
          : <a className="pp-btn pp-btn-outline" href={docUrl}>{t('Download the document')}</a>}
      </section>

      {result ? (
        <section role="status" style={{ background: result.passed ? '#ECFDF5' : '#FFFBEB', border: `1px solid ${result.passed ? '#A7F3D0' : '#FDE68A'}`, borderRadius: 10, padding: 18, marginBottom: 20 }}>
          {result.passed ? (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#065F46' }}>You passed with {result.score}%.</h2>
              <p style={{ fontSize: 14, margin: '6px 0 12px' }}>The pass mark is {result.pass_score}%. Your reference is <strong>{result.reference}</strong>.</p>
              <a className="pp-btn pp-btn-primary" href={certificateUrl(result.reference)}>{t('Download your certificate')}</a>
            </>
          ) : (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#92400E' }}>You scored {result.score}%. The pass mark is {result.pass_score}%.</h2>
              <p style={{ fontSize: 14, margin: '6px 0 12px' }}>{t('Read the document again, then try the questions once more.')}</p>
              <button type="button" className="pp-btn pp-btn-primary" onClick={retake}>{t('Try again')}</button>
            </>
          )}
        </section>
      ) : (
        <form onSubmit={submit} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 18, marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>{t('2. Answer the questions')}</h2>
          {questions.map((q, i) => (
            <fieldset key={q.id} style={{ border: 'none', padding: 0, margin: '0 0 18px' }}>
              <legend style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{i + 1}. {q.question}</legend>
              {q.options.map((opt, oi) => (
                <label key={oi} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, padding: '4px 0', cursor: 'pointer' }}>
                  <input type="radio" name={`q-${q.id}`} checked={answers[q.id] === oi} onChange={() => setAnswers(a => ({ ...a, [q.id]: oi }))} />
                  <span>{opt}</span>
                </label>
              ))}
            </fieldset>
          ))}
          {error && <div className="pp-error-msg" role="alert" style={{ marginBottom: 12 }}>{error}</div>}
          <button type="submit" className="pp-btn pp-btn-primary" disabled={!allAnswered || submitting}>
            {submitting ? 'Submitting…' : 'Submit answers'}
          </button>
          {!allAnswered && <span style={{ fontSize: 12, color: '#4B5563', marginLeft: 10 }}>{t('Answer every question to submit.')}</span>}
        </form>
      )}

      {attempts.length > 0 && (
        <section style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 18 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>{t('Your attempts')}</h2>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid #E5E7EB' }}>
              <th style={{ padding: 6 }}>{t('When')}</th><th style={{ padding: 6 }}>{t('Version')}</th><th style={{ padding: 6 }}>{t('Score')}</th><th style={{ padding: 6 }}>{t('Result')}</th><th style={{ padding: 6 }}></th>
            </tr></thead>
            <tbody>
              {attempts.map(a => (
                <tr key={a.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: 6 }}>{formatDateTime(a.taken_at)}</td>
                  <td style={{ padding: 6 }}>{a.module_version}</td>
                  <td style={{ padding: 6 }}>{a.score}%</td>
                  <td style={{ padding: 6 }}>{a.passed ? 'Passed' : 'Not passed'}</td>
                  <td style={{ padding: 6 }}>{a.passed ? <a href={certificateUrl(a.reference)}>{t('Certificate')}</a> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {showDoc && (
        <PdfViewerModal url={`${docUrl}?disposition=inline`} downloadUrl={docUrl} title={doc.title} onClose={() => setShowDoc(false)} />
      )}
    </div>
  )
}
