import React from 'react'

// Schedule and Export CSV. The date, category and preset controls that sat
// here were wired to nothing — Last 7 Days still showed every row (M-90).
export default function ReportFilterBar({ onExport, disableExport, onSchedule }) {
  return (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
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
