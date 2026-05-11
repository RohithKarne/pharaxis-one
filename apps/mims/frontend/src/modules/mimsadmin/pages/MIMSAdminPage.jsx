import MIMSLayout from '../../../shared/components/MIMSLayout'
import MIMSAdminShell from '../components/MIMSAdminShell'

export default function MIMSAdminPage() {
  return (
    <MIMSLayout showStatStrip={false} bodyClassName="no-scroll mims-admin-page-body">
      <MIMSAdminShell />
    </MIMSLayout>
  )
}
