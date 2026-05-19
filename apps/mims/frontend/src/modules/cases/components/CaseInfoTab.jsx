import DynamicFieldsSection from './DynamicFieldsSection'
import { WiredField, WiredSelect, WiredTextarea, useCaseFieldContext } from '../../../shared/components/WiredField'

export default function CaseInfoTab({
  infoForm, setInfoForm, statuses, users,
  reassignForm, setReassignForm, reassignSaving,
  dynFieldValues, setDynFieldValues, dynFieldSaving,
  dynFieldErrors = {},
  formConfig, scheduleAutoSave, reassignCase, saveDynFields,
  caseType,            // 'AE' | 'MI' | 'PC' from caseData.case_type
}) {
  const ctx = useCaseFieldContext()  // provided by CaseFormShell; null when standalone
  return (
    <div id="tab-info" className="cf-tab-pane">
      <div className="cf-form-grid">
        <WiredSelect label="Status" section="case_meta" field="status_id"
          value={infoForm.status_id}
          onChange={v => { setInfoForm(p => ({ ...p, status_id: v })); scheduleAutoSave() }}
          options={[{ value: '', label: '— No Status —' }, ...statuses.map(s => ({ value: s.id, label: s.name }))]} />
        <WiredSelect label="Case Owner" section="case_meta" field="case_owner_id"
          value={infoForm.case_owner_id}
          onChange={v => { setInfoForm(p => ({ ...p, case_owner_id: v })); scheduleAutoSave() }}
          options={[{ value: '', label: '— Unassigned —' }, ...users.map(u => ({ value: u.id, label: u.name }))]} />
        <WiredSelect label="Priority" section="case_meta" field="priority"
          value={infoForm.priority}
          onChange={v => { setInfoForm(p => ({ ...p, priority: v })); scheduleAutoSave() }}
          options={[
            { value: 'normal', label: 'Normal' },
            { value: 'high',   label: 'High' },
            { value: 'urgent', label: 'Urgent' },
          ]} />
        <WiredSelect label="Intake Channel" section="case_meta" field="intake_channel"
          value={infoForm.intake_channel}
          onChange={v => { setInfoForm(p => ({ ...p, intake_channel: v })); scheduleAutoSave() }}
          options={[
            { value: 'manual',   label: 'Manual' },
            { value: 'email',    label: 'Email' },
            { value: 'web_form', label: 'Web Form' },
          ]} />
        <WiredField label="Date Received" section="case_meta" field="date_received" type="date"
          value={infoForm.date_received}
          onChange={v => { setInfoForm(p => ({ ...p, date_received: v })); scheduleAutoSave() }} />
      </div>

      <div className="cf-regulatory-dates">
        <h3>Regulatory Dates</h3>
        <div className="cf-form-grid">
          <WiredField label="Awareness Date" section="case_meta" field="awareness_date" type="date"
            value={infoForm.awareness_date}
            onChange={v => { setInfoForm(p => ({ ...p, awareness_date: v })); scheduleAutoSave() }} />
          <WiredField label="Learn of Validity Date" section="case_meta" field="learn_of_validity_date" type="date"
            value={infoForm.learn_of_validity_date}
            onChange={v => { setInfoForm(p => ({ ...p, learn_of_validity_date: v })); scheduleAutoSave() }} />
          <WiredField label="Follow-up Received Date" section="case_meta" field="follow_up_received_date" type="date"
            value={infoForm.follow_up_received_date}
            onChange={v => { setInfoForm(p => ({ ...p, follow_up_received_date: v })); scheduleAutoSave() }} />
        </div>
      </div>

      <WiredTextarea label="Description" section="case_meta" field="description" rows={4}
        value={infoForm.description}
        placeholder="Case description…"
        onChange={v => { setInfoForm(p => ({ ...p, description: v })); scheduleAutoSave() }} />

      <WiredTextarea label="Internal Notes" section="case_meta" field="internal_notes" rows={3}
        value={infoForm.internal_notes}
        placeholder="Internal notes (not visible externally)…"
        onChange={v => { setInfoForm(p => ({ ...p, internal_notes: v })); scheduleAutoSave() }} />

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

      {formConfig && Array.isArray(formConfig.sections) &&
        formConfig.sections.some(s => Array.isArray(s.fields) && s.fields.length > 0) && (
        <DynamicFieldsSection
          sections={formConfig.sections}
          values={dynFieldValues}
          onChange={updater => {
            setDynFieldValues(updater)
            scheduleAutoSave()
          }}
          onSave={saveDynFields}
          saving={dynFieldSaving}
          rules={formConfig.rules || []}
          errors={dynFieldErrors}
          caseId={ctx?.caseId}
          caseStatus={ctx?.caseStatus}
          caseSection="case_meta"
          presence={ctx?.presence}
          currentUserId={ctx?.currentUserId}
          caseType={caseType}      // B1 — only shared/<type> fields
          displayTab="info"        // B1 — only fields tagged for the info tab
        />
      )}
    </div>
  )
}
