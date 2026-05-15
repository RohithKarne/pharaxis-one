import { useEffect, useMemo } from 'react'
import { evaluateRule } from '../../../shared/ruleEvaluator.js'

function localeCode() {
  return (navigator.language || 'en').split('-')[0]
}

function buildFormData(sections, values) {
  const data = {}
  for (const section of sections || []) {
    for (const field of section.fields || []) {
      const value = values[field.id] ?? ''
      data[field.field_name] = value
      data[String(field.field_name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')] = value
      data[field.id] = value
    }
  }
  return data
}

function optionLabel(option) {
  const lang = localeCode()
  return option?.translations?.[lang] || option?.label || option?.value
}

export default function DynamicFieldsSection({ sections, values, onChange, onSave, saving, rules = [], errors = {} }) {
  const activeSections = (sections || []).filter(s => Array.isArray(s.fields) && s.fields.length > 0)
  const formData = useMemo(() => buildFormData(activeSections, values), [activeSections, values])

  const ruleState = useMemo(() => {
    const state = { hidden: new Set(), required: new Set(), validation: {}, cascades: new Map(), defaults: [] }
    for (const rule of rules || []) {
      if (!rule?.field_name || !rule?.rule_type) continue
      const result = evaluateRule(rule, formData)
      if (rule.rule_type === 'visibility' && result === false) state.hidden.add(rule.field_name)
      if (rule.rule_type === 'required' && result === true) state.required.add(rule.field_name)
      if (rule.rule_type === 'default' && result !== undefined && result?.matched !== false) state.defaults.push({ field: rule.field_name, value: result })
      if (rule.rule_type === 'validation' && result?.matched) state.validation[rule.field_name] = result.action?.message || result.message || 'Invalid value.'
      if (rule.rule_type === 'cascade' && result?.matched) state.cascades.set(rule.field_name, result)
    }
    return state
  }, [rules, formData])

  useEffect(() => {
    if (!ruleState.defaults.length) return
    onChange(prev => {
      let changed = false
      const next = { ...prev }
      for (const item of ruleState.defaults) {
        const field = activeSections.flatMap(s => s.fields || []).find(f => f.field_name === item.field)
        if (!field) continue
        if (next[field.id] === undefined || next[field.id] === null || next[field.id] === '') {
          next[field.id] = item.value
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [ruleState.defaults, activeSections, onChange])

  if (activeSections.length === 0) return null

  function renderField(field) {
    if (ruleState.hidden.has(field.field_name)) return null
    const fid = field.id
    const val = values[fid] ?? ''
    const label = field.custom_label || field.field_name
    const isRequired = !!field.is_required || ruleState.required.has(field.field_name)
    const error = errors[field.id] || errors[field.field_name] || ruleState.validation[field.field_name]
    const set = (v) => onChange(prev => ({ ...prev, [fid]: v }))
    const footer = error ? <div className="cf-inline-error">{error}</div> : null

    if (field.field_type === 'textarea') {
      return (
        <div key={fid} className={`cf-form-field cf-form-field--full${error ? ' cf-form-field--error' : ''}`}>
          <label htmlFor={`dyn-field-${fid}`}>{label}{isRequired ? ' *' : ''}</label>
          <textarea id={`dyn-field-${fid}`} rows={3} value={val} placeholder={field.placeholder_text || ''} onChange={e => set(e.target.value)} required={isRequired} />
          {footer}
        </div>
      )
    }
    if (field.field_type === 'number') {
      return (
        <div key={fid} className={`cf-form-field${error ? ' cf-form-field--error' : ''}`}>
          <label htmlFor={`dyn-field-${fid}`}>{label}{isRequired ? ' *' : ''}</label>
          <input id={`dyn-field-${fid}`} type="number" value={val} placeholder={field.placeholder_text || ''} onChange={e => set(e.target.value)} required={isRequired} />
          {footer}
        </div>
      )
    }
    if (field.field_type === 'date') {
      return (
        <div key={fid} className={`cf-form-field${error ? ' cf-form-field--error' : ''}`}>
          <label htmlFor={`dyn-field-${fid}`}>{label}{isRequired ? ' *' : ''}</label>
          <input id={`dyn-field-${fid}`} type="date" value={val} onChange={e => set(e.target.value)} required={isRequired} />
          {footer}
        </div>
      )
    }
    if (field.field_type === 'checkbox') {
      return (
        <div key={fid} className={`cf-form-field${error ? ' cf-form-field--error' : ''}`}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!val} onChange={e => set(e.target.checked)} />
            {label}{isRequired ? ' *' : ''}
          </label>
          {footer}
        </div>
      )
    }
    if (field.field_type === 'dropdown') {
      let options = Array.isArray(field.options) ? field.options : []
      const cascade = ruleState.cascades.get(field.field_name)
      if (cascade?.parentValue) {
        const parentField = activeSections.flatMap(s => s.fields || []).find(f => f.field_name === cascade.parentField)
        const parentOption = (parentField?.options || []).find(o => String(o.value) === String(cascade.parentValue))
        const parentId = parentOption?.id || cascade.parentValue
        options = options.filter(o => !o.parent_value_id || String(o.parent_value_id) === String(parentId))
      }
      return (
        <div key={fid} className={`cf-form-field${error ? ' cf-form-field--error' : ''}`}>
          <label htmlFor={`dyn-field-${fid}`}>{label}{isRequired ? ' *' : ''}</label>
          <select id={`dyn-field-${fid}`} value={val} onChange={e => set(e.target.value)} required={isRequired}>
            <option value="">— Select —</option>
            {options.map(o => (
              <option key={o.value} value={o.value} title={o.description || ''}>{optionLabel(o)}</option>
            ))}
          </select>
          {footer}
        </div>
      )
    }
    if (field.field_type === 'multi-select') {
      const selected = Array.isArray(val) ? val : (val ? String(val).split(',').filter(Boolean) : [])
      const opts = Array.isArray(field.options) ? field.options : []
      return (
        <div key={fid} className={`cf-form-field${error ? ' cf-form-field--error' : ''}`}>
          <label>{label}{isRequired ? ' *' : ''}</label>
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
                {optionLabel(o)}
              </label>
            ))}
          </div>
          {footer}
        </div>
      )
    }
    return (
      <div key={fid} className={`cf-form-field${error ? ' cf-form-field--error' : ''}`}>
        <label htmlFor={`dyn-field-${fid}`}>{label}{isRequired ? ' *' : ''}</label>
        <input id={`dyn-field-${fid}`} type="text" value={val} placeholder={field.placeholder_text || ''} onChange={e => set(e.target.value)} required={isRequired} />
        {footer}
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
