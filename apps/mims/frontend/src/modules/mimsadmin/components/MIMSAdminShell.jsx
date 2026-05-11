import { useState } from 'react'
import ServiceLog       from './tabs/ServiceLog'
import SystemActivity   from './tabs/SystemActivity'
import ServiceDashboard from './tabs/ServiceDashboard'
import Configuration    from './tabs/Configuration'
import Escalation       from './tabs/Escalation'
import Documents        from './tabs/Documents'
import Tables           from './tabs/Tables'
import System           from './tabs/System'
import Help             from './tabs/Help'

const TABS = [
  { key: 'service-log',       label: 'Service Log',       component: ServiceLog },
  { key: 'system-activity',   label: 'System Activity',   component: SystemActivity },
  { key: 'service-dashboard', label: 'Service Dashboard', component: ServiceDashboard },
  { key: 'configuration',     label: 'Configuration',     component: Configuration },
  { key: 'escalation',        label: 'Escalation',        component: Escalation },
  { key: 'documents',         label: 'Documents',         component: Documents },
  { key: 'tables',            label: 'Tables',            component: Tables },
  { key: 'system',            label: 'System',            component: System },
  { key: 'help',              label: 'Help',              component: Help },
]

export default function MIMSAdminShell() {
  const [activeTab, setActiveTab] = useState('service-log')
  const ActiveComponent = TABS.find(t => t.key === activeTab)?.component || ServiceLog

  return (
    <div className="mims-admin-shell">
      <div className="mims-admin-topnav">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`mims-admin-tab${activeTab === t.key ? ' active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mims-admin-tab-content">
        <ActiveComponent />
      </div>
    </div>
  )
}
