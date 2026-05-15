import DynamicFieldsSection from './DynamicFieldsSection'

export default function CaseInfoTab({
  infoForm, setInfoForm, statuses, users,
  reassignForm, setReassignForm, reassignSaving,
  dynFieldValues, setDynFieldValues, dynFieldSaving,
  dynFieldErrors = {},
  formConfig, scheduleAutoSave, reassignCase, saveDynFields,
}) {
  return (
    <div className="cf-tab-pane">
      <div className="cf-form-grid">
        <div className="cf-form-field">
          <label>Status</label>
          <select value={infoForm.status_id} onChange={e => { setInfoForm(p => ({ ...p, status_id: e.target.value })); scheduleAutoSave() }}>
            <option value="">— No Status —</option>
            {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="cf-form-field">
          <label>Case Owner</label>
          <select value={infoForm.case_owner_id} onChange={e => { setInfoForm(p => ({ ...p, case_owner_id: e.target.value })); scheduleAutoSave() }}>
            <option value="">— Unassigned —</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className="cf-form-field">
          <label>Priority</label>
          <select value={infoForm.priority} onChange={e => { setInfoForm(p => ({ ...p, priority: e.target.value })); scheduleAutoSave() }}>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        <div className="cf-form-field">
          <label>Intake Channel</label>
          <select value={infoForm.intake_channel} onChange={e => { setInfoForm(p => ({ ...p, intake_channel: e.target.value })); scheduleAutoSave() }}>
            <option value="manual">Manual</option>
            <option value="email">Email</option>
            <option value="web_form">Web Form</option>
          </select>
        </div>
        <div className="cf-form-field">
          <label>Date Received</label>
          <input type="date" value={infoForm.date_received} onChange={e => { setInfoForm(p => ({ ...p, date_received: e.target.value })); scheduleAutoSave() }} />
        </div>
      </div>

      <div className="cf-form-field cf-form-field--full">
        <label>Description</label>
        <textarea
          rows={4} value={infoForm.description}
          onChange={e => { setInfoForm(p => ({ ...p, description: e.target.value })); scheduleAutoSave() }}
          placeholder="Case description…"
        />
      </div>
      <div className="cf-form-field cf-form-field--full">
        <label>Internal Notes</label>
        <textarea
          rows={3} value={infoForm.internal_notes}
          onChange={e => { setInfoForm(p => ({ ...p, internal_notes: e.target.value })); scheduleAutoSave() }}
          placeholder="Internal notes (not visible externally)…"
        />
      </div>

      <div className="cf-reassign-panel">
        <div className="cf-reassign-title">Case Reassignment</div>
        <div className="cf-reassign-grid">
          <div className="cf-form-field">
            <label>New Owner</label>
            <select value={reassignForm.new_owner_id} onChange={e => setReassignForm(prev => ({ ...prev, new_owner_id: e.target.value }))}>
              <option value="">— Select Owner —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="cf-form-field cf-form-field--full">
            <label>Reason (Optional)</label>
            <textarea
              rows={2}
              value={reassignForm.reason}
              onChange={e => setReassignForm(prev => ({ ...prev, reason: e.target.value }))}
              placeholder="Why is this case being reassigned?"
            />
          </div>
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
        />
      )}
    </div>
  )
}
