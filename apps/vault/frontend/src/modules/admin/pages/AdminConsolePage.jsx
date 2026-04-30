import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AdminTabs from '../components/AdminTabs'

const CARDS = [
  {
    title: 'Setup Wizard',
    description: 'Guided, step-by-step system setup with completion tracking.',
    path: '/admin/wizard'
  },
  {
    title: 'Users',
    description: 'Invite, activate/deactivate, and role-manage organization users.',
    path: '/admin/users'
  },
  {
    title: 'Taxonomy',
    description: 'Control content type, subtype, and classification hierarchies.',
    path: '/admin/taxonomy'
  },
  {
    title: 'Lifecycle Rules',
    description: 'Configure lifecycle states and role-based transitions.',
    path: '/admin/lifecycle'
  },
  {
    title: 'Retention Policies',
    description: 'Set review-cycle defaults for each content type.',
    path: '/admin/retention'
  },
  {
    title: 'Content Channels',
    description: 'Manage outbound integration channels and API keys.',
    path: '/admin/channels'
  },
  {
    title: 'Integrations',
    description: 'Configure external connector endpoints and health checks.',
    path: '/admin/integrations'
  },
  {
    title: 'Security',
    description: 'Manage SSO, MFA, session controls, and workflow RBAC policy.',
    path: '/admin/security'
  },
  {
    title: 'Workflow Queue',
    description: 'Track pending, waiting, completed, and escalated workflow tasks.',
    path: '/admin/workflows'
  },
  {
    title: 'Audit Trail',
    description: 'Review immutable activity logs across your organization.',
    path: '/admin/audit'
  }
]

const SETUP_FLOW = [
  {
    step: 'Step 1',
    module: 'Users',
    why: 'Create all roles first so assignments and approvals work.',
    path: '/admin/users'
  },
  {
    step: 'Step 2',
    module: 'Taxonomy',
    why: 'Define content structure before uploading.',
    path: '/admin/taxonomy'
  },
  {
    step: 'Step 3',
    module: 'Lifecycle Rules',
    why: 'Set state transitions and allowed roles.',
    path: '/admin/lifecycle'
  },
  {
    step: 'Step 4',
    module: 'Security',
    why: 'Set MFA/SSO and workflow RBAC permissions.',
    path: '/admin/security'
  },
  {
    step: 'Step 5',
    module: 'Integrations',
    why: 'Register external endpoints and run health tests.',
    path: '/admin/integrations'
  },
  {
    step: 'Step 6',
    module: 'Workflow Queue',
    why: 'Create templates and monitor execution/analytics.',
    path: '/admin/workflows'
  }
]

export default function AdminConsolePage() {
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()
  const visibleCards = useMemo(
    () =>
      normalizedQuery
        ? CARDS.filter(card =>
          `${card.title} ${card.description}`.toLowerCase().includes(normalizedQuery))
        : CARDS,
    [normalizedQuery]
  )

  return (
    <div className="app-shell">
      <main className="dashboard-grid">
        <section className="panel span-12 workspace-hero-card">
          <div>
            <p className="workspace-hero-kicker">Platform / Admin</p>
            <h2 className="workspace-hero-title">Vault Configuration Studio</h2>
            <p className="panel-note">
              Configure users, taxonomy, lifecycle, security, integrations, and workflow governance.
            </p>
          </div>
          <div className="workspace-hero-right">
            <span className="workspace-status-pill">Admin Active</span>
            <span className="workspace-hero-date">{new Date().toLocaleDateString()}</span>
          </div>
        </section>

        <section className="panel span-12">
          <div className="config-filter-head">
            <div>
              <h3>Module Workspace</h3>
              <p className="panel-note">Search and open the exact module you want to configure.</p>
            </div>
            <input
              className="workspace-module-search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Filter modules in this tab"
            />
          </div>
          <div className="admin-card-grid">
            {visibleCards.map(card => (
              <article className="admin-card" key={card.path}>
                <h3>{card.title}</h3>
                <p className="panel-note">{card.description}</p>
                <Link className="btn-secondary link-button" to={card.path}>
                  Open
                </Link>
              </article>
            ))}
            {!visibleCards.length ? (
              <div className="users-empty">No modules match this filter.</div>
            ) : null}
          </div>
        </section>

        <section className="panel span-12">
          <div className="config-studio-head">
            <div>
              <h3>Quick Setup Flow</h3>
              <p className="panel-note">Configuration is sequenced. Complete each step in order.</p>
            </div>
            <span className="status-chip info">6 Steps</span>
          </div>
          <div className="setup-flow-grid">
            {SETUP_FLOW.map(item => (
              <article className="setup-flow-card" key={item.path}>
                <span className="setup-flow-step">{item.step}</span>
                <h4>{item.module}</h4>
                <p className="panel-note">{item.why}</p>
                <Link className="btn-primary link-button" to={item.path}>Open {item.module}</Link>
              </article>
            ))}
          </div>
        </section>

        <section className="panel span-12">
          <AdminTabs active="" />
          <ul className="simple-list">
            <li>
              <span>Configuration Support</span>
              <strong>{'Users -> Taxonomy -> Lifecycle -> Security -> Integrations -> Workflows'}</strong>
            </li>
          </ul>
        </section>
      </main>
    </div>
  )
}
