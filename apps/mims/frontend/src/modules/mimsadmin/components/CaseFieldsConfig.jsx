import { useCallback, useEffect, useState } from 'react'
import { httpFetch } from '../../../shared/api/httpFetch.js'

// Phase 3 admin surface. The case form draws its fields from `field_setup`;
// this screen is where an admin changes what they are called, whether they are
// required, whether they appear, and in what order — per org, per case type.
// Locked with Rohith 2026-07-28: fields are controlled from the backend, not
// hardcoded in the form.

const CASE_TYPES = ['MI', 'AE', 'PC']

const API = '/api/admin/case-fields'

export default function CaseFieldsConfig() {
  const [caseType, setCaseType] = useState('MI')
  const [sections, setSections] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const [savingId, setSavingId] = useState(null)
  const [showHidden, setShowHidden] = useState(true)

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
  }, [caseType])

  useEffect(() => { load() }, [load])

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
        </div>
      </div>

      {error && <div className="cf-fieldcfg-note cf-fieldcfg-note--warn">{error}</div>}
      {flash && <div className="cf-fieldcfg-note">{flash}</div>}

      <div className="cf-fieldcfg-note">
        <strong>Platform fields</strong> are marked <span className="cf-fieldcfg-badge">core</span>. They back a
        control the case form renders itself, so they can be relabelled, reordered or hidden — but never deleted.
        Fields marked <span className="cf-fieldcfg-badge cf-fieldcfg-badge--inherit">inherited</span> come from the
        platform default; editing one creates an override for this organisation only and leaves other
        organisations untouched.
      </div>

      <div className="cf-fieldcfg-count">{total} fields configured for {caseType}</div>

      {sections.map(section => {
        const visible = showHidden ? section.fields : section.fields.filter(f => !f.is_hidden)
        if (!visible.length) return null
        return (
          <section key={section.section_name} className="cf-fieldcfg-section">
            <h4>{section.section_name}</h4>
            <table className="cf-fieldcfg-table">
              <thead>
                <tr>
                  <th>Field</th><th>Label shown to users</th><th>Required</th><th>Visible</th><th>Order</th>
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
                    </td>
                    <td>
                      <input
                        type="text"
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
                        checked={f.is_required}
                        disabled={savingId === f.id || f.is_hidden}
                        title={f.is_hidden ? 'Show the field before making it required' : ''}
                        onChange={e => patchField(f, { is_required: e.target.checked })}
                      />
                    </td>
                    <td className="cf-fieldcfg-centre">
                      <input
                        type="checkbox"
                        checked={!f.is_hidden}
                        disabled={savingId === f.id}
                        onChange={e => patchField(f, { is_hidden: !e.target.checked, ...(!e.target.checked && f.is_required ? { is_required: false } : {}) })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
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
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )
      })}
    </div>
  )
}
