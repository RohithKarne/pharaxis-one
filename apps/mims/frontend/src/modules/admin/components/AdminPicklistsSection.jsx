import AdminPicklistsPanel from './AdminPicklistsPanel'
import AdminFieldSetupPanel from './AdminFieldSetupPanel'
import AdminCaseFormDefPanel from './AdminCaseFormDefPanel'

export default function AdminPicklistsSection({ contentSection, H }) {
  switch (contentSection) {
    case 'picklists':    return <AdminPicklistsPanel H={H} />
    case 'field-setup':  return <AdminFieldSetupPanel H={H} />
    case 'case-form-def': return <AdminCaseFormDefPanel H={H} />
    default: return null
  }
}
