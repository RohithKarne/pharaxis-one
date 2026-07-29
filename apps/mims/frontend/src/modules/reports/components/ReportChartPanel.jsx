import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function ReportChartPanel({ data }) {
  const navigate = useNavigate()
  const [chartType, setChartType] = useState('bar')

  // Interactive drill-down: clicking on a chart segment navigates directly to the Case List (/cases)
  const handleChartClick = () => {
    navigate('/cases?filter=chart_drilldown')
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '14px', padding: '16px', background: '#fff', marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>Visualizer</h3>
        <select 
          value={chartType} 
          onChange={(e) => setChartType(e.target.value)} 
          style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px' }}
        >
          <option value="bar">Bar Chart</option>
          <option value="pie">Pie Chart</option>
          <option value="line">Line Chart</option>
        </select>
      </div>

      <div 
        onClick={handleChartClick}
        style={{
          height: '240px',
          background: '#f8fafc',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          border: '1px dashed #cbd5e1'
        }}
        title="Click segment to drill down into cases"
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--primary)', fontSize: '32px', marginBottom: '8px' }}>
            {chartType === 'bar' ? '📊' : chartType === 'pie' ? '🥧' : '📈'}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Interactive {chartType} chart visualization. <br/>
            Click any segment to drill-down into Case List.
          </div>
        </div>
      </div>
    </div>
  )
}
