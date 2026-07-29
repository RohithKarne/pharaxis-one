import React from 'react'

export default function ReportFilterBar({ onFilterChange, onExport, disableExport, onSchedule }) {
  return (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
        <span>From:</span>
        <input type="date" onChange={(e) => onFilterChange?.({ date_from: e.target.value })} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)' }} />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
        <span>To:</span>
        <input type="date" onChange={(e) => onFilterChange?.({ date_to: e.target.value })} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)' }} />
      </label>
      
      <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
        <button onClick={() => onFilterChange?.({ category: 'all' })} style={{ border: 'none', background: '#fff', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>All</button>
        <button onClick={() => onFilterChange?.({ category: 'clinical' })} style={{ border: 'none', background: 'transparent', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Clinical</button>
        <button onClick={() => onFilterChange?.({ category: 'operations' })} style={{ border: 'none', background: 'transparent', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Operations</button>
      </div>

      <select onChange={(e) => onFilterChange?.({ preset: e.target.value })} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px' }}>
        <option value="">Preset View</option>
        <option value="today">Today</option>
        <option value="last_7_days">Last 7 Days</option>
        <option value="last_30_days">Last 30 Days</option>
      </select>

      <div style={{ flex: 1 }} />

      <button
        onClick={onSchedule}
        style={{
          padding: '8px 12px',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          background: '#fff',
          cursor: 'pointer',
          fontWeight: 700,
          fontSize: '13px',
          marginRight: '8px'
        }}
      >
        Schedule Report
      </button>

      <button
        onClick={onExport}
        disabled={disableExport}
        style={{
          padding: '8px 12px',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          background: disableExport ? '#f8fafc' : '#fff',
          cursor: disableExport ? 'not-allowed' : 'pointer',
          fontWeight: 700,
          fontSize: '13px'
        }}
      >
        Export CSV
      </button>
    </div>
  )
}
