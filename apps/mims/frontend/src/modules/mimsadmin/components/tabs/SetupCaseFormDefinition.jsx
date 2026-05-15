/**
 * SetupCaseFormDefinition.jsx — MIMS Admin > System > Setup > Case Form Definition
 */

import { useAuth } from '../../../../shared/context/AuthContext'
import AdminPicklistsSection from '../../../admin/components/AdminPicklistsSection'

export default function SetupCaseFormDefinition() {
  const { token } = useAuth()
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px' }}>
      <AdminPicklistsSection contentSection="case-form-def" H={H} />
    </div>
  )
}
