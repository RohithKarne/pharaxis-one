import { useEffect, useState } from 'react'
import { SectionHeader } from './AdminShared'
import { httpFetch } from '../../../shared/api/httpFetch.js'

const MODULES = [
  { key: 'mims_core', label: 'MIMS Core' },
  { key: 'inbox', label: 'Inbox' },
  { key: 'case_mgmt', label: 'Case Management' },
  { key: 'case_query', label: 'Case Query' },
  { key: 'utilities', label: 'Utilities' },
  { key: 'transmissions', label: 'Transmissions' },
  { key: 'browse_content', label: 'Browse Content' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'user_mgmt', label: 'User Management' },
  { key: 'admin_console', label: 'MIMS Admin' },
  { key: 'content_mgmt', label: 'Content Management' },
  { key: 'data_visualization', label: 'Data Visualization' },
  { key: 'reports', label: 'Reports' },
]

const ROLES = ['admin', 'agent', 'reviewer', 'content_manager']
const ROLE_LABELS = {
  admin: 'Administrator',
  agent: 'MI Agent',
  reviewer: 'Reviewer',
  content_manager: 'Content Manager',
}

export default function AdminUserSecurityPanel({ H }) {
  const [permissions, setPermissions] = useState([])
  const [permissionsLoading, setPermissionsLoading] = useState(false)

  useEffect(() => { loadPermissions() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function getPermission(role, mod) {
    const permission = permissions.find(p => p.role === role && p.module === mod)
    return permission ? permission.can_access : 0
  }

  async function loadPermissions() {
    setPermissionsLoading(true)
    try {
      const data = await httpFetch('/api/admin/permissions', { headers: H }).then(r => r.json())
      setPermissions(data.permissions || [])
    } catch {
      setPermissions([])
    } finally {
      setPermissionsLoading(false)
    }
  }

  return (
    <>
      <SectionHeader title="User Security Groups" desc="View role-to-module permissions. Changes are managed by SuperAdmin." />
      <div style={{ padding: '8px 14px', marginBottom: 12, background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 6, fontSize: 12, color: '#7a5c00' }}>
        Security group permissions are controlled by SuperAdmin only. Contact your platform admin to modify role access.
      </div>
      <div className="card">
        <div className="card-header"><h3>Role Permission Matrix</h3></div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Module</th>
                {ROLES.map(role => <th key={role}>{ROLE_LABELS[role]}</th>)}
              </tr>
            </thead>
            <tbody>
              {permissionsLoading ? (
                <tr><td colSpan={ROLES.length + 1} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>Loading…</td></tr>
              ) : (
                MODULES.map(mod => (
                  <tr key={mod.key}>
                    <td><strong>{mod.label}</strong></td>
                    {ROLES.map(role => {
                      const allowed = getPermission(role, mod.key)
                      return (
                        <td key={role} style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: 16 }} title={allowed ? 'Allowed' : 'Not allowed'}>
                            {allowed ? '✅' : '🔒'}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
            Click ✅ to revoke access | Click 🔒 to grant access
            <br />
            <span style={{ color: 'var(--warning)', fontWeight: 500 }}>Admin {'->'} MIMS Admin</span> is permanently locked ON and cannot be changed.
            This is a system safety rule - at least one role must always have admin access to prevent lockout.
          </div>
        </div>
      </div>
    </>
  )
}
