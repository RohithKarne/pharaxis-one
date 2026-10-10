import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { CanChange, ReadOnlyUnless } from '../components/RoleGate'
import { adminHeaders } from '../context/AdminAuthContext'
import { label } from '../../shared/utils/labels'

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
  chatbox:              'Chat assistant for medical questions',
  user_auth:            'Portal user login and registration',
  hcp_gate:             'HCP identity confirmation on first visit',
  // CPPM-109
  clinical_trials:      'Clinical trials list — shown to doctors only once a trial is published',
  cme_training:         'CME & training modules — shown to doctors only once a module is published',
  homepage_quicklinks:  'Shortcut links on the portal home page',
  adverse_event:        'The form for reporting a side effect',
  product_complaint:    'The form for reporting a product problem',
  other_inquiry:        'The form for any other question',
}

// Phase 3 row 20 (CP ease-of-use plan): the switches in three groups. A key not
// listed here shows under "Other", so a new feature is never hidden.
const GROUPS = [
  { name: 'Content', keys: ['homepage_quicklinks', 'therapeutic_areas', 'drug_info', 'news_announcements', 'document_library',
    'safety_communications', 'clinical_trials', 'cme_training', 'events', 'resources', 'find_msl'] },
  { name: 'Asking and reporting', keys: ['medical_inquiry', 'adverse_event', 'product_complaint', 'other_inquiry', 'chatbox'] },
  { name: 'Accounts', keys: ['user_auth', 'hcp_gate'] },
]

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
  const known    = GROUPS.flatMap(g => g.keys)
  const groups   = [
    ...GROUPS.map(g => ({ name: g.name, items: g.keys.map(k => features.find(f => f.feature_key === k)).filter(Boolean) })),
    { name: 'Other', items: features.filter(f => !known.includes(f.feature_key)) },
  ].filter(g => g.items.length > 0)

  return (
    <AdminLayout title="Features">
      <ReadOnlyUnless area="features" what="which features are on">
      {/* CPPM-152: the name box feeds the User Gate access matrix, not the doctor portal,
          whose menu has its own wording. Said once here instead of under every row. */}
      <p className="cp-page-desc">
        Turn sections of the portal on or off for doctors. The name box beside each one is the
        row name in Portal setup › User Gate; the portal's own menu keeps its wording.
      </p>
      <div className="cp-features-summary">
        <span className="cp-badge badge-active">{enabled.length} on</span>
        <span className="cp-badge badge-inactive">{disabled.length} off</span>
      </div>

      {error && <div className="cp-error">{error}</div>}
      {saved && <div className="cp-success">Feature updated.</div>}

      {groups.map(g => (
        <section key={g.name} className="cp-card cp-feature-group" aria-label={g.name}>
          <div className="cp-card-title">
            {g.name}
            <span className="cp-feature-group-count">{g.items.filter(f => f.is_enabled).length} of {g.items.length} on</span>
          </div>
          <div className="cp-features-list">
            {g.items.map(f => (
              <div key={f.feature_key} className={`cp-feature-row ${f.is_enabled ? 'enabled' : 'disabled'}`}>
                <div className="cp-feature-toggle">
                  <label className="cp-toggle-switch">
                    <input type="checkbox" aria-label={`Turn ${label('feature', f.feature_key)} on or off`} checked={!!f.is_enabled} disabled={saving === f.feature_key}
                      onChange={() => toggle(f.feature_key, f.is_enabled)} />
                    <span className="cp-toggle-slider" />
                  </label>
                </div>
                <div className="cp-feature-info">
                  <div className="cp-feature-key">{label('feature', f.feature_key)}</div>
                  {FEATURE_DESCRIPTIONS[f.feature_key] && (
                    <div style={{ fontSize: 11, color: '#5F6B7A', marginTop: 2 }}>{FEATURE_DESCRIPTIONS[f.feature_key]}</div>
                  )}
                </div>
                <input className="cp-feature-label-input" defaultValue={f.display_name || ''}
                  onBlur={e => updateLabel(f.feature_key, e.target.value)}
                  aria-label={`Name for ${label('feature', f.feature_key)} in User Gate`}
                  placeholder="Name in User Gate…" />
              </div>
            ))}
          </div>
        </section>
      ))}
      </ReadOnlyUnless>
    </AdminLayout>
  )
}
