import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'

function formatTherapeuticAreas(val) {
  if (!val) return '—'
  try {
    const arr = typeof val === 'string' ? JSON.parse(val) : val
    return Array.isArray(arr) ? arr.join(', ') : String(val)
  } catch { return String(val) }
}

export default function MSLPage() {
  const { clientId }  = useParams()
  const [msls, setMSLs]     = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm]       = useState({ name: '', title: '', specialty: '', region: '', territory: '', email: '', phone: '' })
  const [saving, setSaving]   = useState(false)

  useEffect(() => { loadMSLs() }, [clientId])

  async function loadMSLs() {
    setLoading(true)
    const res = await fetch(`/api/admin/msls/${clientId}`, { headers: adminHeaders() })
    const d   = await res.json()
    setMSLs(d.msls || [])
    setLoading(false)
  }

  async function handleAdd(e) {
    e.preventDefault(); setSaving(true)
    await fetch(`/api/admin/msls/${clientId}`, { method: 'POST', headers: adminHeaders(), body: JSON.stringify(form) })
    setSaving(false); setShowAdd(false); setForm({ name: '', title: '', specialty: '', region: '', territory: '', email: '', phone: '' })
    loadMSLs()
  }

  async function deactivate(id) {
    await fetch(`/api/admin/msls/${clientId}/${id}`, { method: 'DELETE', headers: adminHeaders() })
    loadMSLs()
  }

  return (
    <AdminLayout title="MSL Directory">
      <div className="cp-section-header">
        <h2>Medical Science Liaisons</h2>
        <button className="cp-btn cp-btn-primary" onClick={() => setShowAdd(true)}>+ Add MSL</button>
      </div>

      {showAdd && (
        <div className="cp-modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="cp-modal" onClick={e => e.stopPropagation()}>
            <div className="cp-modal-header"><span>Add MSL</span><button className="cp-modal-close" onClick={() => setShowAdd(false)}>✕</button></div>
            <form onSubmit={handleAdd} className="cp-modal-body">
              <div className="cp-field-row">
                <div className="cp-field"><label>Name *</label><input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                <div className="cp-field"><label>Title</label><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Medical Science Liaison" /></div>
              </div>
              <div className="cp-field-row">
                <div className="cp-field"><label>Specialty</label><input value={form.specialty} onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))} /></div>
                <div className="cp-field"><label>Region</label><input value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} placeholder="e.g. Northeast" /></div>
                <div className="cp-field"><label>Territory</label><input value={form.territory} onChange={e => setForm(f => ({ ...f, territory: e.target.value }))} /></div>
              </div>
              <div className="cp-field-row">
                <div className="cp-field"><label>Email</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
                <div className="cp-field"><label>Phone</label><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
              </div>
              <div className="cp-modal-footer">
                <button type="submit" className="cp-btn cp-btn-primary" disabled={saving}>{saving ? 'Adding…' : 'Add MSL'}</button>
                <button type="button" className="cp-btn cp-btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? <div className="cp-loading">Loading…</div> : msls.length === 0 ? (
        <div className="cp-empty"><div style={{ fontSize: 40 }}>👤</div><p>No MSLs added yet.</p></div>
      ) : (
        <table className="cp-table">
          <thead><tr><th>Name</th><th>Title</th><th>Region</th><th>Specialty</th><th>Therapeutic Areas</th><th>Email</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {msls.map(m => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>{m.title || '—'}</td>
                <td>{m.region || '—'}</td>
                <td>{m.specialty || '—'}</td>
                <td>{formatTherapeuticAreas(m.therapeutic_areas)}</td>
                <td>{m.email || '—'}</td>
                <td><span className={`cp-badge ${m.is_active ? 'badge-active' : 'badge-inactive'}`}>{m.is_active ? 'Active' : 'Inactive'}</span></td>
                <td><button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => deactivate(m.id)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminLayout>
  )
}
