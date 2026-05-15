/**
 * SetupFieldConfiguration.jsx — MIMS Admin > System > Setup > Field Configuration
 */

import { useAuth } from '../../../../shared/context/AuthContext'
import AdminPicklistsSection from '../../../admin/components/AdminPicklistsSection'

export default function SetupFieldConfiguration() {
  const { token } = useAuth()
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px' }}>
      <AdminPicklistsSection contentSection="field-setup" H={H} />
    </div>
  )
}
