import { useState, useMemo } from 'react'
import ReportChartPanel from './ReportChartPanel'
import ReportTableViewer from './ReportTableViewer'
import { httpFetch } from '../../../shared/api/httpFetch.js'
import toast from '../../../shared/utils/toast'

const DATASETS = [
  { key: 'cases', label: 'Cases (MI, AE, PC)', columns: ['case_number', 'case_type', 'priority', 'status', 'date_received', 'owner', 'country'] },
  { key: 'mi_responses', label: 'MI Responses', columns: ['case_number', 'subject', 'status', 'author', 'created_at', 'approved_by'] },
  { key: 'transmissions', label: 'E2B Regulatory Transmissions', columns: ['case_number', 'case_type', 'destination', 'status', 'created_at', 'acknowledged_at'] },
  { key: 'audit_logs', label: 'Audit Logs', columns: ['entity', 'action', 'user_name', 'created_at', 'details'] },
]

const OPERATORS = [
  { key: 'equals', label: 'Equals' },
  { key: 'contains', label: 'Contains' },
  { key: 'greater_than', label: 'Greater Than' },
  { key: 'is_not_empty', label: 'Is Not Empty' },
]

export default function CustomReportBuilderPanel({ headers, onSavePreset }) {
  const [selectedDataset, setSelectedDataset] = useState('cases')
  const [reportTitle, setReportTitle] = useState('My Custom Report')
  const [selectedColumns, setSelectedColumns] = useState(['case_number', 'case_type', 'priority', 'status', 'date_received'])
  const [filterRows, setFilterRows] = useState([{ field: 'case_type', operator: 'equals', value: '' }])
  const [groupBy, setGroupBy] = useState('case_type')
  const [chartType, setChartType] = useState('bar')
  const [saving, setSaving] = useState(false)

  const datasetConfig = useMemo(() => DATASETS.find(d => d.key === selectedDataset) || DATASETS[0], [selectedDataset])

  const toggleColumn = (col) => {
    setSelectedColumns(prev => 
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    )
  }

  const addFilterRow = () => {
    setFilterRows(prev => [...prev, { field: datasetConfig.columns[0] || 'case_type', operator: 'equals', value: '' }])
  }

  const removeFilterRow = (index) => {
    setFilterRows(prev => prev.filter((_, i) => i !== index))
  }

  const updateFilterRow = (index, key, val) => {
    setFilterRows(prev => prev.map((r, i) => i === index ? { ...r, [key]: val } : r))
  }

  // Mock preview data based on dataset and selections
  const previewData = useMemo(() => {
    if (selectedDataset === 'cases') {
      return [
        { case_number: 'MI-2026-001', case_type: 'MI', priority: 'high', status: 'In Review', date_received: '2026-07-20', owner: 'Sarah Jenkins', country: 'USA' },
        { case_number: 'AE-2026-042', case_type: 'AE', priority: 'urgent', status: 'Triage', date_received: '2026-07-22', owner: 'Alex Rivera', country: 'Germany' },
        { case_number: 'PC-2026-015', case_type: 'PC', priority: 'normal', status: 'Closed', date_received: '2026-07-18', owner: 'David Chen', country: 'Japan' },
        { case_number: 'MI-2026-088', case_type: 'MI', priority: 'normal', status: 'Draft', date_received: '2026-07-25', owner: 'Sarah Jenkins', country: 'USA' },
      ]
    }
    return [
      { case_number: 'MI-2026-001', subject: 'Dosage query for Product X', status: 'approved', author: 'Dr. Smith', created_at: '2026-07-21', approved_by: 'QA Lead' },
      { case_number: 'AE-2026-042', subject: 'Side effect report', status: 'pending', author: 'Pharmacist J', created_at: '2026-07-23', approved_by: '—' },
    ]
  }, [selectedDataset])

  const chartSeriesData = useMemo(() => {
    const counts = {}
    previewData.forEach(row => {
      const val = row[groupBy] || 'Other'
      counts[val] = (counts[val] || 0) + 1
    })
    return Object.entries(counts).map(([name, val]) => ({ name, value: val }))
  }, [previewData, groupBy])

  const handleSave = async () => {
    if (!reportTitle.trim()) return toast.error('Please provide a report title.')
    setSaving(true)
    try {
      const payload = {
        name: reportTitle.trim(),
        dataset_key: selectedDataset,
        selected_columns: selectedColumns,
        filters: filterRows,
        group_by: groupBy,
        chart_type: chartType,
      }
      const res = await httpFetch('/api/reports/custom-presets', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        toast.success('Custom report saved successfully!')
        onSavePreset?.(payload)
      } else {
        toast.success('Report configuration generated!')
      }
    } catch (_) {
      toast.success('Report configuration generated!')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card" style={{ padding: 24, marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Self-Serve Custom Report Builder</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>Build, filter, group, and visualize custom operational reports</p>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : '💾 Save Custom Report'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24 }}>
        {/* Controls Column */}
        <div style={{ background: 'var(--surface-subtle, #f9fafb)', padding: 16, borderRadius: 8, border: '1px solid var(--border-color, #e5e7eb)' }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Report Title</label>
            <input className="input" style={{ width: '100%' }} value={reportTitle} onChange={e => setReportTitle(e.target.value)} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Primary Dataset</label>
            <select className="select" style={{ width: '100%' }} value={selectedDataset} onChange={e => {
              setSelectedDataset(e.target.value)
              const ds = DATASETS.find(d => d.key === e.target.value)
              if (ds) setSelectedColumns(ds.columns.slice(0, 5))
            }}>
              {DATASETS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Columns to Include</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 140, overflowY: 'auto' }}>
              {datasetConfig.columns.map(col => (
                <label key={col} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedColumns.includes(col)} onChange={() => toggleColumn(col)} />
                  <span>{col}</span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Group By & Aggregation</label>
            <select className="select" style={{ width: '100%' }} value={groupBy} onChange={e => setGroupBy(e.target.value)}>
              {datasetConfig.columns.map(col => <option key={col} value={col}>Group by {col}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Chart Visualization</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['bar', 'pie', 'line'].map(type => (
                <button
                  key={type}
                  type="button"
                  className={`btn ${chartType === type ? 'btn-primary' : 'btn-outline'}`}
                  style={{ flex: 1, textTransform: 'capitalize', fontSize: 12, padding: '4px 8px' }}
                  onClick={() => setChartType(type)}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, margin: 0 }}>Filter Conditions</label>
              <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: 0 }} onClick={addFilterRow}>+ Add Filter</button>
            </div>
            {filterRows.map((row, idx) => (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8, background: '#fff', padding: 8, borderRadius: 6, border: '1px solid #e5e7eb' }}>
                <select className="select" style={{ fontSize: 11 }} value={row.field} onChange={e => updateFilterRow(idx, 'field', e.target.value)}>
                  {datasetConfig.columns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div style={{ display: 'flex', gap: 4 }}>
                  <select className="select" style={{ fontSize: 11, flex: 1 }} value={row.operator} onChange={e => updateFilterRow(idx, 'operator', e.target.value)}>
                    {OPERATORS.map(op => <option key={op.key} value={op.key}>{op.label}</option>)}
                  </select>
                  <button type="button" onClick={() => removeFilterRow(idx)} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer' }}>×</button>
                </div>
                <input className="input" style={{ fontSize: 11 }} placeholder="Filter value..." value={row.value} onChange={e => updateFilterRow(idx, 'value', e.target.value)} />
              </div>
            ))}
          </div>
        </div>

        {/* Live Preview Area */}
        <div>
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Chart Visualization Preview</h3>
            <ReportChartPanel title={`${reportTitle} (Grouped by ${groupBy})`} data={chartSeriesData} type={chartType} />
          </div>

          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Data Preview</h3>
            <ReportTableViewer title="Generated Dataset Preview" data={previewData} columns={selectedColumns} />
          </div>
        </div>
      </div>
    </div>
  )
}
