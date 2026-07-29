import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { useAdminAuth } from '../context/AdminAuthContext'

export default function TrialsAdminPage() {
  const { clientId } = useParams()
  const { adminHeaders } = useAdminAuth()
  const [trials, setTrials]   = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm]       = useState({ nct_id: '', title: '', phase: 'Phase III', indication: '', status: 'Recruiting', site_location: '', pi: '' })
  const [msg, setMsg]         = useState('')

  useEffect(() => {
    fetch(`/api/admin/trials/${clientId}`, { headers: adminHeaders() })
      .then(r => r.json())
      .then(d => { setTrials(d.trials || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [clientId])

  async function handleAdd(e) {
    e.preventDefault()
    setMsg('')
    try {
      const res = await fetch(`/api/admin/trials/${clientId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminHeaders() },
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (res.ok) {
        setMsg('✅ Clinical Trial published.')
        setForm({ nct_id: '', title: '', phase: 'Phase III', indication: '', status: 'Recruiting', site_location: '', pi: '' })
        const updated = await fetch(`/api/admin/trials/${clientId}`, { headers: adminHeaders() }).then(r => r.json())
        setTrials(updated.trials || [])
      } else {
        setMsg(`❌ ${d.error || 'Failed to add trial.'}`)
      }
    } catch {
      setMsg('❌ Error saving trial.')
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this clinical trial listing?')) return
    await fetch(`/api/admin/trials/${clientId}/${id}`, { method: 'DELETE', headers: adminHeaders() })
    setTrials(prev => prev.filter(t => t.id !== id))
  }

  return (
    <AdminLayout>
      <div className="cp-admin-page" style={{ padding: 24 }}>
      <div className="cp-page-header" style={{ marginBottom: 20 }}>
        <h1>Clinical Trials Governance Manager</h1>
        <p>Manage active clinical trial listings, recruitment status, and site locations for the client portal.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24 }}>
        <form onSubmit={handleAdd} className="cp-card" style={{ padding: 20, background: '#fff', borderRadius: 8, border: '1px solid #E2E8F0' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Add Clinical Trial Listing</h3>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>NCT ID *</label>
            <input required value={form.nct_id} onChange={e => setForm({ ...form, nct_id: e.target.value })} placeholder="e.g. NCT048291" style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #CBD5E1' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Trial Title *</label>
            <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Study title" style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #CBD5E1' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Indication *</label>
            <input required value={form.indication} onChange={e => setForm({ ...form, indication: e.target.value })} placeholder="Target disease" style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #CBD5E1' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Phase</label>
            <select value={form.phase} onChange={e => setForm({ ...form, phase: e.target.value })} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #CBD5E1' }}>
              <option value="Phase I">Phase I</option>
              <option value="Phase II">Phase II</option>
              <option value="Phase III">Phase III</option>
              <option value="Phase IV">Phase IV</option>
            </select>
          </div>
          {msg && <div style={{ fontSize: 13, marginBottom: 12, fontWeight: 600 }}>{msg}</div>}
          <button type="submit" className="cp-btn cp-btn-primary" style={{ width: '100%', padding: '9px 14px', background: '#6B3FA0', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
            Publish Clinical Trial
          </button>
        </form>

        <div className="cp-card" style={{ padding: 20, background: '#fff', borderRadius: 8, border: '1px solid #E2E8F0' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Active Published Trials ({trials.length})</h3>
          {loading ? <div>Loading...</div> : trials.length === 0 ? <div>No custom trials configured. Default global trials are active.</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #E2E8F0', textAlign: 'left' }}>
                  <th style={{ padding: 8 }}>NCT ID</th>
                  <th style={{ padding: 8 }}>Title</th>
                  <th style={{ padding: 8 }}>Phase</th>
                  <th style={{ padding: 8 }}>Status</th>
                  <th style={{ padding: 8 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {trials.map(t => (
                  <tr key={t.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: 8, fontWeight: 600 }}>{t.nct_id}</td>
                    <td style={{ padding: 8 }}>{t.title}</td>
                    <td style={{ padding: 8 }}>{t.phase}</td>
                    <td style={{ padding: 8 }}>{t.status}</td>
                    <td style={{ padding: 8 }}>
                      <button onClick={() => handleDelete(t.id)} style={{ color: '#DC2626', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 600 }}>Delete</button>
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
