const COLORS = ['red', 'yellow', 'green', 'blue']
const PRIORITIES = ['high', 'medium', 'low']
const TRIAGE_STATES = ['new', 'in_review', 'linked', 'converted', 'no_action', 'closed']
const PRIORITY_ICON = { high: '🔴', medium: '🟡', low: '🟢' }

export default function InboxFilterBar({
  advFilters,
  setAdvFilters,
  showAdvFilters,
  setShowAdvFilters,
  filterFrom,
  setFilterFrom,
  filterTo,
  setFilterTo,
  users,
  activeFilterChips,
  clearFilterChip,
  clearAllFilters,
  hasAdvFilters,
  tenantOptions,
  tenantFilterOrgId,
  setTenantFilterOrgId,
  queueOptions,
  setPage
}) {
  return (
    <>
      <div className="inbox-adv-filter-toggle">
        <button className={`inbox-sort-btn ${hasAdvFilters ? 'adv-active' : ''}`} onClick={() => setShowAdvFilters(a => !a)}>
          Filters {hasAdvFilters ? '●' : (showAdvFilters ? '▾' : '▸')}
        </button>
        {hasAdvFilters && (
          <button className="inbox-sort-btn" style={{ fontSize: 11 }} onClick={clearAllFilters}>
            Clear
          </button>
        )}
      </div>

      {activeFilterChips.length > 0 && (
        <div className="inbox-active-filters">
          {activeFilterChips.map(chip => (
            <button key={chip.key} className="inbox-active-filter-chip" onClick={() => clearFilterChip(chip.key)}>
              {chip.label} <span>✕</span>
            </button>
          ))}
        </div>
      )}

      {showAdvFilters && (
        <div className="inbox-adv-filter-panel">
          <div className="inbox-date-filter">
            {tenantOptions?.length > 0 && (
              <>
                <span className="date-filter-label">Tenant</span>
                <select
                  value={tenantFilterOrgId}
                  onChange={e => { setTenantFilterOrgId(e.target.value); setPage(1) }}
                  className="inbox-tenant-select"
                >
                  <option value="">All Assigned Tenants</option>
                  {tenantOptions.map(org => (
                    <option key={org.id} value={String(org.id)}>{org.name}</option>
                  ))}
                </select>
              </>
            )}
            <span className="date-filter-label">From</span>
            <input type="date" value={filterFrom} onChange={e => { setFilterFrom(e.target.value); setPage(1) }} />
            <span className="date-filter-label">To</span>
            <input type="date" value={filterTo} onChange={e => { setFilterTo(e.target.value); setPage(1) }} />
          </div>
          <div className="adv-filter-row">
            <select value={advFilters.color}
              onChange={e => { setAdvFilters(f => ({ ...f, color: e.target.value })); setPage(1) }}>
              <option value="">All Colors</option>
              {COLORS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
            <select value={advFilters.priority}
              onChange={e => { setAdvFilters(f => ({ ...f, priority: e.target.value })); setPage(1) }}>
              <option value="">All Priorities</option>
              {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_ICON[p]} {p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </select>
            <select value={advFilters.readStatus}
              onChange={e => { setAdvFilters(f => ({ ...f, readStatus: e.target.value })); setPage(1) }}>
              <option value="">All Read Status</option>
              <option value="unread">Unread</option>
              <option value="read">Read</option>
            </select>
            <select value={advFilters.isLocked}
              onChange={e => { setAdvFilters(f => ({ ...f, isLocked: e.target.value })); setPage(1) }}>
              <option value="">All Lock Status</option>
              <option value="locked">Locked</option>
              <option value="unlocked">Unlocked</option>
            </select>
            <select value={advFilters.assignee}
              onChange={e => { setAdvFilters(f => ({ ...f, assignee: e.target.value })); setPage(1) }}>
              <option value="">All Assignees</option>
              <option value="__UNASSIGNED__">Unassigned</option>
              {users?.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
            </select>
            <select value={advFilters.triageState}
              onChange={e => { setAdvFilters(f => ({ ...f, triageState: e.target.value })); setPage(1) }}>
              <option value="">All Triage States</option>
              {TRIAGE_STATES.map(state => <option key={state} value={state}>{state.replace(/_/g, ' ')}</option>)}
            </select>
            <select value={advFilters.queueName}
              onChange={e => { setAdvFilters(f => ({ ...f, queueName: e.target.value })); setPage(1) }}>
              <option value="">All Queues</option>
              {queueOptions?.map(queue => <option key={queue} value={queue}>{queue}</option>)}
            </select>
            <select value={advFilters.firstTouchSla}
              onChange={e => { setAdvFilters(f => ({ ...f, firstTouchSla: e.target.value })); setPage(1) }}>
              <option value="">First Touch SLA</option>
              <option value="breached">Breached</option>
              <option value="at_risk">At Risk</option>
              <option value="on_track">On Track</option>
              <option value="met">Met</option>
            </select>
            <select value={advFilters.responseSla}
              onChange={e => { setAdvFilters(f => ({ ...f, responseSla: e.target.value })); setPage(1) }}>
              <option value="">Response SLA</option>
              <option value="breached">Breached</option>
              <option value="at_risk">At Risk</option>
              <option value="on_track">On Track</option>
              <option value="met">Met</option>
            </select>
          </div>
        </div>
      )}
    </>
  )
}
