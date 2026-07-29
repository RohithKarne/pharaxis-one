import AdminAccessConfigurationsPanel from './AdminAccessConfigurationsPanel'
import AdminChangeApprovalsPanel from './AdminChangeApprovalsPanel'

export default function AdminAccessSection({ contentSection, H, flash }) {
  switch (contentSection) {
    case 'change-approvals':
      return <AdminChangeApprovalsPanel H={H} flash={flash} />
    case 'auth-policy':
    case 'user-security':
    case 'user-config':
    case 'user-security-groups':
    case 'report-access-requests':
    case 'security-groups':
      return <AdminAccessConfigurationsPanel contentSection={contentSection} H={H} flash={flash} />
    default:
      return null
  }
}
