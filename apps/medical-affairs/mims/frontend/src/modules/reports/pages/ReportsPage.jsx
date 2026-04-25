import { startTransition, useDeferredValue, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'

const SECTION_LABELS = {
  overview: 'Overview',
  reports: 'Reports',
  dashboards: 'Dashboards',
  schedules: 'Schedulers',
  history: 'Run History',
  configuration: 'Configuration',
}

const BLANK_REPORT_FORM = {
  dataset_key: '',
  name: '',
  description: '',
  group_key: 'command_center',
  visibility_scope: 'shared',
  default_filters: { date_from: '', date_to: '' },
  selected_columns: [],
  is_active: true,
}

const BLANK_DASHBOARD_FORM = {
  name: '',
  description: '',
  visibility_scope: 'shared',
  widgets: [],
  is_active: true,
}

const BLANK_CONFIG_FORM = {
  default_timezone: 'America/New_York',
  default_delivery_method: 'email',
  default_delivery_target: '',
  email_from_name: 'MIMS Reports',
  reply_to_email: '',
  scheduler_enabled: true,
  digest_subject_prefix: '[MIMS Reports]',
  run_log_retention_days: 90,
}

function formatDateTime(value) {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return value
  return dt.toLocaleString()
}

function exportRowsAsCsv(rows, filename) {
  if (!rows || rows.length === 0) return
  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row || {}).forEach((key) => {
        if (!key.startsWith('__')) set.add(key)
      })
      return set
    }, new Set())
  )
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => {
      const value = row?.[header] ?? ''
      const text = String(value)
      return text.includes(',') || text.includes('"') || text.includes('\n')
        ? `"${text.replace(/"/g, '""')}"`
        : text
    }).join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function badgeStyle(status) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'failed') {
    return { background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' }
  }
  if (normalized === 'success') {
    return { background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' }
  }
  return { background: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe' }
}

function pillButtonStyle(active) {
  return {
    border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
    background: active ? 'rgba(var(--primary-rgb, 79,70,229),0.08)' : '#fff',
    color: active ? 'var(--primary)' : 'var(--text-primary)',
    borderRadius: 999,
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  }
}

function cardStyle() {
  return {
    border: '1px solid var(--border)',
    borderRadius: 14,
    background: '#fff',
    padding: 18,
    boxShadow: '0 10px 24px rgba(15,23,42,0.04)',
  }
}

function widgetRowsToList(rows) {
  if (!rows || rows.length === 0) return []
  return rows.map((row, index) => {
    const entries = Object.entries(row).filter(([key]) => !key.startsWith('__'))
    const [first, second] = entries
    return {
      id: index,
      title: first ? `${first[0].replace(/_/g, ' ')}: ${first[1]}` : `Row ${index + 1}`,
      detail: second ? `${second[0].replace(/_/g, ' ')}: ${second[1]}` : '',
    }
  })
}

export default function ReportsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { token, user } = useAuth()
  const isManager = user?.role === 'admin' || user?.role === 'superadmin'
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  const [section, setSection] = useState('overview')
  const [summary, setSummary] = useState({ total_reports: 0, total_dashboards: 0, total_schedules: 0, failed_runs_last_7_days: 0 })
  const [datasets, setDatasets] = useState([])
  const [definitions, setDefinitions] = useState([])
  const [dashboards, setDashboards] = useState([])
  const [schedules, setSchedules] = useState([])
  const [historyRuns, setHistoryRuns] = useState([])
  const [moduleConfig, setModuleConfig] = useState(BLANK_CONFIG_FORM)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [reportSearch, setReportSearch] = useState('')
  const [selectedReportId, setSelectedReportId] = useState(null)
  const [editingReportId, setEditingReportId] = useState(null)
  const [reportEditorOpen, setReportEditorOpen] = useState(false)
  const [reportForm, setReportForm] = useState(BLANK_REPORT_FORM)
  const [reportPreview, setReportPreview] = useState(null)
  const [reportPreviewLoading, setReportPreviewLoading] = useState(false)
  const [reportBuilderPreview, setReportBuilderPreview] = useState(null)
  const [reportBuilderPreviewLoading, setReportBuilderPreviewLoading] = useState(false)

  const [dashboardSearch, setDashboardSearch] = useState('')
  const [selectedDashboardId, setSelectedDashboardId] = useState(null)
  const [editingDashboardId, setEditingDashboardId] = useState(null)
  const [dashboardEditorOpen, setDashboardEditorOpen] = useState(false)
  const [dashboardForm, setDashboardForm] = useState(BLANK_DASHBOARD_FORM)
  const [dashboardPreview, setDashboardPreview] = useState(null)
  const [dashboardPreviewLoading, setDashboardPreviewLoading] = useState(false)

  const [editingScheduleId, setEditingScheduleId] = useState(null)
  const [scheduleForm, setScheduleForm] = useState({
    target_type: 'report',
    target_id: '',
    export_name: '',
    schedule_frequency: 'daily',
    schedule_time_local: '08:00',
    schedule_weekday: 1,
    timezone_name: BLANK_CONFIG_FORM.default_timezone,
    delivery_method: BLANK_CONFIG_FORM.default_delivery_method,
    delivery_target: '',
    email_subject: '',
    is_active: true,
  })
  const [scheduleSaving, setScheduleSaving] = useState(false)

  const [historyFilters, setHistoryFilters] = useState({ target_type: '', status: '' })
  const [historyLoading, setHistoryLoading] = useState(false)

  const [configForm, setConfigForm] = useState(BLANK_CONFIG_FORM)
  const [configSaving, setConfigSaving] = useState(false)

  const deferredReportSearch = useDeferredValue(reportSearch)
  const deferredDashboardSearch = useDeferredValue(dashboardSearch)

  async function apiJson(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: options.headers || headers,
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload.error || 'Request failed.')
    }
    return payload
  }

  async function loadModuleData() {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const requests = [
        apiJson('/api/reports/module/summary'),
        apiJson('/api/reports/module/datasets'),
        apiJson('/api/reports/module/definitions'),
        apiJson('/api/reports/module/dashboards'),
        apiJson('/api/reports/module/schedules'),
        apiJson('/api/reports/module/history?limit=20'),
      ]
      if (isManager) {
        requests.push(apiJson('/api/reports/module/config'))
      }

      const results = await Promise.all(requests)
      const [summaryPayload, datasetsPayload, definitionsPayload, dashboardsPayload, schedulesPayload, historyPayload, configPayload] = results
      setSummary(summaryPayload)
      setDatasets(Array.isArray(datasetsPayload.datasets) ? datasetsPayload.datasets : [])
      const nextDefinitions = Array.isArray(definitionsPayload.definitions) ? definitionsPayload.definitions : []
      setDefinitions(nextDefinitions)
      setDashboards(Array.isArray(dashboardsPayload.dashboards) ? dashboardsPayload.dashboards : [])
      const nextSchedules = Array.isArray(schedulesPayload.schedules) ? schedulesPayload.schedules : []
      setSchedules(nextSchedules)
      setHistoryRuns(Array.isArray(historyPayload.runs) ? historyPayload.runs : [])

      if (isManager && configPayload) {
        const normalizedConfig = {
          default_timezone: configPayload.default_timezone || BLANK_CONFIG_FORM.default_timezone,
          default_delivery_method: configPayload.default_delivery_method || BLANK_CONFIG_FORM.default_delivery_method,
          default_delivery_target: configPayload.default_delivery_target || '',
          email_from_name: configPayload.email_from_name || BLANK_CONFIG_FORM.email_from_name,
          reply_to_email: configPayload.reply_to_email || '',
          scheduler_enabled: !!Number(configPayload.scheduler_enabled ?? 1),
          digest_subject_prefix: configPayload.digest_subject_prefix || BLANK_CONFIG_FORM.digest_subject_prefix,
          run_log_retention_days: Number(configPayload.run_log_retention_days || 90),
        }
        setModuleConfig(normalizedConfig)
        setConfigForm(normalizedConfig)
        setScheduleForm((current) => ({
          ...current,
          timezone_name: editingScheduleId ? current.timezone_name : normalizedConfig.default_timezone,
          delivery_method: editingScheduleId ? current.delivery_method : normalizedConfig.default_delivery_method,
          delivery_target: editingScheduleId ? current.delivery_target : normalizedConfig.default_delivery_target,
        }))
      }

      if (!selectedReportId && nextDefinitions.length > 0) {
        setSelectedReportId(nextDefinitions[0].id)
      }
      if (!selectedDashboardId && dashboardsPayload?.dashboards?.length > 0) {
        setSelectedDashboardId(dashboardsPayload.dashboards[0].id)
      }
    } catch (err) {
      setError(err.message || 'Failed to load reports module.')
    } finally {
      setLoading(false)
    }
  }

  async function loadHistory() {
    if (!token) return
    setHistoryLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (historyFilters.target_type) params.set('target_type', historyFilters.target_type)
      if (historyFilters.status) params.set('status', historyFilters.status)
      const payload = await apiJson(`/api/reports/module/history?${params.toString()}`)
      setHistoryRuns(Array.isArray(payload.runs) ? payload.runs : [])
    } catch (err) {
      setError(err.message || 'Failed to refresh run history.')
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    loadModuleData()
  }, [token, isManager])

  useEffect(() => {
    const params = new URLSearchParams(location.search || '')
    const sectionParam = params.get('section')
    if (sectionParam && SECTION_LABELS[sectionParam]) {
      setSection(sectionParam)
    }
  }, [location.search])

  useEffect(() => {
    if (!isManager && (section === 'schedules' || section === 'configuration')) {
      pushSection('overview')
    }
  }, [isManager, section])

  useEffect(() => {
    if (!definitions.length) return
    const params = new URLSearchParams(location.search || '')
    const reportKey = params.get('reportKey')
    if (reportKey) {
      const match = definitions.find((item) => item.report_key === reportKey)
      if (match) setSelectedReportId(match.id)
    }

    if (location.state?.activeReport) {
      const match = definitions.find((item) => item.report_key === location.state.activeReport)
      if (match) {
        setSection('reports')
        setSelectedReportId(match.id)
      }
    }
  }, [location.state, location.search, definitions])

  useEffect(() => {
    if (!dashboards.length) return
    const params = new URLSearchParams(location.search || '')
    const dashboardKey = params.get('dashboardKey')
    if (dashboardKey) {
      const match = dashboards.find((item) => item.dashboard_key === dashboardKey)
      if (match) setSelectedDashboardId(match.id)
    }
  }, [dashboards, location.search])

  function pushSection(nextSection, extraParams = {}) {
    const params = new URLSearchParams(location.search || '')
    params.set('section', nextSection)
    Object.entries(extraParams).forEach(([key, value]) => {
      if (value) params.set(key, value)
      else params.delete(key)
    })
    navigate({ pathname: '/reports', search: `?${params.toString()}` }, { replace: false })
    setSection(nextSection)
  }

  function openReportEditor(definition = null) {
    if (definition) {
      setEditingReportId(definition.id)
      setReportForm({
        dataset_key: definition.dataset_key,
        name: definition.name,
        description: definition.description || '',
        group_key: definition.group_key || 'command_center',
        visibility_scope: definition.visibility_scope || 'shared',
        default_filters: { ...(definition.default_filters || {}) },
        selected_columns: Array.isArray(definition.selected_columns) ? definition.selected_columns : [],
        is_active: !!definition.is_active,
      })
    } else {
      setEditingReportId(null)
      setReportForm(BLANK_REPORT_FORM)
    }
    setReportBuilderPreview(null)
    setReportEditorOpen(true)
  }

  function openDashboardEditor(dashboard = null) {
    if (dashboard) {
      setEditingDashboardId(dashboard.id)
      setDashboardForm({
        name: dashboard.name,
        description: dashboard.description || '',
        visibility_scope: dashboard.visibility_scope || 'shared',
        widgets: Array.isArray(dashboard.widgets) ? dashboard.widgets : [],
        is_active: !!dashboard.is_active,
      })
    } else {
      setEditingDashboardId(null)
      setDashboardForm(BLANK_DASHBOARD_FORM)
    }
    setDashboardEditorOpen(true)
  }

  const filteredDefinitions = definitions.filter((item) => {
    const text = `${item.name} ${item.description || ''} ${item.group_label || ''}`.toLowerCase()
    return text.includes(String(deferredReportSearch || '').toLowerCase())
  })
  const filteredDashboards = dashboards.filter((item) => {
    const text = `${item.name} ${item.description || ''}`.toLowerCase()
    return text.includes(String(deferredDashboardSearch || '').toLowerCase())
  })

  const selectedReport = definitions.find((item) => Number(item.id) === Number(selectedReportId)) || null
  const selectedDashboard = dashboards.find((item) => Number(item.id) === Number(selectedDashboardId)) || null

  async function previewBuilderDataset() {
    if (!reportForm.dataset_key) return
    setReportBuilderPreviewLoading(true)
    try {
      const payload = await apiJson(`/api/reports/module/datasets/${reportForm.dataset_key}/preview`, {
        method: 'POST',
        body: JSON.stringify({ filters: reportForm.default_filters || {} }),
      })
      setReportBuilderPreview(payload)
      if (!reportForm.selected_columns.length && Array.isArray(payload.columns)) {
        setReportForm((current) => ({ ...current, selected_columns: payload.columns }))
      }
    } catch (err) {
      setError(err.message || 'Failed to preview dataset.')
    } finally {
      setReportBuilderPreviewLoading(false)
    }
  }

  async function runSelectedReport(definitionId = selectedReportId) {
    if (!definitionId) return
    setReportPreviewLoading(true)
    try {
      const payload = await apiJson(`/api/reports/module/definitions/${definitionId}/run`, {
        method: 'POST',
        body: JSON.stringify({ filters: selectedReport?.default_filters || {} }),
      })
      setReportPreview(payload)
    } catch (err) {
      setError(err.message || 'Failed to run report.')
    } finally {
      setReportPreviewLoading(false)
      loadHistory()
      loadModuleData()
    }
  }

  async function saveReportDefinition() {
    try {
      const url = editingReportId
        ? `/api/reports/module/definitions/${editingReportId}`
        : '/api/reports/module/definitions'
      const method = editingReportId ? 'PUT' : 'POST'
      const payload = await apiJson(url, {
        method,
        body: JSON.stringify(reportForm),
      })
      await loadModuleData()
      setSelectedReportId(payload.id)
      setEditingReportId(null)
      setReportEditorOpen(false)
      pushSection('reports', { reportKey: payload.report_key })
    } catch (err) {
      setError(err.message || 'Failed to save report definition.')
    }
  }

  async function deleteSelectedReport() {
    if (!selectedReport || selectedReport.is_system) return
    if (!window.confirm(`Delete report "${selectedReport.name}"?`)) return
    try {
      await apiJson(`/api/reports/module/definitions/${selectedReport.id}`, { method: 'DELETE' })
      setSelectedReportId(null)
      setEditingReportId(null)
      setReportPreview(null)
      await loadModuleData()
    } catch (err) {
      setError(err.message || 'Failed to delete report definition.')
    }
  }

  async function runSelectedDashboard(dashboardId = selectedDashboardId) {
    if (!dashboardId) return
    setDashboardPreviewLoading(true)
    try {
      const payload = await apiJson(`/api/reports/module/dashboards/${dashboardId}/run`, {
        method: 'POST',
        body: JSON.stringify({ filters: {} }),
      })
      setDashboardPreview(payload)
    } catch (err) {
      setError(err.message || 'Failed to run dashboard.')
    } finally {
      setDashboardPreviewLoading(false)
      loadHistory()
      loadModuleData()
    }
  }

  async function saveDashboard() {
    try {
      const url = editingDashboardId
        ? `/api/reports/module/dashboards/${editingDashboardId}`
        : '/api/reports/module/dashboards'
      const method = editingDashboardId ? 'PUT' : 'POST'
      const payload = await apiJson(url, {
        method,
        body: JSON.stringify(dashboardForm),
      })
      await loadModuleData()
      setSelectedDashboardId(payload.id)
      setEditingDashboardId(null)
      setDashboardEditorOpen(false)
      pushSection('dashboards', { dashboardKey: payload.dashboard_key })
    } catch (err) {
      setError(err.message || 'Failed to save dashboard.')
    }
  }

  async function deleteSelectedDashboard() {
    if (!selectedDashboard || selectedDashboard.is_system) return
    if (!window.confirm(`Delete dashboard "${selectedDashboard.name}"?`)) return
    try {
      await apiJson(`/api/reports/module/dashboards/${selectedDashboard.id}`, { method: 'DELETE' })
      setSelectedDashboardId(null)
      setEditingDashboardId(null)
      setDashboardPreview(null)
      await loadModuleData()
    } catch (err) {
      setError(err.message || 'Failed to delete dashboard.')
    }
  }

  async function saveSchedule() {
    setScheduleSaving(true)
    try {
      const url = editingScheduleId
        ? `/api/reports/module/schedules/${editingScheduleId}`
        : '/api/reports/module/schedules'
      const method = editingScheduleId ? 'PUT' : 'POST'
      await apiJson(url, {
        method,
        body: JSON.stringify({
          ...scheduleForm,
          target_id: scheduleForm.target_id ? Number(scheduleForm.target_id) : null,
          schedule_weekday: Number(scheduleForm.schedule_weekday || 1),
          is_active: !!scheduleForm.is_active,
        }),
      })
      setEditingScheduleId(null)
      setScheduleForm({
        target_type: 'report',
        target_id: '',
        export_name: '',
        schedule_frequency: 'daily',
        schedule_time_local: '08:00',
        schedule_weekday: 1,
        timezone_name: moduleConfig.default_timezone || BLANK_CONFIG_FORM.default_timezone,
        delivery_method: moduleConfig.default_delivery_method || BLANK_CONFIG_FORM.default_delivery_method,
        delivery_target: moduleConfig.default_delivery_target || '',
        email_subject: '',
        is_active: true,
      })
      await loadModuleData()
    } catch (err) {
      setError(err.message || 'Failed to save schedule.')
    } finally {
      setScheduleSaving(false)
    }
  }

  function editSchedule(schedule) {
    setEditingScheduleId(schedule.id)
    setScheduleForm({
      target_type: schedule.target_type || 'report',
      target_id: schedule.target_id ? String(schedule.target_id) : '',
      export_name: schedule.export_name || '',
      schedule_frequency: schedule.schedule_frequency || 'daily',
      schedule_time_local: schedule.schedule_time_local || '08:00',
      schedule_weekday: Number(schedule.schedule_weekday || 1),
      timezone_name: schedule.timezone_name || BLANK_CONFIG_FORM.default_timezone,
      delivery_method: schedule.delivery_method || BLANK_CONFIG_FORM.default_delivery_method,
      delivery_target: schedule.delivery_target || '',
      email_subject: schedule.email_subject || '',
      is_active: !!Number(schedule.is_active ?? 1),
    })
  }

  async function removeSchedule(id) {
    if (!window.confirm('Delete this schedule?')) return
    try {
      await apiJson(`/api/reports/module/schedules/${id}`, { method: 'DELETE' })
      if (Number(editingScheduleId) === Number(id)) setEditingScheduleId(null)
      await loadModuleData()
    } catch (err) {
      setError(err.message || 'Failed to delete schedule.')
    }
  }

  async function saveConfiguration() {
    setConfigSaving(true)
    try {
      const payload = await apiJson('/api/reports/module/config', {
        method: 'PUT',
        body: JSON.stringify({
          ...configForm,
          scheduler_enabled: !!configForm.scheduler_enabled,
          run_log_retention_days: Number(configForm.run_log_retention_days || 90),
        }),
      })
      const normalized = {
        default_timezone: payload.default_timezone,
        default_delivery_method: payload.default_delivery_method,
        default_delivery_target: payload.default_delivery_target || '',
        email_from_name: payload.email_from_name || '',
        reply_to_email: payload.reply_to_email || '',
        scheduler_enabled: !!Number(payload.scheduler_enabled ?? 1),
        digest_subject_prefix: payload.digest_subject_prefix || '',
        run_log_retention_days: Number(payload.run_log_retention_days || 90),
      }
      setModuleConfig(normalized)
      setConfigForm(normalized)
      await loadModuleData()
    } catch (err) {
      setError(err.message || 'Failed to save module configuration.')
    } finally {
      setConfigSaving(false)
    }
  }

  function renderDataTable(columns, rows, filename) {
    return (
      <div style={{ marginTop: 14, overflowX: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{rows.length} row{rows.length !== 1 ? 's' : ''}</div>
          <button
            onClick={() => exportRowsAsCsv(rows, filename)}
            disabled={!rows.length}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: rows.length ? '#fff' : '#f8fafc',
              cursor: rows.length ? 'pointer' : 'not-allowed',
              fontWeight: 700,
            }}
          >
            Export CSV
          </button>
        </div>
        {rows.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No data available.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                {columns.map((column) => (
                  <th key={column} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.7, color: 'var(--text-muted)' }}>
                    {column.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} style={{ borderBottom: '1px solid var(--border)', background: index % 2 === 0 ? '#fff' : '#fcfcfd' }}>
                  {columns.map((column) => (
                    <td key={column} style={{ padding: '10px 12px', verticalAlign: 'top' }}>{row[column] ?? '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    )
  }

  function renderOverview() {
    return (
      <div style={{ display: 'grid', gap: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
          {[
            { label: 'Active Reports', value: summary.total_reports, hint: 'Approved library and custom definitions' },
            { label: 'Dashboards', value: summary.total_dashboards, hint: 'Saved decision surfaces' },
            { label: 'Schedulers', value: summary.total_schedules, hint: 'Active delivery jobs' },
            { label: 'Failed Runs (7d)', value: summary.failed_runs_last_7_days, hint: 'Recent runs needing attention' },
          ].map((item) => (
            <div key={item.label} style={cardStyle()}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8 }}>{item.label}</div>
              <div style={{ marginTop: 10, fontSize: 34, fontWeight: 800, color: 'var(--text-primary)' }}>{item.value}</div>
              <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)' }}>{item.hint}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 18 }}>
          <div style={cardStyle()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>Release 1 Reporting Workspace</div>
                <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-muted)' }}>
                  Clean navigation for report library, dashboards, schedulers, run history, and configuration.
                </div>
              </div>
              <button onClick={() => pushSection('reports')} style={pillButtonStyle(true)}>Open Report Library</button>
            </div>
            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {[
                { title: 'Report Library', desc: 'Discover approved reports and run trusted outputs.', section: 'reports' },
                { title: 'Dashboard Library', desc: 'Saved operational and leadership surfaces.', section: 'dashboards' },
                { title: 'Schedulers', desc: 'Automate report and dashboard delivery.', section: 'schedules', hidden: !isManager },
                { title: 'Configuration', desc: 'Timezone, delivery defaults, and governance settings.', section: 'configuration', hidden: !isManager },
              ].filter((item) => !item.hidden).map((item) => (
                <button
                  key={item.title}
                  onClick={() => pushSection(item.section)}
                  style={{
                    textAlign: 'left',
                    border: '1px solid var(--border)',
                    background: '#fff',
                    borderRadius: 12,
                    padding: 16,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{item.title}</div>
                  <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)' }}>{item.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={cardStyle()}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Recent Run Activity</div>
            <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-muted)' }}>Latest manual and scheduled activity across the reporting module.</div>
            <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
              {historyRuns.slice(0, 6).map((run) => (
                <div key={run.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: '#fafafa' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                    <div style={{ fontWeight: 700 }}>{run.report_name}</div>
                    <span style={{ ...badgeStyle(run.status), borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 800 }}>
                      {String(run.status || 'unknown').toUpperCase()}
                    </span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                    {run.target_type || 'report'} • {run.run_mode} • {run.row_count} rows
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>{formatDateTime(run.created_at)}</div>
                  {run.error_message && <div style={{ marginTop: 6, fontSize: 12, color: '#b91c1c' }}>{run.error_message}</div>}
                </div>
              ))}
              {!historyRuns.length && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No runs recorded yet.</div>}
            </div>
          </div>
        </div>
      </div>
    )
  }

  function renderReportsSection() {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 18 }}>
        <div style={cardStyle()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Report Library</div>
              <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-muted)' }}>Trusted reports with approved datasets and controlled definitions.</div>
            </div>
            {isManager && <button onClick={() => openReportEditor(null)} style={pillButtonStyle(false)}>New</button>}
          </div>
          <input
            value={reportSearch}
            onChange={(event) => startTransition(() => setReportSearch(event.target.value))}
            placeholder="Search reports"
            style={{ width: '100%', marginTop: 14, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }}
          />
          <div style={{ marginTop: 14, display: 'grid', gap: 10, maxHeight: 640, overflowY: 'auto' }}>
            {filteredDefinitions.map((definition) => (
              <button
                key={definition.id}
                onClick={() => {
                  setSelectedReportId(definition.id)
                  setReportPreview(null)
                  pushSection('reports', { reportKey: definition.report_key })
                }}
                style={{
                  textAlign: 'left',
                  border: Number(selectedReportId) === Number(definition.id) ? '1px solid var(--primary)' : '1px solid var(--border)',
                  background: Number(selectedReportId) === Number(definition.id) ? 'rgba(var(--primary-rgb, 79,70,229),0.08)' : '#fff',
                  borderRadius: 12,
                  padding: 14,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{definition.name}</div>
                  <span style={{ fontSize: 11, color: definition.is_system ? '#4338ca' : '#0f766e', fontWeight: 800 }}>
                    {definition.is_system ? 'SYSTEM' : 'CUSTOM'}
                  </span>
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>{definition.group_label}</div>
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>{definition.description}</div>
              </button>
            ))}
            {!filteredDefinitions.length && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No reports matched the current search.</div>}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 18 }}>
          {selectedReport && (
            <div style={cardStyle()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <h2 style={{ margin: 0, fontSize: 24 }}>{selectedReport.name}</h2>
                    <span style={{ ...badgeStyle(selectedReport.is_active ? 'success' : 'failed'), borderRadius: 999, padding: '3px 9px', fontSize: 11, fontWeight: 800 }}>
                      {selectedReport.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 14, color: 'var(--text-muted)' }}>{selectedReport.description}</div>
                  <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)' }}>
                    <span>Dataset: {selectedReport.dataset_key}</span>
                    <span>Group: {selectedReport.group_label}</span>
                    <span>Scope: {selectedReport.visibility_scope}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button onClick={() => runSelectedReport(selectedReport.id)} style={pillButtonStyle(true)}>Run Report</button>
                  {isManager && !selectedReport.is_system && <button onClick={() => openReportEditor(selectedReport)} style={pillButtonStyle(false)}>Edit</button>}
                  {isManager && !selectedReport.is_system && <button onClick={deleteSelectedReport} style={pillButtonStyle(false)}>Delete</button>}
                </div>
              </div>
              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Allowed Filters</div>
                  <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700 }}>{selectedReport.allowed_filters?.join(', ') || 'None'}</div>
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Selected Columns</div>
                  <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700 }}>{selectedReport.selected_columns?.length || 0}</div>
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Last Updated</div>
                  <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700 }}>{formatDateTime(selectedReport.updated_at)}</div>
                </div>
              </div>
            </div>
          )}

          {reportEditorOpen && (
            <div style={cardStyle()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{selectedReport && !selectedReport.is_system ? 'Edit Report Definition' : 'Create Report Definition'}</div>
                  <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-muted)' }}>
                    Reports stay metadata-driven. Users choose approved datasets, filters, and visible columns.
                  </div>
                </div>
                <button onClick={() => { setReportEditorOpen(false); setEditingReportId(null) }} style={pillButtonStyle(false)}>Close</button>
              </div>

              <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Dataset</span>
                  <select value={reportForm.dataset_key} onChange={(event) => setReportForm((current) => ({ ...current, dataset_key: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
                    <option value="">Select dataset</option>
                    {datasets.map((dataset) => (
                      <option key={dataset.dataset_key} value={dataset.dataset_key}>{dataset.name}</option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Report Name</span>
                  <input value={reportForm.name} onChange={(event) => setReportForm((current) => ({ ...current, name: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }} />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Group Key</span>
                  <input value={reportForm.group_key} onChange={(event) => setReportForm((current) => ({ ...current, group_key: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }} />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Visibility</span>
                  <select value={reportForm.visibility_scope} onChange={(event) => setReportForm((current) => ({ ...current, visibility_scope: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
                    <option value="shared">Shared</option>
                    <option value="admin_only">Admin Only</option>
                    <option value="leadership">Leadership</option>
                  </select>
                </label>
              </div>

              <label style={{ display: 'grid', gap: 6, marginTop: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Description</span>
                <textarea value={reportForm.description} onChange={(event) => setReportForm((current) => ({ ...current, description: event.target.value }))} rows={3} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', resize: 'vertical' }} />
              </label>

              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Default Date From</span>
                  <input type="date" value={reportForm.default_filters.date_from || ''} onChange={(event) => setReportForm((current) => ({ ...current, default_filters: { ...(current.default_filters || {}), date_from: event.target.value } }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }} />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Default Date To</span>
                  <input type="date" value={reportForm.default_filters.date_to || ''} onChange={(event) => setReportForm((current) => ({ ...current, default_filters: { ...(current.default_filters || {}), date_to: event.target.value } }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 25 }}>
                  <input type="checkbox" checked={!!reportForm.is_active} onChange={(event) => setReportForm((current) => ({ ...current, is_active: event.target.checked }))} />
                  <span style={{ fontSize: 13 }}>Active</span>
                </label>
              </div>

              <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={previewBuilderDataset} style={pillButtonStyle(false)} disabled={!reportForm.dataset_key || reportBuilderPreviewLoading}>
                  {reportBuilderPreviewLoading ? 'Previewing…' : 'Preview Source'}
                </button>
                <button onClick={saveReportDefinition} style={pillButtonStyle(true)} disabled={!reportForm.dataset_key || !reportForm.name.trim()}>
                  Save Report Definition
                </button>
              </div>

              {reportBuilderPreview && (
                <div style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>Visible Columns</div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {reportBuilderPreview.columns.map((column) => (
                      <label key={column} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 999 }}>
                        <input
                          type="checkbox"
                          checked={reportForm.selected_columns.includes(column)}
                          onChange={(event) => {
                            setReportForm((current) => ({
                              ...current,
                              selected_columns: event.target.checked
                                ? [...current.selected_columns, column]
                                : current.selected_columns.filter((item) => item !== column),
                            }))
                          }}
                        />
                        <span style={{ fontSize: 12 }}>{column}</span>
                      </label>
                    ))}
                  </div>
                  {renderDataTable(reportBuilderPreview.columns, reportBuilderPreview.rows.slice(0, 12), `${reportForm.dataset_key || 'dataset'}-preview.csv`)}
                </div>
              )}
            </div>
          )}

          {selectedReport && (
            <div style={cardStyle()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>Report Preview</div>
                  <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-muted)' }}>Manual preview before sharing or scheduling.</div>
                </div>
                <button onClick={() => runSelectedReport(selectedReport.id)} style={pillButtonStyle(false)}>
                  {reportPreviewLoading ? 'Running…' : 'Refresh Preview'}
                </button>
              </div>
              {reportPreview ? renderDataTable(reportPreview.columns, reportPreview.rows, `${selectedReport.report_key}.csv`) : (
                <div style={{ marginTop: 14, fontSize: 13, color: 'var(--text-muted)' }}>
                  Run the selected report to inspect live output.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderDashboardWidgetPreview(widget) {
    if (widget.display_mode === 'kpi-grid') {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
          {(widget.kpis?.length ? widget.kpis : [{ key: 'rows', label: 'Rows', value: widget.row_count }]).map((kpi) => (
            <div key={kpi.key} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: '#fafafa' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.7 }}>{kpi.label}</div>
              <div style={{ marginTop: 8, fontSize: 24, fontWeight: 800 }}>{kpi.value}</div>
            </div>
          ))}
        </div>
      )
    }

    if (widget.display_mode === 'list') {
      const listItems = widgetRowsToList(widget.rows)
      return (
        <div style={{ display: 'grid', gap: 10 }}>
          {listItems.map((item) => (
            <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: '#fafafa' }}>
              <div style={{ fontWeight: 700 }}>{item.title}</div>
              {item.detail && <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>{item.detail}</div>}
            </div>
          ))}
          {!listItems.length && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No data available.</div>}
        </div>
      )
    }

    return renderDataTable(widget.columns || [], widget.rows || [], `${widget.report_key || 'dashboard-widget'}.csv`)
  }

  function renderDashboardsSection() {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 18 }}>
        <div style={cardStyle()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Dashboard Library</div>
              <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-muted)' }}>Saved decision views for operations, compliance, and observability.</div>
            </div>
            {isManager && <button onClick={() => openDashboardEditor(null)} style={pillButtonStyle(false)}>New</button>}
          </div>
          <input
            value={dashboardSearch}
            onChange={(event) => startTransition(() => setDashboardSearch(event.target.value))}
            placeholder="Search dashboards"
            style={{ width: '100%', marginTop: 14, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }}
          />
          <div style={{ marginTop: 14, display: 'grid', gap: 10, maxHeight: 640, overflowY: 'auto' }}>
            {filteredDashboards.map((dashboard) => (
              <button
                key={dashboard.id}
                onClick={() => {
                  setSelectedDashboardId(dashboard.id)
                  setDashboardPreview(null)
                  pushSection('dashboards', { dashboardKey: dashboard.dashboard_key })
                }}
                style={{
                  textAlign: 'left',
                  border: Number(selectedDashboardId) === Number(dashboard.id) ? '1px solid var(--primary)' : '1px solid var(--border)',
                  background: Number(selectedDashboardId) === Number(dashboard.id) ? 'rgba(var(--primary-rgb, 79,70,229),0.08)' : '#fff',
                  borderRadius: 12,
                  padding: 14,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ fontWeight: 800 }}>{dashboard.name}</div>
                  <span style={{ fontSize: 11, color: dashboard.is_system ? '#4338ca' : '#0f766e', fontWeight: 800 }}>
                    {dashboard.is_system ? 'SYSTEM' : 'CUSTOM'}
                  </span>
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>{dashboard.description}</div>
              </button>
            ))}
            {!filteredDashboards.length && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No dashboards matched the current search.</div>}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 18 }}>
          {selectedDashboard && (
            <div style={cardStyle()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <h2 style={{ margin: 0, fontSize: 24 }}>{selectedDashboard.name}</h2>
                    <span style={{ ...badgeStyle(selectedDashboard.is_active ? 'success' : 'failed'), borderRadius: 999, padding: '3px 9px', fontSize: 11, fontWeight: 800 }}>
                      {selectedDashboard.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 14, color: 'var(--text-muted)' }}>{selectedDashboard.description}</div>
                  <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)' }}>
                    <span>Widgets: {selectedDashboard.widgets?.length || 0}</span>
                    <span>Scope: {selectedDashboard.visibility_scope}</span>
                    <span>Last Updated: {formatDateTime(selectedDashboard.updated_at)}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button onClick={() => runSelectedDashboard(selectedDashboard.id)} style={pillButtonStyle(true)}>Run Dashboard</button>
                  {isManager && !selectedDashboard.is_system && <button onClick={() => openDashboardEditor(selectedDashboard)} style={pillButtonStyle(false)}>Edit</button>}
                  {isManager && !selectedDashboard.is_system && <button onClick={deleteSelectedDashboard} style={pillButtonStyle(false)}>Delete</button>}
                </div>
              </div>
            </div>
          )}

          {dashboardEditorOpen && (
            <div style={cardStyle()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{selectedDashboard && !selectedDashboard.is_system ? 'Edit Dashboard' : 'Create Dashboard'}</div>
                  <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-muted)' }}>
                    Dashboards stay controlled: widgets point to approved reports instead of free-form queries.
                  </div>
                </div>
                <button onClick={() => { setDashboardEditorOpen(false); setEditingDashboardId(null) }} style={pillButtonStyle(false)}>Close</button>
              </div>

              <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Dashboard Name</span>
                  <input value={dashboardForm.name} onChange={(event) => setDashboardForm((current) => ({ ...current, name: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }} />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Visibility</span>
                  <select value={dashboardForm.visibility_scope} onChange={(event) => setDashboardForm((current) => ({ ...current, visibility_scope: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
                    <option value="shared">Shared</option>
                    <option value="leadership">Leadership</option>
                    <option value="admin_only">Admin Only</option>
                  </select>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 25 }}>
                  <input type="checkbox" checked={!!dashboardForm.is_active} onChange={(event) => setDashboardForm((current) => ({ ...current, is_active: event.target.checked }))} />
                  <span style={{ fontSize: 13 }}>Active</span>
                </label>
              </div>

              <label style={{ display: 'grid', gap: 6, marginTop: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Description</span>
                <textarea value={dashboardForm.description} onChange={(event) => setDashboardForm((current) => ({ ...current, description: event.target.value }))} rows={3} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', resize: 'vertical' }} />
              </label>

              <div style={{ marginTop: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>Widgets</div>
                  <button
                    onClick={() => setDashboardForm((current) => ({
                      ...current,
                      widgets: [
                        ...(current.widgets || []),
                        { id: `widget-${Date.now()}`, title: '', report_key: '', display_mode: 'table', limit: 6 },
                      ],
                    }))}
                    style={pillButtonStyle(false)}
                  >
                    Add Widget
                  </button>
                </div>
                <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                  {(dashboardForm.widgets || []).map((widget, index) => (
                    <div key={widget.id || index} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.7fr 0.5fr auto', gap: 10, alignItems: 'end' }}>
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Widget Title</span>
                          <input value={widget.title || ''} onChange={(event) => setDashboardForm((current) => ({
                            ...current,
                            widgets: current.widgets.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item),
                          }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }} />
                        </label>
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Report</span>
                          <select value={widget.report_key || ''} onChange={(event) => setDashboardForm((current) => ({
                            ...current,
                            widgets: current.widgets.map((item, itemIndex) => itemIndex === index ? { ...item, report_key: event.target.value } : item),
                          }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
                            <option value="">Select report</option>
                            {definitions.map((definition) => (
                              <option key={definition.report_key} value={definition.report_key}>{definition.name}</option>
                            ))}
                          </select>
                        </label>
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Mode</span>
                          <select value={widget.display_mode || 'table'} onChange={(event) => setDashboardForm((current) => ({
                            ...current,
                            widgets: current.widgets.map((item, itemIndex) => itemIndex === index ? { ...item, display_mode: event.target.value } : item),
                          }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
                            <option value="table">Table</option>
                            <option value="list">List</option>
                            <option value="kpi-grid">KPI Grid</option>
                          </select>
                        </label>
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Limit</span>
                          <input type="number" min="1" max="20" value={widget.limit || 6} onChange={(event) => setDashboardForm((current) => ({
                            ...current,
                            widgets: current.widgets.map((item, itemIndex) => itemIndex === index ? { ...item, limit: Number(event.target.value || 6) } : item),
                          }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }} />
                        </label>
                        <button
                          onClick={() => setDashboardForm((current) => ({
                            ...current,
                            widgets: current.widgets.filter((_, itemIndex) => itemIndex !== index),
                          }))}
                          style={pillButtonStyle(false)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                  {!dashboardForm.widgets?.length && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No widgets yet. Add one or more widgets to define the dashboard surface.</div>}
                </div>
              </div>

              <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={saveDashboard} style={pillButtonStyle(true)} disabled={!dashboardForm.name.trim() || !dashboardForm.widgets.length}>
                  Save Dashboard
                </button>
              </div>
            </div>
          )}

          {selectedDashboard && (
            <div style={cardStyle()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>Dashboard Preview</div>
                  <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-muted)' }}>Widget outputs rendered from the current report definitions.</div>
                </div>
                <button onClick={() => runSelectedDashboard(selectedDashboard.id)} style={pillButtonStyle(false)}>
                  {dashboardPreviewLoading ? 'Running…' : 'Refresh Preview'}
                </button>
              </div>
              {!dashboardPreview ? (
                <div style={{ marginTop: 14, fontSize: 13, color: 'var(--text-muted)' }}>Run the selected dashboard to preview current widget output.</div>
              ) : (
                <div style={{ marginTop: 16, display: 'grid', gap: 14 }}>
                  {dashboardPreview.widgets.map((widget) => (
                    <div key={widget.id} style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 16, background: '#fff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 800 }}>{widget.title}</div>
                          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                            {widget.display_mode} • {widget.row_count} row{widget.row_count !== 1 ? 's' : ''}
                          </div>
                        </div>
                        <button onClick={() => exportRowsAsCsv(widget.rows || [], `${widget.report_key || widget.id}.csv`)} style={pillButtonStyle(false)}>Export Widget</button>
                      </div>
                      <div style={{ marginTop: 14 }}>{renderDashboardWidgetPreview(widget)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderSchedulesSection() {
    const targetOptions = scheduleForm.target_type === 'dashboard' ? dashboards : definitions
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 18 }}>
        <div style={cardStyle()}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Scheduler Management</div>
          <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-muted)' }}>Automated delivery for report definitions and dashboards.</div>
          <div style={{ marginTop: 14, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                  {['Target', 'Frequency', 'Time', 'Delivery', 'Status', 'Next Run', 'Actions'].map((title) => (
                    <th key={title} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.7, color: 'var(--text-muted)' }}>{title}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schedules.map((schedule) => (
                  <tr key={schedule.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 700 }}>{schedule.export_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{schedule.target_type || 'report'}</div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>{schedule.schedule_frequency}</td>
                    <td style={{ padding: '10px 12px' }}>{schedule.schedule_time_local}<div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{schedule.timezone_name}</div></td>
                    <td style={{ padding: '10px 12px' }}>{schedule.delivery_method}<div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{schedule.delivery_target || '—'}</div></td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ ...badgeStyle(schedule.last_run_status || (schedule.is_active ? 'success' : 'failed')), borderRadius: 999, padding: '3px 8px', fontSize: 11, fontWeight: 800 }}>
                        {String(schedule.last_run_status || (schedule.is_active ? 'active' : 'inactive')).toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>{formatDateTime(schedule.next_run_at_utc)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button onClick={() => editSchedule(schedule)} style={pillButtonStyle(false)}>Edit</button>
                        <button onClick={() => removeSchedule(schedule.id)} style={pillButtonStyle(false)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!schedules.length && (
                  <tr>
                    <td colSpan={7} style={{ padding: '16px 12px', color: 'var(--text-muted)' }}>No schedules configured yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={cardStyle()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{editingScheduleId ? 'Edit Schedule' : 'Create Schedule'}</div>
              <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-muted)' }}>
                Scheduler defaults follow the reporting configuration unless you override them here.
              </div>
            </div>
            {editingScheduleId && (
              <button
                onClick={() => {
                  setEditingScheduleId(null)
                  setScheduleForm({
                    target_type: 'report',
                    target_id: '',
                    export_name: '',
                    schedule_frequency: 'daily',
                    schedule_time_local: '08:00',
                    schedule_weekday: 1,
                    timezone_name: moduleConfig.default_timezone || BLANK_CONFIG_FORM.default_timezone,
                    delivery_method: moduleConfig.default_delivery_method || BLANK_CONFIG_FORM.default_delivery_method,
                    delivery_target: moduleConfig.default_delivery_target || '',
                    email_subject: '',
                    is_active: true,
                  })
                }}
                style={pillButtonStyle(false)}
              >
                Reset
              </button>
            )}
          </div>

          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Target Type</span>
              <select value={scheduleForm.target_type} onChange={(event) => setScheduleForm((current) => ({ ...current, target_type: event.target.value, target_id: '', export_name: '' }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
                <option value="report">Report</option>
                <option value="dashboard">Dashboard</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Target</span>
              <select value={scheduleForm.target_id} onChange={(event) => {
                const targetId = event.target.value
                const source = targetOptions.find((item) => String(item.id) === targetId)
                setScheduleForm((current) => ({
                  ...current,
                  target_id: targetId,
                  export_name: current.export_name || source?.name || '',
                }))
              }} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
                <option value="">Select target</option>
                {targetOptions.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Schedule Name</span>
              <input value={scheduleForm.export_name} onChange={(event) => setScheduleForm((current) => ({ ...current, export_name: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Frequency</span>
              <select value={scheduleForm.schedule_frequency} onChange={(event) => setScheduleForm((current) => ({ ...current, schedule_frequency: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Time</span>
              <input type="time" value={scheduleForm.schedule_time_local} onChange={(event) => setScheduleForm((current) => ({ ...current, schedule_time_local: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }} />
            </label>
            {scheduleForm.schedule_frequency === 'weekly' && (
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Weekday</span>
                <select value={scheduleForm.schedule_weekday} onChange={(event) => setScheduleForm((current) => ({ ...current, schedule_weekday: Number(event.target.value) }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
                  {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((label, index) => (
                    <option key={label} value={index}>{label}</option>
                  ))}
                </select>
              </label>
            )}
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Timezone</span>
              <input value={scheduleForm.timezone_name} onChange={(event) => setScheduleForm((current) => ({ ...current, timezone_name: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Delivery Method</span>
              <select value={scheduleForm.delivery_method} onChange={(event) => setScheduleForm((current) => ({ ...current, delivery_method: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
                <option value="email">Email</option>
                <option value="in_app">In App</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Delivery Target</span>
              <input value={scheduleForm.delivery_target} onChange={(event) => setScheduleForm((current) => ({ ...current, delivery_target: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Email Subject</span>
              <input value={scheduleForm.email_subject} onChange={(event) => setScheduleForm((current) => ({ ...current, email_subject: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }} />
            </label>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
            <input type="checkbox" checked={!!scheduleForm.is_active} onChange={(event) => setScheduleForm((current) => ({ ...current, is_active: event.target.checked }))} />
            <span style={{ fontSize: 13 }}>Active schedule</span>
          </label>

          <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={saveSchedule} style={pillButtonStyle(true)} disabled={!scheduleForm.target_id || !scheduleForm.export_name.trim() || scheduleSaving}>
              {scheduleSaving ? 'Saving…' : editingScheduleId ? 'Update Schedule' : 'Create Schedule'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  function renderHistorySection() {
    return (
      <div style={cardStyle()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>Run History</div>
            <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-muted)' }}>
              Every manual and scheduled run captured for audit and troubleshooting.
            </div>
          </div>
          <button onClick={loadHistory} style={pillButtonStyle(false)}>{historyLoading ? 'Refreshing…' : 'Refresh'}</button>
        </div>
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Target Type</span>
            <select value={historyFilters.target_type} onChange={(event) => setHistoryFilters((current) => ({ ...current, target_type: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
              <option value="">All</option>
              <option value="report">Report</option>
              <option value="dashboard">Dashboard</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Status</span>
            <select value={historyFilters.status} onChange={(event) => setHistoryFilters((current) => ({ ...current, status: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
              <option value="">All</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
          </label>
          <div style={{ display: 'flex', alignItems: 'end' }}>
            <button onClick={loadHistory} style={pillButtonStyle(true)}>Apply Filters</button>
          </div>
        </div>
        <div style={{ marginTop: 16, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                {['Name', 'Target', 'Mode', 'Rows', 'Delivery', 'Status', 'When', 'Error'].map((title) => (
                  <th key={title} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.7, color: 'var(--text-muted)' }}>{title}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {historyRuns.map((run) => (
                <tr key={run.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px' }}>{run.report_name}</td>
                  <td style={{ padding: '10px 12px' }}>{run.target_type || 'report'}</td>
                  <td style={{ padding: '10px 12px' }}>{run.run_mode}</td>
                  <td style={{ padding: '10px 12px' }}>{run.row_count}</td>
                  <td style={{ padding: '10px 12px' }}>{run.delivery_method || 'manual'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ ...badgeStyle(run.status), borderRadius: 999, padding: '3px 8px', fontSize: 11, fontWeight: 800 }}>
                      {String(run.status || 'unknown').toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>{formatDateTime(run.created_at)}</td>
                  <td style={{ padding: '10px 12px', color: run.error_message ? '#b91c1c' : 'var(--text-muted)' }}>{run.error_message || '—'}</td>
                </tr>
              ))}
              {!historyRuns.length && (
                <tr>
                  <td colSpan={8} style={{ padding: '16px 12px', color: 'var(--text-muted)' }}>No run history matched the current filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  function renderConfigurationSection() {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.9fr', gap: 18 }}>
        <div style={cardStyle()}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Module Configuration</div>
          <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-muted)' }}>
            Scheduler defaults, report delivery identity, timezone behavior, and retention.
          </div>

          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Default Timezone</span>
              <input value={configForm.default_timezone} onChange={(event) => setConfigForm((current) => ({ ...current, default_timezone: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Default Delivery Method</span>
              <select value={configForm.default_delivery_method} onChange={(event) => setConfigForm((current) => ({ ...current, default_delivery_method: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
                <option value="email">Email</option>
                <option value="in_app">In App</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Default Delivery Target</span>
              <input value={configForm.default_delivery_target} onChange={(event) => setConfigForm((current) => ({ ...current, default_delivery_target: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Email From Name</span>
              <input value={configForm.email_from_name} onChange={(event) => setConfigForm((current) => ({ ...current, email_from_name: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Reply-To Email</span>
              <input value={configForm.reply_to_email} onChange={(event) => setConfigForm((current) => ({ ...current, reply_to_email: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Subject Prefix</span>
              <input value={configForm.digest_subject_prefix} onChange={(event) => setConfigForm((current) => ({ ...current, digest_subject_prefix: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Run Log Retention Days</span>
              <input type="number" min="7" max="365" value={configForm.run_log_retention_days} onChange={(event) => setConfigForm((current) => ({ ...current, run_log_retention_days: Number(event.target.value || 90) }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }} />
            </label>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
            <input type="checkbox" checked={!!configForm.scheduler_enabled} onChange={(event) => setConfigForm((current) => ({ ...current, scheduler_enabled: event.target.checked }))} />
            <span style={{ fontSize: 13 }}>Scheduler enabled for this organisation</span>
          </label>

          <div style={{ marginTop: 18 }}>
            <button onClick={saveConfiguration} style={pillButtonStyle(true)} disabled={configSaving}>
              {configSaving ? 'Saving…' : 'Save Configuration'}
            </button>
          </div>
        </div>

        <div style={cardStyle()}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Governance Notes</div>
          <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
            {[
              'Reports are metadata-driven and tied to approved datasets only.',
              'Dashboards can only consume saved report definitions.',
              'Schedulers now handle report and dashboard targets from one control surface.',
              'Module delivery identity is separated from raw SMTP credentials.',
            ].map((note) => (
              <div key={note} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: '#fafafa', fontSize: 13, color: 'var(--text-primary)' }}>
                {note}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <MIMSLayout>
        <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading reports module…</div>
      </MIMSLayout>
    )
  }

  return (
    <MIMSLayout>
      <div style={{ display: 'grid', gridTemplateRows: 'auto auto 1fr', height: '100%', overflow: 'hidden' }}>
        <div style={{ padding: '18px 24px 12px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.1 }}>Reports Workspace</h1>
              <div style={{ marginTop: 6, fontSize: 14, color: 'var(--text-muted)' }}>
                Stable Release 1 surface for report library, dashboards, schedulers, run history, and reporting configuration.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={() => pushSection('overview')} style={pillButtonStyle(section === 'overview')}>Overview</button>
              <button onClick={() => pushSection('reports')} style={pillButtonStyle(section === 'reports')}>Reports</button>
              <button onClick={() => pushSection('dashboards')} style={pillButtonStyle(section === 'dashboards')}>Dashboards</button>
              {isManager && <button onClick={() => pushSection('schedules')} style={pillButtonStyle(section === 'schedules')}>Schedulers</button>}
              <button onClick={() => pushSection('history')} style={pillButtonStyle(section === 'history')}>Run History</button>
              {isManager && <button onClick={() => pushSection('configuration')} style={pillButtonStyle(section === 'configuration')}>Configuration</button>}
            </div>
          </div>
        </div>

        {error && (
          <div style={{ margin: '12px 24px 0', padding: '10px 12px', borderRadius: 10, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
            {error}
          </div>
        )}

        <div style={{ padding: 24, overflow: 'auto', background: '#f4f7fb' }}>
          {section === 'overview' && renderOverview()}
          {section === 'reports' && renderReportsSection()}
          {section === 'dashboards' && renderDashboardsSection()}
          {section === 'schedules' && isManager && renderSchedulesSection()}
          {section === 'history' && renderHistorySection()}
          {section === 'configuration' && isManager && renderConfigurationSection()}
        </div>
      </div>
    </MIMSLayout>
  )
}
