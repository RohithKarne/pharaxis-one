import { useState, useEffect, useRef } from 'react'
import { confirm } from '../../../shared/utils/confirm'
import { useNavigate } from 'react-router-dom'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import { httpFetch } from '../../../shared/api/httpFetch.js'

function escapeCsvCell(value) {
  if (value == null) return ''
  const raw = String(value)
  if (/[",\n\r]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`
  return raw
}

function toCsv(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return ''
  const headers = Array.from(
    rows.reduce((acc, row) => {
      Object.keys(row || {}).forEach(key => acc.add(key))
      return acc
    }, new Set())
  )
  const lines = [headers.map(escapeCsvCell).join(',')]
  rows.forEach(row => {
    lines.push(headers.map(key => escapeCsvCell(row?.[key])).join(','))
  })
  return lines.join('\n')
}

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cell += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (ch === ',' && !inQuotes) { row.push(cell); cell = ''; continue }
    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i += 1
      row.push(cell); cell = ''
      if (row.some(v => (v || '').trim() !== '')) rows.push(row)
      row = []
      continue
    }
    cell += ch
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    if (row.some(v => (v || '').trim() !== '')) rows.push(row)
  }
  if (rows.length === 0) return []
  const headers = rows[0].map(h => String(h || '').trim())
  return rows.slice(1).map(cols => {
    const out = {}
    headers.forEach((header, idx) => { if (!header) return; out[header] = cols[idx] ?? '' })
    return out
  }).filter(record => Object.values(record).some(v => String(v || '').trim() !== ''))
}

export default function AdminPicklistsPanel({ H }) {
  const navigate = useNavigate()

  const [msg, setMsg] = useState({ text: '', type: '' })
  const [picklistCategories, setPicklistCategories] = useState([])
  const [picklistExpandedCategoryIds, setPicklistExpandedCategoryIds] = useState([])
  const [selectedPicklistCategoryId, setSelectedPicklistCategoryId] = useState(null)
  const [selectedPicklistFieldId, setSelectedPicklistFieldId] = useState(null)
  const [picklists, setPicklists] = useState([])
  const [picklistSelectedIds, setPicklistSelectedIds] = useState([])
  const [picklistTotal, setPicklistTotal] = useState(0)
  const [picklistPage, setPicklistPage] = useState(1)
  const [picklistTotalPages, setPicklistTotalPages] = useState(1)
  const [picklistFilter, setPicklistFilter] = useState({ search: '', status: 'All' })
  const [picklistLoading, setPicklistLoading] = useState(false)
  const [picklistBulkUpdating, setPicklistBulkUpdating] = useState(false)
  const [picklistCategoryModal, setPicklistCategoryModal] = useState(false)
  const [picklistCategoryForm, setPicklistCategoryForm] = useState({ category_name: '', first_field_name: '' })
  const [picklistFieldModal, setPicklistFieldModal] = useState(false)
  const [picklistFieldForm, setPicklistFieldForm] = useState({ category_id: '', field_name: '' })
  const [picklistModal, setPicklistModal] = useState(null)
  const [picklistEditTarget, setPicklistEditTarget] = useState(null)
  const [picklistForm, setPicklistForm] = useState({ name: '', field_id: '', category: '', field_type: '', value: '', description: '', status: 'Active' })
  const [depCheckModal, setDepCheckModal] = useState(null)
  const [depCheckLoading, setDepCheckLoading] = useState(false)
  const [depCheckProceedFn, setDepCheckProceedFn] = useState(null)
  const [impactPanel, setImpactPanel] = useState(null)
  const [impactLoading, setImpactLoading] = useState(false)
  const picklistUploadRef = useRef(null)

  const selectedPicklistCategory = picklistCategories.find(c => c.id === selectedPicklistCategoryId) || null
  const selectedPicklistField = selectedPicklistCategory?.fields?.find(f => f.id === selectedPicklistFieldId) || null
  const picklistHasSelection = Boolean(selectedPicklistFieldId && selectedPicklistField)
  const picklistStartIdx = picklistTotal === 0 ? 0 : ((picklistPage - 1) * 20 + 1)
  const picklistEndIdx = picklistTotal === 0 ? 0 : Math.min(picklistTotal, picklistPage * 20)

  function flash(text, type = 'success') {
    setMsg({ text, type })
    setTimeout(() => setMsg({ text: '', type: '' }), 5000)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadPicklistHierarchy() }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selectedPicklistFieldId) {
      setPicklists([]); setPicklistTotal(0); setPicklistPage(1); setPicklistTotalPages(1); setPicklistSelectedIds([])
      return
    }
    setPicklistPage(1)
    loadPicklists({ page: 1, field_id: selectedPicklistFieldId, search: '', status: 'All' })
    setPicklistFilter({ search: '', status: 'All' })
    setPicklistSelectedIds([])
  }, [selectedPicklistFieldId])

  async function loadPicklistHierarchy() {
    try {
      const res = await httpFetch('/api/admin/picklists/categories?include_fields=1&include_inactive=1', { headers: H })
      let d = {}
      try { d = await res.json() } catch { d = {} }
      if (!res.ok) {
        flash(res.status === 404 ? 'Picklists category APIs are unavailable. Restart backend to load latest changes.' : (d.error || 'Unable to load picklist hierarchy.'), 'error')
        setPicklistCategories([]); setSelectedPicklistCategoryId(null); setSelectedPicklistFieldId(null)
        return
      }
      const categories = Array.isArray(d.categories) ? d.categories : []
      setPicklistCategories(categories)
      setPicklistExpandedCategoryIds(categories.map(c => c.id))
      const selectedCategoryStillExists = categories.some(c => c.id === selectedPicklistCategoryId)
      let nextCategoryId = selectedCategoryStillExists ? selectedPicklistCategoryId : null
      let nextFieldId = null
      if (!nextCategoryId && categories.length) nextCategoryId = categories[0].id
      if (nextCategoryId) {
        const category = categories.find(c => c.id === nextCategoryId)
        if (category?.fields?.length) {
          const selectedFieldStillExists = category.fields.some(f => f.id === selectedPicklistFieldId)
          nextFieldId = selectedFieldStillExists ? selectedPicklistFieldId : category.fields[0].id
        }
      }
      setSelectedPicklistCategoryId(nextCategoryId)
      setSelectedPicklistFieldId(nextFieldId)
    } catch {
      flash('Unable to connect to picklists hierarchy service.', 'error')
      setPicklistCategories([]); setSelectedPicklistCategoryId(null); setSelectedPicklistFieldId(null)
    }
  }

  async function loadPicklists(overrides = {}) {
    setPicklistLoading(true)
    try {
      const params = new URLSearchParams({
        status: overrides.status ?? picklistFilter.status ?? 'All',
        page: overrides.page ?? picklistPage,
        limit: 20,
        search: overrides.search ?? picklistFilter.search ?? '',
        field_id: overrides.field_id ?? selectedPicklistFieldId ?? '',
      })
      const res = await httpFetch(`/api/admin/picklists?${params}`, { headers: H })
      const d = await res.json()
      setPicklists(d.data || d.picklists || [])
      setPicklistTotal(d.total || 0)
      setPicklistTotalPages(d.total_pages || Math.max(1, Math.ceil((d.total || 0) / 20)))
    } catch { /* silent */ } finally { setPicklistLoading(false) }
  }

  async function createPicklistCategory(e) {
    e.preventDefault()
    const categoryName = String(picklistCategoryForm.category_name || '').trim()
    const firstFieldName = String(picklistCategoryForm.first_field_name || '').trim()
    if (!categoryName || !firstFieldName) return flash('Category and first field are required.', 'error')
    try {
      let categoryId = null
      let fieldId = null
      const categoryRes = await httpFetch('/api/admin/picklists/categories', { method: 'POST', headers: H, body: JSON.stringify({ name: categoryName }) })
      let categoryData = {}
      try { categoryData = await categoryRes.json() } catch { categoryData = {} }
      if (categoryRes.ok) {
        categoryId = categoryData.id
      } else if (categoryRes.status === 404) {
        return flash('Category API not found. Please restart backend and retry.', 'error')
      } else if (categoryRes.status === 409) {
        const existingRes = await httpFetch('/api/admin/picklists/categories?include_fields=1&include_inactive=1', { headers: H })
        let existingData = {}
        try { existingData = await existingRes.json() } catch { existingData = {} }
        const existingCategory = (existingData.categories || []).find(c => String(c.name || '').toLowerCase() === categoryName.toLowerCase())
        if (!existingCategory) return flash('Category already exists, but could not resolve it. Refresh and try again.', 'error')
        categoryId = existingCategory.id
      } else {
        return flash(categoryData.error || 'Unable to create category.', 'error')
      }
      const fieldRes = await httpFetch('/api/admin/picklists/fields', { method: 'POST', headers: H, body: JSON.stringify({ category_id: categoryId, name: firstFieldName }) })
      let fieldData = {}
      try { fieldData = await fieldRes.json() } catch { fieldData = {} }
      if (fieldRes.ok) {
        fieldId = fieldData.id
      } else if (fieldRes.status === 404) {
        return flash('Field API not found. Please restart backend and retry.', 'error')
      } else if (fieldRes.status === 409) {
        const existingRes = await httpFetch(`/api/admin/picklists/fields?category_id=${categoryId}&include_inactive=1`, { headers: H })
        let existingData = {}
        try { existingData = await existingRes.json() } catch { existingData = {} }
        const existingField = (existingData.fields || []).find(f => String(f.name || '').toLowerCase() === firstFieldName.toLowerCase())
        if (!existingField) return flash('Field already exists, but could not resolve it. Refresh and try again.', 'error')
        fieldId = existingField.id
      } else {
        return flash(fieldData.error || 'Category created, but field creation failed.', 'error')
      }
      setPicklistCategoryModal(false)
      setPicklistCategoryForm({ category_name: '', first_field_name: '' })
      await loadPicklistHierarchy()
      setSelectedPicklistCategoryId(categoryId)
      setSelectedPicklistFieldId(fieldId)
      flash('Category/field ready.')
    } catch (err) {
      flash(`Unable to create category/field. ${err?.message || ''}`.trim(), 'error')
    }
  }

  async function createPicklistField(e) {
    e.preventDefault()
    const categoryId = Number(picklistFieldForm.category_id || selectedPicklistCategoryId || 0)
    const fieldName = String(picklistFieldForm.field_name || '').trim()
    if (!categoryId || !fieldName) return flash('Category and field name are required.', 'error')
    const res = await httpFetch('/api/admin/picklists/fields', { method: 'POST', headers: H, body: JSON.stringify({ category_id: categoryId, name: fieldName }) })
    const d = await res.json()
    if (!res.ok) return flash(d.error || 'Unable to create field.', 'error')
    setPicklistFieldModal(false)
    setPicklistFieldForm({ category_id: String(categoryId), field_name: '' })
    await loadPicklistHierarchy()
    setSelectedPicklistCategoryId(categoryId)
    setSelectedPicklistFieldId(d.id)
    flash('Field created.')
  }

  async function savePicklist(e) {
    e.preventDefault()
    if (!picklistForm.field_id) return flash('Please select a field.', 'error')
    const isEdit = picklistModal === 'edit'
    let result
    if (isEdit) {
      const res = await httpFetch(`/api/admin/picklists/${picklistEditTarget.id}`, { method: 'PUT', headers: H, body: JSON.stringify(picklistForm) })
      const d = await res.json()
      if (!res.ok) { flash(d.error || 'Save failed.', 'error'); return }
      result = { ok: true }
    } else {
      const res = await httpFetch('/api/admin/picklists', { method: 'POST', headers: H, body: JSON.stringify(picklistForm) })
      const d = await res.json()
      if (!res.ok) { flash(d.error || 'Save failed.', 'error'); return }
      result = { ok: true }
    }
    if (!result.ok) return
    await loadPicklists({ field_id: selectedPicklistFieldId, page: picklistPage })
    setPicklistModal(null); setPicklistEditTarget(null)
    setPicklistForm({ name: '', field_id: String(selectedPicklistFieldId || ''), category: '', field_type: '', value: '', description: '', status: 'Active' })
    flash(isEdit ? 'Picklist updated.' : 'Picklist created.')
  }

  async function deletePicklist(row) {
    setDepCheckLoading(true)
    try {
      const depRes = await httpFetch(`/api/admin/dependencies/picklist/${row.id}`, { headers: H })
      const depData = await depRes.json()
      const deps = depData.dependencies || []
      if (deps.length > 0 && depData.total > 0) {
        setDepCheckModal({ row, deps })
        setDepCheckProceedFn(() => async () => {
          setDepCheckModal(null)
          const res = await httpFetch(`/api/admin/picklists/${row.id}`, { method: 'DELETE', headers: H })
          const d = await res.json()
          if (!res.ok) return flash(d.error || 'Delete failed.', 'error')
          await loadPicklists({ field_id: selectedPicklistFieldId, page: picklistPage })
          setPicklistSelectedIds(prev => prev.filter(id => id !== row.id))
          flash('Picklist deactivated.')
        })
        return
      }
    } catch (_) {}
    finally { setDepCheckLoading(false) }
    if (!await confirm(`Deactivate picklist "${row.name}"?`)) return
    const res = await httpFetch(`/api/admin/picklists/${row.id}`, { method: 'DELETE', headers: H })
    const d = await res.json()
    if (!res.ok) return flash(d.error || 'Delete failed.', 'error')
    await loadPicklists({ field_id: selectedPicklistFieldId, page: picklistPage })
    setPicklistSelectedIds(prev => prev.filter(id => id !== row.id))
    flash('Picklist deactivated.')
  }

  async function bulkUpdatePicklists(status) {
    if (!picklistSelectedIds.length || !selectedPicklistFieldId) return
    setPicklistBulkUpdating(true)
    try {
      const res = await httpFetch('/api/admin/picklists/bulk-status', { method: 'POST', headers: H, body: JSON.stringify({ ids: picklistSelectedIds, status, field_id: selectedPicklistFieldId }) })
      const d = await res.json()
      if (!res.ok) return flash(d.error || 'Bulk update failed.', 'error')
      setPicklistSelectedIds([])
      await loadPicklists({ field_id: selectedPicklistFieldId, page: picklistPage })
      flash(`Updated ${d.affected || 0} value(s).`)
    } catch { flash('Bulk update failed.', 'error') } finally { setPicklistBulkUpdating(false) }
  }

  async function fetchImpact(entityId, label) {
    setImpactLoading(true); setImpactPanel(null)
    try {
      const res = await httpFetch('/api/admin/impact-preview', { method: 'POST', headers: H, body: JSON.stringify({ change_type: 'taxonomy', entity_id: entityId }) })
      const data = await res.json()
      if (!res.ok) { flash(data.error || 'Impact preview failed.', 'error'); return }
      setImpactPanel({ data, label })
    } catch { flash('Could not load impact preview.', 'error') } finally { setImpactLoading(false) }
  }

  return (
    <MIMSLayout showStatStrip={false} bodyClassName="no-scroll admin-page-body">
      <div className="ac-picklists-page">
        <div className="ac-picklists-breadcrumb" aria-label="Picklists breadcrumb">
          <button type="button" className="ac-picklists-breadcrumb-link" onClick={() => navigate('/admin-console')}>Admin Console</button>
          <span className="ac-picklists-breadcrumb-sep">&gt;</span>
          <span className="ac-picklists-breadcrumb-current">Picklists</span>
        </div>
        <div className="ac-picklists-shell">
          <aside className="ac-picklists-left">
            <div className="ac-picklists-left-header">
              <button type="button" className="ac-picklists-main-add" onClick={() => { setPicklistCategoryForm({ category_name: '', first_field_name: '' }); setPicklistCategoryModal(true) }}>+ Category</button>
              <button type="button" className="ac-picklists-main-add secondary" onClick={() => { setPicklistFieldForm({ category_id: String(selectedPicklistCategoryId || ''), field_name: '' }); setPicklistFieldModal(true) }} disabled={!selectedPicklistCategoryId}>+ Field</button>
            </div>
            <div className="ac-picklists-tree">
              {picklistCategories.map(category => {
                const expanded = picklistExpandedCategoryIds.includes(category.id)
                const activeCategory = category.id === selectedPicklistCategoryId
                return (
                  <div key={category.id} className="ac-picklists-tree-group">
                    <button type="button" className={`ac-picklists-tree-category${activeCategory ? ' active' : ''}`}
                      onClick={() => {
                        setSelectedPicklistCategoryId(category.id)
                        setPicklistExpandedCategoryIds(prev => prev.includes(category.id) ? prev.filter(id => id !== category.id) : [...prev, category.id])
                        if (category.fields?.length) setSelectedPicklistFieldId(category.fields[0].id)
                      }}>
                      <span>{category.name}</span>
                      <span>{expanded ? '▾' : '▸'}</span>
                    </button>
                    {expanded && (
                      <div className="ac-picklists-tree-fields">
                        {(category.fields || []).length === 0 ? (
                          <div className="ac-picklists-tree-empty">No fields</div>
                        ) : category.fields.map(field => (
                          <button key={field.id} type="button" className={`ac-picklists-tree-field${selectedPicklistFieldId === field.id ? ' active' : ''}`}
                            onClick={() => { setSelectedPicklistCategoryId(category.id); setSelectedPicklistFieldId(field.id) }}>
                            {field.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </aside>

          <section className="ac-picklists-right">
            {msg.text && <div className={`ac-picklists-flash ${msg.type === 'error' ? 'error' : 'success'}`}>{msg.text}</div>}
            <div className="ac-picklists-right-top">
              <div className="ac-picklists-right-title">{selectedPicklistField?.name || 'Select a field'}</div>
              <div className="ac-picklists-right-actions">
                <button className="btn btn-outline" onClick={async () => {
                  try {
                    const res = await httpFetch('/api/admin/picklists/export', { headers: H })
                    const data = await res.json()
                    const csv = toCsv(data.picklists || data.data || data || [])
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a'); a.href = url; a.download = 'picklists_export.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
                  } catch { flash('Export failed.', 'error') }
                }}>Download CSV</button>
                <button className="btn btn-outline" onClick={() => picklistUploadRef.current?.click()}>Upload CSV</button>
                <input ref={picklistUploadRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={async e => {
                  const file = e.target.files[0]; if (!file) return
                  try {
                    const rows = parseCsv(await file.text())
                    if (!rows.length) return flash('No valid rows found in CSV.', 'error')
                    const res = await httpFetch('/api/admin/picklists/bulk', { method: 'POST', headers: H, body: JSON.stringify({ items: rows }) })
                    const d = await res.json()
                    if (!res.ok) return flash(d.error || 'Upload failed.', 'error')
                    await loadPicklistHierarchy()
                    await loadPicklists({ field_id: selectedPicklistFieldId, page: 1 })
                    flash(`Processed ${d.imported || rows.length} row(s).`)
                  } catch { flash('Failed to parse CSV file.', 'error') } finally { e.target.value = '' }
                }} />
                <button className="btn btn-primary" disabled={!picklistHasSelection} onClick={() => {
                  setPicklistEditTarget(null)
                  setPicklistForm({ name: '', field_id: String(selectedPicklistFieldId || ''), category: selectedPicklistCategory?.name || '', field_type: selectedPicklistField?.name || '', value: '', description: '', status: 'Active' })
                  setPicklistModal('add')
                }}>Add New</button>
              </div>
            </div>

            <div className="ac-picklists-search-strip">
              <input className="form-control" placeholder="Search" value={picklistFilter.search} onChange={e => setPicklistFilter(f => ({ ...f, search: e.target.value }))} />
              <button className="btn btn-primary" onClick={() => { if (!selectedPicklistFieldId) return; setPicklistPage(1); loadPicklists({ page: 1, field_id: selectedPicklistFieldId, search: picklistFilter.search, status: picklistFilter.status }) }} disabled={!picklistHasSelection}>Search</button>
              <button className="btn btn-outline" onClick={() => { setPicklistFilter({ search: '', status: 'All' }); if (!selectedPicklistFieldId) return; setPicklistPage(1); loadPicklists({ page: 1, field_id: selectedPicklistFieldId, search: '', status: 'All' }) }}>Clear</button>
              <button className="btn btn-outline" onClick={() => { if (!selectedPicklistFieldId) return; setPicklistPage(1); loadPicklists({ page: 1, field_id: selectedPicklistFieldId, status: 'All', search: '' }) }} disabled={!picklistHasSelection}>View All</button>
            </div>

            {picklistSelectedIds.length > 0 && (
              <div className="ac-picklists-bulk-bar">
                <span>{picklistSelectedIds.length} selected</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <button className="btn btn-outline" disabled={picklistBulkUpdating} onClick={() => bulkUpdatePicklists('Active')}>Activate Selected</button>
                  <button className="btn btn-outline" disabled={picklistBulkUpdating} onClick={() => bulkUpdatePicklists('Inactive')}>Inactivate Selected</button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => {
                const params = selectedPicklistFieldId ? `?category=${encodeURIComponent(selectedPicklistFieldId)}` : ''
                httpFetch(`/api/admin/picklists/export-csv${params}`, { headers: H })
                  .then(r => r.blob()).then(blob => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'picklists.csv'; a.click(); URL.revokeObjectURL(url) })
                  .catch(() => flash('Export failed.', 'error'))
              }}>⬇ Export CSV</button>
              <label className="btn btn-outline" style={{ fontSize: 12, cursor: 'pointer' }}>
                ⬆ Import CSV
                <input type="file" accept=".csv" style={{ display: 'none' }} onChange={async e => {
                  const file = e.target.files[0]; if (!file) return
                  const text = await file.text()
                  const lines = text.trim().split('\n')
                  const header = lines[0].split(',')
                  const nameIdx = header.findIndex(h => h.toLowerCase().includes('name'))
                  const valueIdx = header.findIndex(h => h.toLowerCase().includes('value'))
                  const descIdx = header.findIndex(h => h.toLowerCase().includes('desc'))
                  const rows = lines.slice(1).map(line => { const cols = line.split(','); return { name: cols[nameIdx]?.replace(/"/g,'').trim(), value: cols[valueIdx]?.replace(/"/g,'').trim(), description: cols[descIdx]?.replace(/"/g,'').trim() } }).filter(r => r.name && r.value)
                  if (!rows.length) return flash('No valid rows found in CSV.', 'error')
                  const res = await httpFetch('/api/admin/picklists/import-csv', { method: 'POST', headers: H, body: JSON.stringify({ rows }) })
                  const d = await res.json()
                  if (!res.ok) return flash(d.error || 'Import failed.', 'error')
                  flash(`Imported ${d.imported} picklist values.`)
                  loadPicklists({ page: 1 })
                  e.target.value = ''
                }} />
              </label>
            </div>

            <div className="ac-picklists-display-count">Displaying {picklistStartIdx}-{picklistEndIdx} of {picklistTotal} Items</div>

            <div className="ac-picklists-grid-wrap">
              <table className="ac-picklists-grid">
                <thead>
                  <tr>
                    <th style={{ width: 34 }}>
                      <input type="checkbox" checked={picklists.length > 0 && picklists.every(row => picklistSelectedIds.includes(row.id))} onChange={e => setPicklistSelectedIds(e.target.checked ? picklists.map(r => r.id) : [])} />
                    </th>
                    <th>Name</th>
                    <th style={{ width: 140 }}>Status</th>
                    <th style={{ width: 130 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {picklistLoading && <tr><td colSpan={4} className="ac-picklists-empty">Loading…</td></tr>}
                  {!picklistLoading && picklists.length === 0 && <tr><td colSpan={4} className="ac-picklists-empty">No values found for the selected field.</td></tr>}
                  {!picklistLoading && picklists.map(row => (
                    <tr key={row.id}>
                      <td><input type="checkbox" checked={picklistSelectedIds.includes(row.id)} onChange={e => setPicklistSelectedIds(prev => e.target.checked ? [...new Set([...prev, row.id])] : prev.filter(id => id !== row.id))} /></td>
                      <td>
                        <button type="button" className="ac-picklists-name-button" onClick={() => {
                          setPicklistEditTarget(row)
                          setPicklistForm({ name: row.name || '', field_id: String(row.field_id || selectedPicklistFieldId || ''), category: row.category || selectedPicklistCategory?.name || '', field_type: row.field_type || selectedPicklistField?.name || '', value: row.value || '', description: row.description || '', status: row.status || 'Active' })
                          setPicklistModal('edit')
                        }}>{row.name || row.value}</button>
                      </td>
                      <td>{row.status || 'Active'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-outline" style={{ fontSize: 11, padding: '2px 9px', color: '#b45309', borderColor: '#d97706' }} disabled={impactLoading} onClick={() => fetchImpact(row.id, `Picklist: ${row.name || row.value}`)}>{impactLoading ? '…' : '⚠ Impact'}</button>
                          <button className="btn btn-outline" style={{ fontSize: 11, padding: '2px 9px', color: row.status === 'Active' ? 'var(--warning)' : 'var(--success)', borderColor: row.status === 'Active' ? 'var(--warning)' : 'var(--success)' }}
                            onClick={async () => {
                              try {
                                const res = await httpFetch(`/api/admin/picklists/${row.id}/toggle`, { method: 'PATCH', headers: H })
                                const d = await res.json()
                                if (!res.ok) return flash(d.error || 'Toggle failed.', 'error')
                                await loadPicklists({ field_id: selectedPicklistFieldId, page: picklistPage })
                                flash(`Picklist ${row.status === 'Active' ? 'deactivated' : 'activated'}.`)
                              } catch { flash('Toggle failed.', 'error') }
                            }}>{row.status === 'Active' ? 'Deactivate' : 'Activate'}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!picklistLoading && picklistTotalPages > 1 && (
              <div className="ac-picklists-pagination">
                <button className="btn btn-outline" disabled={picklistPage === 1} onClick={() => { const next = picklistPage - 1; setPicklistPage(next); loadPicklists({ page: next, field_id: selectedPicklistFieldId }) }}>Prev</button>
                <span>Page {picklistPage} of {picklistTotalPages}</span>
                <button className="btn btn-outline" disabled={picklistPage >= picklistTotalPages} onClick={() => { const next = picklistPage + 1; setPicklistPage(next); loadPicklists({ page: next, field_id: selectedPicklistFieldId }) }}>Next</button>
              </div>
            )}
          </section>
        </div>
      </div>

      {picklistCategoryModal && (
        <div className="ac-picklists-modal-overlay">
          <div className="ac-picklists-modal">
            <h3>Create Category</h3>
            <form onSubmit={createPicklistCategory}>
              <label>Category Name</label>
              <input className="form-control" value={picklistCategoryForm.category_name} onChange={e => setPicklistCategoryForm(f => ({ ...f, category_name: e.target.value }))} required />
              <label style={{ marginTop: 10 }}>First Field Name</label>
              <input className="form-control" value={picklistCategoryForm.first_field_name} onChange={e => setPicklistCategoryForm(f => ({ ...f, first_field_name: e.target.value }))} required />
              <div className="ac-picklists-modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setPicklistCategoryModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {picklistFieldModal && (
        <div className="ac-picklists-modal-overlay">
          <div className="ac-picklists-modal">
            <h3>Create Field</h3>
            <form onSubmit={createPicklistField}>
              <label>Category</label>
              <select className="form-control" value={picklistFieldForm.category_id} onChange={e => setPicklistFieldForm(f => ({ ...f, category_id: e.target.value }))} required>
                <option value="">Select Category</option>
                {picklistCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <label style={{ marginTop: 10 }}>Field Name</label>
              <input className="form-control" value={picklistFieldForm.field_name} onChange={e => setPicklistFieldForm(f => ({ ...f, field_name: e.target.value }))} required />
              <div className="ac-picklists-modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setPicklistFieldModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {picklistModal && (
        <div className="ac-picklists-modal-overlay">
          <div className="ac-picklists-modal">
            <h3>{picklistModal === 'add' ? 'Add Value' : 'Edit Value'}</h3>
            <form onSubmit={savePicklist}>
              <label>Category</label>
              <select className="form-control" value={picklistForm.category || ''} onChange={e => { const category = picklistCategories.find(c => c.name === e.target.value); setPicklistForm(f => ({ ...f, category: e.target.value, field_id: '', field_type: '' })); if (category) setSelectedPicklistCategoryId(category.id) }} required>
                <option value="">Select Category</option>
                {picklistCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
              <label style={{ marginTop: 10 }}>Field</label>
              <select className="form-control" value={picklistForm.field_id || ''} onChange={e => { const fieldId = Number(e.target.value || 0); const category = picklistCategories.find(c => c.name === picklistForm.category); const field = category?.fields?.find(f => f.id === fieldId); setPicklistForm(f => ({ ...f, field_id: e.target.value, field_type: field?.name || '' })) }} required>
                <option value="">Select Field</option>
                {(picklistCategories.find(c => c.name === picklistForm.category)?.fields || []).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <label style={{ marginTop: 10 }}>Name</label>
              <input className="form-control" value={picklistForm.name} onChange={e => setPicklistForm(f => ({ ...f, name: e.target.value }))} required />
              <label style={{ marginTop: 10 }}>Value</label>
              <input className="form-control" value={picklistForm.value} onChange={e => setPicklistForm(f => ({ ...f, value: e.target.value }))} required />
              <label style={{ marginTop: 10 }}>Status</label>
              <select className="form-control" value={picklistForm.status} onChange={e => setPicklistForm(f => ({ ...f, status: e.target.value }))}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
              <div className="ac-picklists-modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setPicklistModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {depCheckModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 28, maxWidth: 480, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <h3 style={{ margin: '0 0 8px', color: 'var(--danger)' }}>⚠ Dependencies Found</h3>
            <p style={{ marginBottom: 16, fontSize: 14 }}><strong>"{depCheckModal.row.name}"</strong> is currently in use. Deactivating it may affect the following:</p>
            <ul style={{ margin: '0 0 20px', paddingLeft: 20, fontSize: 13 }}>
              {depCheckModal.deps.map((d, i) => <li key={i}><strong>{d.count}</strong> {d.label || d.type}</li>)}
            </ul>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => { setDepCheckModal(null); setDepCheckProceedFn(null) }}>Cancel</button>
              <button className="btn btn-danger" onClick={() => depCheckProceedFn && depCheckProceedFn()}>Deactivate Anyway</button>
            </div>
          </div>
        </div>
      )}

      {impactPanel && (() => {
        const { data, label } = impactPanel
        const riskColor = data.risk_level === 'high' ? '#dc2626' : data.risk_level === 'medium' ? '#d97706' : '#16a34a'
        const riskBg    = data.risk_level === 'high' ? '#fee2e2' : data.risk_level === 'medium' ? '#fef3c7' : '#dcfce7'
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.48)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setImpactPanel(null)}>
            <div style={{ background: 'var(--surface)', borderRadius: 10, width: '100%', maxWidth: 560, boxShadow: '0 20px 60px rgba(0,0,0,0.28)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>⚠ Master-Data Impact Preview</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
                </div>
                <button onClick={() => setImpactPanel(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
              </div>
              <div style={{ padding: '20px 24px' }}>
                <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
                  <div style={{ flex: 1, padding: '14px 16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: 28, fontWeight: 800 }}>{data.affected_cases ?? 0}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Affected Records</div>
                  </div>
                  {data.affected_ae_records != null && (
                    <div style={{ flex: 1, padding: '14px 16px', background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 8, textAlign: 'center' }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: '#dc2626' }}>{data.affected_ae_records}</div>
                      <div style={{ fontSize: 12, color: '#dc2626', marginTop: 2 }}>AE Records</div>
                    </div>
                  )}
                  {data.affected_pc_records != null && (
                    <div style={{ flex: 1, padding: '14px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, textAlign: 'center' }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: '#d97706' }}>{data.affected_pc_records}</div>
                      <div style={{ fontSize: 12, color: '#d97706', marginTop: 2 }}>PC Records</div>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 90 }}>
                    <span style={{ padding: '6px 14px', borderRadius: 20, background: riskBg, color: riskColor, fontWeight: 800, fontSize: 12, textTransform: 'uppercase' }}>{data.risk_level} risk</span>
                  </div>
                </div>
                {data.affected_dynamic_values != null && data.affected_dynamic_values > 0 && (
                  <div style={{ marginBottom: 14, padding: '8px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 13, color: '#1e40af' }}>
                    📋 {data.affected_dynamic_values} additional dynamic field value(s) also reference this taxonomy entry.
                  </div>
                )}
                {(data.warnings || []).length > 0 && data.warnings.map((w, i) => (
                  <div key={i} style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, fontSize: 13, color: '#78350f', marginBottom: 6, lineHeight: 1.5 }}>⚠ {w}</div>
                ))}
                {data.affected_cases === 0 && (data.warnings || []).length === 0 && (
                  <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, fontSize: 13, color: '#15803d' }}>✅ No existing records reference this taxonomy value. Safe to modify.</div>
                )}
              </div>
              <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => setImpactPanel(null)} style={{ padding: '8px 24px', background: 'var(--primary, #4f6ef7)', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Close Preview</button>
              </div>
            </div>
          </div>
        )
      })()}
    </MIMSLayout>
  )
}
