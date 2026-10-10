// Who did an audited action, in words an admin reads. Every row without an admin
// email used to say "Admin", including MIMS retries (CP screen review, 10 Oct 2026).
// Keep SYSTEM_ACTORS in step with backend/utils/audit.js.
const SYSTEM_ACTORS = ['MIMS integration', 'virus scan', 'Portal alerts', 'system']

export function activityActor(row) {
  if (row.admin_email) return row.admin_email
  if (row.admin_id) return row.admin_name || 'Admin'
  if (SYSTEM_ACTORS.includes(row.admin_name)) return `System (${row.admin_name})`
  return 'Portal user'
}
