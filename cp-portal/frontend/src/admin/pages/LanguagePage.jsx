import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { adminHeaders } from '../context/AdminAuthContext'

const SUPPORTED = [
  { code: 'en', label: 'English',  flag: '🇬🇧' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch',  flag: '🇩🇪' },
  { code: 'es', label: 'Español',  flag: '🇪🇸' },
  { code: 'ja', label: '日本語',   flag: '🇯🇵' },
  { code: 'zh', label: '中文',     flag: '🇨🇳' },
]

export default function LanguagePage() {
  const { clientId } = useParams()
  const [config, setConfig]         = useState({ default: 'en', enabled: ['en'] })
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [msg, setMsg]               = useState('')
  const [retranslating, setRetranslating] = useState(false)

  useEffect(() => { load() }, [clientId])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/language/${clientId}`, { headers: adminHeaders() })
      const d   = await res.json()
      if (d.language) setConfig(d.language)
    } catch { /* ignore */ }
    setLoading(false)
  }

  function toggleLang(code) {
    setConfig(c => {
      const enabled = c.enabled.includes(code)
        ? c.enabled.filter(l => l !== code)
        : [...c.enabled, code]
      // Ensure default is always in enabled
      const defaultLang = enabled.includes(c.default) ? c.default : (enabled[0] || 'en')
      return { default: defaultLang, enabled: enabled.length ? enabled : ['en'] }
    })
  }

  async function handleSave() {
    setSaving(true); setMsg('')
    try {
      const res = await fetch(`/api/admin/language/${clientId}`, {
        method: 'PUT',
        headers: adminHeaders(),
        body: JSON.stringify(config),
      })
      const d = await res.json()
      if (!res.ok) { setMsg(d.error || 'Save failed.'); setSaving(false); return }
      setMsg('Language settings saved.')
    } catch { setMsg('Network error.') }
    setSaving(false)
  }

  async function handleRetranslate() {
    setRetranslating(true); setMsg('')
    try {
      const res = await fetch(`/api/admin/language/${clientId}/retranslate`, {
        method: 'POST',
        headers: adminHeaders(),
      })
      const d = await res.json()
      if (!res.ok) { setMsg(d.error || 'Retranslation failed.'); setRetranslating(false); return }
      setMsg('Retranslation started — content will update in the background within a few minutes.')
    } catch { setMsg('Network error.') }
    setRetranslating(false)
  }

  if (loading) return <AdminLayout><div className="cp-loading">Loading…</div></AdminLayout>

  return (
    <AdminLayout>
      <div className="cp-section-header">
        <h2>Language Settings</h2>
      </div>

      <div className="cp-card" style={{ maxWidth: 560 }}>
        <div className="cp-card-title">Enabled Languages</div>
        <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>
          Select the languages available to portal visitors. The default language is shown first and used as the fallback.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {SUPPORTED.map(lang => {
            const isEnabled = config.enabled.includes(lang.code)
            const isDefault = config.default === lang.code
            return (
              <div key={lang.code} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', border: `1px solid ${isEnabled ? '#C4B5FD' : 'var(--cp-border)'}`, borderRadius: 8, background: isEnabled ? '#F9F5FF' : '#fff' }}>
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={() => toggleLang(lang.code)}
                  disabled={isDefault} // can't disable the default language
                  style={{ width: 16, height: 16 }}
                />
                <span style={{ fontSize: 20 }}>{lang.flag}</span>
                <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{lang.label}</span>
                <span style={{ fontSize: 12, color: '#6B7280' }}>{lang.code.toUpperCase()}</span>
                {isEnabled && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#6B3FA0', fontWeight: 600, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="default_lang"
                      checked={isDefault}
                      onChange={() => setConfig(c => ({ ...c, default: lang.code }))}
                    />
                    Default
                  </label>
                )}
              </div>
            )
          })}
        </div>

        {msg && (
          <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, background: msg.includes('aved') ? '#DCFCE7' : '#FEE2E2', color: msg.includes('aved') ? '#16A34A' : '#DC2626', fontSize: 13 }}>
            {msg}
          </div>
        )}

        <button className="cp-btn cp-btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Language Settings'}
        </button>
      </div>

      <div className="cp-card" style={{ maxWidth: 560, marginTop: 16 }}>
        <div className="cp-card-title">How it works</div>
        <ul style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.8, paddingLeft: 20, margin: 0 }}>
          <li>Portal visitors see a language switcher in the navigation bar when 2+ languages are enabled.</li>
          <li>The selected language is remembered per browser session.</li>
          <li>UI labels, navigation, and page content (news, safety, FAQ, documents) are all translated automatically.</li>
          <li>New content is translated in the background when saved. Use "Retranslate" to translate existing content.</li>
          <li>If a translation is missing for a key, it falls back to English automatically.</li>
        </ul>
      </div>

      <div className="cp-card" style={{ maxWidth: 560, marginTop: 16 }}>
        <div className="cp-card-title">Retranslate Existing Content</div>
        <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>
          If you have added new languages or have content that was created before translation was enabled, click below to retranslate all existing news, safety alerts, FAQs, and documents into the currently enabled languages.
        </p>
        {msg && (
          <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 6, background: msg.includes('tarted') ? '#DCFCE7' : '#FEE2E2', color: msg.includes('tarted') ? '#16A34A' : '#DC2626', fontSize: 13 }}>
            {msg}
          </div>
        )}
        <button className="cp-btn cp-btn-secondary" onClick={handleRetranslate} disabled={retranslating}>
          {retranslating ? 'Starting…' : '🔄 Retranslate All Content'}
        </button>
      </div>
    </AdminLayout>
  )
}
