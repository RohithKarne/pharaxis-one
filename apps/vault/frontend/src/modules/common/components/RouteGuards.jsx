import { Navigate } from 'react-router-dom'
import {
  getOrgToken,
  getOrgUser,
  getSuperadminToken
} from '../utils/session'

export function OrgAuthGuard({ children }) {
  const token = getOrgToken()
  if (!token) return <Navigate to="/" replace />
  return children
}

export function OrgRoleGuard({ roles, children }) {
  const token = getOrgToken()
  if (!token) return <Navigate to="/" replace />
  const user = getOrgUser()
  if (!roles.includes(String(user.role || ''))) {
    return <Navigate to="/vault" replace />
  }
  return children
}

export function SuperadminGuard({ children }) {
  const token = getSuperadminToken()
  if (!token) return <Navigate to="/superadmin" replace />
  return children
}
