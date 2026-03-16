import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'

export default function IntegrationPage() {
  const { clientId }      = useParams()
  const [integrations, setIntegrations] = useState([])
  const [showAdd, setShowAdd]           = useState(false)
  const [form, setForm]                 = useState({ system_name: 'MIMS', api_base_url: '', api_key: '', auth_type: 'bearer' })
  const [saving, setSaving]             = useState(false)
  const [testing, setTesting]           = useState(null)
  const [testResult, setTestResult]     = useState({})
  const [loading, setLoading]           = useState(true)

  useEffect(() => { load() }, [clientId])

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/admin/integration/${clientId}`, { headers: adminHeaders() })
    const d   = await res.json()
    setIntegrations(d.integrations || [])
    setLoading(false)
  }

  async function handleAdd(e) {
    e.preventDefault(); setSaving(true)
    await fetch(`/api/admin/integration/${clientId}`, { method: 'POST', headers: adminHeaders(), body: JSON.stringify(form) })
    setSaving(false); setShowAdd(false); setForm({ system_name: 'MIMS', api_base_url: '', api_key: '', auth_type: 'bearer' })
    load()
  }

  async function toggleActive(id, current) {
    await fetch(`/api/admin/integration/${clientId}/${id}`, { method: 'PATCH', headers: adminHeaders(), body: JSON.stringify({ is_active: !current }) })
    load()
  }

  async function testConnection(id) {
    setTesting(id)
    const res  = await fetch(`/api/admin/integration/${clientId}/${id}/test`, { method: 'POST', headers: adminHeaders() })
    const data = await res.json()
    setTestResult(r => ({ ...r, [id]: data }))
    setTesting(null)
  }

  return (
    <AdminLayout title="Integration">
      <p className="cp-page-desc">Connect this portal to MIMS or any external case management system. Submissions will auto-sync on receipt.</p>
      <div className="cp-section-header">
        <h2>Configured Integrations</h2>
        <button className="cp-btn cp-btn-primary" onClick={() => setShowAdd(true)}>+ Add Integration</button>
      </div>

      {showAdd && (
        <div className="cp-modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="cp-modal" onClick={e => e.stopPropagation()}>
            <div className="cp-modal-header"><span>Add Integration</span><button className="cp-modal-close" onClick={() => setShowAdd(false)}>✕</button></div>
            <form onSubmit={handleAdd} className="cp-modal-body">
              <div className="cp-field-row">
                <div className="cp-field">
                  <label>System Name</label>
                  <select value={form.system_name} onChange={e => setForm(f => ({ ...f, system_name: e.target.value }))}>
                    <option value="MIMS">MIMS</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div className="cp-field">
                  <label>Auth Type</label>
                  <select value={form.auth_type} onChange={e => setForm(f => ({ ...f, auth_type: e.target.value }))}>
                    <option value="bearer">Bearer Token</option>
                    <option value="apikey">API Key Header</option>
                    <option value="basic">Basic Auth</option>
                  </select>
                </div>
              </div>
              <div className="cp-field">
                <label>API Base URL *</label>
                <input required value={form.api_base_url} onChange={e => setForm(f => ({ ...f, api_base_url: e.target.value }))} placeholder="http://localhost:3000" />
              </div>
              <div className="cp-field">
                <label>API Key / Token</label>
                <input type="password" value={form.api_key} onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))} placeholder="Bearer token or API key" />
              </div>
              <div className="cp-modal-footer">
                <button type="submit" className="cp-btn cp-btn-primary" disabled={saving}>{saving ? 'Adding…' : 'Add'}</button>
                <button type="button" className="cp-btn cp-btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? <div className="cp-loading">Loading…</div> : integrations.length === 0 ? (
        <div className="cp-empty"><div style={{ fontSize: 40 }}>🔗</div><p>No integrations configured.</p></div>
      ) : (
        <div className="cp-integration-list">
          {integrations.map(i => (
            <div key={i.id} className="cp-integration-card">
              <div className="cp-integration-header">
                <div>
                  <span className="cp-integration-name">{i.system_name}</span>
                  <span className="cp-integration-url">{i.api_base_url}</span>
                </div>
                <span className={`cp-badge ${i.is_active ? 'badge-active' : 'badge-inactive'}`}>{i.is_active ? 'Active' : 'Inactive'}</span>
              </div>
              <div className="cp-integration-meta">Auth: {i.auth_type} · API key: {i.api_key ? '••••••••' : 'not set'}</div>
              <div className="cp-integration-actions">
                <button className="cp-btn cp-btn-sm" onClick={() => testConnection(i.id)} disabled={testing === i.id}>
                  {testing === i.id ? 'Testing…' : '⚡ Test Connection'}
                </button>
                <button className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => toggleActive(i.id, i.is_active)}>
                  {i.is_active ? 'Disable' : 'Enable'}
                </button>
              </div>
              {testResult[i.id] && (
                <div className={`cp-test-result ${testResult[i.id].success ? 'success' : 'fail'}`}>
                  {testResult[i.id].success ? `✓ Connected (HTTP ${testResult[i.id].status})` : `✗ Failed: ${testResult[i.id].error || `HTTP ${testResult[i.id].status}`}`}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  )
}
