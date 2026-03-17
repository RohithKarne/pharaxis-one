import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'

const JURISDICTIONS = [
  { key: 'gdpr',         label: 'GDPR' },
  { key: 'ccpa',         label: 'CCPA' },
  { key: 'pdpb',         label: 'PDPB' },
  { key: 'apac',         label: 'APAC-General' },
]

const DEFAULT_CONFIG = {
  jurisdictions: [],
  banner_config: {
    title:         '',
    body:          '',
    accept_label:  'Accept All',
    decline_label: 'Necessary Only',
    manage_label:  'Manage Preferences',
  },
  version:           'v1.0',
  require_reconsent: false,
}

export default function CompliancePage() {
  const { clientId }          = useParams()
  const [config, setConfig]   = useState(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState('')
  const [records, setRecords] = useState([])
  const [recPage, setRecPage] = useState(1)
  const [recTotal, setRecTotal] = useState(0)

  useEffect(() => { load() }, [clientId])
  useEffect(() => { loadRecords() }, [clientId, recPage])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/compliance/${clientId}`, { headers: adminHeaders() })
      const d   = await res.json()
      if (d.config) setConfig(d.config)
    } catch { /* ignore */ }
    setLoading(false)
  }

  async function loadRecords() {
    try {
      const res = await fetch(`/api/admin/compliance/${clientId}/consent-records?page=${recPage}&limit=20`, { headers: adminHeaders() })
      const d   = await res.json()
      setRecords(d.records || [])
      setRecTotal(d.total || 0)
    } catch { /* ignore */ }
  }

  function setBannerField(key, value) {
    setConfig(c => ({ ...c, banner_config: { ...c.banner_config, [key]: value } }))
    setSaved(false)
  }

  function setTopField(key, value) {
    setConfig(c => ({ ...c, [key]: value }))
    setSaved(false)
  }

  function toggleJurisdiction(key) {
    setConfig(c => {
      const curr = c.jurisdictions || []
      const next = curr.includes(key) ? curr.filter(x => x !== key) : [...curr, key]
      return { ...c, jurisdictions: next }
    })
    setSaved(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    setError(''); setSaving(true)
    try {
      const res = await fetch(`/api/admin/compliance/${clientId}`, {
        method: 'PATCH',
        headers: adminHeaders(),
        body: JSON.stringify({
          jurisdictions:    config.jurisdictions,
          banner_config:    config.banner_config,
          version:          config.version,
          require_reconsent: config.require_reconsent,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Save failed.'); setSaving(false); return }
      setSaved(true)
    } catch {
      setError('Network error.')
    }
    setSaving(false)
  }

  function choicesSummary(choices_json) {
    try {
      const c = typeof choices_json === 'string' ? JSON.parse(choices_json) : choices_json
      if (!c) return '—'
      return Object.entries(c).filter(([, v]) => v).map(([k]) => k).join(', ') || 'None'
    } catch { return '—' }
  }

  if (loading) return <AdminLayout title="Compliance & Consent"><div className="cp-loading">Loading…</div></AdminLayout>

  const totalPages = Math.ceil(recTotal / 20)

  return (
    <AdminLayout title="Compliance & Consent">
      <form onSubmit={handleSave}>

        {/* Jurisdictions */}
        <div className="cp-card">
          <div className="cp-card-title">Applicable Jurisdictions</div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {JURISDICTIONS.map(j => (
              <label key={j.key} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={(config.jurisdictions || []).includes(j.key)}
                  onChange={() => toggleJurisdiction(j.key)}
                />
                {j.label}
              </label>
            ))}
          </div>
        </div>

        {/* Banner Config */}
        <div className="cp-card">
          <div className="cp-card-title">Consent Banner</div>
          <div className="cp-field">
            <label>Banner Title</label>
            <input value={config.banner_config?.title || ''} onChange={e => setBannerField('title', e.target.value)} placeholder="We use cookies" />
          </div>
          <div className="cp-field">
            <label>Banner Body</label>
            <textarea rows={3} value={config.banner_config?.body || ''} onChange={e => setBannerField('body', e.target.value)} placeholder="We use cookies and similar technologies to improve your experience…" />
          </div>
          <div className="cp-field-row">
            <div className="cp-field">
              <label>Accept Label</label>
              <input value={config.banner_config?.accept_label || 'Accept All'} onChange={e => setBannerField('accept_label', e.target.value)} />
            </div>
            <div className="cp-field">
              <label>Decline Label</label>
              <input value={config.banner_config?.decline_label || 'Necessary Only'} onChange={e => setBannerField('decline_label', e.target.value)} />
            </div>
            <div className="cp-field">
              <label>Manage Label</label>
              <input value={config.banner_config?.manage_label || 'Manage Preferences'} onChange={e => setBannerField('manage_label', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Version & Reconsent */}
        <div className="cp-card">
          <div className="cp-card-title">Version & Reconsent</div>
          <div className="cp-field-row">
            <div className="cp-field">
              <label>Consent Version</label>
              <input value={config.version || 'v1.0'} onChange={e => setTopField('version', e.target.value)} placeholder="v1.0" />
            </div>
          </div>
          <div className="cp-field cp-field-checkbox" style={{ marginTop: 8 }}>
            <input
              type="checkbox"
              id="requireReconsent"
              checked={!!config.require_reconsent}
              onChange={e => setTopField('require_reconsent', e.target.checked)}
            />
            <label htmlFor="requireReconsent">Require re-consent when version changes</label>
          </div>
        </div>

        {error && <div className="cp-error">{error}</div>}
        {saved && <div className="cp-success">✓ Compliance settings saved.</div>}
        <div className="cp-form-actions">
          <button type="submit" className="cp-btn cp-btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</button>
        </div>
      </form>

      {/* Audit Log */}
      <div className="cp-card" style={{ marginTop: 24 }}>
        <div className="cp-card-title">Consent Audit Log</div>
        {records.length === 0 ? (
          <p className="cp-page-desc">No consent records yet.</p>
        ) : (
          <>
            <table className="cp-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Version</th>
                  <th>Choices</th>
                  <th>Consented At</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={i}>
                    <td>{r.user_email || 'Anonymous'}</td>
                    <td>{r.version || '—'}</td>
                    <td>{choicesSummary(r.choices_json)}</td>
                    <td>{r.consented_at ? new Date(r.consented_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
                <button className="cp-btn cp-btn-sm cp-btn-outline" disabled={recPage <= 1} onClick={() => setRecPage(p => p - 1)}>Previous</button>
                <span style={{ fontSize: 12, color: 'var(--cp-text-muted)' }}>Page {recPage} of {totalPages}</span>
                <button className="cp-btn cp-btn-sm cp-btn-outline" disabled={recPage >= totalPages} onClick={() => setRecPage(p => p + 1)}>Next</button>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  )
}
