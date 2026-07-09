import { useState, useEffect } from 'react'
import { usePortal } from '../context/PortalContext'
import usePageTitle from '../hooks/usePageTitle'
import { useToast } from '../../shared/components/Toast'

const NOTIF_TYPES = [
  { key: 'news',      icon: '📰', label: 'News & Announcements', desc: 'Notify me when new news posts are published.' },
  { key: 'documents', icon: '📁', label: 'Documents',             desc: 'Notify me when new documents are added to the library.' },
  { key: 'safety',    icon: '⚠️', label: 'Safety Alerts',         desc: 'Notify me when safety alerts are issued.' },
  { key: 'digest',    icon: '✉️', label: 'Weekly Digest Email',   desc: 'Email me a weekly summary of new content.' },
]

export default function PreferencesPage() {
  const { clientCode, portalHeaders } = usePortal()
  const toast = useToast()
  const [prefs, setPrefs]     = useState({ news: true, documents: true, safety: true, digest: true })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [saveError, setSaveError] = useState('')

  usePageTitle('Preferences')

  useEffect(() => {
    if (!clientCode) return
    fetch('/api/portal/preferences', { headers: portalHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.prefs) setPrefs(d.prefs); setLoading(false) })
      .catch(() => setLoading(false))
  }, [clientCode])

  async function save() {
    setSaving(true); setSaved(false); setSaveError('')
    try {
      const res = await fetch('/api/portal/preferences', {
        method: 'PATCH',
        headers: portalHeaders(),
        body: JSON.stringify(prefs),
      })
      if (!res.ok) { setSaveError('Unable to save preferences. Please try again.'); toast.error('Unable to save preferences.'); return }
      setSaved(true)
      toast.success('Preferences saved.')
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setSaveError('Unable to save preferences. Please try again.')
      toast.error('Unable to save preferences.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="pp-loading">Loading preferences…</div>

  return (
    <div className="pp-container" style={{ maxWidth: 600, paddingTop: 40, paddingBottom: 60 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1A1A2E', marginBottom: 4 }}>Notification Preferences</h1>
      <p style={{ color: '#6B7280', fontSize: 14, marginBottom: 28 }}>
        Choose which types of notifications you receive when new content is published.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {NOTIF_TYPES.map(({ key, icon, label, desc }) => (
          <div
            key={key}
            onClick={() => setPrefs(p => ({ ...p, [key]: !p[key] }))}
            style={{
              display: 'flex', alignItems: 'center', gap: 16,
              background: '#fff', border: `2px solid ${prefs[key] ? 'var(--pp-primary, #6B3FA0)' : '#E5E7EB'}`,
              borderRadius: 10, padding: '14px 18px', cursor: 'pointer',
              transition: 'border-color 0.15s',
            }}
          >
            <span style={{ fontSize: 22 }}>{icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#1A1A2E' }}>{label}</div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{desc}</div>
            </div>
            <div style={{
              width: 44, height: 24, borderRadius: 12, position: 'relative',
              background: prefs[key] ? 'var(--pp-primary, #6B3FA0)' : '#D1D5DB',
              transition: 'background 0.2s', flexShrink: 0,
            }}>
              <div style={{
                position: 'absolute', top: 3, left: prefs[key] ? 22 : 3,
                width: 18, height: 18, borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 28, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          className="pp-btn pp-btn-primary"
          onClick={save}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save Preferences'}
        </button>
        {saved && (
          <span style={{ color: '#16A34A', fontSize: 13, fontWeight: 500 }}>✓ Saved</span>
        )}
        {saveError && (
          <span style={{ color: '#DC2626', fontSize: 13, fontWeight: 500 }}>{saveError}</span>
        )}
      </div>
    </div>
  )
}
