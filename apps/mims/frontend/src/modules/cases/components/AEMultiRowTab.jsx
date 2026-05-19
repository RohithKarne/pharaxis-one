import { useState } from 'react'
import toast from '../../../shared/utils/toast'
import { confirm } from '../../../shared/utils/confirm'
import { httpFetch } from '../../../shared/api/httpFetch.js'
import SeriousnessChecklist from '../../../shared/components/SeriousnessChecklist'

const API = import.meta.env.VITE_API_URL || '/api'

export default function AEMultiRowTab({ tabKey, rows, locked, versionId, headers, onRowsChange }) {
  const [showForm, setShowForm] = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(null)

  const blankForm = () => {
    if (tabKey === 'lab-results')     return { test_name: '', result: '', unit: '', normal_range: '', test_date: '' }
    if (tabKey === 'medical-history') return { condition_name: '', start_date: '', end_date: '', is_ongoing: false, notes: '' }
    if (tabKey === 'product-info')    return { product_name: '', dose: '', dose_unit: '', route_of_admin: '', frequency: '', start_date: '', end_date: '', indication: '', is_suspect: true, is_concomitant: false }
    if (tabKey === 'events')          return { event_description: '', outcome: 'unknown', start_date: '', end_date: '', is_serious: false, is_death: false, is_life_threatening: false, is_hospitalization: false, is_disability: false, is_congenital_anomaly: false, is_other_medically_important: false, is_required_intervention: false, is_lab_abnormality: false }
    return {}
  }
  const [form, setForm] = useState(blankForm)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

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
    { key: 'outcome',           label: 'Outcome' },
    { key: 'start_date',        label: 'Start Date' },
    { key: 'end_date',          label: 'End Date' },
    { key: 'is_serious',        label: 'Serious', render: v => v ? '✅' : '—' },
    { key: 'is_death',          label: 'Death',   render: v => v ? '✅' : '—' },
  ]
  const cols = tabKey === 'lab-results' ? labCols : tabKey === 'medical-history' ? mhCols : tabKey === 'events' ? eventCols : piCols

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
                  <div className="cf-form-field"><label>Test Name</label><input value={form.test_name} onChange={e => set('test_name', e.target.value)} /></div>
                  <div className="cf-form-field"><label>Result</label><input value={form.result} onChange={e => set('result', e.target.value)} /></div>
                  <div className="cf-form-field"><label>Unit</label><input value={form.unit} onChange={e => set('unit', e.target.value)} /></div>
                  <div className="cf-form-field"><label>Normal Range</label><input value={form.normal_range} onChange={e => set('normal_range', e.target.value)} /></div>
                  <div className="cf-form-field"><label>Test Date</label><input type="date" value={form.test_date} onChange={e => set('test_date', e.target.value)} /></div>
                </>}
                {tabKey === 'medical-history' && <>
                  <div className="cf-form-field"><label>Condition Name</label><input value={form.condition_name} onChange={e => set('condition_name', e.target.value)} /></div>
                  <div className="cf-form-field"><label>Start Date</label><input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} /></div>
                  <div className="cf-form-field"><label>End Date</label><input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} /></div>
                  <div className="cf-form-field">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={form.is_ongoing} onChange={e => set('is_ongoing', e.target.checked)} />
                      Ongoing
                    </label>
                  </div>
                  <div className="cf-form-field cf-form-field--full"><label>Notes</label><textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
                </>}
                {tabKey === 'events' && <>
                  <div className="cf-form-field cf-form-field--full"><label>Event Description</label><textarea rows={2} value={form.event_description} onChange={e => set('event_description', e.target.value)} /></div>
                  <div className="cf-form-field"><label>Outcome</label><select value={form.outcome} onChange={e => set('outcome', e.target.value)}>
                    <option value="recovered">Recovered</option><option value="recovering">Recovering</option><option value="not_recovered">Not recovered</option><option value="recovered_with_sequelae">Recovered with sequelae</option><option value="fatal">Fatal</option><option value="unknown">Unknown</option>
                  </select></div>
                  <div className="cf-form-field"><label>Start Date</label><input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} /></div>
                  <div className="cf-form-field"><label>End Date</label><input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} /></div>
                  <div className="cf-form-field cf-form-field--full">
                    <SeriousnessChecklist value={form} onChange={setForm} />
                  </div>
                </>}
                {tabKey === 'product-info' && <>
                  <div className="cf-form-field"><label>Product Name</label><input value={form.product_name} onChange={e => set('product_name', e.target.value)} /></div>
                  <div className="cf-form-field"><label>Dose</label><input value={form.dose} onChange={e => set('dose', e.target.value)} /></div>
                  <div className="cf-form-field"><label>Dose Unit</label><input value={form.dose_unit} onChange={e => set('dose_unit', e.target.value)} /></div>
                  <div className="cf-form-field"><label>Route of Admin</label><input value={form.route_of_admin} onChange={e => set('route_of_admin', e.target.value)} /></div>
                  <div className="cf-form-field"><label>Frequency</label><input value={form.frequency} onChange={e => set('frequency', e.target.value)} /></div>
                  <div className="cf-form-field"><label>Start Date</label><input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} /></div>
                  <div className="cf-form-field"><label>End Date</label><input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} /></div>
                  <div className="cf-form-field cf-form-field--full"><label>Indication</label><input value={form.indication} onChange={e => set('indication', e.target.value)} /></div>
                  <div className="cf-form-field">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={form.is_suspect} onChange={e => set('is_suspect', e.target.checked)} />
                      Suspect Drug
                    </label>
                  </div>
                  <div className="cf-form-field">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={form.is_concomitant} onChange={e => set('is_concomitant', e.target.checked)} />
                      Concomitant Med
                    </label>
                  </div>
                </>}
              </div>
              <div className="cf-form-actions" style={{ paddingLeft: 0, marginTop: 10 }}>
                <button type="button" className="cf-cancel-btn" onClick={() => { setShowForm(false); setForm(blankForm()) }}>Cancel</button>
                <button type="submit" className="cf-save-btn" disabled={saving}>{saving ? 'Adding…' : '+ Add Record'}</button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
