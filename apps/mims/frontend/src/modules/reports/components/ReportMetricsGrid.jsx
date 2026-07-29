import React from 'react'

export default function ReportMetricsGrid({ metrics }) {
  const data = [
    { label: 'Total Cases', value: metrics?.total_cases ?? 0 },
    { label: 'Open SLAs', value: metrics?.open_slas ?? 0 },
    { label: 'Avg Turnaround', value: metrics?.avg_turnaround ?? '0h' },
    { label: 'Conversion Rate', value: metrics?.conversion_rate ?? '0%' },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '16px' }}>
      {data.map((item) => (
        <div key={item.label} style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', background: '#fff' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            {item.label}
          </div>
          <div style={{ marginTop: '8px', fontSize: '28px', fontWeight: 800 }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  )
}
