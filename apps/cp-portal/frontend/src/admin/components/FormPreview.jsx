/**
 * FormPreview — read-only render of a configured portal form, so admins can see
 * exactly what HCPs/patients will see before publishing. Renders the active,
 * non-hidden fields in order with their labels, types, required markers, options,
 * and help text. All inputs are disabled — this is a preview, not a working form.
 */

function parseOptions(opts) {
  if (!opts) return []
  if (Array.isArray(opts)) return opts
  try { return JSON.parse(opts) } catch { return [] }
}

function PreviewField({ field, options }) {
  const common = { disabled: true, placeholder: field.placeholder || '', style: { width: '100%', padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: 6, background: '#F9FAFB', fontSize: 13 } }
  switch (field.field_type) {
    case 'textarea':
      return <textarea {...common} rows={3} />
    case 'select':
      return <select {...common}><option>{field.placeholder || 'Select…'}</option>{options.map((o, i) => <option key={i}>{o}</option>)}</select>
    case 'multiselect':
      return <select {...common} multiple>{options.map((o, i) => <option key={i}>{o}</option>)}</select>
    case 'radio':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {options.map((o, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="radio" disabled name={field.field_key} /> {o}
            </label>
          ))}
        </div>
      )
    case 'checkbox':
      return <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><input type="checkbox" disabled /> {field.placeholder || field.field_label}</label>
    case 'file':
      return <input type="file" disabled style={{ fontSize: 13 }} />
    case 'number':
      return <input {...common} type="number" />
    case 'date':
      return <input {...common} type="date" />
    case 'email':
      return <input {...common} type="email" />
    default:
      return <input {...common} type="text" />
  }
}

export default function FormPreview({ fields }) {
  const active = (fields || []).filter(f => f.is_active !== 0 && f.field_type !== 'hidden')
  if (active.length === 0) return <p style={{ color: '#6B7280', fontSize: 13 }}>No active fields to preview. Add or enable fields to see the form.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {active.map(f => (
        <div key={f.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontWeight: 600, fontSize: 13 }}>
            {f.field_label}{f.is_required ? <span style={{ color: '#DC2626' }}> *</span> : null}
          </label>
          <PreviewField field={f} options={parseOptions(f.field_options)} />
          {f.help_text && <span style={{ fontSize: 11, color: '#6B7280' }}>{f.help_text}</span>}
        </div>
      ))}
      <button className="cp-btn cp-btn-primary" disabled style={{ marginTop: 8, opacity: 0.65, alignSelf: 'flex-start' }}>Submit (preview)</button>
    </div>
  )
}
