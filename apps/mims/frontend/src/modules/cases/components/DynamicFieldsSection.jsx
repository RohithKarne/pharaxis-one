import { useEffect, useMemo, useState } from 'react'
import { evaluateRule } from '../../../shared/ruleEvaluator.js'
import { useFeatureFlag } from '../../../shared/context/FeatureFlagsContext'
import useFieldValidation from '../../../shared/hooks/useFieldValidation'
import useSmartFields from '../../../shared/hooks/useSmartFields'
import FieldHistoryPopover from '../../../shared/components/FieldHistoryPopover'
import LockedFieldBadge from '../../../shared/components/compliance/LockedFieldBadge'
import MaskedRevealButton from '../../../shared/components/compliance/MaskedRevealButton'
import ReasonForChangeModal from '../../../shared/components/compliance/ReasonForChangeModal'
import FieldPresenceBadge from '../../../shared/components/collab/FieldPresenceBadge'
import RichFieldRenderer from '../../../shared/components/richFields/RichFieldRenderer'
import TypeaheadInput from '../../../shared/components/TypeaheadInput'

const RICH_TYPES = new Set(['address','phone','currency','rich_text','signature','image_annotation'])

function localeCode() { return (navigator.language || 'en').split('-')[0] }

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

/**
 * Consumer-wired into Wave 0-5 themes:
 *  - Theme 1 (rich fields)        — via RichFieldRenderer for field_type in RICH_TYPES
 *  - Theme 2 (smart defaults / auto-calc / typeahead) — via useSmartFields hook
 *  - Theme 3 (inline validation)  — via useFieldValidation hook
 *  - Theme 5 (presence)           — via FieldPresenceBadge (caller passes `presence` prop)
 *  - Theme 9 (compliance)         — LockedFieldBadge, ReasonForChangeModal, MaskedRevealButton
 *  - Wave 0 #2 (field history)    — FieldHistoryPopover next to each label
 */
export default function DynamicFieldsSection({
  sections, values, onChange, onSave, saving,
  rules = [], errors = {},
  // Optional consumer-wiring props (all backward-compatible)
  caseId        = null,
  caseStatus    = null,
  caseSection   = null,    // when this dyn-fields block belongs to a single named section
  presence      = null,    // from useCasePresence(caseId) — { enabled, focus, typing, users, actions }
  currentUserId = null,
  // B1 fix — route fields only to their case_type_scope + display_tab.
  // Both default to null, which preserves the legacy "render everything" behaviour
  // for callers that haven't been wired yet.
  caseType      = null,    // 'ae' | 'mi' | 'pc' — keep only fields where case_type_scope IN (caseType, 'shared')
  displayTab    = null,    // 'info' | 'contacts' | 'ae' | … — keep only fields whose field.display_tab === this
}) {
  const lcType = caseType ? String(caseType).toLowerCase() : null

  // Filter sections/fields by case_type_scope + display_tab before doing anything else.
  // If either filter is null, that dimension is not applied (backward compatible).
  const filteredSections = useMemo(() => {
    return (sections || [])
      .map(s => {
        const fields = (s.fields || []).filter(f => {
          // A field with a core_key is a platform field the wizard already
          // renders itself (Status, Priority, Description…). Rendering it here
          // too produced two boxes for one field, and values written to both —
          // case 482695 stored "test" against field_setup 20 AND 1702, both
          // named "Description". The wizard owns core fields; this section owns
          // everything the org added.
          if (f.core_key) return false
          const scope = String(f.case_type_scope || 'shared').toLowerCase()
          const tab   = f.display_tab || null
          if (lcType && scope !== 'shared' && scope !== lcType) return false
          if (displayTab && tab && tab !== displayTab)          return false
          return true
        })
        return { ...s, fields }
      })
      .filter(s => (s.fields || []).length > 0)
  }, [sections, lcType, displayTab])

  const activeSections = filteredSections
  const formData = useMemo(() => buildFormData(activeSections, values), [activeSections, values])

  const validation = useFieldValidation(caseSection)
  const smart = useSmartFields(caseSection, {
    onPatch: (patch) => {
      // Apply patches from auto-calc / smart-default into values (by field_name → id)
      onChange(prev => {
        const next = { ...prev }
        for (const [fname, v] of Object.entries(patch || {})) {
          const field = activeSections.flatMap(s => s.fields || []).find(f => f.field_name === fname)
          if (field) next[field.id] = v
        }
        return next
      })
    },
  })

  const themeFlag1 = useFeatureFlag('cf.theme1_rich_fields')
  const themeFlag2 = useFeatureFlag('cf.theme2_smart_behaviors')
  const themeFlag9 = useFeatureFlag('cf.theme9_compliance')

  // Apply smart defaults once on mount (when smart is enabled + we have a caseId)
  useEffect(() => {
    if (!themeFlag2 || !smart.enabled || !caseId) return
    smart.applyDefaults(formData)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smart.enabled, caseId, themeFlag2])

  // Debounced recalc whenever values change
  useEffect(() => {
    if (!themeFlag2 || !smart.enabled) return
    smart.recalc(formData)
  }, [formData, themeFlag2, smart])

  // Legacy rule evaluation (visibility/required/default/validation/cascade)
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

  // Theme 9: pending reason capture
  const [pendingReason, setPendingReason] = useState(null) // { fid, field, oldValue, newValue }
  function attemptSet(field, newValue) {
    const oldValue = values[field.id]
    if (themeFlag9 && oldValue != null && oldValue !== '' && oldValue !== newValue) {
      setPendingReason({ fid: field.id, field: field.field_name, oldValue, newValue })
      return
    }
    commitSet(field.id, newValue)
  }
  function commitSet(fid, newValue) {
    onChange(prev => ({ ...prev, [fid]: newValue }))
  }

  if (activeSections.length === 0) return null

  function renderField(field) {
    if (ruleState.hidden.has(field.field_name)) return null
    const fid = field.id
    const val = values[fid] ?? ''
    const label = field.custom_label || field.field_name
    const isRequired = !!field.is_required || ruleState.required.has(field.field_name)
    const error = errors[field.id] || errors[field.field_name]
      || ruleState.validation[field.field_name]
      || validation.errors?.[field.field_name]
    const warn  = validation.warnings?.[field.field_name]

    const labelEl = (
      <label htmlFor={`dyn-field-${fid}`} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span>{label}{isRequired ? ' *' : ''}</span>
        {field.format_hint && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>{field.format_hint}</span>}
        {caseId && <FieldHistoryPopover entityType="case" entityId={caseId} field={field.field_name} label={label} />}
        <LockedFieldBadge section={caseSection} field={field.field_name} caseStatus={caseStatus} />
        <FieldPresenceBadge field={field.field_name} presence={presence} currentUserId={currentUserId} />
      </label>
    )

    function onBlur() {
      if (!validation.enabled) return
      const msg = validation.validate(field.field_name, val, formData)
      validation.setErrors(es => ({ ...es, [field.field_name]: msg }))
      if (caseId) {
        validation.checkDuplicate(field.field_name, val, { entityId: caseId, entityType: 'case' })
          .then(m => m && validation.setErrors(es => ({ ...es, [field.field_name]: es[field.field_name] || m })))
      }
      presence?.actions?.blur?.(field.field_name)
    }
    function onFocus() { presence?.actions?.focus?.(field.field_name) }

    // ─── Theme 1: rich field types ───
    if (themeFlag1 && RICH_TYPES.has(field.field_type) && caseId) {
      return (
        <div key={fid} className="cf-form-field cf-form-field--full">
          {labelEl}
          <RichFieldRenderer
            entityType="case" entityId={caseId}
            section={caseSection || field.section_name || 'misc'}
            field={field.field_name} fieldType={field.field_type}
            label={null}
          />
          {error && <div className="cf-inline-error">{error}</div>}
          {warn  && <div style={{ fontSize: 11, color: '#8a6a00', marginTop: 3 }}>{warn}</div>}
        </div>
      )
    }

    // ─── Theme 9 sensitive field with masked reveal ───
    if (themeFlag9 && field.is_sensitive && val) {
      const masked = String(val).replace(/.(?=.{4})/g, '*')
      return (
        <div key={fid} className="cf-form-field">
          {labelEl}
          <MaskedRevealButton
            maskedDisplay={masked} unmaskedValue={val}
            entityType="case" entityId={caseId} section={caseSection} field={field.field_name}
          />
          {error && <div className="cf-inline-error">{error}</div>}
        </div>
      )
    }

    // ─── Theme 2: typeahead-driven input when a smart_field rule says so ───
    const smartRule = (smart.schema?.rules || []).find(
      r => r.field_name === field.field_name && r.rule_type === 'typeahead' && r.lookup_source
    )
    if (themeFlag2 && smartRule && (field.field_type === 'text' || !field.field_type)) {
      return (
        <div key={fid} className="cf-form-field">
          {labelEl}
          <TypeaheadInput
            source={smartRule.lookup_source} filter={smartRule.lookup_filter}
            value={val} lookup={smart.lookup}
            onSelect={(m) => attemptSet(field, m.value || m.label || '')}
          />
          {error && <div className="cf-inline-error">{error}</div>}
          {warn  && <div style={{ fontSize: 11, color: '#8a6a00', marginTop: 3 }}>{warn}</div>}
        </div>
      )
    }

    const footer = (
      <>
        {error && <div className="cf-inline-error">{error}</div>}
        {!error && warn && <div style={{ fontSize: 11, color: '#8a6a00', marginTop: 3 }}>{warn}</div>}
      </>
    )

    // Standard types
    if (field.field_type === 'textarea') {
      return (
        <div key={fid} className={`cf-form-field cf-form-field--full${error ? ' cf-form-field--error' : ''}`}>
          {labelEl}
          <textarea id={`dyn-field-${fid}`} rows={3} value={val} placeholder={field.placeholder_text || ''}
            onChange={e => attemptSet(field, e.target.value)} onBlur={onBlur} onFocus={onFocus} required={isRequired} />
          {footer}
        </div>
      )
    }
    if (field.field_type === 'number') {
      return (
        <div key={fid} className={`cf-form-field${error ? ' cf-form-field--error' : ''}`}>
          {labelEl}
          <input id={`dyn-field-${fid}`} type="number" value={val} placeholder={field.placeholder_text || ''}
            onChange={e => attemptSet(field, e.target.value)} onBlur={onBlur} onFocus={onFocus} required={isRequired} />
          {footer}
        </div>
      )
    }
    if (field.field_type === 'date') {
      return (
        <div key={fid} className={`cf-form-field${error ? ' cf-form-field--error' : ''}`}>
          {labelEl}
          <input id={`dyn-field-${fid}`} type="date" value={val}
            onChange={e => attemptSet(field, e.target.value)} onBlur={onBlur} onFocus={onFocus} required={isRequired} />
          {footer}
        </div>
      )
    }
    if (field.field_type === 'checkbox') {
      return (
        <div key={fid} className={`cf-form-field${error ? ' cf-form-field--error' : ''}`}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!val} onChange={e => attemptSet(field, e.target.checked)} />
            {label}{isRequired ? ' *' : ''}
            {caseId && <FieldHistoryPopover entityType="case" entityId={caseId} field={field.field_name} label={label} />}
            <LockedFieldBadge section={caseSection} field={field.field_name} caseStatus={caseStatus} />
          </label>
          {footer}
        </div>
      )
    }
    if (field.field_type === 'dropdown') {
      let options = Array.isArray(field.options) ? field.options : []
      const cascade = ruleState.cascades.get(field.field_name)
      if (cascade) {
        const parentField = activeSections.flatMap(s => s.fields || []).find(f => f.field_name === cascade.parentField)
        const parentOption = (parentField?.options || []).find(o => String(o.value) === String(cascade.parentValue))
        const parentId = parentOption?.id || cascade.parentValue
        options = cascade.parentValue
          ? options.filter(o => String(o.parent_value_id || '') === String(parentId))
          : options.filter(o => !o.parent_value_id)
      }
      return (
        <div key={fid} className={`cf-form-field${error ? ' cf-form-field--error' : ''}`}>
          {labelEl}
          <select id={`dyn-field-${fid}`} value={val} onChange={e => attemptSet(field, e.target.value)} onFocus={onFocus} onBlur={onBlur} required={isRequired}>
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
          {labelEl}
          <div className="cf-multi-select">
            {opts.map(o => (
              <label key={o.value} className="cf-multi-opt">
                <input type="checkbox" checked={selected.includes(String(o.value))}
                  onChange={e => {
                    const next = e.target.checked
                      ? [...selected, String(o.value)]
                      : selected.filter(x => x !== String(o.value))
                    attemptSet(field, next.join(','))
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
        {labelEl}
        <input id={`dyn-field-${fid}`} type="text" value={val} placeholder={field.placeholder_text || ''}
          onChange={e => attemptSet(field, e.target.value)} onBlur={onBlur} onFocus={onFocus} required={isRequired} />
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

      <ReasonForChangeModal
        open={!!pendingReason}
        onClose={() => setPendingReason(null)}
        onConfirm={async ({ reason }) => {
          if (!pendingReason) return
          commitSet(pendingReason.fid, pendingReason.newValue)
          // Best-effort persist via field history (server still records on save)
          try {
            const headers = { 'Content-Type': 'application/json' }
            await fetch('/api/field-history/manual', {
              method: 'POST', headers,
              body: JSON.stringify({
                entity_type: 'case', entity_id: caseId,
                section: caseSection, field: pendingReason.field,
                old_value: pendingReason.oldValue, new_value: pendingReason.newValue, reason,
              }),
            }).catch(() => {})
          } catch { /* best-effort history note */ }
        }}
        field={pendingReason?.field}
        oldValue={pendingReason?.oldValue}
        newValue={pendingReason?.newValue}
      />
    </div>
  )
}
