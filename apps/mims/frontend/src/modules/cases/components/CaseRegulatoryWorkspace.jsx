import { useState } from 'react'
import CaseICSRTab from './CaseICSRTab'
import CaseDPPRTab from './CaseDPPRTab'
import ComplianceAuditPanel from '../../../shared/components/compliance/ComplianceAuditPanel'

const PANES = [
  { key: 'icsr', label: 'ICSR Reporting' },
  { key: 'privacy', label: 'Privacy Controls' },
  { key: 'audit', label: 'Audit Trail' },
]

export default function CaseRegulatoryWorkspace({ id, headers, setSavedMsg, routePane = '' }) {
  const [activePane, setActivePane] = useState(routePane || 'icsr')

  return (
    <div className="cf-workspace-shell">
      <div className="cf-workspace-header">
        <div>
          <div className="cf-overview-kicker">Regulatory And Compliance</div>
          <h3>Case Control Workspace</h3>
          <p>Reporting, privacy overrides, and case-level audit review live together here instead of on the top nav.</p>
        </div>
      </div>

      <div className="cf-workspace-tabs">
        {PANES.map(pane => (
          <button
            key={pane.key}
            type="button"
            className={`cf-workspace-tab${activePane === pane.key ? ' active' : ''}`}
            onClick={() => setActivePane(pane.key)}
          >
            {pane.label}
          </button>
        ))}
      </div>

      <div className="cf-workspace-body">
        {activePane === 'icsr' && <CaseICSRTab id={id} headers={headers} setSavedMsg={setSavedMsg} />}
        {activePane === 'privacy' && <CaseDPPRTab id={id} headers={headers} />}
        {activePane === 'audit' && <ComplianceAuditPanel caseId={id} />}
      </div>
    </div>
  )
}
