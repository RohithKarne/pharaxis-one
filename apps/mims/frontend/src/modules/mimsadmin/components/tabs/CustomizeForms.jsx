/**
 * CustomizeForms.jsx — MIMS Admin > System > Setup > Customize Forms
 *
 * - Top: Tenant selector
 * - Left: Categories (Shared, Adverse Event, Medical Information, Product Complaint)
 * - Right: Sections (Disabled only) + Fields (Required + Disabled)
 *
 * Required & Disabled are mutually exclusive — checking one auto-clears the other.
 * Required is only available on items where `supports_required = true`.
 *
 * CSS namespace: ma-cf-
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch.js'
import { useAdminTenant } from '../../utils/AdminTenantContext'
import './CustomizeForms.css'

const API = '/api/admin'

const CAT_ICONS = {
  shared: '🔗',
  ae:     '⚠️',
  mi:     '💬',
  pc:     '📦',
}

const RULE_TYPES = [
  { value: 'visibility', label: 'Visibility' },
  { value: 'required', label: 'Required' },
  { value: 'default', label: 'Default' },
  { value: 'validation', label: 'Validation' },
  { value: 'cascade', label: 'Cascade' },
]

const CONDITION_OPS = ['=', '!=', '>', '>=', '<', '<=', 'IN', 'NOT_IN', 'EMPTY', 'NOT_EMPTY', 'REGEX']

// ─────────────────────────────────────────────────────────────────────────────
export default function CustomizeForms() {
  const { token } = useAuth()
  const H = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])

  const { tenants: ctxTenants, tenantId: ctxTenantId } = useAdminTenant()
  const [orgs,        setOrgs]        = useState([])
  const orgId = ctxTenantId
  const [categories,  setCategories]  = useState([])
  const [activeCat,   setActiveCat]   = useState('shared')
  const [data,        setData]        = useState(null)   // { sections, fields }
  const [origData,    setOrigData]    = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [flash,       setFlash]       = useState(null)
  const [rulesField,  setRulesField]  = useState(null)
  const [advancedField, setAdvancedField] = useState(null)   // currently-open field for advanced edit
  const [flexFieldFor,  setFlexFieldFor]  = useState(null)   // section_name to create a flex field for

  // ── Boot: load categories (tenants come from context) ─────────────────────
  useEffect(() => { setOrgs(ctxTenants) }, [ctxTenants])
  useEffect(() => {
    httpFetch(`${API}/customize-forms/categories`, { headers: H })
      .then(r => r.json())
      .then(c => setCategories(c.categories || []))
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load tenant + category state ──────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!orgId || !activeCat) return
    setLoading(true); setFlash(null)
    try {
      const d = await httpFetch(`${API}/customize-forms/${orgId}/${activeCat}`, { headers: H }).then(r => r.json())
      setData(d)
      setOrigData(JSON.parse(JSON.stringify(d)))   // deep clone for dirty check
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [orgId, activeCat, H])

  useEffect(() => { loadData() }, [loadData])

  // ── Dirty check ───────────────────────────────────────────────────────────
  const isDirty = useMemo(() => {
    if (!data || !origData) return false
    const flatten = d => [...d.sections, ...d.fields].map(i =>
      `${i.key}|${i.is_required ? 1 : 0}|${i.is_disabled ? 1 : 0}|${i.sort_order ?? 0}|${i.custom_label ?? ''}`
    ).join(',')
    return flatten(data) !== flatten(origData)
  }, [data, origData])

  // ── Toggle handlers ───────────────────────────────────────────────────────
  function toggle(itemKey, which) {
    setData(d => {
      if (!d) return d
      const update = (arr) => arr.map(it => {
        if (it.key !== itemKey) return it
        const next = { ...it }
        if (which === 'required') {
          next.is_required = !it.is_required
          if (next.is_required) next.is_disabled = false   // mutual exclusion
        } else {
          next.is_disabled = !it.is_disabled
          if (next.is_disabled) next.is_required = false
        }
        return next
      })
      return { ...d, sections: update(d.sections), fields: update(d.fields) }
    })
    setFlash(null)
  }

  function resetChanges() {
    if (!origData) return
    setData(JSON.parse(JSON.stringify(origData)))
    setFlash(null)
  }

  // ── Update arbitrary advanced field property (in local state) ───────────
  function updateFieldAdvanced(itemKey, patch) {
    setData(d => {
      if (!d) return d
      return { ...d, fields: d.fields.map(f => f.key === itemKey ? { ...f, ...patch } : f) }
    })
    setFlash(null)
  }

  // ── Create flex field (server call + reload) ────────────────────────────
  async function createFlexField(sectionName, fieldName, fieldType) {
    if (!orgId || !sectionName.trim() || !fieldName.trim()) return
    try {
      const r = await httpFetch(`${API}/customize-forms/${orgId}/flex-field`, {
        method: 'POST', headers: H,
        body: JSON.stringify({ section_name: sectionName, field_name: fieldName, field_type: fieldType || 'text' }),
      })
      const d = await r.json()
      if (!r.ok) { setFlash({ type: 'error', msg: d.error || 'Failed to add field.' }); return }
      setFlash({ type: 'ok', msg: `Field "${fieldName}" added.` })
      setFlexFieldFor(null)
      loadData()
    } catch { setFlash({ type: 'error', msg: 'Network error.' }) }
  }

  // ── Custom label per tenant ─────────────────────────────────────────────
  function setCustomLabel(itemKey, value) {
    setData(d => {
      if (!d) return d
      return {
        ...d,
        fields: d.fields.map(f => f.key === itemKey ? { ...f, custom_label: value } : f),
      }
    })
    setFlash(null)
  }

  // ── Drag-drop reordering (within same section only) ─────────────────────
  const dragKeyRef = useRef(null)
  function onDragStart(e, key, dbSection) {
    dragKeyRef.current = { key, dbSection }
    e.dataTransfer.effectAllowed = 'move'
  }
  function onDragOver(e, _key, dbSection) {
    if (dragKeyRef.current?.dbSection === dbSection) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    }
  }
  function onDrop(e, targetKey, targetSection) {
    e.preventDefault()
    const dragged = dragKeyRef.current
    if (!dragged || dragged.key === targetKey || dragged.dbSection !== targetSection) return

    setData(d => {
      if (!d) return d
      const fields = [...d.fields]
      const fromIdx = fields.findIndex(f => f.key === dragged.key)
      const toIdx   = fields.findIndex(f => f.key === targetKey)
      if (fromIdx < 0 || toIdx < 0) return d
      const [moved] = fields.splice(fromIdx, 1)
      fields.splice(toIdx, 0, moved)

      // Re-number sort_order within the affected section
      let order = 1
      for (const f of fields) {
        if (f.db_section === targetSection && !f.is_placeholder) {
          f.sort_order = order++
        }
      }
      return { ...d, fields }
    })
    dragKeyRef.current = null
    setFlash(null)
  }

  async function handleSave() {
    if (!data || !orgId) return
    setSaving(true); setFlash(null)
    try {
      const items = [...data.sections, ...data.fields].map(i => ({
        key: i.key,
        is_required:    !!i.is_required,
        is_disabled:    !!i.is_disabled,
        sort_order:     i.sort_order ?? 0,
        custom_label:   i.custom_label ?? '',
        field_type:     i.field_type ?? 'text',
        help_text:      i.help_text ?? '',
        max_length:     i.max_length ?? null,
        default_value:  i.default_value ?? '',
        picklist_type:  i.picklist_type ?? '',
        lookup_target:  i.lookup_target ?? '',
        is_sensitive:   !!i.is_sensitive,
        masking_pattern: i.masking_pattern ?? 'partial',
      }))
      const r = await httpFetch(`${API}/customize-forms/${orgId}/${activeCat}`, {
        method: 'PUT', headers: H,
        body: JSON.stringify({ items }),
      })
      const d = await r.json()
      if (!r.ok) { setFlash({ type: 'error', msg: d.error || 'Failed to save.' }); return }
      setFlash({ type: 'ok', msg: `Saved ${d.saved} item${d.saved !== 1 ? 's' : ''}.` })
      setOrigData(JSON.parse(JSON.stringify(data)))
      setTimeout(() => setFlash(null), 3500)
    } catch {
      setFlash({ type: 'error', msg: 'Network error.' })
    } finally {
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="ma-cf-page">

      {/* Toolbar — tenant is selected from the global admin header picker */}
      <div className="ma-cf-toolbar">
        <div className="ma-cf-title-block">
          <h2 className="ma-cf-title">Customize Forms</h2>
          <span className="ma-cf-sub">
            Configure visible sections and required/disabled fields for the selected tenant
            {orgId && orgs.find(o => String(o.id) === String(orgId))
              ? <> · <strong>{orgs.find(o => String(o.id) === String(orgId))?.name}</strong></>
              : null}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="ma-cf-body">
        {/* Categories */}
        <div className="ma-cf-categories">
          <div className="ma-cf-cat-heading">Categories</div>
          {categories.map(c => (
            <div
              key={c.key}
              className={`ma-cf-cat-item${activeCat === c.key ? ' active' : ''}`}
              onClick={() => setActiveCat(c.key)}
            >
              <span className="ma-cf-cat-icon">{CAT_ICONS[c.key] || '📋'}</span>
              {c.label}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="ma-cf-content">
          {!orgId && <div className="ma-cf-empty">Select a tenant to continue.</div>}
          {orgId && loading && <div className="ma-cf-loading">Loading…</div>}
          {orgId && !loading && data && (
            <>
              {/* Sections group */}
              <div className="ma-cf-group">
                <div className="ma-cf-group-header">
                  <span className="ma-cf-group-title">Sections — Disabled means section is hidden from case form</span>
                  <span className="ma-cf-group-count">{data.sections.length} item{data.sections.length !== 1 ? 's' : ''}</span>
                </div>
                {data.sections.length === 0 && <div className="ma-cf-empty">No sections in this category.</div>}
                {data.sections.length > 0 && (
                  <table className="ma-cf-table">
                    <thead>
                      <tr>
                        <th>Section Name</th>
                        <th className="col-sub">Maps to</th>
                        <th className="col-toggle">Disabled</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sections.map(s => (
                        <tr key={s.key}>
                          <td>
                            <div className="ma-cf-row-label">
                              <span className={`ma-cf-row-name${s.is_placeholder ? ' placeholder' : ''}`}>{s.label}</span>
                              {s.is_placeholder && <span className="ma-cf-ph-badge">PLACEHOLDER</span>}
                            </div>
                          </td>
                          <td className="ma-cf-sub-label" title={s.db_section || ''}>
                            {s.db_section || '—'}
                          </td>
                          <td className="ma-cf-cb-cell">
                            <input
                              type="checkbox"
                              className="ma-cf-cb"
                              checked={!!s.is_disabled}
                              onChange={() => toggle(s.key, 'disabled')}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Fields group */}
              <div className="ma-cf-group">
                <div className="ma-cf-group-header">
                  <span className="ma-cf-group-title">Fields — Required + Disabled (mutually exclusive)</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="ma-cf-group-count">{data.fields.length} item{data.fields.length !== 1 ? 's' : ''}</span>
                    {/* "+ Add Field" per real section — picks first non-placeholder section by default */}
                    <button
                      type="button"
                      className="ma-cf-rules-btn"
                      onClick={() => {
                        const firstSection = data.sections.find(s => !s.is_placeholder)?.db_section
                          || data.fields.find(f => !f.is_placeholder)?.db_section
                          || ''
                        setFlexFieldFor(firstSection)
                      }}
                    >+ Add Field</button>
                  </span>
                </div>
                {data.fields.length === 0 && <div className="ma-cf-empty">No fields in this category.</div>}
                {data.fields.length > 0 && (
                  <table className="ma-cf-table">
                    <thead>
                      <tr>
                        <th style={{ width: 32 }} title="Drag to reorder"></th>
                        <th>Field Name</th>
                        <th className="col-sub">Section</th>
                        <th>Custom Label</th>
                        <th className="col-toggle">Required</th>
                        <th className="col-toggle">Disabled</th>
                        <th className="col-toggle">Rules</th>
                        <th className="col-toggle">More</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.fields.map((f, idx) => (
                        <tr
                          key={f.key}
                          draggable={!f.is_placeholder}
                          onDragStart={e => onDragStart(e, f.key, f.db_section)}
                          onDragOver={e => onDragOver(e, f.key, f.db_section)}
                          onDrop={e => onDrop(e, f.key, f.db_section)}
                          style={{ cursor: f.is_placeholder ? 'default' : 'grab' }}
                        >
                          <td style={{ textAlign: 'center', color: 'var(--text-muted)', userSelect: 'none' }}>
                            {f.is_placeholder ? '' : '⋮⋮'}
                          </td>
                          <td>
                            <div className="ma-cf-row-label">
                              <span className={`ma-cf-row-name${f.is_placeholder ? ' placeholder' : ''}`}>{f.label}</span>
                              {f.is_placeholder && <span className="ma-cf-ph-badge">PLACEHOLDER</span>}
                            </div>
                          </td>
                          <td className="ma-cf-sub-label" title={f.db_section || ''}>
                            {f.db_section || '—'}
                          </td>
                          <td>
                            {f.is_placeholder ? (
                              <span className="ma-cf-cb-dash">—</span>
                            ) : (
                              <input
                                type="text"
                                className="ma-cf-label-input"
                                value={f.custom_label || ''}
                                placeholder={f.label}
                                onChange={e => setCustomLabel(f.key, e.target.value)}
                              />
                            )}
                          </td>
                          <td className="ma-cf-cb-cell">
                            {f.supports_required ? (
                              <input
                                type="checkbox"
                                className="ma-cf-cb"
                                checked={!!f.is_required}
                                onChange={() => toggle(f.key, 'required')}
                                disabled={f.is_disabled}
                              />
                            ) : (
                              <span className="ma-cf-cb-dash">—</span>
                            )}
                          </td>
                          <td className="ma-cf-cb-cell">
                            <input
                              type="checkbox"
                              className="ma-cf-cb"
                              checked={!!f.is_disabled}
                              onChange={() => toggle(f.key, 'disabled')}
                            />
                          </td>
                          <td className="ma-cf-cb-cell">
                            {f.is_placeholder ? (
                              <span className="ma-cf-cb-dash">—</span>
                            ) : (
                              <button
                                type="button"
                                className="ma-cf-rules-btn"
                                onClick={() => setRulesField(f)}
                              >
                                ⚙ Rules
                              </button>
                            )}
                          </td>
                          <td className="ma-cf-cb-cell">
                            {f.is_placeholder ? (
                              <span className="ma-cf-cb-dash">—</span>
                            ) : (
                              <button
                                type="button"
                                className="ma-cf-rules-btn"
                                onClick={() => setAdvancedField(f)}
                                title="Field type, help text, max length, defaults, picklist binding, masking"
                              >
                                ⚙ More
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Save bar (sticky bottom) */}
      {data && (
        <div className="ma-cf-savebar">
          {flash && (
            <span className={flash.type === 'error' ? 'ma-cf-flash-err' : 'ma-cf-flash-ok'}>
              {flash.msg}
            </span>
          )}
          {isDirty && !flash && <span className="ma-cf-dirty-msg">You have unsaved changes</span>}
          <button className="ma-cf-btn-reset" onClick={resetChanges} disabled={!isDirty || saving}>
            Reset
          </button>
          <button className="ma-cf-btn-save" onClick={handleSave} disabled={!isDirty || saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      )}

      {rulesField && (
        <RulesModal
          field={rulesField}
          fields={data?.fields || []}
          orgId={orgId}
          headers={H}
          onClose={() => setRulesField(null)}
        />
      )}

      {advancedField && (
        <AdvancedFieldModal
          field={advancedField}
          onClose={() => setAdvancedField(null)}
          onApply={(patch) => { updateFieldAdvanced(advancedField.key, patch); setAdvancedField(null) }}
        />
      )}

      {flexFieldFor !== null && (
        <FlexFieldModal
          defaultSection={flexFieldFor}
          sections={(data?.sections || []).filter(s => !s.is_placeholder && s.db_section)}
          onClose={() => setFlexFieldFor(null)}
          onCreate={(section, name, type) => createFlexField(section, name, type)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AdvancedFieldModal — edit field_type / help_text / max_length / default_value
// / picklist_type / lookup_target / is_sensitive / masking_pattern.
// Folded in from the legacy Field Setup screen.
// ─────────────────────────────────────────────────────────────────────────────
function AdvancedFieldModal({ field, onClose, onApply }) {
  const [draft, setDraft] = useState({
    field_type:      field.field_type || 'text',
    help_text:       field.help_text || '',
    max_length:      field.max_length ?? '',
    default_value:   field.default_value || '',
    picklist_type:   field.picklist_type || '',
    lookup_target:   field.lookup_target || '',
    is_sensitive:    !!field.is_sensitive,
    masking_pattern: field.masking_pattern || 'partial',
  })
  function setV(k, v) { setDraft(d => ({ ...d, [k]: v })) }
  return (
    <div className="ma-rules-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="ma-rules-modal" style={{ width: 'min(640px, 96vw)' }}>
        <div className="ma-rules-header">
          <div>
            <h2>Advanced settings — {field.label}</h2>
            <p>{field.db_section} · {field.db_field}</p>
          </div>
          <button onClick={onClose}>×</button>
        </div>
        <div className="ma-rules-body" style={{ gridTemplateColumns: '1fr' }}>
          <div className="ma-rules-builder">
            <div className="ma-rules-grid">
              <label>Field Type
                <select value={draft.field_type} onChange={e => setV('field_type', e.target.value)}>
                  {['text','textarea','number','date','datetime','checkbox','dropdown','multiselect','lookup','email','phone','url','currency','address','tags','rich_text','signature','file','formula']
                    .map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label>Max Length
                <input type="number" min={0} value={draft.max_length} onChange={e => setV('max_length', e.target.value)} placeholder="—" />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>Help Text / Tooltip
                <textarea rows={2} value={draft.help_text} onChange={e => setV('help_text', e.target.value)} />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>Default Value
                <input type="text" value={draft.default_value} onChange={e => setV('default_value', e.target.value)} placeholder="e.g. Normal" />
              </label>
              <label>Picklist Source (binding)
                <input type="text" value={draft.picklist_type} onChange={e => setV('picklist_type', e.target.value)} placeholder="e.g. ae_status" />
              </label>
              <label>Lookup Target
                <input type="text" value={draft.lookup_target} onChange={e => setV('lookup_target', e.target.value)} placeholder="e.g. product, contact" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={draft.is_sensitive} onChange={e => setV('is_sensitive', e.target.checked)} />
                <span>Mark as sensitive (PHI / restricted)</span>
              </label>
              <label>Masking Pattern
                <select value={draft.masking_pattern} onChange={e => setV('masking_pattern', e.target.value)} disabled={!draft.is_sensitive}>
                  <option value="partial">Partial (last 4 visible)</option>
                  <option value="full">Full (all masked)</option>
                  <option value="initial">Initials only</option>
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button className="ma-cf-btn-reset" onClick={onClose}>Cancel</button>
              <button className="ma-cf-btn-save" onClick={() => onApply({
                ...draft,
                max_length: draft.max_length === '' ? null : parseInt(draft.max_length, 10),
              })}>Apply</button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
              Apply stages the changes locally. Click <strong>Save Changes</strong> in the toolbar to persist to the tenant.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FlexFieldModal — create a brand-new (flex) field on a section for this tenant.
// Folded in from the legacy Field Setup screen.
// ─────────────────────────────────────────────────────────────────────────────
function FlexFieldModal({ defaultSection, sections, onClose, onCreate }) {
  const [section, setSection] = useState(defaultSection || (sections[0]?.db_section || ''))
  const [name, setName]       = useState('')
  const [type, setType]       = useState('text')
  return (
    <div className="ma-rules-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="ma-rules-modal" style={{ width: 'min(520px, 96vw)' }}>
        <div className="ma-rules-header">
          <div>
            <h2>Add a new field</h2>
            <p>Adds a new (flex) field to the selected section for this tenant.</p>
          </div>
          <button onClick={onClose}>×</button>
        </div>
        <div className="ma-rules-body" style={{ gridTemplateColumns: '1fr' }}>
          <div className="ma-rules-builder">
            <label>Section
              <select value={section} onChange={e => setSection(e.target.value)}>
                <option value="">— Select section —</option>
                {sections.map(s => <option key={s.key} value={s.db_section}>{s.label} — ({s.db_section})</option>)}
              </select>
            </label>
            <label style={{ marginTop: 10 }}>Field Name
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. NPI Number" />
            </label>
            <label style={{ marginTop: 10 }}>Field Type
              <select value={type} onChange={e => setType(e.target.value)}>
                {['text','textarea','number','date','datetime','checkbox','dropdown','email','phone','url','currency','address','tags','rich_text']
                  .map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button className="ma-cf-btn-reset" onClick={onClose}>Cancel</button>
              <button
                className="ma-cf-btn-save"
                disabled={!section || !name.trim()}
                onClick={() => onCreate(section, name, type)}
              >Add Field</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function buildAction(ruleType, draft) {
  if (ruleType === 'visibility') return { action: draft.visibility_action || 'show' }
  if (ruleType === 'required') return { required: draft.required_mode !== 'not_required' }
  if (ruleType === 'default') return { value: draft.default_value || '' }
  if (ruleType === 'cascade') return { parent_field: draft.source_field || '', match: 'parent_value_id' }
  return {
    min: draft.min_value || undefined,
    max: draft.max_value || undefined,
    pattern: draft.pattern || undefined,
    message: draft.message || 'Value does not meet validation rule.',
  }
}

function emptyDraft(field) {
  return {
    id: null,
    rule_type: 'visibility',
    source_field: '',
    op: '=',
    value: '',
    priority: 0,
    is_active: true,
    visibility_action: 'show',
    required_mode: 'required',
    default_value: '',
    min_value: '',
    max_value: '',
    pattern: '',
    message: '',
    section_name: field?.db_section || '',
    field_name: field?.db_field || field?.label || '',
    case_type: field?.case_type || 'ALL',
  }
}

function ruleToDraft(rule, field) {
  const condition = rule.condition_json || {}
  const action = rule.action_json || {}
  return {
    ...emptyDraft(field),
    id: rule.id,
    rule_type: rule.rule_type || 'visibility',
    source_field: condition.field || action.parent_field || '',
    op: condition.op || '=',
    value: Array.isArray(condition.value) ? condition.value.join(', ') : (condition.value ?? ''),
    priority: rule.priority || 0,
    is_active: !!rule.is_active,
    visibility_action: action.action || 'show',
    required_mode: action.required === false ? 'not_required' : 'required',
    default_value: action.value ?? '',
    min_value: action.min ?? '',
    max_value: action.max ?? '',
    pattern: action.pattern ?? '',
    message: action.message ?? '',
  }
}

function conditionFromDraft(draft) {
  if (draft.op === 'EMPTY' || draft.op === 'NOT_EMPTY') return { field: draft.source_field, op: draft.op }
  const raw = String(draft.value || '').trim()
  const value = ['IN', 'NOT_IN'].includes(draft.op)
    ? raw.split(',').map(v => v.trim()).filter(Boolean)
    : raw
  return { field: draft.source_field, op: draft.op, value }
}

function RulesModal({ field, fields, orgId, headers, onClose }) {
  const [rules, setRules] = useState([])
  const [draft, setDraft] = useState(() => emptyDraft(field))
  const [sample, setSample] = useState('{}')
  const [testResult, setTestResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const sourceFields = useMemo(
    () => fields.filter(f => !f.is_placeholder && f.db_field).map(f => ({ value: f.db_field, label: f.label, section: f.db_section })),
    [fields]
  )

  const loadRules = useCallback(async () => {
    if (!orgId || !field?.db_field) return
    try {
      const qs = new URLSearchParams({
        org_id: orgId,
        section: field.db_section || '',
        field_name: field.db_field,
        case_type: field.case_type || 'ALL',
      })
      const d = await httpFetch(`${API}/case-form-rules?${qs}`, { headers }).then(r => r.json())
      setRules(d.rules || [])
    } catch {
      setRules([])
    }
  }, [field, orgId, headers])

  useEffect(() => {
    setDraft(emptyDraft(field))
    setErr('')
    setTestResult(null)
    loadRules()
  }, [field, loadRules])

  function set(k, v) { setDraft(d => ({ ...d, [k]: v })) }

  async function saveRule() {
    setErr('')
    if (!draft.source_field) return setErr('Choose the source field for the condition.')
    const body = {
      org_id: Number(orgId),
      case_type: draft.case_type || 'ALL',
      section_name: field.db_section,
      field_name: field.db_field,
      rule_type: draft.rule_type,
      condition_json: conditionFromDraft(draft),
      action_json: buildAction(draft.rule_type, draft),
      is_active: !!draft.is_active,
      priority: Number(draft.priority || 0),
    }
    setBusy(true)
    try {
      const url = draft.id ? `${API}/case-form-rules/${draft.id}` : `${API}/case-form-rules`
      const r = await httpFetch(url, {
        method: draft.id ? 'PUT' : 'POST',
        headers,
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Rule save failed.'); return }
      setDraft(emptyDraft(field))
      await loadRules()
    } catch {
      setErr('Network error while saving rule.')
    } finally {
      setBusy(false)
    }
  }

  async function deleteRule(rule) {
    if (!window.confirm(`Delete ${rule.rule_type} rule for ${field.label}?`)) return
    setBusy(true)
    try {
      const r = await httpFetch(`${API}/case-form-rules/${rule.id}?org_id=${encodeURIComponent(orgId)}`, { method: 'DELETE', headers })
      if (!r.ok) {
        const d = await r.json()
        setErr(d.error || 'Delete failed.')
        return
      }
      await loadRules()
    } catch {
      setErr('Network error while deleting rule.')
    } finally {
      setBusy(false)
    }
  }

  async function testRule() {
    setErr('')
    let formData = {}
    try {
      formData = sample.trim() ? JSON.parse(sample) : {}
    } catch {
      setErr('Sample form data must be valid JSON.')
      return
    }
    const rule = {
      rule_type: draft.rule_type,
      condition_json: conditionFromDraft(draft),
      action_json: buildAction(draft.rule_type, draft),
    }
    try {
      const r = await httpFetch(`${API}/case-form-rules/test`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ rule, formData }),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Rule test failed.'); return }
      setTestResult(d.result)
    } catch {
      setErr('Network error while testing rule.')
    }
  }

  return (
    <div className="ma-rules-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="ma-rules-modal">
        <div className="ma-rules-header">
          <div>
            <h2>Rules for {field.label}</h2>
            <p>{field.db_section} / {field.db_field}</p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>

        <div className="ma-rules-body">
          <div className="ma-rules-builder">
            <div className="ma-rules-grid">
              <label>
                Rule Type
                <select value={draft.rule_type} onChange={e => set('rule_type', e.target.value)}>
                  {RULE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
              <label>
                Source Field
                <select value={draft.source_field} onChange={e => set('source_field', e.target.value)}>
                  <option value="">Select source field</option>
                  {sourceFields.map(f => <option key={`${f.section}|${f.value}`} value={f.value}>{f.label}</option>)}
                </select>
              </label>
              <label>
                Operator
                <select value={draft.op} onChange={e => set('op', e.target.value)}>
                  {CONDITION_OPS.map(op => <option key={op} value={op}>{op}</option>)}
                </select>
              </label>
              <label>
                Value
                <input value={draft.value} onChange={e => set('value', e.target.value)} disabled={['EMPTY', 'NOT_EMPTY'].includes(draft.op)} placeholder="Fatal or A,B,C" />
              </label>
              <label>
                Priority
                <input type="number" value={draft.priority} onChange={e => set('priority', e.target.value)} />
              </label>
              <label className="ma-rules-check">
                <input type="checkbox" checked={draft.is_active} onChange={e => set('is_active', e.target.checked)} />
                Active
              </label>
            </div>

            <div className="ma-rules-action">
              {draft.rule_type === 'visibility' && (
                <label>Action<select value={draft.visibility_action} onChange={e => set('visibility_action', e.target.value)}><option value="show">Show field when condition matches</option><option value="hide">Hide field when condition matches</option></select></label>
              )}
              {draft.rule_type === 'required' && (
                <label>Action<select value={draft.required_mode} onChange={e => set('required_mode', e.target.value)}><option value="required">Required when condition matches</option><option value="not_required">Not required when condition matches</option></select></label>
              )}
              {draft.rule_type === 'default' && (
                <label>Default Value<input value={draft.default_value} onChange={e => set('default_value', e.target.value)} placeholder="Value to place when empty" /></label>
              )}
              {draft.rule_type === 'validation' && (
                <div className="ma-rules-grid">
                  <label>Min<input value={draft.min_value} onChange={e => set('min_value', e.target.value)} /></label>
                  <label>Max<input value={draft.max_value} onChange={e => set('max_value', e.target.value)} /></label>
                  <label>Regex<input value={draft.pattern} onChange={e => set('pattern', e.target.value)} placeholder="^[A-Z]" /></label>
                  <label>Message<input value={draft.message} onChange={e => set('message', e.target.value)} placeholder="Validation message" /></label>
                </div>
              )}
              {draft.rule_type === 'cascade' && (
                <div className="ma-rules-note">The target dropdown will show only values whose parent value matches the selected source field value.</div>
              )}
            </div>

            <div className="ma-rules-test">
              <label>Sample Form Data JSON<textarea value={sample} onChange={e => setSample(e.target.value)} rows={4} /></label>
              <button type="button" onClick={testRule}>Test Rule</button>
              {testResult !== null && <pre>{JSON.stringify(testResult, null, 2)}</pre>}
            </div>

            {err && <div className="ma-rules-error">{err}</div>}
            <div className="ma-rules-actions">
              {draft.id && <button type="button" onClick={() => setDraft(emptyDraft(field))}>New Rule</button>}
              <button type="button" className="primary" onClick={saveRule} disabled={busy}>{busy ? 'Saving...' : (draft.id ? 'Update Rule' : 'Create Rule')}</button>
            </div>
          </div>

          <div className="ma-rules-list">
            <h3>Existing Rules</h3>
            {rules.length === 0 && <div className="ma-rules-empty">No rules configured for this field.</div>}
            {rules.map(rule => (
              <div className="ma-rules-card" key={rule.id}>
                <div>
                  <strong>{rule.rule_type}</strong>
                  <span>{rule.is_active ? 'Active' : 'Inactive'} · priority {rule.priority || 0}</span>
                  <code>{JSON.stringify(rule.condition_json)}</code>
                </div>
                <div className="ma-rules-card-actions">
                  <button type="button" onClick={() => setDraft(ruleToDraft(rule, field))}>Edit</button>
                  <button type="button" className="danger" onClick={() => deleteRule(rule)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
