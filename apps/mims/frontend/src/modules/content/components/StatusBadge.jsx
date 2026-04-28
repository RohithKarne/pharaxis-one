export default function StatusBadge({ status }) {
  const map = {
    Draft: 'draft',
    Pending: 'pending',
    'Under Review': 'review',
    Approved: 'approved',
    Published: 'published',
    Archived: 'archived',
    Active: 'approved',
    Inactive: 'archived',
  }
  const cls = map[status] || 'draft'
  return <span className={`cm-status-badge cm-status-${cls}`}>{status}</span>
}
