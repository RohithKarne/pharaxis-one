/**
 * Custom Reports — drag-and-drop dashboard builder.
 * Admin can create named reports, add widgets from a palette,
 * freely arrange and resize them on a grid canvas, and save.
 */
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import GridLayout from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'
import {
  ResponsiveContainer, AreaChart, Area,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell,
} from 'recharts'

// ── Constants ────────────────────────────────────────────────────────────────

const COLORS = ['#6B3FA0', '#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']

const WIDGET_PALETTE = [
  { type: 'stat',              label: 'Stat Card',            icon: '🔢', metric: 'portal_users',       defaultW: 2, defaultH: 2 },
  { type: 'stat_submissions',  label: 'Submissions Count',    icon: '📨', metric: 'total_submissions',  defaultW: 2, defaultH: 2 },
  { type: 'stat_downloads',    label: 'Downloads Count',      icon: '⬇',  metric: 'total_downloads',    defaultW: 2, defaultH: 2 },
  { type: 'stat_news',         label: 'Published News',       icon: '📰', metric: 'published_news',     defaultW: 2, defaultH: 2 },
  { type: 'area_trend',        label: 'Submissions Trend',    icon: '📈', metric: 'submissions_trend',  defaultW: 6, defaultH: 4 },
  { type: 'pie_types',         label: 'Submissions by Type',  icon: '🥧', metric: 'submissions_by_type',defaultW: 4, defaultH: 4 },
  { type: 'bar_documents',     label: 'Top Documents',        icon: '📊', metric: 'top_documents',      defaultW: 5, defaultH: 4 },
  { type: 'bar_safety',        label: 'Top Safety Views',     icon: '⚠️', metric: 'top_safety',         defaultW: 5, defaultH: 4 },
]

const TYPE_LABELS = {
  medical_inquiry:   'Medical Inquiry',
  adverse_event:     'Adverse Event',
  product_complaint: 'Product Complaint',
  other_inquiry:     'Other Inquiry',
}

const COLS = 12

// ── Widget renderer ───────────────────────────────────────────────────────────

function WidgetContent({ widget, clientId }) {
  const [wdata, setWdata] = useState(null)

  useEffect(() => {
    fetch(`/api/admin/reports/${clientId}/data/${widget.metric}`, { headers: adminHeaders() })
      .then(r => r.json())
      .then(d => setWdata(d.data || []))
      .catch(() => setWdata([]))
  }, [clientId, widget.metric])

  if (!wdata) return <div style={styles.widgetLoading}>Loading…</div>

  // Stat card
  if (widget.type.startsWith('stat')) {
    const val = wdata[0]?.value ?? '—'
    return (
      <div style={styles.statInner}>
        <div style={styles.statValue}>{val}</div>
        <div style={styles.statLabel}>{widget.label}</div>
      </div>
    )
  }

  // Area chart — submissions trend
  if (widget.type === 'area_trend') {
    const chartData = wdata.map(r => ({ ...r, Submissions: r.count }))
    return wdata.length === 0 ? <EmptyWidget /> : (
      <ResponsiveContainer width="100%" height="85%">
        <AreaChart data={chartData} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#6B3FA0" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#6B3FA0" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
          <Tooltip />
          <Area type="monotone" dataKey="Submissions" stroke="#6B3FA0" strokeWidth={2} fill="url(#rg)" dot={{ r: 3 }} />
        </AreaChart>
      </ResponsiveContainer>
    )
  }

  // Pie chart — submissions by type
  if (widget.type === 'pie_types') {
    const chartData = wdata.map(r => ({ ...r, name: TYPE_LABELS[r.name] || r.name }))
    return wdata.length === 0 ? <EmptyWidget /> : (
      <div style={{ display: 'flex', flexDirection: 'column', height: '85%' }}>
        <ResponsiveContainer width="100%" height="70%">
          <PieChart>
            <Pie data={chartData} dataKey="count" nameKey="name" cx="50%" cy="50%"
              innerRadius="35%" outerRadius="60%" paddingAngle={3} strokeWidth={0}>
              {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ overflowY: 'auto', paddingTop: 4 }}>
          {chartData.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 3 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[i % COLORS.length], flexShrink: 0 }} />
              <span style={{ flex: 1, color: '#374151' }}>{r.name}</span>
              <strong>{r.count}</strong>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Horizontal bar — documents or safety
  if (widget.type === 'bar_documents' || widget.type === 'bar_safety') {
    const dataKey = widget.type === 'bar_documents' ? 'Downloads' : 'Views'
    const color   = widget.type === 'bar_documents' ? '#2563EB' : '#EF4444'
    const chartData = wdata.map(r => ({
      name: r.name?.length > 22 ? r.name.slice(0, 22) + '…' : r.name,
      [dataKey]: r.value,
    }))
    return wdata.length === 0 ? <EmptyWidget /> : (
      <ResponsiveContainer width="100%" height="85%">
        <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 32, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
          <Tooltip />
          <Bar dataKey={dataKey} fill={color} radius={[0, 4, 4, 0]} barSize={14} />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  return <EmptyWidget />
}

function EmptyWidget() {
  return <div style={styles.widgetLoading}>No data available.</div>
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CustomReportsPage() {
  const { clientId } = useParams()

  const [reports, setReports]       = useState([])
  const [activeId, setActiveId]     = useState(null)   // null = new unsaved report
  const [reportName, setReportName] = useState('')
  const [layout, setLayout]         = useState([])
  const [widgets, setWidgets]       = useState({})     // id → widget config
  const [saving, setSaving]         = useState(false)
  const [dirty, setDirty]           = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const [loading, setLoading]       = useState(true)
  const [canvasWidth, setCanvasWidth] = useState(900)

  // measure canvas width for GridLayout
  useEffect(() => {
    const el = document.getElementById('rg-canvas')
    if (el) setCanvasWidth(el.offsetWidth)
    const obs = new ResizeObserver(entries => {
      for (const e of entries) setCanvasWidth(e.contentRect.width)
    })
    if (el) obs.observe(el)
    return () => obs.disconnect()
  }, [activeId])

  // load report list
  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/reports/${clientId}`, { headers: adminHeaders() })
      .then(r => r.json())
      .then(d => { setReports(d.reports || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [clientId])

  function newReport() {
    setActiveId(null)
    setReportName('New Report')
    setLayout([])
    setWidgets({})
    setDirty(false)
    setShowPalette(true)
  }

  function openReport(report) {
    setActiveId(report.id)
    setReportName(report.name)
    const lay  = JSON.parse(report.layout_json || '[]')
    const wigs = JSON.parse(report.widgets_json || '{}')
    setLayout(lay)
    setWidgets(wigs)
    setDirty(false)
    setShowPalette(false)
  }

  function addWidget(palette) {
    const id  = `w_${Date.now()}`
    const col = layout.length % 2 === 0 ? 0 : 6
    const row = layout.reduce((max, l) => Math.max(max, l.y + l.h), 0)
    setLayout(prev => [...prev, { i: id, x: col, y: row, w: palette.defaultW, h: palette.defaultH, minW: 2, minH: 2 }])
    setWidgets(prev => ({ ...prev, [id]: { type: palette.type, metric: palette.metric, label: palette.label } }))
    setDirty(true)
  }

  function removeWidget(id) {
    setLayout(prev => prev.filter(l => l.i !== id))
    setWidgets(prev => { const n = { ...prev }; delete n[id]; return n })
    setDirty(true)
  }

  const onLayoutChange = useCallback((newLayout) => {
    setLayout(newLayout)
    setDirty(true)
  }, [])

  async function save() {
    if (!reportName.trim()) return alert('Please enter a report name.')
    setSaving(true)
    try {
      if (activeId) {
        await fetch(`/api/admin/reports/${clientId}/${activeId}`, {
          method: 'PATCH',
          headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: reportName, layout, widgets }),
        })
        setReports(prev => prev.map(r => r.id === activeId ? { ...r, name: reportName } : r))
      } else {
        const res = await fetch(`/api/admin/reports/${clientId}`, {
          method: 'POST',
          headers: { ...adminHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: reportName, layout, widgets }),
        })
        const d = await res.json()
        setActiveId(d.id)
        setReports(prev => [{ id: d.id, name: reportName, layout_json: JSON.stringify(layout), widgets_json: JSON.stringify(widgets) }, ...prev])
      }
      setDirty(false)
    } catch { alert('Save failed.') }
    setSaving(false)
  }

  async function deleteReport(id, e) {
    e.stopPropagation()
    if (!confirm('Delete this report?')) return
    await fetch(`/api/admin/reports/${clientId}/${id}`, { method: 'DELETE', headers: adminHeaders() })
    setReports(prev => prev.filter(r => r.id !== id))
    if (activeId === id) { setActiveId(null); setLayout([]); setWidgets({}); setReportName('') }
  }

  const isEditing = activeId !== null || layout.length > 0 || reportName

  return (
    <AdminLayout title="Custom Reports">
      <div style={styles.root}>

        {/* ── Sidebar ── */}
        <aside style={styles.sidebar}>
          <button style={styles.newBtn} onClick={newReport}>+ New Report</button>

          {loading ? (
            <div style={styles.sidebarEmpty}>Loading…</div>
          ) : reports.length === 0 ? (
            <div style={styles.sidebarEmpty}>No reports yet.<br />Click + New Report to start.</div>
          ) : (
            <div style={styles.reportList}>
              {reports.map(r => (
                <div
                  key={r.id}
                  style={{ ...styles.reportItem, ...(activeId === r.id ? styles.reportItemActive : {}) }}
                  onClick={() => openReport(r)}
                >
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📊 {r.name}</span>
                  <button style={styles.deleteBtn} onClick={e => deleteReport(r.id, e)} title="Delete">✕</button>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* ── Canvas area ── */}
        <div style={styles.canvasArea}>

          {!isEditing ? (
            <div style={styles.emptyCanvas}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#374151', marginBottom: 8 }}>No report selected</div>
              <div style={{ color: '#6B7280', marginBottom: 24 }}>Pick a saved report from the sidebar or create a new one.</div>
              <button style={styles.newBtn} onClick={newReport}>+ New Report</button>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div style={styles.toolbar}>
                <input
                  style={styles.nameInput}
                  value={reportName}
                  onChange={e => { setReportName(e.target.value); setDirty(true) }}
                  placeholder="Report name…"
                />
                <button style={styles.paletteBtn} onClick={() => setShowPalette(p => !p)}>
                  {showPalette ? '✕ Close Palette' : '＋ Add Widget'}
                </button>
                <button style={{ ...styles.saveBtn, opacity: (!dirty || saving) ? 0.6 : 1 }}
                  onClick={save} disabled={!dirty || saving}>
                  {saving ? 'Saving…' : dirty ? '💾 Save' : 'Saved ✓'}
                </button>
              </div>

              {/* Widget palette */}
              {showPalette && (
                <div style={styles.palette}>
                  <div style={styles.paletteTitle}>Widget Palette — click to add</div>
                  <div style={styles.paletteGrid}>
                    {WIDGET_PALETTE.map(p => (
                      <button key={p.type} style={styles.paletteItem} onClick={() => { addWidget(p); }}>
                        <span style={{ fontSize: 22 }}>{p.icon}</span>
                        <span style={{ fontSize: 11, marginTop: 4, textAlign: 'center', color: '#374151' }}>{p.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Grid canvas */}
              <div id="rg-canvas" style={styles.canvas}>
                {layout.length === 0 ? (
                  <div style={styles.canvasHint}>
                    Click <strong>＋ Add Widget</strong> to place your first widget on the canvas.
                  </div>
                ) : (
                  <GridLayout
                    layout={layout}
                    cols={COLS}
                    rowHeight={60}
                    width={canvasWidth}
                    onLayoutChange={onLayoutChange}
                    draggableHandle=".widget-drag-handle"
                    margin={[12, 12]}
                    containerPadding={[0, 0]}
                    isResizable
                    isDraggable
                  >
                    {layout.map(l => {
                      const widget = widgets[l.i]
                      if (!widget) return null
                      return (
                        <div key={l.i} style={styles.widget}>
                          <div style={styles.widgetHeader} className="widget-drag-handle">
                            <span style={styles.widgetTitle}>{widget.label}</span>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <span style={styles.dragHint} title="Drag to move">⠿</span>
                              <button style={styles.removeBtn} onClick={() => removeWidget(l.i)} title="Remove widget">✕</button>
                            </div>
                          </div>
                          <div style={styles.widgetBody}>
                            <WidgetContent widget={widget} clientId={clientId} />
                          </div>
                        </div>
                      )
                    })}
                  </GridLayout>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  root:         { display: 'flex', gap: 0, height: 'calc(100vh - 120px)', overflow: 'hidden' },
  sidebar:      { width: 220, flexShrink: 0, background: '#F8FAFC', borderRight: '1px solid #E5E7EB', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' },
  newBtn:       { background: '#6B3FA0', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer', width: '100%' },
  sidebarEmpty: { color: '#9CA3AF', fontSize: 12, textAlign: 'center', marginTop: 24, lineHeight: 1.6 },
  reportList:   { display: 'flex', flexDirection: 'column', gap: 4 },
  reportItem:   { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#374151', border: '1px solid transparent', background: '#fff' },
  reportItemActive: { background: '#EDE9F6', borderColor: '#6B3FA0', color: '#6B3FA0', fontWeight: 600 },
  deleteBtn:    { background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 12, padding: '0 2px', flexShrink: 0 },
  canvasArea:   { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#F1F5F9' },
  emptyCanvas:  { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  toolbar:      { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#fff', borderBottom: '1px solid #E5E7EB', flexShrink: 0 },
  nameInput:    { flex: 1, border: '1px solid #D1D5DB', borderRadius: 8, padding: '7px 12px', fontSize: 14, fontWeight: 600, color: '#111827', outline: 'none' },
  paletteBtn:   { background: '#fff', border: '1px solid #6B3FA0', color: '#6B3FA0', borderRadius: 8, padding: '7px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  saveBtn:      { background: '#6B3FA0', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 18px', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  palette:      { background: '#fff', borderBottom: '1px solid #E5E7EB', padding: '12px 16px', flexShrink: 0 },
  paletteTitle: { fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' },
  paletteGrid:  { display: 'flex', flexWrap: 'wrap', gap: 8 },
  paletteItem:  { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 90, padding: '10px 8px', border: '1px solid #E5E7EB', borderRadius: 8, background: '#F8FAFC', cursor: 'pointer', gap: 2 },
  canvas:       { flex: 1, overflowY: 'auto', padding: 16 },
  canvasHint:   { textAlign: 'center', color: '#9CA3AF', marginTop: 80, fontSize: 14 },
  widget:       { background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  widgetHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid #F1F5F9', cursor: 'grab', background: '#FAFAFA', flexShrink: 0 },
  widgetTitle:  { fontSize: 12, fontWeight: 600, color: '#374151' },
  dragHint:     { color: '#9CA3AF', fontSize: 14, cursor: 'grab' },
  removeBtn:    { background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1 },
  widgetBody:   { flex: 1, padding: '10px 12px', overflow: 'hidden' },
  widgetLoading:{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9CA3AF', fontSize: 13 },
  statInner:    { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' },
  statValue:    { fontSize: 36, fontWeight: 700, color: '#6B3FA0' },
  statLabel:    { fontSize: 12, color: '#6B7280', marginTop: 4, textAlign: 'center' },
}
