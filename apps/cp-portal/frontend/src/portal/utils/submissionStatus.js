// What the person is told about a request's status (CPPM-91). The internal sync
// states (submitted / pending_sync / synced / failed_sync) describe our copy of
// the request, not the request, so they all read as "In progress" — a visitor can
// do nothing with "failed_sync", and showing it invites a support call about our
// plumbing. One list, used by My Submissions and My Activity alike.
export const STATUS_LABELS = {
  submitted:    { label: 'In progress', cls: 'pp-status-pending'    },
  pending_sync: { label: 'In progress', cls: 'pp-status-pending'    },
  synced:       { label: 'In progress', cls: 'pp-status-pending'    },
  failed_sync:  { label: 'In progress', cls: 'pp-status-pending'    },
  pending:      { label: 'Pending',     cls: 'pp-status-pending'    },
  in_review:    { label: 'In Review',   cls: 'pp-status-in-review'  },
  completed:    { label: 'Completed',   cls: 'pp-status-completed'  },
  closed:       { label: 'Closed',      cls: 'pp-status-closed'     },
}

export function statusLabel(status) {
  return STATUS_LABELS[status]?.label || 'In progress'
}
