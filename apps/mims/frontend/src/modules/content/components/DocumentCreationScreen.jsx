import { useState, useEffect, useRef } from 'react'
import toast from '../../../shared/utils/toast'
import RichTextEditor from './RichTextEditor'
import { normalizeSelectedModules } from './ContentUtils'
import { AssociatedDocsPanel, VersionDiffPanel, VersionAlertsPanel } from './ContentPanels'
import { httpFetch } from '../../../shared/api/httpFetch.js'

function deriveContentMode(document) {
  if (document?.response_doc_type === 'Module') return 'module'
  if (document?.authoring_source === 'microsoft365' || document?.external_document_url || document?.external_share_url) return 'm365'
  if (document?.authoring_source === 'internal' || document?.content_html) return 'online'
  return 'upload'
}

export default function DocumentCreationScreen({ doc, token, onClose, onSaved }) {
  const isEdit = !!doc?.id
  const fileInputRef = useRef(null)
  const attachmentsInputRef = useRef(null)

  const [form, setForm] = useState({
    folder_id: doc?.folder_id || '',
    doc_type: doc?.doc_type || 'SRD',
    name: doc?.name || '',
    response_doc_type: doc?.response_doc_type || 'File',
    standard_response_text: doc?.standard_response_text || '',
    publish_as_pdf: doc?.publish_as_pdf ? true : false,
    send_as_pdf: doc?.send_as_pdf ? true : false,
    selected_modules: normalizeSelectedModules(doc?.selected_modules),
    content_html: doc?.content_html || '',
    expiry_date: doc?.expiry_date ? doc.expiry_date.slice(0, 10) : '',
    activation_date: doc?.activation_date ? doc.activation_date.slice(0, 10) : '',
    expiry_alert_recipients: doc?.expiry_alert_recipients ? (typeof doc.expiry_alert_recipients === 'string' ? JSON.parse(doc.expiry_alert_recipients) : doc.expiry_alert_recipients) : [],
    language: doc?.language || 'en',
    search_tags: doc?.search_tags || '',
    mi_category_id: doc?.mi_category_id || '',
    document_category: doc?.document_category || '',
    version_notes: doc?.version_notes || '',
    review_cycle_days: doc?.review_cycle_days || '',
    regulatory_ref: doc?.regulatory_ref || '',
    custom_attributes: doc?.custom_attributes ? (typeof doc.custom_attributes === 'string' ? JSON.parse(doc.custom_attributes) : doc.custom_attributes) : [],
    bump_type: 'minor',
    is_product_specific: doc?.is_product_specific ? true : false,
    is_site_specific: doc?.is_site_specific ? true : false,
    usage_instructions: doc?.usage_instructions || '',
    authoring_source: doc?.authoring_source || 'upload',
    external_provider: doc?.external_provider || 'microsoft',
    external_document_url: doc?.external_document_url || '',
    external_share_url: doc?.external_share_url || '',
    external_document_id: doc?.external_document_id || '',
    external_drive_id: doc?.external_drive_id || '',
    external_account_email: doc?.external_account_email || '',
    external_api_endpoint: doc?.external_api_endpoint || '',
  })

  const [activeTab, setActiveTab] = useState('general')
  const [contentMode, setContentMode] = useState(() => deriveContentMode(doc))
  const [file, setFile] = useState(null)
  const [sourceAttachments, setSourceAttachments] = useState([])
  const [saving, setSaving] = useState(false)
  const [availableModules, setAvailableModules] = useState([])
  const [modulesLoading, setModulesLoading] = useState(false)
  const [moduleSearch, setModuleSearch] = useState('')
  const [folders, setFolders] = useState([])
  const [miCategories, setMiCategories] = useState([])
  const [docCategories, setDocCategories] = useState([])
  const [microsoftProvider, setMicrosoftProvider] = useState(null)

  useEffect(() => {
    httpFetch('/api/cm/folders', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { folders: [] })
      .then(d => setFolders(d.folders || []))
      .catch(() => setFolders([]))
    httpFetch('/api/admin/mi-categories', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { categories: [] })
      .then(d => setMiCategories((d.categories || []).filter(c => c.is_active)))
      .catch(() => setMiCategories([]))
    httpFetch('/api/cm/picklists?field_type=document_category&active_only=1', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { picklists: [] })
      .then(d => setDocCategories(d.picklists || []))
      .catch(() => setDocCategories([]))
    httpFetch('/api/auth/sso/providers', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : { providers: [] })
      .then(d => {
        const provider = (d.providers || []).find((item) => item.key === 'microsoft') || null
        setMicrosoftProvider(provider)
      })
      .catch(() => setMicrosoftProvider(null))
  }, [token])

  useEffect(() => {
    if (form.response_doc_type === 'Module') {
      let cancelled = false
      ;(async () => {
        setModulesLoading(true)
        try {
          const d = await httpFetch('/api/cm/modules?status=Published&include_expired=false', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
          if (!cancelled) setAvailableModules(d.modules || [])
        } catch {
          if (!cancelled) setAvailableModules([])
        } finally {
          if (!cancelled) setModulesLoading(false)
        }
      })()
      return () => { cancelled = true }
    } else {
      setModuleSearch('')
    }
  }, [form.response_doc_type, token])

  function handleFile(e) {
    const f = e.target.files[0]
    if (f) setFile(f)
  }

  function setFileMode(nextMode) {
    setContentMode(nextMode)
    setForm(prev => ({
      ...prev,
      authoring_source: nextMode === 'm365' ? 'microsoft365' : nextMode === 'online' ? 'internal' : 'upload',
      external_provider: nextMode === 'm365' ? 'microsoft' : prev.external_provider,
    }))
    if (nextMode !== 'upload') setFile(null)
  }

  function handleAttachments(e) {
    const files = Array.from(e.target.files)
    setSourceAttachments(prev => [...prev, ...files])
    e.target.value = ''
  }

  function removeAttachment(idx) {
    setSourceAttachments(prev => prev.filter((_, i) => i !== idx))
  }

  function addModule(moduleId) {
    const targetId = Number(moduleId)
    setForm(p => {
      const existing = normalizeSelectedModules(p.selected_modules)
      if (existing.includes(targetId)) return p
      return { ...p, selected_modules: [...existing, targetId] }
    })
  }

  function removeModule(moduleId) {
    const targetId = Number(moduleId)
    setForm(p => ({
      ...p,
      selected_modules: normalizeSelectedModules(p.selected_modules).filter(id => id !== targetId)
    }))
  }

  function moveModule(moduleId, direction) {
    const targetId = Number(moduleId)
    setForm(p => {
      const arr = normalizeSelectedModules(p.selected_modules)
      const idx = arr.indexOf(targetId)
      if (idx === -1) return p
      const newArr = [...arr]
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= newArr.length) return p
      ;[newArr[idx], newArr[swapIdx]] = [newArr[swapIdx], newArr[idx]]
      return { ...p, selected_modules: newArr }
    })
  }

  async function handleSave(checkIn = false) {
    if (!form.folder_id) return toast.warn('Folder is required.')
    if (!form.name.trim()) return toast.warn('Document name is required.')
    const effectiveAuthoringSource = form.response_doc_type === 'Module'
      ? 'module'
      : contentMode === 'm365'
        ? 'microsoft365'
        : contentMode === 'online'
          ? 'internal'
          : 'upload'

    if (effectiveAuthoringSource === 'microsoft365' && !form.external_document_url.trim() && !form.external_share_url.trim()) {
      return toast.warn('Microsoft 365 authoring requires an edit URL or a share URL.')
    }
    setSaving(true)
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => {
        if (k === 'selected_modules') fd.append(k, JSON.stringify(v))
        else if (v !== null && v !== undefined) fd.append(k, v)
      })
      fd.set('authoring_source', effectiveAuthoringSource)
      fd.set('external_provider', effectiveAuthoringSource === 'microsoft365' ? 'microsoft' : '')
      if (effectiveAuthoringSource !== 'internal') fd.set('content_html', '')
      if (effectiveAuthoringSource !== 'microsoft365') {
        fd.set('external_document_url', '')
        fd.set('external_share_url', '')
        fd.set('external_document_id', '')
        fd.set('external_drive_id', '')
        fd.set('external_account_email', '')
        fd.set('external_api_endpoint', '')
      }
      if (file) fd.append('file', file)
      sourceAttachments.forEach(f => fd.append('source_attachments', f))
      if (checkIn) fd.append('check_in', '1')
      const url = isEdit ? `/api/cm/documents/${doc.id}` : '/api/cm/documents'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await httpFetch(url, { method, headers: { Authorization: `Bearer ${token}` }, body: fd })
      if (res.ok) {
        const data = await res.json()
        if (checkIn) {
          const docId = isEdit ? doc.id : data.id
          const ciRes = await httpFetch(`/api/cm/documents/${docId}/checkin`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: 'Checked in on creation' }),
          })
          if (!ciRes.ok) {
            const ciErr = await ciRes.json()
            toast.error(`Saved but check-in failed: ${ciErr.error || 'Unknown error'}`)
          }
        }
        onSaved(); onClose()
      }
      else { const d = await res.json(); toast.error(d.error || 'Save failed.') }
    } catch { toast.error('Network error.') }
    setSaving(false)
  }

  function openMicrosoftLink() {
    const targetUrl = form.external_document_url || form.external_share_url
    if (!targetUrl) return
    window.open(targetUrl, '_blank', 'noopener,noreferrer')
  }

  const TABS = [
    { key: 'general', label: 'General Attributes' },
    { key: 'other', label: 'Other Attributes' },
    { key: 'associated', label: 'Associated Documents' },
    { key: 'usage', label: 'Usage Instructions' },
    { key: 'versions', label: 'Version Alerts' },
  ]

  return (
    <div style={{ position: 'fixed', top: 86, left: 0, right: 0, bottom: 0, zIndex: 500, background: 'var(--surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 28px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
          {isEdit ? `Edit Document — ${doc.name}` : 'New Document'}
        </h2>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--text-secondary)', lineHeight: 1 }}>×</button>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>

        {/* ── Row 1 — Basic Info ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr 1fr', gap: 16, marginBottom: 24, alignItems: 'end' }}>
          <div className="cm-form-group" style={{ margin: 0 }}>
            <label className="cm-form-label">Folder <span style={{ color: 'var(--danger)' }}>*</span></label>
            <select className="cm-form-select" value={form.folder_id} onChange={e => setForm(p => ({ ...p, folder_id: e.target.value }))}>
              <option value="">— Select Folder —</option>
              {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div className="cm-form-group" style={{ margin: 0 }}>
            <label className="cm-form-label">Document Type <span style={{ color: 'var(--danger)' }}>*</span></label>
            <select className="cm-form-select" value={form.doc_type} onChange={e => setForm(p => ({ ...p, doc_type: e.target.value }))}>
              <option>SRD</option>
              <option>Enclosure</option>
              <option>Information Document</option>
              <option>Internal Document</option>
            </select>
          </div>
          <div className="cm-form-group" style={{ margin: 0 }}>
            <label className="cm-form-label">Document Name <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input className="cm-form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Enter document name" />
          </div>
          <div className="cm-form-group" style={{ margin: 0 }}>
            <label className="cm-form-label">Document ID</label>
            <input className="cm-form-input" value={isEdit ? doc.doc_id || '—' : 'Auto'} readOnly style={{ background: 'var(--bg)', color: 'var(--text-muted)', cursor: 'default' }} />
          </div>
        </div>

        {/* ── Tab Bar ── */}
        <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', marginBottom: 20, gap: 0 }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '9px 18px', background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: activeTab === tab.key ? 700 : 500,
                color: activeTab === tab.key ? 'var(--primary)' : 'var(--text-secondary)',
                borderBottom: activeTab === tab.key ? '2px solid var(--primary)' : '2px solid transparent',
                marginBottom: -2, transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── General Attributes Tab ── */}
        {activeTab === 'general' && (
          <div style={{ maxWidth: 1000 }}>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>

              <div className="cm-form-group" style={{ margin: 0, minWidth: 160 }}>
                <label className="cm-form-label">Response Doc Type</label>
                <select
                  className="cm-form-select"
                  value={form.response_doc_type}
                  onChange={e => setForm(p => ({ ...p, response_doc_type: e.target.value, selected_modules: [] }))}
                >
                  <option value="File">File</option>
                  <option value="Module">Module</option>
                </select>
              </div>

              {form.response_doc_type === 'File' && (
                <div style={{ display: 'flex', gap: 6, paddingTop: 20 }}>
                  <div
                    onClick={() => { setFileMode('upload'); fileInputRef.current?.click() }}
                    title="Upload File"
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      width: 54, height: 50, border: `2px dashed ${contentMode === 'upload' ? 'var(--primary)' : 'var(--border)'}`,
                      borderRadius: 6, cursor: 'pointer', background: contentMode === 'upload' ? 'var(--primary-light, #eef2ff)' : 'var(--bg)',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ fontSize: 16 }}>📎</span>
                    <span style={{ fontSize: 9, marginTop: 2, color: 'var(--text-secondary)', fontWeight: 500 }}>Upload</span>
                  </div>
                  <div
                    onClick={() => setFileMode('online')}
                    title="Author Inside MIMS"
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      width: 54, height: 50, border: `2px dashed ${contentMode === 'online' ? 'var(--primary)' : 'var(--border)'}`,
                      borderRadius: 6, cursor: 'pointer', background: contentMode === 'online' ? 'var(--primary-light, #eef2ff)' : 'var(--bg)',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ fontSize: 16 }}>✏️</span>
                    <span style={{ fontSize: 9, marginTop: 2, color: 'var(--text-secondary)', fontWeight: 500 }}>Internal</span>
                  </div>
                  <div
                    onClick={() => setFileMode('m365')}
                    title="Author with Microsoft 365"
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      width: 64, height: 50, border: `2px dashed ${contentMode === 'm365' ? 'var(--primary)' : 'var(--border)'}`,
                      borderRadius: 6, cursor: 'pointer', background: contentMode === 'm365' ? 'var(--primary-light, #eef2ff)' : 'var(--bg)',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ fontSize: 16 }}>Ⓜ</span>
                    <span style={{ fontSize: 9, marginTop: 2, color: 'var(--text-secondary)', fontWeight: 500 }}>M365</span>
                  </div>
                  <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt" style={{ display: 'none' }} onChange={handleFile} />
                </div>
              )}

              {form.response_doc_type === 'File' && file && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', fontSize: 12, marginTop: 20 }}>
                  <span>📄</span><span>{file.name}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{(file.size / 1024).toFixed(0)} KB</span>
                  <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 14 }} onClick={() => setFile(null)}>×</button>
                </div>
              )}

              <div className="cm-form-group" style={{ margin: 0, flex: 1, minWidth: 200 }}>
                <label className="cm-form-label">Standard Response / Cover Letter</label>
                <textarea
                  className="cm-form-input"
                  rows={3}
                  value={form.standard_response_text}
                  onChange={e => setForm(p => ({ ...p, standard_response_text: e.target.value }))}
                  placeholder="Enter standard response or cover letter text…"
                  style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 12 }}
                />
              </div>

              <div className="cm-form-group" style={{ margin: 0, minWidth: 180 }}>
                <label className="cm-form-label">MI Category</label>
                <select className="cm-form-select" value={form.mi_category_id} onChange={e => setForm(p => ({ ...p, mi_category_id: e.target.value }))}>
                  <option value="">— Select —</option>
                  {miCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {miCategories.length === 0 && (
                  <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>Configure in Admin Console.</p>
                )}
              </div>
            </div>

            {form.response_doc_type === 'File' && contentMode === 'online' && (
              <div style={{ marginBottom: 16 }}>
                <RichTextEditor value={form.content_html} onChange={v => setForm(p => ({ ...p, content_html: v }))} placeholder="Write document content here…" />
              </div>
            )}

            {form.response_doc_type === 'File' && contentMode === 'm365' && (
              <div style={{ marginBottom: 16, border: '1px solid var(--border)', borderRadius: 10, padding: 16, background: 'var(--bg-subtle, #f8fafc)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Microsoft 365 Linked Authoring</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, maxWidth: 620 }}>
                      Keep the editable source document in OneDrive or SharePoint, and store the authoring link here.
                      MIMS will preserve workflow, approvals, metadata, and audit context around that Microsoft document.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <a
                      href="https://www.office.com/"
                      target="_blank"
                      rel="noreferrer"
                      className="cm-btn cm-btn-secondary"
                      style={{ textDecoration: 'none' }}
                    >
                      Open Office 365
                    </a>
                    <button
                      type="button"
                      className="cm-btn cm-btn-primary"
                      onClick={openMicrosoftLink}
                      disabled={!form.external_document_url && !form.external_share_url}
                    >
                      Open Linked Document
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 12 }}>
                  <div className="cm-form-group" style={{ margin: 0 }}>
                    <label className="cm-form-label">Microsoft 365 Edit URL <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <input
                      className="cm-form-input"
                      value={form.external_document_url}
                      onChange={e => setForm(p => ({ ...p, external_document_url: e.target.value }))}
                      placeholder="https://tenant.sharepoint.com/... or https://1drv.ms/..."
                    />
                  </div>
                  <div className="cm-form-group" style={{ margin: 0 }}>
                    <label className="cm-form-label">Share / View URL</label>
                    <input
                      className="cm-form-input"
                      value={form.external_share_url}
                      onChange={e => setForm(p => ({ ...p, external_share_url: e.target.value }))}
                      placeholder="Optional read-only or shared view link"
                    />
                  </div>
                  <div className="cm-form-group" style={{ margin: 0 }}>
                    <label className="cm-form-label">Document ID</label>
                    <input
                      className="cm-form-input"
                      value={form.external_document_id}
                      onChange={e => setForm(p => ({ ...p, external_document_id: e.target.value }))}
                      placeholder="Optional Microsoft document identifier"
                    />
                  </div>
                  <div className="cm-form-group" style={{ margin: 0 }}>
                    <label className="cm-form-label">Drive / Library ID</label>
                    <input
                      className="cm-form-input"
                      value={form.external_drive_id}
                      onChange={e => setForm(p => ({ ...p, external_drive_id: e.target.value }))}
                      placeholder="Optional OneDrive or SharePoint drive id"
                    />
                  </div>
                  <div className="cm-form-group" style={{ margin: 0 }}>
                    <label className="cm-form-label">Linked Microsoft Account Email</label>
                    <input
                      className="cm-form-input"
                      value={form.external_account_email}
                      onChange={e => setForm(p => ({ ...p, external_account_email: e.target.value }))}
                      placeholder="name@company.com"
                    />
                  </div>
                  <div className="cm-form-group" style={{ margin: 0 }}>
                    <label className="cm-form-label">Microsoft API Endpoint</label>
                    <input
                      className="cm-form-input"
                      value={form.external_api_endpoint}
                      onChange={e => setForm(p => ({ ...p, external_api_endpoint: e.target.value }))}
                      placeholder="Optional Graph endpoint or SharePoint item API URL"
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {microsoftProvider
                      ? 'Microsoft SSO is configured in this environment. Users should link or sign in with Microsoft before working on these documents.'
                      : 'Microsoft SSO is not configured in this environment yet. You can still save links now and enable SSO later.'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Source: {form.external_provider || 'microsoft'}
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 20, marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                <input type="checkbox" checked={form.publish_as_pdf} onChange={e => setForm(p => ({ ...p, publish_as_pdf: e.target.checked }))} />
                Publish as PDF
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                <input type="checkbox" checked={form.send_as_pdf} onChange={e => setForm(p => ({ ...p, send_as_pdf: e.target.checked }))} />
                Send as PDF
              </label>
            </div>

            {form.response_doc_type === 'Module' && (() => {
              const selectedIds = normalizeSelectedModules(form.selected_modules)
              const selectedModules = selectedIds.map(id => availableModules.find(m => Number(m.id) === id)).filter(Boolean)
              const unselectedModules = availableModules.filter(m => !selectedIds.includes(Number(m.id)))
              const filtered = unselectedModules.filter(m => {
                if (!moduleSearch.trim()) return true
                const q = moduleSearch.trim().toLowerCase()
                return (
                  String(m.name || '').toLowerCase().includes(q) ||
                  String(m.module_id || '').toLowerCase().includes(q) ||
                  String(m.folder_name || '').toLowerCase().includes(q) ||
                  String(m.search_tags || '').toLowerCase().includes(q)
                )
              })
              return (
                <div style={{ marginBottom: 16 }}>
                  <label className="cm-form-label">Module Sequence</label>

                  {selectedModules.length > 0 && (
                    <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
                      <div style={{ padding: '6px 12px', background: 'var(--bg-subtle, #f8f9fa)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Selected — {selectedModules.length} module{selectedModules.length !== 1 ? 's' : ''} in order
                      </div>
                      {selectedModules.map((m, idx) => (
                        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: idx < selectedModules.length - 1 ? '1px solid var(--border)' : 'none', background: 'var(--primary-light, #eef2ff)' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', minWidth: 20, textAlign: 'center' }}>{idx + 1}</span>
                          <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
                            {m.name}
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>{m.module_id || `MOD-${m.id}`}</span>
                          </span>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.folder_name || '—'}</span>
                          <div style={{ display: 'flex', gap: 2 }}>
                            <button type="button" onClick={() => moveModule(m.id, 'up')} disabled={idx === 0} style={{ padding: '2px 6px', fontSize: 12, cursor: idx === 0 ? 'not-allowed' : 'pointer', opacity: idx === 0 ? 0.35 : 1, border: '1px solid var(--border)', borderRadius: 4, background: 'white' }} title="Move up">↑</button>
                            <button type="button" onClick={() => moveModule(m.id, 'down')} disabled={idx === selectedModules.length - 1} style={{ padding: '2px 6px', fontSize: 12, cursor: idx === selectedModules.length - 1 ? 'not-allowed' : 'pointer', opacity: idx === selectedModules.length - 1 ? 0.35 : 1, border: '1px solid var(--border)', borderRadius: 4, background: 'white' }} title="Move down">↓</button>
                            <button type="button" onClick={() => removeModule(m.id)} style={{ padding: '2px 6px', fontSize: 12, cursor: 'pointer', border: '1px solid #fca5a5', borderRadius: 4, background: '#fff5f5', color: '#dc2626' }} title="Remove">✕</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <input
                    className="cm-form-input"
                    placeholder="Search published modules to add…"
                    value={moduleSearch}
                    onChange={e => setModuleSearch(e.target.value)}
                    style={{ marginBottom: 8 }}
                  />
                  {modulesLoading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading modules…</p>}
                  {!modulesLoading && availableModules.length === 0 && (
                    <div style={{ padding: 20, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 8, color: 'var(--text-muted)', fontSize: 13 }}>
                      No published modules available. Create and publish modules in the Modular Documents tab first.
                    </div>
                  )}
                  {!modulesLoading && availableModules.length > 0 && unselectedModules.length === 0 && !moduleSearch && (
                    <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 8, textAlign: 'center' }}>
                      All available modules have been added.
                    </div>
                  )}
                  {!modulesLoading && filtered.length > 0 && (
                    <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                      <div style={{ padding: '6px 12px', background: 'var(--bg-subtle, #f8f9fa)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Available modules
                      </div>
                      {filtered.map((m, idx) => (
                        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderBottom: idx < filtered.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
                            {m.name}
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>{m.module_id || `MOD-${m.id}`}</span>
                          </span>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.folder_name || '—'}</span>
                          <button type="button" onClick={() => addModule(m.id)} style={{ padding: '3px 10px', fontSize: 12, cursor: 'pointer', border: '1px solid var(--primary, #4f46e5)', borderRadius: 4, background: 'white', color: 'var(--primary, #4f46e5)', fontWeight: 600 }}>+ Add</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {!modulesLoading && moduleSearch && filtered.length === 0 && (
                    <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 8, textAlign: 'center' }}>
                      No modules match your search.
                    </div>
                  )}
                </div>
              )
            })()}

            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div className="cm-form-group" style={{ margin: 0 }}>
                <label className="cm-form-label">Search Tags</label>
                <input
                  className="cm-form-input"
                  value={form.search_tags}
                  onChange={e => setForm(p => ({ ...p, search_tags: e.target.value }))}
                  placeholder="safety, dosing, paediatric…"
                />
              </div>
              <div className="cm-form-group" style={{ margin: 0 }}>
                <label className="cm-form-label">Document Category</label>
                <select className="cm-form-select" value={form.document_category} onChange={e => setForm(p => ({ ...p, document_category: e.target.value }))}>
                  <option value="">— Select —</option>
                  {docCategories.length > 0
                    ? docCategories.map(c => <option key={c.id} value={c.value}>{c.label || c.value}</option>)
                    : ['Clinical', 'Regulatory', 'Safety', 'Scientific', 'Patient Information', 'Internal'].map(v => <option key={v} value={v}>{v}</option>)
                  }
                </select>
              </div>
              <div className="cm-form-group" style={{ margin: 0 }}>
                <label className="cm-form-label">Activation Date</label>
                <input type="date" className="cm-form-input" value={form.activation_date} onChange={e => setForm(p => ({ ...p, activation_date: e.target.value }))} />
              </div>
              <div className="cm-form-group" style={{ margin: 0 }}>
                <label className="cm-form-label">Expiry Date</label>
                <input type="date" className="cm-form-input" value={form.expiry_date} onChange={e => setForm(p => ({ ...p, expiry_date: e.target.value }))} />
              </div>
            </div>

            {form.expiry_date && (
              <div className="cm-form-group" style={{ marginBottom: 12 }}>
                <label className="cm-form-label">Additional Expiry Alert Recipients</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', minHeight: 38 }}>
                  {(form.expiry_alert_recipients || []).map((email, i) => (
                    <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--primary-light, #eef2ff)', color: 'var(--primary)', padding: '2px 8px', borderRadius: 12, fontSize: 12 }}>
                      {email}
                      <button type="button" onClick={() => setForm(p => ({ ...p, expiry_alert_recipients: p.expiry_alert_recipients.filter((_, j) => j !== i) }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', padding: 0, lineHeight: 1 }}>✕</button>
                    </span>
                  ))}
                  <input
                    className="cm-form-input"
                    style={{ flex: 1, minWidth: 180, border: 'none', background: 'transparent', padding: '2px 4px' }}
                    placeholder="Add email and press Enter or comma…"
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault()
                        const val = e.target.value.trim().replace(/,$/, '')
                        if (val && val.includes('@')) {
                          setForm(p => ({ ...p, expiry_alert_recipients: [...(p.expiry_alert_recipients || []), val] }))
                          e.target.value = ''
                        }
                      }
                    }}
                  />
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>These recipients will receive 30/60/90-day pre-expiry reminder notifications.</span>
              </div>
            )}

            <div className="cm-form-group" style={{ marginBottom: 8 }}>
              <label className="cm-form-label">Source Attachments</label>
              <div
                onClick={() => attachmentsInputRef.current?.click()}
                style={{
                  border: '2px dashed var(--border)', borderRadius: 8, padding: '16px 20px', cursor: 'pointer',
                  background: 'var(--bg)', display: 'flex', alignItems: 'center', gap: 12,
                  color: 'var(--text-secondary)', fontSize: 13, marginBottom: 10,
                  transition: 'border-color 0.15s',
                }}
              >
                <span style={{ fontSize: 20 }}>📁</span>
                <span>Click to attach source files <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>(multiple allowed — PDF, DOC, DOCX, XLS, XLSX, TXT)</span></span>
              </div>
              <input
                ref={attachmentsInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
                style={{ display: 'none' }}
                onChange={handleAttachments}
              />
              {sourceAttachments.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {sourceAttachments.map((f, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', fontSize: 13 }}>
                      <span>📄</span>
                      <span style={{ flex: 1 }}>{f.name}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{(f.size / 1024).toFixed(0)} KB</span>
                      <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 16 }} onClick={() => removeAttachment(idx)}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* ── Other Attributes Tab ── */}
        {activeTab === 'other' && (
          <div style={{ padding: '4px 0', maxWidth: 800 }}>
            {doc && doc.owner_user_id && (
              <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: '10px 16px', marginBottom: 20, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🔒</span>
                <span>This document is <strong>locked</strong> to its owner. Only the owner can publish or release it.</span>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              {doc && doc.version_major > 1 && (
                <div className="cm-form-group">
                  <label className="cm-form-label">Version Bump *</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['minor', 'major'].map(bt => (
                      <label key={bt} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', border: `1px solid ${form.bump_type === bt ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 6, cursor: 'pointer', fontSize: 13, background: form.bump_type === bt ? 'var(--primary-light, #f0ebff)' : 'var(--surface)' }}>
                        <input type="radio" name="bump_type" value={bt} checked={form.bump_type === bt} onChange={() => setForm(p => ({ ...p, bump_type: bt }))} style={{ margin: 0 }} />
                        {bt === 'minor' ? 'Minor (1.x)' : 'Major (x.0)'}
                      </label>
                    ))}
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>Minor = small update, Major = significant new version</p>
                </div>
              )}

              <div className="cm-form-group">
                <label className="cm-form-label">Version Notes</label>
                <input className="cm-form-input" value={form.version_notes || ''} onChange={e => setForm(p => ({ ...p, version_notes: e.target.value }))} placeholder="What changed in this version?" />
              </div>

              <div className="cm-form-group">
                <label className="cm-form-label">Review Cycle</label>
                <select className="cm-form-select" value={form.review_cycle_days || ''} onChange={e => setForm(p => ({ ...p, review_cycle_days: e.target.value }))}>
                  <option value="">— Select —</option>
                  {[30, 60, 90, 180, 365].map(d => <option key={d} value={d}>{d} days</option>)}
                </select>
              </div>

              <div className="cm-form-group">
                <label className="cm-form-label">Regulatory Reference #</label>
                <input className="cm-form-input" value={form.regulatory_ref || ''} onChange={e => setForm(p => ({ ...p, regulatory_ref: e.target.value }))} placeholder="e.g. EMA/2024/001" />
              </div>
            </div>

            <div className="cm-form-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label className="cm-form-label" style={{ margin: 0 }}>Custom Attributes</label>
                <button type="button" onClick={() => setForm(p => ({ ...p, custom_attributes: [...(p.custom_attributes || []), { key: '', value: '' }] }))}
                  style={{ fontSize: 12, padding: '3px 10px', border: '1px solid var(--border)', borderRadius: 4, background: 'none', cursor: 'pointer', color: 'var(--primary)' }}>
                  + Add Attribute
                </button>
              </div>
              {(form.custom_attributes || []).length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>No custom attributes. Click "+ Add Attribute" to add org-specific metadata.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(form.custom_attributes || []).map((attr, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 32px', gap: 8, alignItems: 'center' }}>
                      <input className="cm-form-input" style={{ margin: 0 }} placeholder="Key" value={attr.key} onChange={e => setForm(p => { const a = [...p.custom_attributes]; a[idx] = { ...a[idx], key: e.target.value }; return { ...p, custom_attributes: a }; })} />
                      <input className="cm-form-input" style={{ margin: 0 }} placeholder="Value" value={attr.value} onChange={e => setForm(p => { const a = [...p.custom_attributes]; a[idx] = { ...a[idx], value: e.target.value }; return { ...p, custom_attributes: a }; })} />
                      <button type="button" onClick={() => setForm(p => ({ ...p, custom_attributes: p.custom_attributes.filter((_, i) => i !== idx) }))}
                        style={{ background: 'none', border: '1px solid #fca5a5', borderRadius: 4, color: 'var(--danger)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 6px' }}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Associated Documents Tab ── */}
        {activeTab === 'associated' && doc && (
          <AssociatedDocsPanel docId={doc.id} token={token} />
        )}
        {activeTab === 'associated' && !doc && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
            Save the document first to link associated documents.
          </div>
        )}

        {/* ── Usage Instructions Tab ── */}
        {activeTab === 'usage' && (
          <div style={{ padding: '4px 0', maxWidth: 800 }}>
            <div className="cm-form-group">
              <label className="cm-form-label">Usage Instructions</label>
              <RichTextEditor value={form.usage_instructions || ''} onChange={v => setForm(p => ({ ...p, usage_instructions: v }))} placeholder="How to use this document — intended audience, approved use cases, what NOT to do..." />
            </div>
          </div>
        )}

        {/* ── Version Alerts Tab ── */}
        {activeTab === 'versions' && doc && (
          <>
            <VersionDiffPanel docId={doc.id} token={token} />
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 24, paddingTop: 24 }}>
              <VersionAlertsPanel docId={doc.id} token={token} />
            </div>
          </>
        )}
        {activeTab === 'versions' && !doc && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
            Save the document first to configure version alerts.
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 28px', borderTop: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
        <button className="cm-btn cm-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="cm-btn cm-btn-secondary" onClick={() => handleSave(false)} disabled={saving}>{saving ? 'Saving…' : 'Save Draft'}</button>
        <button className="cm-btn cm-btn-primary" onClick={() => handleSave(true)} disabled={saving}>{saving ? 'Saving…' : 'Save & Check-In'}</button>
      </div>
    </div>
  )
}
