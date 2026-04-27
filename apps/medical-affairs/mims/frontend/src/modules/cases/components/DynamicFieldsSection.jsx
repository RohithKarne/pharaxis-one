export default function DynamicFieldsSection({ sections, values, onChange, onSave, saving }) {
  const activeSections = (sections || []).filter(s => Array.isArray(s.fields) && s.fields.length > 0)
  if (activeSections.length === 0) return null

  function renderField(field) {
    const fid = field.id
    const val = values[fid] ?? ''
    const label = field.custom_label || field.field_name
    const set = (v) => onChange(prev => ({ ...prev, [fid]: v }))

    if (field.field_type === 'textarea') {
      return (
        <div key={fid} className="cf-form-field cf-form-field--full">
          <label>{label}{field.is_required ? ' *' : ''}</label>
          <textarea rows={3} value={val} placeholder={field.placeholder_text || ''} onChange={e => set(e.target.value)} />
        </div>
      )
    }
    if (field.field_type === 'number') {
      return (
        <div key={fid} className="cf-form-field">
          <label>{label}{field.is_required ? ' *' : ''}</label>
          <input type="number" value={val} placeholder={field.placeholder_text || ''} onChange={e => set(e.target.value)} />
        </div>
      )
    }
    if (field.field_type === 'date') {
      return (
        <div key={fid} className="cf-form-field">
          <label>{label}{field.is_required ? ' *' : ''}</label>
          <input type="date" value={val} onChange={e => set(e.target.value)} />
        </div>
      )
    }
    if (field.field_type === 'checkbox') {
      return (
        <div key={fid} className="cf-form-field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!val} onChange={e => set(e.target.checked)} />
            {label}{field.is_required ? ' *' : ''}
          </label>
        </div>
      )
    }
    if (field.field_type === 'dropdown') {
      return (
        <div key={fid} className="cf-form-field">
          <label>{label}{field.is_required ? ' *' : ''}</label>
          <select value={val} onChange={e => set(e.target.value)}>
            <option value="">— Select —</option>
            {(Array.isArray(field.options) ? field.options : []).map(o => (
              <option key={o.value} value={o.value}>{o.label || o.value}</option>
            ))}
          </select>
        </div>
      )
    }
    if (field.field_type === 'multi-select') {
      const selected = Array.isArray(val) ? val : (val ? String(val).split(',').filter(Boolean) : [])
      const opts = Array.isArray(field.options) ? field.options : []
      return (
        <div key={fid} className="cf-form-field">
          <label>{label}{field.is_required ? ' *' : ''}</label>
          <div className="cf-multi-select">
            {opts.map(o => (
              <label key={o.value} className="cf-multi-opt">
                <input type="checkbox" checked={selected.includes(String(o.value))}
                  onChange={e => {
                    const next = e.target.checked
                      ? [...selected, String(o.value)]
                      : selected.filter(x => x !== String(o.value))
                    set(next.join(','))
                  }} />
                {o.label || o.value}
              </label>
            ))}
          </div>
        </div>
      )
    }
    return (
      <div key={fid} className="cf-form-field">
        <label>{label}{field.is_required ? ' *' : ''}</label>
        <input type="text" value={val} placeholder={field.placeholder_text || ''} onChange={e => set(e.target.value)} />
      </div>
    )
  }

  return (
    <div className="cf-dyn-fields-section">
      <div className="cf-dyn-fields-title">⚙ Additional Fields (Admin-Configured)</div>
      {activeSections.map(section => (
        <div key={section.section_name} className="cf-dyn-section">
          <div className="cf-dyn-section-label">{section.section_label || section.section_name}</div>
          <div className="cf-form-grid">
            {[...section.fields]
              .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
              .map(f => renderField(f))}
          </div>
        </div>
      ))}
      <div className="cf-form-actions">
        <button className="cf-save-btn" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Additional Fields'}
        </button>
      </div>
    </div>
  )
}
