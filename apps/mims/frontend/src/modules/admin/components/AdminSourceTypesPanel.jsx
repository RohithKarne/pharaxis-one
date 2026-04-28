import { useState, useEffect } from 'react'
import { SectionHeader, StatusPill } from './AdminShared'
import { confirm } from '../../../shared/utils/confirm'

export default function AdminSourceTypesPanel({ H, flash }) {
  const [sourceTypes, setSourceTypes] = useState([])
  const [srcForm, setSrcForm] = useState({ name: '' })

  useEffect(() => { loadSourceTypes() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadSourceTypes() {
    try { const d = await fetch('/api/admin/source-types', { headers: H }).then(r => r.json()); setSourceTypes(d.sources || []) }
    catch { setSourceTypes([]) }
  }

  async function createSrc(e) {
    e.preventDefault()
    const res = await fetch('/api/admin/source-types', { method: 'POST', headers: H, body: JSON.stringify(srcForm) })
    const d = await res.json()
    if (!res.ok) return flash(d.error, 'error')
    setSourceTypes(prev => [...prev, d])
    setSrcForm({ name: '' })
    flash('Source type created.')
  }

  async function toggleSrc(src) {
    if (!await confirm(`${src.is_active ? 'Deactivate' : 'Activate'} source type "${src.name}"?`)) return
    await fetch(`/api/admin/source-types/${src.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ name: src.name, is_active: !src.is_active }) })
    setSourceTypes(prev => prev.map(s => s.id === src.id ? { ...s, is_active: s.is_active ? 0 : 1 } : s))
    flash('Status updated.')
  }

  return (
    <>
      <SectionHeader title="Source Types" desc="Define how inquiries arrive (Email, Phone, Fax, CP Portal etc.)." />
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h3>Add Source Type</h3></div>
        <div className="card-body">
          <form onSubmit={createSrc} style={{ display: 'flex', gap: 10, marginBottom: 0 }}>
            <input className="form-control" placeholder="e.g. Email, Phone, Fax, CP Portal" value={srcForm.name} onChange={e => setSrcForm({ name: e.target.value })} required />
            <button className="btn btn-primary" type="submit" style={{ whiteSpace: 'nowrap' }}>+ Add</button>
          </form>
        </div>
      </div>
      <div className="card">
        <div className="card-header"><h3>Source Types ({sourceTypes.length})</h3></div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="admin-table">
            <thead><tr><th>Source Name</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {sourceTypes.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No source types yet.</td></tr>}
              {sourceTypes.map(s => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td><StatusPill active={s.is_active} /></td>
                  <td><button className="btn btn-outline" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => toggleSrc(s)}>{s.is_active ? 'Deactivate' : 'Activate'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
