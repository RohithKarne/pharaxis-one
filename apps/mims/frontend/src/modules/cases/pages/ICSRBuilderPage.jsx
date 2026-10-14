import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import { useAuth } from '../../../shared/context/AuthContext'
import { httpFetch } from '../../../shared/api/httpFetch'
import '../cases.css'

const SECTIONS = ['Sender / Receiver / IDs', 'Patient + History', 'Reactions', 'Drugs', 'Tests', 'Narrative + Causality']

// Each section as a person reads it, in place of the raw record.
const day = (v) => (v ? String(v).slice(0, 10) : '')
const YES_NO = { y: 'Yes', n: 'No', u: 'Unknown', na: 'Not applicable' }
const SERIOUSNESS = { death: 'Death', lifeThreatening: 'Life-threatening', hospitalization: 'Hospitalisation', disability: 'Disability', congenitalAnomaly: 'Congenital anomaly', otherMI: 'Other medically important' }
const ROLES = { suspect: 'Suspect', concomitant: 'Concomitant', interacting: 'Interacting', treatment: 'Treatment', past: 'Past' }

function Facts({ rows }) {
  return (
    <dl className="icsr-facts">
      {rows.map(([label, value]) => (
        <div key={label}><dt>{label}</dt><dd>{value || value === 0 ? value : '—'}</dd></div>
      ))}
    </dl>
  )
}

function Rows({ items, columns, empty }) {
  if (!items?.length) return <p className="icsr-empty">{empty}</p>
  return (
    <div className="icsr-table-wrap"><table className="icsr-table">
      <thead><tr>{columns.map(([label]) => <th key={label}>{label}</th>)}</tr></thead>
      <tbody>{items.map((item, i) => (
        <tr key={item.id ?? i}>{columns.map(([label, read]) => <td key={label}>{read(item) || '—'}</td>)}</tr>
      ))}</tbody>
    </table></div>
  )
}

function SectionView({ active, data, report }) {
  if (active === 0) {
    const serious = Object.entries(report.seriousness_classification || {}).filter(([, on]) => on).map(([k]) => SERIOUSNESS[k] || k)
    return <Facts rows={[
      ['Safety report ID', report.sender_safety_report_id],
      ['Receiver', report.receiver_id],
      ['Status', report.status],
      ['Report type', report.report_type],
      ['Latest information date', day(report.receive_date)],
      ['Primary source country', report.primary_source_country],
      ['Seriousness', serious.length ? serious.join(', ') : 'Not serious'],
      ['Times submitted', report.submission_count],
      ['Locked', report.locked ? `Yes, ${day(report.locked_at)}` : 'No'],
    ]} />
  }
  if (active === 1) {
    const p = data.patient || {}
    return <>
      <Facts rows={[
        ['Initials', p.initials || p.name],
        ['Sex', p.sex],
        ['Date of birth', day(p.dob)],
        ['Age', p.age ? `${p.age} ${p.age_unit || ''}`.trim() : ''],
        ['Weight (kg)', p.weight_kg],
        ['Height (cm)', p.height_cm],
      ]} />
      <h3>Medical history</h3>
      <Rows items={data.history} empty="No medical history on this report." columns={[
        ['Condition', h => h.comments], ['Start', h => day(h.start_date)], ['End', h => day(h.end_date)],
      ]} />
    </>
  }
  if (active === 2) {
    return <Rows items={data.reactions} empty="No reactions on this report." columns={[
      ['As reported', r => r.reaction_verbatim], ['Coded term', r => r.meddra_pt_name], ['Onset', r => day(r.onset_date)],
      ['End', r => day(r.end_date)], ['Outcome', r => r.outcome], ['Serious', r => (r.term_highlighted === 'y' ? 'Yes' : 'No')],
    ]} />
  }
  if (active === 3) {
    return <Rows items={data.drugs} empty="No products on this report." columns={[
      ['Role', d => ROLES[d.drug_role] || d.drug_role], ['Product', d => d.medicinal_product_name], ['Batch', d => d.batch_no],
      ['Dose', d => [d.dose_amount, d.dose_unit].filter(Boolean).join(' ')], ['Route', d => d.route_of_admin], ['Indication', d => d.indication],
      ['Start', d => day(d.start_date)], ['End', d => day(d.end_date)], ['Action taken', d => d.action_taken],
      ['Dechallenge', d => YES_NO[d.dechallenge]], ['Rechallenge', d => YES_NO[d.rechallenge]],
    ]} />
  }
  if (active === 4) {
    return <Rows items={data.tests} empty="No test results on this report." columns={[
      ['Test', t => t.test_name], ['Date', t => day(t.test_date)], ['Result', t => t.result_text],
      ['Normal low', t => t.test_normal_low], ['Normal high', t => t.test_normal_high], ['Notes', t => t.result_unstructured],
    ]} />
  }
  return <>
    <h3>Narrative</h3>
    <p className="icsr-narrative">{report.narrative || 'No narrative.'}</p>
    <h3>Causality</h3>
    <Rows items={data.causality} empty="No causality assessed on this case." columns={[
      ['Assessor', c => c.assessor], ['Method', c => String(c.method || '').replace(/_/g, ' ')], ['Result', c => c.category],
    ]} />
  </>
}

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
    // WP8: no hardcoded gateway — the backend resolves the transport from per-org gateway
    // config, falling back to the report's receiver HA (and to mock if nothing is configured).
    const submit = await httpFetch(`/api/admin/icsr/${id}/submit`, { method: 'POST', headers, body: JSON.stringify({ password: signature.password, reason: signature.reason }) })
    const submitData = await submit.json().catch(() => ({}))
    const gwLabel = submitData.gateway_mode === 'mock'
      ? `a SIMULATED gateway — nothing was sent to a health authority (${(submitData.gateway_key || 'mock').toUpperCase()}; no live transport is configured)`
      : `${(submitData.gateway_key || report?.receiver_id || '').toUpperCase()} gateway`
    setMessage(submit.ok ? `Submitted to ${gwLabel}${submitData.e_sign_manifest?.manifest_id ? ` · Manifest ${submitData.e_sign_manifest.manifest_id}` : ''}` : submitData.error)
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

  if (!data) return <MIMSLayout showStatStrip={false} bodyClassName="mims-ops-page-body" surfaceVariant="workspace" compact><div className="cf-form-loading">Loading ICSR...</div></MIMSLayout>
  const report = data.report || {}

  return (
    <MIMSLayout showStatStrip={false} bodyClassName="no-scroll mims-ops-page-body" surfaceVariant="workspace" compact>
      <div className="icsr-builder-page">
        <header className="icsr-builder-header">
          <button type="button" onClick={() => navigate(`/cases/${report.case_id}?section=icsr`)}>Back to Case</button>
          <div><h1>ICSR Builder</h1><p>{report.sender_safety_report_id} · {report.receiver_id} · {report.status}{String(report.gateway_message_id || '').startsWith('MOCK-') ? ' · SIMULATED — not sent to a health authority' : ''}</p></div>
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
            <SectionView active={active} data={data} report={report} />
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
