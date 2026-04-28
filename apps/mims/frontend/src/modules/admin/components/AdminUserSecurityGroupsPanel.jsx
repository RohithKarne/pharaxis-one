import { useEffect, useState } from 'react'
import { confirm } from '../../../shared/utils/confirm'
import { SectionHeader } from './AdminShared'
import { httpFetch } from '../../../shared/api/httpFetch.js'

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

export default function AdminUserSecurityGroupsPanel({ H, flash }) {
  const [accessUsers, setAccessUsers] = useState([])
  const [legacySecGroups, setLegacySecGroups] = useState([])
  const [legacySecGroupUsers, setLegacySecGroupUsers] = useState([])
  const [selectedLegacySecGroup, setSelectedLegacySecGroup] = useState(null)
  const [legacySecGroupTab, setLegacySecGroupTab] = useState('menu')
  const [legacySecGroupLoading, setLegacySecGroupLoading] = useState(false)
  const [legacySecGroupForm, setLegacySecGroupForm] = useState({ name: '', description: '', permissions: {} })
  const [legacySecGroupAddUserVal, setLegacySecGroupAddUserVal] = useState('')
  const [legacySecGroupSaving, setLegacySecGroupSaving] = useState(false)

  useEffect(() => {
    loadLegacySecGroups()
    loadAccessUsers()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAccessUsers() {
    try {
      const data = await httpFetch('/api/admin/users', { headers: H }).then(r => r.json())
      setAccessUsers(data.users || [])
    } catch {
      setAccessUsers([])
    }
  }

  async function loadLegacySecGroups() {
    setLegacySecGroupLoading(true)
    try {
      const data = await httpFetch('/api/admin/security-groups', { headers: H }).then(r => r.json())
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
      const data = await httpFetch(`/api/admin/security-groups/${group.id}`, { headers: H }).then(r => r.json())
      setLegacySecGroupUsers(data.members || [])
    } catch {
      setLegacySecGroupUsers([])
    }
  }

  async function createLegacySecGroup() {
    const response = await httpFetch('/api/admin/security-groups', {
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
      const response = await httpFetch(`/api/admin/security-groups/${selectedLegacySecGroup.id}`, {
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
    if (!await confirm(`Delete security group "${selectedLegacySecGroup.name}"?`)) return
    const response = await httpFetch(`/api/admin/security-groups/${selectedLegacySecGroup.id}`, { method: 'DELETE', headers: H })
    const data = await response.json()
    if (!response.ok) return flash(formatSecGroupDependencyMessage(data), 'error')
    setSelectedLegacySecGroup(null)
    setLegacySecGroupUsers([])
    await loadLegacySecGroups()
    flash('Group deleted.')
  }

  async function addUserToLegacySecGroup() {
    if (!legacySecGroupAddUserVal || !selectedLegacySecGroup) return
    const response = await httpFetch(`/api/admin/security-groups/${selectedLegacySecGroup.id}/users`, {
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
    if (!await confirm('Remove this user from selected security group?')) return
    const response = await httpFetch(`/api/admin/security-groups/${selectedLegacySecGroup.id}/users/${userId}`, { method: 'DELETE', headers: H })
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
