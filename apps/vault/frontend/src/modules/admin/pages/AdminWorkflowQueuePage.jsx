import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AdminTabs from '../components/AdminTabs'
import { apiJson, authHeaders, getOrgToken } from '../../common/utils/session'

const DEFAULT_TEMPLATE_STEPS = [
  { task_type: 'review', assignee_role: 'reviewer', due_in_hours: '24' },
  { task_type: 'approval', assignee_role: 'approver', due_in_hours: '24' }
]

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

function cloneDefaultTemplateSteps() {
  return DEFAULT_TEMPLATE_STEPS.map(step => ({ ...step }))
}

function toTemplateForm(template) {
  return {
    id: template.id,
    name: template.name || '',
    description: template.description || '',
    steps: Array.isArray(template.steps) && template.steps.length
      ? template.steps
        .slice()
        .sort((a, b) => Number(a.step_order) - Number(b.step_order))
        .map(step => ({
          task_type: step.task_type || 'review',
          assignee_role: step.assignee_role || 'reviewer',
          due_in_hours: step.due_in_hours ? String(step.due_in_hours) : ''
        }))
      : cloneDefaultTemplateSteps()
  }
}

export default function AdminWorkflowQueuePage() {
  const token = getOrgToken()
  const [statusFilter, setStatusFilter] = useState('pending')
  const [analyticsWindowDays, setAnalyticsWindowDays] = useState('30')
  const [summary, setSummary] = useState({
    total: 0,
    pending_ready: 0,
    pending_waiting: 0,
    completed: 0,
    rejected: 0,
    escalated: 0
  })
  const [insights, setInsights] = useState({
    pending_total: 0,
    overdue_total: 0,
    due_24h_total: 0,
    escalated_pending_total: 0,
    reassigned_30d_total: 0,
    delegated_30d_total: 0,
    avg_completion_hours_30d: null,
    notifications_24h: 0,
    overdue_notifications_24h: 0,
    due_soon_notifications_24h: 0
  })
  const [analytics, setAnalytics] = useState({
    window_days: 30,
    generated_at: null,
    kpis: {
      created_total: 0,
      completed_total: 0,
      open_total: 0,
      overdue_open_total: 0,
      completed_sla_breach_total: 0,
      completion_rate_pct: 0,
      completed_sla_breach_rate_pct: 0,
      median_completion_hours: null,
      p95_completion_hours: null
    },
    delivery: {
      notification_total: 0,
      email_sent_total: 0,
      webhook_sent_total: 0,
      delivery_failed_total: 0
    },
    bottlenecks: [],
    assignee_load: [],
    trend: []
  })
  const [notifications, setNotifications] = useState([])
  const [rows, setRows] = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [testEmail, setTestEmail] = useState('')
  const [sendingTestEmail, setSendingTestEmail] = useState(false)
  const [downloadingAnalytics, setDownloadingAnalytics] = useState(false)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [updatingTemplateStatusId, setUpdatingTemplateStatusId] = useState(null)
  const [templateForm, setTemplateForm] = useState({
    id: null,
    name: '',
    description: '',
    steps: cloneDefaultTemplateSteps()
  })

  async function loadTemplates() {
    const list = await apiJson('/api/workflows/templates', {
      headers: authHeaders(token)
    })
    setTemplates(list)
  }

  async function loadQueue(nextStatus = statusFilter) {
    if (!token) {
      setError('Session not found. Please sign in first.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const query = nextStatus ? `?status=${encodeURIComponent(nextStatus)}` : ''
      const payload = await apiJson(`/api/workflows/admin/queue${query}`, {
        headers: authHeaders(token)
      })
      setSummary(payload.summary || {
        total: 0,
        pending_ready: 0,
        pending_waiting: 0,
        completed: 0,
        rejected: 0,
        escalated: 0
      })
      setRows(payload.results || [])
      const [templateRows, insightPayload, notificationRows, analyticsPayload] = await Promise.all([
        apiJson('/api/workflows/templates', { headers: authHeaders(token) }),
        apiJson('/api/workflows/admin/insights', { headers: authHeaders(token) }),
        apiJson('/api/workflows/admin/notifications?limit=8', { headers: authHeaders(token) }),
        apiJson(`/api/workflows/admin/analytics?window_days=${encodeURIComponent(analyticsWindowDays)}`, { headers: authHeaders(token) })
      ])
      setTemplates(templateRows || [])
      setInsights(insightPayload || insights)
      setNotifications(notificationRows || [])
      setAnalytics(analyticsPayload || analytics)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadQueue(statusFilter)
  }, [statusFilter, analyticsWindowDays])

  function resetTemplateForm() {
    setTemplateForm({
      id: null,
      name: '',
      description: '',
      steps: cloneDefaultTemplateSteps()
    })
  }

  async function saveTemplate(event) {
    event.preventDefault()
    if (!templateForm.name.trim()) {
      setError('Template name is required.')
      return
    }

    const steps = templateForm.steps.map((step, index) => ({
      step_order: index + 1,
      task_type: step.task_type,
      assignee_role: step.assignee_role,
      due_in_hours: step.due_in_hours ? Number(step.due_in_hours) : null,
      require_signature: 1
    }))

    setSavingTemplate(true)
    setError('')
    setSuccess('')
    try {
      if (templateForm.id) {
        await apiJson(`/api/workflows/templates/${templateForm.id}`, {
          method: 'PUT',
          headers: authHeaders(token, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            name: templateForm.name.trim(),
            description: templateForm.description.trim() || null,
            steps
          })
        })
        setSuccess(`Template #${templateForm.id} updated.`)
      } else {
        await apiJson('/api/workflows/templates', {
          method: 'POST',
          headers: authHeaders(token, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            name: templateForm.name.trim(),
            description: templateForm.description.trim() || null,
            steps
          })
        })
        setSuccess('Template created.')
      }
      resetTemplateForm()
      await loadTemplates()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSavingTemplate(false)
    }
  }

  async function toggleTemplateStatus(template, nextActiveState) {
    setError('')
    setSuccess('')
    setUpdatingTemplateStatusId(template.id)
    try {
      await apiJson(`/api/workflows/templates/${template.id}/status`, {
        method: 'PATCH',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ is_active: nextActiveState ? 1 : 0 })
      })
      setSuccess(`Template "${template.name}" is now ${nextActiveState ? 'active' : 'inactive'}.`)
      await loadTemplates()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setUpdatingTemplateStatusId(null)
    }
  }

  async function sendTestEmail(event) {
    event.preventDefault()
    const toEmail = testEmail.trim()
    if (!toEmail) {
      setError('Please provide test recipient email.')
      return
    }

    setSendingTestEmail(true)
    setError('')
    setSuccess('')
    try {
      const payload = await apiJson('/api/admin/workflows/test-email', {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ to_email: toEmail })
      })
      setSuccess(`Workflow test email sent to ${payload.to_email || toEmail}.`)
      setTestEmail('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSendingTestEmail(false)
    }
  }

  async function downloadAnalyticsCsv() {
    setDownloadingAnalytics(true)
    setError('')
    try {
      const response = await fetch(
        `/api/workflows/admin/analytics/export.csv?window_days=${encodeURIComponent(analyticsWindowDays)}`,
        { headers: authHeaders(token) }
      )
      if (!response.ok) {
        const contentType = response.headers.get('content-type') || ''
        if (contentType.includes('application/json')) {
          const payload = await response.json()
          throw new Error(payload.error || 'Failed to export analytics CSV')
        }
        throw new Error('Failed to export analytics CSV')
      }
      const csvBlob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(csvBlob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = `workflow-analytics-${analytics.window_days || analyticsWindowDays}d.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(downloadUrl)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setDownloadingAnalytics(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="brand-block">
          <h1 className="brand-title">Workflow Queue</h1>
          <p className="brand-subtitle">Monitor pending, waiting, completed, escalated, and reassigned workflow tasks</p>
        </div>
        <span className="topbar-pill">Admin Console</span>
      </header>

      <main className="dashboard-grid">
        <section className="panel span-12">
          <AdminTabs active="workflows" />

          <div className="stats-mini-grid">
            <article className="stat-card-mini"><span>Total</span><strong>{summary.total}</strong></article>
            <article className="stat-card-mini"><span>Pending Ready</span><strong>{summary.pending_ready}</strong></article>
            <article className="stat-card-mini"><span>Pending Waiting</span><strong>{summary.pending_waiting}</strong></article>
            <article className="stat-card-mini"><span>Completed</span><strong>{summary.completed}</strong></article>
            <article className="stat-card-mini"><span>Rejected</span><strong>{summary.rejected}</strong></article>
            <article className="stat-card-mini"><span>Escalated</span><strong>{summary.escalated}</strong></article>
          </div>

          <div className="stats-mini-grid">
            <article className="stat-card-mini"><span>Overdue</span><strong>{insights.overdue_total}</strong></article>
            <article className="stat-card-mini"><span>Due in 24h</span><strong>{insights.due_24h_total}</strong></article>
            <article className="stat-card-mini"><span>Delegated (30d)</span><strong>{insights.delegated_30d_total}</strong></article>
            <article className="stat-card-mini"><span>Reassigned (30d)</span><strong>{insights.reassigned_30d_total}</strong></article>
            <article className="stat-card-mini"><span>Notifications (24h)</span><strong>{insights.notifications_24h}</strong></article>
            <article className="stat-card-mini"><span>Avg Complete (h)</span><strong>{insights.avg_completion_hours_30d ?? '-'}</strong></article>
          </div>

          <div className="stats-mini-grid">
            <article className="stat-card-mini"><span>Completion %</span><strong>{analytics.kpis.completion_rate_pct ?? 0}</strong></article>
            <article className="stat-card-mini"><span>SLA Breach %</span><strong>{analytics.kpis.completed_sla_breach_rate_pct ?? 0}</strong></article>
            <article className="stat-card-mini"><span>Median Hours</span><strong>{analytics.kpis.median_completion_hours ?? '-'}</strong></article>
            <article className="stat-card-mini"><span>P95 Hours</span><strong>{analytics.kpis.p95_completion_hours ?? '-'}</strong></article>
            <article className="stat-card-mini"><span>Email Delivered</span><strong>{analytics.delivery.email_sent_total}</strong></article>
            <article className="stat-card-mini"><span>Webhook Delivered</span><strong>{analytics.delivery.webhook_sent_total}</strong></article>
          </div>

          <div className="users-toolbar">
            <div className="users-filter">
              <label htmlFor="workflow-status-filter">Status</label>
              <select
                id="workflow-status-filter"
                value={statusFilter}
                onChange={event => setStatusFilter(event.target.value)}
              >
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="rejected">Rejected</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <form className="users-filter users-inline-form" onSubmit={sendTestEmail}>
              <label htmlFor="workflow-test-email">SMTP Test</label>
              <div className="users-inline-actions">
                <input
                  id="workflow-test-email"
                  type="email"
                  value={testEmail}
                  onChange={event => setTestEmail(event.target.value)}
                  placeholder="recipient@company.com"
                />
                <button className="btn-secondary" type="submit" disabled={sendingTestEmail}>
                  {sendingTestEmail ? 'Sending...' : 'Send Test'}
                </button>
                <Link className="btn-secondary link-button" to="/vault/tasks">Open My Tasks</Link>
              </div>
            </form>
            <div className="users-filter users-inline-form">
              <label htmlFor="analytics-window-days">Analytics</label>
              <div className="users-inline-actions">
                <select
                  id="analytics-window-days"
                  value={analyticsWindowDays}
                  onChange={event => setAnalyticsWindowDays(event.target.value)}
                >
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="60">Last 60 days</option>
                  <option value="90">Last 90 days</option>
                </select>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={downloadAnalyticsCsv}
                  disabled={downloadingAnalytics}
                >
                  {downloadingAnalytics ? 'Exporting...' : 'Export CSV'}
                </button>
              </div>
            </div>
          </div>

          {error ? <div className="auth-error taxonomy-error">{error}</div> : null}
          {success ? <div className="upload-success">{success}</div> : null}
          {loading ? <p className="panel-note">Loading workflow queue...</p> : null}

          {!loading ? (
            <div className="users-table-wrap">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Document</th>
                    <th>Assignee</th>
                    <th>Status</th>
                    <th>Activation</th>
                    <th>Due At</th>
                    <th>Escalation</th>
                    <th>Reassignment</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.id}>
                      <td>
                        <strong>#{row.id}</strong>
                        <div className="panel-note">Step {row.step_order} · {row.task_type}</div>
                      </td>
                      <td>
                        <strong>{row.doc_number}</strong>
                        <div className="panel-note">{row.title}</div>
                      </td>
                      <td>
                        <div>{row.assignee_name || '-'}</div>
                        <div className="panel-note">{row.assignee_role || '-'}</div>
                      </td>
                      <td>{row.status}</td>
                      <td>{row.activation_status || '-'}</td>
                      <td>{formatDateTime(row.due_at)}</td>
                      <td>
                        {row.escalated_at ? (
                          <div>
                            <div>{formatDateTime(row.escalated_at)}</div>
                            <div className="panel-note">Owner: {row.escalation_owner_name || '-'}</div>
                          </div>
                        ) : '-'}
                      </td>
                      <td>
                        {row.reassigned_at || row.delegated_at ? (
                          <div>
                            {row.reassigned_at ? (
                              <div>
                                <div>{formatDateTime(row.reassigned_at)}</div>
                                <div className="panel-note">Reassigned from: {row.reassigned_from_name || '-'}</div>
                              </div>
                            ) : null}
                            {row.delegated_at ? (
                              <div>
                                <div>{formatDateTime(row.delegated_at)}</div>
                                <div className="panel-note">Delegated from: {row.delegated_from_name || '-'}</div>
                              </div>
                            ) : null}
                          </div>
                        ) : '-'}
                      </td>
                      <td>
                        <Link className="btn-secondary link-button" to={`/vault/content/${row.content_id}`}>
                          Open Doc
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {!rows.length ? (
                    <tr>
                      <td colSpan={9} className="users-empty">No workflow tasks found for selected status.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section className="panel span-12">
          <h3>Workflow Bottlenecks (Window: {analytics.window_days}d)</h3>
          <p className="panel-note">Data generated at {formatDateTime(analytics.generated_at)}. Focus on overdue open and long-running steps.</p>
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Step</th>
                  <th>Task Type</th>
                  <th>Total</th>
                  <th>Pending</th>
                  <th>Overdue Open</th>
                  <th>Avg Completion (h)</th>
                  <th>Avg Overdue (h)</th>
                </tr>
              </thead>
              <tbody>
                {analytics.bottlenecks.map(item => (
                  <tr key={`${item.step_order}-${item.task_type}`}>
                    <td>{item.step_order}</td>
                    <td>{item.task_type}</td>
                    <td>{item.total_tasks}</td>
                    <td>{item.pending_total}</td>
                    <td>{item.overdue_open_total}</td>
                    <td>{item.avg_completion_hours ?? '-'}</td>
                    <td>{item.avg_overdue_hours ?? '-'}</td>
                  </tr>
                ))}
                {!analytics.bottlenecks.length ? (
                  <tr>
                    <td colSpan={7} className="users-empty">No bottleneck data in selected analytics window.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel span-12">
          <h3>Assignee Workload & Risk</h3>
          <p className="panel-note">Prioritize users with high overdue-open counts and high completion-hour averages.</p>
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Pending</th>
                  <th>Overdue Open</th>
                  <th>Avg Completion (30d, h)</th>
                </tr>
              </thead>
              <tbody>
                {analytics.assignee_load.map(item => (
                  <tr key={item.user_id}>
                    <td>{item.name}</td>
                    <td>{item.role}</td>
                    <td>{item.pending_total}</td>
                    <td>{item.overdue_open_total}</td>
                    <td>{item.avg_completion_hours_30d ?? '-'}</td>
                  </tr>
                ))}
                {!analytics.assignee_load.length ? (
                  <tr>
                    <td colSpan={5} className="users-empty">No assignee risk data in selected analytics window.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel span-6">
          <h3>{templateForm.id ? `Edit Workflow Template #${templateForm.id}` : 'Create Workflow Template'}</h3>
          <p className="panel-note">Define a reusable multi-step sequence by task type and role assignment.</p>
          <form className="auth-form" onSubmit={saveTemplate}>
            <div className="form-field">
              <label htmlFor="wf-template-name">Template Name</label>
              <input
                id="wf-template-name"
                value={templateForm.name}
                onChange={event => setTemplateForm({ ...templateForm, name: event.target.value })}
                required
              />
            </div>
            <div className="form-field">
              <label htmlFor="wf-template-desc">Description</label>
              <textarea
                id="wf-template-desc"
                rows={2}
                value={templateForm.description}
                onChange={event => setTemplateForm({ ...templateForm, description: event.target.value })}
              />
            </div>

            {templateForm.steps.map((step, index) => (
              <div className="upload-grid" key={`step-${index}`}>
                <div className="form-field">
                  <label>{`Step ${index + 1} Type`}</label>
                  <select
                    value={step.task_type}
                    onChange={event => {
                      const next = [...templateForm.steps]
                      next[index] = { ...next[index], task_type: event.target.value }
                      setTemplateForm({ ...templateForm, steps: next })
                    }}
                  >
                    <option value="review">Review</option>
                    <option value="approval">Approval</option>
                    <option value="signature">Signature</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>{`Step ${index + 1} Role`}</label>
                  <select
                    value={step.assignee_role}
                    onChange={event => {
                      const next = [...templateForm.steps]
                      next[index] = { ...next[index], assignee_role: event.target.value }
                      setTemplateForm({ ...templateForm, steps: next })
                    }}
                  >
                    <option value="admin">Admin</option>
                    <option value="author">Author</option>
                    <option value="reviewer">Reviewer</option>
                    <option value="approver">Approver</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>{`Step ${index + 1} Due (hours)`}</label>
                  <input
                    type="number"
                    min={1}
                    value={step.due_in_hours}
                    onChange={event => {
                      const next = [...templateForm.steps]
                      next[index] = { ...next[index], due_in_hours: event.target.value }
                      setTemplateForm({ ...templateForm, steps: next })
                    }}
                  />
                </div>
              </div>
            ))}

            <div className="detail-actions">
              <button
                className="btn-secondary"
                type="button"
                onClick={() =>
                  setTemplateForm({
                    ...templateForm,
                    steps: [...templateForm.steps, { task_type: 'approval', assignee_role: 'approver', due_in_hours: '24' }]
                  })
                }
              >
                Add Step
              </button>
              <button
                className="btn-secondary"
                type="button"
                disabled={templateForm.steps.length <= 1}
                onClick={() =>
                  setTemplateForm({
                    ...templateForm,
                    steps: templateForm.steps.slice(0, -1)
                  })
                }
              >
                Remove Last Step
              </button>
              {templateForm.id ? (
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => {
                    setError('')
                    setSuccess('')
                    resetTemplateForm()
                  }}
                >
                  Cancel Edit
                </button>
              ) : null}
              <button className="btn-primary" type="submit" disabled={savingTemplate}>
                {savingTemplate ? 'Saving...' : templateForm.id ? 'Update Template' : 'Save Template'}
              </button>
            </div>
          </form>
        </section>

        <section className="panel span-6">
          <h3>Configured Templates</h3>
          <p className="panel-note">Templates available for content-level workflow initiation.</p>
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Steps</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map(template => (
                  <tr key={template.id}>
                    <td>
                      <strong>{template.name}</strong>
                      <div className="panel-note">{template.description || '-'}</div>
                    </td>
                    <td>{template.steps?.length || 0}</td>
                    <td>{Number(template.is_active) ? 'Active' : 'Inactive'}</td>
                    <td>
                      <div className="detail-actions">
                        <button
                          className="btn-secondary"
                          type="button"
                          onClick={() => {
                            setError('')
                            setSuccess('')
                            setTemplateForm(toTemplateForm(template))
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="btn-secondary"
                          type="button"
                          disabled={updatingTemplateStatusId === template.id}
                          onClick={() => toggleTemplateStatus(template, !Number(template.is_active))}
                        >
                          {updatingTemplateStatusId === template.id
                            ? 'Updating...'
                            : Number(template.is_active) ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!templates.length ? (
                  <tr>
                    <td colSpan={4} className="users-empty">No workflow templates configured yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel span-12">
          <h3>Recent Workflow Notifications</h3>
          <p className="panel-note">Automated due-soon and overdue reminders emitted by workflow scheduler.</p>
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Type</th>
                  <th>Task</th>
                  <th>Document</th>
                  <th>Assignee</th>
                  <th>Email</th>
                  <th>Webhook</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {notifications.map(item => (
                  <tr key={item.id}>
                    <td>{formatDateTime(item.created_at)}</td>
                    <td>{item.notification_type}</td>
                    <td>#{item.workflow_task_id}</td>
                    <td>
                      <strong>{item.doc_number || '-'}</strong>
                      <div className="panel-note">{item.title || '-'}</div>
                    </td>
                    <td>{item.assignee_name || '-'}</td>
                    <td>
                      <div>{item.email_delivery_status || '-'}</div>
                      {item.delivered_at ? <div className="panel-note">{formatDateTime(item.delivered_at)}</div> : null}
                    </td>
                    <td>{item.webhook_delivery_status || '-'}</td>
                    <td>
                      <div>{item.message}</div>
                      {item.delivery_error ? <div className="panel-note">{item.delivery_error}</div> : null}
                    </td>
                  </tr>
                ))}
                {!notifications.length ? (
                  <tr>
                    <td colSpan={8} className="users-empty">No workflow reminders emitted yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  )
}
