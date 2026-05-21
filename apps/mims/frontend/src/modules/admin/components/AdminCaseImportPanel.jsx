import { useEffect, useState } from 'react'
import { confirm } from '../../../shared/utils/confirm'
import { IntegrationSectionHeader } from './AdminIntegrationShared'
import { httpFetch } from '../../../shared/api/httpFetch.js'

export default function AdminCaseImportPanel({ H }) {
  const [caseImportTab, setCaseImportTab] = useState('export')
  const [caseExportFilters, setCaseExportFilters] = useState({ case_type: '', date_from: '', date_to: '', status_id: '', assigned_to: '', format: 'csv' })
  const [caseExportLoading, setCaseExportLoading] = useState(false)
  const [caseExportMsg, setCaseExportMsg] = useState('')
  const [redactPii, setRedactPii] = useState(false)
  const [e2bConfig, setE2bConfig] = useState({ sender_org: '', sender_id: '', receiver_id: '', meddra_version: '', expedited_days: '15' })
  const [importFile, setImportFile] = useState(null)
  const [importUploading, setImportUploading] = useState(false)
  const [importUploadMsg, setImportUploadMsg] = useState('')
  const [importJobHistory, setImportJobHistory] = useState([])
  const [importJobLoading, setImportJobLoading] = useState(false)
  const [scheduledExports, setScheduledExports] = useState([])
  const [scheduledExportsLoading, setScheduledExportsLoading] = useState(false)
  const [scheduledExportForm, setScheduledExportForm] = useState({ name: '', cron_expression: '', format: 'csv', case_type: '', email_to: '', is_active: true })
  const [scheduledExportSaving, setScheduledExportSaving] = useState(false)
  const [scheduledExportMsg, setScheduledExportMsg] = useState('')

  useEffect(() => {
    loadImportJobs()
    loadScheduledExports()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadImportJobs() {
    setImportJobLoading(true)
    try {
      const r = await httpFetch('/api/admin/cases/import/jobs', { headers: H })
      const d = await r.json()
      setImportJobHistory(d.jobs || [])
    } catch { setImportJobHistory([]) }
    finally { setImportJobLoading(false) }
  }

  async function loadScheduledExports() {
    setScheduledExportsLoading(true)
    try {
      const r = await httpFetch('/api/admin/exports/scheduled', { headers: H })
      const d = await r.json()
      setScheduledExports(d.configs || [])
    } catch { setScheduledExports([]) }
    finally { setScheduledExportsLoading(false) }
  }

  async function handleCaseExport() {
    setCaseExportLoading(true)
    setCaseExportMsg('')
    try {
      const params = new URLSearchParams()
      if (caseExportFilters.case_type)   params.set('case_type', caseExportFilters.case_type)
      if (caseExportFilters.date_from)   params.set('date_from', caseExportFilters.date_from)
      if (caseExportFilters.date_to)     params.set('date_to', caseExportFilters.date_to)
      if (caseExportFilters.status_id)   params.set('status_id', caseExportFilters.status_id)
      if (caseExportFilters.assigned_to) params.set('assigned_to', caseExportFilters.assigned_to)
      params.set('format', caseExportFilters.format || 'csv')
      const response = await httpFetch(`/api/admin/cases/export?${params.toString()}`, { headers: H })
      if (response.headers.get('content-type')?.includes('text/csv')) {
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = response.headers.get('content-disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'cases.csv'
        a.click()
        URL.revokeObjectURL(url)
      } else {
        const d = await response.json()
        setCaseExportMsg(d.message || d.error || 'No cases found.')
      }
    } catch { setCaseExportMsg('Export failed. Please try again.') }
    finally { setCaseExportLoading(false) }
  }

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h2 style={{ marginBottom: 4 }}>Case Import / Export</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>Export filtered cases in multiple formats or import cases from external files.</p>
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '2px solid var(--border)' }}>
        {[['export','Export Cases'],['import','Import Cases'],['scheduled','Scheduled Exports']].map(([tab, label]) => (
          <button key={tab} onClick={() => setCaseImportTab(tab)} style={{ padding: '8px 20px', background: 'none', border: 'none', cursor: 'pointer', fontWeight: caseImportTab === tab ? 600 : 400, color: caseImportTab === tab ? 'var(--accent)' : 'var(--text-muted)', borderBottom: caseImportTab === tab ? '2px solid var(--accent)' : '2px solid transparent', marginBottom: -2 }}>
            {label}
          </button>
        ))}
      </div>

      {caseImportTab === 'export' && (<>
        <IntegrationSectionHeader title="Export Filters" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 700 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Case Type</label>
            <select className="form-input" value={caseExportFilters.case_type} onChange={e => setCaseExportFilters(f => ({ ...f, case_type: e.target.value }))}>
              <option value="">All Types</option><option value="MI">MI</option><option value="AE">AE</option><option value="PC">PC</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Export Format</label>
            <select className="form-input" value={caseExportFilters.format || 'csv'} onChange={e => setCaseExportFilters(f => ({ ...f, format: e.target.value }))}>
              <option value="csv">CSV</option><option value="xlsx">Excel (XLSX)</option><option value="json">JSON</option><option value="e2b_r3">E2B R3 (Regulatory XML)</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Date Field</label>
            <select className="form-input" value={caseExportFilters.date_field || 'created_at'} onChange={e => setCaseExportFilters(f => ({ ...f, date_field: e.target.value }))}>
              <option value="created_at">Created Date</option><option value="updated_at">Updated Date</option><option value="date_received">Date Received</option><option value="date_of_intake">Date of Intake</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Priority</label>
            <select className="form-input" value={caseExportFilters.priority || ''} onChange={e => setCaseExportFilters(f => ({ ...f, priority: e.target.value }))}>
              <option value="">All Priorities</option><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Date From</label>
            <input className="form-input" type="date" value={caseExportFilters.date_from} onChange={e => setCaseExportFilters(f => ({ ...f, date_from: e.target.value }))} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Date To</label>
            <input className="form-input" type="date" value={caseExportFilters.date_to} onChange={e => setCaseExportFilters(f => ({ ...f, date_to: e.target.value }))} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Intake Channel</label>
            <select className="form-input" value={caseExportFilters.intake_channel || ''} onChange={e => setCaseExportFilters(f => ({ ...f, intake_channel: e.target.value }))}>
              <option value="">All Channels</option><option value="manual">Manual</option><option value="email">Email</option><option value="emir">EMIR</option><option value="api">API</option><option value="import">Import</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Is Serious (AE only)</label>
            <select className="form-input" value={caseExportFilters.is_serious || ''} onChange={e => setCaseExportFilters(f => ({ ...f, is_serious: e.target.value }))}>
              <option value="">All</option><option value="1">Serious Only</option><option value="0">Non-Serious Only</option>
            </select>
          </div>
        </div>
        <div style={{ marginTop: 12, marginBottom: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500, cursor: 'pointer', fontSize: 14 }}>
            <input type="checkbox" checked={redactPii} onChange={e => setRedactPii(e.target.checked)} />
            Redact PII — anonymise patient name, date of birth, and address in export
          </label>
        </div>
        {caseExportFilters.format === 'e2b_r3' && (
          <div style={{ background: 'var(--bg-subtle, #f8f9fa)', border: '1px solid var(--border)', borderRadius: 6, padding: 16, marginBottom: 20 }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>E2B R3 Submission Configuration</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[['sender_org','Sender Organisation','Your company name'],['sender_id','Sender ID (MAH Identifier)','e.g. EU/1/96/007'],['receiver_id','Receiver ID (EMA/FDA Gateway)','e.g. EMEA-0000066'],['meddra_version','MedDRA Version','e.g. 26.1'],['expedited_days','Expedited Report Days','15']].map(([field, label, ph]) => (
                <div key={field}>
                  <label style={{ display: 'block', marginBottom: 4, fontWeight: 500, fontSize: 13 }}>{label}</label>
                  <input className="form-input" placeholder={ph} value={e2bConfig[field] || ''} onChange={e => setE2bConfig(prev => ({ ...prev, [field]: e.target.value }))} />
                </div>
              ))}
            </div>
          </div>
        )}
        {caseExportMsg && <p style={{ marginBottom: 12, color: 'var(--text-muted)' }}>{caseExportMsg}</p>}
        <button className="btn btn-primary" disabled={caseExportLoading} onClick={handleCaseExport}>
          {caseExportLoading ? 'Preparing download…' : 'Download Cases'}
        </button>
      </>)}

      {caseImportTab === 'import' && (<>
        <div style={{ background: 'var(--bg-subtle, #f8f9fa)', border: '1px solid var(--border)', borderRadius: 6, padding: 20, marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 8px' }}>Case Import</h3>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>Upload a CSV, Excel, or XML file to bulk-import cases into MIMS.</p>
        </div>
        <IntegrationSectionHeader title="Import Configuration" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 700, marginBottom: 20 }}>
          <div><label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Import Format</label><select className="form-input"><option value="csv">CSV</option><option value="xlsx">Excel XLSX</option><option value="xml">XML</option><option value="json">JSON</option></select></div>
          <div><label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Default Case Type</label><select className="form-input"><option value="MI">MI — Medical Information</option><option value="AE">AE — Adverse Event</option><option value="PC">PC — Product Complaint</option></select></div>
          <div><label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Encoding</label><select className="form-input"><option value="UTF-8">UTF-8</option><option value="ISO-8859-1">ISO-8859-1</option><option value="Windows-1252">Windows-1252</option></select></div>
          <div><label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Date Format</label><select className="form-input"><option value="YYYY-MM-DD">YYYY-MM-DD</option><option value="MM/DD/YYYY">MM/DD/YYYY</option><option value="DD/MM/YYYY">DD/MM/YYYY</option><option value="DD-MMM-YYYY">DD-MMM-YYYY</option></select></div>
          <div><label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>CSV Delimiter</label><select className="form-input"><option value=",">Comma (,)</option><option value=";">Semicolon (;)</option><option value="\t">Tab</option><option value="|">Pipe (|)</option></select></div>
          <div><label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>On Validation Error</label><select className="form-input"><option value="abort">Abort Import</option><option value="skip_row">Skip Invalid Rows</option><option value="quarantine">Quarantine Invalid Rows</option></select></div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500, cursor: 'pointer', marginBottom: 8 }}><input type="checkbox" /> Has Header Row</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500, cursor: 'pointer' }}><input type="checkbox" /> Dry Run — validate without importing</label>
        </div>
        <div style={{ border: `2px dashed ${importFile ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, padding: 32, textAlign: 'center', marginBottom: 24, cursor: 'pointer' }} onClick={() => document.getElementById('case-import-file-input').click()}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
          <p style={{ margin: '0 0 8px', fontWeight: 500 }}>{importFile ? importFile.name : 'Drop file here or click to browse'}</p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{importFile ? `${(importFile.size / 1024).toFixed(1)} KB — ready to upload` : 'Supported: .csv, .xlsx, .xls, .xml, .json'}</p>
          <input id="case-import-file-input" type="file" accept=".csv,.xlsx,.xls,.xml,.json" style={{ display: 'none' }} onChange={e => { setImportFile(e.target.files[0] || null); setImportUploadMsg('') }} />
        </div>
        <IntegrationSectionHeader title="Field Mapping" />
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>Standard field mapping applied automatically. Full dynamic mapping available in Sprint 12.</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 16 }}>
          <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Source Column','MIMS Table','MIMS Field','Transform'].map(h => <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {[['case_number','cases','case_number','Direct'],['case_type','cases','case_type','Uppercase'],['date_received','cases','date_received','Date Convert'],['priority','cases','priority','Lowercase'],['intake_channel','cases','intake_channel','Direct'],['first_name','case_contacts','first_name','Trim'],['last_name','case_contacts','last_name','Trim'],['email','case_contacts','email','Lowercase']].map(([src, tbl, fld, trx], i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{src}</td>
                <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{tbl}</td>
                <td style={{ padding: '6px 8px' }}>{fld}</td>
                <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{trx}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {importUploadMsg && <p style={{ marginBottom: 12, fontSize: 13, color: importUploadMsg.startsWith('✓') ? 'var(--success)' : 'var(--warning)' }}>{importUploadMsg}</p>}
        <button className="btn btn-primary" disabled={!importFile || importUploading} style={{ opacity: (!importFile || importUploading) ? 0.6 : 1 }} onClick={async () => {
          if (!importFile) return
          setImportUploading(true)
          setImportUploadMsg('')
          try {
            const fd = new FormData()
            fd.append('file', importFile)
            const res = await httpFetch('/api/admin/cases/import/upload', { method: 'POST', headers: { Authorization: H.Authorization }, body: fd })
            const d = await res.json()
            if (res.ok) {
              setImportUploadMsg(`✓ Import job started — Job ID: ${d.jobId || d.id || 'queued'}. Check Import Job History to track progress.`)
              setImportFile(null)
              document.getElementById('case-import-file-input').value = ''
            } else {
              setImportUploadMsg(d.error || 'Upload failed.')
            }
          } catch { setImportUploadMsg('Upload failed — please try again.') }
          finally { setImportUploading(false) }
        }}>{importUploading ? 'Uploading…' : 'Import Cases'}</button>
        <div style={{ marginTop: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>Import Job History</h3>
            <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 12px' }} disabled={importJobLoading} onClick={loadImportJobs}>{importJobLoading ? 'Loading…' : 'Refresh'}</button>
          </div>
          {importJobHistory.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No import jobs yet. Click Refresh to load.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Job ID','File','Status','Rows','Created','Completed'].map(h => <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>)}
              </tr></thead>
              <tbody>{importJobHistory.map((job, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{job.id}</td>
                  <td style={{ padding: '6px 8px' }}>{job.filename || '—'}</td>
                  <td style={{ padding: '6px 8px' }}><span style={{ color: job.status === 'completed' ? 'var(--success)' : job.status === 'failed' ? 'var(--warning)' : 'var(--text-muted)' }}>{job.status}</span></td>
                  <td style={{ padding: '6px 8px' }}>{job.rows_imported != null ? `${job.rows_imported}/${job.total_rows || '?'}` : '—'}</td>
                  <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{job.created_at ? new Date(job.created_at).toLocaleString() : '—'}</td>
                  <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{job.completed_at ? new Date(job.completed_at).toLocaleString() : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </>)}

      {caseImportTab === 'scheduled' && (
        <div>
          <div style={{ background: 'var(--bg-subtle, #f8f9fa)', border: '1px solid var(--border)', borderRadius: 6, padding: 20, marginBottom: 24 }}>
            <h3 style={{ margin: '0 0 8px' }}>Scheduled Exports</h3>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>Configure recurring case export jobs. Exports are generated on the defined schedule and delivered by email.</p>
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 20, marginBottom: 24 }}>
            <h4 style={{ margin: '0 0 16px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>New Scheduled Export</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 700 }}>
              <div><label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Name</label><input className="form-input" placeholder="e.g. Weekly MI Export" value={scheduledExportForm.name} onChange={e => setScheduledExportForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Schedule (Cron)</label><input className="form-input" placeholder="e.g. 0 8 * * 1 (Mon 8am)" value={scheduledExportForm.cron_expression} onChange={e => setScheduledExportForm(f => ({ ...f, cron_expression: e.target.value }))} /></div>
              <div><label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Format</label>
                <select className="form-input" value={scheduledExportForm.format} onChange={e => setScheduledExportForm(f => ({ ...f, format: e.target.value }))}>
                  <option value="csv">CSV</option><option value="xlsx">Excel (XLSX)</option><option value="json">JSON</option><option value="e2b_r3">E2B R3</option>
                </select>
              </div>
              <div><label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Case Type</label>
                <select className="form-input" value={scheduledExportForm.case_type} onChange={e => setScheduledExportForm(f => ({ ...f, case_type: e.target.value }))}>
                  <option value="">All Types</option><option value="MI">MI</option><option value="AE">AE</option><option value="PC">PC</option>
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}><label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Deliver to Email(s)</label><input className="form-input" placeholder="email1@example.com, email2@example.com" value={scheduledExportForm.email_to} onChange={e => setScheduledExportForm(f => ({ ...f, email_to: e.target.value }))} /></div>
            </div>
            {scheduledExportMsg && <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text-muted)' }}>{scheduledExportMsg}</p>}
            <button className="btn btn-primary" style={{ marginTop: 16 }} disabled={scheduledExportSaving} onClick={async () => {
              if (!scheduledExportForm.name || !scheduledExportForm.cron_expression) { setScheduledExportMsg('Name and schedule are required.'); return }
              setScheduledExportSaving(true)
              setScheduledExportMsg('')
              try {
                const r = await httpFetch('/api/admin/exports/scheduled', { method: 'POST', headers: H, body: JSON.stringify(scheduledExportForm) })
                const d = await r.json()
                if (r.ok) {
                  setScheduledExportMsg('Scheduled export created.')
                  setScheduledExportForm({ name: '', cron_expression: '', format: 'csv', case_type: '', email_to: '', is_active: true })
                  await loadScheduledExports()
                } else { setScheduledExportMsg(d.error || 'Failed to create.') }
              } catch { setScheduledExportMsg('Request failed.') }
              finally { setScheduledExportSaving(false) }
            }}>{scheduledExportSaving ? 'Saving…' : 'Create Schedule'}</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h4 style={{ margin: 0, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>Active Schedules</h4>
            <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 12px' }} disabled={scheduledExportsLoading} onClick={loadScheduledExports}>{scheduledExportsLoading ? 'Loading…' : 'Refresh'}</button>
          </div>
          {scheduledExports.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No scheduled exports configured. Create one above.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Name','Schedule','Format','Case Type','Email To','Active',''].map(h => <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>{h}</th>)}
              </tr></thead>
              <tbody>{scheduledExports.map((cfg, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 500 }}>{cfg.name}</td>
                  <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 12 }}>{cfg.cron_expression}</td>
                  <td style={{ padding: '6px 8px' }}>{cfg.format?.toUpperCase()}</td>
                  <td style={{ padding: '6px 8px' }}>{cfg.case_type || 'All'}</td>
                  <td style={{ padding: '6px 8px', color: 'var(--text-muted)', fontSize: 12 }}>{cfg.email_to || '—'}</td>
                  <td style={{ padding: '6px 8px' }}>{cfg.is_active ? '✓' : '—'}</td>
                  <td style={{ padding: '6px 8px' }}>
                    <button className="btn btn-secondary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={async () => {
                      if (!await confirm('Delete this scheduled export?')) return
                      try {
                        await httpFetch(`/api/admin/exports/scheduled/${cfg.id}`, { method: 'DELETE', headers: H })
                        setScheduledExports(prev => prev.filter((_, idx) => idx !== i))
                      } catch { /* ignore delete failure after local row removal */ }
                    }}>Delete</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
