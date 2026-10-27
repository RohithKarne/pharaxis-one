import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'

// CPPM-159: one page per month that accounts for every report sent to MIMS, with a
// fingerprint recorded in the audit trail each time it is made. Prints, or downloads
// the same report as a PDF.
const TONE = { zero_loss: '#166534', open: '#991b1b', none: '#475569' }

export default function ZeroLossReportPage() {
  const { clientId } = useParams()
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [clientId, month])

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/admin/submissions/${clientId}/zero-loss?month=${month}`, { headers: adminHeaders() })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error || `Could not make the report (error ${res.status}).`); setReport(null); return }
      setReport(d)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function downloadPdf() {
    const res = await fetch(`/api/admin/submissions/${clientId}/zero-loss.pdf?month=${month}`, { headers: adminHeaders() })
    if (!res.ok) { setError(`Could not download the PDF (error ${res.status}).`); return }
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url; a.download = `zero-loss-${clientId}-${month}.pdf`; a.click()
    URL.revokeObjectURL(url)
  }

  const minutes = s => (s == null ? '—' : `${Math.round(s / 60)} min`)

  return (
    <AdminLayout title="Zero-Loss Report">
      <div className="zl-controls" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <label htmlFor="zl-month" style={{ fontSize: 14 }}>Month</label>
        <input id="zl-month" type="month" value={month} max={new Date().toISOString().slice(0, 7)} onChange={e => e.target.value && setMonth(e.target.value)} />
        <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => window.print()} disabled={!report}>Print</button>
        <button className="cp-btn cp-btn-sm cp-btn-primary" onClick={downloadPdf} disabled={!report}>Download PDF</button>
        <Link to={`/admin/clients/${clientId}/sync-health`} style={{ fontSize: 13, marginLeft: 'auto' }}>Sync Health</Link>
      </div>

      {error && <div className="cp-error" style={{ marginBottom: 12 }}>{error}</div>}
      {loading ? <div className="cp-loading">Loading…</div> : report && (
        <div className="zl-report">
          <div className="cp-card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: '#64748b' }}>{report.client.name} · reports submitted in {report.month_name}</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6, color: TONE[report.verdict.state] }}>{report.verdict.text}</div>
          </div>

          <Section title="1. Reports received and in MIMS">
            {report.received.by_type.map(t => <div key={t.type}>{t.label}: {t.received} received, <b>{t.in_mims} in MIMS</b> with a receipt.</div>)}
            {report.received.not_in_mims.length > 0 && (
              <table className="cp-table" style={{ marginTop: 8 }}>
                <thead><tr><th>Not in MIMS yet</th><th>Type</th><th>Submitted (UTC)</th><th>Last answer from MIMS</th></tr></thead>
                <tbody>{report.received.not_in_mims.map(n => (
                  <tr key={n.reference}><td>{n.reference}</td><td>{n.type}</td><td>{n.submitted}</td><td>{n.last_error || '—'}</td></tr>
                ))}</tbody>
              </table>
            )}
          </Section>

          <Section title="2. Delivery time">
            <div style={{ color: '#64748b', fontSize: 12 }}>Target: in MIMS within {report.delivery.target_minutes} minutes; {report.delivery.serious_target_minutes} for a side effect reported as serious.</div>
            <div>All reports: {report.delivery.all.delivered} delivered, <b>{report.delivery.all.within_target} within target</b> · median {minutes(report.delivery.all.median_seconds)} · slowest {minutes(report.delivery.all.slowest_seconds)}</div>
            <div>Serious side effects: {report.delivery.serious.delivered} delivered, <b>{report.delivery.serious.within_target} within target</b></div>
            {report.delivery.missed.length > 0 && <div>Missed the target: {report.delivery.missed.join(', ')}</div>}
          </Section>

          <Section title="3. Comparisons with MIMS">
            {report.comparisons.runs.length === 0 && <div>None ran this month.</div>}
            {report.comparisons.runs.map(r => (
              <div key={r.scope}>
                {r.scope === 'ae' ? 'Side-effect reports, hourly' : 'All reports, nightly'}: {r.runs} runs ({r.failed} could not finish), {r.checked} report checks, {r.missing} found missing ({r.resent} sent again), {r.different} different.
              </div>
            ))}
            {report.comparisons.not_covered.length > 0 && <div style={{ color: '#b45309' }}>Not covered by the comparison (no key yet): {report.comparisons.not_covered.join(', ')}</div>}
          </Section>

          <Section title="4. Files and added information">
            <div>Files: {report.files.total} sent with these reports, {report.files.delivered} on their MIMS case, {report.files.held} held unscanned, {report.files.blocked} blocked by the virus check.</div>
            <div>Added information: {report.followups.total} items, {report.followups.delivered} on their MIMS case.</div>
          </Section>

          <Section title="5. Alerts raised this month">
            {report.alerts.length === 0 ? <div>None.</div> : report.alerts.map(a => <div key={a.kind}>{a.label}: {a.raised} raised, {a.closed} closed.</div>)}
          </Section>

          <Section title="6. Other requests (portal only)">
            <div>{report.other_requests.received} received, {report.other_requests.answered} answered, {report.other_requests.closed_unanswered} closed without an answer, {report.other_requests.open} still open.</div>
            <div>{report.other_requests.oldest_open ? `Oldest still open, of any month: ${report.other_requests.oldest_open.reference}, submitted ${report.other_requests.oldest_open.submitted} UTC.` : 'No Other request is waiting for an answer.'}</div>
          </Section>

          <Section title="7. What this report does not cover">
            <ul style={{ margin: 0, paddingLeft: 18 }}>{report.not_covered.map(n => <li key={n}>{n}</li>)}</ul>
          </Section>

          <div style={{ fontSize: 12, color: '#475569', marginTop: 12, wordBreak: 'break-all' }}>
            Made {report.generated.at} UTC by {report.generated.by}. Fingerprint (SHA-256 of the contents above): <code>{report.fingerprint}</code>.
            The fingerprint is recorded in the audit trail each time this report is made, so a printed copy can be checked against it. It is not an electronic signature.
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

function Section({ title, children }) {
  return (
    <div className="cp-card zl-section" style={{ marginBottom: 12, fontSize: 14, lineHeight: 1.7 }}>
      <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>{title}</h3>
      {children}
    </div>
  )
}
