/**
 * SavedViews.jsx — Saved Views dropdown for admin list screens.
 *
 * Props:
 *   screenKey   : string  (e.g. "users", "organizations")
 *   currentFilter: object  (the filter combo to save)
 *   onApply     : (filter) => void  (called when a view is loaded)
 *
 * Renders a dropdown of the user's saved views + Save Current / Manage actions.
 */

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { httpFetch } from '../api/httpFetch.js'

export default function SavedViews({ screenKey, currentFilter, onApply }) {
  const { token } = useAuth()
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  const [views, setViews] = useState([])
  const [showSave, setShowSave] = useState(false)
  const [name, setName] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await httpFetch(`/api/admin/user-preferences/views?screen_key=${encodeURIComponent(screenKey)}`, { headers: H })
      const d = await r.json()
      setViews(d.views || [])
    } catch { setViews([]) }
  }, [screenKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await httpFetch('/api/admin/user-preferences/views', {
        method: 'POST', headers: H,
        body: JSON.stringify({ screen_key: screenKey, view_name: name.trim(), filter_json: currentFilter, is_default: isDefault }),
      })
      setShowSave(false); setName(''); setIsDefault(false)
      load()
    } finally { setSaving(false) }
  }

  async function del(id) {
    if (!window.confirm('Delete this saved view?')) return
    try {
      await httpFetch(`/api/admin/user-preferences/views/${id}`, { method: 'DELETE', headers: H })
      load()
    } catch {}
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <select
        style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, background: 'var(--surface)' }}
        onChange={e => {
          const v = views.find(x => String(x.id) === e.target.value)
          if (v) onApply(v.filter_json)
        }}
        defaultValue=""
      >
        <option value="">📁 Saved Views ({views.length})</option>
        {views.map(v => (
          <option key={v.id} value={v.id}>
            {v.is_default ? '★ ' : ''}{v.view_name}
          </option>
        ))}
      </select>
      <button
        style={{ padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', fontSize: 11, cursor: 'pointer' }}
        onClick={() => setShowSave(true)}
        title="Save current filter as a view"
      >💾</button>
      {views.length > 0 && (
        <details style={{ position: 'relative' }}>
          <summary style={{ cursor: 'pointer', listStyle: 'none', padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }}>⋮</summary>
          <div style={{ position: 'absolute', right: 0, top: '110%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 8, minWidth: 220, zIndex: 50, boxShadow: '0 8px 24px rgba(0,0,0,.12)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Manage</div>
            {views.map(v => (
              <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 12 }}>
                <span>{v.view_name}</span>
                <button style={{ background: 'none', border: 'none', color: '#c00', cursor: 'pointer', fontSize: 11 }} onClick={() => del(v.id)}>Delete</button>
              </div>
            ))}
          </div>
        </details>
      )}

      {showSave && (
        <div onClick={e => e.target === e.currentTarget && setShowSave(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--surface)', borderRadius: 10, padding: 20, width: 360, boxShadow: '0 16px 48px rgba(0,0,0,.2)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Save Current View</div>
            <input
              autoFocus
              placeholder="View name (e.g. Active admins)"
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ width: '100%', padding: 8, border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, marginBottom: 10 }}
            />
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, marginBottom: 12 }}>
              <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} />
              Set as my default view for this screen
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setShowSave(false)} style={{ padding: '7px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
              <button onClick={save} disabled={saving || !name.trim()} style={{ padding: '7px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: (saving || !name.trim()) ? 0.5 : 1 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
