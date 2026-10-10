import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import AdminLayout from '../components/AdminLayout'
import { CanChange, ReadOnlyUnless } from '../components/RoleGate'
import { adminHeaders } from '../context/AdminAuthContext'
import ColorPicker from '../components/ColorPicker'
import LoadingButton from '../components/LoadingButton'

// Phase 3 row 19 (CP ease-of-use plan): pick one of four ready looks; each colour
// on its own sits under Advanced. Header background, header text, heading font and
// header style were offered here but the portal reads none of them (its header is
// white with a line in the main colour), so they are no longer shown.
const COLOR_FIELDS = [
  { key: 'primary_color',     label: 'Main colour' },
  { key: 'secondary_color',   label: 'Second colour (banner)' },
  { key: 'accent_color',      label: 'Accent' },
  { key: 'background_color',  label: 'Box background (forms, cards)' },
  { key: 'surface_color',     label: 'Panel background' },
  { key: 'text_primary',      label: 'Text' },
  { key: 'text_secondary',    label: 'Quieter text (menus, notes)' },
  { key: 'button_bg',         label: 'Button' },
  { key: 'button_text',       label: 'Button text' },
  { key: 'link_color',        label: 'Links' },
  { key: 'border_color',      label: 'Lines and borders' },
  { key: 'footer_bg',         label: 'Footer background' },
  { key: 'footer_text',       label: 'Footer text' },
]

// Every theme passes the AA contrast check the server applies on save. Purple is
// the same set "Reset to Defaults" writes.
const THEMES = [
  { name: 'Purple', colors: {
    primary_color: '#6B3FA0', secondary_color: '#4A2D7A', accent_color: '#9B6FCC', background_color: '#FFFFFF',
    surface_color: '#F8F8FB', text_primary: '#1A1A2E', text_secondary: '#6B7280', button_bg: '#6B3FA0',
    button_text: '#FFFFFF', link_color: '#6B3FA0', border_color: '#E5E7EB', footer_bg: '#1A1A2E', footer_text: '#9CA3AF',
    header_bg: '#6B3FA0', header_text: '#FFFFFF' } },
  { name: 'Clinical blue', colors: {
    primary_color: '#1D4ED8', secondary_color: '#1E3A8A', accent_color: '#3B82F6', background_color: '#FFFFFF',
    surface_color: '#F5F8FC', text_primary: '#0F172A', text_secondary: '#475569', button_bg: '#1D4ED8',
    button_text: '#FFFFFF', link_color: '#1D4ED8', border_color: '#E2E8F0', footer_bg: '#0F172A', footer_text: '#CBD5E1',
    header_bg: '#1D4ED8', header_text: '#FFFFFF' } },
  { name: 'Teal', colors: {
    primary_color: '#0F766E', secondary_color: '#134E4A', accent_color: '#14B8A6', background_color: '#FFFFFF',
    surface_color: '#F3FAF9', text_primary: '#102A27', text_secondary: '#4B5563', button_bg: '#0F766E',
    button_text: '#FFFFFF', link_color: '#0F766E', border_color: '#D9E7E5', footer_bg: '#134E4A', footer_text: '#D1FAE5',
    header_bg: '#0F766E', header_text: '#FFFFFF' } },
  { name: 'Charcoal', colors: {
    primary_color: '#374151', secondary_color: '#1F2937', accent_color: '#B45309', background_color: '#FFFFFF',
    surface_color: '#F7F7F7', text_primary: '#111827', text_secondary: '#4B5563', button_bg: '#374151',
    button_text: '#FFFFFF', link_color: '#B45309', border_color: '#E5E7EB', footer_bg: '#111827', footer_text: '#D1D5DB',
    header_bg: '#374151', header_text: '#FFFFFF' } },
]

function themeOf(b) {
  return THEMES.find(t => COLOR_FIELDS.every(f => String(b[f.key] || '').toUpperCase() === t.colors[f.key]))
}

// The portal as it draws these settings: white header with a line in the main
// colour, menu, a panel with a button and a link, the banner, and the footer.
function BrandPreview({ b, logo }) {
  const radius = b.border_radius || '2px'
  return (
    <div className="cp-brand-preview" aria-hidden="true"
      style={{ fontFamily: b.font_family || 'Arial, Helvetica, sans-serif', fontSize: b.base_font_size || '14px', color: b.text_primary, borderColor: b.border_color }}>
      <div className="cp-brand-preview-header" style={{ borderTopColor: b.primary_color, borderBottomColor: b.border_color }}>
        {logo ? <img src={logo} alt="" /> : <strong>{b.portal_name || 'Portal name'}</strong>}
        <span style={{ color: b.primary_color, background: '#EEF5FF' }}>Home</span>
        <span style={{ color: b.text_secondary }}>Ask a question</span>
        <span style={{ color: b.text_secondary }}>Report a side effect</span>
      </div>
      <div className="cp-brand-preview-body">
        <strong style={{ fontSize: '1.15em' }}>Welcome</strong>
        <div style={{ color: b.text_secondary }}>{b.tagline || 'Trusted medical information'}</div>
        <div className="cp-brand-preview-panel" style={{ background: b.surface_color, borderColor: b.border_color, borderRadius: radius }}>
          <div style={{ fontWeight: 700 }}>Ask a medical question</div>
          <div style={{ color: b.text_secondary, margin: '4px 0 8px' }}>Our medical team answers by email.</div>
          <span className="cp-brand-preview-btn" style={{ background: b.button_bg, color: b.button_text, borderRadius: radius }}>Start</span>
          <span style={{ color: b.link_color, textDecoration: 'underline', marginLeft: 10 }}>Read the FAQ</span>
        </div>
        <div className="cp-brand-preview-banner" style={{ background: b.secondary_color }}>Report a side effect</div>
      </div>
      <div className="cp-brand-preview-footer" style={{ background: b.footer_bg, color: b.footer_text }}>
        <div>{b.footer_text_content || 'For medical information or to report side effects, contact us.'}</div>
        <div>{b.copyright_text || `© ${new Date().getFullYear()} ${b.portal_name || 'Company Name'}`}{b.show_powered_by ? ' · Powered by CP Portal' : ''}</div>
      </div>
    </div>
  )
}

export default function BrandingPage() {
  const { clientId } = useParams()
  const [branding, setBranding]           = useState(null)
  const [saving, setSaving]               = useState(false)
  const [saved, setSaved]                 = useState(false)
  const [error, setError]                 = useState('')
  const [logoPreview, setLogoPreview]     = useState(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoError, setLogoError]         = useState('')
  const logoInputRef = useRef(null)

  useEffect(() => {
    fetch(`/api/admin/branding/${clientId}`, { headers: adminHeaders() })
      .then(r => r.json())
      .then(d => {
        setBranding(d.branding || {})
        setLogoPreview(d.branding?.logo_url || null)
      })
      .catch(() => {})
  }, [clientId])

  function set(key, value) { setBranding(b => ({ ...b, [key]: value })); setSaved(false) }

  async function handleSave() {
    setError(''); setSaving(true)
    try {
      const res = await fetch(`/api/admin/branding/${clientId}`, {
        method: 'PATCH', headers: adminHeaders(), body: JSON.stringify(branding),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Save failed.'); return }
      setSaved(true)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoError(''); setLogoUploading(true)
    // Show local preview immediately
    setLogoPreview(URL.createObjectURL(file))
    try {
      const form = new FormData()
      form.append('logo', file)
      const res = await fetch(`/api/admin/branding/${clientId}/upload-logo`, {
        method: 'POST',
        body: form, // multipart upload; auth rides the session cookie, browser sets Content-Type
      })
      const data = await res.json()
      if (!res.ok) { setLogoError(data.error || 'Upload failed.'); setLogoPreview(branding?.logo_url || null); return }
      setLogoPreview(data.logo_url)
      setBranding(b => ({ ...b, logo_url: data.logo_url }))
    } catch {
      setLogoError('Upload failed — network error.')
      setLogoPreview(branding?.logo_url || null)
    } finally {
      setLogoUploading(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  async function handleReset() {
    if (!confirm('Reset branding to defaults?')) return
    setError(''); setSaved(false); setSaving(true)
    try {
      const resetRes = await fetch(`/api/admin/branding/${clientId}/reset`, { method: 'POST', headers: adminHeaders() })
      if (!resetRes.ok) { const d = await resetRes.json().catch(() => ({})); setError(d.error || 'Reset failed.'); return }
      const res = await fetch(`/api/admin/branding/${clientId}`, { headers: adminHeaders() })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || 'Reset succeeded but could not reload branding.'); return }
      const d = await res.json()
      setBranding(d.branding || {})
      setLogoPreview(d.branding?.logo_url || null)
      setSaved(true)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!branding) return <AdminLayout title="Branding"><div className="cp-loading">Loading…</div></AdminLayout>
  const current = themeOf(branding)

  return (
    <AdminLayout title="Branding & Theme">
      <ReadOnlyUnless area="branding" what="the branding">
      <div className="cp-branding-layout">
      <div>
        {/* Identity */}
        <div className="cp-card">
          <div className="cp-card-title">Portal Identity</div>
          <div className="cp-field-row">
            <div className="cp-field">
              <label>Portal Name</label>
              <input aria-label="Portal name" value={branding.portal_name || ''} onChange={e => set('portal_name', e.target.value)} />
            </div>
            <div className="cp-field">
              <label>Tagline</label>
              <input value={branding.tagline || ''} onChange={e => set('tagline', e.target.value)} placeholder="Trusted Medical Information" />
            </div>
            <div className="cp-field">
              <label>Custom Domain</label>
              <input value={branding.custom_domain || ''} onChange={e => set('custom_domain', e.target.value)} placeholder="medical.clientname.com" />
            </div>
          </div>

          {/* Logo Upload */}
          <div className="cp-field" style={{ marginTop: 8 }}>
            <label>Portal Logo</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              {/* Preview */}
              <div style={{
                width: 120, height: 60, border: '1px dashed #D1D5DB', borderRadius: 8,
                background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden', flexShrink: 0,
              }}>
                {logoPreview
                  ? <img src={logoPreview} alt="Logo preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} onError={() => setLogoPreview(null)} />
                  : <span style={{ fontSize: 11, color: '#5F6B7A' }}>No logo</span>
                }
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  style={{ display: 'none' }}
                  onChange={handleLogoUpload}
                />
                <button
                  type="button"
                  className="cp-btn cp-btn-outline"
                  style={{ fontSize: 13 }}
                  disabled={logoUploading}
                  onClick={() => logoInputRef.current?.click()}
                >
                  {logoUploading ? 'Uploading…' : logoPreview ? 'Replace Logo' : 'Upload Logo'}
                </button>
                {logoPreview && (
                  <button
                    type="button"
                    style={{ fontSize: 12, color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
                    onClick={() => {
                      setLogoPreview(null)
                      set('logo_url', null)
                    }}
                  >
                    Remove logo
                  </button>
                )}
                <span style={{ fontSize: 11, color: '#4B5563' }}>PNG, JPG, GIF, WebP · max 5 MB</span>
              </div>
            </div>
            {logoError && <div style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>{logoError}</div>}
          </div>
        </div>

        {/* Look: four ready themes; single colours under Advanced */}
        <div className="cp-card">
          <div className="cp-card-title">Look</div>
          <div className="cp-theme-grid" role="radiogroup" aria-label="Theme">
            {THEMES.map(t => {
              const on = current?.name === t.name
              return (
                <button key={t.name} type="button" role="radio" aria-checked={on}
                  className={`cp-theme-tile${on ? ' on' : ''}`}
                  onClick={() => { setBranding(b => ({ ...b, ...t.colors })); setSaved(false) }}>
                  <span className="cp-theme-swatches">
                    {['primary_color', 'secondary_color', 'button_bg', 'footer_bg'].map(k => <span key={k} style={{ background: t.colors[k] }} />)}
                  </span>
                  {t.name}
                </button>
              )
            })}
          </div>
          <div className="cp-help-text" style={{ marginTop: 8 }}>
            {current ? `Using the ${current.name} theme.` : 'Using your own colours.'} Nothing changes on the portal until you press Save Branding.
          </div>
          <details className="cp-advanced" style={{ marginTop: 10 }}>
            <summary>Advanced: choose each colour</summary>
            <div className="cp-color-grid" style={{ marginTop: 10 }}>
              {COLOR_FIELDS.map(f => (
                <ColorPicker
                  key={f.key}
                  label={f.label}
                  value={branding[f.key] || '#6B3FA0'}
                  onChange={hex => set(f.key, hex)}
                />
              ))}
            </div>
          </details>
        </div>

        {/* Typography */}
        <div className="cp-card">
          <div className="cp-card-title">Text and corners</div>
          <div className="cp-field-row">
            <div className="cp-field">
              <label>Body Font</label>
              <select aria-label="Body font" value={branding.font_family || ''} onChange={e => set('font_family', e.target.value)}>
                <option value="">Default (System Font)</option>
                <option value="Arial, Helvetica, sans-serif">Arial (Default)</option>
                <option value="Inter, sans-serif">Inter</option>
                <option value="'Roboto', sans-serif">Roboto</option>
                <option value="'Open Sans', sans-serif">Open Sans</option>
                <option value="'Lato', sans-serif">Lato</option>
                <option value="'Montserrat', sans-serif">Montserrat</option>
                <option value="'Poppins', sans-serif">Poppins</option>
                <option value="'Source Sans Pro', sans-serif">Source Sans Pro</option>
                <option value="Georgia, serif">Georgia (Serif)</option>
                <option value="'Times New Roman', serif">Times New Roman (Serif)</option>
              </select>
            </div>
            <div className="cp-field">
              <label>Base Font Size</label>
              <select aria-label="Base font size" value={branding.base_font_size || '14px'} onChange={e => set('base_font_size', e.target.value)}>
                <option value="13px">13px (Small)</option>
                <option value="14px">14px (Default)</option>
                <option value="15px">15px (Medium)</option>
                <option value="16px">16px (Large)</option>
              </select>
            </div>
            <div className="cp-field">
              <label>Border Radius</label>
              <select aria-label="Border radius" value={branding.border_radius || '2px'} onChange={e => set('border_radius', e.target.value)}>
                <option value="0px">0px (Sharp)</option>
                <option value="2px">2px (Default)</option>
                <option value="4px">4px (Subtle)</option>
                <option value="8px">8px (Soft)</option>
                <option value="12px">12px (Rounded)</option>
                <option value="16px">16px (Pill)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="cp-card">
          <div className="cp-card-title">Footer</div>
          <div className="cp-field">
            <label>Footer Text</label>
            <textarea value={branding.footer_text_content || ''} onChange={e => set('footer_text_content', e.target.value)} rows={2} placeholder="For medical information or to report adverse events, contact us at..." />
          </div>
          <div className="cp-field">
            <label>Copyright Text</label>
            <input value={branding.copyright_text || ''} onChange={e => set('copyright_text', e.target.value)} placeholder={`© ${new Date().getFullYear()} Company Name. All rights reserved.`} />
          </div>
          <div className="cp-field cp-field-checkbox">
            <input type="checkbox" id="pwrby" checked={!!branding.show_powered_by} onChange={e => set('show_powered_by', e.target.checked ? 1 : 0)} />
            <label htmlFor="pwrby">Show "Powered by CP Portal"</label>
          </div>
        </div>

        <div className="cp-card">
          <div className="cp-card-title">Submission Confirmation</div>
          <div className="cp-field">
            <label>SLA Response Time Text</label>
            <input value={branding.sla_response_text || ''} onChange={e => set('sla_response_text', e.target.value)} placeholder="Our team will review your submission and respond within 5–7 business days." />
          </div>
          <small className="cp-help-text">Shown on the submission success screen. Leave blank for the default message.</small>
        </div>

        {error && <div className="cp-error">{error}</div>}
        {saved && <div className="cp-success">Branding saved.</div>}

        <div className="cp-form-actions">
          <LoadingButton onClick={handleSave} disabled={saving}>Save Branding</LoadingButton>
          <button type="button" className="cp-btn cp-btn-outline" onClick={handleReset} disabled={saving}>Reset to Defaults</button>
        </div>
      </div>

      {/* Phase 3 row 19: the portal as these settings draw it, before saving. */}
      <aside className="cp-card cp-branding-preview-card">
        <div className="cp-card-title">Preview</div>
        <BrandPreview b={branding} logo={logoPreview} />
      </aside>
      </div>
      </ReadOnlyUnless>
    </AdminLayout>
  )
}
