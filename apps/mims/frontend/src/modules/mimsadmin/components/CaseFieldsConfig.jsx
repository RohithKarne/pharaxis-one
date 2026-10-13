import { useCallback, useEffect, useState } from 'react'
import { httpFetch } from '../../../shared/api/httpFetch.js'

// Phase 3 admin surface. The case form draws its fields from `field_setup`;
// this screen is where an admin changes what they are called, whether they are
// required, whether they appear, and in what order — per org, per case type.
// Locked with Rohith 2026-07-28: fields are controlled from the backend, not
// hardcoded in the form.

const CASE_TYPES = ['MI', 'AE', 'PC']

const API = '/api/admin/case-fields'

// The three advanced form tools sit behind this switch (case form clean-up PR 5).
// It is a per-browser preference; the menu listens for the change.
export const ADVANCED_FORMS_KEY = 'mims.admin.advancedFormTools'
function readAdvanced() { try { return localStorage.getItem(ADVANCED_FORMS_KEY) === '1' } catch { return false } }
function writeAdvanced(on) {
  try { localStorage.setItem(ADVANCED_FORMS_KEY, on ? '1' : '0') } catch { /* preference only */ }
  window.dispatchEvent(new Event('mims-advanced-forms'))
}

const FIELD_TYPES = [
  { value: 'text', label: 'Text' }, { value: 'textarea', label: 'Long text' }, { value: 'date', label: 'Date' },
  { value: 'number', label: 'Number' }, { value: 'checkbox', label: 'Tick box' }, { value: 'dropdown', label: 'Dropdown' },
]
const BLANK_FIELD = { section_name: '', field_name: '', field_type: 'text', picklist_type: '', step: 2, is_required: false }

export default function CaseFieldsConfig() {
  const [caseType, setCaseType] = useState('MI')
  const [sections, setSections] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const [savingId, setSavingId] = useState(null)
  const [showHidden, setShowHidden] = useState(true)
  // Day 0 of the case form clean-up: per field, how many cases hold a value.
  // Loaded after the field list so a slow count never delays the screen.
  const [usage, setUsage] = useState(null)
  const [casesTotal, setCasesTotal] = useState(null)
  const [advanced, setAdvanced] = useState(readAdvanced)
  const [picklistTypes, setPicklistTypes] = useState([])
  const [adding, setAdding] = useState(false)
  const [newField, setNewField] = useState(BLANK_FIELD)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await httpFetch(`${API}?case_type=${caseType}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load field configuration.')
      setSections(data.sections || [])
      setTotal(data.total || 0)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
    setUsage(null)
    setCasesTotal(null)
    try {
      const res = await httpFetch(`${API}/usage?case_type=${caseType}`)
      const data = await res.json()
      if (res.ok) { setUsage(data.usage || {}); setCasesTotal(data.cases_total ?? null) }
    } catch (_) { /* the count is informational; the screen works without it */ }
  }, [caseType])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    httpFetch(`${API}/picklist-types`).then(r => (r.ok ? r.json() : { types: [] })).then(d => setPicklistTypes(d.types || [])).catch(() => {})
  }, [])

  async function switchSection(section, on) {
    try {
      const res = await httpFetch(`${API}/sections`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_type: caseType, section_name: section.section_name, is_visible: on }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not change the section.')
      setSections(prev => prev.map(s => (s.section_name === section.section_name ? { ...s, is_visible: on } : s)))
      note(`${section.section_name} is ${on ? 'on' : 'off'} for ${caseType} cases.`)
    } catch (err) { note(err.message) }
  }

  async function addField(e) {
    e.preventDefault()
    try {
      const res = await httpFetch(API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newField, case_type: caseType, step: Number(newField.step) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not add the field.')
      note(`"${data.field_name}" added to ${data.section_name}.`)
      setNewField(BLANK_FIELD); setAdding(false); load()
    } catch (err) { note(err.message) }
  }

  function note(msg) {
    setFlash(msg)
    setTimeout(() => setFlash(''), 3500)
  }

  async function patchField(field, patch) {
    setSavingId(field.id)
    try {
      const res = await httpFetch(`${API}/${field.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Update failed.')

      // Editing an inherited field creates an org-owned copy with a new id, so
      // the row has to be replaced rather than patched in place.
      setSections(prev => prev.map(s => ({
        ...s,
        fields: s.fields.map(f => f.id === field.id
          ? { ...f, ...data, is_inherited: false }
          : f),
      })))
      // A step change moves the field; reload so the Step column reads from the server.
      if ('display_tab' in patch) load()
      note(data.cloned_from_platform_default
        ? `"${data.custom_label || data.field_name}" now has an org-specific override.`
        : `"${data.custom_label || data.field_name}" updated.`)
    } catch (err) {
      note(err.message)
      load()   // reload so the UI never shows a change the server rejected
    } finally {
      setSavingId(null)
    }
  }

  if (loading) return <div style={{ padding: 20, color: 'var(--text-muted)' }}>Loading field configuration…</div>

  return (
    <div className="cf-fieldcfg">
      <div className="cf-fieldcfg-head">
        <div>
          <h3>Case Form Fields</h3>
          <p>
            Controls what appears on the case form for this organisation — label, whether it is required,
            whether it is shown, and its order. Changes take effect the next time a case form is opened.
          </p>
        </div>
        <div className="cf-fieldcfg-controls">
          <label htmlFor="cfg-case-type">Case type</label>
          <select id="cfg-case-type" value={caseType} onChange={e => setCaseType(e.target.value)}>
            {CASE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <label className="cf-fieldcfg-toggle">
            <input type="checkbox" checked={showHidden} onChange={e => setShowHidden(e.target.checked)} />
            Show hidden fields
          </label>
          <label className="cf-fieldcfg-toggle" title="Smart Field Rules, Grid Section Templates and Case Actions in the menu">
            <input type="checkbox" aria-label="Advanced form tools" checked={advanced} onChange={e => { setAdvanced(e.target.checked); writeAdvanced(e.target.checked) }} />
            Advanced form tools
          </label>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding(a => !a)}>{adding ? 'Cancel' : '+ Add field'}</button>
        </div>
      </div>

      {adding && (
        <form className="cf-fieldcfg-add" onSubmit={addField}>
          <div className="cf-fieldcfg-add-grid">
            <label>Section
              <select aria-label="New field section" required value={newField.section_name} onChange={e => setNewField(f => ({ ...f, section_name: e.target.value }))}>
                <option value="">— Choose —</option>
                {sections.filter(s => s.section_name !== 'Contact / Requestor').map(s => <option key={s.section_name} value={s.section_name}>{s.section_name}</option>)}
              </select>
            </label>
            <label>Field name
              <input type="text" aria-label="New field name" required maxLength={100} value={newField.field_name} onChange={e => setNewField(f => ({ ...f, field_name: e.target.value }))} />
            </label>
            <label>Type
              <select aria-label="New field type" value={newField.field_type} onChange={e => setNewField(f => ({ ...f, field_type: e.target.value }))}>
                {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            {newField.field_type === 'dropdown' && (
              <label>Picklist
                <select aria-label="New field picklist" required value={newField.picklist_type} onChange={e => setNewField(f => ({ ...f, picklist_type: e.target.value }))}>
                  <option value="">— Choose —</option>
                  {picklistTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
            )}
            <label>Step
              <select aria-label="New field step" value={newField.step} onChange={e => setNewField(f => ({ ...f, step: Number(e.target.value) }))}>
                <option value={2}>Step 2 · Product &amp; Details</option>
                <option value={3}>Step 3 · Response &amp; Workflow</option>
              </select>
            </label>
            <label className="cf-fieldcfg-toggle">
              <input type="checkbox" checked={newField.is_required} onChange={e => setNewField(f => ({ ...f, is_required: e.target.checked }))} /> Required
            </label>
            <button type="submit" className="btn btn-primary btn-sm">Add field</button>
          </div>
        </form>
      )}

      {error && <div className="cf-fieldcfg-note cf-fieldcfg-note--warn">{error}</div>}
      {flash && <div className="cf-fieldcfg-note">{flash}</div>}

      <div className="cf-fieldcfg-note">
        <strong>Platform fields</strong> are marked <span className="cf-fieldcfg-badge">core</span>. They back a
        control the case form renders itself, so they can be relabelled, reordered or hidden — but never deleted.
        <span className="cf-fieldcfg-badge cf-fieldcfg-badge--e2b">E2B</span> marks a field whose value reaches the
        E2B safety report MIMS writes. <span className="cf-fieldcfg-badge cf-fieldcfg-badge--cut">clean-up</span> marks
        a field the case form clean-up hid; its stored values stay and it can be shown again.
        Fields marked <span className="cf-fieldcfg-badge cf-fieldcfg-badge--inherit">inherited</span> come from the
        platform default; editing one creates an override for this organisation only and leaves other
        organisations untouched.
      </div>

      <div className="cf-fieldcfg-count">
        {total} fields configured for {caseType}
        {casesTotal !== null && <> · "Used in cases" counts this organisation's {casesTotal} cases; "—" means the form never had a place to store the value</>}
      </div>

      {sections.map(section => {
        const visible = showHidden ? section.fields : section.fields.filter(f => !f.is_hidden)
        if (!visible.length && section.is_visible) return null
        return (
          <section key={section.section_name} className={`cf-fieldcfg-section${section.is_visible ? '' : ' cf-fieldcfg-section--off'}`}>
            <div className="cf-fieldcfg-section-head">
              <h4>{section.section_name}{!section.is_visible && <span className="cf-fieldcfg-badge cf-fieldcfg-badge--cut">section off</span>}</h4>
              {section.can_switch && (
                <label className="cf-fieldcfg-toggle">
                  <input type="checkbox" aria-label={`${section.section_name} on`} checked={section.is_visible} onChange={e => switchSection(section, e.target.checked)} />
                  Section on
                </label>
              )}
            </div>
            {visible.length > 0 && (
            <table className="cf-fieldcfg-table">
              <thead>
                <tr>
                  <th>Field</th><th>Label shown to users</th><th>Required</th><th>Visible</th><th>Order</th><th>Step</th><th>Used in cases</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(f => (
                  <tr key={f.id} className={f.is_hidden ? 'is-hidden-row' : ''}>
                    <td>
                      <span className="cf-fieldcfg-name">{f.field_name}</span>
                      <span className="cf-fieldcfg-type">{f.field_type}</span>
                      {f.is_core && <span className="cf-fieldcfg-badge">core</span>}
                      {f.is_inherited && <span className="cf-fieldcfg-badge cf-fieldcfg-badge--inherit">inherited</span>}
                      {f.e2b && <span className="cf-fieldcfg-badge cf-fieldcfg-badge--e2b" title={`Sent in the E2B file as <${f.e2b}>`}>E2B</span>}
                      {f.removed_in_cleanup && f.is_hidden && <span className="cf-fieldcfg-badge cf-fieldcfg-badge--cut" title="Hidden by the case form clean-up; values kept">clean-up</span>}
                    </td>
                    <td>
                      <input
                        type="text"
                        aria-label={`Label shown for ${f.field_name}`}
                        defaultValue={f.custom_label || ''}
                        placeholder={f.field_name}
                        disabled={savingId === f.id}
                        onBlur={e => {
                          const v = e.target.value.trim()
                          if (v !== (f.custom_label || '')) patchField(f, { custom_label: v })
                        }}
                      />
                    </td>
                    <td className="cf-fieldcfg-centre">
                      <input
                        type="checkbox"
                        aria-label={`${f.field_name} required`}
                        checked={f.is_required}
                        disabled={savingId === f.id || f.is_hidden}
                        title={f.is_hidden ? 'Show the field before making it required' : ''}
                        onChange={e => patchField(f, { is_required: e.target.checked })}
                      />
                    </td>
                    <td className="cf-fieldcfg-centre">
                      <input
                        type="checkbox"
                        aria-label={`${f.field_name} visible`}
                        checked={!f.is_hidden}
                        disabled={savingId === f.id}
                        onChange={e => patchField(f, { is_hidden: !e.target.checked, ...(!e.target.checked && f.is_required ? { is_required: false } : {}) })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        aria-label={`${f.field_name} order`}
                        min="0"
                        max="9999"
                        defaultValue={f.sort_order ?? 0}
                        disabled={savingId === f.id}
                        onBlur={e => {
                          const v = parseInt(e.target.value, 10)
                          if (!Number.isNaN(v) && v !== (f.sort_order ?? 0)) patchField(f, { sort_order: v })
                        }}
                      />
                    </td>
                    <td>
                      {f.step?.movable ? (
                        <select aria-label={`${f.field_name} step`} value={f.step.step} disabled={savingId === f.id}
                          onChange={e => patchField(f, { display_tab: e.target.value === '3' ? 'info' : null })}>
                          <option value={2}>Step 2</option>
                          <option value={3}>Step 3</option>
                        </select>
                      ) : <span className="cf-fieldcfg-step">{f.step?.label}</span>}
                    </td>
                    <td className="cf-fieldcfg-centre" title={usage?.[f.id]?.source ? `Where the value lives: ${usage[f.id].source}` : ''}>
                      {usage === null ? '…' : (usage[f.id]?.cases ?? '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </section>
        )
      })}
    </div>
  )
}
