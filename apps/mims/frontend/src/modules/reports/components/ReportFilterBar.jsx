import React from 'react'

// The filters a report allows, then Run, Schedule and Export. The date,
// category and preset controls that sat here before were wired to nothing —
// Last 7 Days still showed every row (M-90). These go to the server with the
// run, export and schedule. A button with no handler (no permission) is hidden.
const control = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, background: '#fff' }
const button = (primary, disabled) => ({
  padding: '8px 12px',
  borderRadius: 8,
  border: primary ? '1px solid var(--primary)' : '1px solid var(--border)',
  background: disabled ? '#f8fafc' : primary ? 'var(--primary)' : '#fff',
  color: primary && !disabled ? '#fff' : 'var(--text-primary)',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontWeight: 700,
  fontSize: 13,
})

function Field({ label, children }) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  )
}

export default function ReportFilterBar({ report, filters = {}, options = {}, onChange, onRun, running, onExport, disableExport, onSchedule }) {
  const allowed = new Set(report?.allowed_filters || [])
  const set = (patch) => onChange?.({ ...filters, ...patch })
  const custom = !filters.period && (filters.date_from || filters.date_to)
  const periodValue = custom ? 'custom' : (filters.period || '')

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }} data-testid="report-filter-bar">
      {allowed.has('period') && (
        <Field label="Period">
          <select aria-label="Period" style={control} value={periodValue} onChange={(e) => {
            const v = e.target.value
            if (v === 'custom') set({ period: '', date_from: filters.date_from || '', date_to: filters.date_to || '' })
            else set({ period: v, date_from: '', date_to: '' })
          }}>
            {(options.periods || []).map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            <option value="custom">Choose dates…</option>
          </select>
        </Field>
      )}
      {allowed.has('period') && periodValue === 'custom' && (
        <>
          <Field label="From"><input aria-label="From" type="date" style={control} value={filters.date_from || ''} onChange={(e) => set({ date_from: e.target.value })} /></Field>
          <Field label="To"><input aria-label="To" type="date" style={control} value={filters.date_to || ''} onChange={(e) => set({ date_to: e.target.value })} /></Field>
        </>
      )}
      {allowed.has('case_type') && (
        <Field label="Case type">
          <select aria-label="Case type" style={control} value={filters.case_type || ''} onChange={(e) => set({ case_type: e.target.value })}>
            <option value="">All</option>
            {(options.case_types || []).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
      )}
      {allowed.has('product') && (
        <Field label="Product">
          <select aria-label="Product" style={control} value={filters.product || ''} onChange={(e) => set({ product: e.target.value })}>
            <option value="">All</option>
            {(options.products || []).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
      )}
      {allowed.has('owner_id') && (
        <Field label="Owner">
          <select aria-label="Owner" style={control} value={filters.owner_id || ''} onChange={(e) => set({ owner_id: e.target.value })}>
            <option value="">Anyone</option>
            {(options.owners || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
      )}
      {allowed.has('group_by') && (report?.group_by_options || []).length > 0 && (
        <Field label="Group by">
          <select aria-label="Group by" style={control} value={filters.group_by || report.group_by_options[0].value} onChange={(e) => set({ group_by: e.target.value })}>
            {report.group_by_options.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </Field>
      )}
      {allowed.has('window_days') && (
        <Field label="Due within">
          <select aria-label="Due within" style={control} value={String(filters.window_days || 60)} onChange={(e) => set({ window_days: Number(e.target.value) })}>
            {(options.window_days || [30, 60, 90]).map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        </Field>
      )}

      <button type="button" onClick={onRun} disabled={running} style={button(true, running)}>{running ? 'Running…' : 'Run'}</button>
      <div style={{ flex: 1 }} />
      {onSchedule && <button type="button" onClick={onSchedule} style={button(false, false)}>Schedule Report</button>}
      {onExport && <button type="button" onClick={onExport} disabled={disableExport} style={button(false, disableExport)}>Export CSV</button>}
    </div>
  )
}
