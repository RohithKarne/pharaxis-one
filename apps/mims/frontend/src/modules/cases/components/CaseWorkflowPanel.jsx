import { WiredSelect, WiredTextarea } from '../../../shared/components/WiredField'
import { useAuth } from '../../../shared/context/AuthContext'

export default function CaseWorkflowPanel({
  caseType,
  users = [],
  reassignForm,
  setReassignForm,
  reassignSaving,
  reassignCase,
  escalateForm,
  setEscalateForm,
  escalateSaving,
  escalateCase,
  onNavigateToTab,
}) {
  const { hasCapability } = useAuth()

  const workspaceTargets = [
    { key: 'people', label: 'People', hint: 'Reporter, patient, and contact setup' },
    { key: 'communications', label: 'Communications', hint: 'Threads, chat, email, and attachments' },
    { key: 'mi', label: 'MI Workspace', hint: 'Inquiry management and response packaging' },
    { key: 'ae', label: 'AE Workspace', hint: 'Clinical assessment, versions, and PV routing' },
    { key: 'pc', label: 'PC Workspace', hint: 'Complaint investigation and quality routing' },
  ]

  return (
    <div className="cf-workflow-panel">
      <div className="cf-overview-card">
        <div className="cf-overview-kicker">Action Center</div>
        <h3>Case Workspaces</h3>
        <div className="cf-workflow-links">
          {workspaceTargets.map(target => (
            <button
              key={target.key}
              type="button"
              className={`cf-workflow-link${String(caseType || '').toLowerCase() === target.key ? ' recommended' : ''}`}
              onClick={() => onNavigateToTab?.(target.key)}
            >
              <strong>{target.label}</strong>
              <span>{target.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {hasCapability('case.assign') && (
        <div className="cf-overview-card">
          <div className="cf-overview-kicker">Workflow</div>
          <h3>Case Reassignment</h3>
          <div className="cf-reassign-grid">
            <WiredSelect
              label="New Owner"
              section="case_meta"
              field="new_owner_id"
              value={reassignForm.new_owner_id}
              onChange={v => setReassignForm(prev => ({ ...prev, new_owner_id: v }))}
              options={[{ value: '', label: '— Select Owner —' }, ...users.map(u => ({ value: u.id, label: u.name }))]}
            />
            <WiredTextarea
              label="Reason (Optional)"
              section="case_meta"
              field="reassign_reason"
              rows={2}
              value={reassignForm.reason}
              placeholder="Why is this case being reassigned?"
              onChange={v => setReassignForm(prev => ({ ...prev, reason: v }))}
            />
          </div>
          <div className="cf-reassign-actions">
            <button className="cf-save-btn" onClick={reassignCase} disabled={reassignSaving}>
              {reassignSaving ? 'Reassigning…' : 'Reassign Case'}
            </button>
          </div>
        </div>
      )}

      {escalateCase && hasCapability('case.escalate') && (
        <div className="cf-overview-card">
          <div className="cf-overview-kicker">Workflow</div>
          <h3>Case Escalation</h3>
          <div className="cf-reassign-grid">
            <WiredTextarea
              label="Reason"
              section="case_meta"
              field="escalation_reason"
              rows={2}
              value={escalateForm?.reason || ''}
              placeholder="Why is this case being escalated?"
              onChange={v => setEscalateForm(prev => ({ ...prev, reason: v }))}
            />
          </div>
          <div className="cf-reassign-actions">
            <button className="cf-save-btn" onClick={escalateCase} disabled={escalateSaving}>
              {escalateSaving ? 'Escalating…' : 'Escalate Case'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
