import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { confirm } from '../../../shared/utils/confirm'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../../shared/context/AuthContext'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import StandaloneModuleShell from '../../../shared/components/StandaloneModuleShell'
import { httpFetch } from '../../../shared/api/httpFetch.js'
import { Button } from '../../../shared/ui'

import ReportFilterBar from '../components/ReportFilterBar'
import ReportTableViewer from '../components/ReportTableViewer'

// The Overview (library counts and a table of links) and Governance (anomaly
// flags on every empty run, recommendations, usage counts, templates, shares,
// role defaults and delivery rules that changed nothing) are gone; Reports is
// the first screen (reports review, RD2, RD5).
const SECTION_LABELS = {
  reports: 'Reports',
  dashboards: 'Dashboards',
  schedules: 'Schedules',
  history: 'Run History',
  configuration: 'Settings',
}

const BLANK_REPORT_FORM = {
  dataset_key: '',
  name: '',
  description: '',
  visibility_scope: 'shared',
  default_filters: {},
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
  email_from_name: 'MIMS Reports',
  reply_to_email: '',
  scheduler_enabled: true,
  digest_subject_prefix: '[MIMS Reports]',
}

function formatDateTime(value) {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return value
  return dt.toLocaleString()
}

// Who may see a report or dashboard; checked on the server.
const AUDIENCE_OPTIONS = [
  { value: 'shared', label: 'Everyone with Reports' },
  { value: 'managers', label: 'Report managers' },
  { value: 'admin_only', label: 'Administrators' },
]

const LOCAL_TIMEZONE = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' } })()
// The time zone was free text; a typo saved and the schedule ran in UTC.
const TIMEZONES = (() => { try { return Intl.supportedValuesOf('timeZone') } catch { return [LOCAL_TIMEZONE, 'UTC'] } })()
const FREQUENCY_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly, on the 1st' }
const DELIVERY_LABELS = { email: 'Email', in_app: 'Notification in MIMS' }

const RUN_MODE_LABELS = { manual: 'Run on screen', scheduled: 'Schedule', export: 'Exported', retry: 'Run again' }

function blankSchedule() {
  return {
    target_type: 'report',
    target_id: '',
    export_name: '',
    schedule_frequency: 'daily',
    schedule_time_local: '08:00',
    schedule_weekday: 1,
    timezone_name: LOCAL_TIMEZONE,
    delivery_method: 'email',
    recipients: [],
    filters: {},
    email_subject: '',
    is_active: true,
  }
}

function downloadBlob(blob, filename) {
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
  if (normalized === 'paused') {
    return { background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }
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
  const { token, hasCapability } = useAuth()
  const standalone = new URLSearchParams(location.search || '').get('standalone') === '1'
  // Capabilities decide what shows; the server checks the same privileges.
  // Schedules and Configuration were gated by the admin role here and by
  // Manage Reports on the server, so a manager with Schedule reports saw nothing.
  const canManageReports = hasCapability('reports.manage')
  const canExportReports = hasCapability('reports.export')
  const canScheduleReports = hasCapability('reports.schedule')
  const headers = useMemo(
    () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }),
    [token]
  )

  const [section, setSection] = useState('reports')
  const [datasets, setDatasets] = useState([])
  const [definitions, setDefinitions] = useState([])
  const [dashboards, setDashboards] = useState([])
  const [schedules, setSchedules] = useState([])
  const [historyRuns, setHistoryRuns] = useState([])
  const [favorites, setFavorites] = useState([])
  const [runDetail, setRunDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [reportSearch, setReportSearch] = useState('')
  const [selectedReportId, setSelectedReportId] = useState(null)
  const [editingReportId, setEditingReportId] = useState(null)
  const [reportEditorOpen, setReportEditorOpen] = useState(false)
  const [reportForm, setReportForm] = useState(BLANK_REPORT_FORM)
  const [reportPreview, setReportPreview] = useState(null)
  const [reportPreviewLoading, setReportPreviewLoading] = useState(false)
  const [reportFilters, setReportFilters] = useState({})
  const [filterOptions, setFilterOptions] = useState({})
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
  const [scheduleForm, setScheduleForm] = useState(blankSchedule)
  const [recipientOptions, setRecipientOptions] = useState([])
  const [scheduleSaving, setScheduleSaving] = useState(false)

  const [historyFilters, setHistoryFilters] = useState({ target_type: '', status: '' })
  const [historyLoading, setHistoryLoading] = useState(false)

  const [configForm, setConfigForm] = useState(BLANK_CONFIG_FORM)
  const [configSaving, setConfigSaving] = useState(false)

  const deferredReportSearch = useDeferredValue(reportSearch)
  const deferredDashboardSearch = useDeferredValue(dashboardSearch)

  const apiJson = useCallback(async (url, options = {}) => {
    const response = await httpFetch(url, {
      ...options,
      headers: options.headers || headers,
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload.error || 'Request failed.')
    }
    return payload
  }, [headers])

  const loadModuleData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const [datasetsPayload, definitionsPayload, dashboardsPayload, schedulesPayload, historyPayload, favoritesPayload, configPayload] = await Promise.all([
        apiJson('/api/reports/module/datasets'),
        apiJson('/api/reports/module/definitions'),
        apiJson('/api/reports/module/dashboards'),
        canScheduleReports ? apiJson('/api/reports/module/schedules') : Promise.resolve({ schedules: [] }),
        apiJson('/api/reports/module/history?limit=20'),
        apiJson('/api/reports/module/favorites'),
        canManageReports ? apiJson('/api/reports/module/config') : Promise.resolve(null),
      ])
      setDatasets(Array.isArray(datasetsPayload.datasets) ? datasetsPayload.datasets : [])
      const nextDefinitions = Array.isArray(definitionsPayload.definitions) ? definitionsPayload.definitions : []
      setDefinitions(nextDefinitions)
      setDashboards(Array.isArray(dashboardsPayload.dashboards) ? dashboardsPayload.dashboards : [])
      setSchedules(Array.isArray(schedulesPayload.schedules) ? schedulesPayload.schedules : [])
      setHistoryRuns(Array.isArray(historyPayload.runs) ? historyPayload.runs : [])
      setFavorites(Array.isArray(favoritesPayload?.favorites) ? favoritesPayload.favorites : [])

      if (canManageReports && configPayload) {
        const normalizedConfig = {
          email_from_name: configPayload.email_from_name || BLANK_CONFIG_FORM.email_from_name,
          reply_to_email: configPayload.reply_to_email || '',
          scheduler_enabled: !!Number(configPayload.scheduler_enabled ?? 1),
          digest_subject_prefix: configPayload.digest_subject_prefix || BLANK_CONFIG_FORM.digest_subject_prefix,
        }
        setConfigForm(normalizedConfig)
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
  }, [apiJson, canManageReports, canScheduleReports, selectedDashboardId, selectedReportId, token])

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

  const pushSection = useCallback((nextSection, extraParams = {}) => {
    const params = new URLSearchParams(location.search || '')
    params.set('section', nextSection)
    if (standalone) params.set('standalone', '1')
    Object.entries(extraParams).forEach(([key, value]) => {
      if (value) params.set(key, value)
      else params.delete(key)
    })
    navigate({ pathname: '/reports', search: `?${params.toString()}` }, { replace: false })
    setSection(nextSection)
  }, [location.search, navigate, standalone])

  useEffect(() => {
    loadModuleData()
  }, [loadModuleData])

  // Who this schedule may be emailed to: people in the organisation who can
  // see the chosen report or dashboard.
  useEffect(() => {
    if (section !== 'schedules' || !scheduleForm.target_id || !canScheduleReports) { setRecipientOptions([]); return }
    apiJson(`/api/reports/module/recipients?target_type=${scheduleForm.target_type}&target_id=${scheduleForm.target_id}`)
      .then((payload) => setRecipientOptions(Array.isArray(payload.recipients) ? payload.recipients : []))
      .catch(() => setRecipientOptions([]))
  }, [apiJson, canScheduleReports, scheduleForm.target_id, scheduleForm.target_type, section])

  useEffect(() => {
    if (!token) return
    apiJson('/api/reports/module/filter-options').then(setFilterOptions).catch(() => setFilterOptions({}))
  }, [apiJson, token])

  useEffect(() => {
    const params = new URLSearchParams(location.search || '')
    const sectionParam = params.get('section')
    if (sectionParam && SECTION_LABELS[sectionParam]) {
      setSection(sectionParam)
    }
  }, [location.search])

  useEffect(() => {
    if ((!canScheduleReports && section === 'schedules') || (!canManageReports && section === 'configuration')) {
      pushSection('reports')
    }
  }, [canManageReports, canScheduleReports, pushSection, section])

  useEffect(() => {
    if (!definitions.length) return
    const params = new URLSearchParams(location.search || '')
    const reportKey = params.get('reportKey')
    // A report named in the address opens the Reports section only when no
    // other section is asked for: "Schedule Report" went to Schedulers and this
    // pulled it straight back, so the button did nothing.
    const sectionParam = params.get('section')
    if (reportKey && (!sectionParam || sectionParam === 'reports')) {
      const match = definitions.find((item) => item.report_key === reportKey)
      if (match) {
        setSelectedReportId(match.id)
        setSection('reports')
      }
    }

    if (location.state?.activeReport) {
      const match = definitions.find((item) => item.report_key === location.state.activeReport)
      if (match) {
        setSection('reports')
        setSelectedReportId(match.id)
        setReportPreview(null)
        setReportFilters({ ...(match.default_filters || {}), ...(location.state.appliedFilters || {}) })
      }
    }
  }, [location.state, location.search, definitions])

  useEffect(() => {
    if (!dashboards.length) return
    const params = new URLSearchParams(location.search || '')
    const dashboardKey = params.get('dashboardKey')
    if (dashboardKey) {
      const match = dashboards.find((item) => item.dashboard_key === dashboardKey)
      if (match) {
        setSelectedDashboardId(match.id)
        setSection('dashboards')
      }
    }
  }, [dashboards, location.search])

  function openReportEditor(definition = null) {
    if (definition) {
      setEditingReportId(definition.id)
      setReportForm({
        dataset_key: definition.dataset_key,
        name: definition.name,
        description: definition.description || '',
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

  // The library under its headings, favourites first.
  const libraryGroups = (() => {
    const groups = new Map()
    const favourites = filteredDefinitions.filter((item) => isFavorite('report', item.id))
    if (favourites.length) groups.set('Favourites', favourites)
    filteredDefinitions.forEach((item) => {
      const label = item.is_system ? (item.group_label || 'Other') : 'Your organisation\'s reports'
      if (!groups.has(label)) groups.set(label, [])
      groups.get(label).push(item)
    })
    return [...groups.entries()].map(([label, items]) => ({ label, items }))
  })()
  const selectedReport = definitions.find((item) => Number(item.id) === Number(selectedReportId)) || null
  const selectedDashboard = dashboards.find((item) => Number(item.id) === Number(selectedDashboardId)) || null
  const sectionGroups = [
    {
      label: 'Reports',
      items: [
        { key: 'reports', label: 'Reports' },
        { key: 'dashboards', label: 'Dashboards' },
        ...(canScheduleReports ? [{ key: 'schedules', label: 'Schedules' }] : []),
        { key: 'history', label: 'Run History' },
        ...(canManageReports ? [{ key: 'configuration', label: 'Settings' }] : []),
      ],
    },
  ]

  function isFavorite(targetType, targetId) {
    return favorites.some((item) => item.target_type === targetType && Number(item.target_id) === Number(targetId))
  }

  async function toggleFavorite(targetType, targetId) {
    try {
      const favorite = isFavorite(targetType, targetId)
      const payload = await apiJson('/api/reports/module/favorites', {
        method: favorite ? 'DELETE' : 'POST',
        body: JSON.stringify({ target_type: targetType, target_id: targetId }),
      })
      setFavorites(Array.isArray(payload.favorites) ? payload.favorites : [])
    } catch (err) {
      setError(err.message || 'Failed to update favorite.')
    }
  }

  async function duplicateReport(definitionId = selectedReportId) {
    if (!definitionId) return
    try {
      const payload = await apiJson(`/api/reports/module/definitions/${definitionId}/duplicate`, { method: 'POST' })
      await loadModuleData()
      setSelectedReportId(payload.id)
      pushSection('reports', { reportKey: payload.report_key })
    } catch (err) {
      setError(err.message || 'Failed to duplicate report.')
    }
  }

  async function duplicateDashboard(dashboardId = selectedDashboardId) {
    if (!dashboardId) return
    try {
      const payload = await apiJson(`/api/reports/module/dashboards/${dashboardId}/duplicate`, { method: 'POST' })
      await loadModuleData()
      setSelectedDashboardId(payload.id)
      pushSection('dashboards', { dashboardKey: payload.dashboard_key })
    } catch (err) {
      setError(err.message || 'Failed to duplicate dashboard.')
    }
  }

  async function toggleSchedule(schedule) {
    try {
      const action = Number(schedule.is_active) ? 'pause' : 'resume'
      await apiJson(`/api/reports/module/schedules/${schedule.id}/${action}`, { method: 'POST' })
      await loadModuleData()
    } catch (err) {
      setError(err.message || 'Failed to update schedule state.')
    }
  }

  async function openRunDetail(runId) {
    try {
      const payload = await apiJson(`/api/reports/module/history/${runId}`)
      setRunDetail(payload)
    } catch (err) {
      setError(err.message || 'Failed to load run detail.')
    }
  }

  async function retryRun(runId) {
    try {
      await apiJson(`/api/reports/module/history/${runId}/retry`, { method: 'POST' })
      await loadHistory()
      await loadModuleData()
    } catch (err) {
      setError(err.message || 'Failed to retry run.')
    }
  }

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
        body: JSON.stringify({ filters: reportFilters }),
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

  // Export runs on the server, which checks Export Reports and records it.
  async function exportReport(definitionId, filters, fileBase = 'report') {
    try {
      const response = await httpFetch(`/api/reports/module/definitions/${definitionId}/export`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ filters: filters || {} }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Export failed.')
      }
      // The file name is made here: a cross-origin response hides Content-Disposition.
      downloadBlob(await response.blob(), `${fileBase}-${new Date().toISOString().slice(0, 10)}.csv`)
    } catch (err) {
      setError(err.message || 'Failed to export report.')
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
    if (!await confirm(`Delete report "${selectedReport.name}"?`)) return
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
    if (!await confirm(`Delete dashboard "${selectedDashboard.name}"?`)) return
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

  // The report toolbar's "Schedule" opens the Schedulers section with this report
  // filled in. It used to open the old Scheduled Reports window, which posted to a
  // legacy service that never worked (Postgres SQL against a missing table — T16).
  function scheduleSelectedReport() {
    if (!canScheduleReports) { setError('You do not have permission to schedule reports.'); return }
    setEditingScheduleId(null)
    // The schedule keeps the filters on screen; typed dates become the period,
    // because fixed dates would send the same days for ever.
    const { date_from: _from, date_to: _to, ...kept } = reportFilters
    setScheduleForm({
      ...blankSchedule(),
      target_type: 'report',
      target_id: String(selectedReport.id),
      export_name: selectedReport.name,
      filters: kept,
    })
    pushSection('schedules')
  }

  async function saveSchedule() {
    setScheduleSaving(true)
    try {
      const url = editingScheduleId
        ? `/api/reports/module/schedules/${editingScheduleId}`
        : '/api/reports/module/schedules'
      const method = editingScheduleId ? 'PUT' : 'POST'
      const { recipients, ...form } = scheduleForm
      await apiJson(url, {
        method,
        body: JSON.stringify({
          ...form,
          delivery_target: form.delivery_method === 'email' ? recipients.join(', ') : '',
          target_id: form.target_id ? Number(form.target_id) : null,
          schedule_weekday: Number(form.schedule_weekday || 1),
          is_active: !!form.is_active,
        }),
      })
      setEditingScheduleId(null)
      setScheduleForm(blankSchedule())
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
      timezone_name: schedule.timezone_name || LOCAL_TIMEZONE,
      delivery_method: schedule.delivery_method === 'in_app' ? 'in_app' : 'email',
      recipients: String(schedule.delivery_target || '').split(/[\s,;]+/).filter(Boolean),
      filters: schedule.filters || {},
      email_subject: schedule.email_subject || '',
      is_active: !!Number(schedule.is_active ?? 1),
    })
  }

  async function removeSchedule(id) {
    if (!await confirm('Delete this schedule?')) return
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
        }),
      })
      const normalized = {
        email_from_name: payload.email_from_name || '',
        reply_to_email: payload.reply_to_email || '',
        scheduler_enabled: !!Number(payload.scheduler_enabled ?? 1),
        digest_subject_prefix: payload.digest_subject_prefix || '',
      }
      setConfigForm(normalized)
      await loadModuleData()
    } catch (err) {
      setError(err.message || 'Failed to save module configuration.')
    } finally {
      setConfigSaving(false)
    }
  }



  function renderReportsSection() {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 18 }}>
        <div style={cardStyle()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Reports</div>
              <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-muted)' }}>Choose a report, set the filters and run it.</div>
            </div>
            <Button variant="primary" size="sm" disabled={!canManageReports}
              title={!canManageReports ? 'Requires the Manage Reports permission' : undefined}
              onClick={() => openReportEditor(null)}>New</Button>
          </div>
          <input
            value={reportSearch}
            onChange={(event) => startTransition(() => setReportSearch(event.target.value))}
            placeholder="Search reports"
            style={{ width: '100%', marginTop: 14, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }}
          />
          <div style={{ marginTop: 14, display: 'grid', gap: 10, maxHeight: 640, overflowY: 'auto' }}>
            {libraryGroups.map((group) => (
              <div key={group.label} style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: 4 }}>{group.label}</div>
                {group.items.map((definition) => (
              <button
                key={definition.id}
                onClick={() => {
                  setSelectedReportId(definition.id)
                  setReportPreview(null)
                  setReportFilters({ ...(definition.default_filters || {}) })
                  pushSection('reports', { reportKey: definition.report_key })
                }}
                style={{
                  textAlign: 'left',
                  border: Number(selectedReportId) === Number(definition.id) ? '1px solid var(--primary)' : '1px solid var(--border)',
                  background: Number(selectedReportId) === Number(definition.id) ? 'rgba(var(--primary-rgb, 79,70,229),0.08)' : '#fff',
                  borderRadius: 12,
                  padding: 12,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                  <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{isFavorite('report', definition.id) ? '★ ' : ''}{definition.name}</div>
                  {!definition.is_system && <span style={{ fontSize: 11, color: '#0f766e', fontWeight: 800 }}>CUSTOM</span>}
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>{definition.description}</div>
              </button>
                ))}
              </div>
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
                    {!selectedReport.is_active && <span style={{ ...badgeStyle('failed'), borderRadius: 999, padding: '3px 9px', fontSize: 11, fontWeight: 800 }}>SWITCHED OFF</span>}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 14, color: 'var(--text-muted)' }}>{selectedReport.description}</div>
                  <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)' }}>
                    <span>{selectedReport.is_system ? selectedReport.group_label : 'Your organisation\'s report'}</span>
                    <span>Audience: {selectedReport.audience_label}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button onClick={() => toggleFavorite('report', selectedReport.id)} style={pillButtonStyle(false)}>{isFavorite('report', selectedReport.id) ? 'Unfavorite' : 'Favorite'}</button>
                  {canManageReports && <button onClick={() => duplicateReport(selectedReport.id)} style={pillButtonStyle(false)}>Duplicate</button>}
                  {canManageReports && !selectedReport.is_system && <button onClick={() => openReportEditor(selectedReport)} style={pillButtonStyle(false)}>Edit</button>}
                  {canManageReports && !selectedReport.is_system && <button onClick={deleteSelectedReport} style={pillButtonStyle(false)}>Delete</button>}
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
                    {datasets.filter((dataset) => dataset.is_built !== false).map((dataset) => (
                      <option key={dataset.dataset_key} value={dataset.dataset_key}>{dataset.name}</option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Report Name</span>
                  <input value={reportForm.name} onChange={(event) => setReportForm((current) => ({ ...current, name: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }} />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Who can see it</span>
                  <select aria-label="Who can see it" value={reportForm.visibility_scope} onChange={(event) => setReportForm((current) => ({ ...current, visibility_scope: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
                    {AUDIENCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              </div>

              <label style={{ display: 'grid', gap: 6, marginTop: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Description</span>
                <textarea value={reportForm.description} onChange={(event) => setReportForm((current) => ({ ...current, description: event.target.value }))} rows={3} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', resize: 'vertical' }} />
              </label>

              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                {/* A saved period moves with the calendar; saved dates went stale. */}
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Default period</span>
                  <select aria-label="Default period" value={reportForm.default_filters.period || ''} onChange={(event) => setReportForm((current) => ({ ...current, default_filters: { period: event.target.value } }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
                    <option value="">The report's own default</option>
                    {(filterOptions.periods || []).map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
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
                  <ReportTableViewer columns={reportBuilderPreview.columns} labels={reportBuilderPreview.column_labels} rows={reportBuilderPreview.rows.slice(0, 12)} />
                </div>
              )}
            </div>
          )}

          {selectedReport && (
            <div style={cardStyle()}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Results</div>
              <div style={{ marginTop: 14 }}>
                <ReportFilterBar
                  report={selectedReport}
                  filters={reportFilters}
                  options={filterOptions}
                  onChange={setReportFilters}
                  onRun={() => runSelectedReport(selectedReport.id)}
                  running={reportPreviewLoading}
                  onExport={canExportReports ? () => exportReport(selectedReport.id, reportFilters, selectedReport.report_key) : null}
                  disableExport={!reportPreview?.rows?.length}
                  onSchedule={canScheduleReports ? scheduleSelectedReport : null}
                />
                {reportPreview ? (
                  <>
                    {reportPreview.truncated && (
                      <div style={{ marginBottom: 10, fontSize: 13, color: '#b45309' }}>Showing the first {reportPreview.row_count.toLocaleString()} rows. Narrow the period or filters to see the rest.</div>
                    )}
                    <ReportTableViewer
                      columns={reportPreview.columns}
                      labels={reportPreview.column_labels}
                      rows={reportPreview.rows}
                      onRowClick={(row) => row.__drill_route && navigate(row.__drill_route, { state: row.__drill_state })}
                    />
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Choose the filters and press Run.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderDashboardWidgetPreview(widget) {
    if (widget.not_built) {
      return <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>This report is not built yet.</div>
    }
    if (widget.not_available) {
      return <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>This report is not available to you.</div>
    }
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

    return <ReportTableViewer columns={widget.columns || []} labels={widget.column_labels} rows={widget.rows || []} />
  }

  function renderDashboardsSection() {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 18 }}>
        <div style={cardStyle()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>Dashboard Library</div>
              <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-muted)' }}>Several reports run together on one screen.</div>
            </div>
            <Button variant="primary" size="sm" disabled={!canManageReports}
              title={!canManageReports ? 'Requires the Manage Reports permission' : undefined}
              onClick={() => openDashboardEditor(null)}>New</Button>
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
                  {!dashboard.is_system && <span style={{ fontSize: 11, color: '#0f766e', fontWeight: 800 }}>CUSTOM</span>}
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
                    {!selectedDashboard.is_active && <span style={{ ...badgeStyle('failed'), borderRadius: 999, padding: '3px 9px', fontSize: 11, fontWeight: 800 }}>SWITCHED OFF</span>}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 14, color: 'var(--text-muted)' }}>{selectedDashboard.description}</div>
                  <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)' }}>
                    <span>Widgets: {selectedDashboard.widgets?.length || 0}</span>
                    <span>Audience: {selectedDashboard.audience_label}</span>
                    <span>Last Updated: {formatDateTime(selectedDashboard.updated_at)}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button onClick={() => runSelectedDashboard(selectedDashboard.id)} style={pillButtonStyle(true)}>Run Dashboard</button>
                  <button onClick={() => toggleFavorite('dashboard', selectedDashboard.id)} style={pillButtonStyle(false)}>{isFavorite('dashboard', selectedDashboard.id) ? 'Unfavorite' : 'Favorite'}</button>
                  {canManageReports && <button onClick={() => duplicateDashboard(selectedDashboard.id)} style={pillButtonStyle(false)}>Duplicate</button>}
                  {canManageReports && !selectedDashboard.is_system && <button onClick={() => openDashboardEditor(selectedDashboard)} style={pillButtonStyle(false)}>Edit</button>}
                  {canManageReports && !selectedDashboard.is_system && <button onClick={deleteSelectedDashboard} style={pillButtonStyle(false)}>Delete</button>}
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
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Who can see it</span>
                  <select aria-label="Who can see it" value={dashboardForm.visibility_scope} onChange={(event) => setDashboardForm((current) => ({ ...current, visibility_scope: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
                    {AUDIENCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
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
                            {definitions.filter((definition) => definition.is_built !== false).map((definition) => (
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
                  <div style={{ fontSize: 18, fontWeight: 800 }}>Results</div>
                  <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-muted)' }}>Each panel runs its report with the report's own period.</div>
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
                            {widget.rows?.length < widget.row_count ? `First ${widget.rows.length} of ${widget.row_count} rows` : `${widget.row_count} row${widget.row_count !== 1 ? 's' : ''}`}
                          </div>
                        </div>
                        {canExportReports && !widget.not_built && !widget.not_available && <button onClick={() => exportReport(widget.definition_id, {}, widget.report_key)} style={pillButtonStyle(false)}>Export Widget</button>}
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
    const targetOptions = scheduleForm.target_type === 'dashboard' ? dashboards : definitions.filter((definition) => definition.is_built !== false)
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 18 }}>
        <div style={cardStyle()}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Schedules</div>
          <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-muted)' }}>Reports and dashboards sent on a timetable.</div>
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
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{schedule.target_type === 'dashboard' ? 'Dashboard' : 'Report'}{schedule.filters?.period ? ` · ${(filterOptions.periods || []).find((p) => p.value === schedule.filters.period)?.label || schedule.filters.period}` : ''}</div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>{FREQUENCY_LABELS[schedule.schedule_frequency] || schedule.schedule_frequency}</td>
                    <td style={{ padding: '10px 12px' }}>{schedule.schedule_time_local}<div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{schedule.timezone_name}</div></td>
                    <td style={{ padding: '10px 12px' }}>{DELIVERY_LABELS[schedule.delivery_method] || schedule.delivery_method}<div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{schedule.delivery_method === 'email' ? (schedule.delivery_target || '—') : 'To whoever set it up'}</div></td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ ...badgeStyle(!Number(schedule.is_active) ? 'paused' : (schedule.last_run_status || 'waiting')), borderRadius: 999, padding: '3px 8px', fontSize: 11, fontWeight: 800 }}>
                        {!Number(schedule.is_active) ? 'PAUSED' : schedule.last_run_status === 'failed' ? 'LAST RUN FAILED' : schedule.last_run_status === 'success' ? 'LAST RUN SENT' : 'NOT RUN YET'}
                      </span>
                      {schedule.last_run_status === 'failed' && schedule.last_error && <div style={{ marginTop: 4, fontSize: 12, color: '#b91c1c' }}>{schedule.last_error}</div>}
                    </td>
                    <td style={{ padding: '10px 12px' }}>{formatDateTime(schedule.next_run_at_utc)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button onClick={() => editSchedule(schedule)} style={pillButtonStyle(false)}>Edit</button>
                        <button onClick={() => toggleSchedule(schedule)} style={pillButtonStyle(false)}>{Number(schedule.is_active) ? 'Pause' : 'Resume'}</button>
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
                Emailed only to people in this organisation who can see the report.
              </div>
            </div>
            {editingScheduleId && (
              <button
                onClick={() => {
                  setEditingScheduleId(null)
                  setScheduleForm(blankSchedule())
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
            <label style={{ display: 'grid', gap: 6, minWidth: 0 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Target</span>
              <select value={scheduleForm.target_id} onChange={(event) => {
                const targetId = event.target.value
                const source = targetOptions.find((item) => String(item.id) === targetId)
                setScheduleForm((current) => ({
                  ...current,
                  target_id: targetId,
                  export_name: current.export_name || source?.name || '',
                }))
              }} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', width: '100%' }}>
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
                {Object.entries(FREQUENCY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
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
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Time zone</span>
              <select aria-label="Time zone" value={scheduleForm.timezone_name} onChange={(event) => setScheduleForm((current) => ({ ...current, timezone_name: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
                {(TIMEZONES.includes(scheduleForm.timezone_name) ? TIMEZONES : [scheduleForm.timezone_name, ...TIMEZONES]).map((zone) => <option key={zone} value={zone}>{zone}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6, minWidth: 0 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Period each send covers</span>
              <select aria-label="Period each send covers" value={scheduleForm.filters?.period || ''} onChange={(event) => setScheduleForm((current) => ({ ...current, filters: { ...(current.filters || {}), period: event.target.value } }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', width: '100%' }}>
                <option value="">{`Matches how often it runs (${scheduleForm.schedule_frequency === 'monthly' ? 'last month' : scheduleForm.schedule_frequency === 'weekly' ? 'last 7 days' : 'yesterday'})`}</option>
                {(filterOptions.periods || []).map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Delivery Method</span>
              <select value={scheduleForm.delivery_method} onChange={(event) => setScheduleForm((current) => ({ ...current, delivery_method: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
                {Object.entries(DELIVERY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Email Subject</span>
              <input value={scheduleForm.email_subject} onChange={(event) => setScheduleForm((current) => ({ ...current, email_subject: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }} />
            </label>
          </div>

          {scheduleForm.delivery_method === 'email' && (
            <div style={{ marginTop: 14 }} data-testid="schedule-recipients">
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Email to — people in this organisation who can see this report</div>
              {!scheduleForm.target_id ? (
                <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)' }}>Choose the report first.</div>
              ) : (
                <div style={{ marginTop: 6, display: 'grid', gap: 4, maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10, padding: 8 }}>
                  {recipientOptions.map((person) => (
                    <label key={person.email} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={scheduleForm.recipients.includes(person.email)}
                        onChange={(event) => setScheduleForm((current) => ({
                          ...current,
                          recipients: event.target.checked
                            ? [...current.recipients, person.email]
                            : current.recipients.filter((email) => email !== person.email),
                        }))}
                      />
                      {person.name} <span style={{ color: 'var(--text-muted)' }}>{person.email}</span>
                    </label>
                  ))}
                  {!recipientOptions.length && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nobody in this organisation can receive this report.</div>}
                </div>
              )}
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
            <input type="checkbox" checked={!!scheduleForm.is_active} onChange={(event) => setScheduleForm((current) => ({ ...current, is_active: event.target.checked }))} />
            <span style={{ fontSize: 13 }}>Active schedule</span>
          </label>

          <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={saveSchedule} style={pillButtonStyle(true)} disabled={!scheduleForm.target_id || !scheduleForm.export_name.trim() || scheduleSaving || (scheduleForm.delivery_method === 'email' && !scheduleForm.recipients.length)}>
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
                {['Name', 'Target', 'Mode', 'Rows', 'Delivery', 'Status', 'When', 'Error', 'Actions'].map((title) => (
                  <th key={title} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.7, color: 'var(--text-muted)' }}>{title}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {historyRuns.map((run) => (
                <tr key={run.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px' }}>{run.report_name}</td>
                  <td style={{ padding: '10px 12px' }}>{run.target_type || 'report'}</td>
                  <td style={{ padding: '10px 12px' }}>{RUN_MODE_LABELS[run.run_mode] || run.run_mode}</td>
                  <td style={{ padding: '10px 12px' }}>{run.row_count}</td>
                  <td style={{ padding: '10px 12px' }}>{run.delivery_method || 'manual'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ ...badgeStyle(run.status), borderRadius: 999, padding: '3px 8px', fontSize: 11, fontWeight: 800 }}>
                      {String(run.status || 'unknown').toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>{formatDateTime(run.created_at)}</td>
                  <td style={{ padding: '10px 12px', color: run.error_message ? '#b91c1c' : 'var(--text-muted)' }}>{run.error_message || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button onClick={() => openRunDetail(run.id)} style={pillButtonStyle(false)}>Detail</button>
                      {canManageReports && run.status === 'failed' && <button onClick={() => retryRun(run.id)} style={pillButtonStyle(false)}>Retry</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {!historyRuns.length && (
                <tr>
                  <td colSpan={9} style={{ padding: '16px 12px', color: 'var(--text-muted)' }}>No run history matched the current filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {runDetail && (
          <div style={{ marginTop: 16, border: '1px solid var(--border)', borderRadius: 14, padding: 16, background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>Run Detail</div>
                <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-muted)' }}>{runDetail.report_name} • {formatDateTime(runDetail.created_at)}</div>
              </div>
              <button onClick={() => setRunDetail(null)} style={pillButtonStyle(false)}>Close</button>
            </div>
            {/* Readable, not the raw JSON it showed before. */}
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, fontSize: 13 }}>
              <div><strong>How</strong><div>{RUN_MODE_LABELS[runDetail.run_mode] || runDetail.run_mode}</div></div>
              <div><strong>By</strong><div>{runDetail.triggered_by_name || '—'}</div></div>
              <div><strong>Period</strong><div>{runDetail.filters?.date_from ? `${runDetail.filters.date_from} to ${runDetail.filters.date_to}` : ((filterOptions.periods || []).find((p) => p.value === runDetail.filters?.period)?.label || 'Report default')}</div></div>
              <div><strong>Rows</strong><div>{runDetail.row_count}</div></div>
              {runDetail.delivery_target && <div><strong>Sent to</strong><div>{runDetail.delivery_target}</div></div>}
              {Object.entries(runDetail.filters || {}).filter(([key]) => !['period', 'date_from', 'date_to'].includes(key)).map(([key, value]) => (
                <div key={key}><strong>{key.replace(/_/g, ' ')}</strong><div>{String(value)}</div></div>
              ))}
              {runDetail.diagnostics?.recipients_skipped && <div><strong>Not sent to</strong><div>{runDetail.diagnostics.recipients_skipped.join(', ')}</div></div>}
              {runDetail.error_message && <div style={{ color: '#b91c1c' }}><strong>Why it failed</strong><div>{runDetail.error_message}</div></div>}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Settings that change what happens. Default delivery method and address,
  // run-log retention (nothing deleted anything), the default time zone (each
  // schedule has its own) and four "governance notes" are gone (RD4, RD8).
  function renderConfigurationSection() {
    return (
      <div style={{ ...cardStyle(), maxWidth: 760 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Settings</div>
        <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text-muted)' }}>
          How scheduled reports are emailed for this organisation.
        </div>

        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Email from name</span>
            <input value={configForm.email_from_name} onChange={(event) => setConfigForm((current) => ({ ...current, email_from_name: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Reply-to email</span>
            <input value={configForm.reply_to_email} onChange={(event) => setConfigForm((current) => ({ ...current, reply_to_email: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Subject starts with</span>
            <input value={configForm.digest_subject_prefix} onChange={(event) => setConfigForm((current) => ({ ...current, digest_subject_prefix: event.target.value }))} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }} />
          </label>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
          <input type="checkbox" checked={!!configForm.scheduler_enabled} onChange={(event) => setConfigForm((current) => ({ ...current, scheduler_enabled: event.target.checked }))} />
          <span style={{ fontSize: 13 }}>Send scheduled reports (untick to pause every schedule in this organisation)</span>
        </label>

        <div style={{ marginTop: 18 }}>
          <button onClick={saveConfiguration} style={pillButtonStyle(true)} disabled={configSaving}>
            {configSaving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    const loadingContent = <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading reports module…</div>
    if (standalone) {
      return (
        <StandaloneModuleShell title="Reports" subtitle="Reports Console" logo="R" loginPath="/reports/login">
          {loadingContent}
        </StandaloneModuleShell>
      )
    }
    return (
      <MIMSLayout showStatStrip={false} bodyClassName="mims-ops-page-body" surfaceVariant="workspace" compact>
        {loadingContent}
      </MIMSLayout>
    )
  }

  const content = (
    <div className="workspace-page workspace-page--reports">
      <section className="workspace-nav-board">
        {sectionGroups.map((group) => (
          <div key={group.label} className="workspace-nav-group">
            <div className="workspace-nav-group-title">{group.label}</div>
            <div className="workspace-nav-group-items">
              {group.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`workspace-nav-button ${section === item.key ? 'active' : ''}`}
                  onClick={() => pushSection(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      {error && (
        <div className="workspace-error-banner">
          {error}
        </div>
      )}

      <div className="workspace-content-stage">
        {section === 'reports' && renderReportsSection()}
        {section === 'dashboards' && renderDashboardsSection()}
        {section === 'schedules' && canScheduleReports && renderSchedulesSection()}
        {section === 'history' && renderHistorySection()}
        {section === 'configuration' && canManageReports && renderConfigurationSection()}
      </div>
    </div>
  )

  if (standalone) {
    return (
      <StandaloneModuleShell title="Reports" subtitle="Reports Console" logo="R" loginPath="/reports/login">
        {content}
      </StandaloneModuleShell>
    )
  }

  return (
    <MIMSLayout showStatStrip={false} bodyClassName="mims-ops-page-body" surfaceVariant="workspace" compact>
      {content}
    </MIMSLayout>
  )
}
