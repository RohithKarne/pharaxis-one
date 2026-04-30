import { Link } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import FolderTree from '../components/FolderTree'
import { apiJson, authHeaders, getOrgToken, getOrgUser } from '../../common/utils/session'

const CONFIG_STUDIO_GROUPS = [
  {
    title: 'Foundation Setup',
    subtitle: 'Core master data and governance',
    links: [
      { label: 'Users', path: '/admin/users', description: 'Create users and assign roles.' },
      { label: 'Taxonomy', path: '/admin/taxonomy', description: 'Define type, subtype, classification.' },
      { label: 'Lifecycle', path: '/admin/lifecycle', description: 'Configure states and transitions.' },
      { label: 'Retention', path: '/admin/retention', description: 'Set review cycle defaults.' }
    ]
  },
  {
    title: 'Integrations & Security',
    subtitle: 'Enterprise connectivity and access controls',
    links: [
      { label: 'Channels', path: '/admin/channels', description: 'Manage outbound channels.' },
      { label: 'Integrations', path: '/admin/integrations', description: 'Register connectors and test health.' },
      { label: 'Security', path: '/admin/security', description: 'MFA, SSO policy, workflow RBAC matrix.' }
    ]
  },
  {
    title: 'Workflow Governance',
    subtitle: 'Operational oversight and compliance',
    links: [
      { label: 'Workflow Queue', path: '/admin/workflows', description: 'Templates, queue, notifications, analytics.' },
      { label: 'Audit Trail', path: '/admin/audit', description: 'Cross-module immutable audit events.' }
    ]
  }
]

const CREATION_ACTIONS = [
  { label: 'Upload New Document', path: '/vault/upload', type: 'Create' },
  { label: 'Start Workflow', path: '/vault/tasks', type: 'Process' },
  { label: 'Create Content Slot', path: '/vault/slots', type: 'Planning' },
  { label: 'Build Dossier', path: '/vault/dossiers', type: 'Submission' },
  { label: 'Search Existing Content', path: '/vault/search', type: 'Find' },
  { label: 'Expiry Dashboard', path: '/vault/expiry', type: 'Risk' }
]

const WORKSPACE_SETUP_STEPS = [
  { label: 'Step 1', title: 'Create Users', path: '/admin/users', adminOnly: true },
  { label: 'Step 2', title: 'Define Taxonomy', path: '/admin/taxonomy', adminOnly: true },
  { label: 'Step 3', title: 'Configure Lifecycle', path: '/admin/lifecycle', adminOnly: true },
  { label: 'Step 4', title: 'Upload Content', path: '/vault/upload' },
  { label: 'Step 5', title: 'Run Workflow Tasks', path: '/vault/tasks' }
]

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

export default function VaultHomePage() {
  const token = getOrgToken()
  const currentUser = getOrgUser()
  const isAdmin = currentUser?.role === 'admin'

  const [selectedFolder, setSelectedFolder] = useState(null)
  const [contentRows, setContentRows] = useState([])
  const [recentWorkflowRows, setRecentWorkflowRows] = useState([])
  const [workflowStats, setWorkflowStats] = useState({
    pending_ready: 0,
    pending_waiting: 0,
    completed: 0,
    rejected: 0,
    escalated: 0
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function loadContent() {
    const qs = selectedFolder?.id ? `?folder_id=${selectedFolder.id}` : ''
    const payload = await apiJson(`/api/content${qs}`, {
      headers: authHeaders(token)
    })
    return payload
  }

  async function loadWorkflowInsights() {
    if (isAdmin) {
      const payload = await apiJson('/api/workflows/admin/queue?status=pending', {
        headers: authHeaders(token)
      })

      setRecentWorkflowRows((payload.results || []).slice(0, 6))
      setWorkflowStats({
        pending_ready: Number(payload.summary?.pending_ready || 0),
        pending_waiting: Number(payload.summary?.pending_waiting || 0),
        completed: Number(payload.summary?.completed || 0),
        rejected: Number(payload.summary?.rejected || 0),
        escalated: Number(payload.summary?.escalated || 0)
      })
      return
    }

    const [pendingRows, completedRows] = await Promise.all([
      apiJson('/api/workflows/tasks/my?status=pending', { headers: authHeaders(token) }),
      apiJson('/api/workflows/tasks/my?status=completed', { headers: authHeaders(token) })
    ])

    const merged = [...pendingRows, ...completedRows]
      .sort((a, b) => {
        const aDue = a?.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER
        const bDue = b?.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER
        return aDue - bDue
      })

    setRecentWorkflowRows(merged.slice(0, 6))
    setWorkflowStats({
      pending_ready: pendingRows.filter(row => row.activation_status === 'ready').length,
      pending_waiting: pendingRows.filter(row => row.activation_status === 'waiting').length,
      completed: completedRows.length,
      rejected: 0,
      escalated: pendingRows.filter(row => row.escalated_at).length
    })
  }

  async function loadDashboardData() {
    if (!token) {
      setError('Session not found. Please sign in first.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const [contentPayload] = await Promise.all([
        loadContent(),
        loadWorkflowInsights()
      ])
      setContentRows(Array.isArray(contentPayload) ? contentPayload : [])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboardData()
  }, [selectedFolder?.id, token, isAdmin])

  const stats = useMemo(() => {
    const total = contentRows.length
    const inReview = contentRows.filter(row => row.lifecycle_state === 'in_review').length
    const checkedOut = contentRows.filter(row => row.locked_by).length
    const published = contentRows.filter(row => row.lifecycle_state === 'published').length
    const draft = contentRows.filter(row => row.lifecycle_state === 'draft').length
    const approved = contentRows.filter(row => row.lifecycle_state === 'approved').length
    return { total, inReview, checkedOut, published, draft, approved }
  }, [contentRows])

  const lifecycleMix = [
    { label: 'Draft', value: stats.draft },
    { label: 'In Review', value: stats.inReview },
    { label: 'Approved', value: stats.approved },
    { label: 'Published', value: stats.published }
  ]

  const setupSignals = useMemo(() => {
    const taxonomyConfigured = stats.total > 0
    const workflowConfigured = workflowStats.pending_ready + workflowStats.pending_waiting + workflowStats.completed > 0
    return {
      taxonomyConfigured,
      workflowConfigured
    }
  }, [stats.total, workflowStats.pending_ready, workflowStats.pending_waiting, workflowStats.completed])

  const roleIntelligence = useMemo(() => {
    const role = String(currentUser?.role || 'viewer')
    if (role === 'admin') {
      return [
        `Pending ready tasks: ${workflowStats.pending_ready}`,
        `Escalated tasks: ${workflowStats.escalated}`,
        `Total governed documents: ${stats.total}`
      ]
    }
    if (role === 'author') {
      return [
        `Draft documents: ${stats.draft}`,
        `In review documents: ${stats.inReview}`,
        `Pending personal tasks: ${workflowStats.pending_ready + workflowStats.pending_waiting}`
      ]
    }
    if (role === 'reviewer' || role === 'approver') {
      return [
        `Ready tasks for action: ${workflowStats.pending_ready}`,
        `Waiting tasks in chain: ${workflowStats.pending_waiting}`,
        `Escalated queue signals: ${workflowStats.escalated}`
      ]
    }
    return [
      `Published documents: ${stats.published}`,
      `Completed tasks: ${workflowStats.completed}`,
      `Checked out records: ${stats.checkedOut}`
    ]
  }, [
    currentUser?.role,
    stats.total,
    stats.draft,
    stats.inReview,
    stats.published,
    stats.checkedOut,
    workflowStats.pending_ready,
    workflowStats.pending_waiting,
    workflowStats.completed,
    workflowStats.escalated
  ])

  return (
    <div className="app-shell">
      <main className="dashboard-grid">
        <section className="panel span-12 workspace-hero-card">
          <div>
            <p className="workspace-hero-kicker">Workspace / Vault</p>
            <h2 className="workspace-hero-title">Vault Command Center</h2>
            <p className="panel-note">
              Create content, run approvals, and complete lifecycle operations from one workspace.
            </p>
          </div>
          <div className="workspace-hero-right">
            <span className="workspace-status-pill">Lifecycle Active</span>
            <span className="workspace-hero-date">{new Date().toLocaleDateString()}</span>
          </div>
        </section>

        <section className="panel span-4">
          <h3>Create Workspace Items</h3>
          <p className="panel-note">Use this guided entry point if you are starting fresh.</p>
          <ul className="simple-list action-center-list">
            {CREATION_ACTIONS.map(item => (
              <li key={item.path}>
                <div className="config-link-copy">
                  <strong>{item.label}</strong>
                  <span>{item.type}</span>
                </div>
                <Link to={item.path}>Open</Link>
              </li>
            ))}
            {isAdmin ? (
              <li>
                <div className="config-link-copy">
                  <strong>Configuration Studio</strong>
                  <span>Admin setup</span>
                </div>
                <Link to="/admin">Open</Link>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="panel span-8">
          <h3>Guided Vault Setup</h3>
          <p className="panel-note">Follow this sequence to avoid configuration conflicts.</p>
          <div className="setup-sequence-list">
            {WORKSPACE_SETUP_STEPS
              .filter(step => isAdmin || !step.adminOnly)
              .map(step => (
                <Link className="setup-sequence-item" key={step.title} to={step.path}>
                  <span className="setup-sequence-step">{step.label}</span>
                  <span>{step.title}</span>
                </Link>
              ))}
          </div>
        </section>

        <section className="panel span-12">
          <h3>Role Intelligence</h3>
          <p className="panel-note">Role-based live signals to prioritize your next actions.</p>
          <ul className="simple-list">
            {roleIntelligence.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        {isAdmin ? (
          <section className="panel span-12 config-studio-panel">
            <div className="config-studio-head">
              <div>
                <h3>Configuration Studio</h3>
                <p className="panel-note">
                  This is where you create and configure the full Vault system. Use these modules first, then start content operations.
                </p>
              </div>
              <div className="config-studio-status">
                <span className={setupSignals.taxonomyConfigured ? 'status-chip success' : 'status-chip pending'}>
                  Taxonomy {setupSignals.taxonomyConfigured ? 'Ready' : 'Pending'}
                </span>
                <span className={setupSignals.workflowConfigured ? 'status-chip success' : 'status-chip pending'}>
                  Workflow {setupSignals.workflowConfigured ? 'Ready' : 'Pending'}
                </span>
              </div>
            </div>

            <div className="config-groups-grid">
              {CONFIG_STUDIO_GROUPS.map(group => (
                <article className="config-group-card" key={group.title}>
                  <h4>{group.title}</h4>
                  <p className="panel-note">{group.subtitle}</p>
                  <ul className="simple-list config-link-list">
                    {group.links.map(link => (
                      <li key={link.path}>
                        <div className="config-link-copy">
                          <strong>{link.label}</strong>
                          <span>{link.description}</span>
                        </div>
                        <Link className="btn-secondary link-button" to={link.path}>Open</Link>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        ) : (
          <section className="panel span-12">
            <h3>Configuration Access</h3>
            <p className="panel-note">
              This workspace is configuration-driven. Ask your admin to complete Taxonomy, Lifecycle, Security, and Workflow policy setup first.
            </p>
          </section>
        )}

        <section className="stat-card">
          <div className="stat-label">Total Documents</div>
          <h2 className="stat-value">{stats.total}</h2>
        </section>
        <section className="stat-card">
          <div className="stat-label">Pending Ready Tasks</div>
          <h2 className="stat-value">{workflowStats.pending_ready}</h2>
        </section>
        <section className="stat-card">
          <div className="stat-label">Escalated Tasks</div>
          <h2 className="stat-value">{workflowStats.escalated}</h2>
        </section>
        <section className="stat-card">
          <div className="stat-label">Checked Out</div>
          <h2 className="stat-value">{stats.checkedOut}</h2>
        </section>

        <section className="panel span-8">
          <h3>Operational Queue</h3>
          <p className="panel-note">
            {isAdmin
              ? 'Admin view: full workflow queue across the organization.'
              : 'Personal view: your tasks ranked by due timeline.'}
          </p>
          {error ? <div className="auth-error taxonomy-error">{error}</div> : null}
          {loading ? <p className="panel-note">Loading operational queue...</p> : null}

          {!loading ? (
            <div className="users-table-wrap">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Document</th>
                    <th>Status</th>
                    <th>Activation</th>
                    <th>Due At</th>
                    <th>Escalation</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recentWorkflowRows.map(row => (
                    <tr key={row.id}>
                      <td>
                        <strong>#{row.id}</strong>
                        <div className="panel-note">Step {row.step_order} · {row.task_type}</div>
                      </td>
                      <td>
                        <strong>{row.doc_number || '-'}</strong>
                        <div className="panel-note">{row.title || '-'}</div>
                      </td>
                      <td>{row.status}</td>
                      <td>{row.activation_status || '-'}</td>
                      <td>{formatDateTime(row.due_at)}</td>
                      <td>
                        {row.escalated_at
                          ? `${formatDateTime(row.escalated_at)}`
                          : '-'}
                      </td>
                      <td>
                        <Link className="btn-secondary link-button" to="/vault/tasks">
                          Open Tasks
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {!recentWorkflowRows.length ? (
                    <tr>
                      <td colSpan={7} className="users-empty">No workflow records available.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section className="panel span-4">
          <h3>Workflow Pulse</h3>
          <ul className="simple-list detail-list">
            <li><span>Pending Ready</span><strong>{workflowStats.pending_ready}</strong></li>
            <li><span>Pending Waiting</span><strong>{workflowStats.pending_waiting}</strong></li>
            <li><span>Completed</span><strong>{workflowStats.completed}</strong></li>
            <li><span>Rejected</span><strong>{workflowStats.rejected}</strong></li>
            <li><span>Escalated</span><strong>{workflowStats.escalated}</strong></li>
          </ul>
          <div className="detail-actions">
            <Link className="btn-secondary link-button" to="/vault/tasks">My Tasks</Link>
            {isAdmin ? <Link className="btn-secondary link-button" to="/admin/workflows">Admin Queue</Link> : null}
          </div>
        </section>

        <section className="panel span-8">
          <h3>Vault Content List</h3>
          <p className="panel-note">Current documents in your organization (filtered by selected folder if any).</p>

          {loading ? <p className="panel-note">Loading content...</p> : null}

          {!loading ? (
            <div className="users-table-wrap">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Doc Number</th>
                    <th>Title</th>
                    <th>State</th>
                    <th>Version</th>
                    <th>Checked Out</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {contentRows.map(row => (
                    <tr key={row.id}>
                      <td>{row.doc_number}</td>
                      <td>{row.title}</td>
                      <td>{row.lifecycle_state}</td>
                      <td>{row.version_number || '-'}</td>
                      <td>{row.locked_by_name || '-'}</td>
                      <td>
                        <Link className="btn-secondary link-button" to={`/vault/content/${row.id}`}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {!contentRows.length ? (
                    <tr>
                      <td colSpan={6} className="users-empty">No content found.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section className="panel span-4">
          <h3>Lifecycle Mix</h3>
          <ul className="simple-list detail-list">
            {lifecycleMix.map(item => (
              <li key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </li>
            ))}
          </ul>
          <p className="panel-note">User: {currentUser?.name || '-'} ({currentUser?.role || '-'})</p>
        </section>

        <section className="span-8">
          <FolderTree
            selectedFolderId={selectedFolder?.id || null}
            onSelectFolder={folder => setSelectedFolder(folder)}
          />
        </section>

        <section className="panel span-4">
          <h3>Selected Folder</h3>
          <p className="panel-note">
            {selectedFolder
              ? `Current filter: ${selectedFolder.name}`
              : 'Pick a folder from the tree to apply content filters.'}
          </p>
          {selectedFolder ? (
            <ul className="simple-list">
              <li><span>Folder ID</span><strong>{selectedFolder.id}</strong></li>
              <li><span>Path</span><strong>{selectedFolder.path}</strong></li>
            </ul>
          ) : null}
        </section>
      </main>
    </div>
  )
}
