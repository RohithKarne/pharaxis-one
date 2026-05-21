import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import { useAuth } from '../../../shared/context/AuthContext'
import { httpFetch } from '../../../shared/api/httpFetch'
import '../cases.css'

const SECTIONS = ['Sender / Receiver / IDs', 'Patient + History', 'Reactions', 'Drugs', 'Tests', 'Narrative + Causality']

export default function ICSRBuilderPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { token } = useAuth()
  const headers = useMemo(
    () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
    [token]
  )
  const [active, setActive] = useState(0)
  const [data, setData] = useState(null)
  const [xml, setXml] = useState('')
  const [redactedXml, setRedactedXml] = useState('')
  const [xmlTab, setXmlTab] = useState('redacted')
  const [errors, setErrors] = useState([])
  const [message, setMessage] = useState('')
  const [ackXml, setAckXml] = useState({ ACK1: '', ACK2: '', ACK3: '' })
  const [submissionType, setSubmissionType] = useState('initial')
  const [signature, setSignature] = useState({ password: '', reason: 'Regulatory ICSR submission' })

  async function load() {
    const res = await httpFetch(`/api/admin/icsr/${id}`, { headers })
    setData(await res.json())
  }
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const res = await httpFetch(`/api/admin/icsr/${id}`, { headers })
      const nextData = await res.json()
      if (!cancelled) setData(nextData)
    })()
    return () => { cancelled = true }
  }, [id, headers])

  async function previewXml() {
    const [rawRes, redRes] = await Promise.all([
      httpFetch(`/api/admin/icsr/${id}/xml`, { headers }),
      httpFetch(`/api/admin/icsr/${id}/xml-preview-redacted`, { headers }),
    ])
    setXml(await rawRes.text())
    const red = await redRes.json().catch(() => ({}))
    setRedactedXml(red.redacted || '')
  }
  async function validate() {
    const res = await httpFetch(`/api/admin/icsr/${id}/validate`, { method: 'POST', headers })
    const d = await res.json()
    setErrors(d.errors || [])
    setMessage(d.valid ? 'Validation passed' : 'Validation needs review')
  }
  async function lockSubmit() {
    const lock = await httpFetch(`/api/admin/icsr/${id}/lock`, { method: 'POST', headers })
    const lockData = await lock.json().catch(() => ({}))
    if (!lock.ok) { setErrors(lockData.errors || [{ reason: lockData.error }]); return }
    const submit = await httpFetch(`/api/admin/icsr/${id}/submit`, { method: 'POST', headers, body: JSON.stringify({ gateway: 'mock', password: signature.password, reason: signature.reason }) })
    const submitData = await submit.json().catch(() => ({}))
    setMessage(submit.ok ? `Submitted to mock regulatory gateway${submitData.e_sign_manifest?.manifest_id ? ` · Manifest ${submitData.e_sign_manifest.manifest_id}` : ''}` : submitData.error)
    load()
  }
  async function parseAck(level) {
    const res = await httpFetch(`/api/admin/icsr/${id}/ack/${level}`, { method: 'POST', headers, body: JSON.stringify({ ack_xml: ackXml[level], gateway: report.receiver_id }) })
    const d = await res.json().catch(() => ({}))
    setMessage(res.ok ? `${level} parsed: ${d.ack_status}` : d.error)
    load()
  }
  async function createLifecycle(type) {
    if (type === 'initial') return
    if (!window.confirm(`Create ${type} submission? This creates a regulated child report.`)) return
    const body = type === 'nullification' ? { reason: signature.reason, password: signature.password } : {}
    const path = type === 'followup' ? 'follow-up' : type === 'amendment' ? 'amend' : 'nullify'
    const res = await httpFetch(`/api/admin/icsr/${id}/${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.id) navigate(`/icsr/${data.id}`)
    else setMessage(data.error || 'Lifecycle action failed')
  }

  if (!data) return <MIMSLayout><div className="cf-form-loading">Loading ICSR...</div></MIMSLayout>
  const report = data.report || {}

  return (
    <MIMSLayout bodyClassName="no-scroll">
      <div className="icsr-builder-page">
        <header className="icsr-builder-header">
          <button type="button" onClick={() => navigate(`/cases/${report.case_id}?section=icsr`)}>Back to Case</button>
          <div><h1>ICSR Builder</h1><p>{report.sender_safety_report_id} · {report.receiver_id} · {report.status}</p></div>
          <div className="icsr-builder-actions">
            <button type="button" onClick={previewXml}>Generate XML</button>
            <select value={submissionType} onChange={e => { setSubmissionType(e.target.value); createLifecycle(e.target.value) }}>
              <option value="initial">Initial</option>
              <option value="followup">Follow-up</option>
              <option value="amendment">Amendment</option>
              <option value="nullification">Nullification</option>
            </select>
            <button type="button" onClick={validate}>Validate</button>
            <button type="button" onClick={lockSubmit}>Lock + Submit</button>
          </div>
        </header>
        <div className="icsr-builder-grid">
          <aside>{SECTIONS.map((s, i) => <button key={s} className={active === i ? 'active' : ''} onClick={() => setActive(i)}>{i + 1}. {s}</button>)}</aside>
          <main>
            <h2>{SECTIONS[active]}</h2>
            <pre>{JSON.stringify(active === 0 ? report : active === 2 ? data.reactions : active === 3 ? data.drugs : active === 4 ? data.tests : active === 1 ? data.history : { narrative: report.narrative, causality: report.causality_per_drug }, null, 2)}</pre>
            {message && <div className="icsr-message">{message}</div>}
            {errors.length > 0 && <div className="icsr-errors">{errors.map((e, i) => <button key={i} onClick={() => setActive(0)}>{e.path || 'XML'}: {e.reason}</button>)}</div>}
            <div className="icsr-sign-box">
              <h3>Electronic Signature</h3>
              <label>Reason<input value={signature.reason} onChange={e => setSignature(s => ({ ...s, reason: e.target.value }))} /></label>
              <label>Password<input type="password" value={signature.password} onChange={e => setSignature(s => ({ ...s, password: e.target.value }))} placeholder="Required for Lock + Submit" /></label>
            </div>
            <div className="icsr-ack-box">
              <h3>Regulatory ACK Parser</h3>
              <div className="icsr-ack-lanes">
                {['ACK1','ACK2','ACK3'].map(level => <div key={level} className="icsr-ack-lane">
                  <strong>{level}</strong>
                  <textarea value={ackXml[level]} onChange={e => setAckXml(p => ({ ...p, [level]: e.target.value }))} rows={4} placeholder={`Paste ${level} XML here`} />
                  <button type="button" onClick={() => parseAck(level)}>Parse {level}</button>
                </div>)}
              </div>
            </div>
          </main>
          <section className="icsr-xml-pane"><h3>XML Preview</h3>
            <div className="icsr-xml-tabs"><button className={xmlTab === 'raw' ? 'active' : ''} onClick={() => setXmlTab('raw')}>Raw internal</button><button className={xmlTab === 'redacted' ? 'active' : ''} onClick={() => setXmlTab('redacted')}>Submitted redacted</button></div>
            <pre>{(xmlTab === 'raw' ? xml : redactedXml) || 'Click Generate XML to preview E2B(R3).'}</pre>
          </section>
        </div>
      </div>
    </MIMSLayout>
  )
}
