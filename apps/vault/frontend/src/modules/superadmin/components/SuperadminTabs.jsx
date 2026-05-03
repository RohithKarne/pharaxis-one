import { Link } from 'react-router-dom'

const TABS = [
  { key: 'dashboard', label: 'Dashboard', path: '/control-tower/dashboard' },
  { key: 'orgs', label: 'Organizations', path: '/control-tower/orgs' },
  { key: 'audit', label: 'Audit', path: '/control-tower/audit' }
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
