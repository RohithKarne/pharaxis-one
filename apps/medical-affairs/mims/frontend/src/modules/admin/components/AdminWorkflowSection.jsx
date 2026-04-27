import AdminSitesPanel from './AdminSitesPanel'
import AdminWorkflowPanel, { ImpactPreviewModal } from './AdminWorkflowPanel'
import AdminSourceTypesPanel from './AdminSourceTypesPanel'

export { ImpactPreviewModal }

export default function AdminWorkflowSection({ contentSection, H, flash }) {
  switch (contentSection) {
    case 'sites':        return <AdminSitesPanel H={H} flash={flash} />
    case 'workflow':     return <AdminWorkflowPanel H={H} flash={flash} />
    case 'source-types': return <AdminSourceTypesPanel H={H} flash={flash} />
    default: return null
  }
}
