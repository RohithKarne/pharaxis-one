import { useEffect, useState } from 'react'
import { confirm } from '../../../shared/utils/confirm'
import { StatusPill } from './AdminShared'

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

export default function AdminSecurityGroupsPanel({ H, flash }) {
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

  useEffect(() => { loadSecGroups() }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!await confirm(`Deactivate group ${group.name}?`)) return
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
                        <button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 9px' }} onClick={async () => {
                          try {
                            const res = await fetch(`/api/admin/security-groups/${group.id}/clone`, { method: 'POST', headers: H })
                            const d = await res.json()
                            if (!res.ok) return flash(d.error || 'Clone failed.', 'error')
                            loadSecGroups()
                            flash(`Security group cloned as "${d.name}".`)
                          } catch { flash('Clone failed.', 'error') }
                        }}>⧉ Clone</button>
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
}
