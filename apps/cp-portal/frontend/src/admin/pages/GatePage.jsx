import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'

export default function GatePage() {
  const { clientId }        = useParams()
  const [config, setConfig] = useState(null)
  const [userTypes, setUserTypes]  = useState([])
  const [features, setFeatures]    = useState([])
  const [accessMap, setAccessMap]  = useState({})
  const [loading, setLoading]      = useState(true)
  const [saving, setSaving]        = useState(false)
  const [saved, setSaved]          = useState(false)
  const [accessSaved, setAccessSaved] = useState(false)
  const [error, setError]          = useState('')

  useEffect(() => { load() }, [clientId])

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/admin/gate/${clientId}`, { headers: adminHeaders() })
    const d   = await res.json()
    setConfig(d.config  || {})
    setUserTypes(d.userTypes || [])
    setFeatures(d.features   || [])
    setAccessMap(d.accessMap || {})
    setLoading(false)
  }

  function setConf(key, value) { setConfig(c => ({ ...c, [key]: value })); setSaved(false) }

  async function saveConfig(e) {
    e.preventDefault(); setSaving(true); setSaved(false); setError('')
    try {
      const res = await fetch(`/api/admin/gate/${clientId}`, {
        method: 'PATCH', headers: adminHeaders(), body: JSON.stringify(config)
      })
      if (!res.ok) { setError('Failed to save gate settings.'); return }
      setSaved(true)
    } catch {
      setError('Network error saving gate settings.')
    } finally {
      setSaving(false)
    }
  }

  async function updateUserType(typeId, field, value) {
    setError('')
    try {
      const res = await fetch(`/api/admin/gate/${clientId}/user-types/${typeId}`, {
        method: 'PATCH', headers: adminHeaders(), body: JSON.stringify({ [field]: value })
      })
      if (!res.ok) setError('Failed to update user type.')
    } catch {
      setError('Network error updating user type.')
    } finally {
      load()
    }
  }

  function toggleAccess(featureKey, typeKey, current) {
    const next = { ...accessMap }
    if (!next[featureKey]) next[featureKey] = {}
    next[featureKey][typeKey] = !current
    setAccessMap(next)
    setAccessSaved(false)
  }

  async function saveAccessMatrix() {
    setAccessSaved(false); setError('')
    const updates = []
    for (const [featureKey, types] of Object.entries(accessMap)) {
      for (const [typeKey, isAllowed] of Object.entries(types)) {
        updates.push({ feature_key: featureKey, type_key: typeKey, is_allowed: isAllowed ? 1 : 0 })
      }
    }
    try {
      const res = await fetch(`/api/admin/gate/${clientId}/access`, {
        method: 'PATCH', headers: adminHeaders(), body: JSON.stringify({ updates })
      })
      if (!res.ok) { setError('Failed to save access matrix.'); return }
      setAccessSaved(true)
    } catch {
      setError('Network error saving access matrix.')
    }
  }

  function accessAllowed(featureKey, typeKey) {
    return accessMap[featureKey]?.[typeKey] !== false
  }

  if (loading) return <AdminLayout title="User Type Gate"><div className="cp-loading">Loading…</div></AdminLayout>

  const enabledTypes = userTypes.filter(t => t.is_enabled)

  return (
    <AdminLayout title="User Type Gate">

      {error && <div className="cp-error">{error}</div>}

      {/* ── Gate on/off + Appearance ─────────────────────────────── */}
      <form onSubmit={saveConfig}>
        <div className="cp-card">
          <div className="cp-card-title">Gate Settings</div>
          <div className="cp-field cp-field-checkbox">
            <input type="checkbox" id="gateEnabled" checked={!!config.is_enabled}
              onChange={e => setConf('is_enabled', e.target.checked ? 1 : 0)} />
            <label htmlFor="gateEnabled">Enable User Type Gate for this portal</label>
          </div>
          <small className="cp-help-text">When enabled, signed-in users who have not yet declared their role will see a gate modal on their first visit. Off by default.</small>
        </div>

        {!!config.is_enabled && (
          <div className="cp-card">
            <div className="cp-card-title">Gate Appearance</div>
            <div className="cp-field">
              <label>Gate Title</label>
              <input value={config.gate_title || ''} onChange={e => setConf('gate_title', e.target.value)} placeholder="Welcome — Please Identify Yourself" />
            </div>
            <div className="cp-field">
              <label>Gate Subtitle</label>
              <textarea rows={2} value={config.gate_subtitle || ''} onChange={e => setConf('gate_subtitle', e.target.value)}
                placeholder="To provide you with the most relevant information, please select the option that best describes you." />
            </div>
            <div className="cp-field">
              <label>Legal Disclaimer Text</label>
              <textarea rows={3} value={config.disclaimer_text || ''} onChange={e => setConf('disclaimer_text', e.target.value)}
                placeholder="By confirming your selection, you declare that the information you have provided is accurate…" />
            </div>
            <div className="cp-field cp-field-checkbox">
              <input type="checkbox" id="reqDisclaimer" checked={!!config.require_disclaimer}
                onChange={e => setConf('require_disclaimer', e.target.checked ? 1 : 0)} />
              <label htmlFor="reqDisclaimer">Require user to accept disclaimer before proceeding</label>
            </div>
          </div>
        )}

        {saved && <div className="cp-success">✓ Gate settings saved.</div>}
        <div className="cp-form-actions">
          <button type="submit" className="cp-btn cp-btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</button>
        </div>
      </form>

      {/* ── User Types ───────────────────────────────────────────── */}
      {!!config.is_enabled && (
        <div className="cp-card">
          <div className="cp-card-title">User Types Shown in Gate</div>
          <p className="cp-page-desc">Configure which role options appear in the gate. Users will select one of these to declare their identity.</p>
          <div className="cp-gate-type-list">
            {userTypes.map(t => (
              <div key={t.id} className={`cp-gate-type-row ${!t.is_enabled ? 'cp-gate-type-disabled' : ''}`}>
                <div className="cp-gate-type-icon">{t.icon}</div>
                <div className="cp-gate-type-body">
                  <input
                    className="cp-gate-type-label-input"
                    value={t.label}
                    onChange={e => setUserTypes(ut => ut.map(u => u.id === t.id ? { ...u, label: e.target.value } : u))}
                    onBlur={e => updateUserType(t.id, 'label', e.target.value)}
                  />
                  <input
                    className="cp-gate-type-desc-input"
                    value={t.description || ''}
                    onChange={e => setUserTypes(ut => ut.map(u => u.id === t.id ? { ...u, description: e.target.value } : u))}
                    onBlur={e => updateUserType(t.id, 'description', e.target.value)}
                    placeholder="Description shown to user…"
                  />
                </div>
                <div className="cp-gate-type-key">{t.type_key}</div>
                <label className="cp-toggle-wrap" title={t.is_enabled ? 'Disable' : 'Enable'}>
                  <input type="checkbox" checked={!!t.is_enabled}
                    onChange={e => updateUserType(t.id, 'is_enabled', e.target.checked ? 1 : 0)} />
                  <span className="cp-toggle" />
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Feature Access Matrix ─────────────────────────────────── */}
      {!!config.is_enabled && features.length > 0 && enabledTypes.length > 0 && (
        <div className="cp-card">
          <div className="cp-card-title">Feature Access by User Type</div>
          <p className="cp-page-desc">Control which portal sections each user type can access. ✓ = visible, ✗ = hidden. Changes apply after saving.</p>
          <div className="cp-access-matrix-wrap">
            <table className="cp-access-matrix">
              <thead>
                <tr>
                  <th className="cp-matrix-feature-col">Feature</th>
                  {enabledTypes.map(t => (
                    <th key={t.type_key} className="cp-matrix-type-col">
                      <span className="cp-matrix-type-icon">{t.icon}</span>
                      <span className="cp-matrix-type-label">{t.label.split(' ')[0]}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {features.map(f => (
                  <tr key={f.feature_key}>
                    <td className="cp-matrix-feature-name">{f.display_name || f.feature_key}</td>
                    {enabledTypes.map(t => {
                      const allowed = accessAllowed(f.feature_key, t.type_key)
                      return (
                        <td key={t.type_key} className="cp-matrix-cell">
                          <button
                            type="button"
                            className={`cp-matrix-toggle ${allowed ? 'cp-matrix-on' : 'cp-matrix-off'}`}
                            onClick={() => toggleAccess(f.feature_key, t.type_key, allowed)}
                            title={`${allowed ? 'Visible' : 'Hidden'} for ${t.label}`}
                          >
                            {allowed ? '✓' : '✗'}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {accessSaved && <div className="cp-success" style={{ marginTop: 12 }}>✓ Access matrix saved.</div>}
          <div className="cp-form-actions">
            <button type="button" className="cp-btn cp-btn-primary" onClick={saveAccessMatrix}>Save Access Matrix</button>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
