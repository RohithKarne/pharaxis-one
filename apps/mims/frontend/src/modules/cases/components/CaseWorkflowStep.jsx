import { lazy, Suspense } from 'react'
import DynamicFieldsSection from './DynamicFieldsSection'
import { WiredField, WiredSelect, WiredTextarea, useCaseFieldContext } from '../../../shared/components/WiredField'
import { useAuth } from '../../../shared/context/AuthContext'
import useCoreFields from '../hooks/useCoreFields'

const CaseCommunicationsWorkspace = lazy(() => import('./CaseCommunicationsWorkspace'))

// Final wizard step. Holds the fields a user actually edits about how the case
// is being worked — status, ownership, priority, dates — plus the reassign and
// escalate actions, plus the communications workspace.
//
// Deliberately NOT here (locked with Rohith 2026-07-28):
//   - Intake Channel        → system-set, shown in the header strip only
//   - Learn of Validity Date → case validity moved to the safety system
//   - Follow-up Received Date → a case has many follow-ups; one field cannot
//                               hold them, it belongs on the follow-up record

function normalizePicklistValue(options, currentValue) {
  if (!currentValue || !Array.isArray(options) || options.length === 0) return currentValue
  const current = String(currentValue).trim().toLowerCase().replace(/[\s_]+/g, '')
  const match = options.find(option => String(option.value).trim().toLowerCase().replace(/[\s_]+/g, '') === current)
  return match?.value ?? currentValue
}

export default function CaseWorkflowStep({
  id, headers, token, currentUserId, setSavedMsg,
  infoForm, setInfoForm, statuses, users,
  getPicklistOptions, scheduleAutoSave,
  reassignForm, setReassignForm, reassignSaving, reassignCase,
  escalateForm, setEscalateForm, escalateSaving, escalateCase,
  dynFieldValues, setDynFieldValues, dynFieldSaving, dynFieldErrors = {},
  formConfig, saveDynFields,
  caseType,
  routePane = '',
  onCommentCount, onCorrespondenceCount,
}) {
  const ctx = useCaseFieldContext()
  const { hasCapability } = useAuth()
  const priorityOptions = getPicklistOptions?.('Case Information', 'Priority') || []
  const resolvedPriority = normalizePicklistValue(priorityOptions, infoForm.priority)

  // Label / required / visibility for the platform fields comes from the
  // backend (field_setup → formConfig.core), not from these components.
  const coreField = useCoreFields(formConfig)
  const fStatus = coreField('status_id', 'Status')
  const fOwner = coreField('case_owner_id', 'Case Owner')
  const fPriority = coreField('priority', 'Priority')
  const fReceived = coreField('date_received', 'Date Received')
  const fAwareness = coreField('awareness_date', 'Awareness Date')
  const fNotes = coreField('internal_notes', 'Internal Notes')

  return (
    <div id="tab-workflow" className="cf-tab-pane">
      <div className="cf-form-grid">
        {!fStatus.hidden && (
        <WiredSelect label={fStatus.label} section="case_meta" field="status_id"
          value={infoForm.status_id}
          onChange={v => { setInfoForm(p => ({ ...p, status_id: v })); scheduleAutoSave() }}
          options={[{ value: '', label: '— No Status —' }, ...statuses.map(s => ({ value: s.id, label: s.name }))]} />
        )}
        {!fOwner.hidden && (
        <WiredSelect label={fOwner.label} section="case_meta" field="case_owner_id"
          value={infoForm.case_owner_id}
          onChange={v => { setInfoForm(p => ({ ...p, case_owner_id: v })); scheduleAutoSave() }}
          options={[{ value: '', label: '— Unassigned —' }, ...users.map(u => ({ value: u.id, label: u.name }))]} />
        )}
        {!fPriority.hidden && (
        <WiredSelect label={fPriority.label} section="case_meta" field="priority"
          value={resolvedPriority}
          onChange={v => { setInfoForm(p => ({ ...p, priority: v })); scheduleAutoSave() }}
          options={priorityOptions.length
            ? [{ value: '', label: '— Select —' }, ...priorityOptions.map(option => ({ value: option.value, label: option.label || option.value }))]
            : [
              { value: 'normal', label: 'Normal' },
              { value: 'high',   label: 'High' },
              { value: 'urgent', label: 'Urgent' },
            ]} />
        )}
        {/* Defaults to today on creation, but must stay correctable: a paper form
            or phone message can be logged days after it arrived, and for AE/PC
            this date is the clock start transmitted to the safety system. */}
        {!fReceived.hidden && (
        <WiredField label={fReceived.label} section="case_meta" field="date_received" type="date"
          value={infoForm.date_received}
          onChange={v => { setInfoForm(p => ({ ...p, date_received: v })); scheduleAutoSave() }} />
        )}
        {caseType !== 'MI' && !fAwareness.hidden && (
          <WiredField label={fAwareness.label} section="case_meta" field="awareness_date" type="date"
            value={infoForm.awareness_date}
            onChange={v => { setInfoForm(p => ({ ...p, awareness_date: v })); scheduleAutoSave() }} />
        )}
      </div>

      {!fNotes.hidden && (
      <WiredTextarea label={fNotes.label} section="case_meta" field="internal_notes" rows={3}
        value={infoForm.internal_notes}
        placeholder="Internal notes (not visible externally)…"
        onChange={v => { setInfoForm(p => ({ ...p, internal_notes: v })); scheduleAutoSave() }} />
      )}

      {hasCapability('case.assign') && (
        <div className="cf-reassign-panel">
          <div className="cf-reassign-title">Case Reassignment</div>
          <div className="cf-reassign-grid">
            <WiredSelect label="New Owner" section="case_meta" field="new_owner_id"
              value={reassignForm.new_owner_id}
              onChange={v => setReassignForm(prev => ({ ...prev, new_owner_id: v }))}
              options={[{ value: '', label: '— Select Owner —' }, ...users.map(u => ({ value: u.id, label: u.name }))]} />
            <WiredTextarea label="Reason (Optional)" section="case_meta" field="reassign_reason" rows={2}
              value={reassignForm.reason}
              placeholder="Why is this case being reassigned?"
              onChange={v => setReassignForm(prev => ({ ...prev, reason: v }))} />
          </div>
          <div className="cf-reassign-actions">
            <button className="cf-save-btn" onClick={reassignCase} disabled={reassignSaving}>
              {reassignSaving ? 'Reassigning…' : 'Reassign Case'}
            </button>
          </div>
        </div>
      )}

      {escalateCase && hasCapability('case.escalate') && (
        <div className="cf-reassign-panel">
          <div className="cf-reassign-title">Case Escalation</div>
          <div className="cf-reassign-grid">
            <WiredTextarea label="Reason" section="case_meta" field="escalation_reason" rows={2}
              value={escalateForm?.reason || ''}
              placeholder="Why is this case being escalated?"
              onChange={v => setEscalateForm(prev => ({ ...prev, reason: v }))} />
          </div>
          <div className="cf-reassign-actions">
            <button className="cf-save-btn" onClick={escalateCase} disabled={escalateSaving}>
              {escalateSaving ? 'Escalating…' : 'Escalate Case'}
            </button>
          </div>
        </div>
      )}

      {formConfig && Array.isArray(formConfig.sections) &&
        formConfig.sections.some(s => Array.isArray(s.fields) && s.fields.length > 0) && (
        <DynamicFieldsSection
          sections={formConfig.sections}
          values={dynFieldValues}
          onChange={updater => { setDynFieldValues(updater); scheduleAutoSave() }}
          onSave={saveDynFields}
          saving={dynFieldSaving}
          rules={formConfig.rules || []}
          errors={dynFieldErrors}
          caseId={ctx?.caseId}
          caseStatus={ctx?.caseStatus}
          caseSection="case_meta"
          presence={ctx?.presence}
          currentUserId={ctx?.currentUserId}
          caseType={caseType}
          displayTab="info"
        />
      )}

      <div className="cf-workflow-communications">
        <Suspense fallback={<div className="cf-tab-loading">Loading communications…</div>}>
          <CaseCommunicationsWorkspace
            id={id}
            headers={headers}
            token={token}
            currentUserId={currentUserId}
            setSavedMsg={setSavedMsg}
            routePane={routePane}
            onCommentCount={onCommentCount}
            onCorrespondenceCount={onCorrespondenceCount}
          />
        </Suspense>
      </div>
    </div>
  )
}
