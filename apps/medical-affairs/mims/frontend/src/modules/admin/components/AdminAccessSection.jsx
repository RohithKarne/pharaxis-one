import { useEffect, useState } from 'react'

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
  { key: 'admin_console', label: 'Admin Console' },
  { key: 'content_mgmt', label: 'Content Management' },
  { key: 'data_visualization', label: 'Data Visualization' },
]

const ROLES = ['admin', 'agent', 'reviewer', 'content_manager']
const ROLE_LABELS = {
  admin: 'Administrator',
  agent: 'MI Agent',
  reviewer: 'Reviewer',
  content_manager: 'Content Manager',
}

const REPORT_KEYS = [
  'cases_by_type',
  'cases_by_status',
  'cases_by_month',
  'cases_by_site',
  'cases_by_priority',
  'cases_by_assignee',
  'cases_by_intake',
  'cases_overdue',
  'case_detail_full',
  'case_detail_timeline',
  'case_detail_audit',
  'compliance_sla',
  'compliance_30day',
  'compliance_expedited',
  'compliance_closures',
  'platform_users',
  'platform_logins',
  'platform_orgs',
  'platform_cases_trend',
  'platform_top_reporters',
  'platform_audit_summary',
  'platform_2fa',
  'platform_sessions',
  'platform_api_usage',
  'platform_errors',
]

const LEGACY_SEC_TABS = [
  { key: 'menu', label: 'Menu Access' },
  { key: 'cm', label: 'CM Menu Access' },
  { key: 'case', label: 'Case Activities' },
  { key: 'casemgmt', label: 'Case Management' },
  { key: 'cmact', label: 'CM Activities' },
  { key: 'mobile', label: 'Mobile Activities' },
]

const LEGACY_SEC_PERMS = {
  menu: [
    { key: 'admin_console', label: 'Admin Console' },
    { key: 'content_mgmt', label: 'Content Mgmt' },
    { key: 'inbox', label: 'Inbox' },
    { key: 'case_mgmt', label: 'Case Management' },
    { key: 'analytics', label: 'Analytics' },
    { key: 'data_viz', label: 'Data Visualization' },
  ],
  cm: [
    { key: 'cm_documents', label: 'Documents' },
    { key: 'cm_faqs', label: 'FAQs' },
    { key: 'cm_merge_reports', label: 'Merge Reports' },
    { key: 'cm_templates', label: 'Templates' },
    { key: 'cm_folders', label: 'Folders' },
  ],
  case: [
    { key: 'case_create', label: 'Create Case' },
    { key: 'case_update', label: 'Update Case' },
    { key: 'case_review', label: 'Review Case' },
    { key: 'case_fulfill', label: 'Fulfill' },
    { key: 'case_transmit', label: 'Transmit' },
    { key: 'case_correspond', label: 'Correspond' },
    { key: 'case_close', label: 'Close Case' },
    { key: 'case_reopen', label: 'Reopen Case' },
  ],
  casemgmt: [
    { key: 'case_mi_create', label: 'MI - Create/Edit' },
    { key: 'case_ae_create', label: 'AE - Create/Edit' },
    { key: 'case_pc_create', label: 'PC - Create/Edit' },
    { key: 'case_ae_seriousness', label: 'AE - Edit Seriousness' },
    { key: 'case_version_create', label: 'Create New Version' },
    { key: 'case_doc_upload', label: 'Upload Documents' },
    { key: 'case_export', label: 'Export Cases' },
    { key: 'case_bulk_ops', label: 'Bulk Operations' },
  ],
  cmact: [
    { key: 'cmact_author', label: 'Author' },
    { key: 'cmact_review', label: 'Review' },
    { key: 'cmact_approve', label: 'Approve' },
    { key: 'cmact_publish', label: 'Publish' },
    { key: 'cmact_archive', label: 'Archive' },
    { key: 'cmact_folder_mgmt', label: 'Folder Mgmt' },
  ],
  mobile: [
    { key: 'mobile_view', label: 'View' },
    { key: 'mobile_create', label: 'Create' },
    { key: 'mobile_update', label: 'Update' },
  ],
}

function SectionHeader({ title, desc }) {
  return (
    <div className="admin-section-header">
      <div>
        <h2>{title}</h2>
        {desc && <p>{desc}</p>}
      </div>
    </div>
  )
}

function StatusPill({ active }) {
  return <span className={`status-pill ${active ? 'active' : 'inactive'}`}>{active ? 'Active' : 'Inactive'}</span>
}

export default function AdminAccessSection({ contentSection, H, flash }) {
  const [permissions, setPermissions] = useState([])
  const [permissionsLoading, setPermissionsLoading] = useState(false)
  const [accessUsers, setAccessUsers] = useState([])
  const [orgUsers, setOrgUsers] = useState([])
  const [orgUsersLoading, setOrgUsersLoading] = useState(false)
  const [expiryEditUserId, setExpiryEditUserId] = useState(null)
  const [expiryDateInput, setExpiryDateInput] = useState('')
  const [expirySaving, setExpirySaving] = useState(false)
  const [reportAccessList, setReportAccessList] = useState([])
  const [reportAccessRequests, setReportAccessRequests] = useState([])
  const [reportAccessLoading, setReportAccessLoading] = useState(false)
  const [reportReqForm, setReportReqForm] = useState({ user_id: '', report_key: '' })
  const [reportReqMsg, setReportReqMsg] = useState('')
  const [reportReqSaving, setReportReqSaving] = useState(false)
  const [changeApprovals, setChangeApprovals] = useState([])
  const [myChangeRequests, setMyChangeRequests] = useState([])
  const [changeApprovalsLoading, setChangeApprovalsLoading] = useState(false)
  const [changeApprovalsTab, setChangeApprovalsTab] = useState('pending')
  const [changeApprovalsStatusFilter, setChangeApprovalsStatusFilter] = useState('pending')
  const [changeRejectId, setChangeRejectId] = useState(null)
  const [changeRejectNote, setChangeRejectNote] = useState('')
  const [changeActionMsg, setChangeActionMsg] = useState('')
  const [secGroups, setSecGroups] = useState([])
  const [secGroupsLoading, setSecGroupsLoading] = useState(false)
  const [secGroupForm, setSecGroupForm] = useState({ name: '', description: '' })
  const [secGroupMsg, setSecGroupMsg] = useState('')
  const [secGroupSaving, setSecGroupSaving] = useState(false)
  const [secGroupEditTarget, setSecGroupEditTarget] = useState(null)
  const [secGroupSelected, setSecGroupSelected] = useState(null)
  const [secGroupMembersLoading, setSecGroupMembersLoading] = useState(false)
  const [secGroupAddUserId, setSecGroupAddUserId] = useState('')
  const [secGroupAddMsg, setSecGroupAddMsg] = useState('')
  const [legacySecGroups, setLegacySecGroups] = useState([])
  const [legacySecGroupUsers, setLegacySecGroupUsers] = useState([])
  const [selectedLegacySecGroup, setSelectedLegacySecGroup] = useState(null)
  const [legacySecGroupTab, setLegacySecGroupTab] = useState('menu')
  const [legacySecGroupLoading, setLegacySecGroupLoading] = useState(false)
  const [legacySecGroupForm, setLegacySecGroupForm] = useState({ name: '', description: '', permissions: {} })
  const [legacySecGroupAddUserVal, setLegacySecGroupAddUserVal] = useState('')
  const [legacySecGroupSaving, setLegacySecGroupSaving] = useState(false)

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (contentSection === 'user-security') loadPermissions()
    if (contentSection === 'user-config') loadOrgUsers()
    if (contentSection === 'user-security-groups') {
      loadLegacySecGroups()
      loadAccessUsers()
    }
    if (contentSection === 'report-access-requests') loadReportAccessData()
    if (contentSection === 'security-groups') loadSecGroups()
  }, [contentSection])

  useEffect(() => {
    if (contentSection !== 'change-approvals') return
    loadChangeApprovalsData()
  }, [contentSection, changeApprovalsStatusFilter])
  /* eslint-enable react-hooks/exhaustive-deps */

  function getPermission(role, mod) {
    const permission = permissions.find(p => p.role === role && p.module === mod)
    return permission ? permission.can_access : 0
  }

  async function loadPermissions() {
    setPermissionsLoading(true)
    try {
      const data = await fetch('/api/admin/permissions', { headers: H }).then(r => r.json())
      setPermissions(data.permissions || [])
    } catch {
      setPermissions([])
    } finally {
      setPermissionsLoading(false)
    }
  }

  async function loadAccessUsers() {
    try {
      const data = await fetch('/api/admin/users', { headers: H }).then(r => r.json())
      setAccessUsers(data.users || [])
    } catch {
      setAccessUsers([])
    }
  }

  async function loadOrgUsers() {
    setOrgUsersLoading(true)
    try {
      const me = await fetch('/api/auth/me', { headers: H }).then(r => r.json())
      if (!me.orgId) {
        setOrgUsers([])
        return
      }
      const data = await fetch(`/api/admin/orgs/${me.orgId}/users`, { headers: H }).then(r => r.json())
      setOrgUsers(data.users || [])
    } catch {
      setOrgUsers([])
    } finally {
      setOrgUsersLoading(false)
    }
  }

  async function saveUserExpiry(userId) {
    setExpirySaving(true)
    try {
      const me = await fetch('/api/auth/me', { headers: H }).then(r => r.json())
      await fetch(`/api/admin/orgs/${me.orgId}/users/${userId}/expiry`, {
        method: 'PUT',
        headers: H,
        body: JSON.stringify({ access_expires_at: expiryDateInput || null }),
      })
      setOrgUsers(prev => prev.map(user => (
        user.id === userId ? { ...user, access_expires_at: expiryDateInput || null } : user
      )))
      setExpiryEditUserId(null)
    } catch {
      flash('Failed to update access expiry.', 'error')
    } finally {
      setExpirySaving(false)
    }
  }

  async function loadReportAccessData() {
    setReportAccessLoading(true)
    try {
      const [accessData, requestData] = await Promise.all([
        fetch('/api/admin/reports/access', { headers: H }).then(r => r.json()).catch(() => ({ access: [] })),
        fetch('/api/admin/reports/access/requests', { headers: H }).then(r => r.json()).catch(() => ({ requests: [] })),
      ])
      setReportAccessList(accessData.access || [])
      setReportAccessRequests(requestData.requests || [])
    } finally {
      setReportAccessLoading(false)
    }
  }

  async function submitReportRequest() {
    setReportReqSaving(true)
    setReportReqMsg('')
    try {
      const response = await fetch('/api/admin/reports/access/request', {
        method: 'POST',
        headers: H,
        body: JSON.stringify({
          user_id: parseInt(reportReqForm.user_id, 10),
          report_key: reportReqForm.report_key,
        }),
      })
      const data = await response.json()
      if (response.ok) {
        setReportReqMsg('✓ Request submitted - pending SuperAdmin approval.')
        setReportReqForm({ user_id: '', report_key: '' })
        const updated = await fetch('/api/admin/reports/access/requests', { headers: H }).then(r => r.json()).catch(() => ({ requests: [] }))
        setReportAccessRequests(updated.requests || [])
      } else {
        setReportReqMsg(data.error || 'Request failed.')
      }
    } catch {
      setReportReqMsg('Request failed.')
    } finally {
      setReportReqSaving(false)
    }
  }

  async function loadChangeApprovalsData() {
    setChangeApprovalsLoading(true)
    try {
      const [approvalsData, myRequestsData] = await Promise.all([
        fetch(`/api/admin/change-approvals?status=${changeApprovalsStatusFilter}`, { headers: H }).then(r => r.json()).catch(() => ({ requests: [] })),
        fetch('/api/admin/change-approvals/my-requests', { headers: H }).then(r => r.json()).catch(() => ({ requests: [] })),
      ])
      setChangeApprovals(approvalsData.requests || [])
      setMyChangeRequests(myRequestsData.requests || [])
    } finally {
      setChangeApprovalsLoading(false)
    }
  }

  function getChangeApprovalStatusColor(status) {
    if (status === 'approved') return 'var(--success)'
    if (status === 'rejected') return 'var(--danger)'
    return '#b8860b'
  }

  async function approveChangeRequest(id) {
    setChangeActionMsg('')
    const response = await fetch(`/api/admin/change-approvals/${id}/approve`, { method: 'PUT', headers: H })
    const data = await response.json()
    setChangeActionMsg(response.ok ? '✓ Request approved.' : data.error || 'Failed.')
    if (response.ok) setChangeApprovals(prev => prev.filter(item => item.id !== id))
  }

  async function rejectChangeRequest(id) {
    setChangeActionMsg('')
    const response = await fetch(`/api/admin/change-approvals/${id}/reject`, {
      method: 'PUT',
      headers: H,
      body: JSON.stringify({ rejection_note: changeRejectNote }),
    })
    const data = await response.json()
    setChangeActionMsg(response.ok ? '✓ Request rejected.' : data.error || 'Failed.')
    if (response.ok) {
      setChangeApprovals(prev => prev.filter(item => item.id !== id))
      setChangeRejectId(null)
      setChangeRejectNote('')
    }
  }

  async function loadSecGroups() {
    setSecGroupsLoading(true)
    try {
      const data = await fetch('/api/admin/security-groups', { headers: H }).then(r => r.json()).catch(() => ({ groups: [] }))
      setSecGroups(data.groups || [])
    } finally {
      setSecGroupsLoading(false)
    }
  }

  async function loadSecGroupMembers(group) {
    setSecGroupSelected(group)
    setSecGroupAddUserId('')
    setSecGroupAddMsg('')
    setSecGroupMembersLoading(true)
    try {
      const data = await fetch(`/api/admin/security-groups/${group.id}`, { headers: H }).then(r => r.json()).catch(() => ({ members: [] }))
      setSecGroupSelected({ ...group, members: data.members || [] })
    } finally {
      setSecGroupMembersLoading(false)
    }
  }

  async function saveSecGroup() {
    setSecGroupSaving(true)
    setSecGroupMsg('')
    try {
      if (secGroupEditTarget) {
        const response = await fetch(`/api/admin/security-groups/${secGroupEditTarget.id}`, {
          method: 'PUT',
          headers: H,
          body: JSON.stringify({ name: secGroupForm.name, description: secGroupForm.description, is_active: 1 }),
        })
        const data = await response.json()
        if (response.ok) {
          setSecGroupMsg('✓ Group updated.')
          setSecGroupEditTarget(null)
          setSecGroupForm({ name: '', description: '' })
          await loadSecGroups()
        } else {
          setSecGroupMsg(data.error || 'Update failed.')
        }
      } else {
        const response = await fetch('/api/admin/security-groups', {
          method: 'POST',
          headers: H,
          body: JSON.stringify({ name: secGroupForm.name, description: secGroupForm.description }),
        })
        const data = await response.json()
        if (response.ok) {
          setSecGroupMsg('✓ Group created.')
          setSecGroupForm({ name: '', description: '' })
          await loadSecGroups()
        } else {
          setSecGroupMsg(data.error || 'Create failed.')
        }
      }
    } finally {
      setSecGroupSaving(false)
    }
  }

  async function deactivateSecGroup(group) {
    if (!window.confirm(`Deactivate group ${group.name}?`)) return
    setSecGroupMsg('')
    try {
      const response = await fetch(`/api/admin/security-groups/${group.id}`, { method: 'DELETE', headers: H })
      const data = await response.json().catch(() => ({}))
      if (response.ok) {
        setSecGroupMsg('✓ Group deactivated.')
        await loadSecGroups()
        if (secGroupSelected?.id === group.id) setSecGroupSelected(null)
      } else {
        const msg = formatSecGroupDependencyMessage(data)
        setSecGroupMsg(msg)
        flash(msg, 'error')
      }
    } catch {
      const msg = 'Failed to deactivate security group.'
      setSecGroupMsg(msg)
      flash(msg, 'error')
    }
  }

  async function addSecGroupUser() {
    if (!secGroupSelected || !secGroupAddUserId) return
    setSecGroupAddMsg('')
    const response = await fetch(`/api/admin/security-groups/${secGroupSelected.id}/users`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ user_id: parseInt(secGroupAddUserId, 10) }),
    })
    const data = await response.json()
    if (response.ok) {
      setSecGroupAddMsg('✓ User added.')
      setSecGroupAddUserId('')
      const updated = await fetch(`/api/admin/security-groups/${secGroupSelected.id}`, { headers: H }).then(r => r.json()).catch(() => ({ members: [] }))
      setSecGroupSelected(prev => ({ ...prev, members: updated.members || [] }))
    } else {
      setSecGroupAddMsg(data.error || 'Failed.')
    }
  }

  async function removeSecGroupUser(userId) {
    if (!secGroupSelected) return
    const response = await fetch(`/api/admin/security-groups/${secGroupSelected.id}/users/${userId}`, { method: 'DELETE', headers: H })
    if (response.ok) {
      setSecGroupSelected(prev => ({ ...prev, members: (prev.members || []).filter(member => member.id !== userId) }))
    }
  }

  async function loadLegacySecGroups() {
    setLegacySecGroupLoading(true)
    try {
      const data = await fetch('/api/admin/security-groups', { headers: H }).then(r => r.json())
      setLegacySecGroups(data.groups || [])
    } catch {
      setLegacySecGroups([])
    } finally {
      setLegacySecGroupLoading(false)
    }
  }

  async function selectLegacySecGroup(group) {
    setSelectedLegacySecGroup(group)
    setLegacySecGroupTab('menu')
    setLegacySecGroupForm({ name: group.name, description: group.description || '', permissions: group.privileges || {} })
    try {
      const data = await fetch(`/api/admin/security-groups/${group.id}`, { headers: H }).then(r => r.json())
      setLegacySecGroupUsers(data.members || [])
    } catch {
      setLegacySecGroupUsers([])
    }
  }

  async function createLegacySecGroup() {
    const response = await fetch('/api/admin/security-groups', {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ name: 'New Group', description: '' }),
    })
    const data = await response.json()
    if (!response.ok) return flash(data.error || 'Create failed.', 'error')
    await loadLegacySecGroups()
    flash('Group created.')
  }

  async function saveLegacySecGroup() {
    if (!selectedLegacySecGroup) return
    setLegacySecGroupSaving(true)
    try {
      const response = await fetch(`/api/admin/security-groups/${selectedLegacySecGroup.id}`, {
        method: 'PUT',
        headers: H,
        body: JSON.stringify({
          name: legacySecGroupForm.name,
          description: legacySecGroupForm.description,
          privileges: legacySecGroupForm.permissions,
        }),
      })
      const data = await response.json()
      if (!response.ok) return flash(data.error || 'Save failed.', 'error')
      await loadLegacySecGroups()
      flash('Group saved.')
    } catch {
      flash('Save failed.', 'error')
    } finally {
      setLegacySecGroupSaving(false)
    }
  }

  async function deleteLegacySecGroup() {
    if (!selectedLegacySecGroup) return
    if (!window.confirm(`Delete security group "${selectedLegacySecGroup.name}"?`)) return
    const response = await fetch(`/api/admin/security-groups/${selectedLegacySecGroup.id}`, { method: 'DELETE', headers: H })
    const data = await response.json()
    if (!response.ok) return flash(formatSecGroupDependencyMessage(data), 'error')
    setSelectedLegacySecGroup(null)
    setLegacySecGroupUsers([])
    await loadLegacySecGroups()
    flash('Group deleted.')
  }

  async function addUserToLegacySecGroup() {
    if (!legacySecGroupAddUserVal || !selectedLegacySecGroup) return
    const response = await fetch(`/api/admin/security-groups/${selectedLegacySecGroup.id}/users`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ user_id: legacySecGroupAddUserVal }),
    })
    const data = await response.json()
    if (!response.ok) return flash(data.error || 'Failed to add user.', 'error')
    const added = accessUsers.find(user => String(user.id) === String(legacySecGroupAddUserVal))
    if (added) setLegacySecGroupUsers(prev => [...prev, added])
    setLegacySecGroupAddUserVal('')
    flash('User added to group.')
  }

  async function removeUserFromLegacySecGroup(userId) {
    if (!selectedLegacySecGroup) return
    if (!window.confirm('Remove this user from selected security group?')) return
    const response = await fetch(`/api/admin/security-groups/${selectedLegacySecGroup.id}/users/${userId}`, { method: 'DELETE', headers: H })
    const data = await response.json()
    if (!response.ok) return flash(data.error || 'Failed to remove user.', 'error')
    setLegacySecGroupUsers(prev => prev.filter(user => user.id !== userId))
    flash('User removed from group.')
  }

  function toggleLegacySecGroupPerm(key) {
    setLegacySecGroupForm(prev => ({
      ...prev,
      permissions: { ...prev.permissions, [key]: !prev.permissions[key] },
    }))
  }

  function formatSecGroupDependencyMessage(data) {
    const count = Number(data?.dependency?.active_member_count || 0)
    const base = data?.error || 'Action blocked by current security-group dependencies.'
    if (count <= 0) return base
    const sample = Array.isArray(data?.dependency?.active_members_sample)
      ? data.dependency.active_members_sample.slice(0, 3)
      : []
    const sampleText = sample
      .map(member => member?.email || member?.name || (member?.id ? `User #${member.id}` : null))
      .filter(Boolean)
      .join(', ')
    const suffix = sampleText
      ? ` Active members include: ${sampleText}${count > sample.length ? ', ...' : ''}.`
      : ''
    return `${base} (${count} active member${count === 1 ? '' : 's'} assigned.)${suffix}`
  }

  switch (contentSection) {
    case 'user-security':
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
                <span style={{ color: 'var(--warning)', fontWeight: 500 }}>Admin {'->'} Admin Console</span> is permanently locked ON and cannot be changed.
                This is a system safety rule - at least one role must always have admin access to prevent lockout.
              </div>
            </div>
          </div>
        </>
      )

    case 'user-config':
      return (
        <>
          <SectionHeader title="User Configuration" desc="Manage organisation users and their access expiry dates." />
          <div className="card">
            <div className="card-header"><h3>Organisation Users {orgUsersLoading ? '(loading...)' : ''}</h3></div>
            <div className="card-body" style={{ padding: 0 }}>
              <table className="admin-table">
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Access Expires</th><th>Action</th></tr></thead>
                <tbody>
                  {orgUsers.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>{orgUsersLoading ? 'Loading users...' : 'No users in this organisation.'}</td></tr>}
                  {orgUsers.map(user => (
                    <tr key={user.id}>
                      <td>{user.name}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{user.email}</td>
                      <td><span className="badge badge-new">{ROLE_LABELS[user.role_at_org] || user.role_at_org}</span></td>
                      <td><StatusPill active={user.is_active} /></td>
                      <td style={{ color: user.access_expires_at && new Date(user.access_expires_at) < new Date() ? 'var(--warning)' : 'var(--text-muted)', fontSize: 12 }}>
                        {user.access_expires_at ? new Date(user.access_expires_at).toLocaleDateString() : '—'}
                      </td>
                      <td>
                        {expiryEditUserId === user.id ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input type="date" className="form-input" style={{ width: 140, fontSize: 12, padding: '2px 6px' }} value={expiryDateInput} onChange={e => setExpiryDateInput(e.target.value)} />
                            <button className="btn btn-primary" style={{ fontSize: 11, padding: '2px 8px' }} disabled={expirySaving} onClick={() => saveUserExpiry(user.id)}>Save</button>
                            <button className="btn btn-secondary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => setExpiryEditUserId(null)}>Cancel</button>
                          </div>
                        ) : (
                          <button className="btn btn-outline" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => { setExpiryEditUserId(user.id); setExpiryDateInput(user.access_expires_at ? user.access_expires_at.slice(0, 10) : '') }}>
                            {user.access_expires_at ? 'Edit Expiry' : 'Set Expiry'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )

    case 'user-security-groups': {
      const availableToAdd = accessUsers.filter(user => !legacySecGroupUsers.find(selectedUser => selectedUser.id === user.id))

      return (
        <>
          <SectionHeader title="User Security Groups" desc="Define named security groups with granular access controls and assign users." />
          <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface)', minHeight: 480 }}>
            <div style={{ width: 210, borderRight: '1px solid var(--border)', background: 'var(--bg)', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                <button className="btn btn-primary" style={{ width: '100%', fontSize: 12 }} onClick={createLegacySecGroup}>+ New Group</button>
              </div>
              <div style={{ flex: 1, overflow: 'auto' }}>
                {legacySecGroupLoading && <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>}
                {!legacySecGroupLoading && legacySecGroups.length === 0 && <div style={{ padding: 16, fontSize: 12, color: 'var(--text-muted)' }}>No groups yet.</div>}
                {legacySecGroups.map(group => (
                  <div
                    key={group.id}
                    onClick={() => selectLegacySecGroup(group)}
                    style={{ padding: '11px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', background: selectedLegacySecGroup?.id === group.id ? 'var(--primary)' : 'transparent', color: selectedLegacySecGroup?.id === group.id ? '#fff' : 'var(--text-primary)', transition: 'background 0.15s' }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{group.name}</div>
                    <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{group.user_count ?? 0} user{(group.user_count ?? 0) !== 1 ? 's' : ''}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {!selectedLegacySecGroup ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                  Select a security group from the left to view and edit its settings.
                </div>
              ) : (
                <>
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>Group Name</label>
                      <input className="form-control" value={legacySecGroupForm.name} onChange={e => setLegacySecGroupForm(prev => ({ ...prev, name: e.target.value }))} />
                    </div>
                    <div style={{ flex: 2, minWidth: 200 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>Description</label>
                      <input className="form-control" value={legacySecGroupForm.description} onChange={e => setLegacySecGroupForm(prev => ({ ...prev, description: e.target.value }))} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg)', flexShrink: 0 }}>
                    {LEGACY_SEC_TABS.map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => setLegacySecGroupTab(tab.key)}
                        style={{ padding: '10px 16px', border: 'none', borderBottom: legacySecGroupTab === tab.key ? '2px solid var(--primary)' : '2px solid transparent', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: legacySecGroupTab === tab.key ? 700 : 400, color: legacySecGroupTab === tab.key ? 'var(--primary)' : 'var(--text-secondary)', transition: 'color 0.15s' }}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 28px' }}>
                      {(LEGACY_SEC_PERMS[legacySecGroupTab] || []).map(permission => (
                        <label key={permission.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                          <input
                            type="checkbox"
                            checked={!!legacySecGroupForm.permissions[permission.key]}
                            onChange={() => toggleLegacySecGroupPerm(permission.key)}
                          />
                          {permission.label}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div style={{ padding: '14px 20px', flex: 1, overflow: 'auto' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Users in Group</div>
                    {legacySecGroupUsers.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>No users assigned.</div>}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                      {legacySecGroupUsers.map(user => (
                        <div key={user.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 20, padding: '4px 12px', fontSize: 12 }}>
                          <span>{user.name}</span>
                          <button onClick={() => removeUserFromLegacySecGroup(user.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 14, lineHeight: 1, padding: 0 }}>x</button>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <select className="form-control" style={{ maxWidth: 220 }} value={legacySecGroupAddUserVal} onChange={e => setLegacySecGroupAddUserVal(e.target.value)}>
                        <option value="">- Add user -</option>
                        {availableToAdd.map(user => <option key={user.id} value={user.id}>{user.name} ({user.email})</option>)}
                      </select>
                      <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={addUserToLegacySecGroup} disabled={!legacySecGroupAddUserVal}>+ Add</button>
                    </div>
                  </div>

                  <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button className="btn btn-danger" style={{ fontSize: 12 }} onClick={deleteLegacySecGroup}>Delete Group</button>
                    <button className="btn btn-primary" style={{ fontSize: 12 }} disabled={legacySecGroupSaving} onClick={saveLegacySecGroup}>
                      {legacySecGroupSaving ? 'Saving…' : 'Save Group'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )
    }

    case 'report-access-requests':
      return (
        <div style={{ padding: 24, maxWidth: 900 }}>
          <h2 style={{ marginBottom: 4 }}>Report Access Requests</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>Request report access for users in your organisation. Requests are reviewed and approved by the SuperAdmin team.</p>

          <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 20, marginBottom: 24 }}>
            <h4 style={{ margin: '0 0 16px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>New Access Request</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 600, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>User ID</label>
                <input className="form-input" type="number" placeholder="Enter user ID" value={reportReqForm.user_id} onChange={e => setReportReqForm(prev => ({ ...prev, user_id: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Report</label>
                <select className="form-input" value={reportReqForm.report_key} onChange={e => setReportReqForm(prev => ({ ...prev, report_key: e.target.value }))}>
                  <option value="">Select report...</option>
                  {REPORT_KEYS.map(key => (
                    <option key={key} value={key}>{key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())}</option>
                  ))}
                </select>
              </div>
            </div>
            {reportReqMsg && <p style={{ marginBottom: 12, fontSize: 13, color: reportReqMsg.startsWith('✓') ? 'var(--success)' : 'var(--warning)' }}>{reportReqMsg}</p>}
            <button className="btn btn-primary" disabled={!reportReqForm.user_id || !reportReqForm.report_key || reportReqSaving} onClick={submitReportRequest}>
              {reportReqSaving ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>

          <div style={{ marginBottom: 24 }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>Request History</h4>
            {reportAccessLoading ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>
            ) : reportAccessRequests.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No requests submitted yet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['User', 'Report', 'Requested By', 'Status', 'Date'].map(header => <th key={header} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>{header}</th>)}
                </tr></thead>
                <tbody>{reportAccessRequests.map((request, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 8px' }}>{request.user_name || request.user_id}</td>
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 12 }}>{request.report_key}</td>
                    <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{request.requested_by_name || '—'}</td>
                    <td style={{ padding: '6px 8px' }}><span style={{ color: request.status === 'approved' ? 'var(--success)' : request.status === 'rejected' ? 'var(--warning)' : 'var(--text-muted)' }}>{request.status}</span></td>
                    <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{request.created_at ? new Date(request.created_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>

          <div>
            <h4 style={{ margin: '0 0 12px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>Current Access</h4>
            {reportAccessList.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No report access granted to users in your organisation yet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['User', 'Email', 'Report', 'Granted'].map(header => <th key={header} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>{header}</th>)}
                </tr></thead>
                <tbody>{reportAccessList.map((row, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 8px' }}>{row.user_name}</td>
                    <td style={{ padding: '6px 8px', color: 'var(--text-muted)', fontSize: 12 }}>{row.email}</td>
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 12 }}>{row.report_key}</td>
                    <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{row.granted_at ? new Date(row.granted_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </div>
      )

    case 'change-approvals':
      return (
        <div style={{ padding: 24, maxWidth: 960 }}>
          <h2 style={{ marginBottom: 4 }}>Change Approvals</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>Review and action pending change approval requests for your organisation. Admins can approve or reject proposed changes submitted by users.</p>

          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <button className={`btn ${changeApprovalsTab === 'pending' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setChangeApprovalsTab('pending')}>Pending Approvals</button>
            <button className={`btn ${changeApprovalsTab === 'my-requests' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setChangeApprovalsTab('my-requests')}>My Requests</button>
          </div>

          {changeActionMsg && (
            <p style={{ marginBottom: 16, fontSize: 13, color: changeActionMsg.startsWith('✓') ? 'var(--success)' : 'var(--warning)' }}>{changeActionMsg}</p>
          )}

          {changeApprovalsTab === 'pending' && (
            <>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 500 }}>Filter by status:</label>
                {['pending', 'approved', 'rejected'].map(status => (
                  <button key={status} className={`btn btn-sm ${changeApprovalsStatusFilter === status ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setChangeApprovalsStatusFilter(status)}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>
              {changeApprovalsLoading ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>
              ) : changeApprovals.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No {changeApprovalsStatusFilter} requests.</p>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>ID</th><th>Requester</th><th>Entity</th><th>Field</th><th>Current Value</th><th>Proposed Value</th><th>Reason</th><th>Submitted</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changeApprovals.map(request => (
                      <tr key={request.id}>
                        <td>{request.id}</td>
                        <td>{request.requester_name || request.requester_email || request.requester_id}</td>
                        <td>{request.entity}{request.entity_id ? ` #${request.entity_id}` : ''}</td>
                        <td>{request.field_name}</td>
                        <td style={{ maxWidth: 140, wordBreak: 'break-word', fontSize: 12 }}>{request.current_value || '—'}</td>
                        <td style={{ maxWidth: 160, wordBreak: 'break-word', fontSize: 12 }}>{request.proposed_value}</td>
                        <td style={{ maxWidth: 180, fontSize: 12 }}>{request.reason || '—'}</td>
                        <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{request.created_at ? new Date(request.created_at).toLocaleDateString() : '—'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {request.status === 'pending' ? (
                            <>
                              <button className="btn btn-sm btn-primary" style={{ marginRight: 6 }} onClick={() => approveChangeRequest(request.id)}>Approve</button>
                              {changeRejectId === request.id ? (
                                <span style={{ display: 'inline-flex', gap: 4 }}>
                                  <input className="form-input" style={{ width: 160, padding: '2px 6px', fontSize: 12 }} placeholder="Rejection note..." value={changeRejectNote} onChange={e => setChangeRejectNote(e.target.value)} />
                                  <button className="btn btn-sm" style={{ background: 'var(--danger)', color: '#fff' }} onClick={() => rejectChangeRequest(request.id)}>Confirm</button>
                                  <button className="btn btn-sm btn-secondary" onClick={() => { setChangeRejectId(null); setChangeRejectNote('') }}>Cancel</button>
                                </span>
                              ) : (
                                <button className="btn btn-sm" style={{ background: 'var(--danger)', color: '#fff' }} onClick={() => { setChangeRejectId(request.id); setChangeRejectNote('') }}>Reject</button>
                              )}
                            </>
                          ) : (
                            <span style={{ fontSize: 12, fontWeight: 600, color: getChangeApprovalStatusColor(request.status) }}>{request.status.toUpperCase()}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {changeApprovalsTab === 'my-requests' && (
            <>
              <h4 style={{ margin: '0 0 12px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>Requests I Submitted</h4>
              {changeApprovalsLoading ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>
              ) : myChangeRequests.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No requests submitted yet.</p>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr><th>Entity</th><th>Field</th><th>Proposed Value</th><th>Reason</th><th>Status</th><th>Note</th><th>Submitted</th></tr>
                  </thead>
                  <tbody>
                    {myChangeRequests.map(request => (
                      <tr key={request.id}>
                        <td>{request.entity}{request.entity_id ? ` #${request.entity_id}` : ''}</td>
                        <td>{request.field_name}</td>
                        <td style={{ maxWidth: 180, wordBreak: 'break-word', fontSize: 12 }}>{request.proposed_value}</td>
                        <td style={{ maxWidth: 200, fontSize: 12 }}>{request.reason || '—'}</td>
                        <td><span style={{ fontWeight: 600, color: getChangeApprovalStatusColor(request.status) }}>{request.status.toUpperCase()}</span></td>
                        <td style={{ fontSize: 12 }}>{request.rejection_note || '—'}</td>
                        <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{request.created_at ? new Date(request.created_at).toLocaleDateString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      )

    case 'security-groups':
      return (
        <div style={{ padding: 24, maxWidth: 960 }}>
          <h2 style={{ marginBottom: 4 }}>Security Groups</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>Manage security groups for your organisation. Each group can have a set of privileges and a list of assigned users.</p>

          <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 20, marginBottom: 24 }}>
            <h4 style={{ margin: '0 0 14px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>
              {secGroupEditTarget ? `Edit Group: ${secGroupEditTarget.name}` : 'New Security Group'}
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, maxWidth: 560, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Group Name *</label>
                <input className="form-input" placeholder="e.g. Case Managers" value={secGroupForm.name} onChange={e => setSecGroupForm(prev => ({ ...prev, name: e.target.value }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Description</label>
                <input className="form-input" placeholder="Optional description" value={secGroupForm.description} onChange={e => setSecGroupForm(prev => ({ ...prev, description: e.target.value }))} />
              </div>
            </div>
            {secGroupMsg && <p style={{ marginBottom: 10, fontSize: 13, color: secGroupMsg.startsWith('✓') ? 'var(--success)' : 'var(--warning)' }}>{secGroupMsg}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" disabled={!secGroupForm.name || secGroupSaving} onClick={saveSecGroup}>
                {secGroupSaving ? 'Saving…' : secGroupEditTarget ? 'Save Changes' : 'Create Group'}
              </button>
              {secGroupEditTarget && (
                <button className="btn btn-secondary" onClick={() => { setSecGroupEditTarget(null); setSecGroupForm({ name: '', description: '' }); setSecGroupMsg('') }}>Cancel</button>
              )}
            </div>
          </div>

          {secGroupsLoading ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: secGroupSelected ? '1fr 1fr' : '1fr', gap: 20 }}>
              <div>
                <table className="admin-table">
                  <thead><tr><th>Name</th><th>Description</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {secGroups.length === 0 && (
                      <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No security groups yet. Create one above.</td></tr>
                    )}
                    {secGroups.map(group => (
                      <tr key={group.id} style={{ background: secGroupSelected?.id === group.id ? 'var(--primary-light, #f0f4ff)' : undefined }}>
                        <td><strong style={{ cursor: 'pointer', color: 'var(--primary)' }} onClick={() => loadSecGroupMembers(group)}>{group.name}</strong></td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{group.description || '—'}</td>
                        <td><StatusPill active={group.is_active} /></td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => { setSecGroupEditTarget(group); setSecGroupForm({ name: group.name, description: group.description || '' }); setSecGroupMsg('') }}>✏ Edit</button>
                            <button className="btn btn-danger" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => deactivateSecGroup(group)}>🗑</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {secGroupSelected && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h4 style={{ margin: 0 }}>Members - {secGroupSelected.name}</h4>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text-muted)' }} onClick={() => setSecGroupSelected(null)}>✕</button>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    <input className="form-input" style={{ flex: 1 }} type="number" placeholder="User ID to add..." value={secGroupAddUserId} onChange={e => setSecGroupAddUserId(e.target.value)} />
                    <button className="btn btn-primary" disabled={!secGroupAddUserId} onClick={addSecGroupUser}>Add</button>
                  </div>
                  {secGroupAddMsg && <p style={{ fontSize: 12, marginBottom: 10, color: secGroupAddMsg.startsWith('✓') ? 'var(--success)' : 'var(--warning)' }}>{secGroupAddMsg}</p>}
                  {secGroupMembersLoading ? (
                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading members...</p>
                  ) : (secGroupSelected.members || []).length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No members. Add a user by ID above.</p>
                  ) : (
                    <table className="admin-table">
                      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Remove</th></tr></thead>
                      <tbody>
                        {(secGroupSelected.members || []).map(member => (
                          <tr key={member.id}>
                            <td>{member.name}</td>
                            <td style={{ fontSize: 12 }}>{member.email}</td>
                            <td style={{ fontSize: 12 }}>{member.role}</td>
                            <td>
                              <button className="btn btn-danger" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => removeSecGroupUser(member.id)}>Remove</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )

    default:
      return null
  }
}
