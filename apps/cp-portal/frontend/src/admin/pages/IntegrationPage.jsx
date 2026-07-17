import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'

// NEW-C: the MIMS intake fields a portal field can map onto, per form type.
// Dot paths address the nested /api/v1/cases payload (see buildMimsPayload).
const MIMS_COMMON_FIELDS = [
  'reporter.first_name', 'reporter.last_name', 'reporter.email', 'reporter.phone',
  'reporter.organisation', 'reporter.reporter_type', 'description', 'priority',
]
const MIMS_TARGETS = {
  medical_inquiry:   [...MIMS_COMMON_FIELDS, 'mi_intake.mi_category', 'mi_intake.question_summary', 'mi_intake.detailed_question'],
  adverse_event:     [...MIMS_COMMON_FIELDS, 'patient.initials', 'patient.age', 'patient.gender',
                      'ae_intake.suspect_drug_name', 'ae_intake.batch_lot_number', 'ae_intake.reaction_description',
                      'ae_intake.reaction_onset_date', 'ae_intake.outcome'],
  product_complaint: [...MIMS_COMMON_FIELDS, 'pc_intake.product_name', 'pc_intake.batch_lot_number',
                      'pc_intake.complaint_category', 'pc_intake.complaint_description'],
}
const FORM_TYPE_LABELS = { medical_inquiry: 'Medical Inquiry', adverse_event: 'Adverse Event', product_complaint: 'Product Complaint' }

// NEW-C: per-integration field-mapping builder — the admin answer to "how do the
// two systems know which field maps to which" (config, not code).
function FieldMappingSection({ clientId, integration }) {
  const [formType, setFormType]   = useState('medical_inquiry')
  const [mappings, setMappings]   = useState([])
  const [portalFields, setPortalFields] = useState({}) // form_type -> [{field_key, field_label}]
  const [row, setRow]             = useState({ cp_field: '', target_field: '', transform: '', default_value: '' })
  const [busy, setBusy]           = useState(false)
  const [msg, setMsg]             = useState('')

  useEffect(() => { loadMappings(); loadPortalFields() }, [clientId, integration.id])

  async function loadMappings() {
    const res = await fetch(`/api/admin/integration/${clientId}/mapping/${integration.id}`, { headers: adminHeaders() })
    const d = await res.json().catch(() => ({}))
    setMappings(d.mappings || [])
  }
  async function loadPortalFields() {
    const res = await fetch(`/api/admin/forms/${clientId}`, { headers: adminHeaders() })
    const d = await res.json().catch(() => ({}))
    setPortalFields(d.forms || d || {})
  }

  async function addMapping(e) {
    e.preventDefault(); setMsg('')
    if (!row.cp_field || !row.target_field) { setMsg('Pick both a portal field and a MIMS field.'); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/integration/${clientId}/mapping`, {
        method: 'POST', headers: adminHeaders(),
        body: JSON.stringify({ integration_id: integration.id, form_type: formType, cp_field: row.cp_field, target_field: row.target_field, transform: row.transform || null, default_value: row.default_value || null }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setMsg(d.error || `Could not save mapping (error ${res.status}).`); return }
      setRow({ cp_field: '', target_field: '', transform: '', default_value: '' })
      setMsg('Mapping saved.')
      loadMappings()
    } catch { setMsg('Network error — please try again.') } finally { setBusy(false) }
  }

  async function removeMapping(id) {
    await fetch(`/api/admin/integration/${clientId}/mapping/${id}`, { method: 'DELETE', headers: adminHeaders() }).catch(() => {})
    loadMappings()
  }

  const typeFields   = Array.isArray(portalFields[formType]) ? portalFields[formType] : []
  const typeMappings = mappings.filter(m => m.form_type === formType)

  return (
    <div className="cp-mapping-section" style={{ marginTop: 14, borderTop: '1px solid var(--border, #e2e8f0)', paddingTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <strong>Field Mapping</strong>
        <select value={formType} onChange={e => setFormType(e.target.value)}>
          {Object.keys(MIMS_TARGETS).map(t => <option key={t} value={t}>{FORM_TYPE_LABELS[t]}</option>)}
        </select>
        <span style={{ fontSize: 12, color: '#64748b' }}>Portal form field → MIMS case field. Mappings override the built-in defaults.</span>
      </div>

      {typeMappings.length > 0 && (
        <table className="cp-table" style={{ marginBottom: 10 }}>
          <thead><tr><th>Portal field</th><th>MIMS field</th><th>Transform</th><th>Default</th><th /></tr></thead>
          <tbody>
            {typeMappings.map(m => (
              <tr key={m.id}>
                <td>{m.cp_field}</td>
                <td>{m.target_field}</td>
                <td>{m.transform || '—'}</td>
                <td>{m.default_value || '—'}</td>
                <td><button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => removeMapping(m.id)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form onSubmit={addMapping} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={row.cp_field} onChange={e => setRow(r => ({ ...r, cp_field: e.target.value }))}>
          <option value="">Portal field…</option>
          {typeFields.map(f => <option key={f.field_key} value={f.field_key}>{f.field_label || f.field_key} ({f.field_key})</option>)}
        </select>
        <span>→</span>
        <select value={row.target_field} onChange={e => setRow(r => ({ ...r, target_field: e.target.value }))}>
          <option value="">MIMS field…</option>
          {MIMS_TARGETS[formType].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={row.transform} onChange={e => setRow(r => ({ ...r, transform: e.target.value }))}>
          <option value="">no transform</option>
          <option value="uppercase">UPPERCASE</option>
          <option value="date_iso">Date → ISO</option>
        </select>
        <input style={{ width: 130 }} placeholder="default value" value={row.default_value} onChange={e => setRow(r => ({ ...r, default_value: e.target.value }))} />
        <button type="submit" className="cp-btn cp-btn-sm cp-btn-primary" disabled={busy}>{busy ? 'Saving…' : '+ Add Mapping'}</button>
      </form>
      {msg && <div style={{ marginTop: 8, fontSize: 13, color: msg === 'Mapping saved.' ? '#16a34a' : '#dc2626' }}>{msg}</div>}
    </div>
  )
}

export default function IntegrationPage() {
  const { clientId }      = useParams()
  const [integrations, setIntegrations] = useState([])
  const [showAdd, setShowAdd]           = useState(false)
  const [form, setForm]                 = useState({ system_name: 'MIMS', api_base_url: '', api_key: '', api_secret: '', auth_type: 'oauth', mims_case_url_base: '' })
  const [saving, setSaving]             = useState(false)
  const [testing, setTesting]           = useState(null)
  const [testResult, setTestResult]     = useState({})
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')

  useEffect(() => { load() }, [clientId])

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/admin/integration/${clientId}`, { headers: adminHeaders() })
    const d   = await res.json()
    setIntegrations(d.integrations || [])
    setLoading(false)
  }

  async function handleAdd(e) {
    e.preventDefault(); setSaving(true); setError('')
    try {
      const res = await fetch(`/api/admin/integration/${clientId}`, { method: 'POST', headers: adminHeaders(), body: JSON.stringify(form) })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || `Could not add integration (error ${res.status}).`); return }
      setShowAdd(false); setForm({ system_name: 'MIMS', api_base_url: '', api_key: '', api_secret: '', auth_type: 'oauth', mims_case_url_base: '' })
      load()
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(id, current) {
    setError('')
    try {
      const res = await fetch(`/api/admin/integration/${clientId}/${id}`, { method: 'PATCH', headers: adminHeaders(), body: JSON.stringify({ is_active: !current }) })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || `Could not update integration (error ${res.status}).`); return }
    } catch {
      setError('Network error — please try again.')
      return
    }
    load()
  }

  async function testConnection(id) {
    setTesting(id)
    const res  = await fetch(`/api/admin/integration/${clientId}/${id}/test`, { method: 'POST', headers: adminHeaders() })
    const data = await res.json()
    setTestResult(r => ({ ...r, [id]: data }))
    setTesting(null)
  }

  return (
    <AdminLayout title="Integration">
      <p className="cp-page-desc">Connect this portal to MIMS or any external case management system. Submissions will auto-sync on receipt.</p>
      <div className="cp-section-header">
        <h2>Configured Integrations</h2>
        <button className="cp-btn cp-btn-primary" onClick={() => setShowAdd(true)}>+ Add Integration</button>
      </div>

      {showAdd && (
        <div className="cp-modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="cp-modal" onClick={e => e.stopPropagation()}>
            <div className="cp-modal-header"><span>Add Integration</span><button className="cp-modal-close" onClick={() => setShowAdd(false)}>✕</button></div>
            <form onSubmit={handleAdd} className="cp-modal-body">
              <div className="cp-field-row">
                <div className="cp-field">
                  <label>System Name</label>
                  <select value={form.system_name} onChange={e => setForm(f => ({ ...f, system_name: e.target.value }))}>
                    <option value="MIMS">MIMS</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div className="cp-field">
                  <label>Auth Type</label>
                  <select value={form.auth_type} onChange={e => setForm(f => ({ ...f, auth_type: e.target.value }))}>
                    <option value="oauth">OAuth Client Credentials (recommended)</option>
                    <option value="bearer">Bearer Token (static)</option>
                    <option value="apikey">API Key Header</option>
                    <option value="basic">Basic Auth</option>
                  </select>
                </div>
              </div>
              <div className="cp-field">
                <label>API Base URL *</label>
                <input required value={form.api_base_url} onChange={e => setForm(f => ({ ...f, api_base_url: e.target.value }))} placeholder="http://localhost:3000" />
              </div>
              <div className="cp-field">
                <label>{form.auth_type === 'oauth' ? 'Client ID' : 'API Key / Token'}</label>
                <input type="password" value={form.api_key} onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))} placeholder={form.auth_type === 'oauth' ? 'MIMS API client ID' : 'Bearer token or API key'} />
              </div>
              {form.auth_type === 'oauth' && (
                <div className="cp-field">
                  <label>Client Secret</label>
                  <input type="password" value={form.api_secret} onChange={e => setForm(f => ({ ...f, api_secret: e.target.value }))} placeholder="MIMS API client secret" />
                </div>
              )}
              <div className="cp-field">
                <label>MIMS Case URL Base</label>
                <input value={form.mims_case_url_base} onChange={e => setForm(f => ({ ...f, mims_case_url_base: e.target.value }))} placeholder="http://mims.example.com/mims/cases/" />
              </div>
              {error && <div className="cp-error" style={{ marginBottom: 10 }}>{error}</div>}
              <div className="cp-modal-footer">
                <button type="submit" className="cp-btn cp-btn-primary" disabled={saving}>{saving ? 'Adding…' : 'Add'}</button>
                <button type="button" className="cp-btn cp-btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {error && !showAdd && <div className="cp-error" style={{ marginBottom: 12 }}>{error}</div>}

      {loading ? <div className="cp-loading">Loading…</div> : integrations.length === 0 ? (
        <div className="cp-empty"><div style={{ fontSize: 40 }}>🔗</div><p>No integrations configured.</p></div>
      ) : (
        <div className="cp-integration-list">
          {integrations.map(i => (
            <div key={i.id} className="cp-integration-card">
              <div className="cp-integration-header">
                <div>
                  <span className="cp-integration-name">{i.system_name}</span>
                  <span className="cp-integration-url">{i.api_base_url}</span>
                </div>
                <span className={`cp-badge ${i.is_active ? 'badge-active' : 'badge-inactive'}`}>{i.is_active ? 'Active' : 'Inactive'}</span>
              </div>
              <div className="cp-integration-meta">Auth: {i.auth_type} · API key: {i.api_key ? '••••••••' : 'not set'}</div>
              <div className="cp-integration-actions">
                <button className="cp-btn cp-btn-sm" onClick={() => testConnection(i.id)} disabled={testing === i.id}>
                  {testing === i.id ? 'Testing…' : '⚡ Test Connection'}
                </button>
                <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => toggleActive(i.id, i.is_active)}>
                  {i.is_active ? 'Disable' : 'Enable'}
                </button>
              </div>
              {testResult[i.id] && (
                <div className={`cp-test-result ${testResult[i.id].success ? 'success' : 'fail'}`}>
                  {testResult[i.id].success ? `✓ Connected (HTTP ${testResult[i.id].status})` : `✗ Failed: ${testResult[i.id].error || `HTTP ${testResult[i.id].status}`}`}
                </div>
              )}
              <FieldMappingSection clientId={clientId} integration={i} />
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  )
}
