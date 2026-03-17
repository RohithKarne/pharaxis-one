import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'

const FORM_TYPES = ['medical_inquiry', 'adverse_event', 'product_complaint', 'other_inquiry']
const FIELD_TYPES = ['text', 'textarea', 'email', 'phone', 'number', 'date', 'select', 'multiselect', 'radio', 'checkbox', 'file', 'hidden']

function parseOptions(opts) {
  if (!opts) return []
  if (Array.isArray(opts)) return opts
  try { return JSON.parse(opts) } catch { return [] }
}

export default function FormsPage() {
  const { clientId }    = useParams()
  const [formType, setFormType] = useState('medical_inquiry')
  const [fields, setFields]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [showAdd, setShowAdd]   = useState(false)
  const [newField, setNewField] = useState({ field_key: '', field_label: '', field_type: 'text', is_required: false, placeholder: '', help_text: '' })
  const [saving, setSaving]     = useState(false)
  const [optionsInput, setOptionsInput] = useState('')

  useEffect(() => { loadFields() }, [clientId, formType])

  async function loadFields() {
    setLoading(true)
    const res = await fetch(`/api/admin/forms/${clientId}/${formType}`, { headers: adminHeaders() })
    const d   = await res.json()
    setFields(d.fields || [])
    setLoading(false)
  }

  async function toggleField(fieldId, current) {
    await fetch(`/api/admin/forms/${clientId}/${fieldId}`, {
      method: 'PATCH', headers: adminHeaders(), body: JSON.stringify({ is_active: !current }),
    })
    loadFields()
  }

  async function toggleRequired(fieldId, current) {
    await fetch(`/api/admin/forms/${clientId}/${fieldId}`, {
      method: 'PATCH', headers: adminHeaders(), body: JSON.stringify({ is_required: !current }),
    })
    loadFields()
  }

  async function saveFieldInline(fieldId, field, value) {
    await fetch(`/api/admin/forms/${clientId}/${fieldId}`, {
      method: 'PATCH', headers: adminHeaders(), body: JSON.stringify({ [field]: value }),
    })
  }

  async function handleAdd(e) {
    e.preventDefault(); setSaving(true)
    const options = optionsInput.split('\n').map(s => s.trim()).filter(Boolean)
    const payload = { ...newField, form_type: formType, field_options: options.length ? JSON.stringify(options) : undefined }
    await fetch(`/api/admin/forms/${clientId}`, { method: 'POST', headers: adminHeaders(), body: JSON.stringify(payload) })
    setSaving(false); setShowAdd(false)
    setNewField({ field_key: '', field_label: '', field_type: 'text', is_required: false, placeholder: '', help_text: '' })
    setOptionsInput('')
    loadFields()
  }

  return (
    <AdminLayout title="Form Configuration">
      <div className="cp-tabs">
        {FORM_TYPES.map(t => (
          <button key={t} className={`cp-tab ${formType === t ? 'active' : ''}`} onClick={() => setFormType(t)}>
            {t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </button>
        ))}
      </div>

      <div className="cp-section-header">
        <h3>{formType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} Fields</h3>
        <button className="cp-btn cp-btn-primary" onClick={() => setShowAdd(true)}>+ Add Field</button>
      </div>

      {showAdd && (
        <div className="cp-modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="cp-modal" onClick={e => e.stopPropagation()}>
            <div className="cp-modal-header"><span>Add Field</span><button className="cp-modal-close" onClick={() => setShowAdd(false)}>✕</button></div>
            <form onSubmit={handleAdd} className="cp-modal-body">
              <div className="cp-field-row">
                <div className="cp-field">
                  <label>Field Key <span className="cp-required" aria-hidden="true">*</span></label>
                  <input required value={newField.field_key} onChange={e => setNewField(f => ({ ...f, field_key: e.target.value.toLowerCase().replace(/\s/g, '_') }))} placeholder="e.g. patient_age" />
                </div>
                <div className="cp-field">
                  <label>Field Label <span className="cp-required" aria-hidden="true">*</span></label>
                  <input required value={newField.field_label} onChange={e => setNewField(f => ({ ...f, field_label: e.target.value }))} placeholder="e.g. Patient Age" />
                </div>
              </div>
              <div className="cp-field-row">
                <div className="cp-field">
                  <label>Field Type <span className="cp-required" aria-hidden="true">*</span></label>
                  <select value={newField.field_type} onChange={e => setNewField(f => ({ ...f, field_type: e.target.value }))}>
                    {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="cp-field cp-field-checkbox" style={{ alignSelf: 'flex-end', paddingBottom: 8 }}>
                  <input type="checkbox" id="req" checked={newField.is_required} onChange={e => setNewField(f => ({ ...f, is_required: e.target.checked }))} />
                  <label htmlFor="req">Required</label>
                </div>
              </div>
              {(newField.field_type === 'select' || newField.field_type === 'multiselect' || newField.field_type === 'radio') && (
                <div className="cp-field">
                  <label>Options (one per line)</label>
                  <textarea rows={4} value={optionsInput} onChange={e => setOptionsInput(e.target.value)} placeholder={"Option A\nOption B\nOption C"} />
                </div>
              )}
              <div className="cp-field-row">
                <div className="cp-field">
                  <label>Placeholder</label>
                  <input value={newField.placeholder} onChange={e => setNewField(f => ({ ...f, placeholder: e.target.value }))} />
                </div>
                <div className="cp-field">
                  <label>Help Text</label>
                  <input value={newField.help_text} onChange={e => setNewField(f => ({ ...f, help_text: e.target.value }))} />
                </div>
              </div>
              <div className="cp-modal-footer">
                <button type="submit" className="cp-btn cp-btn-primary" disabled={saving}>{saving ? 'Adding…' : 'Add Field'}</button>
                <button type="button" className="cp-btn cp-btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? <div className="cp-loading">Loading…</div> : (
        <table className="cp-table">
          <thead><tr><th>Order</th><th>Key</th><th>Label</th><th>Placeholder</th><th>Type</th><th>Required</th><th>Active</th></tr></thead>
          <tbody>
            {fields.map(f => (
              <tr key={`${f.id}-${f.field_label}-${f.placeholder || ''}`} className={!f.is_active ? 'row-inactive' : ''}>
                <td>{f.display_order}</td>
                <td><code>{f.field_key}</code></td>
                <td>
                  <input
                    className="cp-inline-edit"
                    defaultValue={f.field_label}
                    onBlur={e => { if (e.target.value !== f.field_label) saveFieldInline(f.id, 'field_label', e.target.value) }}
                  />
                </td>
                <td>
                  <input
                    className="cp-inline-edit cp-inline-edit-muted"
                    defaultValue={f.placeholder || ''}
                    placeholder="—"
                    onBlur={e => { if (e.target.value !== (f.placeholder || '')) saveFieldInline(f.id, 'placeholder', e.target.value) }}
                  />
                </td>
                <td>
                  <span className="cp-type-badge">{f.field_type}</span>
                  {(f.field_type === 'select' || f.field_type === 'multiselect' || f.field_type === 'radio') && parseOptions(f.field_options).length > 0 && (
                    <span className="cp-options-hint" title={parseOptions(f.field_options).join(', ')} style={{ marginLeft: 4, fontSize: 11, color: 'var(--cp-text-muted)' }}>
                      ({parseOptions(f.field_options).length} opts)
                    </span>
                  )}
                </td>
                <td>
                  <label className="cp-toggle-switch cp-toggle-sm">
                    <input type="checkbox" aria-label={`Toggle required for ${f.field_label}`} checked={!!f.is_required} onChange={() => toggleRequired(f.id, f.is_required)} />
                    <span className="cp-toggle-slider" />
                  </label>
                </td>
                <td>
                  <label className="cp-toggle-switch cp-toggle-sm">
                    <input type="checkbox" aria-label={`Toggle active for ${f.field_label}`} checked={!!f.is_active} onChange={() => toggleField(f.id, f.is_active)} />
                    <span className="cp-toggle-slider" />
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminLayout>
  )
}
