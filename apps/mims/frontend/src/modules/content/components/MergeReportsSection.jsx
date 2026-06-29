import { useState, useEffect, useCallback } from 'react'
import toast from '../../../shared/utils/toast'
import StatusBadge from './StatusBadge'
import RichTextEditor from './RichTextEditor'
import { CheckInModal } from './ContentModals'
import { httpFetch } from '../../../shared/api/httpFetch.js'
import { useAuth } from '../../../shared/context/AuthContext'

function MergeReportDrawer({ report, folders, token, onClose, onSaved }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const isEdit = !!report?.id
  const [form, setForm] = useState({
    folder_id: report?.folder_id || '',
    name: report?.name || '',
    content_html: report?.content_html || report?.content || '',
  })
  const [saving, setSaving] = useState(false)

  async function runCheckInFlow(targetId, currentStatus) {
    if (currentStatus !== 'CheckedOut') {
      const checkoutRes = await httpFetch(`/api/cm/merge-reports/${targetId}/checkout`, { method: 'POST', headers: authHeaders })
      if (!checkoutRes.ok) {
        const err = await checkoutRes.json().catch(() => ({}))
        throw new Error(err.error || 'Merge report checkout failed.')
      }
    }
    const checkinRes = await httpFetch(`/api/cm/merge-reports/${targetId}/checkin`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ notes: isEdit ? 'Checked in after merge report update' : 'Checked in on merge report creation' }),
    })
    if (!checkinRes.ok) {
      const err = await checkinRes.json().catch(() => ({}))
      throw new Error(err.error || 'Merge report check-in failed.')
    }
  }

  async function handleSave(checkIn = false) {
    if (!form.folder_id) return toast.warn('Folder is required.')
    if (!form.name.trim()) return toast.warn('Name is required.')
    setSaving(true)
    try {
      const url = isEdit ? `/api/cm/merge-reports/${report.id}` : '/api/cm/merge-reports'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await httpFetch(url, { method, headers: authHeaders, body: JSON.stringify(form) })
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        if (checkIn) {
          const targetId = report?.id || data.id
          const currentStatus = report?.status || data.report?.status || 'Draft'
          await runCheckInFlow(targetId, currentStatus)
        }
        onSaved()
        onClose()
      } else {
        const d = await res.json()
        toast.error(d.error || 'Save failed.')
      }
    } catch (err) {
      toast.error(err.message || 'Network error.')
    }
    setSaving(false)
  }

  return (
    <>
      <div className="cm-drawer-overlay" onClick={onClose} />
      <div className="cm-drawer">
        <div className="cm-drawer-header">
          <span className="cm-drawer-title">{isEdit ? `Edit: ${report.name}` : 'New Merge Report'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--text-secondary)' }}>×</button>
        </div>
        <div className="cm-drawer-body">
          <div className="cm-form-group">
            <label className="cm-form-label">Folder <span className="required">*</span></label>
            <select className="cm-form-select" value={form.folder_id} onChange={e => setForm(p => ({ ...p, folder_id: e.target.value }))}>
              <option value="">— Select Folder —</option>
              {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div className="cm-form-group">
            <label className="cm-form-label">Name <span className="required">*</span></label>
            <input className="cm-form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Merge report name" />
          </div>
          <div className="cm-form-group">
            <label className="cm-form-label">Content</label>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Use merge fields like {'{{patient_name}}'}, {'{{product_name}}'}, {'{{case_id}}'}.</p>
            <RichTextEditor value={form.content_html} onChange={v => setForm(p => ({ ...p, content_html: v }))} />
          </div>
        </div>
        <div className="cm-drawer-footer">
          <button className="cm-btn cm-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="cm-btn cm-btn-secondary" onClick={() => handleSave(false)} disabled={saving}>{saving ? 'Saving…' : 'Save Draft'}</button>
          <button className="cm-btn cm-btn-primary" onClick={() => handleSave(true)} disabled={saving}>{saving ? 'Saving…' : 'Save & Check-In'}</button>
        </div>
      </div>
    </>
  )
}

export default function MergeReportsSection({ token }) {
  const { hasCapability } = useAuth()
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [reports, setReports] = useState([])
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: '', folder_id: '', search: '' })
  const [showDrawer, setShowDrawer] = useState(false)
  const [editReport, setEditReport] = useState(null)
  const [checkInReport, setCheckInReport] = useState(null)
  const [checkInLoading, setCheckInLoading] = useState(false)
  const [scheduleTarget, setScheduleTarget] = useState(null)
  const [scheduleDraft, setScheduleDraft] = useState({ cron_expression: '', email_recipients: '', is_active: true })
  const [scheduleLoading, setScheduleLoading] = useState(false)

  const [generateTarget, setGenerateTarget] = useState(null)
  const [genCaseId, setGenCaseId] = useState('')
  const [genLoading, setGenLoading] = useState(false)
  const [genResult, setGenResult] = useState(null)
  const [genError, setGenError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, value]) => value)))
      const [rRes, fRes] = await Promise.all([
        httpFetch(`/api/cm/merge-reports?${params}`, { headers: authHeaders }),
        httpFetch('/api/cm/folders', { headers: authHeaders }),
      ])
      if (rRes.ok) setReports((await rRes.json()).reports || [])
      if (fRes.ok) setFolders((await fRes.json()).folders || [])
    } catch { /* silent */ }
    setLoading(false)
  }, [filters, token]) // eslint-disable-line

  useEffect(() => { load() }, [load])

  async function handleCheckOut(r) {
    try {
      const res = await httpFetch(`/api/cm/merge-reports/${r.id}/checkout`, { method: 'POST', headers: authHeaders })
      if (res.ok) load()
      else { const d = await res.json(); toast.error(d.error || 'Check out failed.') }
    } catch { toast.error('Network error.') }
  }

  async function handleCheckIn() {
    setCheckInLoading(true)
    try {
      const res = await httpFetch(`/api/cm/merge-reports/${checkInReport.id}/checkin`, { method: 'POST', headers: authHeaders })
      if (res.ok) { setCheckInReport(null); load() }
      else { const d = await res.json(); toast.error(d.error || 'Check in failed.') }
    } catch { toast.error('Network error.') }
    setCheckInLoading(false)
  }

  async function handleArchive(r) {
    if (!confirm(`Archive "${r.name}"?`)) return
    try {
      const res = await httpFetch(`/api/cm/merge-reports/${r.id}/archive`, { method: 'POST', headers: authHeaders })
      if (res.ok) load()
      else { const d = await res.json(); toast.error(d.error || 'Archive failed.') }
    } catch { toast.error('Network error.') }
  }

  function openGenerate(r) {
    setGenerateTarget(r)
    setGenCaseId('')
    setGenResult(null)
    setGenError(null)
  }

  async function openScheduleManager(report) {
    setScheduleTarget(report)
    setScheduleLoading(true)
    try {
      const res = await httpFetch(`/api/cm/merge-reports/${report.id}/schedule`, { headers: authHeaders })
      const data = await res.json().catch(() => ({}))
      const schedule = data.schedule || null
      const jobConfig = schedule?.job_config && typeof schedule.job_config === 'string'
        ? JSON.parse(schedule.job_config)
        : (schedule?.job_config || {})
      setScheduleDraft({
        cron_expression: schedule?.cron_expression || schedule?.schedule_cron || '',
        email_recipients: Array.isArray(jobConfig.email_recipients)
          ? jobConfig.email_recipients.join(', ')
          : '',
        is_active: schedule ? schedule.is_active !== 0 : true,
      })
    } catch {
      setScheduleDraft({ cron_expression: '', email_recipients: '', is_active: true })
    }
    setScheduleLoading(false)
  }

  async function saveSchedule() {
    if (!scheduleTarget) return
    if (!scheduleDraft.cron_expression.trim()) {
      toast.warn('Cron expression is required.')
      return
    }
    setScheduleLoading(true)
    try {
      const res = await httpFetch(`/api/cm/merge-reports/${scheduleTarget.id}/schedule`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          cron_expression: scheduleDraft.cron_expression.trim(),
          email_recipients: scheduleDraft.email_recipients.split(',').map((email) => email.trim()).filter(Boolean),
          is_active: scheduleDraft.is_active,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Schedule save failed.')
        return
      }
      toast.success('Schedule saved.')
      setScheduleTarget(null)
    } catch {
      toast.error('Schedule save failed.')
    }
    setScheduleLoading(false)
  }

  async function removeSchedule() {
    if (!scheduleTarget) return
    setScheduleLoading(true)
    try {
      const res = await httpFetch(`/api/cm/merge-reports/${scheduleTarget.id}/schedule`, {
        method: 'DELETE',
        headers: authHeaders,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Schedule remove failed.')
        return
      }
      toast.success('Schedule removed.')
      setScheduleTarget(null)
    } catch {
      toast.error('Schedule remove failed.')
    }
    setScheduleLoading(false)
  }

  async function handleGenerate() {
    if (!generateTarget) return
    setGenLoading(true); setGenError(null); setGenResult(null)
    try {
      const res = await httpFetch(`/api/cm/merge-reports/${generateTarget.id}/generate`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ case_id: genCaseId ? Number(genCaseId) : undefined }),
      })
      const d = await res.json()
      if (!res.ok) { setGenError(d.error || 'Generate failed.'); return }
      setGenResult(d)
    } catch { setGenError('Network error.') }
    finally { setGenLoading(false) }
  }

  function handleDownloadHtml() {
    if (!genResult?.generated_html) return
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${genResult.report_name || 'Merge Report'}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; line-height: 1.6;
         color: #1e293b; max-width: 800px; margin: 40px auto; padding: 0 24px; }
  img { max-width: 100%; } table { border-collapse: collapse; width: 100%; }
  td,th { border: 1px solid #d1d5db; padding: 6px 10px; } th { background: #f9fafb; }
  @media print { body { margin: 0; padding: 20px; } }
</style>
</head><body>
${genResult.generated_html}
</body></html>`
    const blob = new Blob([fullHtml], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(genResult.report_name || 'merge-report').replace(/\s+/g, '_')}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handlePrintPdf() {
    if (!genResult?.generated_html) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${genResult.report_name || 'Merge Report'}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; line-height: 1.6;
         color: #1e293b; max-width: 800px; margin: 40px auto; padding: 0 24px; }
  img { max-width: 100%; } table { border-collapse: collapse; width: 100%; }
  td,th { border: 1px solid #d1d5db; padding: 6px 10px; } th { background: #f9fafb; }
</style>
</head><body>
${genResult.generated_html}
<script>window.onload = function(){ window.print(); }</script>
</body></html>`)
    win.document.close()
  }

  return (
    <div>
      <div className="cm-section-header">
        <h2 className="cm-section-title">Merge Reports</h2>
        {hasCapability('content.author') && <button className="cm-btn cm-btn-primary" onClick={() => { setEditReport(null); setShowDrawer(true) }}>+ New Merge Report</button>}
      </div>
      <div className="cm-filters">
        <select className="cm-form-select" style={{ width: 180 }} value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))}>
          <option value="">All Statuses</option>
          <option>Draft</option>
          <option>CheckedOut</option>
          <option>Archived</option>
        </select>
        <select className="cm-form-select" style={{ width: 180 }} value={filters.folder_id} onChange={e => setFilters(p => ({ ...p, folder_id: e.target.value }))}>
          <option value="">All Folders</option>
          {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <input className="cm-form-input" style={{ width: 240 }} value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))} placeholder="Search merge reports…" />
        <button className="cm-btn cm-btn-secondary" onClick={load}>Filter</button>
      </div>
      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>Loading merge reports…</p>
      ) : reports.length === 0 ? (
        <div className="cm-empty"><div className="cm-empty-icon">📋</div><p>No merge reports yet. Create one to get started!</p></div>
      ) : (
        <table className="cm-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Folder</th>
              <th>Version</th>
              <th>Status</th>
              <th>Checked Out</th>
              <th>Last Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {reports.map(r => (
              <tr key={r.id}>
                <td style={{ fontWeight: 500 }}>{r.name}</td>
                <td>{r.folder_name || '—'}</td>
                <td style={{ textAlign: 'center' }}>{r.version || '1.0'}</td>
                <td><StatusBadge status={r.status || 'Draft'} /></td>
                <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{r.checked_out_by_name || '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.updated_at ? new Date(r.updated_at).toLocaleDateString() : '—'}</td>
                <td>
                  <div className="cm-action-btns">
                    <button className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => { setEditReport(r); setShowDrawer(true) }}>Edit</button>
                    <button className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => handleCheckOut(r)}>Check Out</button>
                    <button className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => setCheckInReport(r)}>Check In</button>
                    <button className="cm-btn cm-btn-secondary cm-btn-sm" style={{ color: '#7c3aed', borderColor: '#7c3aed' }} onClick={() => openGenerate(r)}>⚡ Generate</button>
                    <button className="cm-btn cm-btn-secondary cm-btn-sm" onClick={() => openScheduleManager(r)}>⏱ Schedule</button>
                    <button className="cm-btn cm-btn-danger cm-btn-sm" onClick={() => handleArchive(r)}>Archive</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showDrawer && (
        <MergeReportDrawer report={editReport} folders={folders} token={token} onClose={() => { setShowDrawer(false); setEditReport(null) }} onSaved={load} />
      )}
      {checkInReport && (
        <CheckInModal item={checkInReport} onClose={() => setCheckInReport(null)} onConfirm={handleCheckIn} loading={checkInLoading} />
      )}
      {scheduleTarget && (
        <div className="cm-modal-overlay" onClick={() => !scheduleLoading && setScheduleTarget(null)}>
          <div className="cm-modal" style={{ width: 560, maxWidth: '94vw' }} onClick={e => e.stopPropagation()}>
            <div className="cm-modal-header">
              <h3 className="cm-modal-title">Schedule Merge Report</h3>
              <button className="cm-modal-close" onClick={() => !scheduleLoading && setScheduleTarget(null)}>✕</button>
            </div>
            <div style={{ padding: 20, display: 'grid', gap: 14 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Report</div>
                <div style={{ fontWeight: 600 }}>{scheduleTarget.name}</div>
              </div>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Cron Expression</span>
                <input className="cm-form-input" value={scheduleDraft.cron_expression} onChange={e => setScheduleDraft(p => ({ ...p, cron_expression: e.target.value }))} placeholder="e.g. 0 9 * * 1" />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Email Recipients</span>
                <input className="cm-form-input" value={scheduleDraft.email_recipients} onChange={e => setScheduleDraft(p => ({ ...p, email_recipients: e.target.value }))} placeholder="qa@example.com, lead@example.com" />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <input type="checkbox" checked={scheduleDraft.is_active} onChange={e => setScheduleDraft(p => ({ ...p, is_active: e.target.checked }))} />
                Schedule active
              </label>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Examples: `0 9 * * 1` for every Monday at 9:00, `0 8 * * *` for every day at 8:00.
              </div>
            </div>
            <div className="cm-drawer-footer" style={{ borderTop: '1px solid var(--border)' }}>
              <button className="cm-btn cm-btn-danger" onClick={removeSchedule} disabled={scheduleLoading}>Remove</button>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
                <button className="cm-btn cm-btn-secondary" onClick={() => setScheduleTarget(null)} disabled={scheduleLoading}>Cancel</button>
                <button className="cm-btn cm-btn-primary" onClick={saveSchedule} disabled={scheduleLoading}>{scheduleLoading ? 'Saving…' : 'Save Schedule'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {generateTarget && (
        <div className="cm-modal-overlay" onClick={() => setGenerateTarget(null)}>
          <div
            className="cm-modal"
            style={{ width: 760, maxWidth: '96vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="cm-modal-header">
              <h3 className="cm-modal-title">⚡ Generate — {generateTarget.name}</h3>
              <button className="cm-modal-close" onClick={() => setGenerateTarget(null)}>✕</button>
            </div>

            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>
                  Case ID <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional — leave blank to preview field placeholders)</span>
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 142"
                  value={genCaseId}
                  onChange={e => setGenCaseId(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13 }}
                />
              </div>
              <button
                className="cm-btn cm-btn-primary"
                onClick={handleGenerate}
                disabled={genLoading}
                style={{ background: '#7c3aed', borderColor: '#7c3aed', flexShrink: 0 }}
              >
                {genLoading ? 'Generating…' : '⚡ Generate'}
              </button>
            </div>

            {genError && (
              <div style={{ padding: '12px 20px', background: '#fef2f2', color: '#dc2626', fontSize: 13, borderBottom: '1px solid #fecaca' }}>
                {genError}
              </div>
            )}

            {genResult && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '10px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: 12, background: '#f8fafc' }}>
                  {Object.entries(genResult.merge_data || {}).filter(([, v]) => v).map(([k, v]) => (/* WP7: guard — a response without merge_data threw Object.entries(undefined) */
                    <span key={k} style={{ fontSize: 11, color: '#475569' }}>
                      <strong style={{ color: '#1e293b' }}>{k.replace(/_/g, ' ')}</strong>: {v}
                    </span>
                  ))}
                </div>
                <iframe
                  title="Generated merge report"
                  style={{ flex: 1, border: 'none', minHeight: 340 }}
                  srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{font-family:Arial,sans-serif;font-size:13px;line-height:1.6;
color:#1e293b;padding:20px 28px;margin:0;word-wrap:break-word;}
img{max-width:100%;}table{border-collapse:collapse;width:100%;}
td,th{border:1px solid #d1d5db;padding:6px 10px;}th{background:#f9fafb;}</style>
</head><body>${genResult.generated_html}</body></html>`}
                  sandbox="allow-same-origin"
                />
                <div style={{ padding: '10px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 10, background: '#fff', flexShrink: 0 }}>
                  <button className="cm-btn cm-btn-secondary" onClick={handleDownloadHtml}>
                    ⬇ Download HTML
                  </button>
                  <button className="cm-btn cm-btn-secondary" onClick={handlePrintPdf}>
                    🖨 Print / Save as PDF
                  </button>
                  <span style={{ fontSize: 12, color: '#94a3b8', alignSelf: 'center', marginLeft: 'auto' }}>
                    Generated {genResult.case_id ? `for Case #${genResult.case_id}` : 'without case data'} · {new Date().toLocaleTimeString()}
                  </span>
                </div>
              </div>
            )}

            {!genResult && !genLoading && !genError && (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                Enter a Case ID above and click Generate to populate this report with live case data,<br />
                or click Generate without a Case ID to preview the report with field placeholders.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
