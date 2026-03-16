import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'

const TARGET_TYPES = ['hcp', 'physician', 'patient', 'non_hcp', 'other']

const EMPTY_FORM = {
  title: '',
  alert_type: 'dhcp_letter',
  severity: 'high',
  product_name: '',
  ref_number: '',
  body_html: '',
  effective_date: '',
  target_types: [],
  status: 'active',
}

export default function SafetyPage() {
  const { clientId }                = useParams()
  const [alerts, setAlerts]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [showForm, setShowForm]     = useState(false)
  const [editAlert, setEditAlert]   = useState(null)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [fileInput, setFileInput]   = useState(null)

  useEffect(() => { load() }, [clientId])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/safety/${clientId}`, { headers: adminHeaders() })
      const d   = await res.json()
      setAlerts(d.alerts || [])
    } catch { /* ignore */ }
    setLoading(false)
  }

  function openCreate() {
    setEditAlert(null)
    setForm(EMPTY_FORM)
    setFileInput(null)
    setError('')
    setShowForm(true)
  }

  function openEdit(alert) {
    setEditAlert(alert)
    setForm({
      title:         alert.title || '',
      alert_type:    alert.alert_type || 'dhcp_letter',
      severity:      alert.severity || 'high',
      product_name:  alert.product_name || '',
      ref_number:    alert.ref_number || '',
      body_html:     alert.body_html || '',
      effective_date: alert.effective_date ? alert.effective_date.slice(0, 10) : '',
      target_types:  alert.target_types ? (Array.isArray(alert.target_types) ? alert.target_types : JSON.parse(alert.target_types)) : [],
      status:        alert.status || 'active',
    })
    setFileInput(null)
    setError('')
    setShowForm(true)
  }

  function setField(key, value) { setForm(f => ({ ...f, [key]: value })) }

  function toggleTargetType(tt) {
    setForm(f => {
      const current = f.target_types || []
      return {
        ...f,
        target_types: current.includes(tt) ? current.filter(x => x !== tt) : [...current, tt],
      }
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setSaving(true)
    try {
      const fd = new FormData()
      Object.entries(form).forEach(([k, v]) => {
        if (k === 'target_types') fd.append(k, JSON.stringify(v))
        else fd.append(k, v ?? '')
      })
      if (fileInput) fd.append('file', fileInput)

      const url    = editAlert
        ? `/api/admin/safety/${clientId}/${editAlert.id}`
        : `/api/admin/safety/${clientId}`
      const method = editAlert ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { Authorization: adminHeaders().Authorization },
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Save failed.'); setSaving(false); return }
      setShowForm(false)
      load()
    } catch {
      setError('Network error.')
    }
    setSaving(false)
  }

  async function handleResolve(alert) {
    if (!confirm(`Mark "${alert.title}" as resolved?`)) return
    await fetch(`/api/admin/safety/${clientId}/${alert.id}/resolve`, {
      method: 'PATCH', headers: adminHeaders(),
    })
    load()
  }

  function severityBadgeClass(severity) {
    const map = { critical: 'badge-critical', high: 'badge-high', medium: 'badge-medium', informational: 'badge-informational' }
    return map[severity] || 'cp-badge'
  }

  function statusBadgeStyle(status) {
    if (status === 'active')   return { background: '#DCFCE7', color: '#16A34A' }
    if (status === 'resolved') return { background: '#F3F4F6', color: '#6B7280' }
    if (status === 'archived') return { background: '#F3F4F6', color: '#9CA3AF' }
    return {}
  }

  if (loading) return <AdminLayout title="Safety Alerts"><div className="cp-loading">Loading…</div></AdminLayout>

  return (
    <AdminLayout title="Safety Alerts">
      <div className="cp-section-header">
        <h2>Safety Alerts</h2>
        <button className="cp-btn cp-btn-primary" onClick={openCreate}>+ New Alert</button>
      </div>

      {showForm && (
        <div className="cp-modal-overlay" onClick={() => setShowForm(false)}>
          <div className="cp-modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div className="cp-modal-header">
              <span>{editAlert ? 'Edit Alert' : 'New Safety Alert'}</span>
              <button className="cp-modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit} className="cp-modal-body">
              <div className="cp-field">
                <label>Title *</label>
                <input required value={form.title} onChange={e => setField('title', e.target.value)} />
              </div>
              <div className="cp-field-row">
                <div className="cp-field">
                  <label>Alert Type</label>
                  <select value={form.alert_type} onChange={e => setField('alert_type', e.target.value)}>
                    <option value="dhcp_letter">DHCP Letter</option>
                    <option value="product_recall">Product Recall</option>
                    <option value="urgent_safety_restriction">Urgent Safety Restriction</option>
                    <option value="field_safety_notice">Field Safety Notice</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="cp-field">
                  <label>Severity</label>
                  <select value={form.severity} onChange={e => setField('severity', e.target.value)}>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="informational">Informational</option>
                  </select>
                </div>
              </div>
              <div className="cp-field-row">
                <div className="cp-field">
                  <label>Product Name</label>
                  <input value={form.product_name} onChange={e => setField('product_name', e.target.value)} />
                </div>
                <div className="cp-field">
                  <label>Reference Number</label>
                  <input value={form.ref_number} onChange={e => setField('ref_number', e.target.value)} />
                </div>
              </div>
              <div className="cp-field">
                <label>Body (HTML supported)</label>
                <textarea rows={5} value={form.body_html} onChange={e => setField('body_html', e.target.value)} />
              </div>
              <div className="cp-field-row">
                <div className="cp-field">
                  <label>Effective Date</label>
                  <input type="date" value={form.effective_date} onChange={e => setField('effective_date', e.target.value)} />
                </div>
                <div className="cp-field">
                  <label>Status</label>
                  <select value={form.status} onChange={e => setField('status', e.target.value)}>
                    <option value="active">Active</option>
                    <option value="resolved">Resolved</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>
              <div className="cp-field">
                <label>Target Types (empty = all)</label>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
                  {TARGET_TYPES.map(tt => (
                    <label key={tt} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
                      <input type="checkbox" checked={(form.target_types || []).includes(tt)} onChange={() => toggleTargetType(tt)} />
                      {tt}
                    </label>
                  ))}
                </div>
              </div>
              <div className="cp-field">
                <label>Attachment (PDF optional)</label>
                <input type="file" accept=".pdf" onChange={e => setFileInput(e.target.files[0] || null)} />
              </div>
              {error && <div className="cp-error">{error}</div>}
              <div className="cp-modal-footer">
                <button type="submit" className="cp-btn cp-btn-primary" disabled={saving}>{saving ? 'Saving…' : editAlert ? 'Save Changes' : 'Create Alert'}</button>
                <button type="button" className="cp-btn cp-btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {alerts.length === 0 ? (
        <div className="cp-empty"><p>No safety alerts yet.</p></div>
      ) : (
        <div className="cp-card" style={{ padding: 0 }}>
          <table className="cp-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Severity</th>
                <th>Product</th>
                <th>Effective Date</th>
                <th>Status</th>
                <th>Views</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {alerts.map(a => (
                <tr key={a.id}>
                  <td>{a.title}</td>
                  <td>{a.alert_type}</td>
                  <td>
                    <span className={`cp-badge ${severityBadgeClass(a.severity)}`} style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                      {a.severity}
                    </span>
                  </td>
                  <td>{a.product_name || '—'}</td>
                  <td>{a.effective_date ? a.effective_date.slice(0, 10) : '—'}</td>
                  <td>
                    <span className="cp-badge" style={{ ...statusBadgeStyle(a.status), padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                      {a.status}
                    </span>
                  </td>
                  <td>{a.view_count || 0}</td>
                  <td style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }}>
                    {a.status === 'active' && (
                      <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => handleResolve(a)}>Resolve</button>
                    )}
                    <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => openEdit(a)}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  )
}
