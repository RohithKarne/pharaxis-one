import { Navigate } from 'react-router-dom'
import {
  getOrgToken,
  getOrgUser,
  getSuperadminToken,
  getSuperadminUser
} from '../utils/session'

export function OrgAuthGuard({ children }) {
  const token = getOrgToken()
  const user = getOrgUser()
  if (!token || (!user?.id && !user?.email)) return <Navigate to="/" replace />
  return children
}

export function OrgRoleGuard({ roles, children }) {
  const token = getOrgToken()
  const user = getOrgUser()
  if (!token || (!user?.id && !user?.email)) return <Navigate to="/" replace />
  if (!roles.includes(String(user.role || ''))) {
    return <Navigate to="/vault" replace />
  }
  return children
}

export function SuperadminGuard({ children }) {
  const token = getSuperadminToken()
  const user = getSuperadminUser()
  if (!token || (!user?.id && !user?.email && !user?.superadminId)) return <Navigate to="/login" replace />
  return children
}
