import { Link } from 'react-router-dom'

const TABS = [
  { key: 'wizard', label: 'Setup Wizard', path: '/admin/wizard' },
  { key: 'users', label: 'Users', path: '/admin/users' },
  { key: 'taxonomy', label: 'Taxonomy', path: '/admin/taxonomy' },
  { key: 'lifecycle', label: 'Lifecycle Rules', path: '/admin/lifecycle' },
  { key: 'retention', label: 'Retention', path: '/admin/retention' },
  { key: 'channels', label: 'Content Channels', path: '/admin/channels' },
  { key: 'integrations', label: 'Integrations', path: '/admin/integrations' },
  { key: 'security', label: 'Security', path: '/admin/security' },
  { key: 'workflows', label: 'Workflow Queue', path: '/admin/workflows' },
  { key: 'audit', label: 'Audit Trail', path: '/admin/audit' }
]

export default function AdminTabs({ active }) {
  return (
    <nav className="admin-tab-nav">
      {TABS.map(tab => (
        <Link
          key={tab.key}
          className={active === tab.key ? 'admin-tab active' : 'admin-tab'}
          to={tab.path}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
