import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { httpFetch } from '../../../shared/api/httpFetch'

export default function CaseICSRTab({ id, headers, setSavedMsg }) {
  const navigate = useNavigate()
  const [reports, setReports] = useState([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    // B9 — server-side case_id filter avoids pulling the whole tenant's ICSR list.
    const res = await httpFetch(`/api/admin/icsr?case_id=${encodeURIComponent(id)}`, { headers })
    const data = await res.json().catch(() => ({ rows: [] }))
    // Backstop client-side filter in case the API ignores case_id (older deploys).
    setReports((data.rows || []).filter(r => String(r.case_id) === String(id)))
  }, [headers, id])

  useEffect(() => { load() }, [load])

  async function createReport() {
    setBusy(true)
    try {
      const res = await httpFetch('/api/admin/icsr', { method: 'POST', headers, body: JSON.stringify({ case_id: Number(id) }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Unable to create ICSR')
      setSavedMsg?.('ICSR created')
      navigate(`/icsr/${data.id}`)
    } catch (err) {
      setSavedMsg?.(err.message)
    } finally { setBusy(false) }
  }

  return (
    <div id="tab-icsr" className="cf-icsr-tab">
      <div className="cf-icsr-hero">
        <div>
          <h2>ICSR / Regulatory</h2>
          <p>Create and manage E2B(R3) regulatory safety reports for this AE case.</p>
        </div>
        <button type="button" onClick={createReport} disabled={busy}>{busy ? 'Creating...' : 'Create ICSR from this case'}</button>
      </div>
      <div className="cf-icsr-list">
        {reports.length === 0 ? <p>No ICSR reports created yet.</p> : reports.map(r => (
          <button type="button" key={r.id} className="cf-icsr-row" onClick={() => navigate(`/icsr/${r.id}`)}>
            <strong>{r.sender_safety_report_id}</strong><span>{r.receiver_id}</span><span>{r.status}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
