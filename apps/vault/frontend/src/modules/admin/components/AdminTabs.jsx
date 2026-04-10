import { Link } from 'react-router-dom'

const TABS = [
  { key: 'users', label: 'Users', path: '/admin/users' },
  { key: 'taxonomy', label: 'Taxonomy', path: '/admin/taxonomy' },
  { key: 'lifecycle', label: 'Lifecycle Rules', path: '/admin/lifecycle' },
  { key: 'retention', label: 'Retention', path: '/admin/retention' },
  { key: 'channels', label: 'Content Channels', path: '/admin/channels' },
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
