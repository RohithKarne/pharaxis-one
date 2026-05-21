import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../../../shared/context/AuthContext'
import { httpFetch } from '../../../../shared/api/httpFetch.js'

const API = '/api/admin/access-config'

/**
 * Capability-Based Security Groups (Phase 1).
 * Replaces the legacy nav-key Group Security screen. Reads the live capability
 * catalog + group grants from the access_* framework and writes via
 * PUT /access-config/groups/:id/privileges. Capabilities are grouped by category
 * (collapsible parent) with child checkboxes; role templates pre-fill the set.
 */
export default function CapabilityGroupSecurity() {
  const { token } = useAuth()
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  const [groups, setGroups] = useState([])
  const [catalog, setCatalog] = useState([])
  const [templates, setTemplates] = useState([])
  const [activeGroupId, setActiveGroupId] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [collapsed, setCollapsed] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  function flash(text, type = 'info') { setMsg({ text, type }); setTimeout(() => setMsg(null), 4000) }

  async function loadOverview() {
    setLoading(true)
    try {
      const res = await httpFetch(`${API}/overview`, { headers: H })
      const data = await res.json()
      setGroups(data.groups || [])
      const cat = await httpFetch(`${API}/catalog`, { headers: H })
      const catData = await cat.json()
      setCatalog(catData.privileges || [])
      setTemplates(catData.templates || [])
    } catch { flash('Failed to load security groups.', 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { loadOverview() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function selectGroup(g) {
    setActiveGroupId(g.id)
    setSelected(new Set(g.privilege_keys || []))
  }

  // Catalog grouped by category → list of capabilities.
  const byCategory = useMemo(() => {
    const m = new Map()
    for (const p of catalog) {
      if (!m.has(p.category)) m.set(p.category, [])
      m.get(p.category).push(p)
    }
    return Array.from(m.entries()).map(([category, items]) => ({ category, items }))
  }, [catalog])

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
        method: 'PUT', headers: H, body: JSON.stringify({ privilege_keys: Array.from(selected) }),
      })
      const data = await res.json()
      if (!res.ok) return flash(data.error || 'Save failed.', 'error')
      flash('Capabilities saved.', 'success'); loadOverview()
    } catch { flash('Save failed.', 'error') }
    finally { setSaving(false) }
  }

  const activeGroup = groups.find(g => g.id === activeGroupId)

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700 }}>Group Security — Capabilities</h2>
      {msg && <div style={{ marginBottom: 12, fontSize: 13, color: msg.type === 'error' ? 'var(--danger,#c0392b)' : 'var(--success,#1e7e34)' }}>{msg.text}</div>}

      {loading ? <div style={{ color: 'var(--text-muted)' }}>Loading…</div> : (
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          {/* Group list */}
          <div style={{ width: 240, flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--text-secondary)' }}>Security Groups</div>
            {groups.map(g => (
              <div key={g.id} onClick={() => selectGroup(g)}
                style={{ padding: '8px 10px', borderRadius: 6, marginBottom: 4, cursor: 'pointer', fontSize: 13,
                  background: g.id === activeGroupId ? 'var(--primary,#2563eb)' : 'var(--bg-subtle,#f6f7f9)',
                  color: g.id === activeGroupId ? '#fff' : 'var(--text-primary)' }}>
                {g.name} {g.is_template ? <span style={{ fontSize: 10, opacity: 0.7 }}>(template)</span> : null}
                <span style={{ fontSize: 11, opacity: 0.7, marginLeft: 4 }}>· {(g.privilege_keys || []).length}</span>
              </div>
            ))}
            {!groups.length && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No groups.</div>}
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
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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

                {byCategory.map(({ category, items }) => {
                  const allOn = items.every(p => selected.has(p.privilege_key))
                  const isCollapsed = collapsed[category]
                  return (
                    <div key={category} style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 10, background: 'var(--surface)' }}>
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
                          {items.map(p => (
                            <label key={p.privilege_key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '3px 0' }}>
                              <input type="checkbox" checked={selected.has(p.privilege_key)} onChange={() => toggle(p.privilege_key)} />
                              {p.label}
                              {p.is_sensitive ? <span title="Sensitive capability" style={{ color: '#b8860b', fontSize: 11 }}>⚠</span> : null}
                            </label>
                          ))}
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
