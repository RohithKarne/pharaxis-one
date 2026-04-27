import AdminUserSecurityPanel from './AdminUserSecurityPanel'
import AdminUserConfigPanel from './AdminUserConfigPanel'
import AdminUserSecurityGroupsPanel from './AdminUserSecurityGroupsPanel'
import AdminReportAccessPanel from './AdminReportAccessPanel'
import AdminChangeApprovalsPanel from './AdminChangeApprovalsPanel'
import AdminSecurityGroupsPanel from './AdminSecurityGroupsPanel'

export default function AdminAccessSection({ contentSection, H, flash }) {
  switch (contentSection) {
    case 'user-security':
      return <AdminUserSecurityPanel H={H} />
    case 'user-config':
      return <AdminUserConfigPanel H={H} flash={flash} />
    case 'user-security-groups':
      return <AdminUserSecurityGroupsPanel H={H} flash={flash} />
    case 'report-access-requests':
      return <AdminReportAccessPanel H={H} />
    case 'change-approvals':
      return <AdminChangeApprovalsPanel H={H} />
    case 'security-groups':
      return <AdminSecurityGroupsPanel H={H} flash={flash} />
    default:
      return null
  }
}
