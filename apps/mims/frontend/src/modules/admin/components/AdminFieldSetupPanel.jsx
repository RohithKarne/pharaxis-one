import { useState, useEffect } from 'react'

function SectionHeader({ title, desc, msg }) {
  return (
    <div className="admin-section-header">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div><h2>{title}</h2>{desc && <p>{desc}</p>}</div>
      </div>
      {msg.text && <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`} style={{ display: 'block', marginTop: 8 }}>{msg.text}</div>}
    </div>
  )
}

const FIELD_SETUP_CATEGORY_DEFS = [
  { name: 'General', sections: ['Contact / Requestor', 'Case Information'] },
  { name: 'MI', sections: ['MI — Category & Product', 'MI — Question Details', 'MI — Response'] },
  { name: 'AE', sections: ['AE — General', 'AE — Events & Seriousness', 'AE — Patient Information', 'AE — Lab Results', 'AE — Lab Notes', 'AE — Medical History', 'AE — Medical Notes', 'AE — Product Information'] },
  { name: 'PC', sections: ['PC — General', 'PC — Patient Information', 'PC — Product Information', 'PC — Return & Retrieval', 'PC — Replacement', 'PC — Refund & Credit'] },
]

export default function AdminFieldSetupPanel({ H }) {
  const [msg, setMsg] = useState({ text: '', type: '' })
  const [fieldSections, setFieldSections] = useState([])
  const [activeFieldSection, setActiveFieldSection] = useState(null)
  const [fieldSetupExpandedCategories, setFieldSetupExpandedCategories] = useState(['General', 'MI', 'AE', 'PC'])
  const [fieldSetupLoading, setFieldSetupLoading] = useState(false)
  const [fieldSetupSaving, setFieldSetupSaving] = useState(false)
  const [showAddFlexField, setShowAddFlexField] = useState(false)
  const [flexFieldForm, setFlexFieldForm] = useState({ name: '', type: 'text', picklist_type: '' })

  function flash(text, type = 'success') {
    setMsg({ text, type })
    setTimeout(() => setMsg({ text: '', type: '' }), 5000)
  }

  useEffect(() => { loadFieldSetup() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadFieldSetup() {
    setFieldSetupLoading(true)
    try {
      const res = await fetch('/api/admin/field-setup', { headers: H })
      const d = await res.json()
      const sections = Object.entries(d.grouped || {}).map(([section, fields]) => ({ section, fields }))
      setFieldSections(sections)
      if (sections.length > 0 && !activeFieldSection) setActiveFieldSection(sections[0].section)
    } catch { /* silent */ } finally { setFieldSetupLoading(false) }
  }

  async function saveFieldSetup() {
    setFieldSetupSaving(true)
    try {
      const allFields = fieldSections.flatMap(s => s.fields)
      const res = await fetch('/api/admin/field-setup', { method: 'PUT', headers: H, body: JSON.stringify({ fields: allFields }) })
      const d = await res.json()
      if (!res.ok) return flash(d.error || 'Save failed.', 'error')
      flash('Field setup saved.')
    } catch { flash('Save failed.', 'error') } finally { setFieldSetupSaving(false) }
  }

  function updateFieldProp(sectionName, fieldId, prop, value) {
    setFieldSections(prev => prev.map(s => {
      if (s.section !== sectionName) return s
      return { ...s, fields: s.fields.map(f => f.id === fieldId ? { ...f, [prop]: value } : f) }
    }))
  }

  async function addFlexField() {
    const flexFieldName = (flexFieldForm.name || '').trim()
    if (!flexFieldName) return flash('Field name required.', 'error')
    if (!activeFieldSection) return flash('Select a field section first.', 'error')
    try {
      const res = await fetch('/api/admin/field-setup/flex', {
        method: 'POST', headers: H,
        body: JSON.stringify({ section_name: activeFieldSection, field_name: flexFieldName, field_type: flexFieldForm.type, picklist_type: (flexFieldForm.picklist_type || '').trim() || null, is_required: 0, sort_order: 999 })
      })
      const d = await res.json()
      if (!res.ok) return flash(d.error || 'Failed to add flex field.', 'error')
      const returnedField = d.field || d.data || d
      if (!returnedField || returnedField.id == null) return flash('Field created but response was invalid.', 'error')
      setFieldSections(prev => prev.map(s => s.section !== activeFieldSection ? s : { ...s, fields: [...s.fields, returnedField] }))
      setFlexFieldForm({ name: '', type: 'text', picklist_type: '' })
      flash('Flex field added.')
      setShowAddFlexField(false)
    } catch { flash('Failed to add flex field.', 'error') }
  }

  async function deleteFlexField(sectionName, fieldId) {
    if (!sectionName) return flash('Select a field section first.', 'error')
    try {
      const res = await fetch(`/api/admin/field-setup/flex/${fieldId}`, { method: 'DELETE', headers: H })
      let d = {}
      try { d = await res.json() } catch { d = {} }
      if (!res.ok) return flash(d.error || 'Failed to remove flex field.', 'error')
      setFieldSections(prev => prev.map(s => s.section !== sectionName ? s : { ...s, fields: s.fields.filter(f => f.id !== fieldId) }))
      flash('Flex field removed.')
    } catch { flash('Failed to remove flex field.', 'error') }
  }

  const activeSec = fieldSections.find(s => s.section === activeFieldSection)
  const fieldSetupSectionsByName = new Set(fieldSections.map(s => s.section))
  const fieldSetupCategories = FIELD_SETUP_CATEGORY_DEFS.map(category => ({
    ...category,
    sections: category.sections.filter(sectionName => fieldSetupSectionsByName.has(sectionName)),
  }))

  return (
    <>
      <SectionHeader title="Field Setup" desc="Configure visibility, requirements, and custom labels for case form fields." msg={msg} />
      {fieldSetupLoading ? (
        <div className="ac-loading">Loading…</div>
      ) : (
        <div className="ac-picklists-shell" style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface)', minHeight: 400 }}>
          <div className="ac-picklists-left">
            <div className="ac-picklists-tree">
              {fieldSetupCategories.map(category => {
                const expanded = fieldSetupExpandedCategories.includes(category.name)
                const hasActive = category.sections.includes(activeFieldSection)
                return (
                  <div key={category.name} className="ac-picklists-tree-group">
                    <button type="button" className={`ac-picklists-tree-category${(expanded || hasActive) ? ' active' : ''}`}
                      onClick={() => setFieldSetupExpandedCategories(prev => prev.includes(category.name) ? prev.filter(name => name !== category.name) : [...prev, category.name])}>
                      <span>{category.name}</span>
                      <span>{expanded ? '▾' : '▸'}</span>
                    </button>
                    {expanded && (
                      <div className="ac-picklists-tree-fields">
                        {category.sections.length === 0 ? (
                          <div className="ac-picklists-tree-empty">No sections</div>
                        ) : category.sections.map(sectionName => (
                          <button key={sectionName} type="button" className={`ac-picklists-tree-field${sectionName === activeFieldSection ? ' active' : ''}`} onClick={() => setActiveFieldSection(sectionName)}>
                            {sectionName}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {fieldSections.length === 0 && <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>No sections configured.</div>}
          </div>

          <div className="ac-picklists-right" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Fields for: <span style={{ color: 'var(--primary)' }}>{activeFieldSection || '—'}</span></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => setShowAddFlexField(v => !v)}>+ Add Flex Field</button>
                <button className="btn btn-primary" style={{ fontSize: 12 }} disabled={fieldSetupSaving} onClick={saveFieldSetup}>{fieldSetupSaving ? 'Saving…' : 'Save Changes'}</button>
              </div>
            </div>

            {showAddFlexField && (
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>Field Name *</label>
                  <input className="form-control" style={{ maxWidth: 180 }} value={flexFieldForm.name} onChange={e => setFlexFieldForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>Type</label>
                  <select className="form-control" style={{ maxWidth: 130 }} value={flexFieldForm.type} onChange={e => setFlexFieldForm(f => ({ ...f, type: e.target.value }))}>
                    <option value="text">Text</option>
                    <option value="dropdown">Dropdown</option>
                    <option value="date">Date</option>
                    <option value="number">Number</option>
                    <option value="textarea">Textarea</option>
                  </select>
                </div>
                {flexFieldForm.type === 'dropdown' && (
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 3 }}>Picklist Type</label>
                    <input className="form-control" style={{ maxWidth: 160 }} placeholder="e.g. Country" value={flexFieldForm.picklist_type} onChange={e => setFlexFieldForm(f => ({ ...f, picklist_type: e.target.value }))} />
                  </div>
                )}
                <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={addFlexField}>Add</button>
                <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => setShowAddFlexField(false)}>Cancel</button>
              </div>
            )}

            <div style={{ flex: 1, overflow: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Field Name</th>
                    <th>Type</th>
                    <th style={{ textAlign: 'center' }}>Required</th>
                    <th style={{ textAlign: 'center' }}>Hidden</th>
                    <th style={{ textAlign: 'center' }}>Disabled</th>
                    <th>Custom Label</th>
                    <th>Help Text</th>
                    <th>Max Length</th>
                    <th>Default Value</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!activeSec || activeSec.fields.length === 0 ? (
                    <tr><td colSpan={10} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No fields in this section.</td></tr>
                  ) : activeSec.fields.map(field => (
                    <tr key={field.id}>
                      <td>
                        <span>{field.field_name}</span>
                        {field.is_flex && <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--accent)', color: '#fff', borderRadius: 3, padding: '1px 5px' }}>Flex</span>}
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{field.field_type || 'text'}</td>
                      <td style={{ textAlign: 'center' }}><input type="checkbox" checked={!!field.is_required} onChange={e => updateFieldProp(activeFieldSection, field.id, 'is_required', e.target.checked ? 1 : 0)} /></td>
                      <td style={{ textAlign: 'center' }}><input type="checkbox" checked={!!field.is_hidden} onChange={e => updateFieldProp(activeFieldSection, field.id, 'is_hidden', e.target.checked ? 1 : 0)} /></td>
                      <td style={{ textAlign: 'center' }}><input type="checkbox" checked={!!field.is_disabled} onChange={e => updateFieldProp(activeFieldSection, field.id, 'is_disabled', e.target.checked ? 1 : 0)} /></td>
                      <td><input className="form-control" style={{ fontSize: 12, padding: '4px 8px' }} placeholder="Custom label…" value={field.custom_label || ''} onChange={e => updateFieldProp(activeFieldSection, field.id, 'custom_label', e.target.value)} /></td>
                      <td><input className="form-control" style={{ fontSize: 12, padding: '4px 8px' }} placeholder="Help text" value={field.help_text || ''} onChange={e => updateFieldProp(activeFieldSection, field.id, 'help_text', e.target.value)} /></td>
                      <td><input type="number" className="form-control" style={{ fontSize: 12, padding: '4px 8px' }} placeholder="Max length" value={field.max_length || ''} onChange={e => updateFieldProp(activeFieldSection, field.id, 'max_length', e.target.value)} /></td>
                      <td><input className="form-control" style={{ fontSize: 12, padding: '4px 8px' }} placeholder="Default value" value={field.default_value || ''} onChange={e => updateFieldProp(activeFieldSection, field.id, 'default_value', e.target.value)} /></td>
                      <td style={{ textAlign: 'center' }}>
                        {field.is_flex ? (
                          <button type="button" className="btn btn-outline" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => deleteFlexField(activeFieldSection, field.id)}>Remove</button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
