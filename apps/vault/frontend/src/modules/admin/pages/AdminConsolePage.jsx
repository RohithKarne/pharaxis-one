import { Link } from 'react-router-dom'
import AdminTabs from '../components/AdminTabs'

const CARDS = [
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
    title: 'Audit Trail',
    description: 'Review immutable activity logs across your organization.',
    path: '/admin/audit'
  }
]

export default function AdminConsolePage() {
  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="brand-block">
          <h1 className="brand-title">Admin Console</h1>
          <p className="brand-subtitle">Configuration and governance center for your organization</p>
        </div>
        <span className="topbar-pill">Role: Admin</span>
      </header>

      <main className="dashboard-grid">
        <section className="panel span-12">
          <AdminTabs active="" />
          <div className="admin-card-grid">
            {CARDS.map(card => (
              <article className="admin-card" key={card.path}>
                <h3>{card.title}</h3>
                <p className="panel-note">{card.description}</p>
                <Link className="btn-secondary link-button" to={card.path}>
                  Open
                </Link>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
