const PRIORITIES = ['high', 'medium', 'low']
const TRIAGE_STATES = ['new', 'in_review', 'linked', 'converted', 'no_action', 'closed']

export default function InboxBulkBar({
  selectionMode,
  bulkSelected,
  bulkTriageState,
  setBulkTriageState,
  bulkAssignee,
  setBulkAssignee,
  bulkPriority,
  setBulkPriority,
  bulkSnoozeUntil,
  setBulkSnoozeUntil,
  users,
  applyBulkUpdates,
  toggleSelectionMode
}) {
  if (!selectionMode) return null

  return (
    <div className="inbox-bulk-bar">
      <span className="bulk-count">{bulkSelected.size} selected</span>
      <select value={bulkTriageState} onChange={e => setBulkTriageState(e.target.value)} className="meta-select" style={{ minWidth: 130 }}>
        <option value="">Triage State</option>
        {TRIAGE_STATES.map(state => <option key={state} value={state}>{state.replace(/_/g, ' ')}</option>)}
      </select>
      <select value={bulkAssignee} onChange={e => setBulkAssignee(e.target.value)} className="meta-select" style={{ minWidth: 140 }}>
        <option value="">Assign To</option>
        <option value="__UNASSIGNED__">Unassigned</option>
        {users?.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
      </select>
      <select value={bulkPriority} onChange={e => setBulkPriority(e.target.value)} className="meta-select" style={{ minWidth: 120 }}>
        <option value="">Priority</option>
        {PRIORITIES.map(priority => <option key={priority} value={priority}>{priority}</option>)}
      </select>
      <input type="date" value={bulkSnoozeUntil} onChange={e => setBulkSnoozeUntil(e.target.value)} className="meta-date-input" />
      <button className="inbox-bulk-action" disabled={bulkSelected.size === 0} onClick={() => applyBulkUpdates()}>Apply</button>
      <button className="inbox-bulk-action" disabled={bulkSelected.size === 0} onClick={() => applyBulkUpdates({ status: 'processed', triage_state: 'closed', closed_at: new Date().toISOString() })}>Close</button>
      <button className="inbox-bulk-action inbox-bulk-action-ghost" onClick={toggleSelectionMode}>Done</button>
    </div>
  )
}
