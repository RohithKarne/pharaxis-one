import { useState } from 'react'
import toast from '../../../shared/utils/toast'
import { confirm } from '../../../shared/utils/confirm'
import { httpFetch } from '../../../shared/api/httpFetch.js'
import SeriousnessChecklist from '../../../shared/components/SeriousnessChecklist'

const API = import.meta.env.VITE_API_URL || '/api'

function picklistOptions(getPicklistOptions, sectionName, fieldName) {
  const list = getPicklistOptions?.(sectionName, fieldName) || []
  return Array.isArray(list) ? list : []
}

// Admin settings (Customize Forms) for the list tabs: form key → field_setup name
// in the tab's section. Migration 118 links the rows (catalogs/panelCoreFields).
const LIST_TAB_SECTION = {
  events: 'AE — Events & Seriousness',
  'product-info': 'AE — Product Information',
  'lab-results': 'AE — Lab Results',
  'medical-history': 'AE — Medical History',
}
const LIST_TAB_FIELDS = {
  events: { event_description: 'Event Description', start_date: 'Onset Date', outcome: 'Outcome' },
  'product-info': {
    product_name: 'Product Name', batch_lot_number: 'Batch / Lot Number', dose: 'Dose', dose_unit: 'Dose Unit',
    route_of_admin: 'Route of Administration', start_date: 'Start Date', end_date: 'Stop Date',
    indication: 'Indication', action_taken: 'Action Taken', is_concomitant: 'Concomitant Medications',
  },
  'lab-results': { lab_name: 'Lab Name', test_date: 'Test Date', test_name: 'Test Name', result: 'Result Value', normal_range: 'Normal Range' },
  'medical-history': { condition_name: 'Medical History', notes: 'Relevant History' },
}

export default function AEMultiRowTab({ tabKey, rows, locked, versionId, headers, getPicklistOptions, onRowsChange, caseId, panelField = null }) {
  // The admin's label / required / hidden for a form key, or the built-in label.
  const cfg = (key, fallback) => {
    const name = LIST_TAB_FIELDS[tabKey]?.[key]
    if (!panelField || !name) return { label: fallback, required: false, hidden: false }
    return panelField(LIST_TAB_SECTION[tabKey], name, fallback)
  }
  const field = (key, fallback, control, { full = false } = {}) => {
    const c = cfg(key, fallback)
    if (c.hidden) return null
    return (
      <div className={`cf-form-field${full ? ' cf-form-field--full' : ''}`}>
        <label>{c.required ? `${c.label} *` : c.label}</label>
        {control}
      </div>
    )
  }
  // Text typed into the add-row form is kept per case, version and section until the row is added or cancelled.
  const draftKey = `mims_case_${caseId}_ae_${versionId}_${tabKey}_add_row`
  const readDraft = () => { try { return JSON.parse(sessionStorage.getItem(draftKey)) } catch { return null } }
  const [showForm, setShowForm] = useState(() => !!readDraft())
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(null)

  const blankForm = () => {
    if (tabKey === 'lab-results')     return { lab_name: '', test_name: '', result: '', unit: '', normal_range: '', test_date: '' }
    if (tabKey === 'medical-history') return { condition_name: '', start_date: '', end_date: '', is_ongoing: false, notes: '' }
    if (tabKey === 'product-info')    return { product_name: '', product_type: '', product_category: '', batch_lot_number: '', dose: '', dose_unit: '', route_of_admin: '', frequency: '', start_date: '', end_date: '', indication: '', action_taken: '', dechallenge: '', rechallenge: '', is_suspect: true, is_concomitant: false }
    if (tabKey === 'events')          return { event_description: '', meddra_term: '', outcome: '', reported_causality: '', frequency: '', causality_assessment: '', seriousness: '', start_date: '', end_date: '', is_serious: false, is_death: false, is_life_threatening: false, is_hospitalization: false, is_disability: false, is_congenital_anomaly: false, is_other_medically_important: false, is_required_intervention: false, is_lab_abnormality: false }
    return {}
  }
  const [form, setForm] = useState(() => readDraft() || blankForm())
  const editForm = next => {
    setForm(next)
    try { sessionStorage.setItem(draftKey, JSON.stringify(next)) } catch { /* no-op */ }
  }
  const set = (k, v) => editForm({ ...form, [k]: v })

  const deleteUrl = (rowId) => {
    if (tabKey === 'lab-results')     return `${API}/cases/ae/lab-results/${rowId}`
    if (tabKey === 'medical-history') return `${API}/cases/ae/medical-history/${rowId}`
    if (tabKey === 'product-info')    return `${API}/cases/ae/product-info/${rowId}`
    if (tabKey === 'events')          return `${API}/cases/ae/events/${rowId}`
    return null
  }
  const postUrl = () => `${API}/cases/ae/versions/${versionId}/${tabKey}`

  async function handleAdd(e) {
    e.preventDefault()
    const missing = Object.keys(LIST_TAB_FIELDS[tabKey] || {})
      .filter(k => typeof form[k] !== 'boolean')
      .filter(k => { const c = cfg(k, k); return c.required && !c.hidden && String(form[k] ?? '').trim() === '' })
      .map(k => cfg(k, k).label)
    if (missing.length) { toast.error(`Please fill: ${missing.join(', ')}`); return }
    setSaving(true)
    try {
      const body = { ...form }
      const boolCols = ['is_ongoing','is_suspect','is_concomitant','is_serious','is_death','is_life_threatening','is_hospitalization','is_disability','is_congenital_anomaly','is_other_medically_important','is_required_intervention','is_lab_abnormality']
      boolCols.forEach(k => { if (typeof body[k] === 'boolean') body[k] = body[k] ? 1 : 0 })
      const res  = await httpFetch(postUrl(), { method: 'POST', headers, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Add failed'); return }
      onRowsChange([...(Array.isArray(rows) ? rows : []), data])
      setForm(blankForm())
      setShowForm(false)
      sessionStorage.removeItem(draftKey)
    } catch { toast.error('Network error') } finally { setSaving(false) }
  }

  async function handleDelete(rowId) {
    if (!await confirm('Remove this record?')) return
    setDeleting(rowId)
    try {
      const url = deleteUrl(rowId)
      if (!url) return
      const res = await httpFetch(url, { method: 'DELETE', headers })
      if (res.ok) onRowsChange((rows || []).filter(r => r.id !== rowId))
      else toast.error('Delete failed')
    } catch { toast.error('Network error') } finally { setDeleting(null) }
  }

  const safeRows = Array.isArray(rows) ? rows : []

  const labCols = [
    { key: 'lab_name',     label: 'Lab Name' },
    { key: 'test_name',    label: 'Test Name' },
    { key: 'result',       label: 'Result' },
    { key: 'unit',         label: 'Unit' },
    { key: 'normal_range', label: 'Normal Range' },
    { key: 'test_date',    label: 'Test Date' },
  ]
  const mhCols = [
    { key: 'condition_name', label: 'Condition' },
    { key: 'start_date',     label: 'Start Date' },
    { key: 'end_date',       label: 'End Date' },
    { key: 'is_ongoing',     label: 'Ongoing', render: v => v ? '✅' : '—' },
    { key: 'notes',          label: 'Notes' },
  ]
  const piCols = [
    { key: 'product_name',   label: 'Product' },
    { key: 'product_type',   label: 'Product Type' },
    { key: 'product_category', label: 'Product Category' },
    { key: 'batch_lot_number', label: 'Batch / Lot' },
    { key: 'dose',           label: 'Dose' },
    { key: 'dose_unit',      label: 'Unit' },
    { key: 'route_of_admin', label: 'Route' },
    { key: 'frequency',      label: 'Frequency' },
    { key: 'indication',     label: 'Indication' },
    { key: 'is_suspect',     label: 'Suspect',     render: v => v ? '✅' : '—' },
    { key: 'is_concomitant', label: 'Concomitant', render: v => v ? '✅' : '—' },
  ]
  const eventCols = [
    { key: 'event_description', label: 'Event Description' },
    { key: 'meddra_term',       label: 'MedDRA Term' },
    { key: 'outcome',           label: 'Outcome' },
    { key: 'reported_causality', label: 'Reported Causality' },
    { key: 'frequency',         label: 'Frequency' },
    { key: 'causality_assessment', label: 'Causality Assessment' },
    { key: 'start_date',        label: 'Start Date' },
    { key: 'end_date',          label: 'End Date' },
    { key: 'is_serious',        label: 'Serious', render: v => v ? '✅' : '—' },
    { key: 'is_death',          label: 'Death',   render: v => v ? '✅' : '—' },
  ]
  const baseCols = tabKey === 'lab-results' ? labCols : tabKey === 'medical-history' ? mhCols : tabKey === 'events' ? eventCols : piCols
  // Column headings follow the same admin settings as the form; a hidden field's column goes.
  const cols = baseCols.filter(c => !cfg(c.key, c.label).hidden).map(c => ({ ...c, label: cfg(c.key, c.label).label }))

  return (
    <div className="cf-multirow-section">
      {safeRows.length === 0 ? (
        <div className="cf-multirow-empty">No records yet. {!locked && 'Use "+ Add Row" to add one.'}</div>
      ) : (
        <div className="cf-multirow-table-wrap">
          <table className="cf-multirow-table">
            <thead>
              <tr>
                {cols.map(c => <th key={c.key}>{c.label}</th>)}
                {!locked && <th style={{ width: 40 }}></th>}
              </tr>
            </thead>
            <tbody>
              {safeRows.map(row => (
                <tr key={row.id} style={{ opacity: deleting === row.id ? 0.4 : 1 }}>
                  {cols.map(c => (
                    <td key={c.key}>
                      {c.render ? c.render(row[c.key]) : (row[c.key] != null && row[c.key] !== '' ? String(row[c.key]) : '—')}
                    </td>
                  ))}
                  {!locked && (
                    <td>
                      <button className="cf-multirow-del-btn" onClick={() => handleDelete(row.id)} disabled={deleting === row.id} title="Remove">✕</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!locked && (
        <div className="cf-multirow-add-section">
          {!showForm ? (
            <button className="cf-multirow-add-btn" onClick={() => setShowForm(true)}>+ Add Row</button>
          ) : (
            <form className="cf-multirow-form" onSubmit={handleAdd}>
              <div className="cf-form-grid">
                {tabKey === 'lab-results' && <>
                  {field('lab_name', 'Lab Name', <input value={form.lab_name} onChange={e => set('lab_name', e.target.value)} />)}
                  {field('test_name', 'Test Name', <input value={form.test_name} onChange={e => set('test_name', e.target.value)} />)}
                  {field('result', 'Result', <input value={form.result} onChange={e => set('result', e.target.value)} />)}
                  <div className="cf-form-field"><label>Unit</label><input value={form.unit} onChange={e => set('unit', e.target.value)} /></div>
                  {field('normal_range', 'Normal Range', <input value={form.normal_range} onChange={e => set('normal_range', e.target.value)} />)}
                  {field('test_date', 'Test Date', <input type="date" value={form.test_date} onChange={e => set('test_date', e.target.value)} />)}
                </>}
                {tabKey === 'medical-history' && <>
                  {field('condition_name', 'Condition Name', <input value={form.condition_name} onChange={e => set('condition_name', e.target.value)} />)}
                  <div className="cf-form-field"><label>Start Date</label><input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} /></div>
                  <div className="cf-form-field"><label>End Date</label><input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} /></div>
                  <div className="cf-form-field">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={form.is_ongoing} onChange={e => set('is_ongoing', e.target.checked)} />
                      Ongoing
                    </label>
                  </div>
                  {field('notes', 'Notes', <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />, { full: true })}
                </>}
                {tabKey === 'events' && <>
                  {field('event_description', 'Event Description', <textarea rows={2} value={form.event_description} onChange={e => set('event_description', e.target.value)} />, { full: true })}
                  <div className="cf-form-field"><label>MedDRA Term</label><select value={form.meddra_term} onChange={e => set('meddra_term', e.target.value)}><option value="">— Select —</option>{picklistOptions(getPicklistOptions, 'AE — Events & Seriousness', 'MedDRA Term').map(option => <option key={option.value} value={option.value}>{option.label || option.value}</option>)}</select></div>
                  {field('outcome', 'Outcome', <select value={form.outcome} onChange={e => set('outcome', e.target.value)}><option value="">— Select —</option>{picklistOptions(getPicklistOptions, 'AE — Events & Seriousness', 'Outcome').map(option => <option key={option.value} value={option.value}>{option.label || option.value}</option>)}</select>)}
                  <div className="cf-form-field"><label>Reported Causality</label><select value={form.reported_causality} onChange={e => set('reported_causality', e.target.value)}><option value="">— Select —</option>{picklistOptions(getPicklistOptions, 'AE — Events & Seriousness', 'Reported Causality').map(option => <option key={option.value} value={option.value}>{option.label || option.value}</option>)}</select></div>
                  <div className="cf-form-field"><label>Frequency</label><select value={form.frequency} onChange={e => set('frequency', e.target.value)}><option value="">— Select —</option>{picklistOptions(getPicklistOptions, 'AE — Events & Seriousness', 'Frequency').map(option => <option key={option.value} value={option.value}>{option.label || option.value}</option>)}</select></div>
                  <div className="cf-form-field"><label>Causality Assessment</label><select value={form.causality_assessment} onChange={e => set('causality_assessment', e.target.value)}><option value="">— Select —</option>{picklistOptions(getPicklistOptions, 'AE — Events & Seriousness', 'Causality Assessment').map(option => <option key={option.value} value={option.value}>{option.label || option.value}</option>)}</select></div>
                  {field('start_date', 'Start Date', <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />)}
                  <div className="cf-form-field"><label>End Date</label><input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} /></div>
                  <div className="cf-form-field cf-form-field--full">
                    <SeriousnessChecklist value={form} onChange={editForm} />
                  </div>
                </>}
                {tabKey === 'product-info' && <>
                  {field('product_name', 'Product Name', <input value={form.product_name} onChange={e => set('product_name', e.target.value)} />)}
                  <div className="cf-form-field"><label>Product Type</label><select value={form.product_type} onChange={e => set('product_type', e.target.value)}><option value="">— Select —</option>{picklistOptions(getPicklistOptions, 'AE — Product Information', 'Product Type').map(option => <option key={option.value} value={option.value}>{option.label || option.value}</option>)}</select></div>
                  <div className="cf-form-field"><label>Product Category</label><select value={form.product_category} onChange={e => set('product_category', e.target.value)}><option value="">— Select —</option>{picklistOptions(getPicklistOptions, 'AE — Product Information', 'Product Category').map(option => <option key={option.value} value={option.value}>{option.label || option.value}</option>)}</select></div>
                  {field('batch_lot_number', 'Batch / Lot Number', <input value={form.batch_lot_number} onChange={e => set('batch_lot_number', e.target.value)} />)}
                  {field('dose', 'Dose', <input value={form.dose} onChange={e => set('dose', e.target.value)} />)}
                  {field('dose_unit', 'Dose Unit', <select value={form.dose_unit} onChange={e => set('dose_unit', e.target.value)}><option value="">— Select —</option>{picklistOptions(getPicklistOptions, 'AE — Product Information', 'Dose Unit').map(option => <option key={option.value} value={option.value}>{option.label || option.value}</option>)}</select>)}
                  {field('route_of_admin', 'Route of Admin', <select value={form.route_of_admin} onChange={e => set('route_of_admin', e.target.value)}><option value="">— Select —</option>{picklistOptions(getPicklistOptions, 'AE — Product Information', 'Route of Administration').map(option => <option key={option.value} value={option.value}>{option.label || option.value}</option>)}</select>)}
                  <div className="cf-form-field"><label>Frequency</label><input value={form.frequency} onChange={e => set('frequency', e.target.value)} /></div>
                  {field('start_date', 'Start Date', <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />)}
                  {field('end_date', 'End Date', <input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} />)}
                  {field('indication', 'Indication', <input value={form.indication} onChange={e => set('indication', e.target.value)} />, { full: true })}
                  {field('action_taken', 'Action Taken', <select value={form.action_taken} onChange={e => set('action_taken', e.target.value)}><option value="">— Select —</option>{picklistOptions(getPicklistOptions, 'AE — Product Information', 'Action Taken').map(option => <option key={option.value} value={option.value}>{option.label || option.value}</option>)}</select>)}
                  <div className="cf-form-field"><label>Dechallenge</label><select value={form.dechallenge} onChange={e => set('dechallenge', e.target.value)}><option value="">— Select —</option>{picklistOptions(getPicklistOptions, 'AE — Product Information', 'Dechallenge').map(option => <option key={option.value} value={option.value}>{option.label || option.value}</option>)}</select></div>
                  <div className="cf-form-field"><label>Rechallenge</label><select value={form.rechallenge} onChange={e => set('rechallenge', e.target.value)}><option value="">— Select —</option>{picklistOptions(getPicklistOptions, 'AE — Product Information', 'Rechallenge').map(option => <option key={option.value} value={option.value}>{option.label || option.value}</option>)}</select></div>
                  <div className="cf-form-field">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={form.is_suspect} onChange={e => set('is_suspect', e.target.checked)} />
                      Suspect Drug
                    </label>
                  </div>
                  {!cfg('is_concomitant', 'Concomitant Med').hidden && (
                    <div className="cf-form-field">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={form.is_concomitant} onChange={e => set('is_concomitant', e.target.checked)} />
                        {cfg('is_concomitant', 'Concomitant Med').label}
                      </label>
                    </div>
                  )}
                </>}
              </div>
              <div className="cf-form-actions" style={{ paddingLeft: 0, marginTop: 10 }}>
                <button type="button" className="cf-cancel-btn" onClick={() => { setShowForm(false); setForm(blankForm()); sessionStorage.removeItem(draftKey) }}>Cancel</button>
                <button type="submit" className="cf-save-btn" disabled={saving}>{saving ? 'Adding…' : '+ Add Record'}</button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
