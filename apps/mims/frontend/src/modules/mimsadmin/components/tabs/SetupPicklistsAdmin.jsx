/**
 * SetupPicklistsAdmin.jsx — MIMS Admin > System > Setup > Picklist Definitions
 */

import { useAuth } from '../../../../shared/context/AuthContext'
import AdminPicklistsSection from '../../../admin/components/AdminPicklistsSection'

export default function SetupPicklistsAdmin() {
  const { token } = useAuth()
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px' }}>
      <AdminPicklistsSection contentSection="picklists" H={H} />
    </div>
  )
}
