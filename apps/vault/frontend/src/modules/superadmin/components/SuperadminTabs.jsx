import { Link } from 'react-router-dom'

const TABS = [
  { key: 'dashboard', label: 'Dashboard', path: '/superadmin/dashboard' },
  { key: 'orgs', label: 'Organizations', path: '/superadmin/orgs' }
]

export default function SuperadminTabs({ active }) {
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
