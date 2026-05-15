/**
 * PicklistsTable.jsx — MIMS Admin > Tables > General
 *
 * Cross-tenant picklist value management. Drives the dropdowns that appear
 * in the Case Form (via field_setup.picklist_type -> picklists.field_type).
 *
 * 3 filter dropdowns: Table name (category), Tenant, Department
 * 5-column grid: Value, Division (tenant), Inactive, Edit, Delete
 *
 * CSS namespace: ma-pt-
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch.js'
import { useAdminTenant } from '../../utils/AdminTenantContext'
import './PicklistsTable.css'

const API = '/api/admin/picklists-table'

// ─────────────────────────────────────────────────────────────────────────────
export default function PicklistsTable() {
  const { token } = useAuth()
  const H = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])

  // Global tenant from admin header
  const { tenants: ctxTenants, tenantId: ctxTenantId } = useAdminTenant()

  // Reference data
  const [categories,  setCategories]  = useState([])
  const [fields,      setFields]      = useState([])  // for the "field" filter (depends on category)
  const [tenants,     setTenants]     = useState([])
  const [departments, setDepartments] = useState([])

  // Filters — tenant_id defaults to the global picker; admin can still override to "All"
  const [filter, setFilter] = useState({
    category: '',
    field_type: '',
    tenant_id: ctxTenantId || '',
    department: '',
    search: '',
  })
  // When the global tenant changes, sync filter only if admin hasn't explicitly broadened to "All"
  useEffect(() => {
    setFilter(f => (f.tenant_id === '' ? f : { ...f, tenant_id: ctxTenantId || '' }))
  }, [ctxTenantId])
  useEffect(() => { setTenants(ctxTenants) }, [ctxTenants])

  // Grid data
  const [values,   setValues]   = useState([])
  const [total,    setTotal]    = useState(0)
  const [loading,  setLoading]  = useState(false)
  const [flash,    setFlash]    = useState(null)
  const [selected, setSelected] = useState([])

  // Modal state
  const [modal,    setModal]    = useState(null)   // null | { mode:'create' } | { mode:'edit', row }
  const [infoModal, setInfoModal] = useState(null)
  const dragRowRef = useRef(null)

  // ── Load reference data once
  useEffect(() => {
    Promise.all([
      httpFetch(`${API}/categories`,  { headers: H }).then(r => r.json()),
      httpFetch(`${API}/tenants`,     { headers: H }).then(r => r.json()),
      httpFetch(`${API}/departments`, { headers: H }).then(r => r.json()),
    ]).then(([c, t, d]) => {
      setCategories(c.categories || [])
      setTenants(t.tenants || [])
      setDepartments(d.departments || [])
    }).catch(() => {})
  }, [H])

  // ── Load fields when category changes
  useEffect(() => {
    const url = filter.category
      ? `${API}/fields?category=${encodeURIComponent(filter.category)}`
      : `${API}/fields`
    httpFetch(url, { headers: H })
      .then(r => r.json())
      .then(d => setFields(d.fields || []))
      .catch(() => setFields([]))
  }, [filter.category, H])

  // ── Load values when filters change
  const loadValues = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (filter.category)   qs.set('category',   filter.category)
      if (filter.field_type) qs.set('field_type', filter.field_type)
      if (filter.tenant_id)  qs.set('tenant_id',  filter.tenant_id)
      if (filter.department) qs.set('department', filter.department)
      if (filter.search)     qs.set('search',     filter.search)
      qs.set('limit', 500)
      const d = await httpFetch(`${API}/values?${qs}`, { headers: H }).then(r => r.json())
      setValues(d.values || [])
      setTotal(d.total || 0)
      setSelected([])
    } catch {
      setValues([]); setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [filter, H])

  useEffect(() => { loadValues() }, [loadValues])

  function showFlash(msg, type = 'success') {
    setFlash({ msg, type })
    setTimeout(() => setFlash(null), 3000)
  }

  function setF(key, val) {
    setFilter(f => ({
      ...f,
      [key]: val,
      // reset field_type when category changes
      ...(key === 'category' ? { field_type: '' } : {}),
    }))
  }

  // ── Toggle inactive
  async function toggleStatus(row) {
    const nextStatus = row.status === 'Active' ? 'Inactive' : 'Active'
    setValues(v => v.map(x => x.id === row.id ? { ...x, status: nextStatus } : x))
    try {
      const r = await httpFetch(`${API}/values/${row.id}`, {
        method: 'PUT', headers: H,
        body: JSON.stringify({ status: nextStatus }),
      })
      if (!r.ok) {
        const d = await r.json()
        showFlash(d.error || 'Failed to update status.', 'error')
        setValues(v => v.map(x => x.id === row.id ? { ...x, status: row.status } : x))
      } else {
        showFlash(`${row.value} marked ${nextStatus}.`)
      }
    } catch {
      showFlash('Network error.', 'error')
      setValues(v => v.map(x => x.id === row.id ? { ...x, status: row.status } : x))
    }
  }

  async function exportCsv() {
    try {
      const qs = new URLSearchParams()
      if (filter.category)   qs.set('category',   filter.category)
      if (filter.field_type) qs.set('field_type', filter.field_type)
      if (filter.tenant_id)  qs.set('tenant_id',  filter.tenant_id)
      if (filter.department) qs.set('department', filter.department)
      if (filter.search)     qs.set('search',     filter.search)
      const res = await httpFetch(`${API}/export?${qs}`, { headers: H })
      if (!res.ok) { showFlash('Export failed.', 'error'); return }
      const text = await res.text()
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      const stamp = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `picklists-export-${stamp}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showFlash('CSV downloaded.')
    } catch { showFlash('Network error during export.', 'error') }
  }

  async function deleteValue(row) {
    let force = false
    try {
      const usage = await httpFetch(`${API}/values/${row.id}/where-used`, { headers: H }).then(r => r.json())
      if (Number(usage.total || 0) > 0) {
        const sample = (usage.samples || []).map(s => `${s.table}#${s.case_id}`).join(', ')
        if (!window.confirm(`"${row.value}" is used ${usage.total} time(s). Samples: ${sample || 'none'}.\n\nDelete anyway and remove it from future dropdowns?`)) return
        force = true
      } else if (!window.confirm(`Delete "${row.value}" from ${row.tenant_name || 'tenant'}?\n\nThis cannot be undone.`)) {
        return
      }
    } catch {
      if (!window.confirm(`Could not check usage. Delete "${row.value}" anyway?`)) return
    }
    try {
      const r = await httpFetch(`${API}/values/${row.id}${force ? '?force=1' : ''}`, { method: 'DELETE', headers: H })
      if (!r.ok) {
        const d = await r.json()
        if (d.where_used) {
          showFlash(`${d.error} Used ${d.where_used.total} time(s).`, 'error')
        } else {
          showFlash(d.error || 'Delete failed.', 'error')
        }
        return
      }
      showFlash('Value deleted.')
      loadValues()
    } catch { showFlash('Network error.', 'error') }
  }

  const allVisibleSelected = values.length > 0 && values.every(v => selected.includes(v.id))

  function toggleSelected(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleAllVisible() {
    setSelected(allVisibleSelected ? [] : values.map(v => v.id))
  }

  async function bulkStatus(status) {
    if (!selected.length) return
    try {
      const r = await httpFetch(`${API}/values/bulk-status`, {
        method: 'POST', headers: H,
        body: JSON.stringify({ ids: selected, status }),
      })
      const d = await r.json()
      if (!r.ok) { showFlash(d.error || 'Bulk update failed.', 'error'); return }
      showFlash(`${d.updated} value(s) marked ${status}.`)
      loadValues()
    } catch { showFlash('Network error.', 'error') }
  }

  function sameSortGroup(a, b) {
    return a && b && a.category === b.category && a.field_type === b.field_type && Number(a.org_id || 0) === Number(b.org_id || 0)
  }

  async function dropRow(targetRow) {
    const sourceRow = dragRowRef.current
    dragRowRef.current = null
    if (!sourceRow || sourceRow.id === targetRow.id || !sameSortGroup(sourceRow, targetRow)) return
    const groupRows = values.filter(v => sameSortGroup(v, targetRow))
    const sourceIndex = groupRows.findIndex(v => v.id === sourceRow.id)
    const targetIndex = groupRows.findIndex(v => v.id === targetRow.id)
    if (sourceIndex < 0 || targetIndex < 0) return
    const nextGroup = [...groupRows]
    const [moved] = nextGroup.splice(sourceIndex, 1)
    nextGroup.splice(targetIndex, 0, moved)
    const payload = nextGroup.map((row, idx) => ({ id: row.id, sort_order: idx + 1 }))
    setValues(prev => prev.map(row => {
      const found = payload.find(p => p.id === row.id)
      return found ? { ...row, sort_order: found.sort_order } : row
    }))
    try {
      const r = await httpFetch(`${API}/values/reorder`, {
        method: 'PUT', headers: H, body: JSON.stringify(payload),
      })
      if (!r.ok) {
        const d = await r.json()
        showFlash(d.error || 'Reorder failed.', 'error')
        loadValues()
      } else {
        showFlash('Sort order saved.')
      }
    } catch {
      showFlash('Network error while saving order.', 'error')
      loadValues()
    }
  }

  async function openWhereUsed(row) {
    setInfoModal({ type: 'where-used', row, loading: true })
    try {
      const data = await httpFetch(`${API}/values/${row.id}/where-used`, { headers: H }).then(r => r.json())
      setInfoModal({ type: 'where-used', row, data })
    } catch {
      setInfoModal({ type: 'where-used', row, error: 'Unable to load where-used details.' })
    }
  }

  async function openHistory(row) {
    setInfoModal({ type: 'history', row, loading: true })
    try {
      const data = await httpFetch(`${API}/values/${row.id}/history`, { headers: H }).then(r => r.json())
      setInfoModal({ type: 'history', row, data })
    } catch {
      setInfoModal({ type: 'history', row, error: 'Unable to load history.' })
    }
  }

  return (
    <div className="ma-pt-page">

      {/* Header */}
      <div className="ma-pt-header">
        <h1 className="ma-pt-title">Picklists — Table Manager</h1>
        <div className="ma-pt-sub">
          Manage picklist values across all tenants. These values drive the dropdowns rendered in the Case Form.
        </div>
      </div>

      {/* Filters + Add */}
      <div className="ma-pt-filters">
        <div className="ma-pt-filter">
          <label>Table Name</label>
          <select
            className="ma-pt-select"
            value={filter.category}
            onChange={e => setF('category', e.target.value)}
          >
            <option value="">— All Categories —</option>
            {categories.map(c => (
              <option key={c.category} value={c.category}>{c.category} ({c.value_count})</option>
            ))}
          </select>
        </div>

        <div className="ma-pt-filter">
          <label>Field</label>
          <select
            className="ma-pt-select"
            value={filter.field_type}
            onChange={e => setF('field_type', e.target.value)}
          >
            <option value="">— All Fields —</option>
            {fields.map(f => (
              <option key={`${f.category}|${f.field_type}`} value={f.field_type}>
                {f.field_type}{!filter.category ? ` (${f.category})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="ma-pt-filter">
          <label>Tenant</label>
          <select
            className="ma-pt-select"
            value={filter.tenant_id}
            onChange={e => setF('tenant_id', e.target.value)}
          >
            <option value="">— All Tenants —</option>
            {tenants.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div className="ma-pt-filter">
          <label>Department</label>
          <select
            className="ma-pt-select"
            value={filter.department}
            onChange={e => setF('department', e.target.value)}
          >
            <option value="">— All Departments —</option>
            {departments.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div className="ma-pt-filter">
          <label>Search Value</label>
          <input
            className="ma-pt-input"
            placeholder="search…"
            value={filter.search}
            onChange={e => setF('search', e.target.value)}
          />
        </div>

        <div className="ma-pt-spacer" />
        <button className="ma-pt-action-btn" onClick={exportCsv} title="Download current filtered view as CSV">⬇ Export CSV</button>
        <button className="ma-pt-action-btn" onClick={() => setModal({ mode: 'import' })} title="Upload CSV to bulk-create/update values">⬆ Import CSV</button>
        <button className="ma-pt-add-btn" onClick={() => setModal({ mode: 'create' })}>+ Add Value</button>
      </div>

      {/* Flash */}
      {flash && (
        <div style={{
          margin: '10px 28px 0 28px', padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
          background: flash.type === 'error' ? '#fdecea' : '#e6f9ee',
          color:      flash.type === 'error' ? '#b91c1c' : '#1a7a3f',
          border:     `1px solid ${flash.type === 'error' ? '#f5c6c6' : '#a7f3c1'}`,
        }}>{flash.msg}</div>
      )}

      {selected.length > 0 && (
        <div className="ma-pt-bulkbar">
          <strong>{selected.length}</strong> value(s) selected
          <button onClick={() => bulkStatus('Active')}>Activate selected</button>
          <button onClick={() => bulkStatus('Inactive')}>Deactivate selected</button>
          <button onClick={() => setSelected([])}>Clear</button>
        </div>
      )}

      {/* Body / grid */}
      <div className="ma-pt-body">
        <div className="ma-pt-table-wrap">
          <table className="ma-pt-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} /></th>
                <th style={{ width: 36 }} title="Drag to reorder">Sort</th>
                <th>Value</th>
                <th>Parent</th>
                <th>Division (Tenant)</th>
                <th style={{ width: 130 }}>Inactive</th>
                <th style={{ width: 80, textAlign: 'center' }}>Edit</th>
                <th style={{ width: 160, textAlign: 'center' }}>Analysis</th>
                <th style={{ width: 80, textAlign: 'center' }}>Delete</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={9} className="ma-pt-loading">Loading…</td></tr>}
              {!loading && values.length === 0 && (
                <tr><td colSpan={9} className="ma-pt-empty">No picklist values match the current filters.</td></tr>
              )}
              {!loading && values.map(row => (
                <tr
                  key={row.id}
                  draggable
                  onDragStart={() => { dragRowRef.current = row }}
                  onDragOver={e => {
                    if (sameSortGroup(dragRowRef.current, row)) e.preventDefault()
                  }}
                  onDrop={() => dropRow(row)}
                >
                  <td><input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggleSelected(row.id)} /></td>
                  <td className="ma-pt-drag-cell" title="Drag within the same tenant, category, and field">⋮⋮</td>
                  <td>
                    <div className="ma-pt-value-cell" title={row.description || ''}>{row.value}</div>
                    <div className="ma-pt-meta-cell">
                      {row.category} · {row.field_type}
                      {row.department ? ` · ${row.department}` : ''}
                      {row.sort_order ? ` · order ${row.sort_order}` : ''}
                    </div>
                  </td>
                  <td>{row.parent_value || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td>{row.tenant_name || <span style={{ color: 'var(--text-muted)' }}>(unassigned)</span>}</td>
                  <td>
                    <label className="ma-pt-toggle" title={row.status === 'Active' ? 'Active — toggle to make inactive' : 'Inactive — toggle to make active'}>
                      <input
                        type="checkbox"
                        checked={row.status !== 'Active'}
                        onChange={() => toggleStatus(row)}
                      />
                      <span className="slider" />
                    </label>
                    <span style={{ marginLeft: 8, fontSize: 11 }}>
                      <span className={`ma-pt-pill ${row.status === 'Active' ? 'ma-pt-pill-active' : 'ma-pt-pill-inactive'}`}>
                        {row.status}
                      </span>
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="ma-pt-action-btn" onClick={() => setModal({ mode: 'edit', row })}>Edit</button>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="ma-pt-action-btn" onClick={() => openWhereUsed(row)}>Where used</button>{' '}
                    <button className="ma-pt-action-btn" onClick={() => openHistory(row)}>History</button>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="ma-pt-action-btn danger" onClick={() => deleteValue(row)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
          {!loading && `Showing ${values.length} of ${total} values`}
        </div>
      </div>

      {/* Modal */}
      {modal && modal.mode !== 'import' && (
        <ValueModal
          mode={modal.mode}
          row={modal.row}
          categories={categories}
          fields={fields}
          tenants={tenants}
          H={H}
          onClose={() => setModal(null)}
          onSaved={msg => { setModal(null); showFlash(msg); loadValues() }}
        />
      )}
      {modal?.mode === 'import' && (
        <ImportCsvModal
          H={H}
          onClose={() => setModal(null)}
          onDone={summary => { setModal(null); showFlash(summary); loadValues() }}
        />
      )}
      {infoModal && (
        <InfoModal
          modal={infoModal}
          onClose={() => setInfoModal(null)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Import CSV Modal
// ─────────────────────────────────────────────────────────────────────────────
function ImportCsvModal({ H, onClose, onDone }) {
  const [csv,     setCsv]     = useState('')
  const [fileName,setFileName]= useState('')
  const [preview, setPreview] = useState(null)
  const [busy,    setBusy]    = useState(false)
  const [err,     setErr]     = useState('')

  function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setErr(''); setPreview(null)
    const reader = new FileReader()
    reader.onload = () => setCsv(String(reader.result || ''))
    reader.onerror = () => setErr('Could not read file.')
    reader.readAsText(file)
  }

  async function runPreview() {
    if (!csv.trim()) return setErr('Choose a CSV file first.')
    setBusy(true); setErr('')
    try {
      const r = await httpFetch('/api/admin/picklists-table/import', {
        method: 'POST', headers: H,
        body: JSON.stringify({ csv, mode: 'preview' }),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Preview failed.'); return }
      setPreview(d)
    } catch { setErr('Network error.') }
    finally   { setBusy(false) }
  }

  async function runCommit() {
    setBusy(true); setErr('')
    try {
      const r = await httpFetch('/api/admin/picklists-table/import', {
        method: 'POST', headers: H,
        body: JSON.stringify({ csv, mode: 'commit' }),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Import failed.'); return }
      onDone(`Import done — ${d.inserted} added, ${d.updated} updated, ${d.skipped} skipped.`)
    } catch { setErr('Network error.') }
    finally   { setBusy(false) }
  }

  return (
    <div className="ma-pt-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="ma-pt-modal" style={{ width: 640 }}>
        <div className="ma-pt-modal-header">
          <h2 className="ma-pt-modal-title">Import Picklist Values from CSV</h2>
          <button className="ma-pt-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="ma-pt-modal-body">
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Expected columns: <code>Category, Field, Value, Tenant</code> (required) plus optional <code>Department, Status</code>.
            Use the exact tenant name from Organisations (or <code>All Tenants</code> for bulk-apply).
            Existing values are updated; new ones are inserted.
          </div>

          <div className="ma-pt-field">
            <label>CSV File</label>
            <input type="file" accept=".csv,text/csv" onChange={onFile} />
            {fileName && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Loaded: <strong>{fileName}</strong> ({csv.length} chars)</div>}
          </div>

          {preview && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: 'var(--surface-alt,#fafbfd)' }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Preview</div>
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                <span style={{ marginRight: 16 }}>Total rows: <strong>{preview.total}</strong></span>
                <span style={{ marginRight: 16, color: '#1a7a3f' }}>Valid: <strong>{preview.valid}</strong></span>
                <span style={{ color: '#b91c1c' }}>Invalid: <strong>{preview.invalid}</strong></span>
              </div>
              {preview.invalid > 0 && (
                <div style={{ maxHeight: 160, overflow: 'auto', background: '#fff', border: '1px solid var(--border)', borderRadius: 6, padding: 8 }}>
                  {preview.preview.filter(p => !p.valid).slice(0, 20).map(p => (
                    <div key={p.row_index} style={{ fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: '#b91c1c' }}>Row {p.row_index}:</span> {p.errors.join('; ')}
                    </div>
                  ))}
                  {preview.invalid > 20 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>… and {preview.invalid - 20} more issues</div>}
                </div>
              )}
            </div>
          )}

          {err && <div className="ma-pt-err-msg">{err}</div>}
        </div>

        <div className="ma-pt-modal-footer">
          <button className="ma-pt-btn-cancel" onClick={onClose}>Cancel</button>
          {!preview && (
            <button className="ma-pt-btn-save" onClick={runPreview} disabled={busy || !csv}>
              {busy ? 'Parsing…' : 'Preview'}
            </button>
          )}
          {preview && (
            <>
              <button className="ma-pt-btn-cancel" onClick={() => { setPreview(null); setErr('') }}>Re-parse</button>
              <button
                className="ma-pt-btn-save"
                onClick={runCommit}
                disabled={busy || preview.valid === 0}
              >
                {busy ? 'Importing…' : `Import ${preview.valid} rows`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Add / Edit Modal
// ─────────────────────────────────────────────────────────────────────────────
function ValueModal({ mode, row, categories, tenants, H, onClose, onSaved }) {
  const isEdit = mode === 'edit'

  const [form, setForm] = useState(() => ({
    category: row?.category || '',
    field_type: row?.field_type || '',
    value: row?.value || '',
    org_id: row?.org_id ? String(row.org_id) : '',
    department: row?.department || '',
    description: row?.description || '',
    status: row?.status || 'Active',
    sort_order: row?.sort_order || 0,
    parent_value_id: row?.parent_value_id ? String(row.parent_value_id) : '',
    external_codes: {
      e2b: row?.external_codes?.e2b || '',
      meddra: row?.external_codes?.meddra || '',
      fda: row?.external_codes?.fda || '',
      who: row?.external_codes?.who || '',
    },
    translations: {
      es: row?.translations?.es || '',
      fr: row?.translations?.fr || '',
      de: row?.translations?.de || '',
    },
  }))
  const [modalFields, setModalFields] = useState([])
  const [parentOptions, setParentOptions] = useState([])
  const [tab, setTab] = useState('basic')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!form.category) { setModalFields([]); return }
    httpFetch(`/api/admin/picklists-table/fields?category=${encodeURIComponent(form.category)}`, { headers: H })
      .then(r => r.json())
      .then(d => setModalFields(d.fields || []))
      .catch(() => setModalFields([]))
  }, [form.category, H])

  useEffect(() => {
    const qs = new URLSearchParams()
    if (form.category) qs.set('category', form.category)
    if (form.field_type) qs.set('field_type', form.field_type)
    if (form.org_id && form.org_id !== 'all') qs.set('tenant_id', form.org_id)
    qs.set('limit', '1000')
    httpFetch(`/api/admin/picklists-table/values?${qs}`, { headers: H })
      .then(r => r.json())
      .then(d => setParentOptions((d.values || []).filter(v => Number(v.id) !== Number(row?.id || 0))))
      .catch(() => setParentOptions([]))
  }, [form.category, form.field_type, form.org_id, H, row?.id])

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }
  function setExternal(k, v) { setForm(f => ({ ...f, external_codes: { ...f.external_codes, [k]: v } })) }
  function setTranslation(k, v) { setForm(f => ({ ...f, translations: { ...f.translations, [k]: v } })) }

  async function handleSave() {
    setErr('')
    if (!form.value.trim()) return setErr('Value is required.')
    if (!isEdit) {
      if (!form.category.trim()) return setErr('Category is required.')
      if (!form.field_type.trim()) return setErr('Field is required.')
      if (!form.org_id) return setErr('Tenant is required (use "All Tenants" to bulk-apply).')
    }

    const payload = {
      value: form.value.trim(),
      department: form.department.trim() || null,
      description: form.description.trim() || null,
      status: form.status,
      sort_order: Number(form.sort_order || 0),
      parent_value_id: form.parent_value_id || null,
      external_codes: form.external_codes,
      translations: form.translations,
    }

    setSaving(true)
    try {
      if (isEdit) {
        const r = await httpFetch(`/api/admin/picklists-table/values/${row.id}`, {
          method: 'PUT', headers: H, body: JSON.stringify(payload),
        })
        const d = await r.json()
        if (!r.ok) { setErr(d.error || 'Update failed.'); return }
        onSaved('Value updated.')
      } else {
        const r = await httpFetch(`/api/admin/picklists-table/values`, {
          method: 'POST', headers: H,
          body: JSON.stringify({
            category: form.category.trim(),
            field_type: form.field_type.trim(),
            org_id: form.org_id,
            ...payload,
          }),
        })
        const d = await r.json()
        if (!r.ok) { setErr(d.error || 'Create failed.'); return }
        onSaved(`${d.created_count} value${d.created_count !== 1 ? 's' : ''} created.`)
      }
    } catch { setErr('Network error.') }
    finally { setSaving(false) }
  }

  return (
    <div className="ma-pt-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="ma-pt-modal ma-pt-modal-wide">
        <div className="ma-pt-modal-header">
          <h2 className="ma-pt-modal-title">{isEdit ? `Edit "${row.value}"` : 'Add New Picklist Value'}</h2>
          <button className="ma-pt-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="ma-pt-modal-body">
          <div className="ma-pt-tabs">
            <button type="button" className={tab === 'basic' ? 'active' : ''} onClick={() => setTab('basic')}>Basic</button>
            <button type="button" className={tab === 'codes' ? 'active' : ''} onClick={() => setTab('codes')}>External Codes</button>
            <button type="button" className={tab === 'translations' ? 'active' : ''} onClick={() => setTab('translations')}>Translations</button>
            <button type="button" className={tab === 'cascading' ? 'active' : ''} onClick={() => setTab('cascading')}>Cascading</button>
          </div>

          {tab === 'basic' && (
            <>
              {!isEdit && (
                <>
                  <div className="ma-pt-field">
                    <label>Table Name (Category) <span className="req">*</span></label>
                    <select className="ma-pt-select" value={form.category} onChange={e => set('category', e.target.value)}>
                      <option value="">— Select category —</option>
                      {categories.map(c => <option key={c.category} value={c.category}>{c.category}</option>)}
                    </select>
                  </div>

                  <div className="ma-pt-field">
                    <label>Field <span className="req">*</span></label>
                    <select className="ma-pt-select" value={form.field_type} onChange={e => set('field_type', e.target.value)}>
                      <option value="">— Select field —</option>
                      {modalFields.map(f => <option key={f.field_type} value={f.field_type}>{f.field_type}</option>)}
                    </select>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Need a new field? Add it via Customize Forms first.</div>
                  </div>

                  <div className="ma-pt-field">
                    <label>Tenant <span className="req">*</span></label>
                    <select className="ma-pt-select" value={form.org_id} onChange={e => set('org_id', e.target.value)}>
                      <option value="">— Select tenant —</option>
                      <option value="all">★ All Tenants (bulk-apply)</option>
                      {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                </>
              )}

              <div className="ma-pt-field">
                <label>Value <span className="req">*</span></label>
                <input className="ma-pt-input" value={form.value} onChange={e => set('value', e.target.value)} placeholder="e.g. Critical" autoFocus={!isEdit} />
              </div>

              <div className="ma-pt-field">
                <label>Description <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(tooltip in case form)</span></label>
                <textarea className="ma-pt-input" rows={3} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Explain when this value should be selected" />
              </div>

              <div className="ma-pt-field">
                <label>Department <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
                <input className="ma-pt-input" value={form.department} onChange={e => set('department', e.target.value)} placeholder="e.g. Medical Affairs" />
              </div>

              <div className="ma-pt-code-grid">
                <div className="ma-pt-field">
                  <label>Status</label>
                  <select className="ma-pt-select" value={form.status} onChange={e => set('status', e.target.value)}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
                <div className="ma-pt-field">
                  <label>Sort Order</label>
                  <input type="number" className="ma-pt-input" value={form.sort_order} onChange={e => set('sort_order', e.target.value)} />
                </div>
              </div>
            </>
          )}

          {tab === 'codes' && (
            <div className="ma-pt-code-grid">
              {['e2b', 'meddra', 'fda', 'who'].map(code => (
                <div className="ma-pt-field" key={code}>
                  <label>{code.toUpperCase()}</label>
                  <input className="ma-pt-input" value={form.external_codes[code] || ''} onChange={e => setExternal(code, e.target.value)} placeholder={`${code} export code`} />
                </div>
              ))}
            </div>
          )}

          {tab === 'translations' && (
            <div className="ma-pt-code-grid">
              <div className="ma-pt-field"><label>Spanish (es)</label><input className="ma-pt-input" value={form.translations.es || ''} onChange={e => setTranslation('es', e.target.value)} /></div>
              <div className="ma-pt-field"><label>French (fr)</label><input className="ma-pt-input" value={form.translations.fr || ''} onChange={e => setTranslation('fr', e.target.value)} /></div>
              <div className="ma-pt-field"><label>German (de)</label><input className="ma-pt-input" value={form.translations.de || ''} onChange={e => setTranslation('de', e.target.value)} /></div>
            </div>
          )}

          {tab === 'cascading' && (
            <div className="ma-pt-field">
              <label>Parent Value</label>
              <select className="ma-pt-select" value={form.parent_value_id} onChange={e => set('parent_value_id', e.target.value)}>
                <option value="">No parent</option>
                {parentOptions.map(parent => (
                  <option key={parent.id} value={parent.id}>{parent.value} ({parent.category} / {parent.field_type})</option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Cascade rules use this parent link to filter child dropdown options in the case form.
              </div>
            </div>
          )}

          {err && <div className="ma-pt-err-msg">{err}</div>}
        </div>

        <div className="ma-pt-modal-footer">
          <button className="ma-pt-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="ma-pt-btn-save" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Create')}
          </button>
        </div>
      </div>
    </div>
  )
}

function InfoModal({ modal, onClose }) {
  const isHistory = modal.type === 'history'
  const rows = modal.data?.history || []
  const samples = modal.data?.samples || []
  return (
    <div className="ma-pt-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="ma-pt-modal ma-pt-modal-wide">
        <div className="ma-pt-modal-header">
          <h2 className="ma-pt-modal-title">{isHistory ? 'Version History' : 'Where Used'} — {modal.row.value}</h2>
          <button className="ma-pt-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="ma-pt-modal-body">
          {modal.loading && <div className="ma-pt-loading">Loading…</div>}
          {modal.error && <div className="ma-pt-err-msg">{modal.error}</div>}
          {!modal.loading && !modal.error && !isHistory && (
            <>
              <div className="ma-pt-info-total">Total references: <strong>{modal.data?.total || 0}</strong></div>
              {samples.length === 0 && <div className="ma-pt-empty">No references found.</div>}
              {samples.length > 0 && (
                <table className="ma-pt-table">
                  <thead><tr><th>Table</th><th>Column</th><th>Sample Case ID</th></tr></thead>
                  <tbody>{samples.map((s, idx) => <tr key={idx}><td>{s.table}</td><td>{s.column}</td><td>{s.case_id}</td></tr>)}</tbody>
                </table>
              )}
            </>
          )}
          {!modal.loading && !modal.error && isHistory && (
            <>
              {rows.length === 0 && <div className="ma-pt-empty">No history entries yet.</div>}
              {rows.length > 0 && (
                <table className="ma-pt-table">
                  <thead><tr><th>When</th><th>Who</th><th>Type</th><th>Snapshot</th></tr></thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.id}>
                        <td>{row.changed_at}</td>
                        <td>{row.changed_by_name || row.changed_by || 'System'}</td>
                        <td>{row.change_type}</td>
                        <td>
                          <div className="ma-pt-value-cell">{row.value}</div>
                          <div className="ma-pt-meta-cell">{row.status} · {row.department || 'No department'}</div>
                          <pre className="ma-pt-json-diff">{JSON.stringify({ description: row.description, external_codes: row.external_codes, translations: row.translations }, null, 2)}</pre>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
        <div className="ma-pt-modal-footer">
          <button className="ma-pt-btn-cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
