import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'

const FEATURE_DESCRIPTIONS = {
  therapeutic_areas:     'Browse disease areas and treatment categories',
  medical_inquiry:       'Submit medical information requests',
  events:                'Upcoming conferences, webinars, and workshops',
  find_msl:             'Connect with Medical Science Liaisons',
  resources:             'Publications, clinical data, and materials',
  drug_info:            'Drug prescribing information and summaries',
  news_announcements:   'Latest news and announcements',
  document_library:     'Managed document repository',
  safety_communications:'Safety alerts and drug recalls',
  chatbox:              'AI-powered medical assistant',
  user_auth:            'Portal user login and registration',
  hcp_gate:             'HCP identity confirmation on first visit',
}

export default function FeaturesPage() {
  const { clientId } = useParams()
  const [features, setFeatures] = useState([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(null)
  const [error, setError]       = useState('')
  const [saved, setSaved]       = useState(false)

  useEffect(() => {
    fetch(`/api/admin/features/${clientId}`, { headers: adminHeaders() })
      .then(r => r.json()).then(d => setFeatures(d.features || []))
      .catch(() => {}).finally(() => setLoading(false))
  }, [clientId])

  async function toggle(featureKey, current) {
    setSaving(featureKey); setError(''); setSaved(false)
    const res = await fetch(`/api/admin/features/${clientId}/${featureKey}`, {
      method: 'PATCH', headers: adminHeaders(),
      body: JSON.stringify({ is_enabled: !current }),
    })
    const data = await res.json()
    setSaving(null)
    if (!res.ok) { setError(data.error || 'Failed to update feature.'); return }
    setFeatures(prev => prev.map(f => f.feature_key === featureKey ? { ...f, is_enabled: !current ? 1 : 0 } : f))
    setSaved(true)
    if (featureKey === 'hcp_gate' && current) {
      try {
        const gateRes = await fetch(`/api/admin/gate/${clientId}`, {
          method: 'PATCH', headers: adminHeaders(),
          body: JSON.stringify({ is_enabled: 0 }),
        })
        if (!gateRes.ok) {
          const d = await gateRes.json().catch(() => ({}))
          setSaved(false)
          setError(d.error || 'Feature disabled, but the HCP gate could not be turned off.')
        }
      } catch {
        setSaved(false)
        setError('Feature disabled, but the HCP gate could not be turned off (network error).')
      }
    }
  }

  async function updateLabel(featureKey, display_name) {
    setError(''); setSaved(false)
    const res = await fetch(`/api/admin/features/${clientId}/${featureKey}`, {
      method: 'PATCH', headers: adminHeaders(), body: JSON.stringify({ display_name }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Failed to update label.'); return }
    setSaved(true)
  }

  if (loading) return <AdminLayout title="Features"><div className="cp-loading">Loading…</div></AdminLayout>

  const enabled  = features.filter(f => f.is_enabled)
  const disabled = features.filter(f => !f.is_enabled)

  return (
    <AdminLayout title="Features">
      <p className="cp-page-desc">Control which sections of the portal are visible and accessible to users.</p>
      <div className="cp-features-summary">
        <span className="cp-badge badge-active">{enabled.length} enabled</span>
        <span className="cp-badge badge-inactive">{disabled.length} disabled</span>
      </div>

      {error && <div className="cp-error">{error}</div>}
      {saved && <div className="cp-success">✓ Feature updated.</div>}

      <div className="cp-features-list">
        {features.map(f => (
          <div key={f.feature_key} className={`cp-feature-row ${f.is_enabled ? 'enabled' : 'disabled'}`}>
            <div className="cp-feature-toggle">
              <label className="cp-toggle-switch">
                <input type="checkbox" checked={!!f.is_enabled} disabled={saving === f.feature_key}
                  onChange={() => toggle(f.feature_key, f.is_enabled)} />
                <span className="cp-toggle-slider" />
              </label>
            </div>
            <div className="cp-feature-info">
              <div className="cp-feature-key">{f.feature_key}</div>
              {FEATURE_DESCRIPTIONS[f.feature_key] && (
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{FEATURE_DESCRIPTIONS[f.feature_key]}</div>
              )}
              <input className="cp-feature-label-input" defaultValue={f.display_name || ''}
                onBlur={e => updateLabel(f.feature_key, e.target.value)}
                placeholder="Display label…" />
            </div>
            <div className="cp-feature-order" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Order: {f.display_order}</span>
              <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: f.is_enabled ? '#DCFCE7' : '#F3F4F6', color: f.is_enabled ? '#16A34A' : '#6B7280' }}>{f.is_enabled ? 'Enabled' : 'Disabled'}</span>
            </div>
          </div>
        ))}
      </div>
    </AdminLayout>
  )
}
