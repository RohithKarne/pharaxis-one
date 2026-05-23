import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch.js'
import { useAdminTenant } from '../../utils/AdminTenantContext'

const API = '/api/admin/access-config'

// The two always-available default groups — protected from deletion.
const DEFAULT_GROUP_NAMES = ['Administrators', 'Platform Administrators']
const isDefaultGroup = g => DEFAULT_GROUP_NAMES.includes(g.name)

/**
 * Capability-Based Security Groups (Phase 1).
 * Replaces the legacy nav-key Group Security screen. Reads the live capability
 * catalog + group grants from the access_* framework and writes via
 * PUT /access-config/groups/:id/privileges. Capabilities are grouped by category
 * (collapsible parent) with child checkboxes; role templates pre-fill the set.
 */
export default function CapabilityGroupSecurity() {
  const { token } = useAuth()
  const { tenantId } = useAdminTenant()   // selected tenant (org) from the admin TENANT picker
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const orgQ = tenantId ? `?org_id=${tenantId}` : ''

  const [groups, setGroups] = useState([])
  const [catalog, setCatalog] = useState([])
  const [templates, setTemplates] = useState([])
  const [sodRules, setSodRules] = useState([])
  const [activeGroupId, setActiveGroupId] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [collapsed, setCollapsed] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [members, setMembers] = useState([])
  const [allUsers, setAllUsers] = useState([])
  const [memberBusy, setMemberBusy] = useState(false)
  const [addUserId, setAddUserId] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [createTemplateId, setCreateTemplateId] = useState('')
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [onlyGranted, setOnlyGranted] = useState(false)
  const [previewUserId, setPreviewUserId] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [effectiveAccess, setEffectiveAccess] = useState(null)
  const [historyEvents, setHistoryEvents] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  function flash(text, type = 'info') { setMsg({ text, type }); setTimeout(() => setMsg(null), 4000) }

  async function loadOverview() {
    setLoading(true)
    try {
      const res = await httpFetch(`${API}/overview${orgQ}`, { headers: H })
      const data = await res.json()
      setGroups(data.groups || [])
      const cat = await httpFetch(`${API}/catalog${orgQ}`, { headers: H })
      const catData = await cat.json()
      setCatalog(catData.privileges || [])
      setTemplates(catData.templates || [])
      const sod = await httpFetch(`${API}/sod-rules${orgQ}`, { headers: H })
      const sodData = await sod.json()
      setSodRules(sodData.rules || [])
      const usr = await httpFetch('/api/admin/users?limit=500', { headers: H })
      const usrData = await usr.json()
      setAllUsers(usrData.users || [])
    } catch { flash('Failed to load security groups.', 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { loadOverview() }, [tenantId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setPreviewUserId('')
    setEffectiveAccess(null)
    setHistoryEvents([])
  }, [tenantId])

  // Load the active group's members (group-scoped) from the security-groups API.
  async function loadMembers(groupId) {
    try {
      const res = await httpFetch(`/api/admin/security-groups/${groupId}${orgQ}`, { headers: H })
      const data = await res.json()
      if (res.ok) setMembers(data.members || [])
    } catch { /* member load is non-fatal; capability grid still works */ }
  }

  async function loadHistory(groupId) {
    if (!groupId) {
      setHistoryEvents([])
      return
    }
    setHistoryLoading(true)
    try {
      const res = await httpFetch(`/api/admin/security-groups/${groupId}/audit${orgQ}`, { headers: H })
      const data = await res.json()
      if (!res.ok) return flash(data.error || 'Could not load history.', 'error')
      setHistoryEvents(data.events || [])
    } catch {
      flash('Could not load history.', 'error')
    } finally {
      setHistoryLoading(false)
    }
  }

  function selectGroup(g) {
    setActiveGroupId(g.id)
    setSelected(new Set(g.privilege_keys || []))
    setAddUserId('')
    setMembers([])
    setHistoryEvents([])
    loadMembers(g.id)
    loadHistory(g.id)
  }

  async function addMember() {
    if (!activeGroupId || !addUserId) return
    setMemberBusy(true)
    try {
      const res = await httpFetch(`/api/admin/security-groups/${activeGroupId}/users`, {
        method: 'POST', headers: H, body: JSON.stringify({ user_id: Number(addUserId) }),
      })
      const data = await res.json()
      if (!res.ok) return flash(data.error || 'Could not add member.', 'error')
      setAddUserId('')
      flash('Member added.', 'success')
      loadMembers(activeGroupId)
      loadHistory(activeGroupId)
    } catch { flash('Could not add member.', 'error') }
    finally { setMemberBusy(false) }
  }

  async function removeMember(user) {
    if (!activeGroupId) return
    if (!window.confirm(`Remove ${user.name || user.email} from this group?`)) return
    setMemberBusy(true)
    try {
      const res = await httpFetch(`/api/admin/security-groups/${activeGroupId}/users/${user.id}`, {
        method: 'DELETE', headers: H,
      })
      const data = await res.json()
      if (!res.ok) return flash(data.error || 'Could not remove member.', 'error')
      flash('Member removed.', 'success')
      loadMembers(activeGroupId)
      loadHistory(activeGroupId)
    } catch { flash('Could not remove member.', 'error') }
    finally { setMemberBusy(false) }
  }

  // Open the create modal (replaces the legacy window.prompt).
  function createGroup() {
    setCreateName('')
    setCreateDesc('')
    setCreateTemplateId('')
    setShowCreate(true)
  }

  async function submitCreate() {
    const name = createName.trim()
    if (!name) return flash('Name is required.', 'error')
    setCreating(true)
    try {
      const res = await httpFetch('/api/admin/security-groups', {
        method: 'POST', headers: H,
        body: JSON.stringify({ name, description: createDesc.trim() || null, org_id: tenantId || null }),
      })
      const data = await res.json()
      if (!res.ok) return flash(data.error || 'Create failed.', 'error')

      // Optional "start from template": apply the chosen template's capabilities to the new group.
      const tpl = templates.find(t => String(t.id ?? t.name) === createTemplateId)
      const tplKeys = tpl ? (tpl.privilege_keys || tpl.privileges || []) : []
      if (data.id && tplKeys.length) {
        await httpFetch(`${API}/groups/${data.id}/privileges`, {
          method: 'PUT', headers: H,
          body: JSON.stringify({ privilege_keys: tplKeys, org_id: tenantId || null }),
        })
      }

      setShowCreate(false)
      flash(tpl ? `Group created from ${tpl.name}.` : 'Group created.', 'success')
      await loadOverview()
      // Select the new group immediately (don't wait for the user to click it).
      if (data.id) {
        setActiveGroupId(data.id)
        setSelected(new Set(tplKeys))
        setAddUserId('')
        setMembers([])
        loadMembers(data.id)
        loadHistory(data.id)
      }
    } catch { flash('Create failed.', 'error') }
    finally { setCreating(false) }
  }

  async function deleteGroup(g, e) {
    e.stopPropagation()
    if (!window.confirm(`Remove security group "${g.name}"?`)) return
    try {
      const res = await httpFetch(`/api/admin/security-groups/${g.id}${orgQ}`, { method: 'DELETE', headers: H })
      const data = await res.json()
      if (!res.ok) return flash(data.error || 'Delete failed.', 'error')
      flash('Group removed.', 'success')
      if (activeGroupId === g.id) setActiveGroupId(null)
      loadOverview()
    } catch { flash('Delete failed.', 'error') }
  }

  // Real, ACTIVE groups only (is_active is a boolean from the API; soft-deleted
  // groups have is_active=false). Templates belong in the "Apply template" dropdown.
  const visibleGroups = groups.filter(g => !g.is_template && g.is_active)

  // Catalog grouped by category → list of capabilities.
  const byCategory = useMemo(() => {
    const m = new Map()
    for (const p of catalog) {
      if (!m.has(p.category)) m.set(p.category, [])
      m.get(p.category).push(p)
    }
    return Array.from(m.entries()).map(([category, items]) => ({ category, items }))
  }, [catalog])

  const filteredByCategory = useMemo(() => {
    const query = search.trim().toLowerCase()
    return byCategory
      .map(({ category, items }) => ({
        category,
        items: items.filter((p) => {
          const matchesSearch = !query
            || p.label.toLowerCase().includes(query)
            || p.privilege_key.toLowerCase().includes(query)
          const matchesGranted = !onlyGranted || selected.has(p.privilege_key)
          return matchesSearch && matchesGranted
        }),
      }))
      .filter(({ items }) => items.length > 0)
  }, [byCategory, onlyGranted, search, selected])

  const catalogByKey = useMemo(
    () => new Map(catalog.map((p) => [p.privilege_key, p])),
    [catalog]
  )

  const activeConflicts = useMemo(() => (
    (sodRules || [])
      .filter((rule) => (
        rule.is_active
        && selected.has(rule.first_privilege)
        && selected.has(rule.conflicting_privilege)
      ))
      .map((rule) => {
        const left = catalogByKey.get(rule.first_privilege)
        const right = catalogByKey.get(rule.conflicting_privilege)
        return {
          ...rule,
          firstLabel: left?.label || rule.first_privilege,
          secondLabel: right?.label || rule.conflicting_privilege,
        }
      })
  ), [catalogByKey, selected, sodRules])

  const conflictedPrivilegeKeys = useMemo(() => {
    const keys = new Set()
    activeConflicts.forEach((rule) => {
      keys.add(rule.first_privilege)
      keys.add(rule.conflicting_privilege)
    })
    return keys
  }, [activeConflicts])

  const toggle = key => setSelected(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })
  const toggleCategory = (items, on) => setSelected(prev => {
    const next = new Set(prev)
    items.forEach(p => on ? next.add(p.privilege_key) : next.delete(p.privilege_key))
    return next
  })
  const applyTemplate = tpl => {
    const keys = tpl.privilege_keys || tpl.privileges || []
    setSelected(new Set(keys)); flash(`Applied template: ${tpl.name}`, 'info')
  }

  async function save() {
    if (!activeGroupId) return
    setSaving(true)
    try {
      const res = await httpFetch(`${API}/groups/${activeGroupId}/privileges`, {
        method: 'PUT', headers: H, body: JSON.stringify({ privilege_keys: Array.from(selected), org_id: tenantId || null }),
      })
      const data = await res.json()
      if (!res.ok) return flash(data.error || 'Save failed.', 'error')
      flash('Capabilities saved.', 'success')
      loadOverview()
      loadHistory(activeGroupId)
    } catch { flash('Save failed.', 'error') }
    finally { setSaving(false) }
  }

  async function previewEffectiveAccess() {
    if (!previewUserId) return
    setPreviewLoading(true)
    try {
      const res = await httpFetch(`${API}/users/${previewUserId}/effective-access${orgQ}`, { headers: H })
      const data = await res.json()
      if (!res.ok) return flash(data.error || 'Failed to load effective access.', 'error')
      setEffectiveAccess(data)
    } catch {
      flash('Failed to load effective access.', 'error')
    } finally {
      setPreviewLoading(false)
    }
  }

  const activeGroup = groups.find(g => g.id === activeGroupId)

  // Users not already in the active group — candidates for the "add member" picker.
  const availableUsers = useMemo(() => {
    const memberIds = new Set(members.map(m => m.id))
    return allUsers.filter(u => !memberIds.has(u.id))
  }, [allUsers, members])

  const effectiveAccessByCategory = useMemo(() => {
    if (!effectiveAccess?.privileges?.length) return []
    const catalogByKey = new Map(catalog.map((p) => [p.privilege_key, p]))
    const grouped = new Map()
    const uncatalogued = []

    effectiveAccess.privileges.forEach((key) => {
      const match = catalogByKey.get(key)
      if (!match) {
        uncatalogued.push({ privilege_key: key, label: key, category: 'Uncatalogued', is_sensitive: false })
        return
      }
      if (!grouped.has(match.category)) grouped.set(match.category, [])
      grouped.get(match.category).push(match)
    })

    const categories = Array.from(grouped.entries()).map(([category, items]) => ({ category, items }))
    if (uncatalogued.length) categories.push({ category: 'Uncatalogued', items: uncatalogued })
    return categories
  }, [catalog, effectiveAccess])

  const previewUser = useMemo(
    () => allUsers.find((u) => String(u.id) === previewUserId) || effectiveAccess?.user || null,
    [allUsers, effectiveAccess, previewUserId]
  )

  const formatHistoryDate = (value) => {
    if (!value) return 'Unknown time'
    try {
      return new Date(value).toLocaleString()
    } catch {
      return String(value)
    }
  }

  const humanizeHistoryEvent = (event) => {
    const details = event?.details || {}
    switch (event?.action) {
      case 'UPDATE_PRIVILEGES': {
        const keys = Array.isArray(details.privilege_keys) ? details.privilege_keys : []
        if (!keys.length) return 'Updated capability grants.'
        const labels = keys
          .slice(0, 5)
          .map((key) => catalogByKey.get(key)?.label || key)
          .join(', ')
        const more = keys.length > 5 ? ` +${keys.length - 5} more` : ''
        return `Updated capabilities (${keys.length} granted): ${labels}${more}.`
      }
      case 'ADD_USER':
        return `Added member ${details.user_email || details.user_name || `user #${details.user_id}`}.`
      case 'REMOVE_USER':
        return `Removed member ${details.user_email || details.user_name || `user #${details.user_id}`}.`
      case 'CREATE':
        return `Created group${details.name ? ` "${details.name}"` : ''}.`
      case 'UPDATE': {
        const parts = []
        if (details.name) parts.push(`name set to "${details.name}"`)
        if (details.description !== undefined) parts.push('description updated')
        if (details.is_active !== undefined) parts.push(details.is_active ? 'group activated' : 'group deactivated')
        return parts.length ? `Updated group: ${parts.join(', ')}.` : 'Updated group settings.'
      }
      case 'DELETE':
        return `Deleted group${details.name ? ` "${details.name}"` : ''}.`
      case 'CLONE':
        return `Cloned group${details.name ? ` as "${details.name}"` : ''}${details.source_id ? ` from group #${details.source_id}` : ''}.`
      default:
        return 'Recorded a security group change.'
    }
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700 }}>Group Security — Capabilities</h2>
      {msg && <div style={{ marginBottom: 12, fontSize: 13, color: msg.type === 'error' ? 'var(--danger,#c0392b)' : 'var(--success,#1e7e34)' }}>{msg.text}</div>}

      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => !creating && setShowCreate(false)}>
          <div style={{ background: 'var(--surface,#fff)', borderRadius: 10, padding: 20, width: 420, maxWidth: '90vw', boxShadow: '0 10px 40px rgba(0,0,0,0.25)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>New Security Group</div>

            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Name<span style={{ color: 'var(--danger,#c0392b)' }}> *</span></label>
            <input className="form-control" autoFocus value={createName} onChange={e => setCreateName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && createName.trim() && !creating) submitCreate()
                if (e.key === 'Escape' && !creating) setShowCreate(false)
              }}
              placeholder="e.g. Regional Reviewers" style={{ width: '100%', marginBottom: 12 }} />

            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Description</label>
            <textarea className="form-control" value={createDesc} onChange={e => setCreateDesc(e.target.value)}
              placeholder="Optional" rows={2} style={{ width: '100%', marginBottom: 12, resize: 'vertical' }} />

            {templates.length > 0 && (
              <>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Start from template</label>
                <select className="form-control" value={createTemplateId} onChange={e => setCreateTemplateId(e.target.value)}
                  style={{ width: '100%', marginBottom: 4 }}>
                  <option value="">Empty group (no capabilities)</option>
                  {templates.map(t => <option key={t.id ?? t.name} value={String(t.id ?? t.name)}>{t.name}</option>)}
                </select>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>Capabilities can be edited after creation.</div>
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)} disabled={creating}>Cancel</button>
              <button className="btn btn-primary" onClick={submitCreate} disabled={creating || !createName.trim()}>{creating ? 'Creating…' : 'Create Group'}</button>
            </div>
          </div>
        </div>
      )}

      {loading ? <div style={{ color: 'var(--text-muted)' }}>Loading…</div> : (
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          {/* Group list */}
          <div style={{ width: 240, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Security Groups</span>
              <button className="btn btn-sm btn-primary" onClick={createGroup}>+ New</button>
            </div>
            {visibleGroups.map(g => (
              <div key={g.id} onClick={() => selectGroup(g)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
                  padding: '8px 10px', borderRadius: 6, marginBottom: 4, cursor: 'pointer', fontSize: 13,
                  background: g.id === activeGroupId ? 'var(--primary,#2563eb)' : 'var(--bg-subtle,#f6f7f9)',
                  color: g.id === activeGroupId ? '#fff' : 'var(--text-primary)' }}>
                <span>{g.name}{isDefaultGroup(g) ? <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 4 }}>(default)</span> : null}<span style={{ fontSize: 11, opacity: 0.7, marginLeft: 4 }}>· {(g.privilege_keys || []).length}</span></span>
                {!isDefaultGroup(g) && (
                  <span onClick={e => deleteGroup(g, e)} title="Remove group"
                    style={{ fontSize: 12, opacity: 0.6, padding: '0 4px' }}>✕</span>
                )}
              </div>
            ))}
            {!visibleGroups.length && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No groups yet. Click <strong>+ New</strong> to create one.</div>}
          </div>

          {/* Capability grid */}
          <div style={{ flex: 1 }}>
            {!activeGroup ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 14, paddingTop: 40, textAlign: 'center' }}>
                Select a security group to configure its capabilities.
              </div>
            ) : (
              <>
	                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{activeGroup.name}
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>{selected.size} capabilities</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <input
                      className="form-control"
                      type="text"
                      placeholder="Search capabilities…"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      style={{ width: 240, fontSize: 12 }}
                    />
                    <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                      <input
                        type="checkbox"
                        checked={onlyGranted}
                        onChange={e => setOnlyGranted(e.target.checked)}
                      />
                      Show only granted
                    </label>
                    {templates.length > 0 && (
                      <select className="form-control" style={{ width: 'auto', fontSize: 12 }} defaultValue=""
                        onChange={e => { const t = templates.find(x => String(x.id ?? x.name) === e.target.value); if (t) applyTemplate(t) }}>
                        <option value="">Apply template…</option>
                        {templates.map(t => <option key={t.id ?? t.name} value={String(t.id ?? t.name)}>{t.name}</option>)}
                      </select>
                    )}
                    <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
	                  </div>
		                </div>

		                {activeConflicts.length > 0 && (
		                  <div style={{
		                    border: '1px solid #f5c2c7',
		                    background: '#fff7ed',
		                    borderRadius: 8,
		                    padding: '12px 14px',
		                    marginBottom: 14,
		                  }}>
		                    <div style={{ fontSize: 13, fontWeight: 700, color: '#9a3412', marginBottom: 8 }}>
		                      Segregation of Duties conflicts detected
		                    </div>
		                    <div style={{ display: 'grid', gap: 6 }}>
		                      {activeConflicts.map((rule, index) => {
		                        const isBlock = String(rule.severity || '').toLowerCase() === 'block'
		                        return (
		                          <div key={`${rule.rule_key || `${rule.first_privilege}-${rule.conflicting_privilege}`}-${index}`} style={{
		                            fontSize: 12,
		                            color: isBlock ? '#991b1b' : '#92400e',
		                            background: isBlock ? '#fef2f2' : '#fffbeb',
		                            border: `1px solid ${isBlock ? '#fecaca' : '#fde68a'}`,
		                            borderRadius: 6,
		                            padding: '8px 10px',
		                          }}>
		                            <strong>{isBlock ? 'Block' : 'Warning'}:</strong> {rule.firstLabel} <span style={{ color: 'var(--text-muted)' }}>({rule.first_privilege})</span> conflicts with {rule.secondLabel} <span style={{ color: 'var(--text-muted)' }}>({rule.conflicting_privilege})</span>.
		                            {isBlock ? ' Save will be rejected by the server.' : ' Advisory only; save is allowed.'}
		                          </div>
		                        )
		                      })}
		                    </div>
		                  </div>
		                )}

		                <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 14, background: 'var(--surface)' }}>
	                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', borderBottom: effectiveAccess ? '1px solid var(--border)' : 'none', flexWrap: 'wrap' }}>
	                    <div style={{ fontWeight: 700, fontSize: 13 }}>
	                      Preview effective access
	                      {effectiveAccess?.privileges ? <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>{effectiveAccess.privileges.length} granted</span> : null}
	                    </div>
	                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
	                      <select
	                        className="form-control"
	                        style={{ width: 'auto', minWidth: 280, fontSize: 12 }}
	                        value={previewUserId}
	                        onChange={e => setPreviewUserId(e.target.value)}
	                        disabled={previewLoading}
	                      >
	                        <option value="">Choose user…</option>
	                        {allUsers.map(u => (
	                          <option key={u.id} value={String(u.id)}>{u.name || u.email}{u.email && u.name ? ` · ${u.email}` : ''}</option>
	                        ))}
	                      </select>
	                      <button className="btn btn-sm btn-outline" onClick={previewEffectiveAccess} disabled={previewLoading || !previewUserId}>
	                        {previewLoading ? 'Loading…' : 'Preview'}
	                      </button>
	                    </div>
	                  </div>
	                  {effectiveAccess && (
	                    <div style={{ padding: '10px 14px 12px' }}>
	                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
	                        {previewUser?.name || previewUser?.email || effectiveAccess.user?.email}
	                        {previewUser?.email && previewUser?.name ? <span style={{ marginLeft: 6 }}>· {previewUser.email}</span> : null}
	                        {(previewUser?.role || effectiveAccess.user?.role_at_org || effectiveAccess.user?.role) ? (
	                          <span style={{ marginLeft: 6 }}>· {effectiveAccess.user?.role_at_org || previewUser?.role || effectiveAccess.user?.role}</span>
	                        ) : null}
	                      </div>
	                      {!effectiveAccessByCategory.length ? (
	                        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No effective capabilities found for this user in the selected tenant.</div>
	                      ) : (
	                        effectiveAccessByCategory.map(({ category, items }) => (
	                          <div key={`preview-${category}`} style={{ marginBottom: 10 }}>
	                            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
	                              {category}
	                              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>{items.length}</span>
	                            </div>
	                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '4px 16px' }}>
	                              {items.map((p) => (
	                                <label key={`preview-${p.privilege_key}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '2px 0', color: 'var(--text-primary)' }}>
	                                  <input type="checkbox" checked readOnly disabled />
	                                  <span>{p.label}</span>
	                                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({p.privilege_key})</span>
	                                  {p.is_sensitive ? <span title="Sensitive capability" style={{ color: '#b8860b', fontSize: 11 }}>⚠</span> : null}
	                                </label>
	                              ))}
	                            </div>
	                          </div>
	                        ))
	                      )}
	                    </div>
	                  )}
	                </div>

	                {/* Members — assign/remove users for this group (#1). */}
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 14, background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: members.length ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>
                      Members
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>{members.length}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <select className="form-control" style={{ width: 'auto', fontSize: 12 }} value={addUserId}
                        onChange={e => setAddUserId(e.target.value)} disabled={memberBusy}>
                        <option value="">Add member…</option>
                        {availableUsers.map(u => (
                          <option key={u.id} value={String(u.id)}>{u.name || u.email}{u.email && u.name ? ` · ${u.email}` : ''}</option>
                        ))}
                      </select>
                      <button className="btn btn-sm btn-primary" onClick={addMember} disabled={memberBusy || !addUserId}>Add</button>
                    </div>
                  </div>
                  {members.length > 0 && (
                    <div style={{ padding: '6px 14px 10px' }}>
                      {members.map(m => (
                        <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '4px 0', fontSize: 13 }}>
                          <span>{m.name || m.email}
                            {m.role ? <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>· {m.role}</span> : null}
                            {m.is_active === 0 || m.is_active === false ? <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>(inactive)</span> : null}
                          </span>
                          <button className="btn btn-sm" onClick={() => removeMember(m)} disabled={memberBusy}
                            style={{ fontSize: 12, color: 'var(--danger,#c0392b)' }}>Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {!members.length && (
                    <div style={{ padding: '0 14px 12px', color: 'var(--text-muted)', fontSize: 13 }}>No members yet. Add a user above.</div>
                  )}
                </div>

                <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 14, background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: (historyLoading || historyEvents.length) ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>
                      History
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>{historyEvents.length}</span>
                    </div>
                    <button className="btn btn-sm btn-outline" onClick={() => loadHistory(activeGroupId)} disabled={historyLoading}>
                      {historyLoading ? 'Loading…' : 'Refresh'}
                    </button>
                  </div>
                  {historyLoading ? (
                    <div style={{ padding: '0 14px 12px', color: 'var(--text-muted)', fontSize: 13 }}>Loading history…</div>
                  ) : historyEvents.length > 0 ? (
                    <div style={{ padding: '8px 14px 12px' }}>
                      {historyEvents.map((event, index) => (
                        <div key={`${event.created_at || 'event'}-${event.action || 'action'}-${index}`} style={{
                          display: 'grid',
                          gridTemplateColumns: '180px 180px 140px 1fr',
                          gap: 12,
                          fontSize: 12,
                          padding: '8px 0',
                          borderBottom: index < historyEvents.length - 1 ? '1px solid var(--border)' : 'none',
                        }}>
                          <div style={{ color: 'var(--text-muted)' }}>{formatHistoryDate(event.created_at)}</div>
                          <div style={{ fontWeight: 600 }}>{event.user_name || 'System'}</div>
                          <div style={{ color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                            {(event.action || '').toLowerCase().replaceAll('_', ' ')}
                          </div>
                          <div>{humanizeHistoryEvent(event)}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: '0 14px 12px', color: 'var(--text-muted)', fontSize: 13 }}>No history available for this group yet.</div>
                  )}
                </div>

                {!filteredByCategory.length && (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', color: 'var(--text-muted)', fontSize: 13, background: 'var(--surface)', marginBottom: 10 }}>
                    No capabilities match the current filters.
                  </div>
                )}

	                {filteredByCategory.map(({ category, items }) => {
	                  const allOn = items.every(p => selected.has(p.privilege_key))
	                  const isCollapsed = collapsed[category]
	                  const hasCategoryConflict = items.some((p) => conflictedPrivilegeKeys.has(p.privilege_key))
	                  return (
	                    <div key={category} style={{
                        border: `1px solid ${hasCategoryConflict ? '#f5c2c7' : 'var(--border)'}`,
                        borderRadius: 8,
                        marginBottom: 10,
                        background: 'var(--surface)',
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', cursor: 'pointer' }}
                        onClick={() => setCollapsed(c => ({ ...c, [category]: !c[category] }))}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>
                          <span style={{ marginRight: 6, opacity: 0.5 }}>{isCollapsed ? '▸' : '▾'}</span>{category}
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>
                            {items.filter(p => selected.has(p.privilege_key)).length}/{items.length}
                          </span>
                        </div>
                        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={allOn} onChange={e => toggleCategory(items, e.target.checked)} /> Select all
                        </label>
                      </div>
	                      {!isCollapsed && (
	                        <div style={{ padding: '4px 14px 12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '4px 16px' }}>
	                          {items.map(p => {
                              const isConflicted = conflictedPrivilegeKeys.has(p.privilege_key)
                              const conflictSeverity = activeConflicts.find((rule) => (
                                rule.first_privilege === p.privilege_key || rule.conflicting_privilege === p.privilege_key
                              ))?.severity
                              const isBlockConflict = String(conflictSeverity || '').toLowerCase() === 'block'
                              return (
	                            <label key={p.privilege_key} style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                fontSize: 13,
                                padding: '4px 6px',
                                borderRadius: 6,
                                color: isConflicted ? (isBlockConflict ? '#991b1b' : '#92400e') : 'inherit',
                                background: isConflicted ? (isBlockConflict ? '#fef2f2' : '#fffbeb') : 'transparent',
                              }}>
	                              <input type="checkbox" checked={selected.has(p.privilege_key)} onChange={() => toggle(p.privilege_key)} />
	                              <span>{p.label}</span>
                                {isConflicted ? <span title={isBlockConflict ? 'Block conflict' : 'Warning conflict'} style={{ color: isBlockConflict ? '#dc2626' : '#d97706', fontSize: 11 }}>⚠</span> : null}
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({p.privilege_key})</span>
	                              {p.is_sensitive ? <span title="Sensitive capability" style={{ color: '#b8860b', fontSize: 11 }}>⚠</span> : null}
	                            </label>
	                          )})}
	                        </div>
	                      )}
	                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
