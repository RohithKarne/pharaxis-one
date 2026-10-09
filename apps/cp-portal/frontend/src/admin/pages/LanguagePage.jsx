import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { ReadOnlyUnless } from '../components/RoleGate'
import { adminHeaders } from '../context/AdminAuthContext'

// Mirrors SUPPORTED in backend/routes/admin/language.js and SUPPORTED_LANGUAGES in the portal.
const SUPPORTED = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文' },
]

const CONTENT_LABELS = { news: 'News', safety: 'Safety alerts', faq: 'FAQ', documents: 'Documents' }

export default function LanguagePage() {
  const { clientId } = useParams()
  const [config, setConfig]     = useState({ default: 'en', enabled: ['en'] })
  const [coverage, setCoverage] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [saved, setSaved]       = useState('')
  const [editing, setEditing]   = useState(null)   // { type, id, label, fields, original, translations, lang, draft }
  const [editMsg, setEditMsg]   = useState('')

  async function openEditor(type, id, lang) {
    setEditMsg('')
    const res = await fetch(`/api/admin/language/${clientId}/translation/${type}/${id}`, { headers: adminHeaders() })
    const d = await res.json()
    if (!res.ok) { setError(d.error || 'Could not open the item.'); return }
    setEditing({ ...d, lang, draft: { ...(d.translations[lang] || {}) } })
  }
  async function saveTranslation() {
    setEditMsg('')
    const res = await fetch(`/api/admin/language/${clientId}/translation/${editing.type}/${editing.id}`, {
      method: 'PUT', headers: adminHeaders(), body: JSON.stringify({ lang: editing.lang, fields: editing.draft }),
    })
    const d = await res.json()
    if (!res.ok) { setEditMsg(d.error || 'Save failed.'); return }
    setEditMsg(d.message); load()
  }

  useEffect(() => { load() }, [clientId])

  async function load() {
    setLoading(true)
    try {
      const [cfgRes, covRes] = await Promise.all([
        fetch(`/api/admin/language/${clientId}`, { headers: adminHeaders() }),
        fetch(`/api/admin/language/${clientId}/coverage`, { headers: adminHeaders() }),
      ])
      const cfg = await cfgRes.json()
      if (cfg.language) setConfig({ default: cfg.language.default || 'en', enabled: cfg.language.enabled || ['en'] })
      if (covRes.ok) setCoverage(await covRes.json())
    } catch { setError('Could not load the language settings.') }
    setLoading(false)
  }

  function toggle(code) {
    setSaved('')
    setConfig(c => {
      const enabled = c.enabled.includes(code) ? c.enabled.filter(l => l !== code) : [...c.enabled, code]
      const def = enabled.includes(c.default) ? c.default : (enabled[0] || 'en')
      return { default: def, enabled: enabled.length ? enabled : ['en'] }
    })
  }

  async function save() {
    setSaving(true); setError(''); setSaved('')
    try {
      const res = await fetch(`/api/admin/language/${clientId}`, { method: 'PUT', headers: adminHeaders(), body: JSON.stringify(config) })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Save failed.'); setSaving(false); return }
      const n = d.language.enabled.length
      setSaved(n > 1
        ? `Saved. Doctors now see a language choice in the portal header (${n} languages).`
        : 'Saved. With one language the portal shows no language choice.')
      load()
    } catch { setError('Network error. Nothing was saved.') }
    setSaving(false)
  }

  if (loading) return <AdminLayout title="Language"><div className="cp-loading">Loading…</div></AdminLayout>

  const otherLangs = (coverage?.languages || []).map(l => SUPPORTED.find(s => s.code === l)?.label || l)

  return (
    <AdminLayout title="Language">
      <ReadOnlyUnless area="language" what="the portal languages">
      <p className="cp-page-desc">Which languages the doctor portal offers. With two or more, doctors pick one in the portal header and the browser remembers it.</p>

      {error && <div className="cp-error">{error}</div>}
      {saved && <div className="cp-success">{saved}</div>}

      <div className="cp-features-list" style={{ maxWidth: 560 }}>
        {SUPPORTED.map(l => {
          const on = config.enabled.includes(l.code)
          const isDefault = config.default === l.code
          return (
            <div key={l.code} className={`cp-feature-row ${on ? 'enabled' : 'disabled'}`}>
              <div className="cp-feature-toggle">
                <label className="cp-toggle-switch">
                  <input type="checkbox" aria-label={`Offer ${l.label}`} checked={on} disabled={isDefault} onChange={() => toggle(l.code)} />
                  <span className="cp-toggle-slider" />
                </label>
              </div>
              <div className="cp-feature-info">
                <div className="cp-feature-key">{l.label} <span style={{ color: '#5F6B7A', fontWeight: 400 }}>({l.code.toUpperCase()})</span></div>
                {isDefault && <div style={{ fontSize: 11, color: '#5F6B7A', marginTop: 2 }}>Default — shown first and used when a translation is missing. It cannot be switched off.</div>}
              </div>
              {on && !isDefault && (
                <button type="button" className="cp-btn cp-btn-sm cp-btn-outline" onClick={() => { setSaved(''); setConfig(c => ({ ...c, default: l.code })) }}>
                  Make default
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 16 }}>
        <button className="cp-btn cp-btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>

      <div className="cp-card" style={{ maxWidth: 560, marginTop: 24 }}>
        <div className="cp-card-title">What gets translated</div>
        <p style={{ fontSize: 13, color: '#5F6B7A', margin: '0 0 8px' }}>
          The portal menu, header buttons and notification panel change language straight away.
          News, safety alerts, FAQ entries and document titles change only where a translation is stored;
          anything without one is shown in the language it was written in.
          {coverage && !coverage.machine_translation && ' Outside machine translation is off for this client, so translations are supplied by the team.'}
        </p>
        {coverage && coverage.languages.length === 0 && (
          <p style={{ fontSize: 13, color: '#5F6B7A', margin: 0 }}>Only one language is on, so there is nothing to translate.</p>
        )}
        {coverage && coverage.languages.length > 0 && (
          <table className="cp-table" style={{ marginTop: 8 }}>
            <thead><tr><th>Content</th><th>Items</th><th>Translated into {otherLangs.join(', ')}</th><th>Still in the original</th></tr></thead>
            <tbody>
              {coverage.content.map(c => (
                <tr key={c.type}>
                  <td>{CONTENT_LABELS[c.type] || c.type}</td>
                  <td>{c.total}</td>
                  <td>{c.complete}</td>
                  <td>{c.missing.length === 0 ? '—' : (
                    <>
                      {c.missing.slice(0, 8).map(m => (
                        <div key={m.id} style={{ marginBottom: 4 }}>
                          {m.label || `#${m.id}`}{' '}
                          {m.missing.map(l => (
                            <button key={l} type="button" className="cp-btn cp-btn-sm cp-btn-outline" style={{ marginLeft: 4 }} onClick={() => openEditor(c.type, m.id, l)}>Translate into {l.toUpperCase()}</button>
                          ))}
                        </div>
                      ))}
                      {c.missing.length > 8 && <div style={{ fontSize: 12, color: '#5F6B7A' }}>and {c.missing.length - 8} more</div>}
                    </>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {editing && (
        <div className="cp-card" style={{ maxWidth: 760, marginTop: 24 }}>
          <div className="cp-card-title">Translate “{editing.label}” into {SUPPORTED.find(s => s.code === editing.lang)?.label || editing.lang}</div>
          <p style={{ fontSize: 13, color: '#5F6B7A', margin: '0 0 12px' }}>Readers in this language see the translation only once every field below has one; until then they see the original.</p>
          {editing.fields.map(f => (
            <div key={f} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{f.replace(/_/g, ' ')}</div>
              <div style={{ fontSize: 13, background: '#F8FAFC', border: '1px solid var(--cp-border)', borderRadius: 6, padding: '8px 10px', marginBottom: 6, maxHeight: 160, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{String(editing.original[f] || '').replace(/<[^>]+>/g, ' ')}</div>
              <textarea rows={f.includes('html') || f === 'answer' ? 6 : 2} style={{ width: '100%' }} aria-label={`${f} in ${editing.lang}`} value={editing.draft[f] || ''} onChange={e => setEditing(ed => ({ ...ed, draft: { ...ed.draft, [f]: e.target.value } }))} placeholder={`${f.replace(/_/g, ' ')} in ${editing.lang.toUpperCase()}`} />
            </div>
          ))}
          {editMsg && <div className={/^Saved/.test(editMsg) ? 'cp-success' : 'cp-error'}>{editMsg}</div>}
          <button className="cp-btn cp-btn-primary" onClick={saveTranslation}>Save translation</button>
          <button className="cp-btn cp-btn-outline" style={{ marginLeft: 8 }} onClick={() => setEditing(null)}>Close</button>
        </div>
      )}
      </ReadOnlyUnless>
    </AdminLayout>
  )
}
