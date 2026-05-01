import { Navigate } from 'react-router-dom'
import {
  getOrgUser,
  getSuperadminUser
} from '../utils/session'

export function OrgAuthGuard({ children }) {
  const user = getOrgUser()
  if (!user?.id && !user?.email) return <Navigate to="/" replace />
  return children
}

export function OrgRoleGuard({ roles, children }) {
  const user = getOrgUser()
  if (!user?.id && !user?.email) return <Navigate to="/" replace />
  if (!roles.includes(String(user.role || ''))) {
    return <Navigate to="/vault" replace />
  }
  return children
}

export function SuperadminGuard({ children }) {
  const user = getSuperadminUser()
  if (!user?.id && !user?.email && !user?.superadminId) return <Navigate to="/control-tower/login" replace />
  return children
}
