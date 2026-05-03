import AdminAccessConfigurationsPanel from './AdminAccessConfigurationsPanel'

export default function AdminAccessSection({ contentSection, H, flash }) {
  switch (contentSection) {
    case 'auth-policy':
      return <AdminAccessConfigurationsPanel contentSection={contentSection} H={H} flash={flash} />
    case 'user-security':
      return <AdminAccessConfigurationsPanel contentSection={contentSection} H={H} flash={flash} />
    case 'user-config':
      return <AdminAccessConfigurationsPanel contentSection={contentSection} H={H} flash={flash} />
    case 'user-security-groups':
      return <AdminAccessConfigurationsPanel contentSection={contentSection} H={H} flash={flash} />
    case 'report-access-requests':
      return <AdminAccessConfigurationsPanel contentSection={contentSection} H={H} flash={flash} />
    case 'change-approvals':
      return <AdminAccessConfigurationsPanel contentSection={contentSection} H={H} flash={flash} />
    case 'security-groups':
      return <AdminAccessConfigurationsPanel contentSection={contentSection} H={H} flash={flash} />
    default:
      return null
  }
}
