import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { useAdminAuth } from '../context/AdminAuthContext'

export default function TrainingAdminPage() {
  const { clientId } = useParams()
  const { adminHeaders } = useAdminAuth()
  const [modules, setModules] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm]       = useState({ title: '', type: 'CME Accredited', duration: '30 mins', credits: '1.5 CME', pass_score: 80 })
  const [msg, setMsg]         = useState('')

  useEffect(() => {
    fetch(`/api/admin/training/${clientId}`, { headers: adminHeaders() })
      .then(r => r.json())
      .then(d => { setModules(d.modules || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [clientId])

  async function handleAdd(e) {
    e.preventDefault()
    setMsg('')
    try {
      const res = await fetch(`/api/admin/training/${clientId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminHeaders() },
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (res.ok) {
        setMsg('✅ Training module published.')
        setForm({ title: '', type: 'CME Accredited', duration: '30 mins', credits: '1.5 CME', pass_score: 80 })
        const updated = await fetch(`/api/admin/training/${clientId}`, { headers: adminHeaders() }).then(r => r.json())
        setModules(updated.modules || [])
      } else {
        setMsg(`❌ ${d.error || 'Failed to add module.'}`)
      }
    } catch {
      setMsg('❌ Error saving training module.')
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this training module?')) return
    await fetch(`/api/admin/training/${clientId}/${id}`, { method: 'DELETE', headers: adminHeaders() })
    setModules(prev => prev.filter(m => m.id !== id))
  }

  return (
    <AdminLayout>
      <div className="cp-admin-page" style={{ padding: 24 }}>
      <div className="cp-page-header" style={{ marginBottom: 20 }}>
        <h1>CME & REMS Educational Training Manager</h1>
        <p>Configure product training modules, REMS accreditation programs, pass scores, and CME credit values.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24 }}>
        <form onSubmit={handleAdd} className="cp-card" style={{ padding: 20, background: '#fff', borderRadius: 8, border: '1px solid #E2E8F0' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Create Training Module</h3>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Module Title *</label>
            <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Title of training module" style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #CBD5E1' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Type</label>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #CBD5E1' }}>
              <option value="CME Accredited">CME Accredited</option>
              <option value="REMS Certification">REMS Certification</option>
              <option value="Mandatory Compliance">Mandatory Compliance</option>
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>CME Credits</label>
            <input value={form.credits} onChange={e => setForm({ ...form, credits: e.target.value })} placeholder="e.g. 1.5 CME" style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #CBD5E1' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Pass Score Threshold (%)</label>
            <input type="number" value={form.pass_score} onChange={e => setForm({ ...form, pass_score: e.target.value })} min={50} max={100} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #CBD5E1' }} />
          </div>
          {msg && <div style={{ fontSize: 13, marginBottom: 12, fontWeight: 600 }}>{msg}</div>}
          <button type="submit" className="cp-btn cp-btn-primary" style={{ width: '100%', padding: '9px 14px', background: '#6B3FA0', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
            Publish Training Module
          </button>
        </form>

        <div className="cp-card" style={{ padding: 20, background: '#fff', borderRadius: 8, border: '1px solid #E2E8F0' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Active Training Modules ({modules.length})</h3>
          {loading ? <div>Loading...</div> : modules.length === 0 ? <div>No custom training modules. Default global modules active.</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #E2E8F0', textAlign: 'left' }}>
                  <th style={{ padding: 8 }}>Module Title</th>
                  <th style={{ padding: 8 }}>Type</th>
                  <th style={{ padding: 8 }}>Credits</th>
                  <th style={{ padding: 8 }}>Pass Score</th>
                  <th style={{ padding: 8 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {modules.map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: 8, fontWeight: 600 }}>{m.title}</td>
                    <td style={{ padding: 8 }}>{m.type}</td>
                    <td style={{ padding: 8 }}>{m.credits}</td>
                    <td style={{ padding: 8 }}>{m.pass_score}%</td>
                    <td style={{ padding: 8 }}>
                      <button onClick={() => handleDelete(m.id)} style={{ color: '#DC2626', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 600 }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
    </AdminLayout>
  )
}
