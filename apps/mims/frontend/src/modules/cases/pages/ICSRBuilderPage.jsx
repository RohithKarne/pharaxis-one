import { useEffect, useState } from 'react'
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
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const [active, setActive] = useState(0)
  const [data, setData] = useState(null)
  const [xml, setXml] = useState('')
  const [errors, setErrors] = useState([])
  const [message, setMessage] = useState('')

  async function load() {
    const res = await httpFetch(`/api/admin/icsr/${id}`, { headers })
    setData(await res.json())
  }
  useEffect(() => { load() }, [id])

  async function previewXml() {
    const res = await httpFetch(`/api/admin/icsr/${id}/xml`, { headers })
    setXml(await res.text())
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
    const submit = await httpFetch(`/api/admin/icsr/${id}/submit`, { method: 'POST', headers, body: JSON.stringify({ gateway: 'mock', e_signature_reason: 'Regulatory ICSR submission' }) })
    const submitData = await submit.json().catch(() => ({}))
    setMessage(submit.ok ? 'Submitted to mock regulatory gateway' : submitData.error)
    load()
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
          </main>
          <section className="icsr-xml-pane"><h3>XML Preview</h3><pre>{xml || 'Click Generate XML to preview E2B(R3).'}</pre></section>
        </div>
      </div>
    </MIMSLayout>
  )
}
