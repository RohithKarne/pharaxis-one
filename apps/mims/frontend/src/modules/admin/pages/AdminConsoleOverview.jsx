import { useNavigate } from 'react-router-dom'
import MIMSLayout from '../../../shared/components/MIMSLayout'
import { useAuth } from '../../../shared/context/AuthContext'
import { ADMIN_NAV_GROUPS, getAdminRoute } from '../adminConsoleConfig'
import { AdminConsoleBrandHero, AdminConsoleNavigationBoard } from '../components/AdminConsoleShell'

export default function AdminConsoleOverview() {
  const navigate = useNavigate()
  const { orgName } = useAuth()
  const resolvedOrgName = orgName || 'Your Organisation'

  return (
    <MIMSLayout showStatStrip={false} bodyClassName="no-scroll admin-page-body">
      <div className="ac-shell-page">
        <AdminConsoleBrandHero
          title={`Admin Overview and Configurations of ${resolvedOrgName}`}
          subtitle="Use this launch board to open the exact admin configuration area you want to review or manage."
        />
        <div className="ac-detail-shell">
          <div className="ac-detail-surface">
            <AdminConsoleNavigationBoard
              groups={ADMIN_NAV_GROUPS}
              currentSection={null}
              onNavigate={(sectionKey) => navigate(getAdminRoute(sectionKey))}
              mode="overview"
            />
          </div>
        </div>
      </div>
    </MIMSLayout>
  )
}
