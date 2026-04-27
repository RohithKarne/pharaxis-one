import { useState, useEffect, useCallback } from 'react'
import StatusBadge from './StatusBadge'
import RichTextEditor from './RichTextEditor'
import { CheckInModal } from './ContentModals'

function MergeReportDrawer({ report, folders, token, onClose, onSaved }) {
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const isEdit = !!report?.id
  const [form, setForm] = useState({
    folder_id: report?.folder_id || '',
    name: report?.name || '',
    content: report?.content || '',
  })
  const [saving, setSaving] = useState(false)

  async function handleSave(checkIn = false) {
    if (!form.folder_id) return alert('Folder is required.')
    if (!form.name.trim()) return alert('Name is required.')
    setSaving(true)
    try {
      const url = isEdit ? `/api/cm/merge-reports/${report.id}` : '/api/cm/merge-reports'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: authHeaders, body: JSON.stringify({ ...form, check_in: checkIn }) })
      if (res.ok) { onSaved(); onClose() }
      else { const d = await res.json(); alert(d.error || 'Save failed.') }
    } catch { alert('Network error.') }
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
            <RichTextEditor value={form.content} onChange={v => setForm(p => ({ ...p, content: v }))} />
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
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const [reports, setReports] = useState([])
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [showDrawer, setShowDrawer] = useState(false)
  const [editReport, setEditReport] = useState(null)
  const [checkInReport, setCheckInReport] = useState(null)
  const [checkInLoading, setCheckInLoading] = useState(false)

  const [generateTarget, setGenerateTarget] = useState(null)
  const [genCaseId, setGenCaseId] = useState('')
  const [genLoading, setGenLoading] = useState(false)
  const [genResult, setGenResult] = useState(null)
  const [genError, setGenError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rRes, fRes] = await Promise.all([
        fetch('/api/cm/merge-reports', { headers: authHeaders }),
        fetch('/api/cm/folders', { headers: authHeaders }),
      ])
      if (rRes.ok) setReports((await rRes.json()).reports || [])
      if (fRes.ok) setFolders((await fRes.json()).folders || [])
    } catch { /* silent */ }
    setLoading(false)
  }, [token]) // eslint-disable-line

  useEffect(() => { load() }, [load])

  async function handleCheckOut(r) {
    try {
      const res = await fetch(`/api/cm/merge-reports/${r.id}/checkout`, { method: 'POST', headers: authHeaders })
      if (res.ok) load()
      else { const d = await res.json(); alert(d.error || 'Check out failed.') }
    } catch { alert('Network error.') }
  }

  async function handleCheckIn() {
    setCheckInLoading(true)
    try {
      const res = await fetch(`/api/cm/merge-reports/${checkInReport.id}/checkin`, { method: 'POST', headers: authHeaders })
      if (res.ok) { setCheckInReport(null); load() }
      else { const d = await res.json(); alert(d.error || 'Check in failed.') }
    } catch { alert('Network error.') }
    setCheckInLoading(false)
  }

  async function handleArchive(r) {
    if (!confirm(`Archive "${r.name}"?`)) return
    try {
      const res = await fetch(`/api/cm/merge-reports/${r.id}/archive`, { method: 'POST', headers: authHeaders })
      if (res.ok) load()
      else { const d = await res.json(); alert(d.error || 'Archive failed.') }
    } catch { alert('Network error.') }
  }

  function openGenerate(r) {
    setGenerateTarget(r)
    setGenCaseId('')
    setGenResult(null)
    setGenError(null)
  }

  async function handleGenerate() {
    if (!generateTarget) return
    setGenLoading(true); setGenError(null); setGenResult(null)
    try {
      const res = await fetch(`/api/cm/merge-reports/${generateTarget.id}/generate`, {
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
        <button className="cm-btn cm-btn-primary" onClick={() => { setEditReport(null); setShowDrawer(true) }}>+ New Merge Report</button>
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
                    <button className="cm-btn cm-btn-secondary cm-btn-sm" onClick={async () => {
                      const cron = prompt('Set schedule (cron expression):\ne.g. "0 9 * * 1" = every Monday 9am\nLeave blank to remove schedule:')
                      if (cron === null) return
                      const emails = prompt('Email recipients (comma-separated, leave blank for none):') || ''
                      const res = await fetch(`/api/cm/merge-reports/${r.id}/schedule`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ cron_expression: cron, email_recipients: emails.split(',').map(e => e.trim()).filter(Boolean), is_active: !!cron }) })
                      if (res.ok) alert(cron ? 'Schedule saved.' : 'Schedule removed.') ; else alert('Schedule save failed.')
                    }}>⏱ Schedule</button>
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
                  {Object.entries(genResult.merge_data).filter(([, v]) => v).map(([k, v]) => (
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
